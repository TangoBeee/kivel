import type { MockRoute } from './mock-config.js';
export interface MockRequest {
    path: string;
    query: Record<string, unknown>;
    headers: Record<string, unknown>;
    body: unknown;
}
export function matchMockCondition(route: MockRoute, request: MockRequest): boolean {
    if (!route.condition) return true;
    const { source, key, value } = route.condition;
    const object =
        source === 'header' ? request.headers : source === 'query' ? request.query : request.body;
    return (
        !!object &&
        typeof object === 'object' &&
        !Array.isArray(object) &&
        Object.hasOwn(object, key) &&
        String((object as Record<string, unknown>)[key]) === value
    );
}
const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]!;
const first = [
    'Ava',
    'Liam',
    'Maya',
    'Noah',
    'Priya',
    'Arjun',
    'Sofia',
    'Kenji',
    'Amara',
    'Lucas',
    'Zara',
    'Omar',
];
const last = [
    'Patel',
    'Garcia',
    'Kim',
    'Okafor',
    'Rossi',
    'Nguyen',
    'Silva',
    'Haddad',
    'Novak',
    'Sato',
    'Singh',
    'Brown',
];
const cities = [
    'Lisbon',
    'Pune',
    'Austin',
    'Nairobi',
    'Osaka',
    'Toronto',
    'Berlin',
    'Bogotá',
    'Melbourne',
    'Seoul',
];
const countries = [
    'Portugal',
    'India',
    'United States',
    'Kenya',
    'Japan',
    'Canada',
    'Germany',
    'Colombia',
    'Australia',
    'South Korea',
];
const companies = [
    'Acme Labs',
    'Northwind',
    'Blue Harbor',
    'Lumen Works',
    'Pinecrest',
    'Orbital Systems',
    'Brightline',
    'Cobalt & Co',
];
const words = [
    'socket',
    'river',
    'amber',
    'pixel',
    'harbor',
    'signal',
    'meadow',
    'vector',
    'lantern',
    'quartz',
    'summit',
    'echo',
];
const hex = (length: number) =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');

/** Realistic sample values for `{{fake.*}}` placeholders. Unknown names render as empty text. */
export const fakeValues: Record<string, () => string> = {
    firstName: () => pick(first),
    lastName: () => pick(last),
    name: () => `${pick(first)} ${pick(last)}`,
    email: () => `${pick(first).toLowerCase()}.${pick(last).toLowerCase()}@example.com`,
    username: () => `${pick(words)}_${Math.floor(Math.random() * 900 + 100)}`,
    phone: () => `+1-555-${String(Math.floor(Math.random() * 9000 + 1000))}`,
    company: () => pick(companies),
    city: () => pick(cities),
    country: () => pick(countries),
    uuid: () => `${hex(8)}-${hex(4)}-4${hex(3)}-${pick(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}`,
    id: () => hex(12),
    int: () => String(Math.floor(Math.random() * 1000)),
    price: () => (Math.random() * 200 + 1).toFixed(2),
    bool: () => String(Math.random() < 0.5),
    word: () => pick(words),
    sentence: () => {
        const text = Array.from({ length: 6 }, () => pick(words)).join(' ');
        return `${text[0]!.toUpperCase()}${text.slice(1)}.`;
    },
    url: () => `https://${pick(words)}.example.com/${pick(words)}`,
    date: () => new Date(Date.now() - Math.random() * 3e10).toISOString().slice(0, 10),
    datetime: () => new Date(Date.now() - Math.random() * 3e10).toISOString(),
    now: () => new Date().toISOString(),
};

const placeholder = /\{\{\s*([^{}]*?)\s*\}\}/g;
const templateHelp =
    'Use {{path.id}} for a :id route segment, {{query.name}}, {{body.name}} or {{fake.name}}.';

/**
 * Checks a template body when a mock is saved, so a wrong placeholder fails loudly instead of
 * being returned as literal text. Agents often guess Express style {{params.id}}. Unknown
 * {{fake.*}} names stay allowed and render as empty text, as documented.
 */
export function checkTemplate(body: string, routePath: string, index = 0) {
    const label = `Route ${index + 1}`;
    const params = new Set(
        routePath
            .split('/')
            .filter((part) => part.startsWith(':'))
            .map((part) => part.slice(1)),
    );
    for (const [whole, inner] of body.matchAll(placeholder)) {
        const match = /^(path|query|body|fake)\.([A-Za-z][A-Za-z0-9_]*)$/.exec(inner!);
        if (!match) {
            const guess = /^(?:params|param|route)\.([A-Za-z][A-Za-z0-9_]*)$/.exec(inner!);
            throw new Error(
                guess
                    ? `${label}: unknown placeholder ${whole}. Use {{path.${guess[1]}}} for the :${guess[1]} route segment.`
                    : `${label}: unknown placeholder ${whole}. ${templateHelp}`,
            );
        }
        const [, source, key] = match;
        if (source === 'path' && !params.has(key!))
            throw new Error(
                `${label}: ${whole} has no matching :${key} segment in ${routePath || 'the route path'}.`,
            );
    }
}

export function renderMockBody(route: MockRoute, request: MockRequest): string {
    if (!route.template) return route.body;
    const path: Record<string, string> = Object.create(null);
    route.path.split('/').forEach((part, index) => {
        if (part.startsWith(':')) path[part.slice(1)] = request.path.split('/')[index] ?? '';
    });
    const json = (route.headers['content-type'] ?? 'application/json').includes('json');
    // One response describes one person, so name, email and username agree with each other.
    const firstName = pick(first);
    const lastName = pick(last);
    const person = {
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
        username: `${firstName.toLowerCase()}_${lastName.toLowerCase()}${Math.floor(Math.random() * 90 + 10)}`,
    };
    let bytes = new TextEncoder().encode(route.body).length;
    return route.body.replace(
        /\{\{(path|query|body|fake)\.([A-Za-z][A-Za-z0-9_]*)\}\}/g,
        (_match, source: string, key: string) => {
            if (source === 'fake') {
                const text = Object.hasOwn(person, key)
                    ? person[key as keyof typeof person]
                    : Object.hasOwn(fakeValues, key)
                      ? fakeValues[key]!()
                      : '';
                const replacement = json ? JSON.stringify(text).slice(1, -1) : text;
                bytes += new TextEncoder().encode(replacement).length - _match.length;
                if (bytes > 65536) throw new Error('Rendered response exceeds 64 KiB.');
                return replacement;
            }
            const object =
                source === 'path' ? path : source === 'query' ? request.query : request.body;
            const value =
                object &&
                typeof object === 'object' &&
                !Array.isArray(object) &&
                Object.hasOwn(object, key)
                    ? (object as Record<string, unknown>)[key]
                    : '';
            const text =
                typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
                    ? String(value)
                    : '';
            if (text.length > 4096)
                throw new Error('Template values are limited to 4,096 characters.');
            const replacement = json ? JSON.stringify(text).slice(1, -1) : text;
            bytes += new TextEncoder().encode(replacement).length - _match.length;
            if (bytes > 65536) throw new Error('Rendered response exceeds 64 KiB.');
            return replacement;
        },
    );
}
