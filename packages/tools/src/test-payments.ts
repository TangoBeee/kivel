export type TestPaymentKind = 'wallet' | 'paywall' | 'checkout';
export const checkoutOutcomes = [
    'succeeded',
    'declined',
    'insufficient_funds',
    'requires_verification',
    'expired',
] as const;
export type CheckoutOutcome = (typeof checkoutOutcomes)[number];
export const checkoutCards = {
    succeeded: '4242424242424242',
    declined: '4000000000000002',
    insufficient_funds: '4000000000009995',
    requires_verification: '4000002500003155',
    expired: '4000000000000069',
} as const;
export interface TestTransaction {
    id: string;
    at: string;
    kind: 'payment' | 'topup';
    amount: number;
    payee: string;
    memo: string;
    status: 'awaitingApproval' | 'authorized' | 'succeeded' | 'refused' | 'expired';
    reason?: string;
    approvalId?: string;
    events: { at: string; status: string; reason?: string }[];
}
export interface TestPaymentResource {
    id: string;
    kind: TestPaymentKind;
    testMode: true;
    name: string;
    expiresAt: string;
    endpointUrl?: string;
    balance?: number;
    availableBalance?: number;
    reservedBalance?: number;
    perPaymentLimit?: number;
    dailyLimit?: number;
    approvalThreshold?: number;
    amount?: number;
    currency?: string;
    item?: string;
    description?: string;
    modes?: ('wallet' | 'permissive')[];
    response?: { status: number; body: unknown };
    successUrl?: string;
    cancelUrl?: string;
    webhookUrl?: string;
    attempts?: {
        id: string;
        at: string;
        outcome: CheckoutOutcome;
        last4?: string;
        verified?: boolean;
    }[];
    deliveries?: {
        requestId: string;
        at: string;
        attempts: number;
        status?: number;
        error?: string;
    }[];
}
export function testCardOutcome(number: string): CheckoutOutcome {
    const digits = number.replace(/[ -]/g, '');
    if (!/^\d{13,19}$/.test(digits)) throw new Error('Provide a Luhn-valid fake test card number.');
    let sum = 0;
    for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
        let digit = Number(digits[i]);
        if (double) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
        sum += digit;
    }
    if (sum % 10) throw new Error('Provide a Luhn-valid fake test card number.');
    return (Object.entries(checkoutCards).find(([, value]) => value === digits)?.[0] ??
        'succeeded') as CheckoutOutcome;
}
