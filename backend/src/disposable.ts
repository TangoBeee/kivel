import { createRequire } from 'node:module';

// Throwaway inbox providers, from the maintained disposable-email-domains list, plus our own
// receive-only agent inbox domain, so free accounts cannot be farmed with addresses nobody keeps.
const require = createRequire(import.meta.url);
const domains = new Set<string>(require('disposable-email-domains/index.json') as string[]);
const wildcards = require('disposable-email-domains/wildcard.json') as string[];
const ours = new Set(['socketspace.xyz']);

export function isDisposableEmail(email: string): boolean {
    const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
    if (domains.has(domain) || ours.has(domain)) return true;
    return [...wildcards, ...ours].some((root) => domain.endsWith(`.${root}`));
}
