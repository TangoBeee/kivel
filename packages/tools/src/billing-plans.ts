const usdMonthly = { currency: 'USD', interval: 'Month', intervalCount: 1 } as const;

export const billingSchedules = {
    legacy: {
        pro: { ...usdMonthly, amount: 200, listAmount: 200 },
        team: { ...usdMonthly, amount: 600 },
    },
    early: {
        pro: { ...usdMonthly, amount: 500, listAmount: 900 },
        team: { ...usdMonthly, amount: 2900 },
    },
    standard: {
        pro: { ...usdMonthly, amount: 900, listAmount: 900 },
        team: { ...usdMonthly, amount: 2900 },
    },
} as const;

export type BillingPriceSchedule = keyof typeof billingSchedules;

export function billingPriceSchedule(value?: string): BillingPriceSchedule {
    const schedule = value || 'legacy';
    if (!Object.hasOwn(billingSchedules, schedule))
        throw new Error('BILLING_PRICE_SCHEDULE must be legacy, early or standard.');
    return schedule as BillingPriceSchedule;
}
