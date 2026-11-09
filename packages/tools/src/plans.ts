export const plans = {
    anonymous: {
        testPayments: { perPayment: 0, daily: 0, approval: 0, topupsPerMinute: 0 },
        oauthProviders: 0,
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
        authenticators: 0,
        credentials: 0,
        approvalQuestionsPerDay: 0,
        monitors: { count: 0, minInterval: 300 },
        captureRequests: 100,
        captureBytes: 1 * 1024 * 1024,
        fileDownloads: 100,
        inboxRules: 0,
        emailDraftBytes: 0,
        persistent: false,
        emailInboxes: 0,
        emailsPerMonth: 0,
        emailsPerDay: 0,
        emailsPerMinute: 0,
        emailRecipients: 0,
    },
    free: {
        testPayments: { perPayment: 10, daily: 50, approval: 5, topupsPerMinute: 10 },
        oauthProviders: 1,
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
        authenticators: 2,
        credentials: 10,
        approvalQuestionsPerDay: 20,
        monitors: { count: 20, minInterval: 300 },
        captureRequests: 1000,
        captureBytes: 10 * 1024 * 1024,
        fileDownloads: 1000,
        inboxRules: 20,
        emailDraftBytes: 32768,
        persistent: false,
        emailInboxes: 1,
        emailsPerMonth: 30,
        emailsPerDay: 3,
        emailsPerMinute: 3,
        emailRecipients: 3,
    },
    pro: {
        testPayments: { perPayment: 100, daily: 500, approval: 25, topupsPerMinute: 30 },
        oauthProviders: 10,
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
        authenticators: 25,
        credentials: 200,
        approvalQuestionsPerDay: 200,
        monitors: { count: 100, minInterval: 60 },
        captureRequests: 1000,
        captureBytes: 10 * 1024 * 1024,
        fileDownloads: 1000,
        inboxRules: 100,
        emailDraftBytes: 65536,
        persistent: true,
        emailInboxes: 10,
        emailsPerMonth: 500,
        emailsPerDay: 50,
        emailsPerMinute: 10,
        emailRecipients: 10,
    },
    team: {
        testPayments: { perPayment: 500, daily: 2500, approval: 100, topupsPerMinute: 60 },
        oauthProviders: 50,
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
        authenticators: 100,
        credentials: 1000,
        approvalQuestionsPerDay: 1000,
        monitors: { count: 500, minInterval: 60 },
        captureRequests: 1000,
        captureBytes: 10 * 1024 * 1024,
        fileDownloads: 1000,
        inboxRules: 250,
        emailDraftBytes: 131072,
        persistent: true,
        emailInboxes: 50,
        emailsPerMonth: 3000,
        emailsPerDay: 300,
        emailsPerMinute: 30,
        emailRecipients: 10,
    },
} as const;
export const oauthLimits = {
    anonymous: plans.anonymous.oauthProviders,
    free: plans.free.oauthProviders,
    pro: plans.pro.oauthProviders,
    team: plans.team.oauthProviders,
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

const usageDescriptions = {
    'tools.runs': { label: 'Hosted tool runs', group: 'Tools', unit: 'count' },
    'resources.active': { label: 'Active resources', group: 'Resources', unit: 'count' },
    'resources.storage': { label: 'Resource storage', group: 'Resources', unit: 'bytes' },
    'agents.connected': { label: 'Connected agents', group: 'Workspace', unit: 'count' },
    'monitors.active': { label: 'Monitors', group: 'Resources', unit: 'count' },
    'memory.bytes': { label: 'Memory', group: 'Workspace', unit: 'bytes' },
    'authenticators.entries': { label: 'Authenticators', group: 'Workspace', unit: 'count' },
    'vault.entries': { label: 'Vault entries', group: 'Workspace', unit: 'count' },
    'email.inboxes': { label: 'Active email inboxes', group: 'Email', unit: 'count' },
    'email.sent_today': { label: 'Email recipients today', group: 'Email', unit: 'count' },
    'email.sent_month': { label: 'Email recipients this month', group: 'Email', unit: 'count' },
    'approvals.questions': {
        label: 'Approval requests in the last 24 hours',
        group: 'Workspace',
        unit: 'count',
    },
    'mocks.oauth': { label: 'OAuth providers', group: 'Resources', unit: 'count' },
} as const;
export type UsageKey = keyof typeof usageDescriptions;
export function describeLimit(key: UsageKey) {
    return usageDescriptions[key];
}
export interface UsageItem {
    key: UsageKey;
    label: string;
    unit: 'count' | 'bytes';
    used: number;
    max: number;
    resetsAt?: string;
}
export interface UsageResponse {
    plan: PlanId;
    limits: (typeof plans)[PlanId];
    runsToday: number;
    resetsAt: string;
    period: { start: string; end: string };
    items: UsageItem[];
}
