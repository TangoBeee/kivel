import { Pool } from 'pg';
import { recoverySchema, contactEmailSchema } from './recovery-store.js';
import { identitySchema, quotaFunction } from './identity-schema.js';
import type { PoolClient } from 'pg';

const schema = `
CREATE TABLE platform_usage (
    id integer PRIMARY KEY CHECK (id = 1),
    inbox_count integer NOT NULL DEFAULT 0 CHECK (inbox_count >= 0),
    stored_bytes bigint NOT NULL DEFAULT 0 CHECK (stored_bytes >= 0)
);
INSERT INTO platform_usage (id) VALUES (1);
CREATE TABLE inboxes (
    id uuid PRIMARY KEY,
    token_hash bytea NOT NULL CHECK (octet_length(token_hash) = 32),
    expires_at timestamptz NOT NULL,
    request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
    stored_bytes bigint NOT NULL DEFAULT 0 CHECK (stored_bytes >= 0)
);
CREATE INDEX inboxes_expiration ON inboxes (expires_at);
CREATE TABLE captured_requests (
    sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id uuid NOT NULL UNIQUE,
    inbox_id uuid NOT NULL REFERENCES inboxes(id) ON DELETE CASCADE,
    record text NOT NULL,
    stored_bytes integer NOT NULL CHECK (stored_bytes > 0)
);
CREATE INDEX requests_by_inbox ON captured_requests (inbox_id, sequence);
CREATE TABLE rate_windows (
    key_hash bytea PRIMARY KEY,
    count integer NOT NULL CHECK (count > 0),
    expires_at timestamptz NOT NULL
);
CREATE INDEX rate_windows_expiration ON rate_windows (expires_at);
`;

export function createPool(connectionString: string): Pool {
    const pool = new Pool({
        connectionString,
        max: 10,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30_000,
        statement_timeout: 10_000,
        application_name: 'socket-help',
    });
    return pool;
}

export async function transaction<T>(
    pool: Pool,
    operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
    const client = await pool.connect();
    let destroy = false;
    try {
        await client.query('BEGIN');
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            destroy = true;
        }
        throw error;
    } finally {
        client.release(destroy);
    }
}

export async function migrate(pool: Pool): Promise<void> {
    await transaction(pool, async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(784239)');
        await client.query(
            'CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY)',
        );
        const result = await client.query(
            'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
        );
        const version = result.rows[0]?.version ?? 0;
        if (version > 13) throw new Error('Database schema is newer than this application.');
        if (version < 1) {
            await client.query(schema);
            await client.query('INSERT INTO schema_migrations (version) VALUES (1)');
        }
        if (version < 2) {
            await client.query(`
                CREATE TABLE resource_usage (
                    id integer PRIMARY KEY CHECK (id = 1),
                    resource_count integer NOT NULL DEFAULT 0 CHECK (resource_count >= 0),
                    stored_bytes bigint NOT NULL DEFAULT 0 CHECK (stored_bytes >= 0)
                );
                INSERT INTO resource_usage (id) VALUES (1);
                CREATE TABLE temporary_resources (
                    id uuid PRIMARY KEY,
                    kind text NOT NULL CHECK (kind IN ('mock', 'file')),
                    token_hash bytea NOT NULL CHECK (octet_length(token_hash) = 32),
                    payload text NOT NULL,
                    data bytea NOT NULL,
                    expires_at timestamptz NOT NULL,
                    uses bigint NOT NULL DEFAULT 0 CHECK (uses >= 0),
                    stored_bytes bigint NOT NULL CHECK (stored_bytes > 0)
                );
                CREATE INDEX resources_expiration ON temporary_resources (expires_at);
                INSERT INTO schema_migrations (version) VALUES (2);
            `);
        }
        if (version < 3) {
            await client.query(`ALTER TABLE temporary_resources DROP CONSTRAINT temporary_resources_kind_check;
                ALTER TABLE temporary_resources ADD CONSTRAINT temporary_resources_kind_check CHECK (kind IN ('mock', 'file', 'mcp'));
                INSERT INTO schema_migrations (version) VALUES (3);`);
        }
        if (version < 4) {
            await identitySchema(client);
            await client.query('INSERT INTO schema_migrations (version) VALUES (4)');
        }
        if (version < 5) {
            for (const table of ['inboxes', 'temporary_resources'])
                await client.query(
                    `ALTER TABLE ${table} ADD COLUMN visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')), ADD COLUMN access_token_hash bytea, ADD COLUMN access_version uuid NOT NULL DEFAULT gen_random_uuid(), ADD CONSTRAINT sharing_access_valid CHECK ((visibility = 'public' AND access_token_hash IS NULL) OR (visibility = 'private' AND octet_length(access_token_hash) = 32 AND access_token_hash IS NOT NULL))`,
                );
            await client.query(quotaFunction);
            await client.query('INSERT INTO schema_migrations (version) VALUES (5)');
        }
        if (version < 6) {
            await client.query(recoverySchema);
            await client.query('INSERT INTO schema_migrations (version) VALUES (6)');
        }
        if (version < 7) {
            await client.query(contactEmailSchema);
            await client.query('INSERT INTO schema_migrations (version) VALUES (7)');
        }
        if (version < 8) {
            await client.query(`ALTER TABLE accounts ADD COLUMN dodo_customer_id text UNIQUE, ADD COLUMN dodo_subscription_id text, ADD COLUMN dodo_event_created bigint NOT NULL DEFAULT 0, ADD COLUMN dodo_checkout_id text, ADD COLUMN dodo_checkout_url text, ADD COLUMN dodo_checkout_plan text;
                CREATE TABLE dodo_events (id text PRIMARY KEY, created bigint NOT NULL, processed_at timestamptz NOT NULL DEFAULT clock_timestamp());
                INSERT INTO schema_migrations (version) VALUES (8);`);
        }
        if (version < 9) {
            await client.query(`ALTER TABLE inboxes ADD COLUMN response jsonb, ADD COLUMN forward_url text;
                CREATE TABLE inbox_deliveries (
                    sequence bigserial PRIMARY KEY,
                    inbox_id uuid NOT NULL REFERENCES inboxes(id) ON DELETE CASCADE,
                    delivery jsonb NOT NULL
                );
                CREATE INDEX inbox_deliveries_inbox ON inbox_deliveries (inbox_id, sequence);
                CREATE TABLE mock_calls (
                    sequence bigserial PRIMARY KEY,
                    resource_id uuid NOT NULL REFERENCES temporary_resources(id) ON DELETE CASCADE,
                    call jsonb NOT NULL
                );
                CREATE INDEX mock_calls_resource ON mock_calls (resource_id, sequence);
                ALTER TABLE temporary_resources DROP CONSTRAINT temporary_resources_kind_check;
                ALTER TABLE temporary_resources ADD CONSTRAINT temporary_resources_kind_check CHECK (kind IN ('mock', 'file', 'mcp', 'email'));
                CREATE TABLE email_messages (
                    sequence bigserial PRIMARY KEY,
                    resource_id uuid NOT NULL REFERENCES temporary_resources(id) ON DELETE CASCADE,
                    message jsonb NOT NULL
                );
                CREATE INDEX email_messages_resource ON email_messages (resource_id, sequence);
                CREATE TABLE activity_log (
                    sequence bigserial PRIMARY KEY,
                    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    entry jsonb NOT NULL
                );
                CREATE INDEX activity_log_account ON activity_log (account_id, sequence);
                CREATE TABLE kv_entries (
                    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    namespace text NOT NULL,
                    key text NOT NULL,
                    value jsonb NOT NULL,
                    bytes integer NOT NULL,
                    expires_at timestamptz,
                    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
                    PRIMARY KEY (account_id, namespace, key)
                );
                CREATE INDEX kv_entries_expiry ON kv_entries (expires_at) WHERE expires_at IS NOT NULL;
                CREATE TABLE monitors (
                    id uuid PRIMARY KEY,
                    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    monitor jsonb NOT NULL,
                    ping_hash text UNIQUE,
                    next_run_at timestamptz NOT NULL,
                    paused boolean NOT NULL DEFAULT false,
                    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
                );
                CREATE INDEX monitors_due ON monitors (next_run_at) WHERE NOT paused;
                CREATE INDEX monitors_account ON monitors (account_id);
                CREATE TABLE monitor_events (
                    sequence bigserial PRIMARY KEY,
                    monitor_id uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
                    event jsonb NOT NULL
                );
                CREATE INDEX monitor_events_monitor ON monitor_events (monitor_id, sequence);
                INSERT INTO schema_migrations (version) VALUES (9);`);
        }
        if (version < 10) {
            await client.query(`
                CREATE TABLE agent_logins (
                    id uuid PRIMARY KEY,
                    device_hash text NOT NULL UNIQUE,
                    user_code text NOT NULL UNIQUE,
                    name text NOT NULL,
                    client text,
                    status text NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'delivered')),
                    account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
                    sealed_key text,
                    created_at timestamptz NOT NULL,
                    expires_at timestamptz NOT NULL
                );
                CREATE TABLE agents (
                    key_id uuid PRIMARY KEY REFERENCES api_keys(id) ON DELETE CASCADE,
                    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    name text NOT NULL,
                    client text,
                    created_at timestamptz NOT NULL
                );
                CREATE INDEX agents_account ON agents (account_id);
                INSERT INTO schema_migrations (version) VALUES (10);`);
        }
        if (version < 11) {
            await client.query(`
                CREATE TABLE agent_trials (
                    id uuid PRIMARY KEY,
                    token_hash text NOT NULL UNIQUE,
                    login_id uuid NOT NULL REFERENCES agent_logins(id) ON DELETE CASCADE,
                    ip_key text NOT NULL,
                    name text NOT NULL,
                    created_at timestamptz NOT NULL,
                    expires_at timestamptz NOT NULL
                );
                CREATE INDEX agent_trials_network ON agent_trials (ip_key, created_at);
                INSERT INTO schema_migrations (version) VALUES (11);`);
        }
        if (version < 12) {
            await client.query(`
                CREATE TABLE approvals (
                    id uuid PRIMARY KEY,
                    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    approval jsonb NOT NULL,
                    status text NOT NULL,
                    created_at timestamptz NOT NULL,
                    expires_at timestamptz NOT NULL
                );
                CREATE INDEX approvals_account ON approvals (account_id, created_at DESC);
                INSERT INTO schema_migrations (version) VALUES (12);`);
        }
        if (version < 13) {
            await client.query(`
                CREATE TABLE cookie_coupons (
                    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    code text NOT NULL,
                    discount_id text NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
                    expires_at timestamptz NOT NULL
                );
                CREATE INDEX cookie_coupons_account ON cookie_coupons (account_id);
                INSERT INTO schema_migrations (version) VALUES (13);`);
        }
    });
}
