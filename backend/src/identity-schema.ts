import type { PoolClient } from 'pg';
import { plans } from '@kivel.io/tools/plans';
export async function identitySchema(client: PoolClient) {
    await client.query(`
        CREATE TABLE accounts (
            id uuid PRIMARY KEY,
            name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
            plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team')),
            plan_valid_until timestamptz,
            quota_key bytea NOT NULL UNIQUE CHECK (octet_length(quota_key) = 32),
            stripe_customer_id text UNIQUE,
            stripe_subscription_id text,
            stripe_event_created bigint NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp()
        );
        CREATE TABLE users (
            id uuid PRIMARY KEY,
            username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$'),
            password_hash text NOT NULL,
            personal_account_id uuid NOT NULL REFERENCES accounts(id) DEFERRABLE INITIALLY DEFERRED,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            disabled_at timestamptz
        );
        CREATE TABLE account_members (
            account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
            PRIMARY KEY (account_id, user_id)
        );
        CREATE TABLE auth_sessions (
            token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            expires_at timestamptz NOT NULL,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp()
        );
        CREATE INDEX auth_sessions_expiration ON auth_sessions(expires_at);
        CREATE TABLE api_keys (
            id uuid PRIMARY KEY,
            token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
            prefix text NOT NULL,
            scopes text[] NOT NULL,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            expires_at timestamptz NOT NULL,
            revoked_at timestamptz,
            last_used_at timestamptz
        );
        CREATE INDEX api_keys_owner ON api_keys(user_id, account_id);
        CREATE TABLE account_invites (
            token_hash bytea PRIMARY KEY,
            account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            username text NOT NULL,
            role text NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
            expires_at timestamptz NOT NULL
        );
        CREATE TABLE usage_plans (id text PRIMARY KEY, settings jsonb NOT NULL);
        CREATE TABLE principal_usage (
            key_hash bytea PRIMARY KEY CHECK (octet_length(key_hash) = 32),
            account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
            resource_count integer NOT NULL DEFAULT 0 CHECK (resource_count >= 0),
            stored_bytes bigint NOT NULL DEFAULT 0 CHECK (stored_bytes >= 0),
            updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
        );
        CREATE TABLE tool_usage_daily (
            key_hash bytea NOT NULL,
            day bigint NOT NULL,
            account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
            count integer NOT NULL CHECK (count > 0),
            PRIMARY KEY (key_hash, day)
        );
        CREATE TABLE resource_events (
            sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            resource_id uuid NOT NULL,
            kind text NOT NULL,
            action text NOT NULL,
            timestamp timestamptz NOT NULL DEFAULT clock_timestamp()
        );
        CREATE INDEX resource_events_owner ON resource_events(account_id, sequence);
        CREATE TABLE stripe_events (id text PRIMARY KEY, created bigint NOT NULL, processed_at timestamptz NOT NULL DEFAULT clock_timestamp());
        ALTER TABLE inboxes ADD COLUMN owner_id uuid REFERENCES accounts(id), ADD COLUMN quota_key bytea,
            ADD COLUMN created_at timestamptz NOT NULL DEFAULT clock_timestamp(), ADD COLUMN persistent boolean NOT NULL DEFAULT false,
            ADD COLUMN request_limit integer NOT NULL DEFAULT 100, ADD COLUMN byte_limit bigint NOT NULL DEFAULT 1048576;
        ALTER TABLE temporary_resources ADD COLUMN owner_id uuid REFERENCES accounts(id), ADD COLUMN quota_key bytea,
            ADD COLUMN created_at timestamptz NOT NULL DEFAULT clock_timestamp(), ADD COLUMN persistent boolean NOT NULL DEFAULT false,
            ADD COLUMN use_limit bigint;
        UPDATE temporary_resources SET use_limit = 100 WHERE kind = 'file';
        CREATE INDEX inboxes_owner ON inboxes(owner_id, expires_at);
        CREATE INDEX temporary_resources_owner ON temporary_resources(owner_id, expires_at);
    `);
    for (const [id, settings] of Object.entries(plans))
        await client.query('INSERT INTO usage_plans (id, settings) VALUES ($1, $2)', [
            id,
            JSON.stringify(settings),
        ]);
    await client.query(quotaFunction);
    await client.query(`
        CREATE TRIGGER inbox_quota AFTER INSERT OR UPDATE OR DELETE ON inboxes FOR EACH ROW EXECUTE FUNCTION enforce_resource_quota();
        CREATE TRIGGER temporary_resource_quota AFTER INSERT OR UPDATE OR DELETE ON temporary_resources FOR EACH ROW EXECUTE FUNCTION enforce_resource_quota();
    `);
}

export const quotaFunction = `
        CREATE OR REPLACE FUNCTION enforce_resource_quota() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE
            principal bytea;
            owner uuid;
            plan_id text := 'anonymous';
            config jsonb;
            next_count integer;
            next_bytes bigint;
            count_delta integer := 0;
            bytes_delta bigint := 0;
            resource_kind text;
            operation text;
            record_event boolean := true;
        BEGIN
            IF TG_TABLE_NAME = 'inboxes' THEN resource_kind := 'inbox'; ELSIF TG_OP = 'DELETE' THEN resource_kind := OLD.kind; ELSE resource_kind := NEW.kind; END IF;
            IF TG_OP = 'DELETE' THEN
                principal := OLD.quota_key; owner := OLD.owner_id; count_delta := -1; bytes_delta := -OLD.stored_bytes;
                operation := CASE WHEN OLD.expires_at <= clock_timestamp() THEN 'expired' ELSE 'deleted' END;
            ELSE
                principal := NEW.quota_key; owner := NEW.owner_id;
                IF TG_OP = 'INSERT' THEN count_delta := 1; bytes_delta := NEW.stored_bytes; operation := 'created';
                ELSE
                    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.quota_key IS DISTINCT FROM OLD.quota_key THEN RAISE EXCEPTION 'resource_owner_immutable'; END IF;
                    bytes_delta := NEW.stored_bytes - OLD.stored_bytes;
                    record_event := false;
                    IF NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.persistent IS DISTINCT FROM OLD.persistent THEN operation := 'renewed'; record_event := true;
                    ELSIF NEW.visibility IS DISTINCT FROM OLD.visibility OR NEW.access_version IS DISTINCT FROM OLD.access_version THEN operation := 'sharing_updated'; record_event := true;
                    ELSIF TG_TABLE_NAME = 'temporary_resources' THEN IF NEW.payload IS DISTINCT FROM OLD.payload THEN operation := 'updated'; record_event := true; END IF; END IF;
                END IF;
            END IF;
            IF principal IS NOT NULL AND (count_delta <> 0 OR bytes_delta <> 0) THEN
                IF octet_length(principal) <> 32 THEN RAISE EXCEPTION 'invalid_quota_principal'; END IF;
                IF owner IS NOT NULL THEN
                    SELECT CASE WHEN a.plan <> 'free' AND a.plan_valid_until > clock_timestamp() THEN a.plan ELSE 'free' END INTO plan_id FROM accounts a WHERE a.id = owner AND a.quota_key = principal;
                    IF plan_id IS NULL THEN RAISE EXCEPTION 'invalid_quota_principal'; END IF;
                END IF;
                INSERT INTO principal_usage (key_hash, account_id) VALUES (principal, owner) ON CONFLICT DO NOTHING;
                SELECT resource_count + count_delta, stored_bytes + bytes_delta INTO next_count, next_bytes FROM principal_usage WHERE key_hash = principal FOR UPDATE;
                SELECT settings INTO config FROM usage_plans WHERE id = plan_id;
                IF count_delta > 0 AND next_count > (config->>'maxResources')::integer THEN RAISE EXCEPTION 'account_resource_limit'; END IF;
                IF bytes_delta > 0 AND next_bytes > (config->>'storageBytes')::bigint THEN RAISE EXCEPTION 'account_storage_limit'; END IF;
                UPDATE principal_usage SET resource_count = next_count, stored_bytes = next_bytes, updated_at = clock_timestamp() WHERE key_hash = principal;
            END IF;
            IF owner IS NOT NULL AND record_event THEN
                INSERT INTO resource_events (account_id, resource_id, kind, action) VALUES (owner, CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END, resource_kind, operation);
            END IF;
            IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
        END $$;
`;
