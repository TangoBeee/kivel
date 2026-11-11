import { billingPriceSchedule, billingSchedules } from '@kivel.io/tools/billing-plans';

export const paidPlansEnabled = process.env.BILLING_ENABLED === 'true';
const schedule = billingPriceSchedule(
    process.env.BILLING_PRICE_SCHEDULE || (paidPlansEnabled ? 'legacy' : 'early'),
);
const paid = billingSchedules[schedule];
export const pricing = {
    currency: paid.pro.currency,
    pro: { monthly: paid.pro.amount / 100, listMonthly: paid.pro.listAmount / 100 },
    team: { monthly: paid.team.amount / 100 },
    early: schedule === 'early',
} as const;
export const earlyPriceNote =
    'Early subscribers keep their price for as long as they stay subscribed.';
export type PaidPlan = 'pro' | 'team';
export const money = (value: number) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
