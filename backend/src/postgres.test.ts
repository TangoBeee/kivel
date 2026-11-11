import DodoPayments from 'dodopayments';
import { plans } from '@kivel.io/tools/plans';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { randomBytes, createHash, createHmac } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from './database.js';
import { PostgresInboxStore, PostgresRateLimiter } from './postgres.js';
import { buildApp } from './app.js';
import { PostgresResourceStore } from './resources.js';
import { PostgresMockCalls } from './mock-calls.js';
import { PostgresEmailSending, newSendJob } from './email-sending-store.js';
import { PostgresEmailAddresses } from './email-addresses.js';
import { EmailLifecycle } from './email-lifecycle.js';
import { PostgresEmailMessages } from './email.js';
import { PostgresActivity } from './activity.js';
import { PostgresKv } from './kv.js';
import { PostgresMonitors } from './monitors.js';
import { PostgresAgents } from './agents.js';
import { PostgresApprovals } from './approvals.js';
import { PostgresJobs } from './scheduled-jobs.js';
import type { CrudState } from '@kivel.io/tools/mock-crud';
import { PostgresRecoveryRepository } from './recovery-store.js';
import { passwordHash, PostgresIdentityRepository } from './identity.js';
import ssh2 from 'ssh2';
import type { Client as SshClient } from 'ssh2';
const { Client, utils } = ssh2;
import { createSshServer, loadHostKey } from './ssh.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BillingRepository } from './billing.js';
import { liftEmailSuspension } from './email-admin.js';
import type { CapturedRequest } from './inboxes.js';

if (!process.env.TEST_DATABASE_URL)
    throw new Error('Run pnpm test:integration from the repository root.');
const schema = `test_${randomBytes(8).toString('hex')}`;
const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
});
const input: Omit<CapturedRequest, 'id' | 'timestamp'> = {
    method: 'POST',
    path: '/test',
    headers: {},
    query: {},
    body: 'hello\u0000world',
    bodyEncoding: 'utf8',
    bodySize: 11,
};

before(async () => {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await Promise.all([migrate(pool), migrate(pool)]);
});
beforeEach(async () => {
    await pool.query(
        'TRUNCATE phone_messages, phone_numbers, email_send_jobs, email_sender_suspensions, email_suppressions, email_addresses, captured_requests, inboxes, rate_windows, temporary_resources, users, accounts, principal_usage, tool_usage_daily, resource_events, stripe_events, dodo_events RESTART IDENTITY CASCADE',
    );
    await pool.query('UPDATE platform_usage SET inbox_count = 0, stored_bytes = 0');
    await pool.query('UPDATE resource_usage SET resource_count = 0, stored_bytes = 0');
});
after(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
});

test('CRUD records persist across app instances, concurrent updates preserve fields and capacity failures roll back', async (t) => {
    const a = buildApp({ resourceStore: new PostgresResourceStore(pool) });
    const b = buildApp({ resourceStore: new PostgresResourceStore(pool) });
    t.after(async () => {
        await a.close();
        await b.close();
    });
    const response = await a.inject({
        method: 'POST',
        url: '/api/mocks',
        payload: {
            name: 'Durable CRUD',
            routes: [],
            crud: { path: '/items', seed: [{ id: 'initial', name: 'Original' }] },
        },
    });
    assert.equal(response.statusCode, 201, response.body);
    const created = response.json(),
        url = `/mock/${created.id}/items`,
        headers = { 'x-access-token': created.accessToken };
    const writes = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
            (index % 2 ? a : b).inject({
                method: 'POST',
                url,
                headers,
                payload: { id: `item_${index}`, n: index },
            }),
        ),
    );
    assert.ok(
        writes.every((write) => write.statusCode === 201),
        writes.map((write) => write.body).join('\n'),
    );
    const patches = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
            (index % 2 ? a : b).inject({
                method: 'PATCH',
                url: `${url}/initial`,
                headers,
                payload: { [`field_${index}`]: index },
            }),
        ),
    );
    assert.ok(patches.every((write) => write.statusCode === 200));
    const restarted = new PostgresResourceStore(pool);
    const metadata = await restarted.read(created.id, 'mock', created.managementToken);
    const state = metadata!.payload.crudState as CrudState;
    assert.equal(state.records.length, 21);
    assert.equal(state.revision, 30);
    for (let index = 0; index < 10; index++)
        assert.equal(state.records[0]![`field_${index}`], index);
    const beforeUsage = (await pool.query('SELECT * FROM resource_usage WHERE id=1')).rows[0];
    const limited = new PostgresResourceStore(pool, 1000);
    assert.equal(
        await limited.mutateMock(created.id, { token: created.accessToken }, (payload) => ({
            payload: { ...payload, excessive: 'x'.repeat(5000) },
            result: true,
        })),
        'full',
    );
    assert.deepEqual(await restarted.read(created.id, 'mock', created.managementToken), metadata);
    assert.deepEqual(
        (await pool.query('SELECT * FROM resource_usage WHERE id=1')).rows[0],
        beforeUsage,
    );
    const reset = await b.inject({
        method: 'POST',
        url: `/api/mocks/${created.id}/reset`,
        headers: { authorization: `Bearer ${created.managementToken}` },
    });
    assert.equal(reset.statusCode, 200, reset.body);
    assert.equal(reset.json().revision, 31);
    assert.equal(
        (
            (await restarted.read(created.id, 'mock', created.managementToken))!.payload
                .crudState as CrudState
        ).records.length,
        1,
    );
    const totals = (
        await pool.query('SELECT sum(stored_bytes)::text AS bytes FROM temporary_resources')
    ).rows[0];
    assert.equal(
        (await pool.query('SELECT stored_bytes::text AS bytes FROM resource_usage WHERE id=1'))
            .rows[0].bytes,
        totals.bytes,
    );
});

test('inboxes, token hashes, and exact payloads survive repository recreation', async () => {
    const first = new PostgresInboxStore(pool);
    const inbox = (await first.create())!;
    assert.equal((await first.capture(inbox.id, input)).status, 'captured');
    const second = new PostgresInboxStore(pool);
    const history = (await second.listRequests(inbox.id, inbox.inspectionToken))!;
    assert.equal(history[0]!.body, input.body);
    assert.equal((await second.info(inbox.id, inbox.inspectionToken))!.requestCount, 1);
    assert.equal(await second.listRequests(inbox.id, 'wrong'), undefined);
    assert.equal(await second.listRequests('unknown', 'wrong'), undefined);
    const stored = (await pool.query('SELECT token_hash FROM inboxes')).rows[0].token_hash;
    assert.equal(stored.length, 32);
    assert.notEqual(stored.toString(), inbox.inspectionToken);
});

test('concurrent creation across replicas respects the shared inbox quota', async () => {
    const stores = [
        new PostgresInboxStore(pool, { maxInboxes: 3 }),
        new PostgresInboxStore(pool, { maxInboxes: 3 }),
    ];
    const created = await Promise.all(
        Array.from({ length: 20 }, (_, index) => stores[index % 2]!.create()),
    );
    assert.equal(created.filter(Boolean).length, 3);
    assert.equal(
        (await pool.query('SELECT inbox_count FROM platform_usage')).rows[0].inbox_count,
        3,
    );
});

test('concurrent capture never exceeds count limits or loses quota accounting', async () => {
    const stores = [
        new PostgresInboxStore(pool, { maxRequestsPerInbox: 5 }),
        new PostgresInboxStore(pool, { maxRequestsPerInbox: 5 }),
    ];
    const inbox = (await stores[0]!.create())!;
    const results = await Promise.all(
        Array.from({ length: 25 }, (_, index) => stores[index % 2]!.capture(inbox.id, input)),
    );
    assert.equal(results.filter((result) => result.status === 'captured').length, 5);
    const usage = (await pool.query('SELECT stored_bytes FROM platform_usage')).rows[0]
        .stored_bytes;
    const sum = (await pool.query('SELECT SUM(stored_bytes) AS bytes FROM captured_requests'))
        .rows[0].bytes;
    assert.equal(usage, sum);
    assert.equal((await stores[0]!.info(inbox.id, inbox.inspectionToken))!.requestCount, 5);
});

test('global storage budget is shared and deletion reclaims it atomically', async () => {
    const store = new PostgresInboxStore(pool, { maxTotalBytes: 700 });
    const first = (await store.create())!;
    const second = (await store.create())!;
    const payload = { ...input, body: 'x'.repeat(300), bodySize: 300 };
    assert.equal((await store.capture(first.id, payload)).status, 'captured');
    assert.equal((await store.capture(second.id, payload)).status, 'storage-full');
    assert.equal(await store.delete(first.id, 'wrong'), false);
    assert.equal(await store.delete(first.id, first.inspectionToken), true);
    assert.equal((await store.capture(second.id, payload)).status, 'captured');
    assert.equal((await pool.query('SELECT COUNT(*) FROM captured_requests')).rows[0].count, '1');
});

test('expiration rejects reads and writes and reclaims counters and captured rows', async () => {
    const store = new PostgresInboxStore(pool, { maxInboxes: 1 });
    const inbox = (await store.create())!;
    await store.capture(inbox.id, input);
    await pool.query("UPDATE inboxes SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [
        inbox.id,
    ]);
    assert.equal(await store.has(inbox.id), false);
    assert.equal(await store.listRequests(inbox.id, inbox.inspectionToken), undefined);
    assert.equal((await store.capture(inbox.id, input)).status, 'not-found');
    assert.ok(await store.create());
    assert.equal((await pool.query('SELECT COUNT(*) FROM captured_requests')).rows[0].count, '0');
    assert.equal(
        (await pool.query('SELECT stored_bytes FROM platform_usage')).rows[0].stored_bytes,
        '0',
    );
});

test('rate limits are atomic, shared, hashed, and released at expiration', async () => {
    const first = new PostgresRateLimiter(pool);
    const second = new PostgresRateLimiter(pool);
    const results = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
            (index % 2 ? first : second).consume('ip:192.0.2.1', 5),
        ),
    );
    assert.equal(results.filter((retry) => retry === 0).length, 5);
    assert.ok(results.filter((retry) => retry > 0).every((retry) => retry <= 60));
    // New clients are never refused because other keys exist.
    for (const key of ['second', 'third', 'fourth']) assert.equal(await first.consume(key, 1), 0);
    assert.ok((await second.consume('third', 1)) > 0);
    const stored = (await pool.query('SELECT key_hash FROM rate_windows LIMIT 1')).rows[0].key_hash;
    assert.equal(stored.length, 32);
    await pool.query("UPDATE rate_windows SET expires_at = NOW() - INTERVAL '1 second'");
    assert.equal(await second.consume('third', 1), 0);
});

test('the HTTP lifecycle works across two app instances using the same database', async (t) => {
    const first = buildApp({
        inboxStore: new PostgresInboxStore(pool),
        rateLimiter: new PostgresRateLimiter(pool),
    });
    const second = buildApp({
        inboxStore: new PostgresInboxStore(pool),
        rateLimiter: new PostgresRateLimiter(pool),
    });
    t.after(async () => {
        await first.close();
        await second.close();
    });
    const inbox = (
        await first.inject({ method: 'POST', url: '/api/inboxes?visibility=public' })
    ).json();
    assert.ok(inbox.id);
    assert.equal(
        (await second.inject({ method: 'POST', url: `/hooks/${inbox.id}`, payload: 'shared' }))
            .statusCode,
        200,
    );
    const headers = { authorization: `Bearer ${inbox.inspectionToken}` };
    const response = await first.inject({ url: `/api/inboxes/${inbox.id}/requests`, headers });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().requests[0].body, 'shared');
    const unchanged = await second.inject({
        url: `/api/inboxes/${inbox.id}/requests`,
        headers: { ...headers, 'if-none-match': response.headers.etag! },
    });
    assert.equal(unchanged.statusCode, 304);
    assert.equal(
        (await first.inject({ method: 'DELETE', url: `/api/inboxes/${inbox.id}`, headers }))
            .statusCode,
        204,
    );
    assert.equal(
        (await second.inject({ method: 'POST', url: `/hooks/${inbox.id}` })).statusCode,
        404,
    );
});

test('temporary files and mocks survive repository recreation without exposing plaintext tokens', async () => {
    const first = new PostgresResourceStore(pool);
    const file = await first.create(
        'file',
        { name: 'binary.dat', note: 'null\u0000byte' },
        Buffer.from([0, 255, 128]),
    );
    assert.ok(file);
    const row = (
        await pool.query('SELECT token_hash, payload FROM temporary_resources WHERE id = $1', [
            file.id,
        ])
    ).rows[0];
    assert.equal(row.token_hash.length, 32);
    assert.notEqual(row.token_hash.toString(), file.managementToken);
    const second = new PostgresResourceStore(pool);
    assert.equal(
        (await second.read(file.id, 'file', file.managementToken))?.payload.note,
        'null\u0000byte',
    );
    assert.deepEqual((await second.use(file.id, 'file'))?.data, Buffer.from([0, 255, 128]));
    assert.equal(await second.read(file.id, 'file', 'wrong'), undefined);
    assert.equal(await second.read('not-a-uuid', 'file', file.managementToken), undefined);
    assert.equal(await second.delete(file.id, 'mock', file.managementToken), false);
    assert.equal(await second.delete(file.id, 'file', file.managementToken), true);
    assert.equal(await first.use(file.id, 'file'), undefined);
});

test('resource creation, updates, expiration and counters remain atomic across replicas', async () => {
    const stores = [
        new PostgresResourceStore(pool, 1200, 2),
        new PostgresResourceStore(pool, 1200, 2),
    ];
    const created = (
        await Promise.all(
            Array.from({ length: 8 }, (_, index) =>
                stores[index % 2]!.create('mock', { name: 'x' }),
            ),
        )
    ).filter((value) => value !== null);
    assert.equal(created.length, 2);
    const first = created[0]!;
    assert.equal(
        await stores[0]!.update(first.id, 'mock', first.managementToken, { body: 'x'.repeat(600) }),
        'full',
    );
    assert.equal(
        (await stores[1]!.read(first.id, 'mock', first.managementToken))?.payload.name,
        'x',
    );
    assert.equal(
        await stores[0]!.update(first.id, 'mock', first.managementToken, { name: 'updated' }),
        'updated',
    );
    await pool.query(
        "UPDATE temporary_resources SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
        [first.id],
    );
    assert.equal(await stores[1]!.read(first.id, 'mock', first.managementToken), undefined);
    assert.equal(await stores[1]!.use(first.id, 'mock'), undefined);
    const replacement = await stores[1]!.create('file', { name: 'new' }, Buffer.from('data'));
    assert.ok(replacement);
    const totals = (
        await pool.query(
            'SELECT count(*)::integer AS count, sum(stored_bytes)::bigint AS bytes FROM temporary_resources',
        )
    ).rows[0];
    const usage = (await pool.query('SELECT * FROM resource_usage')).rows[0];
    assert.equal(usage.resource_count, totals.count);
    assert.equal(usage.stored_bytes, totals.bytes);
});

test('download limits are enforced atomically across replicas', async () => {
    const a = new PostgresResourceStore(pool),
        b = new PostgresResourceStore(pool);
    const file = await a.create('file', { name: 'fixture.bin' }, Buffer.from('fixture'));
    assert.ok(file);
    const downloads = await Promise.all(
        Array.from({ length: 12 }, (_, index) => (index % 2 ? a : b).use(file.id, 'file', 3)),
    );
    assert.equal(downloads.filter(Boolean).length, 3);
    assert.equal((await b.read(file.id, 'file', file.managementToken))?.uses, 3);
});

test('mock APIs and files work through two HTTP instances sharing PostgreSQL', async (t) => {
    const a = buildApp({ resourceStore: new PostgresResourceStore(pool) });
    const b = buildApp({ resourceStore: new PostgresResourceStore(pool) });
    t.after(async () => {
        await a.close();
        await b.close();
    });
    const created = await a.inject({
        method: 'POST',
        url: '/api/mocks?visibility=public',
        payload: {
            name: 'Integration',
            routes: [
                {
                    method: 'GET',
                    path: '/',
                    status: 200,
                    body: 'ok',
                    headers: { 'content-type': 'text/plain' },
                },
            ],
        },
    });
    assert.equal(created.statusCode, 201);
    const mock = created.json();
    assert.equal((await b.inject({ url: `/mock/${mock.id}` })).body, 'ok');
    const file = (
        await a.inject({
            method: 'POST',
            url: '/api/files?visibility=public',
            headers: { 'content-type': 'application/octet-stream', 'x-file-name': 'test.bin' },
            payload: Buffer.from([0, 255]),
        })
    ).json();
    assert.deepEqual(
        (await b.inject({ url: `/files/${file.id}` })).rawPayload,
        Buffer.from([0, 255]),
    );
    assert.equal(
        (
            await b.inject({
                method: 'DELETE',
                url: `/api/files/${file.id}`,
                headers: { authorization: `Bearer ${file.managementToken}` },
            })
        ).statusCode,
        204,
    );
    assert.equal((await a.inject({ url: `/files/${file.id}` })).statusCode, 404);
});

test('upgrading an existing webhook-only database preserves captures and enables MCP resources', async () => {
    const inboxes = new PostgresInboxStore(pool);
    const inbox = await inboxes.create();
    assert.ok(inbox);
    await inboxes.capture(inbox.id, input);
    await pool.query(
        `DROP TRIGGER inbox_quota ON inboxes; DROP FUNCTION enforce_resource_quota() CASCADE;
         ALTER TABLE inboxes DROP COLUMN owner_id, DROP COLUMN quota_key, DROP COLUMN created_at, DROP COLUMN persistent, DROP COLUMN request_limit, DROP COLUMN byte_limit, DROP COLUMN visibility, DROP COLUMN access_token_hash, DROP COLUMN access_version, DROP COLUMN response, DROP COLUMN forward_url;
         DROP TABLE phone_messages, phone_numbers, scheduled_jobs, email_send_jobs, email_sender_suspensions, email_suppressions, email_addresses, mock_calls, inbox_deliveries, email_messages, activity_log, kv_entries, monitor_events, monitors, cookie_coupons, approvals, agent_trials, agent_logins, agents, user_contact_emails, auth_mail_outbox, auth_challenges, user_recovery_emails, temporary_resources, resource_usage, account_members, auth_sessions, api_keys, account_invites, users, accounts, usage_plans, principal_usage, tool_usage_daily, resource_events, stripe_events, dodo_events CASCADE; DELETE FROM schema_migrations WHERE version > 1`,
    );
    await Promise.all([migrate(pool), migrate(pool)]);
    assert.equal(
        (await inboxes.listRequests(inbox.id, inbox.inspectionToken))?.[0]?.body,
        input.body,
    );
    const resources = new PostgresResourceStore(pool);
    const server = await resources.create('mcp', { name: 'Migrated server', tools: [] });
    assert.ok(server);
    assert.equal(
        (await resources.read(server.id, 'mcp', server.managementToken))?.payload.name,
        'Migrated server',
    );
    assert.equal(
        (await pool.query('SELECT max(version) AS version FROM schema_migrations')).rows[0].version,
        19,
    );
});

test('principal limits are atomic across inboxes and resources and failed writes roll back global counters', async () => {
    const inboxes = new PostgresInboxStore(pool),
        resources = new PostgresResourceStore(pool);
    const allocation = { quotaKey: randomBytes(32).toString('hex'), plan: 'anonymous' as const };
    const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, index) =>
            index % 2
                ? inboxes.create(allocation)
                : resources.create('mock', { name: 'Quota' }, undefined, allocation),
        ),
    );
    assert.equal(
        results.filter((result) => result.status === 'fulfilled' && result.value).length,
        5,
    );
    assert.equal(
        results.filter(
            (result) =>
                result.status === 'rejected' && result.reason.message === 'account_resource_limit',
        ).length,
        15,
    );
    const usage = (await pool.query('SELECT * FROM principal_usage')).rows[0];
    assert.equal(usage.resource_count, 5);
    const globals = (
        await pool.query(
            'SELECT (SELECT inbox_count FROM platform_usage) + (SELECT resource_count FROM resource_usage) AS count',
        )
    ).rows[0];
    assert.equal(globals.count, 5);
    const owned = (await inboxes.create({
        ...allocation,
        quotaKey: randomBytes(32).toString('hex'),
    }))!;
    await inboxes.delete(owned.id, owned.inspectionToken);
    const successful = results.find(
        (result) =>
            result.status === 'fulfilled' && result.value && 'managementToken' in result.value,
    );
    if (
        successful?.status === 'fulfilled' &&
        successful.value &&
        'managementToken' in successful.value
    )
        await resources.delete(successful.value.id, 'mock', successful.value.managementToken);
    const inboxResult = results.find(
        (result) =>
            result.status === 'fulfilled' && result.value && 'inspectionToken' in result.value,
    );
    if (
        inboxResult?.status === 'fulfilled' &&
        inboxResult.value &&
        'inspectionToken' in inboxResult.value
    )
        await inboxes.delete(inboxResult.value.id, inboxResult.value.inspectionToken);
    const total = Number(
        (
            await pool.query('SELECT resource_count FROM principal_usage WHERE key_hash = $1', [
                Buffer.from(allocation.quotaKey, 'hex'),
            ])
        ).rows[0].resource_count,
    );
    assert.ok(total < 5);
    assert.ok(await resources.create('mcp', { name: 'Reclaimed' }, undefined, allocation));
});

test('owned resources, scoped credentials, capture bytes, and expiry survive repository recreation', async () => {
    const identities = new PostgresIdentityRepository(pool),
        user = (await identities.register('postgres-owner', 'unused'))!;
    await identities.createSession(user.id, user.personalAccountId, 'test-session');
    const identity = (await identities.authenticateSession('test-session'))!;
    const credential = await identities.createKey(
        identity,
        'Test',
        ['resources:read'],
        new Date(Date.now() + 60000).toISOString(),
    );
    assert.deepEqual(
        (await new PostgresIdentityRepository(pool).authenticateKey(credential.key))?.keyScopes,
        ['resources:read'],
    );
    const allocation = {
        quotaKey: identity.account.quotaKey,
        plan: 'free' as const,
        ownerId: identity.account.id,
    };
    const inboxes = new PostgresInboxStore(pool),
        resources = new PostgresResourceStore(pool);
    const inbox = (await inboxes.create(allocation))!,
        resource = (await resources.create('mock', { name: 'Original' }, undefined, allocation))!;
    assert.equal(await inboxes.info(inbox.id, inbox.inspectionToken), undefined);
    assert.ok(await inboxes.info(inbox.id, '', identity.account.id));
    assert.equal(await resources.read(resource.id, 'mock', resource.managementToken), undefined);
    assert.equal((await inboxes.capture(inbox.id, input)).status, 'captured');
    assert.equal(
        await resources.update(resource.id, 'mock', '', { name: 'Updated' }, identity.account.id),
        'updated',
    );
    assert.equal(
        await resources.renew(
            resource.id,
            'mock',
            '',
            new Date(Date.now() + 7200000).toISOString(),
            identity.account.id,
        ),
        true,
    );
    const usage = (
        await pool.query('SELECT * FROM principal_usage WHERE account_id = $1', [
            identity.account.id,
        ])
    ).rows[0];
    const sum = (
        await pool.query(
            'SELECT (SELECT sum(stored_bytes) FROM inboxes) + (SELECT sum(stored_bytes) FROM temporary_resources) AS bytes',
        )
    ).rows[0].bytes;
    assert.equal(usage.stored_bytes, sum);
    const actions = (
        await pool.query('SELECT action FROM resource_events ORDER BY sequence')
    ).rows.map((row) => row.action);
    assert.deepEqual(actions, ['created', 'created', 'updated', 'renewed']);
    assert.equal(await identities.revokeKey(identity, credential.info.id), true);
    assert.equal(await identities.authenticateKey(credential.key), undefined);
    await pool.query("UPDATE inboxes SET expires_at = clock_timestamp() - interval '1 second'");
    await inboxes.deleteExpired();
    assert.equal(
        (
            await pool.query('SELECT resource_count FROM principal_usage WHERE account_id = $1', [
                identity.account.id,
            ])
        ).rows[0].resource_count,
        1,
    );
});

test('daily hosted execution meters are shared and atomic across replicas', async () => {
    const a = new PostgresIdentityRepository(pool),
        b = new PostgresIdentityRepository(pool),
        key = randomBytes(32).toString('hex');
    const results = await Promise.all(
        Array.from({ length: 30 }, (_, index) => (index % 2 ? a : b).consumeRun(key, null, 5)),
    );
    assert.equal(results.filter((result) => result.allowed).length, 5);
    assert.equal(await b.runUsage(key), 5);
    const reserved = results.filter((result) => result.allowed);
    await Promise.all(
        reserved.map((result, index) => (index % 2 ? a : b).releaseRun(key, result.day)),
    );
    assert.equal(await b.runUsage(key), 0);
    assert.equal((await a.consumeRun(key, null, 5)).allowed, true);
    await b.releaseRun(key, reserved[0]!.day - 1);
    assert.equal(await a.runUsage(key), 1);
});

test('billing events are idempotent, fetch current subscription state, and extend only live persistent resources', async () => {
    const identities = new PostgresIdentityRepository(pool),
        user = (await identities.register('billing-owner', 'unused'))!;
    await pool.query('UPDATE accounts SET dodo_customer_id = $1 WHERE id = $2', [
        'cus_test',
        user.personalAccountId,
    ]);
    const account = (await identities.account(user.personalAccountId))!,
        resources = new PostgresResourceStore(pool);
    const resource = (await resources.create('mock', { name: 'Persistent' }, undefined, {
        quotaKey: account.quotaKey,
        ownerId: account.id,
        plan: 'free',
        persistent: true,
    }))!;
    const repository = new BillingRepository(pool);
    let loads = 0;
    const state = {
        id: 'sub_test',
        customerId: 'cus_test',
        accountId: account.id,
        plan: 'pro' as const,
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
    };
    const load = async () => {
        loads++;
        return state;
    };
    await Promise.all([
        repository.process('evt_test', 10, 'cus_test', load),
        repository.process('evt_test', 10, 'cus_test', load),
    ]);
    assert.equal(loads, 1);
    assert.equal((await identities.account(account.id))?.plan, 'pro');
    assert.ok(
        Date.parse((await resources.read(resource.id, 'mock', '', account.id))!.expiresAt) >
            Date.now() + 30 * 86400000,
    );
    await repository.process('evt_old_delivery', 1, 'cus_test', async () => ({
        ...state,
        plan: 'free',
        validUntil: null,
    }));
    assert.equal((await identities.account(account.id))?.plan, 'free');
    assert.ok(await resources.read(resource.id, 'mock', '', account.id));
});

test('SSH verifies host identity, executes the shared engine, rejects shell commands, and observes key revocation', async (t) => {
    const identities = new PostgresIdentityRepository(pool),
        user = (await identities.register('ssh-owner', 'unused'))!;
    await identities.createSession(user.id, user.personalAccountId, 'ssh-session');
    const identity = (await identities.authenticateSession('ssh-session'))!;
    const credential = await identities.createKey(
        identity,
        'SSH',
        ['tools:run', 'account:read', 'resources:read', 'resources:write'],
        new Date(Date.now() + 60000).toISOString(),
    );
    const publicBaseUrl = 'https://kivel.example';
    const app = buildApp({
        publicBaseUrl,
        appBaseUrl: 'https://app.kivel.example',
        mailDomain: 'inbox.example.test',
        emailIngestSecret: 'test-ingest-secret',
        identityStore: identities,
        recoveryStore: new PostgresRecoveryRepository(pool),
        rateLimiter: new PostgresRateLimiter(pool),
    });
    const directory = await mkdtemp(join(tmpdir(), 'kivel-ssh-db-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const hostKey = await loadHostKey(join(directory, 'host_key')),
        parsed = utils.parseKey(hostKey);
    assert.ok(!(parsed instanceof Error));
    const hash = createHash('sha256').update(parsed.getPublicSSH()).digest('hex');
    const gateway = createSshServer(
        app,
        identities,
        new PostgresRateLimiter(pool),
        hostKey,
        publicBaseUrl,
    );
    await new Promise<void>((resolve) => gateway.server.listen(0, '127.0.0.1', resolve));
    const address = gateway.server.address();
    assert.ok(address && typeof address === 'object');
    const clients = new Set<SshClient>();
    t.after(async () => {
        for (const client of clients) client.destroy();
        await gateway.close();
        await app.close();
    });
    const connect = (fingerprint = hash) =>
        new Promise<SshClient>((resolve, reject) => {
            const client = new Client();
            clients.add(client);
            client.once('ready', () => resolve(client));
            client.once('error', (error) => {
                client.destroy();
                reject(error);
            });
            client.connect({
                host: '127.0.0.1',
                port: address.port,
                username: 'kivel',
                password: credential.key,
                hostHash: 'sha256',
                hostVerifier: (value: string) => value === fingerprint,
                readyTimeout: 5000,
            });
        });
    await assert.rejects(connect('0'.repeat(64)), /verification failed/);
    const client = await connect();
    const execute = (client: SshClient, cmd: string, input = '') =>
        new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
            client.exec(cmd, (error, stream) => {
                if (error) return reject(error);
                let stdout = '',
                    stderr = '';
                stream.on('data', (data: Buffer) => (stdout += data));
                stream.stderr.on('data', (data: Buffer) => (stderr += data));
                stream.on('close', (code: number) => resolve({ stdout, stderr, code }));
                stream.once('error', reject);
                stream.end(input);
            });
        });
    const response = await execute(client, 'kivel run json', '{"integer":9007199254740993}');
    assert.equal(response.code, 0);
    assert.match(JSON.parse(response.stdout).output, /9007199254740993/);
    assert.equal((await execute(client, 'kivel usage')).code, 0);
    const memory = await execute(client, 'kivel memory set ssh result', '{"success":true}');
    assert.equal(memory.code, 0, memory.stderr);
    const missing = await execute(client, 'kivel memory get ssh missing');
    assert.equal(missing.code, 1);
    assert.equal(JSON.parse(missing.stderr).status, 404);
    const remembered = await execute(client, 'kivel memory get ssh result');
    assert.deepEqual(JSON.parse(remembered.stdout).value, { success: true });
    const paid = await execute(client, 'kivel email create --local-part paid-name');
    assert.equal(paid.code, 1);
    assert.equal(paid.stdout, '');
    assert.equal(JSON.parse(paid.stderr).status, 402);
    assert.equal(JSON.parse(paid.stderr).requiredPlan, 'pro');
    assert.equal(JSON.parse(paid.stderr).upgradeUrl, `${publicBaseUrl}/pricing/`);
    const email = await execute(client, 'kivel email create');
    assert.equal(email.code, 0, email.stderr);
    const emailId = JSON.parse(email.stdout).id;
    assert.equal((await execute(client, `kivel email messages ${emailId}`)).code, 0);
    assert.equal((await execute(client, `kivel email delete ${emailId}`)).code, 0);
    const monitor = await execute(
        client,
        'kivel monitor create',
        '{"kind":"heartbeat","name":"SSH job","intervalSeconds":300}',
    );
    assert.equal(monitor.code, 0, monitor.stderr);
    const monitorId = JSON.parse(monitor.stdout).id;
    assert.equal((await execute(client, `kivel monitor pause ${monitorId}`)).code, 0);
    assert.equal((await execute(client, `kivel monitor delete ${monitorId}`)).code, 0);
    const approval = await execute(client, 'kivel approval ask', '{"question":"Proceed?"}');
    assert.equal(approval.code, 0, approval.stderr);
    assert.equal(JSON.parse(approval.stdout).status, 'pending');
    const mock = await execute(
        client,
        'kivel api POST /api/mocks',
        JSON.stringify({
            name: 'SSH CRUD fixture',
            routes: [],
            crud: { path: '/tasks', seed: [] },
        }),
    );
    assert.equal(mock.code, 0, mock.stderr);
    const mockId = JSON.parse(mock.stdout).id;
    const record = await execute(
        client,
        `kivel api POST /mock/${mockId}/tasks`,
        '{"id":"ssh","name":"SSH record"}',
    );
    assert.equal(record.code, 0, record.stderr);
    assert.equal(JSON.parse(record.stdout).id, 'ssh');
    const list = await execute(client, `kivel api GET /mock/${mockId}/tasks`);
    assert.equal(list.code, 0, list.stderr);
    assert.equal(JSON.parse(list.stdout).total, 1);
    assert.equal((await execute(client, `kivel api DELETE /api/mocks/${mockId}`)).code, 0);
    const echo = await execute(
        client,
        'kivel api POST /api/mocks',
        JSON.stringify({ name: 'SSH echo fixture', routes: [], echo: true }),
    );
    assert.equal(echo.code, 0, echo.stderr);
    const echoId = JSON.parse(echo.stdout).id;
    const observed = await execute(
        client,
        `kivel api POST /mock/${echoId}/check`,
        '{"event":"ssh.created"}',
    );
    assert.equal(observed.code, 0, observed.stderr);
    assert.equal(JSON.parse(observed.stdout).body.value.event, 'ssh.created');
    assert.equal(JSON.parse(observed.stdout).headers.authorization, '[REDACTED]');
    assert.ok(!observed.stdout.includes(credential.key));
    assert.equal((await execute(client, `kivel api DELETE /api/mocks/${echoId}`)).code, 0);
    client.end();
    const malicious = await connect();
    await assert.rejects(execute(malicious, 'cat /etc/passwd'), /Unable to exec/);
    malicious.end();
    const revoked = await connect();
    await identities.revokeKey(identity, credential.info.id);
    const denied = await execute(revoked, 'kivel usage');
    assert.equal(denied.code, 1);
    assert.match(denied.stderr, /revoked/);
    revoked.end();
    await assert.rejects(connect(), /authentication methods failed/);
});

test('private access hashes and token rotation remain isolated and atomic across replicas', async () => {
    const first = new PostgresResourceStore(pool),
        second = new PostgresResourceStore(pool);
    const allocation = {
        quotaKey: randomBytes(32).toString('hex'),
        plan: 'anonymous' as const,
        visibility: 'private' as const,
        maxUses: 3,
    };
    const file = (await first.create(
        'file',
        { name: 'private.txt', size: 6 },
        Buffer.from('secret'),
        allocation,
    ))!;
    assert.ok(file.accessToken);
    assert.notEqual(file.accessToken, file.managementToken);
    const stored = (
        await pool.query('SELECT access_token_hash FROM temporary_resources WHERE id = $1', [
            file.id,
        ])
    ).rows[0].access_token_hash;
    assert.equal(stored.length, 32);
    assert.notEqual(stored.toString(), file.accessToken);
    assert.equal(await second.use(file.id, 'file'), undefined);
    assert.equal(await second.peek(file.id, 'file', { token: file.managementToken }), undefined);
    assert.ok(await second.peek(file.id, 'file', { token: file.accessToken! }));
    const rotated = (await second.setSharing(file.id, 'file', file.managementToken, 'private'))!;
    assert.equal(
        await first.use(file.id, 'file', undefined, { token: file.accessToken! }),
        undefined,
    );
    const downloads = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
            (index % 2 ? first : second).use(file.id, 'file', undefined, {
                token: rotated.accessToken!,
            }),
        ),
    );
    assert.equal(downloads.filter(Boolean).length, 3);
    const inboxes = new PostgresInboxStore(pool),
        inbox = (await inboxes.create({
            ...allocation,
            quotaKey: randomBytes(32).toString('hex'),
        }))!;
    assert.equal(await inboxes.has(inbox.id), false);
    assert.equal((await inboxes.capture(inbox.id, input)).status, 'not-found');
    assert.equal(
        (await inboxes.capture(inbox.id, input, { token: inbox.accessToken! })).status,
        'captured',
    );
    const changed = (await inboxes.setSharing(inbox.id, inbox.inspectionToken, 'private'))!;
    assert.equal(
        (await inboxes.capture(inbox.id, input, { token: inbox.accessToken! })).status,
        'not-found',
    );
    assert.equal(
        (await inboxes.capture(inbox.id, input, { token: changed.accessToken! })).status,
        'captured',
    );
    await inboxes.setSharing(inbox.id, inbox.inspectionToken, 'public');
    assert.equal(await inboxes.has(inbox.id), true);
});

test('the final allowed download purges file contents and releases storage across replicas', async () => {
    const a = new PostgresResourceStore(pool),
        b = new PostgresResourceStore(pool),
        key = randomBytes(32).toString('hex');
    const data = Buffer.alloc(4096, 17);
    const file = (await a.create('file', { name: 'once.bin', size: data.length }, data, {
        quotaKey: key,
        plan: 'anonymous',
        visibility: 'private',
        maxUses: 1,
    }))!;
    const before = Number(
        (await pool.query('SELECT stored_bytes FROM resource_usage')).rows[0].stored_bytes,
    );
    const results = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
            (index % 2 ? a : b).use(file.id, 'file', undefined, { token: file.accessToken! }),
        ),
    );
    assert.equal(results.filter(Boolean).length, 1);
    assert.deepEqual(results.find(Boolean)!.data, data);
    assert.equal(
        (
            await pool.query(
                'SELECT octet_length(data) AS size FROM temporary_resources WHERE id = $1',
                [file.id],
            )
        ).rows[0].size,
        0,
    );
    assert.equal(
        Number((await pool.query('SELECT stored_bytes FROM resource_usage')).rows[0].stored_bytes),
        before - data.length,
    );
    assert.equal(
        Number(
            (
                await pool.query('SELECT stored_bytes FROM principal_usage WHERE key_hash = $1', [
                    Buffer.from(key, 'hex'),
                ])
            ).rows[0].stored_bytes,
        ),
        before - data.length,
    );
    assert.equal((await b.read(file.id, 'file', file.managementToken))?.uses, 1);
    assert.equal(await b.peek(file.id, 'file', { token: file.accessToken! }), undefined);
});

test('email verification, queued retries, and password resets stay atomic across replicas', async () => {
    const identities = new PostgresIdentityRepository(pool),
        a = new PostgresRecoveryRepository(pool),
        b = new PostgresRecoveryRepository(pool);
    const oldHash = await passwordHash('the-original-database-password');
    const user = (await identities.register('recovery-owner', oldHash))!;
    await identities.createSession(user.id, user.personalAccountId, 'original-session');
    const identity = (await identities.authenticateSession('original-session'))!;
    const key = await identities.createKey(
        identity,
        'before reset',
        ['account:read'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    await a.contact(user.id, 'signup@example.test');
    assert.equal((await b.status(user.id)).email, 'signup@example.test');
    assert.equal((await b.status(user.id)).verifiedAt, null);
    assert.equal(await b.recipient('signup@example.test'), undefined);
    const hash = Buffer.alloc(32, 7),
        email = 'verified@example.test';
    const value = {
        userId: user.id,
        email,
        passwordHash: oldHash,
        hash,
        expires: Date.now() + 900000,
        payload: Buffer.from('encrypted outbox payload'),
    };
    await a.issue({ ...value, purpose: 'verify' });
    assert.equal((await b.status(user.id)).pendingEmail, email);
    assert.equal(await b.recipient(email), undefined);
    const jobs = await Promise.all([a.claim(), b.claim()]);
    assert.equal(jobs.filter(Boolean).length, 1);
    const job = jobs.find(Boolean)!;
    await b.finish(job.id, false);
    await pool.query(
        "UPDATE auth_mail_outbox SET available_at = clock_timestamp() - interval '1 second'",
    );
    const retry = (await a.claim())!;
    assert.equal(retry.attempts, 2);
    await a.finish(retry.id, true);
    assert.equal(await b.consume(user.id, null, 'verify', Buffer.alloc(32)), false);
    assert.equal(await a.consume(user.id, null, 'verify', hash), true);
    assert.equal((await b.status(user.id)).email, email);
    assert.equal(await b.consume(user.id, null, 'verify', hash), false);
    await b.issue({ ...value, purpose: 'reset' });
    const nextHash = await passwordHash('the-replacement-database-password');
    const resets = await Promise.all([
        a.consume(null, email, 'reset', hash, nextHash),
        b.consume(null, email, 'reset', hash, nextHash),
    ]);
    assert.equal(resets.filter(Boolean).length, 1);
    assert.equal(await identities.authenticateSession('original-session'), undefined);
    assert.equal(await identities.authenticateKey(key.key), undefined);
    assert.equal(
        await identities.createSession(user.id, user.personalAccountId, 'stale', oldHash),
        false,
    );
    assert.equal(
        await identities.createSession(user.id, user.personalAccountId, 'fresh', nextHash),
        true,
    );
    assert.equal((await b.recipient(email))?.userId, user.id);
    assert.equal(
        (await pool.query('SELECT count(*) AS count FROM auth_challenges')).rows[0].count,
        '0',
    );
});

test('verified email changes preserve the old address until confirmation and cannot claim another account address', async () => {
    const identities = new PostgresIdentityRepository(pool),
        a = new PostgresRecoveryRepository(pool),
        b = new PostgresRecoveryRepository(pool);
    const users = await Promise.all(
        ['email-one', 'email-two'].map((name) =>
            identities.register(name, 'password-hash-for-repository-test'),
        ),
    );
    const hash = Buffer.alloc(32, 9);
    const issue = (index: number, email: string) =>
        a.issue({
            userId: users[index]!.id,
            email,
            passwordHash: 'password-hash-for-repository-test',
            purpose: 'verify',
            hash,
            expires: Date.now() + 900000,
            payload: Buffer.from('encrypted'),
        });
    for (let index = 0; index < 2; index++) {
        await issue(index, `original-${index}@example.test`);
        assert.equal(await a.consume(users[index]!.id, null, 'verify', hash), true);
    }
    await Promise.all([issue(0, 'same@example.test'), issue(1, 'same@example.test')]);
    assert.equal((await b.status(users[0]!.id)).email, 'original-0@example.test');
    const results = await Promise.all(
        users.map((user) => b.consume(user!.id, null, 'verify', hash)),
    );
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(
        (
            await pool.query(
                "SELECT count(*) AS count FROM user_recovery_emails WHERE email = 'same@example.test'",
            )
        ).rows[0].count,
        '1',
    );
});

test('Dodo checkout is serialized, reused, owner-only and does not grant access before reconciliation', async (t) => {
    const identities = new PostgresIdentityRepository(pool),
        recovery = new PostgresRecoveryRepository(pool);
    let customerCreates = 0,
        checkoutCreates = 0,
        portalCreates = 0,
        history = false,
        active = false,
        checkoutCreatedAt = new Date().toISOString();
    let checkoutPayload: Record<string, unknown> = {};
    const dodo = new DodoPayments({
        bearerToken: 'test-billing-key',
        environment: 'test_mode',
        maxRetries: 0,
        fetch: async (input, init) => {
            const url = new URL(String(input));
            if (url.pathname.startsWith('/products/'))
                return Response.json({
                    product_id: url.pathname.split('/').pop(),
                    is_recurring: true,
                    price: {
                        type: 'recurring_price',
                        price: url.pathname.endsWith('pdt_team') ? 600 : 200,
                        currency: 'USD',
                        payment_frequency_count: 1,
                        payment_frequency_interval: 'Month',
                        subscription_period_count: 20,
                        subscription_period_interval: 'Year',
                        trial_period_days: 0,
                    },
                });
            if (url.pathname === '/customers') {
                customerCreates++;
                return Response.json({ customer_id: 'cus_dodo' });
            }
            if (url.pathname === '/subscriptions' && url.searchParams.get('page_number') !== '1')
                return Response.json({ items: [] });
            if (url.pathname === '/subscriptions')
                return Response.json({
                    items: active
                        ? [{ status: 'active' }]
                        : history
                          ? [{ status: 'cancelled' }]
                          : [],
                });
            if (url.pathname === '/checkouts') {
                checkoutCreates++;
                checkoutPayload = JSON.parse(String(init?.body));
                return Response.json({
                    session_id: `cks_${checkoutCreates}`,
                    checkout_url: `https://checkout.dodopayments.com/session/${checkoutCreates}`,
                });
            }
            if (url.pathname.startsWith('/checkouts/'))
                return Response.json({
                    id: 'cks_1',
                    created_at: checkoutCreatedAt,
                    payment_status: history ? 'succeeded' : null,
                });
            if (url.pathname.endsWith('/customer-portal/session')) {
                portalCreates++;
                return Response.json({ link: 'https://customer.dodopayments.com/test' });
            }
            throw Error(`Unexpected provider path: ${url.pathname}`);
        },
    });
    const app = buildApp({
        identityStore: identities,
        recoveryStore: recovery,
        billingRepository: new BillingRepository(pool),
        billingConfig: {
            apiKey: 'test-billing-key',
            webhookSecret: 'whsec_dGVzdA==',
            environment: 'test_mode',
            proProduct: 'pdt_pro',
            teamProduct: 'pdt_team',
        },
        dodoClient: dodo,
    });
    t.after(() => app.close());
    const origin = 'http://localhost:3000';
    const registered = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username: 'dodo-owner',
            email: 'dodo@example.test',
            password: 'test-owner-billing-password',
        },
    });
    assert.equal(registered.statusCode, 201, registered.body);
    const cookie = String(registered.headers['set-cookie']).split(';')[0]!;
    const identity = (await identities.authenticateSession(cookie.split('=')[1]!))!;
    await pool.query('INSERT INTO user_recovery_emails (user_id,email) VALUES ($1,$2)', [
        identity.userId,
        'dodo@example.test',
    ]);
    const checkout = (plan = 'pro') =>
        app.inject({
            method: 'POST',
            url: '/api/billing/checkout',
            headers: { origin, cookie },
            payload: { plan },
        });
    const first = await Promise.all([checkout(), checkout()]);
    for (const response of first) {
        assert.equal(response.statusCode, 200, response.body);
        assert.equal(response.json().url, 'https://checkout.dodopayments.com/session/1');
    }
    assert.equal(customerCreates, 1);
    assert.equal(checkoutCreates, 1);
    assert.deepEqual(checkoutPayload.product_cart, [{ product_id: 'pdt_pro', quantity: 1 }]);
    assert.deepEqual(checkoutPayload.metadata, { accountId: identity.account.id });
    assert.equal((await identities.account(identity.account.id))!.plan, 'free');
    assert.equal((await checkout('team')).statusCode, 409);
    // An unpaid link older than Dodo keeps it open is replaced, not handed out again.
    checkoutCreatedAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const stale = await checkout();
    assert.equal(stale.json().url, 'https://checkout.dodopayments.com/session/2');
    assert.equal(checkoutCreates, 2);
    checkoutCreatedAt = new Date().toISOString();
    const portal = await app.inject({
        method: 'POST',
        url: '/api/billing/portal',
        headers: { origin, cookie },
    });
    assert.equal(portal.statusCode, 200, portal.body);
    assert.equal(portalCreates, 1);
    active = true;
    assert.equal((await checkout()).statusCode, 409);
    assert.equal(checkoutCreates, 2);
    active = false;
    history = true;
    assert.equal((await checkout()).statusCode, 200);
    assert.equal(checkoutCreates, 3);
    await pool.query("UPDATE account_members SET role='member' WHERE user_id=$1", [
        identity.userId,
    ]);
    assert.equal((await checkout()).statusCode, 403);
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/billing/portal',
                headers: { origin, cookie },
            })
        ).statusCode,
        403,
    );
    assert.equal(portalCreates, 1);
});

test('Dodo migration preserves legacy Stripe data without adopting its customer identifiers', async () => {
    const identities = new PostgresIdentityRepository(pool),
        user = (await identities.register('legacy-billing', 'unused'))!;
    await pool.query('UPDATE accounts SET stripe_customer_id=$1 WHERE id=$2', [
        'cus_legacy',
        user.personalAccountId,
    ]);
    await pool.query(
        'ALTER TABLE accounts DROP COLUMN phone_allowance, DROP COLUMN dodo_customer_id, DROP COLUMN dodo_subscription_id, DROP COLUMN dodo_event_created, DROP COLUMN dodo_checkout_id, DROP COLUMN dodo_checkout_url, DROP COLUMN dodo_checkout_plan; DROP TABLE dodo_events; ALTER TABLE inboxes DROP COLUMN response, DROP COLUMN forward_url; DROP TABLE phone_messages, phone_numbers, scheduled_jobs, email_send_jobs, email_sender_suspensions, email_suppressions, email_addresses, mock_calls, inbox_deliveries, email_messages, activity_log, kv_entries, monitor_events, monitors, cookie_coupons, approvals, agent_trials, agent_logins, agents; DELETE FROM schema_migrations WHERE version >= 8',
    );
    await Promise.all([migrate(pool), migrate(pool)]);
    const row = (
        await pool.query('SELECT stripe_customer_id,dodo_customer_id FROM accounts WHERE id=$1', [
            user.personalAccountId,
        ])
    ).rows[0];
    assert.equal(row.stripe_customer_id, 'cus_legacy');
    assert.equal(row.dodo_customer_id, null);
    assert.equal((await identities.account(user.personalAccountId))!.customerId, null);
});

test('custom inbox responses persist, apply to captures and reset', async () => {
    const store = new PostgresInboxStore(pool);
    const inbox = (await store.create())!;
    const response = {
        status: 201,
        contentType: 'text/plain',
        body: 'ok',
        headers: { 'x-test': '1' },
        delayMs: 0,
    };
    assert.equal(await store.setResponse(inbox.id, 'wrong-token', response), false);
    assert.equal(await store.setResponse(inbox.id, inbox.inspectionToken, response), true);
    assert.deepEqual((await store.info(inbox.id, inbox.inspectionToken))?.response, response);
    const captured = await store.capture(inbox.id, input, { token: inbox.accessToken! });
    assert.equal(captured.status, 'captured');
    assert.deepEqual(captured.status === 'captured' && captured.response, response);
    assert.equal(await store.setResponse(inbox.id, inbox.inspectionToken, null), true);
    assert.equal((await store.info(inbox.id, inbox.inspectionToken))?.response, undefined);
});

test('mock call logs keep only the newest calls for existing mocks and go with the mock', async () => {
    const resources = new PostgresResourceStore(pool);
    const calls = new PostgresMockCalls(pool);
    const mock = (await resources.create('mock', { name: 'Log', routes: [] }))!;
    const call = (index: number) => ({
        at: new Date().toISOString(),
        method: 'GET',
        path: `/${index}`,
        query: {},
        status: 200,
        durationMs: 1,
        bodySize: 0,
    });
    for (let index = 0; index < 105; index++) await calls.record(mock.id, call(index));
    const listed = await calls.list(mock.id);
    assert.equal(listed.length, 100);
    assert.equal(listed[0]!.path, '/5');
    assert.equal(listed.at(-1)!.path, '/104');
    await calls.record('00000000-0000-4000-8000-000000000000', call(0));
    assert.equal((await calls.list('00000000-0000-4000-8000-000000000000')).length, 0);
    await resources.delete(mock.id, 'mock', mock.managementToken);
    assert.equal((await calls.list(mock.id)).length, 0);
});

test('inbox forwarding settings and delivery logs persist and keep the newest entries', async () => {
    const store = new PostgresInboxStore(pool);
    const inbox = (await store.create())!;
    assert.equal(
        await store.setForward(inbox.id, inbox.inspectionToken, 'https://example.com/'),
        true,
    );
    const captured = await store.capture(inbox.id, input, { token: inbox.accessToken! });
    assert.equal(captured.status === 'captured' && captured.forwardUrl, 'https://example.com/');
    for (let index = 0; index < 103; index++)
        await store.recordDelivery(inbox.id, {
            requestId: String(index),
            at: new Date().toISOString(),
            attempts: 1,
            status: 200,
            durationMs: 1,
        });
    const deliveries = (await store.listDeliveries(inbox.id, inbox.inspectionToken))!;
    assert.equal(deliveries.length, 100);
    assert.equal(deliveries[0]!.requestId, '3');
    assert.equal(await store.listDeliveries(inbox.id, 'wrong'), undefined);
    assert.equal(await store.setForward(inbox.id, inbox.inspectionToken, null), true);
    assert.equal((await store.info(inbox.id, inbox.inspectionToken))?.forwardUrl, undefined);
});

test('email messages persist per inbox, stop at the limit and go with the inbox', async () => {
    const resources = new PostgresResourceStore(pool);
    const messages = new PostgresEmailMessages(pool);
    const inbox = (await resources.create('email', {}, undefined))!;
    const message = (index: number) => ({
        id: String(index),
        receivedAt: new Date().toISOString(),
        from: 'a@b.test',
        to: 'x@socketspace.xyz',
        subject: 'Hi',
        text: 'code 123456',
        codes: ['123456'],
        links: [],
        attachments: [],
    });
    for (let index = 0; index < 100; index++)
        assert.equal(await messages.record(inbox.id, message(index)), 'stored');
    assert.equal(await messages.record(inbox.id, message(100)), 'full');
    assert.equal(await messages.count(inbox.id), 100);
    assert.equal((await messages.list(inbox.id))[0]!.id, '0');
    assert.equal(await messages.record('00000000-0000-4000-8000-000000000000', message(0)), 'full');
    await resources.delete(inbox.id, 'email', inbox.managementToken);
    assert.equal(await messages.count(inbox.id), 0);
});

test('workspace activity keeps the newest 500 entries, newest first', async () => {
    const identities = new PostgresIdentityRepository(pool);
    const user = (await identities.register(
        'activity-owner',
        await passwordHash('correct-horse-battery-staple'),
    ))!;
    const activity = new PostgresActivity(pool);
    for (let index = 0; index < 503; index++)
        await activity.record(user.personalAccountId, {
            at: new Date().toISOString(),
            tool: `tool_${index}`,
            ok: true,
            durationMs: 1,
        });
    const entries = await activity.list(user.personalAccountId);
    assert.equal(entries.length, 500);
    assert.equal(entries[0]!.tool, 'tool_502');
    assert.equal(entries.at(-1)!.tool, 'tool_3');
});

test('agent memory enforces the account allowance, expires values and lists by prefix', async () => {
    const identities = new PostgresIdentityRepository(pool);
    const user = (await identities.register(
        'memory-owner',
        await passwordHash('correct-horse-battery-staple'),
    ))!;
    const kv = new PostgresKv(pool);
    const account = user.personalAccountId;
    const entry = (key: string, bytes: number, expiresAt?: string) => ({
        namespace: 'ns',
        key,
        value: 'x',
        bytes,
        ...(expiresAt ? { expiresAt } : {}),
    });
    const max = plans.free.memoryBytes;
    await kv.set(account, entry('a/1', max - 40), 'free');
    await assert.rejects(kv.set(account, entry('a/2', 50), 'free'), {
        limit: 'memory.bytes',
        statusCode: 402,
        used: max - 40,
    });
    await kv.set(account, entry('a/1', max - 10), 'free');
    assert.equal(await kv.usage(account), max - 10);
    await kv.set(account, entry('b/old', 5, new Date(Date.now() - 1000).toISOString()), 'free');
    assert.equal(await kv.get(account, 'ns', 'b/old'), undefined);
    assert.deepEqual(
        (await kv.list(account, 'ns', 'a/')).map((item) => item.key),
        ['a/1'],
    );
    await kv.deleteExpired();
    assert.equal(await kv.usage(account), max - 10);
    assert.equal(await kv.delete(account, 'ns', 'a/1'), true);
    assert.equal(await kv.usage(account), 0);
});

test('monitors are claimed once when due, found by ping hash and keep 50 events', async () => {
    const identities = new PostgresIdentityRepository(pool);
    const user = (await identities.register(
        'monitor-owner',
        await passwordHash('correct-horse-battery-staple'),
    ))!;
    const store = new PostgresMonitors(pool);
    const base = {
        accountId: user.personalAccountId,
        kind: 'http' as const,
        name: 'Site',
        target: 'https://example.com/',
        intervalSeconds: 300,
        graceSeconds: 60,
        paused: false,
        status: 'pending' as const,
        failures: 0,
        createdAt: new Date().toISOString(),
        nextRunAt: new Date(Date.now() - 1000).toISOString(),
    };
    const id = crypto.randomUUID();
    await store.create({ ...base, id }, 'free', 'ping-hash');
    const [first, second] = await Promise.all([store.claimDue(10), store.claimDue(10)]);
    assert.equal(first.length + second.length, 1);
    assert.equal((await store.claimDue(10)).length, 0);
    assert.equal((await store.byPing('ping-hash'))?.id, id);
    await store.save({
        ...base,
        id,
        status: 'up',
        nextRunAt: new Date(Date.now() - 1000).toISOString(),
    });
    assert.equal((await store.get(user.personalAccountId, id))?.status, 'up');
    assert.equal(await store.setPaused(user.personalAccountId, id, true), true);
    assert.equal((await store.claimDue(10)).length, 0);
    for (let index = 0; index < 55; index++)
        await store.addEvent(id, {
            at: new Date().toISOString(),
            status: 'up',
            message: String(index),
        });
    const events = await store.events(id);
    assert.equal(events.length, 50);
    assert.equal(events[0]!.message, '54');
    assert.equal(await store.count(user.personalAccountId), 1);
    assert.equal(await store.delete(user.personalAccountId, id), true);
    assert.equal((await store.events(id)).length, 0);
});

test('agent logins are found by code or device and can be answered only once', async () => {
    const store = new PostgresAgents(pool);
    const now = Date.now();
    const login = {
        id: crypto.randomUUID(),
        deviceHash: 'd'.repeat(64),
        userCode: 'BCDF-2345',
        name: 'Claude Code',
        client: 'cli',
        status: 'pending' as const,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 900000).toISOString(),
    };
    await store.createLogin(login);
    assert.equal((await store.loginByCode('BCDF-2345'))?.name, 'Claude Code');
    assert.equal((await store.loginByDevice('d'.repeat(64)))?.id, login.id);
    const [first, second] = await Promise.all([
        store.settle(login.id, { status: 'denied' }),
        store.settle(login.id, { status: 'denied' }),
    ]);
    assert.equal(Number(first) + Number(second), 1);
    assert.equal((await store.loginByCode('BCDF-2345'))?.status, 'denied');
    assert.equal(
        await store.settle(login.id, { status: 'delivered', sealedKey: undefined }, 'approved'),
        false,
    );
});

test('agent trials resolve by token until they expire and count toward the network cap', async () => {
    const store = new PostgresAgents(pool);
    const now = Date.now();
    const login = {
        id: crypto.randomUUID(),
        deviceHash: 'e'.repeat(64),
        userCode: 'CDFG-3456',
        name: 'Trial bot',
        status: 'pending' as const,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 3600000).toISOString(),
    };
    await store.createLogin(login);
    const trial = (id: string, token: string, expiresAt: number) => ({
        id,
        tokenHash: token,
        loginId: login.id,
        ipKey: 'network-a',
        name: 'Trial bot',
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
    });
    await store.createTrial(trial(crypto.randomUUID(), 'live-token', now + 3600000));
    await store.createTrial(trial(crypto.randomUUID(), 'old-token', now - 1000));
    assert.equal((await store.trialByToken('live-token'))?.name, 'Trial bot');
    assert.equal(await store.trialByToken('old-token'), undefined);
    assert.equal(await store.trialRetryAfter('network-a'), 0);
    await store.createTrial(trial(crypto.randomUUID(), 'third-token', now + 3600000));
    assert.ok((await store.trialRetryAfter('network-a')) > 86390);
    assert.equal(await store.trialRetryAfter('network-b'), 0);
    await store.deleteExpired();
    assert.ok((await store.trialRetryAfter('network-a')) > 86390);
});

test('approvals are answered once and never after they expire', async () => {
    const identities = new PostgresIdentityRepository(pool);
    const user = (await identities.register(
        'approval-owner',
        await passwordHash('correct-horse-battery-staple'),
    ))!;
    const store = new PostgresApprovals(pool);
    const accountId = user.personalAccountId;
    const approval = (expiresAt: number) => ({
        id: crypto.randomUUID(),
        accountId,
        agentName: 'Claude Code',
        question: 'Deploy?',
        options: ['Approve', 'Deny'],
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
    });
    const live = approval(Date.now() + 60000),
        stale = approval(Date.now() - 1000);
    await store.create(live);
    await store.create(stale);
    assert.equal((await store.get(accountId, stale.id))?.status, 'expired');
    assert.deepEqual(
        (await store.list(accountId, true)).map((item) => item.id),
        [live.id],
    );
    assert.equal(await store.countSince(accountId, new Date(Date.now() - 60000).toISOString()), 2);
    const answer = { answer: 'Approve', note: 'ok', answeredBy: 'approval-owner' };
    assert.equal(await store.answer(accountId, stale.id, answer), false);
    assert.equal(await store.answer(crypto.randomUUID(), live.id, answer), false);
    const results = await Promise.all([
        store.answer(accountId, live.id, answer),
        store.answer(accountId, live.id, { ...answer, answer: 'Deny' }),
    ]);
    assert.deepEqual(results.sort(), [false, true]);
    const stored = (await store.get(accountId, live.id))!;
    assert.equal(stored.status, 'answered');
    assert.equal(stored.answeredBy, 'approval-owner');
    assert.ok(stored.answeredAt);
    assert.deepEqual(await store.list(accountId, true), []);
});

test('the cookie coupon is created once per person, only before a first subscription, and applied to its first checkout', async (t) => {
    const identities = new PostgresIdentityRepository(pool),
        recovery = new PostgresRecoveryRepository(pool);
    let discounts = 0;
    let discountPayload: Record<string, unknown> = {};
    let checkoutPayload: Record<string, unknown> = {};
    const dodo = new DodoPayments({
        bearerToken: 'test-billing-key',
        environment: 'test_mode',
        maxRetries: 0,
        fetch: async (input, init) => {
            const url = new URL(String(input));
            if (url.pathname.startsWith('/products/'))
                return Response.json({
                    product_id: url.pathname.split('/').pop(),
                    is_recurring: true,
                    price: {
                        type: 'recurring_price',
                        price: url.pathname.endsWith('pdt_team') ? 600 : 200,
                        currency: 'USD',
                        payment_frequency_count: 1,
                        payment_frequency_interval: 'Month',
                        subscription_period_count: 20,
                        subscription_period_interval: 'Year',
                        trial_period_days: 0,
                    },
                });
            if (url.pathname === '/discounts') {
                discounts++;
                discountPayload = JSON.parse(String(init?.body));
                // Slow enough that two claims overlap.
                await new Promise((resolve) => setTimeout(resolve, 50));
                return Response.json({
                    discount_id: `dsc_${discounts}`,
                    code: discountPayload.code,
                });
            }
            if (url.pathname === '/customers') return Response.json({ customer_id: 'cus_cookie' });
            if (url.pathname === '/subscriptions') return Response.json({ items: [] });
            if (url.pathname === '/checkouts') {
                checkoutPayload = JSON.parse(String(init?.body));
                return Response.json({
                    session_id: 'cks_cookie',
                    checkout_url: 'https://checkout.dodopayments.com/session/cookie',
                });
            }
            throw Error(`Unexpected provider path: ${url.pathname}`);
        },
    });
    const app = buildApp({
        identityStore: identities,
        recoveryStore: recovery,
        billingRepository: new BillingRepository(pool),
        billingConfig: {
            apiKey: 'test-billing-key',
            webhookSecret: 'whsec_dGVzdA==',
            environment: 'test_mode',
            proProduct: 'pdt_pro',
            teamProduct: 'pdt_team',
        },
        dodoClient: dodo,
    });
    t.after(() => app.close());
    const origin = 'http://localhost:3000';
    const registered = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username: 'cookie-eater',
            email: 'cookie@example.test',
            password: 'crunchy-cookie-pass',
        },
    });
    const cookie = String(registered.headers['set-cookie']).split(';')[0]!;
    const identity = (await identities.authenticateSession(cookie.split('=')[1]!))!;
    const claim = () =>
        app.inject({ method: 'POST', url: '/api/coupons/cookie', headers: { origin, cookie } });

    assert.equal(
        (await app.inject({ method: 'POST', url: '/api/coupons/cookie', headers: { origin } }))
            .statusCode,
        401,
    );
    const [one, two] = await Promise.all([claim(), claim()]);
    assert.equal(one.statusCode, 200, one.body);
    assert.equal(two.statusCode, 200, two.body);
    assert.equal(discounts, 1);
    assert.equal(one.json().code, two.json().code);
    assert.match(one.json().code, /^COOKIE[0-9A-F]{8}$/);
    assert.equal(one.json().percent, 10);
    assert.equal(discountPayload.amount, 1000);
    assert.equal(discountPayload.usage_limit, 1);
    assert.equal(discountPayload.customer_eligibility, 'first_time');
    assert.deepEqual(discountPayload.restricted_to, ['pdt_pro', 'pdt_team']);

    await pool.query(
        'INSERT INTO user_recovery_emails (user_id, email, verified_at) VALUES ($1, $2, now())',
        [identity.userId, 'cookie@example.test'],
    );
    const checkout = await app.inject({
        method: 'POST',
        url: '/api/billing/checkout',
        headers: { origin, cookie },
        payload: { plan: 'pro' },
    });
    assert.equal(checkout.statusCode, 200, checkout.body);
    assert.deepEqual(checkoutPayload.discount_codes, [one.json().code]);

    // Someone else whose workspace already pays cannot claim one.
    const paid = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username: 'already-paying',
            email: 'paid@example.test',
            password: 'already-paying-pass',
        },
    });
    const paidCookie = String(paid.headers['set-cookie']).split(';')[0]!;
    const paidIdentity = (await identities.authenticateSession(paidCookie.split('=')[1]!))!;
    await pool.query(
        "UPDATE accounts SET plan = 'pro', dodo_subscription_id = 'sub_1' WHERE id = $1",
        [paidIdentity.account.id],
    );
    const refused = await app.inject({
        method: 'POST',
        url: '/api/coupons/cookie',
        headers: { origin, cookie: paidCookie },
    });
    assert.equal(refused.statusCode, 409);
    assert.equal(discounts, 1);
});

test('owned email survives repository restarts, enforces limits across replicas and never reissues deleted addresses', async (t) => {
    const identities = new PostgresIdentityRepository(pool);
    const user = (await identities.register('durable-email', 'test-hash'))!;
    const session = randomBytes(32).toString('base64url');
    await identities.createSession(user.id, user.personalAccountId, session);
    const identity = (await identities.authenticateSession(session))!;
    const key = await identities.createKey(
        identity,
        'Email integration',
        ['resources:write', 'resources:read'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    const options = {
        identityStore: identities,
        recoveryStore: new PostgresRecoveryRepository(pool),
        resourceStore: new PostgresResourceStore(pool),
        emailMessages: new PostgresEmailMessages(pool),
        emailAddresses: new PostgresEmailAddresses(pool),
        mailDomain: 'socketspace.xyz',
        emailIngestSecret: 'x'.repeat(40),
    };
    const apps = [
        buildApp(options),
        buildApp({
            ...options,
            emailAddresses: new PostgresEmailAddresses(pool),
            resourceStore: new PostgresResourceStore(pool),
        }),
    ];
    t.after(async () => {
        await Promise.all(apps.map((app) => app.close()));
    });
    const headers = { authorization: `Bearer ${key.key}` };
    const created = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
            apps[index % 2]!.inject({ method: 'POST', url: '/api/email-inboxes', headers }),
        ),
    );
    assert.equal(
        created.filter((response) => response.statusCode === 201).length,
        1,
        created.map((response) => response.body).join('\n'),
    );
    const first = created.find((response) => response.statusCode === 201)!.json();
    await identities.setEntitlement(
        identity.account.id,
        'pro',
        new Date(Date.now() + 86400000).toISOString(),
    );
    const upgraded = await apps[1]!.inject({ url: `/api/email-inboxes/${first.id}`, headers });
    assert.equal(upgraded.json().expiresAt, null, upgraded.body);
    const custom = await apps[0]!.inject({
        method: 'POST',
        url: '/api/email-inboxes',
        headers,
        payload: { localPart: 'durable-qa-bot' },
    });
    assert.equal(custom.statusCode, 201, custom.body);
    const row = await new PostgresEmailAddresses(pool).find('durable-qa-bot@socketspace.xyz');
    assert.equal(row?.resourceId, custom.json().id);
    const restarted = buildApp({
        ...options,
        emailAddresses: new PostgresEmailAddresses(pool),
        resourceStore: new PostgresResourceStore(pool),
    });
    t.after(() => restarted.close());
    assert.equal(
        (await restarted.inject({ url: `/api/email-inboxes/${custom.json().id}`, headers })).json()
            .address,
        row!.address,
    );
    await restarted.inject({
        method: 'DELETE',
        url: `/api/email-inboxes/${custom.json().id}`,
        headers,
    });
    assert.equal(
        (
            await apps[0]!.inject({
                method: 'POST',
                url: '/api/email-inboxes',
                headers,
                payload: { localPart: 'durable-qa-bot' },
            })
        ).statusCode,
        409,
    );
    assert.ok((await new PostgresEmailAddresses(pool).find(row!.address))!.retiredAt);
    await identities.setEntitlement(
        identity.account.id,
        'pro',
        new Date(Date.now() - 31 * 86400000).toISOString(),
    );
    await new EmailLifecycle(
        new PostgresEmailAddresses(pool),
        new PostgresResourceStore(pool),
        identities,
        new PostgresEmailMessages(pool),
    ).reconcile();
    assert.ok((await new PostgresEmailAddresses(pool).find(first.address))!.retiredAt);
});

test('email send reservations serialize across replicas and persist retry keys, suppression and suspension', async () => {
    const stores = [new PostgresEmailSending(pool), new PostgresEmailSending(pool)];
    const owner = '11111111-1111-4111-8111-111111111111';
    const attempts = await Promise.all(
        Array.from({ length: 15 }, (_, index) =>
            stores[index % 2]!.withOwner(owner, async (session) => {
                if ((await session.usage()) >= 3) return false;
                await session.save(
                    newSendJob({
                        ownerId: owner,
                        inboxId: '22222222-2222-4222-8222-222222222222',
                        key: `request-${index}`,
                        hash: 'content-hash',
                        recipients: [{ address: 'recipient@example.com' }],
                    }),
                );
                return true;
            }),
        ),
    );
    assert.equal(attempts.filter(Boolean).length, 3);
    // Which three requests win the race varies; continue with one that did.
    const sent = `request-${attempts.indexOf(true)}`;
    await stores[0]!.withOwner(owner, async (session) => {
        const old = newSendJob({
            ownerId: owner,
            inboxId: '22222222-2222-4222-8222-222222222222',
            key: 'old-reputation',
            hash: 'old',
            recipients: Array.from({ length: 30 }, () => ({
                address: 'old@example.com',
                providerId: 'old',
                bounced: true,
            })),
        });
        old.createdAt = new Date(Date.now() - 31 * 86400000).toISOString();
        old.status = 'sent';
        await session.save(old);
        const job = (await session.job(sent))!;
        assert.ok(job);
        job.recipients[0]!.providerId = 'provider-accepted';
        job.recipients[0]!.bounced = true;
        job.status = 'sent';
        await session.save(job);
        await session.suppress('recipient@example.com', 'bounce');
        await session.suspend('Bounce rate exceeds 5%');
    });
    const restarted = new PostgresEmailSending(pool);
    await restarted.withOwner(owner, async (session) => {
        assert.equal(await session.usage(), 3);
        assert.equal((await session.job(sent))!.recipients[0]!.providerId, 'provider-accepted');
        assert.deepEqual(await session.reputation(), {
            sent: 1,
            bounced: 1,
            suspended: 'Bounce rate exceeds 5%',
        });
        assert.equal(await session.blocked('recipient@example.com'), true);
        await session.suppress('optout@example.com', 'unsubscribe');
    });
    await restarted.withOwner('33333333-3333-4333-8333-333333333333', async (session) => {
        assert.equal(await session.blocked('recipient@example.com'), true);
        assert.equal(await session.blocked('optout@example.com'), false);
        assert.equal(await session.usage(), 0);
    });
    await liftEmailSuspension(restarted, owner);
    await restarted.withOwner(owner, async (session) => {
        assert.equal((await session.reputation()).suspended, null);
        assert.equal(await session.blocked('recipient@example.com'), true);
    });
});

test('paid renewals preserve excess inbox pause deadlines after a Team-to-Pro downgrade', async (t) => {
    const identities = new PostgresIdentityRepository(pool),
        user = (await identities.register('inbox-renewals', 'test'))!;
    const token = randomBytes(32).toString('base64url');
    await identities.createSession(user.id, user.personalAccountId, token);
    const identity = (await identities.authenticateSession(token))!;
    const until = new Date(Date.now() + 86400000).toISOString();
    await identities.setEntitlement(identity.account.id, 'team', until);
    const key = await identities.createKey(
        identity,
        'Renewals',
        ['resources:read', 'resources:write'],
        until,
    );
    const resources = new PostgresResourceStore(pool),
        addresses = new PostgresEmailAddresses(pool),
        messages = new PostgresEmailMessages(pool);
    const app = buildApp({
        identityStore: identities,
        recoveryStore: new PostgresRecoveryRepository(pool),
        resourceStore: resources,
        emailAddresses: addresses,
        emailMessages: messages,
        mailDomain: 'socketspace.xyz',
        emailIngestSecret: 'x'.repeat(40),
    });
    t.after(() => app.close());
    for (let index = 0; index < 12; index++) {
        const response = await app.inject({
            method: 'POST',
            url: '/api/email-inboxes',
            headers: { authorization: `Bearer ${key.key}` },
        });
        assert.equal(response.statusCode, 201, response.body);
    }
    await identities.setEntitlement(identity.account.id, 'pro', until);
    const lifecycle = new EmailLifecycle(addresses, resources, identities, messages);
    await lifecycle.reconcile(identity.account.id);
    const pausedAt = new Date(Date.now() - 10 * 86400000).toISOString(),
        expiresAt = new Date(Date.now() + 20 * 86400000).toISOString();
    await pool.query(
        'UPDATE email_addresses SET paused_at=$2,expires_at=$3 WHERE owner_id=$1 AND paused_at IS NOT NULL',
        [identity.account.id, pausedAt, expiresAt],
    );
    await pool.query(
        'UPDATE temporary_resources SET expires_at=$2 WHERE id IN(SELECT resource_id FROM email_addresses WHERE owner_id=$1 AND paused_at IS NOT NULL)',
        [identity.account.id, expiresAt],
    );
    await pool.query('UPDATE accounts SET dodo_customer_id=$2 WHERE id=$1', [
        identity.account.id,
        'cus_renewals',
    ]);
    const billing = new BillingRepository(pool);
    const renew = () =>
        billing.process(
            `renew-${randomBytes(8).toString('hex')}`,
            Date.now(),
            'cus_renewals',
            async () => ({
                id: 'sub_renewals',
                customerId: 'cus_renewals',
                accountId: identity.account.id,
                plan: 'pro',
                validUntil: until,
            }),
        );
    await renew();
    await lifecycle.reconcile(identity.account.id);
    await renew();
    const rows = await addresses.list(identity.account.id),
        paused = rows.filter((row) => row.pausedAt);
    assert.equal(rows.length, 12);
    assert.equal(paused.length, 2);
    for (const row of paused) {
        assert.equal(row.pausedAt, pausedAt);
        assert.equal(row.expiresAt, expiresAt);
        assert.equal(
            (await resources.read(row.resourceId!, 'email', '', identity.account.id))!.expiresAt,
            expiresAt,
        );
    }
    await pool.query(
        "UPDATE email_addresses SET expires_at=clock_timestamp()-interval '1 second' WHERE owner_id=$1 AND paused_at IS NOT NULL",
        [identity.account.id],
    );
    await renew();
    await lifecycle.reconcile(identity.account.id);
    assert.equal((await addresses.list(identity.account.id)).length, 10);
});

test('scheduled-job claims use durable fenced leases across replicas and cascade on resource deletion', async () => {
    const { PostgresJobs } = await import('./scheduled-jobs.js');
    const identities = new PostgresIdentityRepository(pool),
        user = (await identities.register('job-storage', 'test-hash'))!,
        account = (await identities.account(user.personalAccountId))!;
    const resources = new PostgresResourceStore(pool),
        created = (await resources.create('job', { name: 'Durable callback' }, undefined, {
            ownerId: account.id,
            quotaKey: account.quotaKey,
            plan: 'free',
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
        }))!;
    const a = new PostgresJobs(pool),
        b = new PostgresJobs(pool),
        now = Date.now();
    const job = {
        id: created.id,
        ownerId: account.id,
        name: 'Durable callback',
        url: 'https://example.com/hook',
        body: { event: 'ready' },
        nextRunAt: new Date(now - 1).toISOString(),
        intervalSeconds: null,
        remaining: 1,
        run: 0,
        attempt: 0,
        status: 'scheduled' as const,
        expiresAt: created.expiresAt,
        events: [],
    };
    await a.create(job);
    const claims = await Promise.all([a.claim(now), b.claim(now)]),
        first = claims.find(Boolean)!;
    assert.equal(claims.filter(Boolean).length, 1);
    await pool.query(
        "UPDATE scheduled_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
        [job.id],
    );
    const second = (await b.claim(Date.now()))!;
    await a.finish({ ...job, status: 'completed', nextRunAt: null }, first.lease);
    assert.equal((await b.get(job.id))?.status, 'scheduled');
    await b.finish({ ...job, status: 'completed', nextRunAt: null }, second.lease);
    assert.equal((await a.get(job.id))?.status, 'completed');
    await resources.delete(job.id, 'job', '', account.id);
    assert.equal(await a.get(job.id), undefined);
});

test('email bytes share workspace/global budgets, survive metadata updates and migrate existing stored messages', async () => {
    const identities = new PostgresIdentityRepository(pool),
        user = (await identities.register('mail-storage', 'test-hash'))!,
        account = (await identities.account(user.personalAccountId))!;
    const resources = new PostgresResourceStore(pool),
        created = (await resources.create('email', { name: 'Owned inbox' }, undefined, {
            ownerId: account.id,
            quotaKey: account.quotaKey,
            plan: 'free',
        }))!;
    const before = (await resources.read(created.id, 'email', '', account.id))!.storedBytes;
    const messages = new PostgresEmailMessages(pool),
        message = {
            id: 'message-id',
            receivedAt: new Date().toISOString(),
            from: 'sender@example.com',
            to: 'agent@socketspace.xyz',
            subject: 'Test',
            text: 'Test body',
            codes: [],
            links: [],
            attachments: [],
        };
    assert.equal(
        await new PostgresEmailMessages(pool, before + 1).record(created.id, message),
        'full',
    );
    assert.equal((await messages.list(created.id)).length, 0);
    assert.equal(await messages.record(created.id, message), 'stored');
    const stored = (await resources.read(created.id, 'email', '', account.id))!.storedBytes;
    assert.ok(stored > before);
    await resources.update(
        created.id,
        'email',
        '',
        { name: 'Owned inbox', forwardingUrl: 'https://example.com/hook' },
        account.id,
    );
    const renamed = (await resources.read(created.id, 'email', '', account.id))!.storedBytes;
    assert.ok(renamed > stored);
    const original = (await pool.query("SELECT settings FROM usage_plans WHERE id='free'")).rows[0]
        .settings;
    try {
        await pool.query(
            "UPDATE usage_plans SET settings=jsonb_set(settings,'{storageBytes}',$1::jsonb) WHERE id='free'",
            [String(renamed + 1)],
        );
        assert.equal(await messages.record(created.id, { ...message, id: 'over-quota' }), 'full');
        assert.equal((await messages.list(created.id)).length, 1);
        assert.equal(
            Number(
                (await pool.query('SELECT stored_bytes FROM resource_usage')).rows[0].stored_bytes,
            ),
            renamed,
        );
    } finally {
        await pool.query("UPDATE usage_plans SET settings=$1 WHERE id='free'", [original]);
    }
    await messages.replace(created.id, message.id, {
        ...message,
        direction: 'outbound',
        deliveryStatus: 'sent',
    });
    await messages.delete(created.id);
    const empty = (await resources.read(created.id, 'email', '', account.id))!.storedBytes;
    assert.ok(empty < renamed);
    await pool.query(
        'ALTER TABLE email_messages DROP COLUMN stored_bytes; DELETE FROM schema_migrations WHERE version=19',
    );
    await pool.query('INSERT INTO email_messages(resource_id,message) VALUES($1,$2)', [
        created.id,
        message,
    ]);
    await migrate(pool);
    assert.ok((await resources.read(created.id, 'email', '', account.id))!.storedBytes > empty);
    await resources.delete(created.id, 'email', '', account.id);
    assert.equal(
        Number((await pool.query('SELECT stored_bytes FROM resource_usage')).rows[0].stored_bytes),
        0,
    );
    assert.equal(
        Number(
            (
                await pool.query('SELECT stored_bytes FROM principal_usage WHERE account_id=$1', [
                    account.id,
                ])
            ).rows[0].stored_bytes,
        ),
        0,
    );
});

test('phone order ownership and SMS deduplication persist across repositories and retain release records', async () => {
    const { PostgresPhones, newPhone } = await import('./phone/store.js');
    const a = new PostgresPhones(pool),
        b = new PostgresPhones(pool),
        owner = '11111111-1111-4111-8111-111111111111';
    const results = await Promise.all(
        [a, b].map((store, index) =>
            store.withOwner(owner, async (session) => {
                if ((await session.list()).length) return false;
                await session.save(newPhone(owner, `+1212555012${index}`, 'purchase-reference'));
                return true;
            }),
        ),
    );
    assert.equal(results.filter(Boolean).length, 1);
    const phone = (await a.withOwner(owner, (session) => session.list()))[0]!;
    const sms = {
        id: 'telnyx-event',
        at: new Date().toISOString(),
        from: '+12125550111',
        to: phone.number,
        text: 'Code 123456',
    };
    await Promise.all(
        [a, b].map((store) => store.withOwner(owner, (session) => session.record(phone.id, sms))),
    );
    assert.equal((await b.withOwner(owner, (session) => session.sms(phone.id))).length, 1);
    await b.withOwner(owner, async (session) => {
        phone.state = 'released';
        await session.save(phone);
    });
    assert.equal((await a.find(phone.number))?.state, 'released');
    assert.equal((await a.owners()).includes(owner), false);
});

test('rollback baseline accepts schema 20 and rejects unknown future schemas', async () => {
    const originalVersion = (
        await pool.query('SELECT max(version) AS version FROM schema_migrations')
    ).rows[0].version;
    try {
        await pool.query(
            'INSERT INTO schema_migrations (version) VALUES (20) ON CONFLICT DO NOTHING',
        );
        await migrate(pool);
        assert.equal(
            (await pool.query('SELECT max(version) AS version FROM schema_migrations')).rows[0]
                .version,
            20,
        );
        await pool.query('INSERT INTO schema_migrations (version) VALUES (21)');
        await assert.rejects(migrate(pool), /newer than this application/);
    } finally {
        await pool.query('DELETE FROM schema_migrations WHERE version > $1', [originalVersion]);
    }
});

test('approved workspace keys exercise agent memory, monitors, human approvals, jobs and status pages across PostgreSQL app instances', async (t) => {
    const { PostgresJobs } = await import('./scheduled-jobs.js');
    const identities = new PostgresIdentityRepository(pool);
    const options = {
        identityStore: identities,
        recoveryStore: new PostgresRecoveryRepository(pool),
        inboxStore: new PostgresInboxStore(pool),
        resourceStore: new PostgresResourceStore(pool),
        agentStore: new PostgresAgents(pool),
        approvalStore: new PostgresApprovals(pool),
        memory: new PostgresKv(pool),
        monitorStore: new PostgresMonitors(pool),
        jobStore: new PostgresJobs(pool),
        jobSend: async () => 204,
    };
    const app = buildApp(options),
        replica = buildApp(options);
    t.after(async () => {
        await app.close();
        await replica.close();
    });
    const origin = 'http://localhost:3000';
    const registered = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username: 'launch-owner',
            email: 'launch-owner@example.test',
            password: 'correct-horse-battery-staple',
        },
    });
    assert.equal(registered.statusCode, 201, registered.body);
    const session = { origin, cookie: String(registered.headers['set-cookie']).split(';')[0]! };
    const login = (
        await app.inject({
            method: 'POST',
            url: '/api/agents/login',
            payload: { name: 'Launch integration' },
        })
    ).json();
    const approved = await app.inject({
        method: 'POST',
        url: `/api/agents/login/${login.userCode}/approve`,
        headers: session,
        payload: {},
    });
    assert.equal(approved.statusCode, 200, approved.body);
    const key = (
        await replica.inject({
            method: 'POST',
            url: '/api/agents/token',
            payload: { deviceCode: login.deviceCode },
        })
    ).json().apiKey;
    assert.match(key, /^kv_/);
    const headers = { authorization: `Bearer ${key}` };
    const trialResponse = await app.inject({
        method: 'POST',
        url: '/api/agents/trial',
        payload: { name: 'Durable trial' },
    });
    assert.equal(trialResponse.statusCode, 201, trialResponse.body);
    const trial = trialResponse.json();
    const blocked = await replica.inject({
        url: '/api/memory/audit/key',
        headers: { authorization: `Bearer ${trial.trialKey}` },
    });
    assert.equal(blocked.statusCode, 401, blocked.body);
    assert.ok(blocked.json().error.includes(trial.claim.claimUrl), blocked.body);
    async function mcp(name: string, args: object, server = app) {
        const response = await server.inject({
            method: 'POST',
            url: '/mcp',
            headers: { ...headers, accept: 'application/json, text/event-stream' },
            payload: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name, arguments: args },
            },
        });
        const result = response.json().result;
        assert.equal(result?.isError, false, `${name}: ${response.body}`);
        return JSON.parse(result.content[0].text);
    }
    for (const namespace of ['kv', 'json', 'agent-state']) {
        await mcp('memory_set', {
            namespace,
            key: 'state/current',
            value: { step: 'ready', count: 1 },
        });
        assert.deepEqual(
            (await mcp('memory_get', { namespace, key: 'state/current' }, replica)).value,
            { step: 'ready', count: 1 },
        );
        assert.equal(
            (await mcp('memory_list', { namespace }, replica)).keys[0].key,
            'state/current',
        );
        await mcp('memory_delete', { namespace, key: 'state/current' }, replica);
        assert.equal(
            (await app.inject({ url: `/api/memory/${namespace}/state/current`, headers }))
                .statusCode,
            404,
        );
    }
    const monitor = await mcp('create_monitor', {
        kind: 'heartbeat',
        name: 'Agent job',
        intervalSeconds: 300,
    });
    const ping = new URL(monitor.pingUrl).pathname.split('/').at(-1)!;
    assert.equal((await mcp('ping_monitor', { token: ping }, replica)).status, 'up');
    const inspected = await mcp('inspect_monitor', { id: monitor.id });
    assert.equal(inspected.status, 'up');
    const page = await mcp('resource_request', {
        kind: 'status-pages',
        action: 'create',
        config: { name: 'Launch status', monitorIds: [monitor.id] },
        visibility: 'public',
    });
    const published = await replica.inject(`/status/${page.id}`);
    assert.equal(published.statusCode, 200, published.body);
    assert.match(published.body, /All published services are operational/);
    const asked = await mcp('ask_human', {
        question: 'Proceed with a local test?',
        options: ['Approve', 'Deny'],
    });
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: `/api/approvals/${asked.id}/answer`,
                headers,
                payload: { answer: 'Approve' },
            })
        ).statusCode,
        403,
    );
    const answer = await app.inject({
        method: 'POST',
        url: `/api/approvals/${asked.id}/answer`,
        headers: session,
        payload: { answer: 'Approve' },
    });
    assert.equal(answer.statusCode, 200, answer.body);
    const decision = await mcp('wait_for_approval', { id: asked.id, timeoutSeconds: 1 }, replica);
    assert.equal(decision.answer, 'Approve');
    const job = await mcp('resource_request', {
        kind: 'scheduled-jobs',
        action: 'create',
        config: {
            name: 'Callback',
            url: 'https://example.com/callback',
            delaySeconds: 5,
            body: { test: true },
        },
    });
    await replica.runScheduledJobs(Date.parse(job.nextRunAt) + 1);
    const stored = await mcp('resource_request', {
        kind: 'scheduled-jobs',
        action: 'inspect',
        id: job.id,
    });
    assert.equal(stored.status, 'completed');
    assert.equal(stored.events[0].status, 204);
    const events = await mcp(
        'wait_for_event',
        {
            sources: [
                { kind: 'job', id: job.id },
                { kind: 'approval', id: asked.id },
            ],
            timeoutSeconds: 1,
        },
        replica,
    );
    assert.equal(events.events.length, 2);
    const resources = await mcp('resource_request', { kind: 'status-pages', action: 'list' });
    assert.ok(resources.resources.some((resource: { id: string }) => resource.id === page.id));
    await mcp('resource_request', { kind: 'scheduled-jobs', action: 'delete', id: job.id });
    await mcp('resource_request', { kind: 'status-pages', action: 'delete', id: page.id });
    await mcp('delete_monitor', { id: monitor.id });
});

test('authenticators encrypt durable secrets, enforce concurrent plan caps and remain isolated from other workspaces and public memory', async (t) => {
    const { PostgresAuthenticators } = await import('./authenticators.js');
    const identities = new PostgresIdentityRepository(pool),
        stores = [new PostgresAuthenticators(pool), new PostgresAuthenticators(pool)];
    const owner = (await identities.register('totp-owner', 'test'))!,
        other = (await identities.register('totp-other', 'test'))!;
    async function key(user: typeof owner) {
        const token = randomBytes(32).toString('base64url');
        await identities.createSession(user.id, user.personalAccountId, token);
        const identity = (await identities.authenticateSession(token))!;
        return (
            await identities.createKey(
                identity,
                'Authenticator',
                ['resources:read', 'resources:write'],
                new Date(Date.now() + 86400000).toISOString(),
            )
        ).key;
    }
    const ownerKey = await key(owner),
        otherKey = await key(other),
        headers = { authorization: `Bearer ${ownerKey}` };
    const apps = stores.map((authenticatorStore) =>
        buildApp({
            identityStore: identities,
            recoveryStore: new PostgresRecoveryRepository(pool),
            authenticatorStore,
            activity: new PostgresActivity(pool),
            authSecret: 'durable-authenticator-key-32-characters',
            memory: new PostgresKv(pool),
        }),
    );
    t.after(async () => {
        await Promise.all(apps.map((app) => app.close()));
    });
    const secret = 'JBSWY3DPEHPK3PXP';
    const added = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
            apps[index % 2]!.inject({
                method: 'POST',
                url: '/api/authenticators',
                headers,
                payload: { name: `Account ${index}`, secret },
            }),
        ),
    );
    assert.equal(
        added.filter((response) => response.statusCode === 201).length,
        2,
        added.map((response) => response.body).join('\n'),
    );
    assert.equal(added.filter((response) => response.statusCode === 402).length, 4);
    const id = added.find((response) => response.statusCode === 201)!.json().id;
    const stored = await pool.query(
        "SELECT value::text AS value FROM kv_entries WHERE account_id=$1 AND namespace='$authenticators'",
        [owner.personalAccountId],
    );
    assert.equal(stored.rows.length, 2);
    assert.equal(
        (await apps[0]!.inject({ url: '/api/memory/project', headers })).json().usedBytes,
        0,
    );
    assert.ok(stored.rows.every((row) => !row.value.includes(secret)));
    assert.match(
        (await apps[1]!.inject({ url: `/api/authenticators/${id}/code`, headers })).json().code,
        /^\d{6}$/,
    );
    assert.equal(
        (
            await apps[1]!.inject({
                url: `/api/authenticators/${id}/code`,
                headers: { authorization: `Bearer ${otherKey}` },
            })
        ).statusCode,
        404,
    );
    const audit = await new PostgresActivity(pool).list(owner.personalAccountId);
    assert.equal(audit[0]!.userId, owner.id);
    assert.equal(audit[0]!.keyId, (await identities.authenticateKey(ownerKey))!.keyId);
    assert.equal(audit[0]!.agentName, 'Authenticator');
    assert.equal(
        (await apps[0]!.inject({ url: `/api/memory/%24authenticators/${id}`, headers })).statusCode,
        400,
    );
    assert.equal(
        (
            await apps[0]!.inject({
                method: 'PUT',
                url: `/api/memory/%24authenticators/${id}`,
                headers,
                payload: { value: { encrypted: 'tampered' } },
            })
        ).statusCode,
        400,
    );
    assert.equal(
        (
            await apps[1]!.inject({
                method: 'PATCH',
                url: `/api/authenticators/${id}`,
                headers,
                payload: { name: 'Renamed account' },
            })
        ).statusCode,
        200,
    );
    assert.ok(
        (await stores[0]!.list(owner.personalAccountId)).some(
            (entry) => entry.name === 'Renamed account',
        ),
    );
    assert.equal(
        (await apps[0]!.inject({ method: 'DELETE', url: `/api/authenticators/${id}`, headers }))
            .statusCode,
        204,
    );
    assert.equal((await stores[1]!.list(owner.personalAccountId)).length, 1);
});

test('owned attachment bytes persist, reserve workspace storage atomically and are reclaimed with expired messages', async (t) => {
    const { parseAttachments } = await import('./email-attachments.js');
    const identities = new PostgresIdentityRepository(pool),
        owner = (await identities.register('attachment-storage', 'test'))!,
        account = (await identities.account(owner.personalAccountId))!;
    const resources = new PostgresResourceStore(pool),
        messages = new PostgresEmailMessages(pool),
        restarted = new PostgresEmailMessages(pool);
    const inbox = (await resources.create(
        'email',
        { address: 'owned@socketspace.xyz' },
        undefined,
        { ownerId: account.id, quotaKey: account.quotaKey, plan: 'free' },
    ))!;
    const base = (await resources.read(inbox.id, 'email', '', account.id))!.storedBytes;
    const input = parseAttachments(
        [
            {
                filename: 'test.html',
                mimeType: 'text/html',
                size: 6,
                base64: Buffer.from('bytes!').toString('base64'),
            },
        ],
        true,
    );
    const message = {
        id: randomBytes(16).toString('hex'),
        receivedAt: new Date().toISOString(),
        from: 'sender@example.test',
        to: 'owned@socketspace.xyz',
        subject: 'Attachment',
        text: 'Body',
        codes: [],
        links: [],
        attachments: input.attachments,
    };
    assert.equal(await messages.record(inbox.id, message, input.bodies), 'stored');
    assert.deepEqual(
        (await restarted.attachment(inbox.id, message.id, input.attachments[0]!.id!))?.bytes,
        Buffer.from('bytes!'),
    );
    const previewQueries: string[] = [];
    const previews = new PostgresEmailMessages({
        async query(sql: string, values: unknown[]) {
            previewQueries.push(sql);
            const result = await pool.query(sql, values);
            if (sql.includes('ORDER BY sequence')) {
                assert.equal(result.rows[0].message.attachmentBodies, undefined);
                assert.ok(!JSON.stringify(result.rows).includes(input.bodies[0]!.base64));
            }
            return result;
        },
    } as unknown as Pool);
    const preview = (await previews.list(inbox.id))[0]!;
    await previews.cursor(inbox.id);
    assert.match(previewQueries[0]!, /SELECT message - 'attachmentBodies' AS message/);
    assert.match(previewQueries[1]!, /max\(sequence\)/);
    assert.equal((preview as unknown as Record<string, unknown>).attachmentBodies, undefined);
    const stored = (await resources.read(inbox.id, 'email', '', account.id))!.storedBytes;
    assert.ok(stored > base + 6);
    assert.equal(
        Number(
            (
                await pool.query('SELECT stored_bytes FROM principal_usage WHERE account_id=$1', [
                    account.id,
                ])
            ).rows[0].stored_bytes,
        ),
        stored,
    );
    await restarted.replace(inbox.id, message.id, { ...preview, text: 'Updated body' });
    assert.equal(
        (
            await restarted.attachment(inbox.id, message.id, input.attachments[0]!.id!)
        )?.bytes.toString(),
        'bytes!',
    );
    const current = (await resources.read(inbox.id, 'email', '', account.id))!.storedBytes;
    const original = (await pool.query("SELECT settings FROM usage_plans WHERE id='free'")).rows[0]
        .settings;
    try {
        await pool.query(
            "UPDATE usage_plans SET settings=jsonb_set(settings,'{storageBytes}',$1::jsonb) WHERE id='free'",
            [String(current + 1)],
        );
        const blocked = await messages.record(
            inbox.id,
            { ...message, id: 'rejected' },
            input.bodies,
        );
        assert.equal(blocked, 'full');
        assert.equal(await restarted.count(inbox.id), 1);
        assert.equal(
            (await resources.read(inbox.id, 'email', '', account.id))!.storedBytes,
            current,
        );
    } finally {
        await pool.query("UPDATE usage_plans SET settings=$1 WHERE id='free'", [original]);
    }
    await messages.delete(inbox.id);
    assert.equal(
        await restarted.attachment(inbox.id, message.id, input.attachments[0]!.id!),
        undefined,
    );
    assert.equal((await resources.read(inbox.id, 'email', '', account.id))!.storedBytes, base);
    assert.equal(await messages.record(inbox.id, message, input.bodies), 'stored');
    await pool.query(
        "UPDATE temporary_resources SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
        [inbox.id],
    );
    await resources.deleteExpired();
    assert.equal(
        await restarted.attachment(inbox.id, message.id, input.attachments[0]!.id!),
        undefined,
    );
    assert.equal(
        Number((await pool.query('SELECT stored_bytes FROM resource_usage')).rows[0].stored_bytes),
        0,
    );
    assert.equal(
        Number(
            (
                await pool.query('SELECT stored_bytes FROM principal_usage WHERE account_id=$1', [
                    account.id,
                ])
            ).rows[0].stored_bytes,
        ),
        0,
    );
});

test('the attachment set cap holds across concurrent PostgreSQL writers', async () => {
    const { parseAttachments } = await import('./email-attachments.js');
    const identities = new PostgresIdentityRepository(pool),
        user = (await identities.register('attachment-cap', 'test'))!,
        account = (await identities.account(user.personalAccountId))!;
    const resources = new PostgresResourceStore(pool),
        inbox = (await resources.create('email', { name: 'Cap' }, undefined, {
            ownerId: account.id,
            quotaKey: account.quotaKey,
            plan: 'free',
        }))!;
    const stores = [new PostgresEmailMessages(pool), new PostgresEmailMessages(pool)];
    const input = parseAttachments(
        [
            {
                filename: 'large.bin',
                mimeType: 'application/octet-stream',
                size: 4 * 1048576,
                base64: Buffer.alloc(4 * 1048576, 65).toString('base64'),
            },
        ],
        true,
    );
    const results = await Promise.all(
        Array.from({ length: 7 }, (_, index) =>
            stores[index % 2]!.record(
                inbox.id,
                {
                    id: `attachment-${index}`,
                    receivedAt: new Date().toISOString(),
                    from: 'sender@example.test',
                    to: 'owned@socketspace.xyz',
                    subject: 'Cap',
                    text: '',
                    codes: [],
                    links: [],
                    attachments: input.attachments,
                },
                input.bodies,
            ),
        ),
    );
    assert.equal(results.filter((result) => result === 'stored').length, 6);
    assert.equal(results.filter((result) => result === 'full').length, 1);
    assert.equal(await stores[0]!.count(inbox.id), 6);
});
test('OAuth providers share durable grants, signing keys and atomic plan limits across replicas', async (t) => {
    class DelayedMockCalls extends PostgresMockCalls {
        override async record(...args: Parameters<PostgresMockCalls['record']>) {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return super.record(...args);
        }
    }
    const identities = new PostgresIdentityRepository(pool);
    const a = buildApp({
        identityStore: identities,
        authSecret: 'durable-oauth-test-secret-32-characters',
        recoveryStore: new PostgresRecoveryRepository(pool),
        resourceStore: new PostgresResourceStore(pool),
        mockCalls: new DelayedMockCalls(pool),
    });
    const b = buildApp({
        identityStore: new PostgresIdentityRepository(pool),
        authSecret: 'durable-oauth-test-secret-32-characters',
        recoveryStore: new PostgresRecoveryRepository(pool),
        resourceStore: new PostgresResourceStore(pool),
        mockCalls: new DelayedMockCalls(pool),
    });
    t.after(async () => {
        await a.close();
        await b.close();
    });
    const origin = 'http://localhost:3000';
    const registration = await a.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username: 'oauth-durable',
            email: 'oauth-durable@example.test',
            password: 'correct-horse-battery-staple',
        },
    });
    assert.equal(registration.statusCode, 201, registration.body);
    const headers = { origin, cookie: String(registration.headers['set-cookie']).split(';')[0]! };
    const config = {
        name: 'Durable OAuth',
        redirectUris: ['http://localhost:3333/callback'],
        users: [{ sub: 'test-user', email: 'test@example.test', name: 'Test user' }],
        headless: true,
    };
    const created = await Promise.all(
        [a, b].map((app) =>
            app.inject({ method: 'POST', url: '/api/oauth-providers', headers, payload: config }),
        ),
    );
    assert.deepEqual(created.map((r) => r.statusCode).sort(), [201, 402]);
    const provider = created.find((r) => r.statusCode === 201)!.json(),
        path = `/oauth/${provider.id}`;
    const jwks = await a.inject(`${path}/jwks`);
    assert.equal((await b.inject(`${path}/jwks`)).body, jwks.body);
    const verifier = 'a'.repeat(43),
        challenge = createHash('sha256').update(verifier).digest('base64url');
    const authorize = await a.inject(
        `${path}/authorize?${new URLSearchParams({ client_id: provider.client_id, redirect_uri: config.redirectUris[0]!, response_type: 'code', scope: 'openid offline_access', code_challenge: challenge, code_challenge_method: 'S256', prompt: 'none', login_hint: 'test-user' })}`,
    );
    const code = new URL(String(authorize.headers.location)).searchParams.get('code')!;
    const exchanged = await Promise.all(
        [a, b].map((app) =>
            app.inject({
                method: 'POST',
                url: `${path}/token`,
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                payload: new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: provider.client_id,
                    client_secret: provider.client_secret,
                    redirect_uri: config.redirectUris[0]!,
                    code_verifier: verifier,
                    code,
                }).toString(),
            }),
        ),
    );
    assert.deepEqual(exchanged.map((r) => r.statusCode).sort(), [200, 400]);
    const refresh = exchanged.find((r) => r.statusCode === 200)!.json().refresh_token;
    const refreshed = await Promise.all(
        [a, b].map((app) =>
            app.inject({
                method: 'POST',
                url: `${path}/token`,
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                payload: new URLSearchParams({
                    grant_type: 'refresh_token',
                    client_id: provider.client_id,
                    client_secret: provider.client_secret,
                    refresh_token: refresh,
                }).toString(),
            }),
        ),
    );
    assert.deepEqual(refreshed.map((r) => r.statusCode).sort(), [200, 400]);
    const log = await b.inject({ url: `/api/mocks/${provider.id}/calls`, headers });
    assert.ok(log.json().calls.length >= 7);
    // The two refreshes race, so the rejected one is either of the last two log entries.
    assert.ok(
        log
            .json()
            .calls.slice(-2)
            .some((call: { status: number }) => call.status === 400),
    );
    assert.ok(!log.body.includes(refresh));
    const winner = refreshed.find((r) => r.statusCode === 200)!.json();
    const reuseCheck = await b.inject({
        method: 'POST',
        url: `${path}/token`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: provider.client_id,
            client_secret: provider.client_secret,
            refresh_token: winner.refresh_token,
        }).toString(),
    });
    assert.equal(reuseCheck.json().error, 'invalid_grant');
    await pool.query(
        "UPDATE temporary_resources SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
        [provider.id],
    );
    await new PostgresResourceStore(pool).deleteExpired();
    assert.equal((await b.inject(`${path}/jwks`)).statusCode, 404);
    assert.equal(
        (await pool.query('SELECT count(*) FROM mock_calls WHERE resource_id=$1', [provider.id]))
            .rows[0].count,
        '0',
    );
    assert.equal(
        (await pool.query('SELECT count(*) FROM temporary_resources WHERE id=$1', [provider.id]))
            .rows[0].count,
        '0',
    );
});

test('email threads, human inbox controls and approved drafts work across replicas', async (t) => {
    const identities = new PostgresIdentityRepository(pool);
    const owner = (await identities.register('mail-workspace-owner', 'test-hash'))!;
    const admin = (await identities.register('mail-workspace-admin', 'test-hash'))!;
    const viewer = (await identities.register('mail-workspace-viewer', 'test-hash'))!;
    const accountId = owner.personalAccountId;
    const until = new Date(Date.now() + 86400000).toISOString();
    await identities.setEntitlement(accountId, 'team', until);
    await pool.query(
        "INSERT INTO account_members(account_id,user_id,role) VALUES($1,$2,'admin'),($1,$3,'viewer')",
        [accountId, admin.id, viewer.id],
    );
    async function session(userId: string, workspace = accountId) {
        const token = randomBytes(32).toString('base64url');
        await identities.createSession(userId, workspace, token);
        return {
            headers: { origin: 'http://localhost:3000', cookie: `kivel_session=${token}` },
            identity: (await identities.authenticateSession(token))!,
        };
    }
    const human = await session(owner.id);
    const administrator = await session(admin.id);
    const spectator = await session(viewer.id);
    const outsider = await session(viewer.id, viewer.personalAccountId);
    const writer = await identities.createKey(
        human.identity,
        'Mail agent',
        ['resources:write', 'resources:read'],
        until,
    );
    const reader = await identities.createKey(
        human.identity,
        'Mail reader',
        ['resources:read'],
        until,
    );
    const agent = { authorization: `Bearer ${writer.key}` };
    const read = { authorization: `Bearer ${reader.key}` };
    const secret = 'm'.repeat(40);
    const deliveries: { body: Record<string, unknown>; key: string }[] = [];
    const emailSending = new PostgresEmailSending(pool);
    const approvals = new PostgresApprovals(pool);
    const options = {
        identityStore: identities,
        recoveryStore: new PostgresRecoveryRepository(pool),
        resourceStore: new PostgresResourceStore(pool),
        emailAddresses: new PostgresEmailAddresses(pool),
        emailMessages: new PostgresEmailMessages(pool),
        approvalStore: approvals,
        jobStore: new PostgresJobs(pool),
        emailSending,
        mailDomain: 'socketspace.xyz',
        emailIngestSecret: secret,
        agentEmailConfig: { host: 'mail', port: 587, enabled: true },
        agentEmailSend: async (body: Record<string, unknown>, key: string) => {
            deliveries.push({ body, key });
            return { id: `receipt-${deliveries.length}` };
        },
    };
    const app = buildApp(options);
    const replica = buildApp(options);
    t.after(async () => {
        await app.close();
        await replica.close();
    });
    const created = await app.inject({ method: 'POST', url: '/api/email-inboxes', headers: agent });
    assert.equal(created.statusCode, 201, created.body);
    const inbox = created.json();
    const base = `/api/email-inboxes/${inbox.id}`;
    const putRules = (headers: Record<string, string>, payload: object) =>
        app.inject({ method: 'PUT', url: `${base}/rules`, headers, payload });
    const rules = {
        inboundAllow: ['example.com'],
        inboundBlock: ['block@example.com'],
        outboundAllow: ['example.com'],
    };
    for (const headers of [agent, read, spectator.headers])
        assert.equal((await putRules(headers, rules)).statusCode, 403);
    assert.equal((await putRules(human.headers, rules)).statusCode, 200);
    assert.equal((await putRules(administrator.headers, rules)).statusCode, 200);
    assert.equal(
        (await putRules(human.headers, { inboundAllow: Array(251).fill('example.com') }))
            .statusCode,
        400,
    );
    assert.deepEqual(
        (await replica.inject({ url: `${base}/rules`, headers: read })).json().rules.inboundBlock,
        rules.inboundBlock,
    );
    assert.equal(
        (await replica.inject({ url: `${base}/rules`, headers: outsider.headers })).statusCode,
        404,
    );

    async function ingest(from: string, subject: string, fields: object = {}) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const payload = JSON.stringify({
            to: inbox.address,
            from,
            mailFrom: 'sender@example.com',
            subject,
            text: 'Message body',
            ...fields,
        });
        return app.inject({
            method: 'POST',
            url: '/hooks/email',
            payload,
            headers: {
                'content-type': 'application/json',
                'x-kivel-timestamp': timestamp,
                'x-kivel-signature': createHmac('sha256', secret)
                    .update(`${timestamp}.${payload}`)
                    .digest('hex'),
            },
        });
    }
    for (const from of ['block@example.com', 'unknown@other.test']) {
        const blocked = await ingest(from, 'Filtered');
        assert.equal(blocked.statusCode, 202, blocked.body);
        assert.equal(blocked.json().stored, false);
    }
    for (const [from, subject, fields] of [
        ['Sender <sender@example.com>', 'First conversation', { messageId: '<first@example.com>' }],
        [
            'sender@example.com',
            'Subject changed',
            { messageId: '<reply@example.com>', inReplyTo: '<first@example.com>' },
        ],
        ['sender@example.com', 'Second conversation', {}],
        ['sender@example.com', 'Re: SECOND conversation', {}],
        ['other@example.com', 'Re: Second conversation', {}],
    ] as const) {
        const result = await ingest(from, subject, fields);
        assert.equal(result.statusCode, 202, result.body);
        assert.equal(result.json().stored, true);
    }
    const latest = await replica.inject({ url: `${base}/threads?limit=1`, headers: read });
    assert.equal(latest.statusCode, 200, latest.body);
    assert.equal(latest.json().threads.length, 1);
    assert.equal(latest.json().threads[0].messageCount, 1);
    assert.equal('messages' in latest.json().threads[0], false);
    const next = await replica.inject({
        url: `/api/email-threads?cursor=${latest.json().nextCursor}`,
        headers: agent,
    });
    assert.equal(next.statusCode, 200, next.body);
    assert.deepEqual(
        next.json().threads.map((thread: { messageCount: number }) => thread.messageCount),
        [2, 2],
    );
    const thread = next
        .json()
        .threads.find((thread: { subject: string }) => thread.subject === 'First conversation');
    const detail = (
        await replica.inject({ url: `${base}/threads/${thread.id}`, headers: agent })
    ).json();
    assert.deepEqual(
        detail.messages.map((message: { subject: string }) => message.subject),
        ['First conversation', 'Subject changed'],
    );
    assert.equal(
        (await replica.inject({ url: `${base}/threads/${thread.id}`, headers: outsider.headers }))
            .statusCode,
        404,
    );
    assert.deepEqual(
        (await replica.inject({ url: '/api/email-threads', headers: outsider.headers })).json()
            .threads,
        [],
    );

    const original = {
        to: ['sender@example.com'],
        subject: 'Reply',
        text: 'Original draft',
        replyTo: thread.id,
    };
    const createDraft = (payload = original) =>
        app.inject({ method: 'POST', url: `${base}/drafts`, headers: agent, payload });
    const submit = (id: string, payload: object, headers: Record<string, string> = agent) =>
        app.inject({
            method: 'POST',
            url: `/api/email-drafts/${id}/send`,
            headers,
            payload,
        });
    const answer = (id: string, payload: object, headers: Record<string, string>) =>
        replica.inject({
            method: 'POST',
            url: `/api/approvals/${id}/answer`,
            headers,
            payload,
        });
    const inspect = (id: string, headers: Record<string, string> = agent) =>
        replica.inject({ url: `/api/email-drafts/${id}`, headers });
    const usage = () => emailSending.withOwner(accountId, (transaction) => transaction.usage());
    const draft = await createDraft();
    assert.equal(draft.statusCode, 201, draft.body);
    const { id } = draft.json();
    assert.equal(await usage(), 0);
    assert.equal((await submit(id, {}, read)).statusCode, 403);
    assert.equal((await inspect(id, outsider.headers)).statusCode, 404);
    const queued = await submit(id, { approval: true });
    assert.equal(queued.statusCode, 202, queued.body);
    assert.equal(queued.json().status, 'awaitingApproval');
    assert.equal((await submit(id, { approval: true })).json().approvalId, id);
    assert.equal((await answer(id, { answer: 'Approve' }, agent)).statusCode, 403);
    assert.equal((await answer(id, { answer: 'Approve' }, spectator.headers)).statusCode, 403);
    await replica.runScheduledJobs(Date.now() + 10);
    assert.equal(await usage(), 0);

    const approved = await answer(
        id,
        {
            answer: 'Approve',
            editedEmail: { ...original, text: 'Edited by the admin', cc: ['copy@example.com'] },
        },
        administrator.headers,
    );
    assert.equal(approved.statusCode, 200, approved.body);
    assert.equal('editedEmail' in approved.json(), false);
    const decision = (
        await app.inject({ url: `/api/approvals/${id}/wait`, headers: agent })
    ).json();
    assert.equal(decision.answer, 'Approve');
    assert.equal('editedEmail' in decision, false);
    await replica.runScheduledJobs(Date.now() + 10000);
    await app.runScheduledJobs(Date.now() + 20000);
    assert.equal((await inspect(id)).json().status, 'completed');
    assert.equal(deliveries.length, 2);
    assert.equal(await usage(), 2);
    assert.match(String(deliveries[0]!.body.text), /^Edited by the admin/);
    assert.deepEqual(deliveries[1]!.body.cc, ['copy@example.com']);
    assert.equal(
        (deliveries[0]!.body.headers as Record<string, string>)['In-Reply-To'],
        '<first@example.com>',
    );

    const rejected = (await createDraft()).json();
    assert.equal((await submit(rejected.id, { approval: true })).statusCode, 202);
    assert.equal((await answer(rejected.id, { answer: 'Reject' }, human.headers)).statusCode, 200);
    await replica.runScheduledJobs(Date.now() + 10000);
    assert.equal((await inspect(rejected.id)).json().status, 'rejected');
    assert.equal(await usage(), 2);

    const denied = await app.inject({
        method: 'POST',
        url: `${base}/send`,
        headers: { ...agent, 'idempotency-key': 'blocked-recipient-test' },
        payload: { ...original, to: ['outside@other.test'] },
    });
    assert.equal(denied.statusCode, 403, denied.body);
    assert.equal(await usage(), 2);

    const scheduled = (await createDraft()).json();
    const future = Date.now() + 60000;
    const sendAt = new Date(future).toISOString();
    assert.equal((await submit(scheduled.id, { sendAt })).statusCode, 202);
    await replica.runScheduledJobs(future - 1);
    assert.equal((await inspect(scheduled.id)).json().status, 'scheduled');
    assert.equal(await usage(), 2);
    await replica.runScheduledJobs(future + 1);
    assert.equal((await inspect(scheduled.id)).json().status, 'completed');
    assert.equal(await usage(), 3);

    const mcpCall = async (name: string, args: object) =>
        (
            await app.inject({
                method: 'POST',
                url: '/mcp',
                headers: { ...agent, accept: 'application/json, text/event-stream' },
                payload: {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/call',
                    params: { name, arguments: args },
                },
            })
        ).json().result;
    const mcpThreads = await mcpCall('list_email_threads', { id: inbox.id });
    assert.equal(mcpThreads.isError, false, mcpThreads.content[0].text);
    assert.ok(JSON.parse(mcpThreads.content[0].text).threads.length);
    assert.equal((await mcpCall('email_inbox_rules', { id: inbox.id, rules: {} })).isError, true);
    const mcpDraft = await mcpCall('email_draft', {
        id: inbox.id,
        action: 'create',
        content: original,
    });
    assert.equal(mcpDraft.isError, false, mcpDraft.content[0].text);
    assert.equal(JSON.parse(mcpDraft.content[0].text).status, 'draft');
    const deleted = await app.inject({
        method: 'DELETE',
        url: `/api/email-drafts/${id}`,
        headers: agent,
    });
    assert.equal(deleted.statusCode, 204, deleted.body);
    await approvals.pruneDraftEdits();
    assert.equal((await approvals.get(accountId, id))?.editedEmail, undefined);
    assert.equal((await putRules(human.headers, { requireApproval: true })).statusCode, 200);
    assert.equal((await putRules(agent, { requireApproval: false })).statusCode, 403);
    const blockedSend = await app.inject({
        method: 'POST',
        url: `${base}/send`,
        headers: { ...agent, 'idempotency-key': 'requires-approval-test' },
        payload: original,
    });
    assert.equal(blockedSend.statusCode, 403, blockedSend.body);
    assert.match(blockedSend.body, /This inbox requires human approval/);
    const renewedDraft = (await createDraft()).json();
    assert.equal((await submit(renewedDraft.id, {})).statusCode, 403);
    const pending = await submit(renewedDraft.id, { approval: true });
    assert.equal(pending.statusCode, 202, pending.body);
    const oldApprovalId = pending.json().approvalId;
    const past = new Date(Date.now() - 1000).toISOString();
    await pool.query(
        "UPDATE approvals SET expires_at=$2::timestamptz,approval=jsonb_set(approval,'{expiresAt}',to_jsonb($2::text)) WHERE id=$1",
        [oldApprovalId, past],
    );
    assert.equal((await inspect(renewedDraft.id)).json().status, 'expired');
    assert.equal((await submit(renewedDraft.id, { approval: true })).statusCode, 403);
    const resumed = await Promise.all([
        submit(renewedDraft.id, { approval: true }, human.headers),
        replica.inject({
            method: 'POST',
            url: `/api/email-drafts/${renewedDraft.id}/send`,
            headers: administrator.headers,
            payload: { approval: true },
        }),
    ]);
    const newApprovalIds = resumed
        .filter((result) => result.statusCode === 202)
        .map((result) => result.json().approvalId);
    assert.equal(new Set(newApprovalIds).size, 1);
    const newApprovalId = newApprovalIds[0]!;
    assert.notEqual(newApprovalId, oldApprovalId);
    assert.equal(
        (await answer(oldApprovalId, { answer: 'Approve' }, human.headers)).statusCode,
        409,
    );
    assert.equal(
        (await answer(newApprovalId, { answer: 'Approve' }, administrator.headers)).statusCode,
        200,
    );
    await replica.runScheduledJobs(Date.now() + 30000);
    assert.equal((await inspect(renewedDraft.id)).json().status, 'completed');
    assert.equal(await usage(), 4);
});

test('vault encryption, limits, human settings and single-use reveals persist across replicas', async (t) => {
    const { PostgresCredentials } = await import('./credentials.js');
    const identities = new PostgresIdentityRepository(pool);
    const user = (await identities.register('vault-db-owner', 'test'))!;
    const ownerId = user.personalAccountId;
    const token = randomBytes(32).toString('base64url');
    await identities.createSession(user.id, ownerId, token);
    const identity = (await identities.authenticateSession(token))!;
    const until = new Date(Date.now() + 86400000).toISOString();
    const key = await identities.createKey(
        identity,
        'Vault DB agent',
        ['resources:read', 'resources:write', 'account:read'],
        until,
    );
    const agent = { authorization: `Bearer ${key.key}` };
    const human = { origin: 'http://localhost:3000', cookie: `kivel_session=${token}` };
    const credentials = new PostgresCredentials(pool);
    const options = {
        identityStore: identities,
        recoveryStore: new PostgresRecoveryRepository(pool),
        resourceStore: new PostgresResourceStore(pool),
        authenticatorStore: new (await import('./authenticators.js')).PostgresAuthenticators(pool),
        credentialStore: credentials,
        approvalStore: new PostgresApprovals(pool),
        activity: new PostgresActivity(pool),
        authSecret: 'database-vault-encryption-secret-at-least-32-bytes',
    };
    const app = buildApp(options),
        replica = buildApp(options);
    t.after(async () => {
        await app.close();
        await replica.close();
    });
    const content = {
        name: 'DB service',
        url: 'https://example.com',
        username: 'db-user',
        password: 'database-password-kept-private',
        notes: 'database-private-notes',
    };
    const created = await Promise.all(
        Array.from({ length: 12 }, () =>
            app.inject({
                method: 'POST',
                url: '/api/credentials',
                headers: agent,
                payload: content,
            }),
        ),
    );
    assert.equal(created.filter((response) => response.statusCode === 201).length, 10);
    assert.equal(created.filter((response) => response.statusCode === 402).length, 2);
    const id = created.find((response) => response.statusCode === 201)!.json().credential.id;
    const persisted = await pool.query(
        "SELECT value FROM kv_entries WHERE account_id=$1 AND namespace='$credentials'",
        [ownerId],
    );
    assert.equal(JSON.stringify(persisted.rows).includes(content.password), false);
    assert.equal(JSON.stringify(persisted.rows).includes(content.notes), false);
    const list = await replica.inject({ url: '/api/credentials', headers: agent });
    assert.equal(list.json().credentials.length, 10);
    assert.equal(list.body.includes('encrypted'), false);
    assert.equal(list.body.includes(content.password), false);
    const reveal = (approvalId?: string) =>
        replica.inject({
            method: 'POST',
            url: `/api/credentials/${id}/reveal`,
            headers: agent,
            payload: approvalId ? { approvalId } : {},
        });
    const pending = await reveal();
    assert.equal(pending.statusCode, 202, pending.body);
    const approvalId = pending.json().approvalId;
    const answer = await app.inject({
        method: 'POST',
        url: `/api/approvals/${approvalId}/answer`,
        headers: human,
        payload: { answer: 'Approve' },
    });
    assert.equal(answer.statusCode, 200, answer.body);
    const attempts = await Promise.all([reveal(approvalId), reveal(approvalId)]);
    assert.deepEqual(attempts.map((response) => response.statusCode).sort(), [200, 409]);
    assert.equal(
        attempts.find((response) => response.statusCode === 200)!.json().password,
        content.password,
    );
    const entries = await new PostgresActivity(pool).list(ownerId);
    assert.equal(entries.filter((entry) => entry.tool === 'reveal_credential').length, 1);
    assert.equal(JSON.stringify(entries).includes(content.password), false);
    assert.equal(
        (
            await app.inject({
                method: 'PATCH',
                url: `/api/credentials/${id}`,
                headers: agent,
                payload: { agentMayRead: true },
            })
        ).statusCode,
        403,
    );
    const before = (await credentials.get(ownerId, id))!;
    const enabled = await app.inject({
        method: 'PATCH',
        url: `/api/credentials/${id}`,
        headers: human,
        payload: { agentMayRead: true },
    });
    assert.equal(enabled.statusCode, 200, enabled.body);
    assert.equal(
        await credentials.update(ownerId, { ...before, name: 'Stale overwrite' }, before.version),
        false,
    );
    assert.equal((await reveal()).statusCode, 200);
    const outsider = (await identities.register('vault-db-other', 'test'))!;
    const otherToken = randomBytes(32).toString('base64url');
    await identities.createSession(outsider.id, outsider.personalAccountId, otherToken);
    assert.equal(
        (
            await replica.inject({
                url: `/api/credentials/${id}`,
                headers: { cookie: `kivel_session=${otherToken}` },
            })
        ).statusCode,
        404,
    );
    assert.equal(
        (await app.inject({ method: 'DELETE', url: `/api/credentials/${id}`, headers: agent }))
            .statusCode,
        204,
    );
    assert.equal(await credentials.get(ownerId, id), undefined);
});

test('test wallet approvals, atomic debits, token replay and checkout expiry work across replicas', async (t) => {
    const identities = new PostgresIdentityRepository(pool);
    const user = (await identities.register('payments-db-owner', 'test'))!;
    const owner = user.personalAccountId,
        token = randomBytes(32).toString('base64url');
    await identities.createSession(user.id, owner, token);
    const identity = (await identities.authenticateSession(token))!;
    const key = await identities.createKey(
        identity,
        'DB payment agent',
        ['resources:read', 'resources:write', 'account:read'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    const headers = { authorization: `Bearer ${key.key}` },
        human = { origin: 'http://localhost:3000', cookie: `kivel_session=${token}` };
    const options = {
        identityStore: identities,
        resourceStore: new PostgresResourceStore(pool),
        approvalStore: new PostgresApprovals(pool),
        mockCalls: new PostgresMockCalls(pool),
        activity: new PostgresActivity(pool),
        recoveryStore: new PostgresRecoveryRepository(pool),
        authSecret: 'database-test-payments-encryption-secret',
    };
    const a = buildApp(options),
        b = buildApp({ ...options, resourceStore: new PostgresResourceStore(pool) });
    t.after(async () => {
        await a.close();
        await b.close();
    });
    const wallet = await a.inject({
        method: 'POST',
        url: '/api/test-wallets',
        headers: human,
        payload: {
            name: 'DB wallet',
            balance: 20,
            perPaymentLimit: 10,
            dailyLimit: 20,
            approvalThreshold: 1,
        },
    });
    assert.equal(wallet.statusCode, 201, wallet.body);
    const id = wallet.json().id,
        payment = { payee: 'DB test vendor', amount: 5, idempotencyKey: 'db-payment' };
    const pending = await a.inject({
        method: 'POST',
        url: `/api/test-wallets/${id}/pay`,
        headers,
        payload: payment,
    });
    assert.equal(pending.statusCode, 202, pending.body);
    assert.equal(
        (
            await b.inject({
                method: 'POST',
                url: `/api/approvals/${pending.json().approvalId}/answer`,
                headers: human,
                payload: { answer: 'Approve' },
            })
        ).statusCode,
        200,
    );
    const paid = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
            (i % 2 ? a : b).inject({
                method: 'POST',
                url: `/api/test-wallets/${id}/pay`,
                headers,
                payload: payment,
            }),
        ),
    );
    assert.ok(
        paid.every((response) => response.statusCode === 200),
        paid.map((response) => response.body).join('\n'),
    );
    assert.equal((await b.inject({ url: `/api/test-wallets/${id}`, headers })).json().balance, 15);
    const paywall = (
        await a.inject({
            method: 'POST',
            url: '/api/test-paywalls',
            headers,
            payload: { name: 'DB content', amount: 1 },
        })
    ).json();
    const authorized = await a.inject({
        method: 'POST',
        url: `/api/test-wallets/${id}/pay`,
        headers,
        payload: { payee: paywall.endpointUrl, idempotencyKey: 'db-token', authorizeOnly: true },
    });
    assert.equal(authorized.statusCode, 200, authorized.body);
    const redeemed = await Promise.all(
        [a, b].map((app) =>
            app.inject({
                url: `/pay/${paywall.id}`,
                headers: { 'x-payment': authorized.json().paymentHeader },
            }),
        ),
    );
    assert.deepEqual(redeemed.map((response) => response.statusCode).sort(), [200, 409]);
    assert.equal((await b.inject({ url: `/api/test-wallets/${id}`, headers })).json().balance, 14);
    const checkout = (
        await a.inject({
            method: 'POST',
            url: '/api/test-checkouts',
            headers,
            payload: { name: 'DB checkout', item: 'Test item', amount: 1 },
        })
    ).json();
    const attempt = await b.inject({
        method: 'POST',
        url: `/api/test-checkouts/${checkout.id}/complete`,
        headers,
        payload: { idempotencyKey: 'db-checkout', card: { number: '4242424242424242' } },
    });
    assert.equal(attempt.statusCode, 200, attempt.body);
    const stored = (
        await pool.query('SELECT payload FROM temporary_resources WHERE id=$1', [checkout.id])
    ).rows[0].payload;
    assert.equal(JSON.stringify(stored).includes('4242424242424242'), false);
    assert.equal(JSON.stringify(stored).includes(checkout.webhookSecret), false);
    assert.equal(
        (await a.inject({ url: `/api/mocks/${checkout.id}/calls`, headers })).json().calls.length,
        1,
    );
    await pool.query(
        "UPDATE temporary_resources SET expires_at=clock_timestamp() - interval '1 second' WHERE id=$1",
        [checkout.id],
    );
    await options.resourceStore.deleteExpired();
    assert.equal((await b.inject({ url: `/checkout/${checkout.id}` })).statusCode, 404);
    assert.equal(
        Number(
            (
                await pool.query('SELECT count(*) FROM mock_calls WHERE resource_id=$1', [
                    checkout.id,
                ])
            ).rows[0].count,
        ),
        0,
    );
    const resources = await b.inject({ url: '/api/account/resources', headers });
    assert.ok(
        resources
            .json()
            .resources.some(
                (resource: { id: string; toolId: string }) =>
                    resource.id === id && resource.toolId === 'agents-test-wallet',
            ),
    );
});

test('workspace usage reads durable counters and keeps totals behind account read scope', async (t) => {
    const identities = new PostgresIdentityRepository(pool);
    const inboxes = new PostgresInboxStore(pool);
    const resources = new PostgresResourceStore(pool);
    const memory = new PostgresKv(pool);
    const sending = new PostgresEmailSending(pool);
    const approvals = new PostgresApprovals(pool);
    const app = buildApp({
        identityStore: identities,
        recoveryStore: new PostgresRecoveryRepository(pool),
        inboxStore: inboxes,
        resourceStore: resources,
        memory,
        emailSending: sending,
        approvalStore: approvals,
        usagePool: pool,
    });
    t.after(() => app.close());
    async function workspace(name: string) {
        const user = (await identities.register(name, 'unused'))!;
        const owner = user.personalAccountId;
        const token = randomBytes(32).toString('base64url');
        await identities.createSession(user.id, owner, token);
        const identity = (await identities.authenticateSession(token))!;
        const expires = new Date(Date.now() + 60000).toISOString();
        const key = await identities.createKey(
            identity,
            'Workspace key',
            ['account:read', 'resources:write'],
            expires,
        );
        const runner = await identities.createKey(identity, 'Run only', ['tools:run'], expires);
        return {
            owner,
            headers: { authorization: `Bearer ${key.key}` },
            runner: { authorization: `Bearer ${runner.key}` },
        };
    }
    const first = await workspace('usage-first');
    const second = await workspace('usage-second');
    const created = await app.inject({
        method: 'POST',
        url: '/api/inboxes',
        headers: first.headers,
    });
    assert.equal(created.statusCode, 201, created.body);
    const saved = await app.inject({
        method: 'PUT',
        url: '/api/memory/default/fixture',
        headers: first.headers,
        payload: { value: 'hello' },
    });
    assert.equal(saved.statusCode, 200, saved.body);
    const asked = await app.inject({
        method: 'POST',
        url: '/api/approvals',
        headers: first.headers,
        payload: { question: 'Continue the fixture?' },
    });
    assert.equal(asked.statusCode, 201, asked.body);
    const usage = async (headers?: Record<string, string>) => {
        const response = await app.inject({ url: '/api/usage', ...(headers ? { headers } : {}) });
        assert.equal(response.statusCode, 200, response.body);
        return response.json();
    };
    const firstUsage = await usage(first.headers);
    const counters = Object.fromEntries(
        firstUsage.items.map((item: { key: string; used: number }) => [item.key, item.used]),
    );
    assert.equal(counters['resources.active'], 1);
    assert.equal(counters['memory.bytes'], 7);
    assert.equal(counters['approvals.questions'], 1);
    assert.equal(firstUsage.period.end, firstUsage.resetsAt);
    assert.equal(Date.parse(firstUsage.period.end) - Date.parse(firstUsage.period.start), 86400000);
    const secondUsage = await usage(second.headers);
    assert.ok(secondUsage.items.every((item: { used: number }) => item.used === 0));
    for (const headers of [first.runner, undefined]) {
        const scoped = await usage(headers);
        assert.deepEqual(
            scoped.items.map((item: { key: string }) => item.key),
            ['tools.runs'],
        );
    }
});

test('concurrent monitor creation across replicas stops at the plan allowance', async (t) => {
    const identities = new PostgresIdentityRepository(pool);
    const options = {
        identityStore: identities,
        recoveryStore: new PostgresRecoveryRepository(pool),
        monitorStore: new PostgresMonitors(pool),
    };
    const apps = [buildApp(options), buildApp(options)];
    t.after(async () => {
        await Promise.all(apps.map((app) => app.close()));
    });
    const origin = 'http://localhost:3000';
    const registered = await apps[0]!.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username: 'monitor-quota-owner',
            email: 'monitor-quota@example.test',
            password: 'correct-horse-battery-staple',
        },
    });
    assert.equal(registered.statusCode, 201, registered.body);
    const headers = { origin, cookie: String(registered.headers['set-cookie']).split(';')[0]! };
    const post = (index: number) =>
        apps[index % 2]!.inject({
            method: 'POST',
            url: '/api/monitors',
            headers,
            payload: { kind: 'heartbeat', name: `Monitor ${index}`, intervalSeconds: 300 },
        });
    const results = await Promise.all(Array.from({ length: 25 }, (_, index) => post(index)));
    assert.equal(results.filter((response) => response.statusCode === 201).length, 20);
    for (const response of results.filter((response) => response.statusCode !== 201)) {
        assert.equal(response.statusCode, 402, response.body);
        assert.equal(response.headers['retry-after'], undefined);
        const { requestId, error, message, ...details } = response.json();
        assert.equal(error, message);
        assert.match(error, /allowance/);
        assert.deepEqual(details, {
            code: 'limit_reached',
            limit: 'monitors.active',
            used: 20,
            max: 20,
            plan: 'free',
            requiredPlan: 'pro',
            upgradeUrl: 'http://localhost:3000/pricing/',
        });
    }
});

test('PostgreSQL resource and storage rejections report the checked limits', async (t) => {
    const app = buildApp({
        inboxStore: new PostgresInboxStore(pool, {}, true),
        resourceStore: new PostgresResourceStore(pool, undefined, undefined, true),
    });
    t.after(() => app.close());
    const caps = plans.anonymous;
    for (let i = 0; i < caps.maxResources; i++) {
        const response = await app.inject({ method: 'POST', url: '/api/inboxes' });
        assert.equal(response.statusCode, 201, response.body);
    }
    const count = await app.inject({ method: 'POST', url: '/api/inboxes' });
    assert.equal(count.statusCode, 402, count.body);
    assert.equal(count.json().limit, 'resources.active');
    assert.equal(count.json().used, caps.maxResources);
    assert.equal(count.json().max, caps.maxResources);
    assert.equal(count.json().plan, 'anonymous');
    const original = (await pool.query("SELECT settings FROM usage_plans WHERE id='anonymous'"))
        .rows[0].settings;
    try {
        await pool.query(
            "UPDATE usage_plans SET settings=jsonb_set(settings,'{storageBytes}','64') WHERE id='anonymous'",
        );
        const storage = await app.inject({
            method: 'POST',
            url: '/api/files',
            remoteAddress: '192.0.2.30',
            headers: { 'content-type': 'application/octet-stream', 'x-file-name': 'fixture.txt' },
            payload: 'a'.repeat(128),
        });
        assert.equal(storage.statusCode, 402, storage.body);
        assert.equal(storage.json().limit, 'resources.storage');
        assert.equal(storage.json().used, 0);
        assert.equal(storage.json().max, 64);
        assert.equal(storage.json().plan, 'anonymous');
    } finally {
        await pool.query("UPDATE usage_plans SET settings=$1 WHERE id='anonymous'", [original]);
    }
});
