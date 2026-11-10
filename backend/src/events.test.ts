import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { buildApp } from './app.js';
import { MemoryIdentityRepository } from './identity.js';
import { MemoryApprovals } from './approvals.js';
import { MemoryEmailMessages } from './email.js';

async function fixture(t: { after: (callback: () => Promise<unknown>) => void }) {
    const identities = new MemoryIdentityRepository(),
        approvals = new MemoryApprovals(),
        emails = new MemoryEmailMessages();
    const user = identities.register('event-owner', 'test-hash')!;
    const session = randomBytes(32).toString('base64url');
    identities.createSession(user.id, user.personalAccountId, session);
    const identity = identities.authenticateSession(session)!;
    const key = identities.createKey(
        identity,
        'Events',
        ['resources:read', 'resources:write'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    const headers = { authorization: `Bearer ${key.key}` };
    const app = buildApp({
        identityStore: identities,
        approvalStore: approvals,
        emailMessages: emails,
        mailDomain: 'socketspace.xyz',
        emailIngestSecret: 'x'.repeat(40),
    });
    t.after(() => app.close());
    return { app, headers, identity, approvals, emails };
}

test('one wait returns webhook events with distinct credentials, then resumes with cursors without replay', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const inboxes = [];
    for (let index = 0; index < 2; index++)
        inboxes.push(
            (await app.inject({ method: 'POST', url: '/api/inboxes?visibility=public' })).json(),
        );
    const sources: { kind: string; id: string; token: string; after?: string }[] = inboxes.map(
        (inbox) => ({ kind: 'webhook', id: inbox.id, token: inbox.inspectionToken }),
    );
    const waiting = app.inject({
        method: 'POST',
        url: '/api/events/wait',
        payload: { sources, timeoutSeconds: 2 },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await app.inject({ method: 'POST', url: `/hooks/${inboxes[1].id}`, payload: 'arrived' });
    const response = await waiting;
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().events[0].id, inboxes[1].id);
    assert.equal(response.json().events[0].requests[0].body, 'arrived');
    sources[1]!.after = response.json().events[0].cursor;
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/events/wait',
                payload: { sources, timeoutSeconds: 1 },
            })
        ).json().timedOut,
        true,
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/events/wait',
                payload: {
                    sources: [{ ...sources[0], token: inboxes[1].inspectionToken }],
                    timeoutSeconds: 1,
                },
            })
        ).statusCode,
        404,
    );
});

test('event waits distinguish received mail from sent mail and preserve negative human answers over HTTP and MCP', async (t) => {
    const f = await fixture(t);
    const inbox = (
        await f.app.inject({ method: 'POST', url: '/api/email-inboxes', headers: f.headers })
    ).json();
    for (let index = 0; index < 12; index++)
        f.emails.record(inbox.id, {
            id: randomUUID(),
            direction: 'outbound',
            from: inbox.address,
            to: 'other@example.com',
            receivedAt: new Date().toISOString(),
            subject: 'Sent',
            text: 'not incoming',
            codes: [],
            links: [],
            attachments: [],
        });
    const received = randomUUID();
    f.emails.record(inbox.id, {
        id: received,
        direction: 'inbound',
        from: 'other@example.com',
        to: inbox.address,
        receivedAt: new Date().toISOString(),
        subject: 'Incoming',
        text: 'hello',
        codes: [],
        links: [],
        attachments: [],
    });
    const approvalId = randomUUID();
    f.approvals.create(
        {
            id: approvalId,
            accountId: f.identity.account.id,
            agentName: 'Test',
            question: 'May I deploy?',
            options: ['Yes', 'No'],
            status: 'answered',
            answer: 'No',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
        'free',
    );
    const sources = [
        { kind: 'email', id: inbox.id },
        { kind: 'approval', id: approvalId },
    ];
    const response = await f.app.inject({
        method: 'POST',
        url: '/api/events/wait',
        headers: f.headers,
        payload: { sources, timeoutSeconds: 1 },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().events.length, 2);
    assert.equal(response.json().events[0].messages.length, 1);
    assert.equal(response.json().events[0].cursor, received);
    assert.equal(response.json().events[1].approval.answer, 'No');
    assert.equal(response.json().events[1].approval.accountId, undefined);
    const mcp = await f.app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { ...f.headers, accept: 'application/json, text/event-stream' },
        payload: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'wait_for_event', arguments: { sources, timeoutSeconds: 1 } },
        },
    });
    assert.equal(mcp.json().result.isError, false, mcp.body);
    assert.equal(JSON.parse(mcp.json().result.content[0].text).events[1].approval.answer, 'No');
    assert.equal(
        (
            await f.app.inject({
                method: 'POST',
                url: '/api/events/wait',
                payload: { sources, timeoutSeconds: 1 },
            })
        ).statusCode,
        404,
    );
});

test('event sources reject invalid and duplicate inputs and shutdown releases pending waits', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const inbox = (await app.inject({ method: 'POST', url: '/api/inboxes' })).json();
    const source = { kind: 'webhook', id: inbox.id, token: inbox.inspectionToken };
    for (const sources of [
        [],
        [source, source],
        [{ kind: 'unknown-kind', id: inbox.id }],
        [{ ...source, id: 'invalid' }],
    ])
        assert.equal(
            (await app.inject({ method: 'POST', url: '/api/events/wait', payload: { sources } }))
                .statusCode,
            400,
        );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/events/wait',
                payload: { sources: [{ ...source, after: randomUUID() }] },
            })
        ).statusCode,
        400,
    );
    const waiting = app.inject({
        method: 'POST',
        url: '/api/events/wait',
        payload: { sources: [source], timeoutSeconds: 30 },
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const start = Date.now();
    await app.close();
    assert.equal((await waiting).json().timedOut, true);
    assert.ok(Date.now() - start < 1000);
});
