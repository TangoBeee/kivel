export const plans = {
    anonymous: {
        name: 'Without an account',
        maxResources: 5,
        storageBytes: 32 * 1024 * 1024,
        maxRetentionSeconds: 3600,
        requestsPerMinute: 120,
        creationsPerMinute: 10,
        runsPerDay: 100,
        inputBytes: 64 * 1024,
        fileBytes: 10 * 1024 * 1024,
        persistent: false,
    },
    free: {
        name: 'Free account',
        maxResources: 20,
        storageBytes: 64 * 1024 * 1024,
        maxRetentionSeconds: 86400,
        requestsPerMinute: 240,
        creationsPerMinute: 20,
        runsPerDay: 1000,
        inputBytes: 256 * 1024,
        fileBytes: 10 * 1024 * 1024,
        persistent: false,
    },
    pro: {
        name: 'Pro',
        maxResources: 100,
        storageBytes: 512 * 1024 * 1024,
        maxRetentionSeconds: 7 * 86400,
        requestsPerMinute: 1200,
        creationsPerMinute: 60,
        runsPerDay: 20000,
        inputBytes: 1024 * 1024,
        fileBytes: 10 * 1024 * 1024,
        persistent: true,
    },
    team: {
        name: 'Team',
        maxResources: 500,
        storageBytes: 2 * 1024 * 1024 * 1024,
        maxRetentionSeconds: 30 * 86400,
        requestsPerMinute: 3000,
        creationsPerMinute: 120,
        runsPerDay: 100000,
        inputBytes: 1024 * 1024,
        fileBytes: 10 * 1024 * 1024,
        persistent: true,
    },
} as const;
export type PlanId = keyof typeof plans;
export type AccountPlan = Exclude<PlanId, 'anonymous'>;
export function resolvePlan(
    plan: AccountPlan,
    validUntil: string | null,
    now = Date.now(),
): AccountPlan {
    return plan !== 'free' &&
        (!validUntil || !Number.isFinite(Date.parse(validUntil)) || Date.parse(validUntil) <= now)
        ? 'free'
        : plan;
}
