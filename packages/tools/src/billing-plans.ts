export const paidPlans = {
    pro: { amount: 200, currency: 'USD', interval: 'Month', intervalCount: 1 },
    team: { amount: 600, currency: 'USD', interval: 'Month', intervalCount: 1 },
} as const;

export const authenticatorLimits = { anonymous: 0, free: 2, pro: 25, team: 100 } as const;
export const oauthLimits = { anonymous: 0, free: 1, pro: 10, team: 50 } as const;

export const inboxRuleLimits = { anonymous: 0, free: 20, pro: 100, team: 250 } as const;
export const emailDraftBytes = { anonymous: 0, free: 32768, pro: 65536, team: 131072 } as const;

export const credentialLimits = { anonymous: 0, free: 10, pro: 200, team: 1000 } as const;

export const testPaymentLimits = {
    anonymous: { perPayment: 0, daily: 0, approval: 0, topupsPerMinute: 0 },
    free: { perPayment: 10, daily: 50, approval: 5, topupsPerMinute: 10 },
    pro: { perPayment: 100, daily: 500, approval: 25, topupsPerMinute: 30 },
    team: { perPayment: 500, daily: 2500, approval: 100, topupsPerMinute: 60 },
} as const;
