import { features, planRank } from '@kivel.io/tools/plans';
import type { AccountPlan, FeatureId, FeatureDefinition } from '@kivel.io/tools/plans';
import type { Identity } from './identity.js';
import { effectivePlan } from './identity.js';
import { HttpError } from './errors.js';

export class PlanError extends HttpError {
    readonly upgradeUrl: string;
    constructor(
        readonly requiredPlan: AccountPlan,
        origin: string,
    ) {
        const upgradeUrl = new URL('/pricing/', origin).href;
        super(
            402,
            `This feature requires ${requiredPlan === 'free' ? 'a Free account' : requiredPlan === 'pro' ? 'Pro' : 'Team'}. Ask your human to open ${upgradeUrl}; do not retry without upgrading.`,
        );
        this.upgradeUrl = upgradeUrl;
    }
}

export function entitlement(
    identity: Identity | undefined,
    feature: FeatureId | FeatureDefinition,
    origin: string,
) {
    const required =
        typeof feature === 'string' ? features[feature].minimumPlan : feature.minimumPlan;
    const current = identity ? effectivePlan(identity.account) : 'anonymous';
    if (planRank[current] < planRank[required]) throw new PlanError(required, origin);
    return current;
}
