import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import { transaction } from './database.js';
import type { MemoryIdentityRepository } from './identity.js';

export type Purpose = 'verify' | 'reset';
export interface RecoveryStatus {
    email: string | null;
    pendingEmail: string | null;
    verifiedAt: string | null;
}
export interface Challenge {
    userId: string;
    purpose: Purpose;
    email: string;
    hash: Buffer;
    passwordHash: string;
    expires: number;
    payload: Buffer;
}
export interface MailJob {
    id: string;
    payload: Buffer;
    attempts: number;
}
export interface RecoveryRepository {
    status(userId: string): Promise<RecoveryStatus>;
    contact(userId: string, email: string): Promise<void>;
    recipient(
        email: string,
    ): Promise<{ userId: string; username: string; passwordHash: string } | undefined>;
    issue(challenge: Challenge): Promise<void>;
    consume(
        userId: string | null,
        email: string | null,
        purpose: Purpose,
        hash: Buffer,
        password?: string,
    ): Promise<boolean>;
    claim(): Promise<MailJob | undefined>;
    finish(id: string, delivered: boolean): Promise<void>;
    cleanup(): Promise<void>;
}
const empty = (): RecoveryStatus => ({ email: null, pendingEmail: null, verifiedAt: null });

export class MemoryRecoveryRepository implements RecoveryRepository {
    private contacts = new Map<string, string>();
    private emails = new Map<string, { email: string; verifiedAt: string }>();
    private challenges = new Map<string, Challenge & { attempts: number }>();
    private jobs = new Map<
        string,
        MailJob & {
            userId: string;
            purpose: Purpose;
            expires: number;
            available: number;
            leased: number;
        }
    >();
    constructor(
        private identities: MemoryIdentityRepository,
        private now = Date.now,
    ) {}
    async contact(userId: string, email: string) {
        this.contacts.set(userId, email);
    }
    async status(userId: string) {
        const verified = this.emails.get(userId),
            pending = this.challenges.get(`${userId}:verify`);
        return {
            ...empty(),
            email: this.contacts.get(userId) ?? null,
            ...verified,
            pendingEmail: pending && pending.expires > this.now() ? pending.email : null,
        };
    }
    async recipient(email: string) {
        const userId = [...this.emails].find(([, item]) => item.email === email)?.[0];
        const user = userId ? this.identities.userById(userId) : undefined;
        return user
            ? { userId: user.id, username: user.username, passwordHash: user.passwordHash }
            : undefined;
    }
    async issue(value: Challenge) {
        if (this.identities.userById(value.userId)?.passwordHash !== value.passwordHash) return;
        this.challenges.set(`${value.userId}:${value.purpose}`, { ...value, attempts: 0 });
        for (const [id, job] of this.jobs)
            if (job.userId === value.userId && job.purpose === value.purpose) this.jobs.delete(id);
        const id = randomUUID();
        this.jobs.set(id, {
            id,
            userId: value.userId,
            purpose: value.purpose,
            payload: value.payload,
            attempts: 0,
            expires: value.expires,
            available: this.now(),
            leased: 0,
        });
    }
    async consume(
        userId: string | null,
        email: string | null,
        purpose: Purpose,
        hash: Buffer,
        password?: string,
    ) {
        if (purpose === 'reset')
            userId = [...this.emails].find(([, item]) => item.email === email)?.[0] ?? null;
        if (!userId) return false;
        const key = `${userId}:${purpose}`,
            value = this.challenges.get(key);
        if (
            !value ||
            value.expires <= this.now() ||
            value.attempts >= 5 ||
            this.identities.userById(userId)?.passwordHash !== value.passwordHash
        )
            return false;
        value.attempts++;
        if (!timingSafeEqual(value.hash, hash)) return false;
        if (purpose === 'verify') {
            if ([...this.emails].some(([id, item]) => id !== userId && item.email === value.email))
                return false;
            this.contacts.set(userId, value.email);
            this.emails.set(userId, {
                email: value.email,
                verifiedAt: new Date(this.now()).toISOString(),
            });
        } else {
            if (!password || this.emails.get(userId)?.email !== value.email) return false;
            this.identities.resetPassword(userId, password);
        }
        for (const entry of ['verify', 'reset']) this.challenges.delete(`${userId}:${entry}`);
        for (const [id, job] of this.jobs) if (job.userId === userId) this.jobs.delete(id);
        return true;
    }
    async claim() {
        const job = [...this.jobs.values()].find(
            (item) =>
                item.expires > this.now() &&
                item.available <= this.now() &&
                item.leased <= this.now() &&
                item.attempts < 5,
        );
        if (!job) return undefined;
        job.attempts++;
        job.leased = this.now() + 60000;
        return { id: job.id, payload: job.payload, attempts: job.attempts };
    }
    async finish(id: string, delivered: boolean) {
        const job = this.jobs.get(id);
        if (!job) return;
        if (delivered || job.attempts >= 5) this.jobs.delete(id);
        else {
            job.available = this.now() + 15000 * 2 ** (job.attempts - 1);
            job.leased = 0;
        }
    }
    async cleanup() {
        for (const [id, value] of this.challenges)
            if (value.expires <= this.now()) this.challenges.delete(id);
        for (const [id, value] of this.jobs) if (value.expires <= this.now()) this.jobs.delete(id);
    }
}

export class PostgresRecoveryRepository implements RecoveryRepository {
    constructor(private pool: Pool) {}
    async contact(userId: string, email: string) {
        await this.pool.query(
            'INSERT INTO user_contact_emails (user_id,email) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email',
            [userId, email],
        );
    }
    async status(userId: string) {
        const row = (
            await this.pool.query(
                `SELECT COALESCE(e.email,r.email) AS email, e.verified_at, c.email AS pending_email FROM users u LEFT JOIN user_contact_emails r ON r.user_id = u.id LEFT JOIN user_recovery_emails e ON e.user_id = u.id LEFT JOIN auth_challenges c ON c.user_id = u.id AND c.purpose = 'verify' AND c.expires_at > clock_timestamp() WHERE u.id = $1`,
                [userId],
            )
        ).rows[0];
        return row
            ? {
                  email: row.email ?? null,
                  verifiedAt: row.verified_at?.toISOString() ?? null,
                  pendingEmail: row.pending_email ?? null,
              }
            : empty();
    }
    async recipient(email: string) {
        const row = (
            await this.pool.query(
                'SELECT u.id, u.username, u.password_hash FROM users u JOIN user_recovery_emails e ON e.user_id = u.id WHERE e.email = $1 AND u.disabled_at IS NULL',
                [email],
            )
        ).rows[0];
        return row
            ? {
                  userId: row.id as string,
                  username: row.username as string,
                  passwordHash: row.password_hash as string,
              }
            : undefined;
    }
    async issue(value: Challenge) {
        await transaction(this.pool, async (client) => {
            const user = (
                await client.query(
                    'SELECT password_hash FROM users WHERE id = $1 AND disabled_at IS NULL FOR UPDATE',
                    [value.userId],
                )
            ).rows[0];
            if (user?.password_hash !== value.passwordHash) return;
            await client.query('DELETE FROM auth_mail_outbox WHERE user_id = $1 AND purpose = $2', [
                value.userId,
                value.purpose,
            ]);
            await client.query(
                `INSERT INTO auth_challenges (user_id, purpose, email, code_hash, password_hash, expires_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id,purpose) DO UPDATE SET email = EXCLUDED.email, code_hash = EXCLUDED.code_hash, password_hash = EXCLUDED.password_hash, expires_at = EXCLUDED.expires_at, attempts = 0`,
                [
                    value.userId,
                    value.purpose,
                    value.email,
                    value.hash,
                    value.passwordHash,
                    new Date(value.expires),
                ],
            );
            await client.query(
                'INSERT INTO auth_mail_outbox (id, user_id, purpose, payload, expires_at) VALUES ($1,$2,$3,$4,$5)',
                [randomUUID(), value.userId, value.purpose, value.payload, new Date(value.expires)],
            );
        });
    }
    async consume(
        userId: string | null,
        email: string | null,
        purpose: Purpose,
        hash: Buffer,
        password?: string,
    ) {
        return transaction(this.pool, async (client) => {
            const user = (
                await client.query(
                    purpose === 'reset'
                        ? 'SELECT u.id, u.username, u.password_hash FROM users u JOIN user_recovery_emails e ON e.user_id = u.id WHERE e.email = $1 AND u.disabled_at IS NULL FOR UPDATE OF u'
                        : 'SELECT id, password_hash FROM users WHERE id = $1 AND disabled_at IS NULL FOR UPDATE',
                    [purpose === 'reset' ? email : userId],
                )
            ).rows[0];
            if (!user) return false;
            const challenge = (
                await client.query(
                    'SELECT * FROM auth_challenges WHERE user_id = $1 AND purpose = $2 AND expires_at > clock_timestamp() AND attempts < 5 FOR UPDATE',
                    [user.id, purpose],
                )
            ).rows[0];
            if (!challenge || challenge.password_hash !== user.password_hash) return false;
            await client.query(
                'UPDATE auth_challenges SET attempts = attempts + 1 WHERE user_id = $1 AND purpose = $2',
                [user.id, purpose],
            );
            if (!timingSafeEqual(challenge.code_hash, hash)) return false;
            if (purpose === 'verify') {
                const result = await client.query(
                    'INSERT INTO user_recovery_emails (user_id,email) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING user_id',
                    [user.id, challenge.email],
                );
                if (!result.rowCount) {
                    const updated = await client.query(
                        'UPDATE user_recovery_emails SET email = $2, verified_at = clock_timestamp() WHERE user_id = $1 AND NOT EXISTS (SELECT 1 FROM user_recovery_emails WHERE email = $2 AND user_id <> $1) RETURNING user_id',
                        [user.id, challenge.email],
                    );
                    if (!updated.rowCount) return false;
                }
            } else {
                if (!password || challenge.email !== email) return false;
                await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [
                    user.id,
                    password,
                ]);
                await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [user.id]);
                await client.query(
                    'UPDATE api_keys SET revoked_at = clock_timestamp() WHERE user_id = $1 AND revoked_at IS NULL',
                    [user.id],
                );
            }
            if (purpose === 'verify')
                await client.query(
                    'INSERT INTO user_contact_emails (user_id,email) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email',
                    [user.id, challenge.email],
                );
            await client.query('DELETE FROM auth_mail_outbox WHERE user_id = $1', [user.id]);
            await client.query('DELETE FROM auth_challenges WHERE user_id = $1', [user.id]);
            return true;
        }).catch((error) => {
            if ((error as { code?: string }).code === '23505') return false;
            throw error;
        });
    }
    async claim() {
        const row = (
            await this.pool.query(
                `UPDATE auth_mail_outbox SET attempts = attempts + 1, lease_until = clock_timestamp() + interval '60 seconds' WHERE id = (SELECT id FROM auth_mail_outbox WHERE available_at <= clock_timestamp() AND lease_until <= clock_timestamp() AND expires_at > clock_timestamp() AND attempts < 5 ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,payload,attempts`,
            )
        ).rows[0];
        return row
            ? {
                  id: row.id as string,
                  payload: row.payload as Buffer,
                  attempts: row.attempts as number,
              }
            : undefined;
    }
    async finish(id: string, delivered: boolean) {
        if (delivered) await this.pool.query('DELETE FROM auth_mail_outbox WHERE id = $1', [id]);
        else
            await this.pool.query(
                `UPDATE auth_mail_outbox SET available_at = clock_timestamp() + (15000 * power(2,attempts - 1)) * interval '1 millisecond', lease_until = '-infinity' WHERE id = $1`,
                [id],
            );
    }
    async cleanup() {
        await this.pool.query(
            'DELETE FROM auth_mail_outbox WHERE expires_at <= clock_timestamp() OR attempts >= 5; DELETE FROM auth_challenges WHERE expires_at <= clock_timestamp()',
        );
    }
}

export const recoverySchema = `
CREATE TABLE user_recovery_emails (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email text NOT NULL UNIQUE CHECK (length(email) <= 254 AND email = lower(email)),
    verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE auth_challenges (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose text NOT NULL CHECK (purpose IN ('verify','reset')),
    email text NOT NULL,
    code_hash bytea NOT NULL CHECK (octet_length(code_hash) = 32),
    password_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
    PRIMARY KEY (user_id,purpose)
);
CREATE TABLE auth_mail_outbox (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose text NOT NULL CHECK (purpose IN ('verify','reset')),
    payload bytea NOT NULL,
    expires_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    lease_until timestamptz NOT NULL DEFAULT '-infinity',
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
    UNIQUE (user_id,purpose)
);
CREATE INDEX auth_mail_ready ON auth_mail_outbox(available_at);
`;

export const contactEmailSchema = `CREATE TABLE user_contact_emails (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, email text NOT NULL CHECK (length(email) <= 254 AND email = lower(email)));`;
