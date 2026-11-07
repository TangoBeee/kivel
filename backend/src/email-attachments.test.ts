import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { SocketHelp } from '@socket-help/sdk';
import { command } from '@socket-help/cli';
import { buildApp } from './app.js';
import { MemoryIdentityRepository } from './identity.js';
import { ResourceStore } from './resources.js';
import { MemoryEmailMessages } from './email.js';
import { MemoryEmailAddresses } from './email-addresses.js';
import { parseAttachments, MESSAGE_ATTACHMENT_BYTES } from './email-attachments.js';
import PostalMime from 'postal-mime';
// @ts-expect-error The worker handler is deployed as JavaScript.
import { createEmailWorker } from '../../deploy/email-worker/src/handler.js';
const worker = createEmailWorker((input: ArrayBuffer) => PostalMime.parse(input));

const origin = 'http://localhost:3000',
    ingestSecret = 'test-attachment-ingest-secret';
async function fixture(
    t: { after(fn: () => Promise<unknown>): void },
    messages = new MemoryEmailMessages(),
    configure?: (app: ReturnType<typeof buildApp>) => void,
) {
    const identities = new MemoryIdentityRepository();
    const addresses = new MemoryEmailAddresses();
    let now = Date.now();
    const resources = new ResourceStore(() => now);
    const user = identities.register('attachment-owner', 'test')!,
        session = 'a'.repeat(43);
    identities.createSession(user.id, user.personalAccountId, session);
    const identity = identities.authenticateSession(session)!,
        key = identities.createKey(
            identity,
            'Attachments',
            ['resources:read', 'resources:write'],
            new Date(now + 86400000).toISOString(),
        );
    const other = identities.register('attachment-other', 'test')!,
        otherSession = 'b'.repeat(43);
    identities.createSession(other.id, other.personalAccountId, otherSession);
    const otherKey = identities.createKey(
        identities.authenticateSession(otherSession)!,
        'Other',
        ['resources:read', 'resources:write'],
        new Date(now + 86400000).toISOString(),
    );
    const app = buildApp({
        identityStore: identities,
        resourceStore: resources,
        emailMessages: messages,
        emailAddresses: addresses,
        mailDomain: 'socketspace.xyz',
        emailIngestSecret: ingestSecret,
        authSecret: 'test-attachment-signing-secret-32-characters',
    });
    configure?.(app);
    t.after(() => app.close());
    const headers = { authorization: `Bearer ${key.key}` },
        otherHeaders = { authorization: `Bearer ${otherKey.key}` };
    const created = await app.inject({
        method: 'POST',
        url: '/api/email-inboxes',
        headers,
        payload: {},
    });
    assert.equal(created.statusCode, 201, created.body);
    const inbox = created.json();
    const deliver = async (attachments: object[], extra: object = {}) => {
        const body = JSON.stringify({
            to: inbox.address,
            from: 'sender@example.test',
            subject: 'Attachment fixture',
            text: 'Expected test files.',
            attachments,
            ...extra,
        });
        const timestamp = String(Math.floor(Date.now() / 1000));
        return app.inject({
            method: 'POST',
            url: '/hooks/email',
            headers: {
                'content-type': 'application/json',
                'x-socket-timestamp': timestamp,
                'x-socket-signature': `sha256=${createHmac('sha256', ingestSecret).update(`${timestamp}.${body}`).digest('hex')}`,
            },
            payload: body,
        });
    };
    const preview = async () =>
        (await app.inject({ url: `/api/email-inboxes/${inbox.id}/messages`, headers })).json();
    const client = new SocketHelp({
        baseUrl: origin,
        fetch: async (url, init) => {
            const parsed = new URL(String(url));
            const response = await app.inject({
                method: (init?.method ?? 'GET') as 'GET',
                url: parsed.pathname + parsed.search,
                headers: {
                    ...Object.fromEntries(new Headers(init?.headers).entries()),
                    ...headers,
                },
                ...(init?.body ? { payload: String(init.body) } : {}),
            });
            return new Response(
                response.statusCode === 204 ? null : new Uint8Array(response.rawPayload),
                {
                    status: response.statusCode,
                    headers: response.headers as Record<string, string>,
                },
            );
        },
    });
    return {
        app,
        messages,
        addresses,
        owner: user.personalAccountId,
        resources,
        headers,
        otherHeaders,
        inbox,
        deliver,
        preview,
        client,
        expire: () => {
            now += 4 * 86400000;
            resources.deleteExpired();
            messages.cleanup();
        },
    };
}
const file = (bytes: Buffer, filename = 'invoice.html') => ({
    filename,
    mimeType: 'text/html',
    size: bytes.length,
    base64: bytes.toString('base64'),
});

test('owned attachments are stored without leaking bytes to previews and download with defensive headers', async (t) => {
    const f = await fixture(t),
        bytes = Buffer.from('<script>untrusted()</script>\u0000binary');
    assert.equal((await f.deliver([file(bytes)])).statusCode, 202);
    const preview = await f.preview(),
        message = preview.messages[0],
        attachment = message.attachments[0];
    assert.ok(attachment.id);
    assert.equal(message.attachmentBodies, undefined);
    assert.ok(!JSON.stringify(preview).includes(bytes.toString('base64')));
    assert.equal(attachment.size, bytes.length);
    const stored = f.messages.attachment(f.inbox.id, message.id, attachment.id);
    assert.deepEqual(stored?.bytes, bytes);
    const link = await f.client.getEmailAttachment(f.inbox.id, message.id, attachment.id);
    assert.ok(!link.downloadUrl.includes(f.owner));
    assert.equal(new URL(link.downloadUrl).searchParams.has('owner'), false);
    assert.match(new URL(link.downloadUrl).searchParams.get('ticket')!, /^[A-Za-z0-9_-]{86}$/);
    const url = new URL(link.downloadUrl),
        response = await f.app.inject(url.pathname + url.search);
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.rawPayload, bytes);
    assert.match(String(response.headers['content-disposition']), /^attachment;/);
    assert.equal(response.headers['content-type'], 'application/octet-stream');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.match(String(response.headers['content-security-policy']), /sandbox/);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(
        Buffer.from(await f.client.downloadEmailAttachment(f.inbox.id, message.id, attachment.id)),
        bytes,
    );
    assert.deepEqual(
        Buffer.from(
            (await command(f.client, [
                'email',
                'download-attachment',
                f.inbox.id,
                message.id,
                attachment.id,
            ])) as Uint8Array,
        ),
        bytes,
    );
    const mcp = await f.app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { ...f.headers, accept: 'application/json, text/event-stream' },
        payload: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
                name: 'get_email_attachment',
                arguments: { id: f.inbox.id, messageId: message.id, attachmentId: attachment.id },
            },
        },
    });
    assert.equal(mcp.json().result?.isError, false, mcp.body);
    assert.ok(mcp.body.length < 4096);
    assert.ok(JSON.parse(mcp.json().result.content[0].text).downloadUrl);
    assert.ok(!mcp.body.includes(bytes.toString('base64')));
});
test('attachment access is workspace isolated, links expire and deletion revokes already issued links', async (t) => {
    const f = await fixture(t);
    await f.deliver([file(Buffer.from('private bytes'))]);
    const message = (await f.preview()).messages[0],
        attachment = message.attachments[0];
    const path = `/api/email-inboxes/${f.inbox.id}/messages/${message.id}/attachments/${attachment.id}`;
    assert.equal((await f.app.inject(path)).statusCode, 401);
    assert.equal((await f.app.inject({ url: path, headers: f.otherHeaders })).statusCode, 404);
    const link = (await f.app.inject({ url: path, headers: f.headers })).json(),
        url = new URL(link.downloadUrl);
    const tampered = new URL(url);
    tampered.searchParams.set('expires', String(Number(tampered.searchParams.get('expires')) + 1));
    assert.equal((await f.app.inject(tampered.pathname + tampered.search)).statusCode, 404);
    const changedTicket = new URL(url);
    const ticket = changedTicket.searchParams.get('ticket')!;
    changedTicket.searchParams.set('ticket', `${ticket[0] === 'a' ? 'b' : 'a'}${ticket.slice(1)}`);
    assert.equal(
        (await f.app.inject(changedTicket.pathname + changedTicket.search)).statusCode,
        404,
    );
    const changedPath = new URL(url);
    changedPath.pathname = changedPath.pathname.replace(message.id, crypto.randomUUID());
    assert.equal((await f.app.inject(changedPath.pathname + changedPath.search)).statusCode, 404);
    const repeated = await f.client.getEmailAttachment(f.inbox.id, message.id, attachment.id);
    assert.notEqual(new URL(repeated.downloadUrl).searchParams.get('ticket'), ticket);
    const actual = Date.now;
    Date.now = () => actual() + 121000;
    try {
        assert.equal((await f.app.inject(url.pathname + url.search)).statusCode, 404);
    } finally {
        Date.now = actual;
    }
    const cleared = await f.app.inject({
        method: 'DELETE',
        url: `/api/email-inboxes/${f.inbox.id}/messages`,
        headers: f.headers,
    });
    assert.equal(cleared.statusCode, 204, cleared.body);
    assert.equal(f.messages.attachment(f.inbox.id, message.id, attachment.id), undefined);
    assert.equal((await f.app.inject(url.pathname + url.search)).statusCode, 404);
    await f.deliver([file(Buffer.from('another attachment'))]);
    const next = (await f.preview()).messages[0];
    const nextLink = await f.client.getEmailAttachment(f.inbox.id, next.id, next.attachments[0].id);
    f.expire();
    assert.equal(f.messages.count(f.inbox.id), 0);
    const expired = new URL(nextLink.downloadUrl);
    assert.equal((await f.app.inject(expired.pathname + expired.search)).statusCode, 404);
});
test('attachment validation and per-inbox storage caps reject complete messages atomically', async (t) => {
    assert.throws(
        () => parseAttachments([file(Buffer.alloc(MESSAGE_ATTACHMENT_BYTES + 1))], true),
        /5 MiB/,
    );
    assert.throws(
        () =>
            parseAttachments(
                [{ filename: 'x', mimeType: 'text/plain', size: 2, base64: 'YQ==' }],
                true,
            ),
        /match/,
    );
    assert.throws(
        () =>
            parseAttachments(
                Array.from({ length: 21 }, () => file(Buffer.from('a'))),
                true,
            ),
        /20 files/,
    );
    const f = await fixture(t),
        payload = file(Buffer.alloc(4 * 1048576, 65), 'large.bin');
    for (let i = 0; i < 6; i++) {
        const response = await f.deliver([payload]);
        assert.equal(response.statusCode, 202, response.body);
    }
    assert.equal(f.messages.count(f.inbox.id), 6);
    assert.equal((await f.deliver([payload])).statusCode, 429);
    assert.equal(f.messages.count(f.inbox.id), 6);
    assert.equal((await f.deliver([file(Buffer.alloc(MESSAGE_ATTACHMENT_BYTES))])).statusCode, 413);
    assert.equal(f.messages.count(f.inbox.id), 6);
});
test('the receiving worker forwards exact attachment bytes and retains raw message limits', async (t) => {
    const f = await fixture(t),
        bytes = Buffer.from([0, 1, 2, 255, 65]);
    const raw = `From: Sender <sender@example.test>\r\nTo: ${f.inbox.address}\r\nSubject: Worker attachment\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=fixture\r\n\r\n--fixture\r\nContent-Type: text/plain\r\n\r\nExpected test attachment.\r\n--fixture\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="test.bin"\r\nContent-Transfer-Encoding: base64\r\n\r\n${bytes.toString('base64')}\r\n--fixture--\r\n`;
    const original = globalThis.fetch;
    let forwarded = false;
    globalThis.fetch = async (url, init) => {
        assert.equal(String(url), `${origin}/hooks/email`);
        const input = JSON.parse(String(init?.body));
        assert.equal(input.attachments[0].base64, bytes.toString('base64'));
        forwarded = true;
        const response = await f.app.inject({
            method: 'POST',
            url: '/hooks/email',
            headers: init?.headers as Record<string, string>,
            payload: String(init?.body),
        });
        return new Response(response.body, { status: response.statusCode });
    };
    try {
        await worker.email(
            {
                rawSize: Buffer.byteLength(raw),
                raw: new Response(raw).body,
                to: f.inbox.address,
                from: 'sender@example.test',
                setReject: (reason: string) => assert.fail(reason),
            },
            { INGEST_URL: `${origin}/hooks/email`, EMAIL_INGEST_SECRET: ingestSecret },
        );
    } finally {
        globalThis.fetch = original;
    }
    assert.equal(forwarded, true);
    const message = (await f.preview()).messages[0];
    assert.equal(message.mailFrom, 'sender@example.test');
    assert.deepEqual(
        f.messages.attachment(f.inbox.id, message.id, message.attachments[0].id)?.bytes,
        bytes,
    );
    let rejected = '';
    await worker.email(
        {
            rawSize: 5 * 1048576 + 1,
            setReject: (reason: string) => {
                rejected = reason;
            },
        },
        {},
    );
    assert.equal(rejected, 'Message too large.');
});

test('inbox retirement revokes issued attachment links before periodic cleanup runs', async (t) => {
    const f = await fixture(t);
    assert.equal((await f.deliver([file(Buffer.from('retirement fixture'))])).statusCode, 202);
    const message = (await f.preview()).messages[0];
    const link = await f.client.getEmailAttachment(
        f.inbox.id,
        message.id,
        message.attachments[0].id,
    );
    const row = f.addresses.find(f.inbox.address)!;
    row.expiresAt = new Date(Date.now() - 1000).toISOString();
    f.addresses.save(row);
    assert.ok(f.resources.read(f.inbox.id, 'email', '', f.owner));
    const url = new URL(link.downloadUrl);
    assert.equal((await f.app.inject(url.pathname + url.search)).statusCode, 404);
    assert.equal(f.messages.count(f.inbox.id), 0);
    assert.equal(f.resources.read(f.inbox.id, 'email', '', f.owner), undefined);
});

test('mail ingestion bounds concurrent large requests and releases capacity after delivery', async (t) => {
    let release!: () => void,
        reached!: () => void,
        waiting = 0;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
        reached = resolve;
    });
    class DelayedMessages extends MemoryEmailMessages {
        override async record(...args: Parameters<MemoryEmailMessages['record']>) {
            if (++waiting === 4) reached();
            await gate;
            return super.record(...args);
        }
    }
    const f = await fixture(t, new DelayedMessages());
    const deadline = setTimeout(() => {
        release();
        reached();
    }, 2000);
    const pending = Array.from({ length: 4 }, () =>
        f.deliver([file(Buffer.alloc(512 * 1024, 65))]),
    );
    try {
        await ready;
        const busy = await f.deliver([file(Buffer.alloc(512 * 1024, 65))]);
        assert.equal(busy.statusCode, 503, busy.body);
        assert.equal(busy.headers['retry-after'], '2');
    } finally {
        clearTimeout(deadline);
        release();
        await Promise.all(pending);
    }
    assert.equal((await f.deliver([file(Buffer.alloc(512 * 1024, 65))])).statusCode, 202);
});

test('four large ingests cannot block small messages and large capacity is released on completion', async (t) => {
    const held: (() => void)[] = [];
    const ready = Promise.withResolvers<void>();
    const f = await fixture(t, new MemoryEmailMessages(), (app) => {
        app.addHook('preParsing', (request, _reply, payload, done) => {
            if (
                request.url === '/hooks/email' &&
                Number(request.headers['content-length']) > 256 * 1024
            ) {
                held.push(() => done(null, payload));
                if (held.length === 4) ready.resolve();
            } else done(null, payload);
        });
    });
    const large = file(Buffer.alloc(512 * 1024, 65));
    const deadline = setTimeout(() => {
        ready.reject(new Error('Large requests did not reach the parsing boundary.'));
        for (const release of held) release();
    }, 2000);
    const pending = Array.from({ length: 4 }, () => f.deliver([large]));
    try {
        await ready.promise;
        assert.equal((await f.deliver([large])).statusCode, 503);
        const small = await f.deliver([], {
            subject: 'Small verification message',
            text: 'Verification code: 123456',
        });
        assert.equal(small.statusCode, 202, small.body);
        assert.equal((await f.preview()).messages.length, 1);
    } finally {
        clearTimeout(deadline);
        for (const release of held) release();
    }
    assert.ok((await Promise.all(pending)).every((response) => response.statusCode === 202));
});

test('message size checks reject oversized raw and decoded messages at the five MiB boundary', async (t) => {
    const f = await fixture(t);
    assert.equal((await f.deliver([], { rawSize: 5 * 1048576 + 1 })).statusCode, 413);
    assert.equal((await f.deliver([file(Buffer.alloc(5 * 1048576))])).statusCode, 413);
    assert.equal((await f.deliver([], { rawSize: 5 * 1048576 })).statusCode, 202);
    assert.equal((await f.deliver([], { rawSize: -1 })).statusCode, 400);
    assert.equal((await f.deliver([], { rawSize: '5242880' })).statusCode, 400);
    assert.equal(f.messages.count(f.inbox.id), 1);
});
