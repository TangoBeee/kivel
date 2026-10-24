import type { ToolIcon as IconName } from './icons.js';

export const tools: {
    id: string;
    name: string;
    description: string;
    category: string;
    icon: IconName;
    href: string;
    local: boolean;
}[] = [
    {
        id: 'webhooks',
        name: 'Webhook inbox',
        description:
            'Capture webhook requests and inspect their headers, query parameters, and body.',
        category: 'Developer',
        icon: 'webhook',
        href: '/tools/webhook-inbox/',
        local: false,
    },
    {
        id: 'json',
        name: 'JSON formatter',
        description: 'Format, validate, or minify JSON locally in your browser.',
        category: 'Developer',
        icon: 'braces',
        href: '/tools/json-formatter/',
        local: true,
    },
    {
        id: 'base64',
        name: 'Base64 encoder',
        description: 'Encode UTF-8 text as Base64 or decode a Base64 text value locally.',
        category: 'Developer',
        icon: 'code',
        href: '/tools/base64-encoder/',
        local: true,
    },
    {
        id: 'url',
        name: 'URL encoder',
        description: 'Percent-encode or decode individual URL components and query values.',
        category: 'Everyday',
        icon: 'link',
        href: '/tools/url-encoder/',
        local: true,
    },
    {
        id: 'uuid',
        name: 'UUID generator',
        description: 'Generate up to 100 cryptographically random version 4 UUIDs locally.',
        category: 'Developer',
        icon: 'fingerprint',
        href: '/tools/uuid-generator/',
        local: true,
    },
    {
        id: 'hash',
        name: 'Hash generator',
        description: 'Calculate SHA-256, SHA-384, and SHA-512 hashes.',
        category: 'Developer',
        icon: 'hash',
        href: '/tools/hash-generator/',
        local: true,
    },
];
