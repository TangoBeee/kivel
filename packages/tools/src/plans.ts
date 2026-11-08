import {
    authenticatorLimits,
    oauthLimits,
    credentialLimits,
    testPaymentLimits,
} from './billing-plans.js';
export const plans = {
    anonymous: {
        testPayments: testPaymentLimits.anonymous,
        oauthProviders: oauthLimits.anonymous,
        name: 'Without an account',
        maxResources: 5,
        storageBytes: 32 * 1024 * 1024,
        maxRetentionSeconds: 3600,
        requestsPerMinute: 120,
        creationsPerMinute: 10,
        runsPerDay: 100,
        inputBytes: 64 * 1024,
        fileBytes: 10 * 1024 * 1024,
        memoryBytes: 0,
        agents: 0,
        authenticators: authenticatorLimits.anonymous,
        credentials: credentialLimits.anonymous,
        persistent: false,
        emailInboxes: 0,
        emailsPerMonth: 0,
        emailsPerDay: 0,
        emailsPerMinute: 0,
        emailRecipients: 0,
    },
    free: {
        testPayments: testPaymentLimits.free,
        oauthProviders: oauthLimits.free,
        name: 'Free account',
        maxResources: 20,
        storageBytes: 64 * 1024 * 1024,
        maxRetentionSeconds: 7 * 86400,
        requestsPerMinute: 240,
        creationsPerMinute: 20,
        runsPerDay: 1000,
        inputBytes: 256 * 1024,
        fileBytes: 10 * 1024 * 1024,
        memoryBytes: 5 * 1024 * 1024,
        agents: 3,
        authenticators: authenticatorLimits.free,
        credentials: credentialLimits.free,
        persistent: false,
        emailInboxes: 1,
        emailsPerMonth: 30,
        emailsPerDay: 3,
        emailsPerMinute: 3,
        emailRecipients: 3,
    },
    pro: {
        testPayments: testPaymentLimits.pro,
        oauthProviders: oauthLimits.pro,
        name: 'Pro',
        maxResources: 100,
        storageBytes: 512 * 1024 * 1024,
        maxRetentionSeconds: 30 * 86400,
        requestsPerMinute: 1200,
        creationsPerMinute: 60,
        runsPerDay: 20000,
        inputBytes: 1024 * 1024,
        fileBytes: 10 * 1024 * 1024,
        memoryBytes: 100 * 1024 * 1024,
        agents: 25,
        authenticators: authenticatorLimits.pro,
        credentials: credentialLimits.pro,
        persistent: true,
        emailInboxes: 10,
        emailsPerMonth: 500,
        emailsPerDay: 50,
        emailsPerMinute: 10,
        emailRecipients: 10,
    },
    team: {
        testPayments: testPaymentLimits.team,
        oauthProviders: oauthLimits.team,
        name: 'Team',
        maxResources: 500,
        storageBytes: 2 * 1024 * 1024 * 1024,
        maxRetentionSeconds: 90 * 86400,
        requestsPerMinute: 3000,
        creationsPerMinute: 120,
        runsPerDay: 100000,
        inputBytes: 1024 * 1024,
        fileBytes: 10 * 1024 * 1024,
        memoryBytes: 1024 * 1024 * 1024,
        agents: 100,
        authenticators: authenticatorLimits.team,
        credentials: credentialLimits.team,
        persistent: true,
        emailInboxes: 50,
        emailsPerMonth: 3000,
        emailsPerDay: 300,
        emailsPerMinute: 30,
        emailRecipients: 10,
    },
} as const;
export type PlanId = keyof typeof plans;
export type AccountPlan = Exclude<PlanId, 'anonymous'>;
export interface FeatureDefinition {
    minimumPlan: AccountPlan;
}
export const features = {
    emailInbox: { minimumPlan: 'free' },
    customEmailAddress: { minimumPlan: 'pro' },
    mockProxy: { minimumPlan: 'pro' },
    webhookForwarding: { minimumPlan: 'pro' },
    persistentResource: { minimumPlan: 'pro' },
    staticHosting: { minimumPlan: 'pro' },
} as const satisfies Record<string, FeatureDefinition>;
export type FeatureId = keyof typeof features;
export const planRank: Record<PlanId, number> = { anonymous: 0, free: 1, pro: 2, team: 3 };
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

export const resourceDefinitions = {
    email: features.emailInbox,
    proxy: features.mockProxy,
    forwarding: features.webhookForwarding,
    persistent: features.persistentResource,
} as const;
