import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { Access } from './access.js';
import type { EmailMessageRepository } from './email.js';
import type { InboxRepository } from './inboxes.js';
import type { MockCallRepository } from './mock-calls.js';
import type { MonitorRepository } from './monitors.js';
import type { ResourceRepository } from './resources.js';

type Mail = {
    id: string;
    inboxId: string;
    receivedAt: string;
    from: string;
    to: string;
    subject: string;
    codes: string[];
    link: string | null;
};
type Entry = { kind: 'email' | 'webhooks' | 'mocks' | 'checks'; at: string; up?: boolean };
const DAY = 86400000;

export function summarizeOverview(entries: Entry[], latestEmail: Mail | null, now: number) {
    const start = Math.floor(now / DAY) * DAY - 6 * DAY;
    const series = {
        email: Array<number>(7).fill(0),
        webhooks: Array<number>(7).fill(0),
        mocks: Array<number>(7).fill(0),
        checks: Array<number>(7).fill(0),
    };
    const passed = Array<number>(7).fill(0);
    for (const entry of entries) {
        const index = Math.floor((Date.parse(entry.at) - start) / DAY);
        if (!Number.isInteger(index) || index < 0 || index >= 7) continue;
        series[entry.kind][index]!++;
        if (entry.kind === 'checks' && entry.up) passed[index]!++;
    }
    return {
        series,
        uptime: passed.map((count, index) =>
            series.checks[index] ? (100 * count) / series.checks[index]! : null,
        ),
        latestEmail,
    };
}

export function registerWorkspaceOverview(
    app: FastifyInstance,
    access: Access,
    stores: {
        resources: ResourceRepository;
        inboxes: InboxRepository;
        messages: EmailMessageRepository;
        calls: MockCallRepository;
        monitors: MonitorRepository;
    },
    pool?: Pool,
) {
    app.get('/api/account/overview', async (request) => {
        const identity = await access.require(request, 'resources:read');
        const owner = identity.account.id;
        const now = Date.now();
        const since = new Date(Math.floor(now / DAY) * DAY - 6 * DAY).toISOString();
        if (pool) {
            const { rows } = await pool.query<{
                kind: Entry['kind'];
                day: string;
                count: number;
                passed: number;
            }>(
                `WITH history AS (
                    SELECT 'email' AS kind, e.message->>'receivedAt' AS happened_at, false AS up
                      FROM temporary_resources r JOIN email_messages e ON e.resource_id = r.id
                      WHERE r.owner_id = $1 AND r.expires_at > now() AND r.payload::jsonb ? 'address'
                        AND e.message->>'direction' IS DISTINCT FROM 'outbound'
                    UNION ALL
                    SELECT 'webhooks', replace(c.record, chr(92) || 'u0000', chr(92) || 'u0001')::jsonb->>'timestamp', false
                      FROM inboxes i JOIN captured_requests c ON c.inbox_id = i.id
                      WHERE i.owner_id = $1 AND i.expires_at > now()
                    UNION ALL
                    SELECT 'mocks', c.call->>'at', false
                      FROM temporary_resources r JOIN mock_calls c ON c.resource_id = r.id
                      WHERE r.owner_id = $1 AND r.expires_at > now() AND NOT (r.payload::jsonb ? 'payment')
                    UNION ALL
                    SELECT 'checks', c.sample->>'at', c.sample->>'status' = 'up'
                      FROM monitors m CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.monitor->'recentChecks', '[]')) AS c(sample)
                      WHERE m.account_id = $1 AND c.sample->>'status' IN ('up', 'down')
                )
                SELECT kind, left(happened_at, 10) AS day, count(*)::int AS count, count(*) FILTER (WHERE up)::int AS passed
                  FROM history WHERE happened_at >= $2 GROUP BY kind, left(happened_at, 10)`,
                [owner, since],
            );
            const mail = await pool.query<Mail>(
                `SELECT e.message->>'id' AS id, r.id AS "inboxId",
                        e.message->>'receivedAt' AS "receivedAt", e.message->>'from' AS "from",
                        e.message->>'to' AS "to", e.message->>'subject' AS subject,
                        e.message->'codes' AS codes,
                        (SELECT item->>'url' FROM jsonb_array_elements(COALESCE(e.message->'links', '[]'::jsonb)) AS links(item)
                         WHERE item->>'kind' = 'verification' LIMIT 1) AS link
                   FROM temporary_resources r JOIN LATERAL (
                       SELECT message FROM email_messages
                       WHERE resource_id = r.id AND message->>'direction' IS DISTINCT FROM 'outbound'
                       ORDER BY sequence DESC LIMIT 1
                   ) e ON true
                   WHERE r.owner_id = $1 AND r.expires_at > now() AND r.payload::jsonb ? 'address'
                   ORDER BY e.message->>'receivedAt' DESC LIMIT 1`,
                [owner],
            );
            const overview = summarizeOverview([], mail.rows[0] ?? null, now);
            for (const row of rows) {
                const index = (Date.parse(row.day) - Date.parse(since)) / DAY;
                if (!Number.isInteger(index) || index < 0 || index >= 7) continue;
                overview.series[row.kind][index] = row.count;
                if (row.kind === 'checks') overview.uptime[index] = (row.passed / row.count) * 100;
            }
            return overview;
        }
        const [resources, inboxes, monitors] = await Promise.all([
            stores.resources.listOwned(owner),
            stores.inboxes.listOwned(owner),
            stores.monitors.list(owner),
        ]);
        const [mail, captures, mocks] = await Promise.all([
            Promise.all(
                resources
                    .filter((r) => r.kind === 'email' && r.payload.address)
                    .map(async (r) =>
                        (await stores.messages.list(r.id))
                            .filter((m) => m.direction !== 'outbound')
                            .map((m): Mail => ({
                                id: m.id,
                                inboxId: r.id,
                                receivedAt: m.receivedAt,
                                from: m.from,
                                to: m.to,
                                subject: m.subject,
                                codes: m.codes,
                                link:
                                    m.links.find((link) => link.kind === 'verification')?.url ??
                                    null,
                            })),
                    ),
            ),
            Promise.all(inboxes.map((inbox) => stores.inboxes.listRequests(inbox.id, '', owner))),
            Promise.all(
                resources
                    .filter((r) => r.kind === 'mock' && !r.payload.payment)
                    .map((r) => stores.calls.list(r.id)),
            ),
        ]);
        const messages = mail.flat().sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
        return summarizeOverview(
            [
                ...messages.map((m): Entry => ({ kind: 'email', at: m.receivedAt })),
                ...captures.flatMap((items) =>
                    (items ?? []).map((item): Entry => ({ kind: 'webhooks', at: item.timestamp })),
                ),
                ...mocks.flat().map((item): Entry => ({ kind: 'mocks', at: item.at })),
                ...monitors.flatMap((monitor) =>
                    (monitor.recentChecks ?? [])
                        .filter((check) => check.status !== 'pending')
                        .map((check): Entry => ({
                            kind: 'checks',
                            at: check.at,
                            up: check.status === 'up',
                        })),
                ),
            ],
            messages[0] ?? null,
            now,
        );
    });
}
