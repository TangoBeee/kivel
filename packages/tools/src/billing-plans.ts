export const paidPlans = {
    pro: { amount: 200, currency: 'USD', interval: 'Month', intervalCount: 1 },
    team: { amount: 600, currency: 'USD', interval: 'Month', intervalCount: 1 },
} as const;

export const authenticatorLimits = { anonymous: 0, free: 2, pro: 25, team: 100 } as const;
export const oauthLimits = { anonymous: 0, free: 1, pro: 10, team: 50 } as const;

export const inboxRuleLimits = { anonymous: 0, free: 20, pro: 100, team: 250 } as const;
export const emailDraftBytes = { anonymous: 0, free: 32768, pro: 65536, team: 131072 } as const;
