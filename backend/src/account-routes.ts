import { clientKey } from './security.js';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { plans } from '@kivel/tools/plans';
import { passwordHash, verifyPassword, publicIdentity, scopes } from './identity.js';
import type { Scope, Role } from './identity.js';
import { Access, HttpError } from './access.js';
import { emailAddress } from './recovery.js';
import type { RecoveryService } from './recovery.js';
import type { RateLimitRepository } from './rate-limit.js';
const object = (body: unknown): Record<string, unknown> => {
    if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new HttpError(400, 'Provide a JSON object.');
    return body as Record<string, unknown>;
};
const username = (value: unknown) => {
    if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(value))
        throw new HttpError(
            400,
            'Use a username of 3–32 lowercase letters, numbers, dots, underscores, or hyphens.',
        );
    return value;
};
const name = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 80)
        throw new HttpError(400, 'Provide a name of 1–80 characters.');
    return value.trim();
};
export function registerAccounts(
    app: FastifyInstance,
    access: Access,
    limits: RateLimitRepository,
    recovery: RecoveryService,
) {
    const identities = access.identities;
    let hashing = 0;
    const dummyHash = passwordHash(randomBytes(32).toString('hex'));
    for (const action of ['register', 'login'] as const)
        app.post(`/api/auth/${action}`, { bodyLimit: 4096 }, async (request, reply) => {
            const retry = await limits.consume(`auth:${clientKey(request.ip)}`, 10, 15 * 60000);
            if (retry)
                throw new HttpError(429, 'Too many sign-in attempts. Try again later.', retry);
            const body = object(request.body),
                login = username(body.username);
            const email = action === 'register' ? emailAddress(body.email) : undefined;
            if (
                typeof body.password !== 'string' ||
                Buffer.byteLength(body.password) < 8 ||
                Buffer.byteLength(body.password) > 256
            )
                throw new HttpError(400, 'Use a password between 8 and 256 UTF-8 bytes.');
            // Cap guesses against one account even when they arrive from many addresses.
            const userRetry =
                action === 'login' &&
                (await limits.consume(`login-user:${login.toLowerCase()}`, 30, 15 * 60000));
            if (userRetry)
                throw new HttpError(429, 'Too many sign-in attempts. Try again later.', userRetry);
            if (hashing >= 1) throw new HttpError(503, 'Sign-in is busy. Try again shortly.', 5);
            hashing++;
            try {
                const user =
                    action === 'register'
                        ? await identities.register(login, await passwordHash(body.password))
                        : await identities.findUser(login);
                const passwordSnapshot = user?.passwordHash;
                if (action === 'register' && !user)
                    throw new HttpError(409, 'Username is unavailable.');
                if (
                    action === 'login' &&
                    !(await verifyPassword(body.password, passwordSnapshot ?? (await dummyHash)))
                )
                    throw new HttpError(401, 'Username or password is incorrect.');
                if (!user) throw new HttpError(401, 'Username or password is incorrect.');
                const token = randomBytes(32).toString('base64url');
                if (
                    !(await identities.createSession(
                        user.id,
                        user.personalAccountId,
                        token,
                        passwordSnapshot,
                    ))
                )
                    throw new HttpError(401, 'Password changed. Sign in again.');
                if (email)
                    await recovery.registration(
                        user.id,
                        email,
                        passwordSnapshot!,
                        clientKey(request.ip),
                    );
                const identity = await identities.authenticateSession(token);
                if (!identity) throw new HttpError(401, 'Session expired. Sign in again.');
                return reply
                    .code(action === 'register' ? 201 : 200)
                    .header('Set-Cookie', access.cookie(token))
                    .send(publicIdentity(identity!));
            } finally {
                hashing--;
            }
        });
    app.post('/api/auth/logout', async (request, reply) => {
        const actor = await access.actor(request);
        if (actor.sessionToken) await identities.revokeSession(actor.sessionToken);
        return reply.header('Set-Cookie', access.cookie('', true)).code(204).send();
    });
    app.get('/api/account', async (request) =>
        publicIdentity(await access.require(request, 'account:read')),
    );
    app.get('/api/plans', async () => ({ plans }));
    app.get('/api/account/keys', async (request) => ({
        keys: await identities.listKeys(await access.require(request, 'account:read', true)),
    }));
    app.post('/api/account/keys', async (request, reply) => {
        const identity = await access.require(request, 'account:read', true),
            body = object(request.body);
        const requested = body.scopes ?? identity.keyScopes;
        if (
            !Array.isArray(requested) ||
            !requested.length ||
            requested.length > scopes.length ||
            requested.some(
                (scope) =>
                    !scopes.includes(scope as Scope) ||
                    !identity.keyScopes.includes(scope as Scope),
            )
        )
            throw new HttpError(400, 'Choose scopes allowed by your workspace role.');
        const days = body.expiresInDays ?? 90;
        if (!Number.isInteger(days) || Number(days) < 1 || Number(days) > 365)
            throw new HttpError(400, 'expiresInDays must be between 1 and 365.');
        return reply
            .code(201)
            .send(
                await identities.createKey(
                    identity,
                    name(body.name),
                    [...new Set(requested)] as Scope[],
                    new Date(Date.now() + Number(days) * 86400000).toISOString(),
                ),
            );
    });
    app.delete<{ Params: { id: string } }>('/api/account/keys/:id', async (request, reply) => {
        const identity = await access.require(request, 'account:read', true);
        if (!(await identities.revokeKey(identity, request.params.id)))
            throw new HttpError(404, 'API key not found.');
        return reply.code(204).send();
    });
    app.get('/api/account/workspaces', async (request) => {
        const identity = await access.require(request, 'account:read');
        return {
            workspaces: (await identities.workspaces(identity.userId)).map(
                ({ account, role }) => publicIdentity({ ...identity, account, role }).account,
            ),
        };
    });
    app.post('/api/account/workspace', async (request, reply) => {
        const identity = await access.require(request, 'account:read', true),
            actor = await access.actor(request),
            body = object(request.body);
        if (
            typeof body.accountId !== 'string' ||
            !(await identities.switchWorkspace(
                actor.sessionToken!,
                identity.userId,
                body.accountId,
            ))
        )
            throw new HttpError(404, 'Workspace not found.');
        return reply.code(204).send();
    });
    app.patch('/api/account', async (request, reply) => {
        const identity = await access.require(request, 'account:read', true);
        if (!['owner', 'admin'].includes(identity.role))
            throw new HttpError(403, 'A workspace administrator is required.');
        await identities.renameWorkspace(identity.account.id, name(object(request.body).name));
        return reply.code(204).send();
    });
    app.get('/api/account/members', async (request) => {
        const identity = await access.require(request, 'account:read');
        return { members: await identities.members(identity.account.id) };
    });
    app.post('/api/account/invites', async (request, reply) => {
        const identity = await access.require(request, 'account:read', true),
            actor = await access.actor(request),
            body = object(request.body);
        if (!['owner', 'admin'].includes(identity.role) || actor.plan !== 'team')
            throw new HttpError(403, 'Team administrators can invite members.');
        if (!['admin', 'member', 'viewer'].includes(String(body.role)))
            throw new HttpError(400, 'Choose admin, member, or viewer.');
        if (body.role === 'admin' && identity.role !== 'owner')
            throw new HttpError(403, 'Only the workspace owner can invite administrators.');
        const token = randomBytes(32).toString('base64url');
        if (
            !(await identities.invite(
                identity.account.id,
                username(body.username),
                body.role as Exclude<Role, 'owner'>,
                token,
            ))
        )
            throw new HttpError(409, 'The workspace invitation limit has been reached.');
        return reply.code(201).send({ token, expiresInSeconds: 86400 });
    });
    app.post('/api/account/invites/accept', async (request) => {
        const identity = await access.require(request, 'account:read', true),
            body = object(request.body);
        if (typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token))
            throw new HttpError(400, 'Provide an invitation token.');
        const accountId = await identities.acceptInvite(
            identity.userId,
            identity.username,
            body.token,
        );
        if (!accountId) throw new HttpError(404, 'Invitation is unavailable.');
        return { accountId };
    });
    app.delete<{ Params: { id: string } }>('/api/account/members/:id', async (request, reply) => {
        const identity = await access.require(request, 'account:read', true),
            members = await identities.members(identity.account.id),
            target = members.find((member) => member.userId === request.params.id);
        if (
            !target ||
            target.role === 'owner' ||
            (identity.role !== 'owner' && (identity.role !== 'admin' || target.role === 'admin'))
        )
            throw new HttpError(403, 'You cannot remove this member.');
        await identities.removeMember(identity.account.id, target.userId);
        return reply.code(204).send();
    });
}
