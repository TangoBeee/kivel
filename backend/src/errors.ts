import {
    describeLimit,
    planRank,
    type AccountPlan,
    type PlanId,
    type UsageKey,
} from '@kivel.io/tools/plans';

export class HttpError extends Error {
    constructor(
        public statusCode: number,
        message: string,
        public retryAfter?: number,
    ) {
        super(message);
    }
}

function allowanceRetryAfter(limit: UsageKey): number | undefined {
    const now = new Date(Date.now());
    if (limit === 'email.sent_month')
        return Math.max(
            1,
            Math.ceil(
                (Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - now.getTime()) / 1000,
            ),
        );
    if (limit === 'tools.runs' || limit === 'email.sent_today')
        return Math.ceil((86400000 - (now.getTime() % 86400000)) / 1000);
}

export class LimitError extends HttpError {
    readonly requiredPlan: AccountPlan | undefined;
    constructor(
        readonly limit: UsageKey,
        readonly used: number,
        readonly plan: PlanId,
        adding = 1,
        message?: string,
        readonly max = describeLimit(limit).max(plan),
        retryAfter = allowanceRetryAfter(limit),
    ) {
        const definition = describeLimit(limit);
        super(
            402,
            message ??
                `Your plan's allowance for ${definition.label.toLowerCase()} has been reached.`,
            retryAfter,
        );
        this.requiredPlan = (['free', 'pro', 'team'] as const).find(
            (candidate) =>
                planRank[candidate] > planRank[plan] && definition.max(candidate) >= used + adding,
        );
    }

    details(origin: string) {
        const upgradeUrl = this.requiredPlan ? new URL('/pricing/', origin).href : undefined;
        const guidance = this.retryAfter
            ? `Try again after ${new Date(Date.now() + this.retryAfter * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')}.`
            : this.limit.endsWith('.storage') || this.limit === 'memory.bytes'
              ? 'Delete stored data to free space.'
              : 'Delete an item or wait for one to expire before creating another.';
        const upgrade = upgradeUrl ? ` Ask your human to upgrade at ${upgradeUrl}.` : '';
        const message = `${this.message} Used ${this.used.toLocaleString('en-US')} of ${this.max.toLocaleString('en-US')}${describeLimit(this.limit).unit === 'bytes' ? ' bytes' : ''}. ${guidance}${upgrade}`;
        return {
            error: message,
            code: 'limit_reached',
            message,
            ...(this.retryAfter ? { retryAfter: this.retryAfter } : {}),
            limit: this.limit,
            used: this.used,
            max: this.max,
            plan: this.plan,
            ...(upgradeUrl ? { requiredPlan: this.requiredPlan, upgradeUrl } : {}),
        };
    }
}

export function checkLimit(
    plan: PlanId,
    limit: UsageKey,
    used: number,
    adding = 1,
    retryAfter?: number,
) {
    if (used + adding > describeLimit(limit).max(plan))
        throw new LimitError(limit, used, plan, adding, undefined, undefined, retryAfter);
}

export class RateLimitError extends HttpError {
    constructor(
        readonly limit: string,
        message: string,
        retryAfter: number,
    ) {
        super(429, message, retryAfter);
    }
}
