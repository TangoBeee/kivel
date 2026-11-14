import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ServerResponse } from 'node:http';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
    requireWorkspace,
    requireEmailInbox,
    resourceToken,
    type Access,
    type Actor,
} from './access.js';
import { HttpError, RateLimitError } from './errors.js';
import type { InboxRepository } from './inboxes.js';
import { LiveEvents, topicKey, type LiveTopic } from './live-events.js';
import type { ResourceRepository } from './resources.js';
import { isUuid } from './security.js';

const workspaceTopics = new Set(['approvals', 'monitors', 'payments']);
const resourceTopics = new Set(['webhook', 'email', 'mock']);
const invalidTopics = () => new HttpError(400, 'Choose 1 to 10 different live topics.');
const unavailable = () => new HttpError(404, 'Live topic unavailable or access denied.');

function parseTopics(input: unknown, actor: Actor): LiveTopic[] {
    if (typeof input !== 'string' || input.length > 600) throw invalidTopics();
    const parts = input.toLowerCase().split(',');
    if (parts.length > 10 || new Set(parts).size !== parts.length) throw invalidTopics();
    return parts.map((part) => {
        if (workspaceTopics.has(part)) {
            requireWorkspace(actor);
            return { topic: part, scopeId: actor.identity.account.id };
        }
        const [topic, id, extra] = part.split(':');
        if (!topic || !resourceTopics.has(topic) || !id || extra !== undefined || !isUuid(id))
            throw invalidTopics();
        return { topic, scopeId: id.toLowerCase() };
    });
}

function readCursor(input: unknown, topics: LiveTopic[]) {
    if (input === undefined) return;
    if (typeof input !== 'string' || !/^[A-Za-z0-9_-]{1,1500}$/.test(input))
        throw new HttpError(400, 'Invalid live event cursor.');
    try {
        const value = JSON.parse(Buffer.from(input, 'base64url').toString());
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        const cursors = new Map<string, string>();
        for (const key of topics.map(topicKey)) {
            if (
                typeof value[key] !== 'string' ||
                !/^\d{1,19}$/.test(value[key]) ||
                BigInt(value[key]) > 9223372036854775807n
            )
                throw new Error();
            cursors.set(key, value[key]);
        }
        return cursors;
    } catch {
        throw new HttpError(400, 'Invalid live event cursor.');
    }
}

function frame(name: string, data: unknown, cursors: Map<string, string>) {
    const id = Buffer.from(JSON.stringify(Object.fromEntries(cursors))).toString('base64url');
    return `id: ${id}\nevent: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function registerLiveStream(
    app: FastifyInstance,
    access: Access,
    inboxes: InboxRepository,
    resources: ResourceRepository,
    events: LiveEvents,
    secret = randomBytes(32).toString('hex'),
) {
    const streams = new Map<AbortController, ServerResponse>();
    const sign = (value: string) =>
        createHmac('sha256', secret).update(`stream-ticket:${value}`).digest();

    async function authorize(topics: LiveTopic[], request: FastifyRequest, actor: Actor) {
        const token = resourceToken(request);
        const owner = actor.identity?.account.id;
        await Promise.all(
            topics.map(async ({ topic, scopeId }) => {
                if (actor.identity?.emailInboxId) {
                    if (topic !== 'email') throw unavailable();
                    requireEmailInbox(actor.identity, scopeId);
                }
                if (workspaceTopics.has(topic)) return;
                const allowed =
                    topic === 'webhook'
                        ? await inboxes.info(scopeId, token, owner)
                        : await resources.read(
                              scopeId,
                              topic === 'email' ? 'email' : 'mock',
                              token,
                              owner,
                          );
                if (!allowed) throw unavailable();
            }),
        );
    }

    function verifyTicket(ticket: unknown, topic: LiveTopic, actor: Actor) {
        if (typeof ticket !== 'string') return false;
        const parts = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(ticket);
        if (!parts || Number(parts[1]) < Date.now() || Number(parts[1]) > Date.now() + 30_000)
            return false;
        const given = Buffer.from(parts[2]!, 'base64url');
        return (
            given.length === 32 &&
            timingSafeEqual(given, sign(`${actor.quotaKey}:${topicKey(topic)}:${parts[1]}`))
        );
    }

    app.post('/api/stream/ticket', async (request, reply) => {
        const actor = await access.scope(request, 'resources:read');
        const topics = parseTopics(
            (request.body as { topics?: unknown } | undefined)?.topics,
            actor,
        );
        if (actor.identity || topics.length !== 1)
            throw new HttpError(400, 'Use a ticket for one anonymous resource.');
        await authorize(topics, request, actor);
        const expiresAt = Date.now() + 30_000;
        const ticket = sign(`${actor.quotaKey}:${topicKey(topics[0]!)}:${expiresAt}`);
        return reply.header('Cache-Control', 'no-store').send({
            ticket: `${expiresAt}.${ticket.toString('base64url')}`,
            expiresAt: new Date(expiresAt).toISOString(),
        });
    });

    app.get('/api/stream', async (request, reply) => {
        const actor = await access.scope(request, 'resources:read');
        const query = request.query as { topics?: string; ticket?: string };
        const topics = parseTopics(query.topics, actor);
        const owner = actor.identity?.account.id;
        if (actor.identity || query.ticket === undefined) await authorize(topics, request, actor);
        else if (topics.length !== 1 || !verifyTicket(query.ticket, topics[0]!, actor))
            throw unavailable();

        const capped = () =>
            new RateLimitError('streams.connections', 'Too many live connections.', 5);
        if (streams.size >= 200) throw capped();
        const caller = createHash('sha256')
            .update(actor.sessionToken ?? actor.identity?.keyId ?? actor.quotaKey)
            .digest('hex');
        const cursors = readCursor(request.headers['last-event-id'], topics);
        const controller = new AbortController();
        streams.set(controller, reply.raw);
        let lease: string | undefined;
        let expiry: NodeJS.Timeout | undefined;
        const release = (id: string) => {
            void events.release(id).catch(() => app.log.warn('Live stream lease release failed.'));
        };
        const close = () => {
            if (!streams.delete(controller)) return;
            controller.abort();
            clearTimeout(expiry);
            if (lease) release(lease);
        };
        reply.raw.once('close', close);
        try {
            lease = await events.reserve(caller, owner);
            if (!lease) throw capped();
        } catch (error) {
            close();
            throw error;
        }
        if (controller.signal.aborted) {
            release(lease);
            return;
        }
        expiry = setTimeout(() => reply.raw.destroy(), 55_000);
        expiry.unref();

        async function* changes() {
            let notified = false;
            const unwatch = events.watch(topics, () => {
                notified = true;
            });
            try {
                const current = cursors ?? (await events.head(topics));
                const deadline = Date.now() + 50_000;
                let heartbeat = Date.now() + 25_000;
                yield frame('ready', {}, current);
                while (!controller.signal.aborted && Date.now() < deadline) {
                    notified = false;
                    const changes = await events.read(topics, current);
                    for (const event of changes) {
                        current.set(topicKey(event), event.id);
                        yield frame('change', event, current);
                    }
                    if (Date.now() >= heartbeat) {
                        heartbeat = Date.now() + 25_000;
                        yield ': keepalive\n\n';
                    }
                    if (changes.length < 100 && !notified)
                        await events.wait(
                            topics,
                            Math.min(5000, deadline - Date.now()),
                            controller.signal,
                        );
                }
            } finally {
                unwatch();
                close();
            }
        }

        return reply
            .type('text/event-stream')
            .header('Cache-Control', 'no-cache, no-transform')
            .header('Referrer-Policy', 'no-referrer')
            .send(Readable.from(changes()));
    });

    const cleanup = setInterval(
        () => {
            void events.prune().catch(() => app.log.warn('Live event cleanup failed.'));
        },
        60 * 60 * 1000,
    );
    cleanup.unref();
    app.addHook('onReady', () => events.start());
    app.addHook('preClose', async () => {
        for (const [stream, response] of streams) {
            stream.abort();
            response.destroy();
        }
        clearInterval(cleanup);
        events.stop();
    });
}
