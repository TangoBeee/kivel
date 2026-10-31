import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from './app.js';
import { parseSse } from '@socket-help/tools/sse';
import { validateMock } from '@socket-help/tools/mock-config';

async function fixture(
    t: { after: (callback: () => Promise<unknown>) => void },
    provider: 'openai' | 'anthropic',
    interruptAfterChunks?: number,
) {
    const app = buildApp();
    t.after(() => app.close());
    const text = 'A scripted response with Unicode 🌿. '.repeat(4);
    const created = await app.inject({
        method: 'POST',
        url: '/api/mocks',
        payload: {
            name: 'LLM fixture',
            routes: [],
            llm: {
                provider,
                model: 'socket-mock',
                text,
                intervalMs: 1,
                ...(interruptAfterChunks ? { interruptAfterChunks } : {}),
            },
        },
    });
    assert.equal(created.statusCode, 201, created.body);
    const resource = created.json();
    const url = `/mock/${resource.id}/v1/${provider === 'openai' ? 'chat/completions' : 'messages'}`;
    const headers = { 'x-access-token': resource.accessToken };
    const body = {
        model: 'socket-mock',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Test this client.' }],
    };
    return { app, text, resource, url, headers, body };
}

test('OpenAI and Anthropic text mock endpoints preserve private access and provider JSON shapes', async (t) => {
    for (const provider of ['openai', 'anthropic'] as const) {
        const f = await fixture(t, provider);
        assert.equal(
            (await f.app.inject({ method: 'POST', url: f.url, payload: f.body })).statusCode,
            404,
        );
        const response = await f.app.inject({
            method: 'POST',
            url: f.url,
            headers: f.headers,
            payload: f.body,
        });
        assert.equal(response.statusCode, 200, response.body);
        assert.equal(response.headers['x-mock-usage'], 'estimated');
        const result = response.json();
        assert.equal(
            provider === 'openai' ? result.choices[0].message.content : result.content[0].text,
            f.text,
        );
        const limited = (
            await f.app.inject({
                method: 'POST',
                url: f.url,
                headers: f.headers,
                payload: { ...f.body, max_tokens: 2 },
            })
        ).json();
        assert.equal(
            provider === 'openai' ? limited.choices[0].finish_reason : limited.stop_reason,
            provider === 'openai' ? 'length' : 'max_tokens',
        );
        assert.equal(
            (
                await f.app.inject({
                    method: 'POST',
                    url: f.url,
                    headers: f.headers,
                    payload: { ...f.body, messages: [] },
                })
            ).statusCode,
            400,
        );
        const calls = (
            await f.app.inject({
                url: `/api/mocks/${f.resource.id}/calls`,
                headers: { 'x-resource-token': f.resource.managementToken },
            })
        ).json().calls;
        assert.ok(calls.length >= 3);
    }
});

test('streaming uses correct provider events, assembles Unicode text and signals deliberate incomplete streams', async (t) => {
    for (const provider of ['openai', 'anthropic'] as const) {
        const f = await fixture(t, provider);
        const response = await f.app.inject({
            method: 'POST',
            url: f.url,
            headers: f.headers,
            payload: { ...f.body, stream: true },
        });
        assert.match(String(response.headers['content-type']), /text\/event-stream/);
        const events = parseSse(response.body, 200).events;
        const text = events
            .map((event) => {
                if (event.data === '[DONE]') return '';
                const value = JSON.parse(event.data);
                return provider === 'openai'
                    ? (value.choices?.[0]?.delta?.content ?? '')
                    : (value.delta?.text ?? '');
            })
            .join('');
        assert.equal(text, f.text);
        assert.ok(
            events.some((event) =>
                provider === 'openai' ? event.data === '[DONE]' : event.event === 'message_stop',
            ),
        );
        const truncated = await fixture(t, provider, 1);
        const incomplete = await truncated.app.inject({
            method: 'POST',
            url: truncated.url,
            headers: truncated.headers,
            payload: { ...truncated.body, stream: true },
        });
        assert.ok(
            !parseSse(incomplete.body).events.some(
                (event) => event.data === '[DONE]' || event.event === 'message_stop',
            ),
        );
    }
});

test('LLM configurations reject conflicting modes and overlong/slow streams', () => {
    const llm = { provider: 'openai', model: 'socket-mock', text: 'Hello', intervalMs: 20 };
    assert.ok(validateMock({ name: 'Mock', routes: [], llm }).llm);
    assert.throws(
        () => validateMock({ name: 'Mock', routes: [], echo: true, llm }),
        /cannot combine/,
    );
    assert.throws(
        () => validateMock({ name: 'Mock', routes: [], llm: { ...llm, text: 'a'.repeat(8193) } }),
        /8192/,
    );
    assert.throws(
        () =>
            validateMock({
                name: 'Mock',
                routes: [],
                llm: { ...llm, text: 'a'.repeat(8192), intervalMs: 250 },
            }),
        /five seconds/,
    );
});
