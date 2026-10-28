import type { Pool } from 'pg';

export const ACTIVITY_LIMIT = 500;

/** One tool call an agent made for a workspace. Metadata only: never arguments or results. */
export interface ActivityEntry {
    at: string;
    tool: string;
    ok: boolean;
    durationMs: number;
    keyId?: string;
}

type MaybePromise<T> = T | Promise<T>;
export interface ActivityRepository {
    record(accountId: string, entry: ActivityEntry): MaybePromise<void>;
    list(accountId: string): MaybePromise<ActivityEntry[]>;
}

export class MemoryActivity implements ActivityRepository {
    private readonly entries = new Map<string, ActivityEntry[]>();
    record(accountId: string, entry: ActivityEntry) {
        const list = this.entries.get(accountId) ?? [];
        list.push(entry);
        if (list.length > ACTIVITY_LIMIT) list.shift();
        this.entries.set(accountId, list);
    }
    list(accountId: string) {
        return [...(this.entries.get(accountId) ?? [])].reverse();
    }
}

export class PostgresActivity implements ActivityRepository {
    constructor(private readonly pool: Pool) {}
    async record(accountId: string, entry: ActivityEntry) {
        // The DELETE sees the table before this INSERT, so it keeps one fewer old row.
        await this.pool.query(
            `WITH added AS (
                INSERT INTO activity_log (account_id, entry) VALUES ($1, $2::jsonb)
                RETURNING account_id
            )
            DELETE FROM activity_log WHERE account_id IN (SELECT account_id FROM added)
                AND sequence <= (
                    SELECT sequence FROM activity_log WHERE account_id = $1
                    ORDER BY sequence DESC OFFSET $3 LIMIT 1
                )`,
            [accountId, JSON.stringify(entry), ACTIVITY_LIMIT - 1],
        );
    }
    async list(accountId: string) {
        const result = await this.pool.query<{ entry: ActivityEntry }>(
            'SELECT entry FROM activity_log WHERE account_id = $1 ORDER BY sequence DESC',
            [accountId],
        );
        return result.rows.map((row) => row.entry);
    }
}
