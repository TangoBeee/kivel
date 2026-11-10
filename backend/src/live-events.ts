import { randomUUID } from 'node:crypto';
import { transaction } from './database.js';
import { setTimeout as pause } from 'node:timers/promises';
import type { Pool, PoolClient } from 'pg';

export interface LiveTopic {
    topic: string;
    scopeId: string;
}
export interface LiveEvent extends LiveTopic {
    id: string;
    event: string;
}
export const topicKey = ({ topic, scopeId }: LiveTopic) => `${topic}:${scopeId}`;

export class LiveEvents {
    private client?: PoolClient;
    private retry?: NodeJS.Timeout;
    private stopped = false;
    private readonly listeners = new Map<string, Set<() => void>>();

    constructor(private readonly pool: Pool) {}

    async start() {
        if (this.stopped) return;
        let connection: PoolClient;
        try {
            connection = await this.pool.connect();
        } catch {
            this.reconnect();
            return;
        }
        if (this.stopped) {
            connection.release();
            return;
        }
        this.client = connection;
        const disconnected = () => {
            if (this.client !== connection) return;
            delete this.client;
            connection.release(true);
            this.reconnect();
        };
        connection.once('error', disconnected);
        connection.on('notification', (notification) => {
            if (notification.channel !== 'kivel_events' || !notification.payload) return;
            let event: LiveTopic;
            try {
                event = JSON.parse(notification.payload);
            } catch {
                return;
            }
            if (!event || typeof event.topic !== 'string' || typeof event.scopeId !== 'string')
                return;
            for (const listener of this.listeners.get(topicKey(event)) ?? []) listener();
        });
        try {
            await connection.query('LISTEN kivel_events');
        } catch {
            disconnected();
        }
    }

    private reconnect() {
        if (this.stopped) return;
        this.retry = setTimeout(() => void this.start(), 2000);
        this.retry.unref();
    }

    stop() {
        this.stopped = true;
        clearTimeout(this.retry);
        const client = this.client;
        delete this.client;
        client?.release(true);
    }

    watch(topics: LiveTopic[], listener: () => void) {
        const keys = topics.map(topicKey);
        for (const key of keys) {
            const listeners = this.listeners.get(key) ?? new Set();
            listeners.add(listener);
            this.listeners.set(key, listeners);
        }
        return () => {
            for (const key of keys) {
                const listeners = this.listeners.get(key);
                listeners?.delete(listener);
                if (!listeners?.size) this.listeners.delete(key);
            }
        };
    }

    async wait(topics: LiveTopic[], delay: number, signal: AbortSignal) {
        if (!topics.length) return pause(delay, undefined, { signal }).then(() => {});
        await new Promise<void>((resolve) => {
            const done = () => {
                clearTimeout(timer);
                unsubscribe();
                signal.removeEventListener('abort', done);
                resolve();
            };
            const timer = setTimeout(done, delay);
            const unsubscribe = this.watch(topics, done);
            signal.addEventListener('abort', done, { once: true });
            if (signal.aborted) done();
        });
    }

    async head(topics: LiveTopic[]): Promise<Map<string, string>> {
        const { rows } = await this.pool.query<{ topic: string; scope_id: string; id: string }>(
            `SELECT topic, scope_id, COALESCE(max(e.id), 0)::text AS id
             FROM unnest($1::text[], $2::uuid[]) AS selected(topic, scope_id)
             LEFT JOIN live_events e USING (topic, scope_id)
             GROUP BY topic, scope_id`,
            [topics.map((topic) => topic.topic), topics.map((topic) => topic.scopeId)],
        );
        return new Map(
            rows.map((row) => [topicKey({ topic: row.topic, scopeId: row.scope_id }), row.id]),
        );
    }

    async read(topics: LiveTopic[], cursors: Map<string, string>): Promise<LiveEvent[]> {
        const { rows } = await this.pool.query<LiveEvent>(
            `SELECT e.topic, e.scope_id AS "scopeId", e.id::text, e.event
             FROM unnest($1::text[], $2::uuid[], $3::bigint[]) AS selected(topic, scope_id, cursor_id)
             JOIN live_events e USING (topic, scope_id)
             WHERE e.id > selected.cursor_id
             ORDER BY e.id LIMIT 100`,
            [
                topics.map((topic) => topic.topic),
                topics.map((topic) => topic.scopeId),
                topics.map((topic) => cursors.get(topicKey(topic)) ?? '0'),
            ],
        );
        return rows;
    }

    reserve(caller: string, workspace: string | undefined) {
        return transaction(this.pool, async (client) => {
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 19502))', [
                caller,
            ]);
            if (workspace)
                await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 19503))', [
                    workspace,
                ]);
            const { rows } = await client.query<{ caller_count: number; workspace_count: number }>(
                `SELECT
                    (SELECT count(*)::int FROM live_stream_leases WHERE caller = $1 AND expires_at > clock_timestamp()) AS caller_count,
                    (SELECT count(*)::int FROM live_stream_leases WHERE workspace_id = $2 AND expires_at > clock_timestamp()) AS workspace_count`,
                [caller, workspace ?? null],
            );
            if (rows[0]!.caller_count >= 5 || rows[0]!.workspace_count >= 20) return;
            const id = randomUUID();
            await client.query(
                "INSERT INTO live_stream_leases VALUES ($1, $2, $3, clock_timestamp() + interval '65 seconds')",
                [id, caller, workspace ?? null],
            );
            return id;
        });
    }

    async release(id: string) {
        await this.pool.query('DELETE FROM live_stream_leases WHERE id = $1', [id]);
    }

    async prune() {
        await this.pool.query(
            'DELETE FROM live_stream_leases WHERE expires_at <= clock_timestamp()',
        );
        await this.pool.query(
            "DELETE FROM live_events WHERE created_at < clock_timestamp() - interval '1 day'",
        );
    }
}
