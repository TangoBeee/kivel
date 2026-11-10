import { paidPlans } from '@kivel.io/tools/billing-plans';
export const paidPlansEnabled = process.env.BILLING_ENABLED === 'true';
export const pricing = {
    currency: paidPlans.pro.currency,
    pro: { monthly: paidPlans.pro.amount / 100 },
    team: { monthly: paidPlans.team.amount / 100 },
} as const;
export type PaidPlan = 'pro' | 'team';
export const money = (value: number) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`;

export const previewPricing = {
    pro: { monthly: 5, listMonthly: 9 },
    team: { monthly: 29 },
} as const;
