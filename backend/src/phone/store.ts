import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { InboundSms } from './provider.js';
export interface PhoneNumber {
    id: string;
    ownerId: string;
    number: string;
    key: string;
    orderId: string | null;
    providerId: string | null;
    state: 'ordering' | 'pending' | 'active' | 'paused' | 'releasing' | 'released' | 'failed';
    createdAt: string;
    pausedAt: string | null;
}
export interface PhoneSession {
    list(): Promise<PhoneNumber[]>;
    save(number: PhoneNumber): Promise<void>;
    record(id: string, message: InboundSms): Promise<void>;
    sms(id: string): Promise<InboundSms[]>;
}
export interface PhoneStore {
    withOwner<T>(owner: string, work: (session: PhoneSession) => Promise<T>): Promise<T>;
    find(number: string): Promise<PhoneNumber | undefined>;
    owners(): Promise<string[]>;
    cleanup(): Promise<void>;
}
export const newPhone = (ownerId: string, number: string, key: string): PhoneNumber => ({
    id: randomUUID(),
    ownerId,
    number,
    key,
    orderId: null,
    providerId: null,
    state: 'ordering',
    createdAt: new Date().toISOString(),
    pausedAt: null,
});
export class MemoryPhones implements PhoneStore {
    private numbers = new Map<string, PhoneNumber>();
    private messages = new Map<string, InboundSms[]>();
    private locks = new Map<string, Promise<unknown>>();
    async find(number: string) {
        const found = [...this.numbers.values()].find((item) => item.number === number);
        return found && structuredClone(found);
    }
    async owners() {
        return [
            ...new Set(
                [...this.numbers.values()]
                    .filter((item) => !['released', 'failed'].includes(item.state))
                    .map((item) => item.ownerId),
            ),
        ];
    }
    async withOwner<T>(owner: string, work: (session: PhoneSession) => Promise<T>): Promise<T> {
        const prior = this.locks.get(owner) ?? Promise.resolve();
        const task = prior
            .catch(() => {})
            .then(() =>
                work({
                    list: async () =>
                        structuredClone(
                            [...this.numbers.values()].filter((item) => item.ownerId === owner),
                        ),
                    save: async (item) => {
                        const existing = [...this.numbers.values()].find(
                            (row) => row.number === item.number && row.id !== item.id,
                        );
                        if (existing) throw new Error('Number is already reserved.');
                        this.numbers.set(item.id, structuredClone(item));
                    },
                    record: async (id, message) => {
                        const list = this.messages.get(id) ?? [];
                        if (!list.some((item) => item.id === message.id) && list.length < 1000)
                            this.messages.set(id, [...list, structuredClone(message)]);
                    },
                    sms: async (id) => structuredClone(this.messages.get(id) ?? []),
                }),
            );
        this.locks.set(owner, task);
        try {
            return await task;
        } finally {
            if (this.locks.get(owner) === task) this.locks.delete(owner);
        }
    }
    async cleanup() {
        for (const [id, list] of this.messages)
            this.messages.set(
                id,
                list.filter((item) => Date.parse(item.at) > Date.now() - 30 * 86400000),
            );
    }
}
export class PostgresPhones implements PhoneStore {
    constructor(private pool: Pool) {}
    async find(number: string) {
        return (await this.pool.query('SELECT phone FROM phone_numbers WHERE number=$1', [number]))
            .rows[0]?.phone as PhoneNumber | undefined;
    }
    async owners() {
        return (
            await this.pool.query(
                "SELECT DISTINCT owner_id FROM phone_numbers WHERE phone->>'state' NOT IN ('released','failed') LIMIT 1000",
            )
        ).rows.map((row) => row.owner_id as string);
    }
    async withOwner<T>(owner: string, work: (session: PhoneSession) => Promise<T>): Promise<T> {
        const client = await this.pool.connect();
        let locked = false,
            destroy = false;
        try {
            await client.query('SELECT pg_advisory_lock(hashtextextended($1,18))', [owner]);
            locked = true;
            return await work({
                list: async () =>
                    (
                        await client.query(
                            'SELECT phone FROM phone_numbers WHERE owner_id=$1 ORDER BY created_at DESC',
                            [owner],
                        )
                    ).rows.map((row) => row.phone as PhoneNumber),
                save: async (item) => {
                    await client.query(
                        'INSERT INTO phone_numbers(id,owner_id,number,request_key,phone,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET phone=EXCLUDED.phone',
                        [item.id, owner, item.number, item.key, item, item.createdAt],
                    );
                },
                record: async (id, message) => {
                    await client.query(
                        'INSERT INTO phone_messages(id,phone_id,message,created_at) SELECT $1,$2,$3,$4 WHERE (SELECT count(*) FROM phone_messages WHERE phone_id=$2)<1000 ON CONFLICT(id) DO NOTHING',
                        [message.id, id, message, message.at],
                    );
                },
                sms: async (id) =>
                    (
                        await client.query(
                            'SELECT message FROM phone_messages WHERE phone_id=$1 ORDER BY created_at LIMIT 1000',
                            [id],
                        )
                    ).rows.map((row) => row.message as InboundSms),
            });
        } finally {
            try {
                if (locked)
                    await client.query('SELECT pg_advisory_unlock(hashtextextended($1,18))', [
                        owner,
                    ]);
            } catch {
                destroy = true;
            } finally {
                client.release(destroy);
            }
        }
    }
    async cleanup() {
        await this.pool.query(
            "DELETE FROM phone_messages WHERE created_at < clock_timestamp() - interval '30 days'",
        );
    }
}
