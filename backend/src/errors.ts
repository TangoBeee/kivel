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

export class LimitError extends HttpError {
    readonly max: number;
    readonly requiredPlan: AccountPlan | undefined;
    constructor(
        readonly limit: UsageKey,
        readonly used: number,
        readonly plan: PlanId,
        adding = 1,
        message?: string,
    ) {
        const definition = describeLimit(limit);
        super(
            402,
            message ??
                `Your plan's allowance for ${definition.label.toLowerCase()} has been reached.`,
        );
        this.max = definition.max(plan);
        this.requiredPlan = (['free', 'pro', 'team'] as const).find(
            (candidate) =>
                planRank[candidate] > planRank[plan] && definition.max(candidate) >= used + adding,
        );
    }

    details(origin: string) {
        const upgradeUrl = this.requiredPlan ? new URL('/pricing/', origin).href : undefined;
        const message = upgradeUrl
            ? `${this.message} Ask your human to upgrade at ${upgradeUrl}. Do not retry until capacity is available.`
            : `${this.message} Do not retry until capacity is available.`;
        return {
            error: 'limit_reached',
            message,
            limit: this.limit,
            used: this.used,
            max: this.max,
            plan: this.plan,
            ...(upgradeUrl ? { requiredPlan: this.requiredPlan, upgradeUrl } : {}),
        };
    }
}

export function checkLimit(plan: PlanId, limit: UsageKey, used: number, adding = 1) {
    if (used + adding > describeLimit(limit).max(plan))
        throw new LimitError(limit, used, plan, adding);
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
