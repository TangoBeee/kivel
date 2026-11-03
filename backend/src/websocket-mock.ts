import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocketMockConfig } from '@socket-help/tools/mock-config';
import type { Access } from './access.js';
import { HttpError } from './errors.js';
import { mockCall } from './mock-calls.js';
import type { MockCallRepository } from './mock-calls.js';
import type { RateLimitRepository } from './rate-limit.js';
import type { ResourceRepository } from './resources.js';
import { isUuid } from './security.js';
import type { PublicAccess } from './sharing.js';

export const webSocketMessageBytes = 16 * 1024;
export const webSocketMockUrl = (origin: string, id: string) =>
    `${origin.replace(/^http/, 'ws')}/ws/${id}`;

export function registerWebSocketMocks(
    app: FastifyInstance,
    store: ResourceRepository,
    access: Access,
    limits: RateLimitRepository,
    calls: MockCallRepository,
) {
    type Route = { Params: { id: string } };
    const prepared = new WeakMap<
        FastifyRequest,
        {
            caller: PublicAccess;
            resource: NonNullable<Awaited<ReturnType<ResourceRepository['use']>>>;
        }
    >();
    const counts = new Map<string, number>();
    let active = 0;
    const unavailable = 'WebSocket mock unavailable or access denied.';
    app.route<Route>({
        method: 'GET',
        url: '/ws/:id',
        preHandler: async (request) => {
            if (!request.ws) return;
            const { id } = request.params;
            if (!isUuid(id)) throw new HttpError(404, unavailable);
            if (request.url.includes('?'))
                throw new HttpError(
                    400,
                    'Do not put credentials or query parameters in this WebSocket URL.',
                );
            const caller = await access.publicCredential(request, 'resources:write');
            const metadata = await store.peek(id, 'mock', caller);
            if (!metadata?.payload.websocket) throw new HttpError(404, unavailable);
            const retry = await limits.consume(`mock:${id}`, 120);
            if (retry) throw new HttpError(429, 'Mock request limit exceeded.', retry);
            const resource = await store.use(id, 'mock', undefined, caller);
            if (!resource?.payload.websocket) throw new HttpError(404, unavailable);
            prepared.set(request, { caller, resource });
        },
        handler: async (_request, reply) =>
            reply
                .header('Upgrade', 'websocket')
                .code(426)
                .send({ error: 'Connect using a WebSocket client.' }),
        wsHandler(socket, request) {
            const { id } = request.params;
            const { caller, resource } = prepared.get(request)!;
            const count = counts.get(id) ?? 0;
            if (count >= 8 || active >= 64) {
                socket.on('error', () => socket.terminate());
                socket.close(1013, 'Too many connections');
                return;
            }
            active++;
            counts.set(id, count + 1);

            const config = resource.payload.websocket as WebSocketMockConfig;
            const connectionId = randomUUID();
            const started = performance.now();
            const abort = new AbortController();
            let pending = 0;
            let frames = 0;
            const record = (event: string, code: number, data?: Buffer, binary = false) => {
                const call = mockCall({
                    method: event,
                    path: `/ws/${id}`,
                    query: { connectionId },
                    status: code,
                    durationMs: performance.now() - started,
                    headers: { 'content-type': binary ? 'application/octet-stream' : 'text/plain' },
                    body: data,
                });
                if (binary) delete call.bodyPreview;
                return calls.record(id, call);
            };
            const close = (code: number, reason: string) => {
                abort.abort();
                socket.close(code, reason);
            };
            const stillAvailable = async () => {
                if (abort.signal.aborted) return false;
                const latest = await store.peek(id, 'mock', caller);
                if (!latest?.payload.websocket || latest.accessVersion !== resource.accessVersion) {
                    close(1008, 'Mock unavailable');
                    return false;
                }
                return !abort.signal.aborted;
            };
            const send = async (data: Buffer, binary: boolean) => {
                if (!(await stillAvailable())) return;
                if (socket.bufferedAmount > 64 * 1024) return close(1013, 'Client is too slow');
                await record('WS send', 101, data, binary);
                if (!abort.signal.aborted && socket.readyState === socket.OPEN)
                    socket.send(data, { binary });
            };
            const fail = (error: unknown) => {
                if (abort.signal.aborted) return;
                request.log.warn({ err: error }, 'Unable to process WebSocket mock traffic.');
                close(1011, 'Unable to process message');
            };
            const expiry = setTimeout(
                () => close(1000, 'Connection ended'),
                Math.max(0, Math.min(60_000, Date.parse(resource.expiresAt) - Date.now())),
            ).unref();
            const check = setInterval(() => {
                if (!pending) void stillAvailable().catch(fail);
            }, 3000).unref();

            socket.on('error', () => {
                abort.abort();
                socket.terminate();
            });
            socket.once('close', (code, reason) => {
                abort.abort();
                clearInterval(check);
                clearTimeout(expiry);
                active--;
                const remaining = (counts.get(id) ?? 1) - 1;
                if (remaining) counts.set(id, remaining);
                else counts.delete(id);
                void sequence.then(() => record('WS close', code, reason)).catch(fail);
            });
            const countFrame = () => {
                if (++frames <= 100) return true;
                close(1008, 'Message limit reached');
                return false;
            };
            socket.on('ping', countFrame);
            socket.on('pong', countFrame);
            let sequence = Promise.resolve()
                .then(async () => {
                    await record('WS connect', 101);
                    for (const message of config.welcome ?? []) {
                        if (config.delayMs)
                            await sleep(config.delayMs, undefined, { signal: abort.signal });
                        await send(Buffer.from(message), false);
                        if (abort.signal.aborted) return;
                    }
                    if (
                        config.closeAfter &&
                        config.welcome?.length &&
                        config.echo === false &&
                        !config.replies?.length
                    )
                        close(config.closeAfter.code, config.closeAfter.reason ?? '');
                })
                .catch(fail);
            socket.on('message', (data, binary) => {
                if (abort.signal.aborted || !countFrame()) return;
                if (pending >= 8) return close(1013, 'Messages arrived too quickly');
                pending++;
                const buffer = data as Buffer;
                sequence = sequence
                    .then(async () => {
                        if (!(await stillAvailable())) return;
                        await record('WS receive', 101, buffer, binary);
                        const rule = binary
                            ? undefined
                            : config.replies?.find(({ match }) => match === buffer.toString());
                        if (!rule && !config.echo) return;
                        if (config.delayMs)
                            await sleep(config.delayMs, undefined, { signal: abort.signal });
                        await send(rule ? Buffer.from(rule.reply) : buffer, binary);
                        if (config.closeAfter && !abort.signal.aborted)
                            close(config.closeAfter.code, config.closeAfter.reason ?? '');
                    })
                    .catch(fail)
                    .finally(() => {
                        pending--;
                    });
            });
        },
    });
}
