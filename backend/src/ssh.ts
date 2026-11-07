import ssh2 from 'ssh2';
const { Server, utils } = ssh2;
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Kivel, KivelError } from '@kivel.io/sdk';
import { command, needsInput } from '@kivel.io/cli';
import type { IdentityRepository } from './identity.js';
import type { RateLimitRepository } from './rate-limit.js';
export function splitCommand(value: string): string[] {
    if (value.length > 4096 || /[\x00-\x08\x0b-\x1f\x7f]/.test(value))
        throw new Error('Command is invalid or too long.');
    const result: string[] = [];
    let token = '',
        quote = '',
        escaped = false,
        started = false;
    for (const character of value) {
        if (escaped) {
            token += character;
            escaped = false;
            started = true;
        } else if (character === '\\' && quote !== "'") {
            escaped = true;
            started = true;
        } else if (quote) {
            if (character === quote) quote = '';
            else token += character;
        } else if (character === '"' || character === "'") {
            quote = character;
            started = true;
        } else if (/\s/.test(character)) {
            if (started) {
                result.push(token);
                token = '';
                started = false;
            }
        } else {
            token += character;
            started = true;
        }
    }
    if (escaped || quote) throw new Error('Unclosed command quote.');
    if (started) result.push(token);
    if (result[0] !== 'kivel') throw new Error('Commands must start with kivel.');
    return result.slice(1);
}
export async function loadHostKey(path: string) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    try {
        return await readFile(path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const key = utils.generateKeyPairSync('ed25519').private;
    try {
        await writeFile(path, key, { flag: 'wx', mode: 0o600 });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    return readFile(path);
}
export function createSshServer(
    app: FastifyInstance,
    identities: IdentityRepository,
    limits: RateLimitRepository,
    hostKey: Buffer,
) {
    const parsed = utils.parseKey(hostKey);
    if (parsed instanceof Error) throw parsed;
    const fingerprint = `SHA256:${createHash('sha256').update(parsed.getPublicSSH()).digest('base64').replace(/=+$/, '')}`;
    let connections = 0,
        activeCommands = 0;
    const clients = new Set<import('ssh2').Connection>();
    const peers = new Map<string, number>();
    const server = new Server({ hostKeys: [hostKey], ident: 'Kivel' }, (connection, info) => {
        connection.on('error', () => {});
        const peer = info.ip;
        if (connections >= 64 || (peers.get(peer) ?? 0) >= 4) {
            connection.end();
            return;
        }
        clients.add(connection);
        connections++;
        peers.set(peer, (peers.get(peer) ?? 0) + 1);
        let key = '',
            attempts = 0,
            sessionOpen = false,
            sessions = 0;
        const handshake = setTimeout(() => connection.end(), 10000).unref();
        const lifetime = setTimeout(() => connection.end(), 120000).unref();
        connection.once('close', () => {
            key = '';
            clients.delete(connection);
            clearTimeout(lifetime);
            clearTimeout(handshake);
            connections--;
            const count = (peers.get(peer) ?? 1) - 1;
            if (count) peers.set(peer, count);
            else peers.delete(peer);
        });
        connection.on('error', () => {});
        connection.on('authentication', (context) => {
            void (async () => {
                if (
                    ++attempts > 4 ||
                    context.method !== 'password' ||
                    context.username !== 'kivel' ||
                    !/^(?:kv|sh)_[A-Za-z0-9_-]{43}$/.test(context.password)
                )
                    return context.reject(['password']);
                if (await limits.consume(`ssh-auth:${peer}`, 10, 15 * 60000))
                    return context.reject(['password']);
                if (!(await identities.authenticateKey(context.password)))
                    return context.reject(['password']);
                key = context.password;
                context.accept();
            })().catch(() => context.reject(['password']));
        });
        connection.on('ready', () => {
            clearTimeout(handshake);
            connection.on('session', (accept, reject) => {
                if (sessionOpen || sessions >= 100 || activeCommands >= 2) return reject();
                sessionOpen = true;
                sessions++;
                activeCommands++;
                const session = accept();
                const commandWait = setTimeout(() => connection.end(), 10000).unref();
                session.once('close', () => {
                    activeCommands--;
                    sessionOpen = false;
                    clearTimeout(commandWait);
                });
                session.on('pty', (_accept, reject) => reject?.());
                session.on('shell', (_accept, reject) => reject());
                session.on('subsystem', (_accept, reject) => reject());
                session.on('exec', (accept, reject, info) => {
                    clearTimeout(commandWait);
                    let args: string[];
                    try {
                        args = splitCommand(info.command);
                    } catch {
                        return reject();
                    }
                    const stream = accept(),
                        chunks: Buffer[] = [];
                    let size = 0,
                        started = false;
                    const deadline = setTimeout(() => {
                        stream.stderr.write('{"error":"Command timed out."}\n');
                        stream.exit(1);
                        stream.end();
                        connection.end();
                    }, 30000).unref();
                    stream.once('close', () => clearTimeout(deadline));
                    stream.on('error', () => {});
                    const fetcher: typeof fetch = async (url, init) => {
                        if (!(await identities.authenticateKey(key)))
                            throw new Error('API key is expired or revoked.');
                        const target = new URL(String(url));
                        const headers = Object.fromEntries(new Headers(init?.headers).entries());
                        const response = await app.inject({
                            method: init?.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
                            url: target.pathname + target.search,
                            headers,
                            remoteAddress: peer,
                            ...(init?.body !== undefined
                                ? {
                                      payload:
                                          init.body instanceof Uint8Array
                                              ? Buffer.from(init.body)
                                              : String(init.body),
                                  }
                                : {}),
                        });
                        return new Response(
                            response.statusCode === 204 || response.statusCode === 304
                                ? null
                                : new Uint8Array(response.rawPayload),
                            {
                                status: response.statusCode,
                                headers: Object.fromEntries(
                                    Object.entries(response.headers)
                                        .filter(([, value]) => value !== undefined)
                                        .map(([name, value]) => [name, String(value)]),
                                ),
                            },
                        );
                    };
                    const run = async () => {
                        if (started) return;
                        started = true;
                        try {
                            const result = await command(
                                new Kivel({
                                    baseUrl: 'http://localhost',
                                    apiKey: key,
                                    fetch: fetcher,
                                }),
                                args,
                                Buffer.concat(chunks),
                            );
                            if (!args.length || ['--help', 'help'].includes(args[0]!))
                                stream.write(`${(result as { help: string }).help}\n`);
                            else if (result instanceof Uint8Array) stream.write(result);
                            else if (result !== undefined)
                                stream.write(`${JSON.stringify(result)}\n`);
                            stream.exit(0);
                        } catch (error) {
                            stream.stderr.write(
                                `${JSON.stringify({ error: error instanceof Error ? error.message : 'Command failed.', ...(error instanceof KivelError ? { status: error.status, requestId: error.requestId, retryAfter: error.retryAfter, requiredPlan: error.requiredPlan, upgradeUrl: error.upgradeUrl } : {}) })}\n`,
                            );
                            stream.exit(1);
                        } finally {
                            stream.end();
                        }
                    };
                    stream.on('data', (chunk: Buffer) => {
                        if (started) return;
                        size += chunk.length;
                        if (size > 10 * 1024 * 1024) {
                            started = true;
                            stream.stderr.write('{"error":"Input exceeds 10 MiB."}\n');
                            stream.exit(1);
                            stream.end();
                            connection.end();
                        } else chunks.push(Buffer.from(chunk));
                    });
                    stream.once('end', () => {
                        void run();
                    });
                    if (!needsInput(args)) void run();
                });
            });
        });
    });
    return {
        server,
        fingerprint,
        close: async () => {
            for (const client of clients) client.end();
            if (server.address())
                await new Promise<void>((resolve) => server.close(() => resolve()));
        },
    };
}
