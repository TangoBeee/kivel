import { parseDocument, stringify as yamlStringify, visit, isScalar } from 'yaml';
import Papa from 'papaparse';
import { extraOperations } from './extra-definitions.js';
import type { ExtraOperationId } from './extra-definitions.js';
import { generateTestCards, inspectCardNumber, paymentGeneratorFunding } from './payment-cards.js';

import type { BrowserOperationId, OperationOptions } from './definitions.js';
export interface ToolFile {
    name: string;
    size: number;
    arrayBuffer(): Promise<ArrayBuffer>;
}
export type ToolId = BrowserOperationId | 'json' | 'base64' | 'url' | 'uuid' | 'hash';
const precisionError = () =>
    new Error(
        'This conversion would lose numeric precision. Quote large or highly precise values before converting.',
    );
function decimal(value: string): string | undefined {
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(value);
    if (!match || (!match[2] && !match[3])) return undefined;
    let digits = `${match[2] ?? ''}${match[3] ?? ''}`.replace(/^0+/, '');
    if (!digits) return '0';
    let exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
    const trailing = /0+$/.exec(digits)?.[0].length ?? 0;
    if (trailing) {
        digits = digits.slice(0, -trailing);
        exponent += trailing;
    }
    return `${match[1] === '-' ? '-' : ''}${digits}e${exponent}`;
}
function safeJson(value: string): unknown {
    const result: unknown = JSON.parse(value);
    const tokens = /"(?:\\.|[^"\\])*"|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    for (const token of value.matchAll(tokens))
        if (
            token[1] &&
            (!Number.isFinite(Number(token[1])) ||
                decimal(token[1]) !== decimal(String(Number(token[1]))))
        )
            throw precisionError();
    return result;
}
const pretty = (value: unknown) =>
    JSON.stringify(
        value,
        (_key, item) => {
            if (typeof item === 'bigint') {
                if (
                    item > BigInt(Number.MAX_SAFE_INTEGER) ||
                    item < BigInt(Number.MIN_SAFE_INTEGER)
                )
                    throw precisionError();
                return Number(item);
            }
            if (typeof item === 'number' && !Number.isFinite(item))
                throw new Error('JSON cannot represent NaN or infinity.');
            return item;
        },
        2,
    );
function yaml(value: string, forJson = false) {
    const document = parseDocument(value, { uniqueKeys: true, intAsBigInt: true });
    if (document.errors.length || document.warnings.length)
        throw new Error(document.errors[0]?.message ?? document.warnings[0]!.message);
    visit(document, {
        Map(_key, node) {
            if (
                forJson &&
                node.items.some((pair) => !isScalar(pair.key) || typeof pair.key.value !== 'string')
            )
                throw new Error('JSON conversion requires string mapping keys.');
        },
        Scalar(_key, node) {
            if (
                typeof node.value === 'number' &&
                node.source &&
                decimal(node.source) !== decimal(String(node.value))
            )
                throw precisionError();
        },
    });
    return document.toJS({ maxAliasCount: 20 });
}
function randomBelow(range: bigint) {
    const ceiling = (1n << 64n) - ((1n << 64n) % range);
    const bytes = new Uint8Array(8);
    for (;;) {
        crypto.getRandomValues(bytes);
        let value = 0n;
        for (const byte of bytes) value = (value << 8n) | BigInt(byte);
        if (value < ceiling) return value % range;
    }
}
export async function runBrowserOperation(
    id: ToolId,
    input: string,
    options: OperationOptions = {},
    file?: ToolFile,
): Promise<string> {
    if (
        new TextEncoder().encode(input).length >
        (['json', 'base64', 'url', 'uuid', 'hash'].includes(id) ? 1048576 : 262144)
    )
        throw new Error('Input exceeds this tool’s size limit.');
    if (options.algorithm && !['SHA-256', 'SHA-384', 'SHA-512'].includes(options.algorithm))
        throw new Error('Choose SHA-256, SHA-384, or SHA-512.');
    if (Object.hasOwn(extraOperations, id)) {
        const { runExtraOperation } = await import('./extra-engine.js');
        return runExtraOperation(id as ExtraOperationId, input, options, file);
    }
    switch (id) {
        case 'developer-credit-card-generator':
        case 'developer-debit-card-generator':
        case 'developer-prepaid-card-generator':
            return pretty(generateTestCards(paymentGeneratorFunding[id], options));
        case 'developer-card-number-validator':
            return pretty(inspectCardNumber(input));
        case 'json':
            return formatJson(input, options.action === 'minify');
        case 'base64': {
            if (options.action === 'decode')
                return new TextDecoder('utf-8', { fatal: true }).decode(
                    Uint8Array.from(atob(input.replace(/\s/g, '')), (character) =>
                        character.charCodeAt(0),
                    ),
                );
            const bytes = new TextEncoder().encode(input);
            const pieces: string[] = [];
            for (let index = 0; index < bytes.length; index += 8192)
                pieces.push(String.fromCharCode(...bytes.subarray(index, index + 8192)));
            return btoa(pieces.join(''));
        }
        case 'url':
            return options.action === 'decode'
                ? decodeURIComponent(input)
                : encodeURIComponent(input);
        case 'uuid': {
            const count = Number(options.count ?? '1');
            if (!Number.isInteger(count) || count < 1 || count > 100)
                throw new Error('Choose between 1 and 100 identifiers.');
            return Array.from({ length: count }, () => crypto.randomUUID()).join('\n');
        }
        case 'hash': {
            const bytes = await crypto.subtle.digest(
                options.algorithm ?? 'SHA-256',
                new TextEncoder().encode(input),
            );
            return [...new Uint8Array(bytes)]
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join('');
        }
        case 'developer-yaml-formatter': {
            yaml(input);
            const document = parseDocument(input, { intAsBigInt: true });
            return document.toString({ indent: 2 });
        }
        case 'developer-jwt-inspector': {
            const parts = input.trim().split('.');
            if (
                parts.length !== 3 ||
                !parts.every(
                    (part, index) => (index === 2 && part === '') || /^[A-Za-z0-9_-]+$/.test(part),
                )
            )
                throw new Error('Enter a JWT with three base64url-separated segments.');
            const decode = (part: string) => {
                const json = new TextDecoder('utf-8', { fatal: true }).decode(
                    Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), (character) =>
                        character.charCodeAt(0),
                    ),
                );
                const value = JSON.parse(json);
                if (!value || typeof value !== 'object' || Array.isArray(value))
                    throw new Error('JWT headers and claims must be JSON objects.');
                return formatJson(json).replaceAll('\n', '\n  ');
            };
            return `{\n  "verified": false,\n  "header": ${decode(parts[0]!)},\n  "claims": ${decode(parts[1]!)}\n}`;
        }
        case 'developer-url-parser': {
            const value = new URL(input.trim());
            return pretty({
                protocol: value.protocol,
                hostname: value.hostname,
                port: value.port,
                pathname: value.pathname,
                query: [...value.searchParams.entries()],
                fragment: value.hash,
                username: value.username,
                password: value.password,
                origin: value.origin,
            });
        }
        case 'developer-hmac-generator': {
            if (!options.secret) throw new Error('Enter a secret key.');
            const key = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(options.secret),
                { name: 'HMAC', hash: options.algorithm ?? 'SHA-256' },
                false,
                ['sign'],
            );
            const signature = await crypto.subtle.sign(
                'HMAC',
                key,
                new TextEncoder().encode(input),
            );
            return [...new Uint8Array(signature)]
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join('');
        }
        case 'developer-unix-timestamp-converter':
        case 'everyday-timestamp-converter': {
            const value = input.trim();
            const mode = options.unit ?? 'seconds';
            if (
                mode === 'date' &&
                !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
                    value,
                )
            )
                throw new Error('Use an ISO date, such as 2026-01-01 or 2026-01-01T12:00:00Z.');
            if (mode !== 'date' && !/^-?\d+(?:\.\d+)?$/.test(value))
                throw new Error('Enter a numeric timestamp.');
            if (mode === 'date') {
                const day = value.slice(0, 10);
                const parsedDay = new Date(`${day}T00:00:00Z`);
                if (
                    !Number.isFinite(parsedDay.getTime()) ||
                    parsedDay.toISOString().slice(0, 10) !== day
                )
                    throw new Error('Enter a valid calendar date.');
            }
            const milliseconds =
                mode === 'date'
                    ? Date.parse(value)
                    : Number(value) * (mode === 'milliseconds' ? 1 : 1000);
            if (!Number.isSafeInteger(milliseconds) || Math.abs(milliseconds) > 8.64e15)
                throw new Error(
                    'The timestamp is outside the supported date range or has sub-millisecond precision.',
                );
            const date = new Date(milliseconds);
            return pretty({
                iso: date.toISOString(),
                unixSeconds: milliseconds / 1000,
                unixMilliseconds: milliseconds,
                utc: date.toUTCString(),
            });
        }
        case 'everyday-case-converter': {
            const words =
                input
                    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
                    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
                    .match(/[\p{L}\p{N}]+/gu) ?? [];
            switch (options.mode) {
                case 'lower':
                    return input.toLowerCase();
                case 'title':
                    return input.replace(
                        /[\p{L}\p{N}]+/gu,
                        (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
                    );
                case 'snake':
                    return words.map((word) => word.toLowerCase()).join('_');
                case 'kebab':
                    return words.map((word) => word.toLowerCase()).join('-');
                case 'camel':
                    return words
                        .map((word, index) =>
                            index
                                ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                                : word.toLowerCase(),
                        )
                        .join('');
                default:
                    return input.toUpperCase();
            }
        }
        case 'everyday-text-cleaner':
            return input
                .replace(/\r\n?/g, '\n')
                .split('\n')
                .map((line) => line.replace(/[\t ]+/g, ' ').trim())
                .join('\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        case 'everyday-csv-to-json': {
            const result = Papa.parse<Record<string, string>>(input, {
                header: true,
                delimiter: ',',
                skipEmptyLines: 'greedy',
            });
            if (result.errors.length) throw new Error(`Invalid CSV: ${result.errors[0]!.message}`);
            if (result.meta.renamedHeaders) throw new Error('CSV headers must be unique.');
            if (result.data.length > 5000 || (result.meta.fields?.length ?? 0) > 256)
                throw new Error('Use at most 5,000 rows and 256 columns.');
            return pretty(result.data);
        }
        case 'everyday-json-to-csv': {
            const rows: unknown = safeJson(input);
            if (
                !Array.isArray(rows) ||
                rows.length > 5000 ||
                rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))
            )
                throw new Error('Use an array of up to 5,000 JSON objects.');
            const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))];
            if (fields.length > 256) throw new Error('Use at most 256 columns.');
            return Papa.unparse(
                {
                    fields,
                    data: rows.map((row) =>
                        fields.map((field) =>
                            typeof row[field] === 'object' && row[field] !== null
                                ? JSON.stringify(row[field])
                                : (row[field] ?? ''),
                        ),
                    ),
                },
                { escapeFormulae: true, newline: '\n' },
            );
        }
        case 'everyday-data-format-converter':
            return options.mode === 'json-yaml'
                ? yamlStringify(safeJson(input))
                : pretty(yaml(input, true));
        case 'everyday-password-generator': {
            const length = Number(options.length ?? '20');
            if (!Number.isInteger(length) || length < 8 || length > 128)
                throw new Error('Choose a length between 8 and 128.');
            const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+-=?';
            return Array.from(
                { length },
                () => alphabet[Number(randomBelow(BigInt(alphabet.length)))],
            ).join('');
        }
        case 'everyday-random-generator': {
            if (!(options.min ?? '1').trim() || !(options.max ?? '100').trim())
                throw new Error('Enter both numeric bounds.');
            const min = Number(options.min ?? '1'),
                max = Number(options.max ?? '100');
            if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max)
                throw new Error('Use safe integer bounds with minimum no greater than maximum.');
            return String(Number(BigInt(min) + randomBelow(BigInt(max) - BigInt(min) + 1n)));
        }
        case 'everyday-file-checksums': {
            if (!file) throw new Error('Choose a file first.');
            if (file.size > 25 * 1024 * 1024) throw new Error('Choose a file smaller than 25 MiB.');
            const digest = await crypto.subtle.digest(
                options.algorithm ?? 'SHA-256',
                await file.arrayBuffer(),
            );
            return [...new Uint8Array(digest)]
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join('');
        }
    }
    throw new Error('This tool is not supported.');
}

export function formatJson(input: string, minify = false): string {
    JSON.parse(input);
    let quoted = false,
        escaped = false,
        compact = '';
    for (const character of input) {
        if (quoted) {
            compact += character;
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === '"') quoted = false;
        } else if (character === '"') {
            quoted = true;
            compact += character;
        } else if (!/\s/.test(character)) compact += character;
    }
    let depth = 0,
        output = '';
    quoted = false;
    escaped = false;
    const append = (text: string) => {
        output += text;
        if (output.length > 4 * 1024 * 1024) throw new Error('Formatted output exceeds 4 MiB.');
    };
    for (let index = 0; index < compact.length; index++) {
        const character = compact[index]!;
        if (quoted) {
            append(character);
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === '"') quoted = false;
        } else if (character === '"') {
            quoted = true;
            append(character);
        } else if (character === '{' || character === '[') {
            if (++depth > 128) throw new Error('JSON nesting exceeds 128 levels.');
            append(character);
            if (!minify && !['}', ']'].includes(compact[index + 1] ?? ''))
                append('\n' + '  '.repeat(depth));
        } else if (character === '}' || character === ']') {
            depth--;
            if (!minify && !['{', '['].includes(compact[index - 1] ?? ''))
                append('\n' + '  '.repeat(depth));
            append(character);
        } else if (character === ',') append(minify ? ',' : ',\n' + '  '.repeat(depth));
        else if (character === ':') append(minify ? ':' : ': ');
        else append(character);
    }
    return output;
}

export const parseJsonSafely = safeJson;
