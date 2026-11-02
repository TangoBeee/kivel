import { parseJsonSafely } from './engine.js';
import type { OperationOptions } from './definitions.js';
import { Temporal } from '@js-temporal/polyfill';
import { parsePhoneNumberFromString, isSupportedCountry } from 'libphonenumber-js/max';
import type { CountryCode } from 'libphonenumber-js/max';

function count(options: OperationOptions) {
    const value = Number(options.count ?? 5);
    if (!Number.isInteger(value) || value < 1 || value > 50)
        throw new Error('Choose 1 to 50 records.');
    return value;
}
function integer(max: number) {
    const range = 0x100000000;
    let value: number;
    do {
        value = crypto.getRandomValues(new Uint32Array(1))[0]!;
    } while (value >= range - (range % max));
    return value % max;
}
function digits(length: number) {
    return Array.from({ length }, () => integer(10)).join('');
}
function pick<T>(items: readonly T[]): T {
    return items[integer(items.length)]!;
}
const people = {
    'en-US': {
        first: [
            'Ada',
            'Mateo',
            'Priya',
            'Amina',
            'Jordan',
            'Sofia',
            'Ethan',
            'Nora',
            'Diego',
            'Mei',
            'Samira',
            'Oliver',
        ],
        last: [
            'Bennett',
            'Rivera',
            'Patel',
            'Brooks',
            'Chen',
            'Reed',
            'Morgan',
            'Ortiz',
            'Kim',
            'Foster',
            'Shah',
            'Hayes',
        ],
        cities: ['Austin', 'Seattle', 'Portland', 'Boston'],
        street: 'Maple Lane',
        country: 'US',
        postal: '02110',
        region: 'MA',
        city: 'Boston',
    },
    'en-GB': {
        first: [
            'Amelia',
            'Oliver',
            'Noah',
            'Isla',
            'Arjun',
            'Freya',
            'Zara',
            'Theo',
            'Ivy',
            'Oscar',
            'Aisha',
            'Leo',
        ],
        last: [
            'Clarke',
            'Evans',
            'Singh',
            'Hughes',
            'Wilson',
            'Ali',
            'Reed',
            'Wood',
            'Khan',
            'Taylor',
            'Green',
            'Scott',
        ],
        cities: ['York', 'Bristol', 'Leeds', 'Bath'],
        street: 'Orchard Walk',
        country: 'GB',
        postal: 'BS1 4ST',
        region: 'Bristol',
        city: 'Bristol',
    },
    'de-DE': {
        first: [
            'Emilia',
            'Noah',
            'Mia',
            'Leon',
            'Lina',
            'Elias',
            'Hannah',
            'Paul',
            'Amir',
            'Sofia',
            'Finn',
            'Leni',
        ],
        last: [
            'Weber',
            'Fischer',
            'Becker',
            'Hoffmann',
            'Schulz',
            'Koch',
            'Richter',
            'Klein',
            'Wolf',
            'Neumann',
            'Braun',
            'Zimmermann',
        ],
        cities: ['Berlin', 'Bonn', 'Leipzig', 'Dresden'],
        street: 'Lindenweg',
        country: 'DE',
        postal: '10115',
        region: 'Berlin',
        city: 'Berlin',
    },
    'fr-FR': {
        first: [
            'Louise',
            'Gabriel',
            'Jade',
            'Leo',
            'Ambre',
            'Louis',
            'Emma',
            'Arthur',
            'Ines',
            'Adam',
            'Chloe',
            'Hugo',
        ],
        last: [
            'Martin',
            'Bernard',
            'Dubois',
            'Thomas',
            'Robert',
            'Richard',
            'Petit',
            'Durand',
            'Leroy',
            'Moreau',
            'Simon',
            'Laurent',
        ],
        cities: ['Lyon', 'Lille', 'Nantes', 'Rennes'],
        street: 'rue des Tilleuls',
        country: 'FR',
        postal: '69002',
        region: 'Rhone',
        city: 'Lyon',
    },
} as const;
function identities(options: OperationOptions) {
    const locale = options.locale ?? 'en-US';
    const pool = people[locale as keyof typeof people];
    if (!pool) throw new Error('Choose en-US, en-GB, de-DE or fr-FR.');
    const seen = new Set<string>();
    const rows = Array.from({ length: count(options) }, (_, i) => {
        let first: string, last: string, name: string;
        do {
            first = pick(pool.first);
            last = pick(pool.last);
            name = `${first} ${last}`;
        } while (seen.has(name));
        seen.add(name);
        const suffix = crypto.randomUUID().slice(0, 8);
        const phone =
            locale === 'en-US'
                ? `+120255501${String(i).padStart(2, '0')}`
                : locale === 'en-GB'
                  ? `+441632960${String(i).padStart(3, '0')}`
                  : locale === 'de-DE'
                    ? `+4930555${String(1000 + i)}`
                    : `+3319955${String(1000 + i)}`;
        return {
            name,
            firstName: first,
            lastName: last,
            email: `${first.toLowerCase()}.${last.toLowerCase()}.${suffix}@example.test`,
            phone,
            company: `${pick(['Cedar', 'Northfield', 'Juniper', 'Orchard', 'Willow', 'Harbor'])} ${pick(['Studio', 'Works', 'Labs', 'Supply'])} ${i + 1}`,
            address: {
                line1: `${integer(200) + 1} ${pool.street}`,
                city: pool.city,
                region: pool.region,
                postalCode: pool.postal,
                country: pool.country,
            },
        };
    });
    return {
        locale,
        count: rows.length,
        notice: 'Fictional test data. Do not contact these addresses or numbers.',
        identities: rows,
    };
}
export function mod97(value: string) {
    let remainder = 0;
    for (const char of value.toUpperCase()) {
        const part = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
        if (!/^\d+$/.test(part)) throw new Error('Invalid IBAN character.');
        for (const digit of part) remainder = (remainder * 10 + Number(digit)) % 97;
    }
    return remainder;
}
function accounts(options: OperationOptions) {
    const country = (options.country ?? 'DE').toUpperCase();
    if (!['DE', 'GB', 'NL', 'FR', 'ES', 'BE', 'US'].includes(country))
        throw new Error('Choose a supported country.');
    const seen = new Set<string>();
    const rows = [];
    while (rows.length < count(options)) {
        if (country === 'US') {
            const prefix = String(1 + integer(12)).padStart(2, '0') + digits(6);
            const weights = [3, 7, 1, 3, 7, 1, 3, 7];
            const routingNumber =
                prefix +
                String(
                    (10 -
                        ([...prefix].reduce(
                            (sum, digit, i) => sum + Number(digit) * weights[i]!,
                            0,
                        ) %
                            10)) %
                        10,
                );
            const accountNumber = digits(12);
            if (seen.has(accountNumber)) continue;
            seen.add(accountNumber);
            rows.push({ country, routingNumber, accountNumber, type: 'checking' });
            continue;
        }
        const bban =
            country === 'DE'
                ? digits(18)
                : country === 'GB'
                  ? 'TEST' + digits(14)
                  : country === 'NL'
                    ? 'TEST' + digits(10)
                    : country === 'FR'
                      ? digits(23)
                      : country === 'ES'
                        ? digits(20)
                        : digits(12);
        const iban = country + String(98 - mod97(bban + country + '00')).padStart(2, '0') + bban;
        if (seen.has(iban)) continue;
        seen.add(iban);
        rows.push({ country, iban, formatted: iban.match(/.{1,4}/g)!.join(' '), bban });
    }
    return {
        country,
        count: rows.length,
        notice: 'Fake test data for formats and fixtures. Not real accounts or payment sandbox credentials.',
        accounts: rows,
    };
}
export function boundedJson(input: string) {
    if (new TextEncoder().encode(input).length > 65536)
        throw new Error('Use at most 64 KiB of JSON.');
    let value: unknown;
    try {
        value = parseJsonSafely(input);
    } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        throw new Error('Enter valid JSON.');
    }
    let nodes = 0;
    function visit(item: unknown, depth: number) {
        if (depth > 64 || ++nodes > 20000)
            throw new Error('Use at most 64 nesting levels and 20,000 values.');
        if (item && typeof item === 'object')
            for (const child of Object.values(item)) visit(child, depth + 1);
    }
    visit(value, 0);
    return value;
}
type Schema = Record<string, any>;
function infer(values: unknown[], depth = 0): Schema {
    if (depth > 64) throw new Error('Use at most 64 nesting levels.');
    const groups = new Map<string, unknown[]>();
    for (const value of values) {
        const type =
            value === null
                ? 'null'
                : Array.isArray(value)
                  ? 'array'
                  : typeof value === 'number'
                    ? Number.isInteger(value)
                        ? 'integer'
                        : 'number'
                    : typeof value;
        const group = groups.get(type);
        if (group) group.push(value);
        else groups.set(type, [value]);
    }
    if (groups.has('integer') && groups.has('number')) {
        groups.set('number', [...groups.get('number')!, ...groups.get('integer')!]);
        groups.delete('integer');
    }
    const variants = [...groups].map(([type, items]): Schema => {
        if (type === 'array')
            return {
                type,
                items: items.some((a: any) => a.length)
                    ? infer(items.flat() as unknown[], depth + 1)
                    : {},
            };
        if (type === 'object') {
            const objects = items as Record<string, unknown>[];
            const keys = [...new Set(objects.flatMap(Object.keys))];
            const required = keys.filter((key) =>
                objects.every((item) => Object.hasOwn(item, key)),
            );
            return {
                type,
                properties: Object.fromEntries(
                    keys.map((key) => [
                        key,
                        infer(
                            objects
                                .filter((item) => Object.hasOwn(item, key))
                                .map((item) => item[key]),
                            depth + 1,
                        ),
                    ]),
                ),
                ...(required.length ? { required } : {}),
            };
        }
        return { type };
    });
    return variants.length === 1 ? variants[0]! : { anyOf: variants };
}
async function validateSchema(input: string, options: OperationOptions) {
    const document = boundedJson(input),
        schema = boundedJson(options.schema ?? '{}');
    function refs(value: any) {
        if (!value || typeof value !== 'object') return;
        if (typeof value.$ref === 'string' && !value.$ref.startsWith('#'))
            throw new Error('Bundle external schema references before validating.');
        if (value.$async) throw new Error('Async schemas are unsupported.');
        for (const child of Object.values(value)) refs(child);
    }
    refs(schema);
    if (
        typeof schema !== 'boolean' &&
        (!schema || Array.isArray(schema) || typeof schema !== 'object')
    )
        throw new Error('Use an object or boolean JSON Schema.');
    const { RE2JS } = await import('re2js');
    const regExp = Object.assign(
        (pattern: string) => {
            const re = RE2JS.compile(pattern);
            return { test: (value: string) => re.test(value) };
        },
        { code: 'RE2JS' },
    );
    const { Ajv } = await import('ajv');
    const { Ajv2020 } = await import('ajv/dist/2020.js');
    const { default: formats } = await import('ajv-formats');
    const draft =
        typeof schema === 'object' && schema && '$schema' in schema ? String(schema.$schema) : '';
    if (draft && !/draft-07|2020-12/.test(draft))
        throw new Error('Use JSON Schema draft 7 or 2020-12.');
    try {
        const ajv = new (draft.includes('2020-12') ? Ajv2020 : Ajv)({
            allErrors: true,
            strict: false,
            validateFormats: true,
            code: { regExp },
            logger: false,
        });
        (formats as unknown as (instance: typeof ajv) => void)(ajv);
        const validate = ajv.compile(schema);
        const valid = validate(document);
        return {
            valid,
            draft: draft.includes('2020-12') ? '2020-12' : 'draft-07',
            errors: (validate.errors ?? []).slice(0, 100).map((error) => ({
                path: error.instancePath || '/',
                schemaPath: error.schemaPath,
                keyword: error.keyword,
                message: error.message,
                details: error.params,
            })),
        };
    } catch {
        throw new Error(
            'The schema could not be compiled. Check its keywords, local references and RE2 pattern syntax.',
        );
    }
}
async function openapi(input: string) {
    const { parseDocument, LineCounter, isMap, isSeq, visit } = await import('yaml');
    const lineCounter = new LineCounter();
    const parsed = parseDocument(input, { lineCounter, uniqueKeys: true });
    if (parsed.errors.length)
        return {
            valid: false,
            errors: parsed.errors.slice(0, 100).map((error) => ({
                message: error.message.split('\n')[0],
                line: error.linePos?.[0]?.line ?? 1,
                path: '/',
            })),
            warnings: [],
        };
    visit(parsed, {
        Scalar(_key, node) {
            if (typeof node.value !== 'number') return;
            if (!Number.isFinite(node.value))
                throw new Error('OpenAPI numbers must be finite and preserve numeric precision.');
            let source = (node.source ?? String(node.value)).replaceAll('_', '').replace(/^\+/, '');
            if (/^-?0[xob]/i.test(source))
                source = (
                    (source.startsWith('-') ? -1n : 1n) * BigInt(source.replace(/^-/, ''))
                ).toString();
            else if (/^-?\d+$/.test(source)) source = BigInt(source).toString();
            else
                source = source
                    .replace(/^(-?)\./, (_match, sign: string) => `${sign}0.`)
                    .replace(/\.(?=[eE]|$)/, '.0');
            parseJsonSafely(source);
        },
    });
    let document: any;
    try {
        document = parsed.toJS({ maxAliasCount: 0 });
        boundedJson(JSON.stringify(document));
    } catch {
        throw new Error(
            'Use a bounded OpenAPI document without YAML aliases or cyclic references.',
        );
    }
    if (!/^3\.(0|1|2)\./.test(document?.openapi ?? ''))
        throw new Error('Use an OpenAPI 3.0, 3.1 or 3.2 document.');
    const locations = new Map<string, number>();
    function location(node: any, path: string, depth: number) {
        if (!node || depth > 64) return;
        if (node.range) locations.set(path, lineCounter.linePos(node.range[0]).line);
        if (isMap(node))
            for (const item of node.items)
                location(
                    item.value,
                    `${path}/${String((item.key as any)?.value)
                        .replaceAll('~', '~0')
                        .replaceAll('/', '~1')}`,
                    depth + 1,
                );
        if (isSeq(node)) node.items.forEach((item, i) => location(item, `${path}/${i}`, depth + 1));
    }
    location(parsed.contents, '', 0);
    function line(path: string) {
        while (!locations.has(path) && path.includes('/'))
            path = path.slice(0, path.lastIndexOf('/'));
        return locations.get(path) ?? 1;
    }
    const warnings: { path: string; line: number; message: string }[] = [];
    function refs(value: any, path: string) {
        if (!value || typeof value !== 'object') return;
        if (typeof value.$ref === 'string' && !value.$ref.startsWith('#'))
            warnings.push({
                path,
                line: line(path),
                message: 'External reference was not fetched. Bundle it for complete validation.',
            });
        for (const [key, child] of Object.entries(value))
            refs(child, `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`);
    }
    refs(document, '');
    const ids = new Set<string>();
    let operations = 0;
    for (const [path, methods] of Object.entries(document.paths ?? {})) {
        if (!methods || typeof methods !== 'object') continue;
        for (const [method, operation] of Object.entries(methods)) {
            if (
                !/^(get|post|put|patch|delete|head|options|trace)$/.test(method) ||
                !operation ||
                typeof operation !== 'object'
            )
                continue;
            operations++;
            const entry = operation as any,
                pointer = `/paths/${path.replaceAll('~', '~0').replaceAll('/', '~1')}/${method}`;
            if (!entry.operationId)
                warnings.push({
                    path: pointer,
                    line: line(pointer),
                    message: 'Add an operationId for stable client methods.',
                });
            else if (ids.has(entry.operationId))
                warnings.push({
                    path: pointer,
                    line: line(pointer),
                    message: `Duplicate operationId: ${String(entry.operationId).slice(0, 100)}`,
                });
            else ids.add(entry.operationId);
            if (!entry.summary)
                warnings.push({
                    path: pointer,
                    line: line(pointer),
                    message: 'Add a short operation summary.',
                });
        }
    }
    const requiredErrors =
        typeof document.info?.version === 'string'
            ? []
            : [
                  {
                      path: '/info/version',
                      line: line('/info'),
                      message: 'info.version is required and must be a string.',
                  },
              ];
    const { validate } = await import('@scalar/openapi-parser');
    const result = await validate(document);
    return {
        valid: result.valid && !requiredErrors.length,
        version: document.openapi,
        title: document.info?.title ?? '',
        operations,
        errors: [
            ...requiredErrors,
            ...(result.errors ?? []).slice(0, 100).map((error: any) => {
                const rawPath = error.path ?? error.instancePath ?? '';
                const path = Array.isArray(rawPath)
                    ? '/' +
                      rawPath
                          .map((part: string) =>
                              String(part).replaceAll('~', '~0').replaceAll('/', '~1'),
                          )
                          .join('/')
                    : rawPath;
                return {
                    path: typeof path === 'string' ? path : JSON.stringify(path),
                    line: line(typeof path === 'string' ? path : ''),
                    message: error.message ?? 'Invalid OpenAPI document.',
                };
            }),
        ].slice(0, 100),
        warnings: warnings.slice(0, 100),
    };
}
export function scanSecrets(input: string) {
    const rules: [string, RegExp][] = [
        ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
        ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{20,255})\b/g],
        ['Stripe secret key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,255}\b/g],
        ['OpenAI token', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,255}\b/g],
        ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{15,255}\b/g],
        ['SendGrid key', /\bSG\.[A-Za-z0-9_-]{16,100}\.[A-Za-z0-9_-]{16,100}\b/g],
        ['Google API key', /\bAIza[A-Za-z0-9_-]{35}\b/g],
        ['JWT', /\beyJ[A-Za-z0-9_-]{5,1000}\.[A-Za-z0-9_-]{5,1000}\.[A-Za-z0-9_-]{5,1000}\b/g],
        ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g],
        [
            'Credential assignment',
            /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|auth[_-]?token)\s*[:=]\s*["']?([A-Za-z0-9_+\/.=-]{12,255})/gi,
        ],
    ];
    const findings: {
        provider: string;
        masked: string;
        line: number;
        column: number;
        severity: string;
    }[] = [];
    const seen = new Set<number>();
    scan: for (const [provider, pattern] of rules)
        for (const match of input.matchAll(pattern)) {
            const index = match.index! + (match[1] ? match[0].lastIndexOf(match[1]) : 0);
            if (seen.has(index)) continue;
            seen.add(index);
            const token = match[1] ?? match[0],
                before = input.slice(0, index);
            findings.push({
                provider,
                masked: token.length > 16 ? token.slice(0, 4) + '••••' + token.slice(-4) : '••••',
                line: before.split('\n').length,
                column: index - before.lastIndexOf('\n'),
                severity: provider === 'JWT' ? 'review' : 'high',
            });
            if (findings.length >= 100) break scan;
        }
    return {
        count: findings.length,
        findings: findings.sort((a, b) => a.line - b.line || a.column - b.column).slice(0, 100),
        notice: 'Pattern based findings need review. No findings does not prove the text is safe. Revoke confirmed exposed credentials.',
    };
}
export async function runDeveloperTool(
    id: string,
    input: string,
    options: OperationOptions = {},
): Promise<unknown> {
    switch (id) {
        case 'developer-fake-identity-generator':
            return identities(options);
        case 'developer-test-bank-account-generator':
            return accounts(options);
        case 'developer-json-schema-validator':
            return validateSchema(input, options);
        case 'developer-json-schema-from-sample':
            return {
                schema: {
                    $schema: 'https://json-schema.org/draft/2020-12/schema',
                    ...infer([boundedJson(input)]),
                },
                notice: 'Inferred from this sample. Review optional fields and business constraints.',
            };
        case 'developer-openapi-validator':
            return openapi(input);
        case 'developer-secret-scanner':
            return scanSecrets(input);
        case 'developer-phone-number-validator': {
            if (input.length > 64) throw new Error('Use at most 64 characters.');
            const country = (options.country ?? 'US').toUpperCase();
            if (!isSupportedCountry(country))
                throw new Error('Enter a supported two letter country code.');
            const phone = parsePhoneNumberFromString(input.trim(), {
                defaultCountry: country as CountryCode,
                extract: false,
            });
            if (!phone)
                return {
                    valid: false,
                    possible: false,
                    reason: 'The input could not be parsed as a phone number.',
                };
            return {
                valid: phone.isValid(),
                possible: phone.isPossible(),
                country: phone.country ?? null,
                callingCode: phone.countryCallingCode,
                type: phone.getType() ?? 'unknown',
                e164: phone.number,
                international: phone.formatInternational(),
                national: phone.formatNational(),
                uri: phone.getURI(),
                extension: phone.ext ?? null,
                notice: 'Format validation does not confirm ownership or reachability.',
            };
        }
        case 'developer-timezone-converter': {
            if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.trim()))
                throw new Error('Enter an ISO date and time, including T and hours and minutes.');
            if (input.length > 128) throw new Error('Use at most 128 characters.');
            const disambiguation = options.disambiguation ?? 'reject';
            if (!['reject', 'earlier', 'later'].includes(disambiguation))
                throw new Error('Choose reject, earlier or later.');
            try {
                const source = options.from ?? 'America/New_York',
                    target = options.timezone ?? 'Asia/Kolkata';
                const instant = /(?:Z|[+-]\d\d:\d\d)$/.test(input.trim())
                    ? Temporal.Instant.from(input.trim())
                    : Temporal.PlainDateTime.from(input.trim())
                          .toZonedDateTime(source, {
                              disambiguation: disambiguation as 'reject' | 'earlier' | 'later',
                          })
                          .toInstant();
                const from = instant.toZonedDateTimeISO(source),
                    to = instant.toZonedDateTimeISO(target);
                return {
                    source: from.toString(),
                    destination: to.toString(),
                    sourceTimezone: source,
                    destinationTimezone: target,
                    sourceOffset: from.offset,
                    destinationOffset: to.offset,
                    utc: instant.toString(),
                    unixSeconds: Math.floor(instant.epochMilliseconds / 1000),
                    unixMilliseconds: instant.epochMilliseconds,
                    disambiguation,
                };
            } catch {
                throw new Error(
                    'Enter a valid ISO date and time and IANA timezones. This local time may be missing or repeated during daylight saving; choose earlier or later explicitly to resolve it.',
                );
            }
        }
        case 'developer-date-calculator': {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(input.trim()))
                throw new Error('Enter a date as YYYY-MM-DD.');
            try {
                const start = Temporal.PlainDate.from(input.trim());
                if (options.action && !['add', 'difference'].includes(options.action))
                    throw new Error();
                if (options.action === 'difference') {
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(options.to ?? '')) throw new Error();
                    const end = Temporal.PlainDate.from(options.to!);
                    return {
                        start: start.toString(),
                        end: end.toString(),
                        calendarDifference: start.until(end, { largestUnit: 'years' }).toString(),
                        totalDays: start.until(end).days,
                        totalWeeks: start.until(end).days / 7,
                    };
                }
                const raw = options.duration ?? 'P1M';
                if (!/^-?P(?=\d)(?:\d{1,5}Y)?(?:\d{1,6}M)?(?:\d{1,7}W)?(?:\d{1,8}D)?$/.test(raw))
                    throw new Error();
                const duration = Temporal.Duration.from(raw);
                if (Math.abs(duration.total({ unit: 'years', relativeTo: start })) > 10000)
                    throw new Error();
                const end = start.add(duration, { overflow: 'constrain' });
                return {
                    start: start.toString(),
                    duration: duration.toString(),
                    result: end.toString(),
                    dayOfWeek: [
                        'Monday',
                        'Tuesday',
                        'Wednesday',
                        'Thursday',
                        'Friday',
                        'Saturday',
                        'Sunday',
                    ][end.dayOfWeek - 1],
                    daysInMonth: end.daysInMonth,
                    leapYear: end.inLeapYear,
                    overflow: 'constrain to last valid day',
                };
            } catch {
                throw new Error(
                    'Use valid calendar dates and an ISO date duration such as P1M, P2W or -P10D, within 10,000 years.',
                );
            }
        }
        default:
            throw new Error('Unknown developer tool.');
    }
}
