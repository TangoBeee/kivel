import { extraOperations } from './extra-definitions.js';
export const browserOperations = {
    ...extraOperations,
    'developer-credit-card-generator': { action: 'Generate test cards', input: false },
    'developer-debit-card-generator': { action: 'Generate test cards', input: false },
    'developer-prepaid-card-generator': { action: 'Generate test cards', input: false },
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
    count?: string;
    mode?: string;
    secret?: string;
    length?: string;
    min?: string;
    max?: string;
    algorithm?: string;
    unit?: string;
}
