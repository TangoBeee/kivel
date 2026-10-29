import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from './app.js';

const origin = 'http://localhost:3000';
async function human(app: ReturnType<typeof buildApp>, username: string) {
    const registered = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username,
            email: `${username}@example.test`,
            password: 'correct-horse-battery-staple',
        },
    });
    return { origin, cookie: String(registered.headers['set-cookie']).split(';')[0]! };
}
async function start(app: ReturnType<typeof buildApp>, name: string) {
    const response = await app.inject({
        method: 'POST',
        url: '/api/agents/login',
        payload: { name, client: 'Claude Code' },
    });
    assert.equal(response.statusCode, 201, response.body);
    return response.json() as { userCode: string; deviceCode: string; verificationUrl: string };
}
const poll = (app: ReturnType<typeof buildApp>, deviceCode: string) =>
    app.inject({ method: 'POST', url: '/api/agents/token', payload: { deviceCode } });

test('an agent joins a workspace only after its human approves, and gets its key exactly once', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const session = await human(app, 'approver');
    const login = await start(app, 'Claude Code on MacBook');
    assert.match(login.userCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(login.verificationUrl, `http://localhost:3000/link/?code=${login.userCode}`);
    assert.equal((await poll(app, login.deviceCode)).statusCode, 202);
    assert.equal(
        (await app.inject({ url: `/api/agents/login/${login.userCode}` })).statusCode,
        401,
    );
    const seen = (
        await app.inject({
            url: `/api/agents/login/${login.userCode.toLowerCase().replace('-', '')}`,
            headers: session,
        })
    ).json();
    assert.equal(seen.name, 'Claude Code on MacBook');
    assert.equal(seen.limit, 3);
    assert.equal(seen.canApprove, true);
    assert.deepEqual(seen.agents, []);
    const approved = await app.inject({
        method: 'POST',
        url: `/api/agents/login/${login.userCode}/approve`,
        headers: session,
        payload: {},
    });
    assert.equal(approved.statusCode, 200, approved.body);
    const token = await poll(app, login.deviceCode);
    assert.equal(token.statusCode, 200);
    const apiKey = token.json().apiKey;
    assert.match(apiKey, /^sh_/);
    assert.equal((await poll(app, login.deviceCode)).statusCode, 410);
    const me = await app.inject({
        url: '/api/account',
        headers: { authorization: `Bearer ${apiKey}` },
    });
    assert.equal(me.statusCode, 200);
    const listed = (await app.inject({ url: '/api/agents', headers: session })).json();
    assert.equal(listed.agents.length, 1);
    assert.equal(listed.agents[0].name, 'Claude Code on MacBook');
    assert.ok(listed.agents[0].lastUsedAt);
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: `/api/agents/login/${login.userCode}/approve`,
                headers: session,
                payload: {},
            })
        ).statusCode,
        409,
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/agents/token',
                payload: { deviceCode: 'x'.repeat(43) },
            })
        ).statusCode,
        404,
    );
});

test('denied requests tell the agent, and a full workspace must replace or upgrade', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const session = await human(app, 'limited');
    const denied = await start(app, 'Unknown bot');
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: `/api/agents/login/${denied.userCode}/deny`,
                headers: session,
                payload: {},
            })
        ).statusCode,
        200,
    );
    const answer = await poll(app, denied.deviceCode);
    assert.equal(answer.statusCode, 403);
    assert.equal(answer.json().status, 'denied');

    const keys: string[] = [];
    for (const name of ['One', 'Two', 'Three']) {
        const login = await start(app, name);
        await app.inject({
            method: 'POST',
            url: `/api/agents/login/${login.userCode}/approve`,
            headers: session,
            payload: {},
        });
        keys.push((await poll(app, login.deviceCode)).json().apiKey);
    }
    const fourth = await start(app, 'Four');
    const blocked = await app.inject({
        method: 'POST',
        url: `/api/agents/login/${fourth.userCode}/approve`,
        headers: session,
        payload: {},
    });
    assert.equal(blocked.statusCode, 409);
    assert.match(blocked.json().error, /includes 3 agents/);
    const agents = (await app.inject({ url: '/api/agents', headers: session })).json().agents;
    const oldest = agents.find((agent: { name: string }) => agent.name === 'One');
    const replaced = await app.inject({
        method: 'POST',
        url: `/api/agents/login/${fourth.userCode}/approve`,
        headers: session,
        payload: { replaceAgentId: oldest.id },
    });
    assert.equal(replaced.statusCode, 200, replaced.body);
    assert.equal(
        (await app.inject({ url: '/api/account', headers: { authorization: `Bearer ${keys[0]}` } }))
            .statusCode,
        401,
    );
    const now = (await app.inject({ url: '/api/agents', headers: session })).json().agents;
    assert.deepEqual(now.map((agent: { name: string }) => agent.name).sort(), [
        'Four',
        'Three',
        'Two',
    ]);
    const two = now.find((agent: { name: string }) => agent.name === 'Two');
    assert.equal(
        (await app.inject({ method: 'DELETE', url: `/api/agents/${two.id}`, headers: session }))
            .statusCode,
        204,
    );
    assert.equal(
        (await app.inject({ url: '/api/account', headers: { authorization: `Bearer ${keys[1]}` } }))
            .statusCode,
        401,
    );
});

test('an agent can connect over MCP with no key, using start_login and finish_login', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const session = await human(app, 'mcp-human');
    const call = async (name: string, args: object) =>
        JSON.parse(
            (
                await app.inject({
                    method: 'POST',
                    url: '/mcp',
                    headers: {
                        'content-type': 'application/json',
                        accept: 'application/json, text/event-stream',
                    },
                    payload: {
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'tools/call',
                        params: { name, arguments: args },
                    },
                })
            ).json().result.content[0].text,
        );
    const started = await call('start_login', { name: 'Cursor', client: 'Cursor' });
    assert.ok(started.verificationUrl);
    const waiting = call('finish_login', { deviceCode: started.deviceCode });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await app.inject({
        method: 'POST',
        url: `/api/agents/login/${started.userCode}/approve`,
        headers: session,
        payload: {},
    });
    const finished = await waiting;
    assert.equal(finished.status, 'approved');
    assert.match(finished.apiKey, /^sh_/);
});
