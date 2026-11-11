import { extraOperations } from './extra-definitions.js';
import type { UtilityField } from './extra-definitions.js';
const cardFields: readonly UtilityField[] = [
    {
        key: 'mode',
        label: 'Mode',
        defaultValue: 'generated',
        choices: [
            ['generated', 'Generated test data'],
            ['sandbox', 'Payment sandbox numbers'],
        ],
    },
    {
        key: 'provider',
        label: 'Payment provider',
        defaultValue: 'stripe',
        when: ['mode', 'sandbox'],
        choices: [
            ['stripe', 'Stripe'],
            ['adyen', 'Adyen'],
            ['braintree', 'Braintree'],
            ['paypal', 'PayPal'],
        ],
    },
    {
        key: 'brand',
        label: 'Card brand',
        defaultValue: 'all',
        choices: [
            ['all', 'All brands'],
            ['visa', 'Visa'],
            ['mastercard', 'Mastercard'],
            ['amex', 'American Express'],
            ['discover', 'Discover'],
            ['jcb', 'JCB'],
            ['diners', 'Diners Club'],
            ['unionpay', 'UnionPay'],
        ],
    },
    {
        key: 'count',
        label: 'Number of cards',
        defaultValue: '10',
        type: 'number',
        min: 1,
        max: 500,
    },
    {
        key: 'bin',
        label: 'BIN or card prefix (optional)',
        type: 'text',
        defaultValue: '',
        when: ['mode', 'generated'],
    },
    {
        key: 'expiry',
        label: 'Expiry MM/YY (optional)',
        type: 'text',
        defaultValue: '',
        when: ['mode', 'generated'],
    },
    {
        key: 'cvc',
        label: 'CVV (optional)',
        type: 'text',
        defaultValue: '',
        when: ['mode', 'generated'],
    },
    {
        key: 'address',
        label: 'Include billing address',
        defaultValue: 'false',
        choices: [
            ['false', 'No'],
            ['true', 'Yes'],
        ],
    },
    {
        key: 'country',
        label: 'Billing country',
        defaultValue: 'US',
        when: ['address', 'true'],
        choices: [
            ['US', 'United States'],
            ['GB', 'United Kingdom'],
            ['CA', 'Canada'],
            ['AU', 'Australia'],
            ['DE', 'Germany'],
            ['FR', 'France'],
        ],
    },
];
export const browserOperations = {
    ...extraOperations,
    'developer-credit-card-generator': {
        action: 'Generate test cards',
        input: false,
        fields: cardFields,
    },
    'developer-debit-card-generator': {
        action: 'Generate test cards',
        input: false,
        fields: cardFields,
    },
    'developer-prepaid-card-generator': {
        action: 'Generate test cards',
        input: false,
        fields: cardFields,
    },
    'developer-card-number-validator': { action: 'Check card number', input: true },
    'developer-yaml-formatter': { action: 'Format YAML', input: true },
    'developer-jwt-inspector': { action: 'Inspect token', input: true },
    'developer-url-parser': { action: 'Parse URL', input: true },
    'developer-hmac-generator': { action: 'Generate HMAC', input: true },
    'developer-unix-timestamp-converter': { action: 'Convert timestamp', input: true },
    'everyday-timestamp-converter': { action: 'Convert timestamp', input: true },
    'everyday-case-converter': { action: 'Convert case', input: true },
    'everyday-text-cleaner': { action: 'Clean text', input: true },
    'everyday-csv-to-json': { action: 'Convert to JSON', input: true },
    'everyday-json-to-csv': { action: 'Convert to CSV', input: true },
    'everyday-data-format-converter': { action: 'Convert data', input: true },
    'everyday-password-generator': { action: 'Generate password', input: false },
    'everyday-random-generator': { action: 'Generate number', input: false },
    'everyday-file-checksums': { action: 'Calculate checksum', input: false },
} as const;
export type BrowserOperationId = keyof typeof browserOperations;
export interface OperationOptions {
    cursor?: string;
    theme?: string;
    seed?: string;
    background?: string;
    foreground?: string;
    accent?: string;
    style?: string;
    subtitle?: string;
    page?: string;
    values?: string;
    pages?: string;
    quality?: string;
    x?: string;
    y?: string;
    rotation?: string;
    flip?: string;
    action?: string;
    recordType?: string;
    origin?: string;
    headerNames?: string;
    credentials?: string;
    expectedTxt?: string;
    pattern?: string;
    flags?: string;
    comparison?: string;
    timezone?: string;
    start?: string;
    method?: string;
    headers?: string;
    body?: string;
    from?: string;
    to?: string;
    columns?: string;
    size?: string;
    width?: string;
    height?: string;
    format?: string;
    frequency?: string;
    duration?: string;
    level?: string;
    brand?: string;
    provider?: string;
    protocol?: string;
    address?: string;
    count?: string;
    mode?: string;
    secret?: string;
    length?: string;
    min?: string;
    max?: string;
    algorithm?: string;
    unit?: string;
    locale?: string;
    country?: string;
    schema?: string;
    selector?: string;
    disambiguation?: string;
    userAgent?: string;
    domain?: string;
    bin?: string;
    expiry?: string;
    cvc?: string;
}
