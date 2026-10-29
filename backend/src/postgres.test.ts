import DodoPayments from 'dodopayments';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { randomBytes, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from './database.js';
import { PostgresInboxStore, PostgresRateLimiter } from './postgres.js';
import { buildApp } from './app.js';
import { PostgresResourceStore } from './resources.js';
import { PostgresMockCalls } from './mock-calls.js';
import { PostgresEmailMessages } from './email.js';
import { PostgresActivity } from './activity.js';
import { PostgresKv } from './kv.js';
import { PostgresMonitors } from './monitors.js';
import { PostgresAgents } from './agents.js';
import type { CrudState } from '@socket-help/tools/mock-crud';
import { PostgresRecoveryRepository } from './recovery-store.js';
import { passwordHash, PostgresIdentityRepository } from './identity.js';
import ssh2 from 'ssh2';
import type { Client as SshClient } from 'ssh2';
const { Client, utils } = ssh2;
import { createSshServer } from './ssh.js';
import { BillingRepository } from './billing.js';
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
        'TRUNCATE captured_requests, inboxes, rate_windows, temporary_resources, users, accounts, principal_usage, tool_usage_daily, resource_events, stripe_events, dodo_events RESTART IDENTITY CASCADE',
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
         DROP TABLE mock_calls, inbox_deliveries, email_messages, activity_log, kv_entries, monitor_events, monitors, agent_logins, agents, user_contact_emails, auth_mail_outbox, auth_challenges, user_recovery_emails, temporary_resources, resource_usage, account_members, auth_sessions, api_keys, account_invites, users, accounts, usage_plans, principal_usage, tool_usage_daily, resource_events, stripe_events, dodo_events CASCADE; DELETE FROM schema_migrations WHERE version > 1`,
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
        10,
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
    const app = buildApp({
        identityStore: identities,
        recoveryStore: new PostgresRecoveryRepository(pool),
        rateLimiter: new PostgresRateLimiter(pool),
    });
    const hostKey = Buffer.from(utils.generateKeyPairSync('ed25519').private),
        parsed = utils.parseKey(hostKey);
    assert.ok(!(parsed instanceof Error));
    const hash = createHash('sha256').update(parsed.getPublicSSH()).digest('hex');
    const gateway = createSshServer(app, identities, new PostgresRateLimiter(pool), hostKey);
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
                username: 'socket',
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
    const response = await execute(client, 'socket-help run json', '{"integer":9007199254740993}');
    assert.equal(response.code, 0);
    assert.match(JSON.parse(response.stdout).output, /9007199254740993/);
    assert.equal((await execute(client, 'socket-help usage')).code, 0);
    const mock = await execute(
        client,
        'socket-help api POST /api/mocks',
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
        `socket-help api POST /mock/${mockId}/tasks`,
        '{"id":"ssh","name":"SSH record"}',
    );
    assert.equal(record.code, 0, record.stderr);
    assert.equal(JSON.parse(record.stdout).id, 'ssh');
    const list = await execute(client, `socket-help api GET /mock/${mockId}/tasks`);
    assert.equal(list.code, 0, list.stderr);
    assert.equal(JSON.parse(list.stdout).total, 1);
    assert.equal((await execute(client, `socket-help api DELETE /api/mocks/${mockId}`)).code, 0);
    const echo = await execute(
        client,
        'socket-help api POST /api/mocks',
        JSON.stringify({ name: 'SSH echo fixture', routes: [], echo: true }),
    );
    assert.equal(echo.code, 0, echo.stderr);
    const echoId = JSON.parse(echo.stdout).id;
    const observed = await execute(
        client,
        `socket-help api POST /mock/${echoId}/check`,
        '{"event":"ssh.created"}',
    );
    assert.equal(observed.code, 0, observed.stderr);
    assert.equal(JSON.parse(observed.stdout).body.value.event, 'ssh.created');
    assert.equal(JSON.parse(observed.stdout).headers.authorization, '[REDACTED]');
    assert.ok(!observed.stdout.includes(credential.key));
    assert.equal((await execute(client, `socket-help api DELETE /api/mocks/${echoId}`)).code, 0);
    client.end();
    const malicious = await connect();
    await assert.rejects(execute(malicious, 'cat /etc/passwd'), /Unable to exec/);
    malicious.end();
    const revoked = await connect();
    await identities.revokeKey(identity, credential.info.id);
    const denied = await execute(revoked, 'socket-help usage');
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
        active = false;
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
                return Response.json({ id: 'cks_1', payment_status: history ? 'succeeded' : null });
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
    const portal = await app.inject({
        method: 'POST',
        url: '/api/billing/portal',
        headers: { origin, cookie },
    });
    assert.equal(portal.statusCode, 200, portal.body);
    assert.equal(portalCreates, 1);
    active = true;
    assert.equal((await checkout()).statusCode, 409);
    assert.equal(checkoutCreates, 1);
    active = false;
    history = true;
    assert.equal((await checkout()).statusCode, 200);
    assert.equal(checkoutCreates, 2);
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
        'ALTER TABLE accounts DROP COLUMN dodo_customer_id, DROP COLUMN dodo_subscription_id, DROP COLUMN dodo_event_created, DROP COLUMN dodo_checkout_id, DROP COLUMN dodo_checkout_url, DROP COLUMN dodo_checkout_plan; DROP TABLE dodo_events; ALTER TABLE inboxes DROP COLUMN response, DROP COLUMN forward_url; DROP TABLE mock_calls, inbox_deliveries, email_messages, activity_log, kv_entries, monitor_events, monitors, agent_logins, agents; DELETE FROM schema_migrations WHERE version >= 8',
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
    assert.equal(await kv.set(account, entry('a/1', 60), 100), 'stored');
    assert.equal(await kv.set(account, entry('a/2', 50), 100), 'full');
    assert.equal(await kv.set(account, entry('a/1', 90), 100), 'stored');
    assert.equal(await kv.usage(account), 90);
    assert.equal(
        await kv.set(account, entry('b/old', 5, new Date(Date.now() - 1000).toISOString()), 100),
        'stored',
    );
    assert.equal(await kv.get(account, 'ns', 'b/old'), undefined);
    assert.deepEqual(
        (await kv.list(account, 'ns', 'a/')).map((item) => item.key),
        ['a/1'],
    );
    await kv.deleteExpired();
    assert.equal(await kv.usage(account), 90);
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
    await store.create({ ...base, id }, 'ping-hash');
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
