import { clientKey } from './security.js';
import { createHmac, randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { plans } from '@kivel.io/tools/plans';
import type { PublicAccess } from './sharing.js';
import type { Scope, Identity, IdentityRepository } from './identity.js';
import { effectivePlan } from './identity.js';
import type { AllocationContext } from './allocations.js';
import type { RateLimitRepository } from './rate-limit.js';
import { HttpError } from './errors.js';
export { HttpError } from './errors.js';
import { entitlement } from './entitlements.js';
export interface Actor {
    identity?: Identity;
    quotaKey: string;
    plan: keyof typeof plans;
    sessionToken?: string;
    /** Set for unclaimed trial agents, which act with anonymous limits under a stable identity. */
    trialId?: string;
    claimUrl?: string;
}
export function requireWorkspace(actor: Actor): asserts actor is Actor & { identity: Identity } {
    if (actor.identity) return;
    const next = actor.trialId
        ? `This trial key needs workspace approval. Ask your human to open your claim link${actor.claimUrl ? `: ${actor.claimUrl}` : ' returned by start_trial'}.`
        : 'Ask your human to approve you with start_login (or POST /api/agents/login).';
    throw new HttpError(
        401,
        `This needs an approved workspace key. ${next} Do not retry until approved.`,
    );
}
export const resourceToken = (request: FastifyRequest) => {
    const separate = request.headers['x-resource-token'];
    return typeof separate === 'string' && /^[A-Za-z0-9_-]{43}$/.test(separate)
        ? separate
        : (/^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.authorization ?? '')?.[1] ?? '');
};
export class Access {
    private actors = new WeakMap<FastifyRequest, Actor>();
    readonly cookieName: string;
    readonly separateApp: boolean;
    private readonly appHost: string;
    /** Resolves a trial key and its claim link; installed by the agents module. */
    trials?: (token: string) => Promise<{ id: string; claimUrl?: string } | undefined>;
    constructor(
        readonly identities: IdentityRepository,
        private limits: RateLimitRepository,
        readonly origin: string,
        private secret = randomBytes(32).toString('hex'),
        readonly appOrigin = origin,
        private readonly useDevelopmentProxy = false,
    ) {
        this.separateApp = appOrigin !== origin;
        this.appHost = new URL(appOrigin).host;
        this.cookieName = appOrigin.startsWith('https:') ? '__Host-kivel_session' : 'kivel_session';
    }
    requestHost(request: FastifyRequest) {
        return this.useDevelopmentProxy ? request.host : request.headers.host;
    }
    isAppHost(request: FastifyRequest) {
        return !this.separateApp || this.requestHost(request) === this.appHost;
    }
    appUrl(path: string, legacyPath = path) {
        return this.appOrigin + (this.separateApp ? path : legacyPath);
    }
    async actor(request: FastifyRequest): Promise<Actor> {
        const cached = this.actors.get(request);
        if (cached) return cached;
        let identity: Identity | undefined, sessionToken: string | undefined;
        const authorization = request.headers.authorization;
        if (authorization && /^Bearer sht_/i.test(authorization)) {
            const token = /^Bearer (sht_[A-Za-z0-9_-]{43})$/i.exec(authorization)?.[1];
            const trial = token && this.trials ? await this.trials(token) : undefined;
            if (!trial)
                throw new HttpError(
                    401,
                    'This trial key expired or is invalid. Ask your human to claim this agent, or start a new trial.',
                );
            const actor: Actor = {
                plan: 'anonymous',
                trialId: trial.id,
                ...(trial.claimUrl ? { claimUrl: trial.claimUrl } : {}),
                quotaKey: createHmac('sha256', this.secret)
                    .update(`trial:${trial.id}`)
                    .digest('hex'),
            };
            this.actors.set(request, actor);
            return actor;
        }
        // New keys start with kv_; sh_ keys from before the rename keep working.
        if (authorization && /^Bearer (?:kv|sh)_/i.test(authorization)) {
            const key = /^Bearer ((?:kv|sh)_[A-Za-z0-9_-]{43})$/i.exec(authorization)?.[1];
            identity = key ? await this.identities.authenticateKey(key) : undefined;
            if (!identity) throw new HttpError(401, 'API key is invalid, expired, or revoked.');
        } else if (this.isAppHost(request)) {
            const cookie = request.headers.cookie
                ?.split(';')
                .map((part) => part.trim())
                .find((part) => part.startsWith(`${this.cookieName}=`));
            sessionToken = cookie?.slice(this.cookieName.length + 1);
            if (sessionToken && /^[A-Za-z0-9_-]{43}$/.test(sessionToken))
                identity = await this.identities.authenticateSession(sessionToken);
            if (
                identity &&
                !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
                request.headers.origin !== this.appOrigin
            )
                throw new HttpError(
                    403,
                    'Session requests must come from this site. Use an API key for scripts.',
                );
        }
        const actor: Actor = {
            ...(identity ? { identity } : {}),
            ...(identity && sessionToken ? { sessionToken } : {}),
            plan: identity ? effectivePlan(identity.account) : 'anonymous',
            quotaKey:
                identity?.account.quotaKey ??
                createHmac('sha256', this.secret).update(clientKey(request.ip)).digest('hex'),
        };
        this.actors.set(request, actor);
        return actor;
    }
    async publicCredential(
        request: FastifyRequest,
        requiredScope: Scope = 'resources:read',
    ): Promise<PublicAccess> {
        const header = request.headers['x-access-token'];
        const token =
            typeof header === 'string' && /^[A-Za-z0-9_-]{43}$/.test(header)
                ? header
                : /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.authorization ?? '')?.[1];
        let ownerId: string | undefined;
        try {
            const actor = await this.actor(request);
            const site = request.headers['sec-fetch-site'];
            const localSession =
                (!request.headers.origin || request.headers.origin === this.appOrigin) &&
                (!site || site === 'same-origin' || site === 'none');
            if (
                actor.identity?.keyScopes.includes(requiredScope) &&
                (!actor.sessionToken || localSession)
            )
                ownerId = actor.identity.account.id;
        } catch {}
        return { ...(token ? { token } : {}), ...(ownerId ? { ownerId } : {}) };
    }
    async require(request: FastifyRequest, scope: Scope, sessionOnly = false): Promise<Identity> {
        const actor = await this.actor(request);
        requireWorkspace(actor);
        if (!actor.identity.keyScopes.includes(scope))
            throw new HttpError(403, 'This credential does not allow that action.');
        if (sessionOnly && (!actor.sessionToken || actor.identity.keyId))
            throw new HttpError(403, 'Use your signed-in browser session for this action.');
        return actor.identity;
    }
    async workspace(request: FastifyRequest, scope: Scope) {
        const actor = await this.scope(request, scope);
        requireWorkspace(actor);
        return actor;
    }
    async scope(request: FastifyRequest, scope: Scope) {
        const actor = await this.actor(request);
        if (actor.identity && !actor.identity.keyScopes.includes(scope))
            throw new HttpError(403, 'This credential does not allow that action.');
        return actor;
    }
    async rate(request: FastifyRequest, creation = false) {
        const actor = await this.actor(request),
            plan = plans[actor.plan];
        const retry = await this.limits.consume(
            `${creation ? 'create' : 'actor'}:${actor.quotaKey}`,
            creation ? plan.creationsPerMinute : plan.requestsPerMinute,
        );
        if (retry)
            throw new HttpError(
                429,
                creation
                    ? 'Resource creation rate limit exceeded.'
                    : 'Request rate limit exceeded.',
                retry,
            );
    }
    async allocation(
        request: FastifyRequest,
        value: unknown = request.query,
    ): Promise<AllocationContext> {
        const actor = await this.scope(request, 'resources:write');
        const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
        const plan = plans[actor.plan];
        if (
            input.visibility !== undefined &&
            input.visibility !== 'public' &&
            input.visibility !== 'private'
        )
            throw new HttpError(400, 'visibility must be public or private.');
        const visibility = input.visibility === 'public' ? 'public' : 'private';
        const downloadCap = plan.fileDownloads;
        const maxDownloads =
            input.maxDownloads === undefined ? downloadCap : Number(input.maxDownloads);
        if (!Number.isInteger(maxDownloads) || maxDownloads < 1 || maxDownloads > downloadCap)
            throw new HttpError(400, `maxDownloads must be between 1 and ${downloadCap}.`);
        const persistent = input.persistent === true || input.persistent === 'true';
        if (
            input.persistent !== undefined &&
            ![true, false, 'true', 'false'].includes(input.persistent as boolean)
        )
            throw new HttpError(400, 'persistent must be true or false.');
        if (persistent) entitlement(actor.identity, 'persistentResource', this.origin);
        const ttl =
            input.ttlSeconds === undefined
                ? Math.min(3600, plan.maxRetentionSeconds)
                : Number(input.ttlSeconds);
        if (!Number.isInteger(ttl) || ttl < 60 || ttl > plan.maxRetentionSeconds)
            throw new HttpError(
                400,
                `ttlSeconds must be between 60 and ${plan.maxRetentionSeconds}.`,
            );
        const expiresAt = persistent
            ? new Date(Date.parse(actor.identity!.account.planValidUntil!) + 86400000).toISOString()
            : new Date(Date.now() + ttl * 1000).toISOString();
        return {
            visibility,
            quotaKey: actor.quotaKey,
            plan: actor.plan,
            ...(actor.identity ? { ownerId: actor.identity.account.id } : {}),
            ...(persistent || input.ttlSeconds !== undefined ? { expiresAt } : {}),
            persistent,
            requestLimit: plan.captureRequests,
            byteLimit: plan.captureBytes,
            maxUses: maxDownloads,
        };
    }
    cookie(token: string, clear = false) {
        return `${this.cookieName}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 604800}${this.appOrigin.startsWith('https:') ? '; Secure' : ''}`;
    }
}
