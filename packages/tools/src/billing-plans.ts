export const paidPlans = {
    pro: { amount: 200, currency: 'USD', interval: 'Month', intervalCount: 1 },
    team: { amount: 600, currency: 'USD', interval: 'Month', intervalCount: 1 },
} as const;

export const authenticatorLimits = { anonymous: 0, free: 2, pro: 25, team: 100 } as const;
export const oauthLimits = { anonymous: 0, free: 1, pro: 10, team: 50 } as const;
