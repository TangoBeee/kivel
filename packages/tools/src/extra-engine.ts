import type { ToolFile } from './engine.js';
import { validateMock } from './mock-config.js';
import { parseEnvironment as parse } from './env-parser.js';
import type { OperationOptions } from './definitions.js';
import { extraOperations } from './extra-definitions.js';
import type { ExtraOperationId, ExtraDefinition } from './extra-definitions.js';
import { artifact, xmlEscape, samplePdf, zipTextFiles, toneWav } from './artifacts.js';
import { formatJson } from './engine.js';
const json = (value: unknown) => JSON.stringify(value, null, 2);
function integer(value: string | undefined, fallback: number, min: number, max: number) {
    const result = Number(value ?? fallback);
    if (!Number.isInteger(result) || result < min || result > max)
        throw new Error(`Choose an integer between ${min} and ${max}.`);
    return result;
}
export function quoteShell(value: string) {
    return `'${value.replaceAll("'", "'\\''")}'`;
}
function url(value: string) {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
        throw new Error('Use an HTTP or HTTPS URL without embedded credentials.');
    return parsed.href;
}
function headers(value: string) {
    if (!value.trim()) return [];
    const lines = value.replace(/\r\n?/g, '\n').split('\n').filter(Boolean);
    if (lines.length > 64) throw new Error('Use at most 64 headers.');
    return lines.map((line) => {
        const index = line.indexOf(':'),
            name = line.slice(0, index),
            value = line.slice(index + 1).trim();
        if (
            index < 1 ||
            !/[!#$%&'*+.^_`|~0-9A-Za-z-]+/.test(name) ||
            !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
            /[\x00-\x1f\x7f]/.test(value)
        )
            throw new Error('Use valid header names and single-line values.');
        return { name, value };
    });
}
function request(input: string, options: OperationOptions) {
    const method = options.method ?? 'GET';
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method))
        throw new Error('Choose a supported HTTP method.');
    const data = {
        method,
        url: url(input),
        headers: headers(options.headers ?? ''),
        body: options.body ?? '',
    };
    const curl = [
        'curl',
        '-X',
        method,
        quoteShell(data.url),
        ...data.headers.flatMap((header) => ['-H', quoteShell(`${header.name}: ${header.value}`)]),
        ...(data.body ? ['--data-raw', quoteShell(data.body)] : []),
    ].join(' ');
    return { ...data, curl };
}
export function shellWords(input: string) {
    const words: string[] = [];
    let word = '',
        quote = '',
        active = false;
    for (let i = 0; i < input.length; i++) {
        const c = input[i]!;
        if (quote) {
            if (c === quote) {
                quote = '';
                continue;
            }
            if (
                c === '\\' &&
                quote === '"' &&
                ['$', '`', '"', '\\', '\n'].includes(input[i + 1] ?? '')
            ) {
                const next = input[++i]!;
                if (next !== '\n') word += next;
            } else word += c;
            continue;
        }
        if (c === '"' || c === "'") {
            quote = c;
            active = true;
        } else if (c === '\\') {
            if (i + 1 >= input.length) throw new Error('Incomplete escape.');
            const next = input[++i]!;
            if (next !== '\n') {
                word += next;
                active = true;
            }
        } else if (/\s/.test(c)) {
            if (active) {
                words.push(word);
                word = '';
                active = false;
            }
        } else {
            if (/[;&|<>`]/.test(c))
                throw new Error('Shell operators and command substitution are not supported.');
            word += c;
            active = true;
        }
    }
    if (quote) throw new Error('Close the quoted argument.');
    if (active) words.push(word);
    if (words.length > 256) throw new Error('Use at most 256 arguments.');
    return words;
}
function parseCurl(input: string) {
    const args = shellWords(input);
    if (args.shift() !== 'curl') throw new Error('Start the command with curl.');
    let target = '',
        method = '',
        body: string | undefined,
        user: string | undefined;
    const parsedHeaders: { name: string; value: string }[] = [];
    const flags: string[] = [];
    for (let i = 0; i < args.length; i++) {
        let arg = args[i]!;
        const equals = arg.startsWith('--') ? arg.indexOf('=') : -1;
        if (equals > 0) {
            args.splice(i + 1, 0, arg.slice(equals + 1));
            arg = arg.slice(0, equals);
        }
        const take = () => {
            if (i + 1 >= args.length) throw new Error(`Missing value for ${arg}.`);
            return args[++i]!;
        };
        if (arg === '-X' || arg === '--request') method = take();
        else if (arg.startsWith('-X') && arg.length > 2) method = arg.slice(2);
        else if (arg === '-H' || arg === '--header') parsedHeaders.push(...headers(take()));
        else if (arg.startsWith('-H') && arg.length > 2)
            parsedHeaders.push(...headers(arg.slice(2)));
        else if (['-d', '--data', '--data-raw', '--data-binary'].includes(arg)) {
            const value = take();
            body = body === undefined ? value : `${body}&${value}`;
            if (!method) method = 'POST';
        } else if (arg === '--url') {
            if (target) throw new Error('Use one URL.');
            target = take();
        } else if (arg === '-u' || arg === '--user') user = take();
        else if (arg === '-I' || arg === '--head') method = 'HEAD';
        else if (
            [
                '-L',
                '--location',
                '-k',
                '--insecure',
                '-s',
                '-S',
                '-sS',
                '--silent',
                '--show-error',
                '-f',
                '--fail',
                '--fail-with-body',
                '--compressed',
            ].includes(arg)
        )
            flags.push(arg);
        else if (arg.startsWith('-')) throw new Error(`Unsupported option: ${arg}`);
        else {
            if (target) throw new Error('Use one URL.');
            target = arg;
        }
    }
    if (!target) throw new Error('Provide a URL.');
    if (parsedHeaders.length > 64) throw new Error('Use at most 64 headers.');
    return {
        method: method || 'GET',
        url: url(target),
        headers: parsedHeaders,
        ...(body !== undefined ? { body } : {}),
        ...(user ? { user } : {}),
        flags,
        executed: false,
        note: 'Arguments are inspected literally. Variables and file references are not expanded or opened.',
    };
}
function records(options: OperationOptions) {
    const count = integer(options.count, 10, 1, 1000),
        fields = (options.columns ?? 'id,name,email,active')
            .split(',')
            .map((field) => field.trim());
    if (
        !fields.length ||
        fields.length > 32 ||
        new Set(fields).size !== fields.length ||
        fields.some(
            (field) =>
                !/^[A-Za-z_][\w -]{0,40}$/.test(field) ||
                ['__proto__', 'prototype', 'constructor'].includes(field),
        )
    )
        throw new Error('Use one to 32 unique, safe column names.');
    return Array.from({ length: count }, (_, i) =>
        Object.fromEntries(
            fields.map((field) => [
                field,
                field === 'id'
                    ? i + 1
                    : field === 'name'
                      ? `Example ${i + 1}`
                      : field === 'email'
                        ? `person${i + 1}@example.test`
                        : field === 'active'
                          ? true
                          : `${field}-${i + 1}`,
            ]),
        ),
    );
}
const units: Record<string, readonly [string, number]> = {
    m: ['length', 1],
    km: ['length', 1000],
    cm: ['length', 0.01],
    mm: ['length', 0.001],
    in: ['length', 0.0254],
    ft: ['length', 0.3048],
    yd: ['length', 0.9144],
    mi: ['length', 1609.344],
    kg: ['mass', 1],
    g: ['mass', 0.001],
    mg: ['mass', 0.000001],
    lb: ['mass', 0.45359237],
    oz: ['mass', 0.028349523125],
    L: ['volume', 1],
    mL: ['volume', 0.001],
    m3: ['volume', 1000],
    gal: ['volume', 3.785411784],
    floz: ['volume', 0.0295735295625],
    s: ['time', 1],
    min: ['time', 60],
    h: ['time', 3600],
    d: ['time', 86400],
    week: ['time', 604800],
    'm/s': ['speed', 1],
    'km/h': ['speed', 1 / 3.6],
    mph: ['speed', 0.44704],
    kn: ['speed', 1852 / 3600],
    C: ['temperature', 1],
    F: ['temperature', 1],
    K: ['temperature', 1],
};
export async function runExtraOperation(
    id: ExtraOperationId,
    input: string,
    options: OperationOptions,
    file?: ToolFile,
): Promise<string> {
    const inputLimit = id === 'mock-apis-mock-configuration-import' ? 81920 : 65536;
    if (new TextEncoder().encode(input).length > inputLimit)
        throw new Error(`Use at most ${inputLimit / 1024} KiB of input.`);
    const definition: ExtraDefinition = extraOperations[id];
    for (const field of definition.fields ?? [])
        if (
            field.choices &&
            options[field.key] !== undefined &&
            !field.choices.some(([value]) => value === options[field.key])
        )
            throw new Error(`Choose a supported value for ${field.label}.`);
    if (id.startsWith('email-'))
        return (await import('./email-engine.js')).runEmail(id, input, options, file);
    if (
        id.startsWith('databases-') ||
        id === 'everyday-document-converter' ||
        id === 'agents-mcp-tool-call-inspector'
    )
        return (await import('./data-engine.js')).runData(id, input, options);
    if (
        [
            'test-media-audio-composer',
            'test-media-sample-audio',
            'test-media-music-library',
        ].includes(id)
    ) {
        if (options.format === 'mp3')
            throw new Error(
                'Full MP3 arrangements are served by the hosted API and music-library download endpoints.',
            );
        const { defaultRecipe, renderAudio, musicTracks } = await import('./audio.js');
        if (
            id === 'test-media-music-library' &&
            !musicTracks.some((t) => t.id === (options.mode ?? musicTracks[0].id))
        )
            throw new Error('Choose a track from the music library.');
        return renderAudio(input.trim() ? JSON.parse(input) : defaultRecipe(options.mode));
    }
    switch (id) {
        case 'mock-apis-mock-configuration-import':
            return json(validateMock(JSON.parse(input)));
        case 'mock-apis-openapi-to-mock': {
            const { openApiMock } = await import('./openapi-mock.js');
            return json(openApiMock(input));
        }
        case 'everyday-barcode-generator': {
            if (!input || input.length > 80)
                throw new Error('Enter one to 80 supported characters.');
            const { default: bwipjs } = await import('bwip-js');
            const svg = bwipjs.toSVG({
                bcid: options.format ?? 'code128',
                text: input,
                scale: 3,
                height: 12,
                includetext: true,
                textxalign: 'center',
                padding: 8,
                backgroundcolor: 'FFFFFF',
            });
            return artifact('barcode.svg', 'image/svg+xml', svg);
        }
        case 'files-file-metadata-inspector': {
            if (!file) throw new Error('Choose a file first.');
            if (file.size > 25 * 1048576) throw new Error('Choose a file up to 25 MiB.');
            const bytes = new Uint8Array(await file.arrayBuffer()),
                start = bytes.subarray(0, 16),
                ascii = new TextDecoder().decode(start);
            const signatureHint = ascii.startsWith('%PDF-')
                ? 'PDF'
                : start[0] === 137 && ascii.slice(1, 4) === 'PNG'
                  ? 'PNG'
                  : start[0] === 255 && start[1] === 216 && start[2] === 255
                    ? 'JPEG'
                    : /^GIF8[79]a/.test(ascii)
                      ? 'GIF'
                      : ascii.startsWith('PK\x03\x04')
                        ? 'ZIP'
                        : ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE'
                          ? 'WAV'
                          : ascii.slice(4, 8) === 'ftyp'
                            ? 'MP4-family'
                            : 'Unknown';
            return json({
                name: file.name,
                size: bytes.length,
                extension: file.name.includes('.')
                    ? file.name.split('.').at(-1)!.toLowerCase()
                    : '',
                signatureHint,
                initialBytesHex: Array.from(start, (b) => b.toString(16).padStart(2, '0')).join(
                    ' ',
                ),
                note: 'Signature hints are not file validation or malware scanning.',
            });
        }
        case 'developer-xml-formatter': {
            if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(input))
                throw new Error('DTD and entity declarations are not supported.');
            const { XMLParser, XMLBuilder, XMLValidator } = await import('fast-xml-parser');
            const valid = XMLValidator.validate(input);
            if (valid !== true) throw new Error(`Invalid XML: ${valid.err.msg}`);
            const parsed = new XMLParser({
                preserveOrder: true,
                cdataPropName: '#cdata',
                commentPropName: '#comment',
                ignoreAttributes: false,
                parseTagValue: false,
                parseAttributeValue: false,
                trimValues: false,
                processEntities: false,
                maxNestedTags: 64,
            }).parse(input);
            const mixed = (nodes: any[]): boolean =>
                nodes.some((node) =>
                    Object.entries(node).some(([key, value]) => {
                        if (!Array.isArray(value) || key === ':@') return false;
                        const elements = value.some((child) =>
                            Object.keys(child).some(
                                (name) =>
                                    !name.startsWith('#') && name !== ':@' && !name.startsWith('?'),
                            ),
                        );
                        const text = value.some((child) =>
                            Object.entries(child).some(
                                ([name, value]) =>
                                    (name === '#text' || name === '#cdata') &&
                                    /\S/.test(String(value)),
                            ),
                        );
                        return (elements && text) || mixed(value);
                    }),
                );
            if (
                input.includes('<![CDATA[') ||
                mixed(parsed) ||
                /\bxml:space\s*=\s*(["'])preserve\1/.test(input)
            )
                return input;
            return new XMLBuilder({
                preserveOrder: true,
                cdataPropName: '#cdata',
                commentPropName: '#comment',
                ignoreAttributes: false,
                format: true,
                indentBy: '  ',
                processEntities: false,
                maxNestedTags: 64,
            }).build(parsed);
        }
        case 'developer-regex-tester': {
            if (new TextEncoder().encode(input).length > 32768)
                throw new Error('Use at most 32 KiB of test text.');
            const pattern = options.pattern ?? '[0-9]+',
                flags = options.flags ?? '';
            if (
                !pattern ||
                pattern.length > 512 ||
                !/^[ims]*$/.test(flags) ||
                new Set(flags).size !== flags.length
            )
                throw new Error('Use a pattern up to 512 characters and unique i, m, s flags.');
            const { RE2JS } = await import('re2js');
            const re = RE2JS.compile(
                pattern,
                (flags.includes('i') ? RE2JS.CASE_INSENSITIVE : 0) |
                    (flags.includes('m') ? RE2JS.MULTILINE : 0) |
                    (flags.includes('s') ? RE2JS.DOTALL : 0),
            );
            if (re.groupCount() > 32) throw new Error('Use at most 32 capture groups.');
            const matcher = re.matcher(input),
                matches = [];
            while (matches.length < 100 && matcher.find())
                matches.push({
                    text: matcher.group(),
                    start: matcher.start(),
                    end: matcher.end(),
                    groups: Array.from({ length: re.groupCount() }, (_, i) => matcher.group(i + 1)),
                });
            return json({
                engine: 'RE2',
                matches,
                truncated: matches.length === 100 && matcher.find(),
            });
        }
        case 'developer-ulid-generator': {
            const count = integer(options.count, 1, 1, 100),
                alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
                random = crypto.getRandomValues(new Uint8Array(10));
            let value = random.reduce(
                (acc, byte) => (acc << 8n) | BigInt(byte),
                BigInt(Date.now()),
            );
            const ids = [];
            for (let i = 0; i < count; i++) {
                let current = value + BigInt(i),
                    encoded = '';
                for (let j = 0; j < 26; j++) {
                    encoded = alphabet[Number(current & 31n)] + encoded;
                    current >>= 5n;
                }
                ids.push(encoded);
            }
            return ids.join('\n');
        }
        case 'developer-cron-expression-helper': {
            if (input.length > 256) throw new Error('Use a cron expression up to 256 characters.');
            const timezone = options.timezone ?? 'UTC';
            new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
            const start = options.start?.trim();
            if (start && !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(start))
                throw new Error('Start date must be ISO 8601 with an explicit timezone.');
            const { CronExpressionParser } =
                await import('cron-parser/dist/CronExpressionParser.js');
            const schedule = CronExpressionParser.parse(input.trim(), {
                tz: timezone,
                ...(start ? { currentDate: start } : {}),
            });
            const occurrences = schedule.take(integer(options.count, 5, 1, 20)).map((date) => ({
                iso: date.toISOString(),
                local: new Intl.DateTimeFormat('en-GB', {
                    timeZone: timezone,
                    dateStyle: 'full',
                    timeStyle: 'long',
                }).format(date.toDate()),
            }));
            return json({ expression: input.trim(), timezone, occurrences, scheduled: false });
        }
        case 'developer-http-request-builder':
            return json(request(input, options));
        case 'developer-curl-builder-parser':
            return options.mode === 'build' ? request(input, options).curl : json(parseCurl(input));
        case 'developer-code-diff-checker':
        case 'everyday-text-comparison': {
            const after = options.comparison ?? '';
            if (
                new TextEncoder().encode(input).length > 32768 ||
                new TextEncoder().encode(after).length > 32768
            )
                throw new Error('Compare at most 32 KiB per side.');
            const { diffLines } = await import('diff');
            const result = diffLines(input, after, { timeout: 200, maxEditLength: 2000 });
            if (!result) throw new Error('The difference is too large. Compare smaller sections.');
            return json({
                identical: input === after,
                changes: result.map((part) => ({
                    type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
                    lines: part.count,
                    text: part.value,
                })),
            });
        }
        case 'developer-environment-variable-formatter': {
            let values: Record<string, string>;
            if (options.mode === 'env') {
                const value: unknown = JSON.parse(input);
                if (!value || typeof value !== 'object' || Array.isArray(value))
                    throw new Error('Provide a JSON object of string values.');
                values = value as Record<string, string>;
            } else {
                if (/(?:^|\n)\s*(?:export\s+)?(?:__proto__|constructor|prototype)\s*=/.test(input))
                    throw new Error('Unsupported environment variable name.');
                values = parse(input);
            }
            if (
                Object.keys(values).length > 256 ||
                Object.entries(values).some(
                    ([key, value]) =>
                        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
                        ['__proto__', 'prototype', 'constructor'].includes(key) ||
                        typeof value !== 'string',
                )
            )
                throw new Error('Use up to 256 valid variable names with string values.');
            if (options.mode === 'json') return json(values);
            return Object.entries(values)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([key, value]) => {
                    const candidates = [
                        `'${value}'`,
                        `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\r', '\\r')}"`,
                        '`' + value + '`',
                        value,
                    ];
                    const encoded = candidates.find((candidate) => {
                        try {
                            return parse(`${key}=${candidate}`)[key] === value;
                        } catch {
                            return false;
                        }
                    });
                    if (encoded === undefined)
                        throw new Error(
                            `Cannot represent ${key} losslessly in .env. Use JSON output.`,
                        );
                    return `${key}=${encoded}`;
                })
                .join('\n');
        }
        case 'developer-api-response-formatter': {
            if (!/^HTTP\/\d(?:\.\d)?\s/.test(input)) return formatJson(input);
            const lines = input.replace(/\r\n/g, '\n').split('\n'),
                status = lines.shift()!,
                end = lines.indexOf('');
            if (end < 0) throw new Error('Separate headers and body with a blank line.');
            const body = lines.slice(end + 1).join('\n');
            let formatted = body;
            try {
                formatted = formatJson(body);
            } catch {}
            const match = /^HTTP\/(\d(?:\.\d)?) (\d{3})(?: (.*))?$/.exec(status);
            if (!match) throw new Error('Invalid HTTP status line.');
            return json({
                version: match[1],
                status: Number(match[2]),
                statusText: match[3] ?? '',
                headers: headers(lines.slice(0, end).join('\n')),
                body: formatted,
            });
        }
        case 'everyday-text-formatter': {
            const lines = input.replace(/\r\n?/g, '\n').split('\n');
            return options.mode === 'sort'
                ? lines.sort().join('\n')
                : options.mode === 'unique'
                  ? [...new Set(lines)].join('\n')
                  : lines.map((line) => line.replace(/[\t ]+$/g, '')).join('\n');
        }
        case 'everyday-markdown-preview': {
            const { marked } = await import('marked');
            return marked.parse(input, { async: false, gfm: true });
        }
        case 'everyday-qr-code-generator': {
            if (!input || new TextEncoder().encode(input).length > 1000)
                throw new Error('Enter one to 1,000 UTF-8 bytes.');
            const level = options.level ?? 'M';
            if (!['L', 'M', 'Q', 'H'].includes(level))
                throw new Error('Choose a QR error correction level.');
            const { default: qrcode } = await import('qrcode-generator');
            qrcode.stringToBytes = (text: string) => Array.from(new TextEncoder().encode(text));
            const qr = qrcode(0, level as 'M');
            qr.addData(input, 'Byte');
            qr.make();
            return artifact(
                'qr-code.svg',
                'image/svg+xml',
                qr.createSvgTag({ cellSize: 6, margin: 24, scalable: true }),
            );
        }
        case 'everyday-unit-converter': {
            if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(input.trim()))
                throw new Error('Enter a numeric value.');
            const value = Number(input),
                from = options.from ?? 'km',
                to = options.to ?? 'mi',
                source = units[from],
                target = units[to];
            if (!Number.isFinite(value) || !source || !target || source[0] !== target[0])
                throw new Error('Choose compatible units and a finite value.');
            let converted: number;
            if (source[0] === 'temperature') {
                const kelvin =
                    from === 'C'
                        ? value + 273.15
                        : from === 'F'
                          ? ((value - 32) * 5) / 9 + 273.15
                          : value;
                if (kelvin < 0) throw new Error('Temperature is below absolute zero.');
                converted =
                    to === 'C'
                        ? kelvin - 273.15
                        : to === 'F'
                          ? ((kelvin - 273.15) * 9) / 5 + 32
                          : kelvin;
            } else converted = (value * source[1]) / target[1];
            if (!Number.isFinite(converted)) throw new Error('The result exceeds numeric limits.');
            return json({
                value,
                from,
                to,
                result: Number(converted.toPrecision(14)),
                dimension: source[0],
            });
        }
        case 'test-media-dummy-csv': {
            const { default: Papa } = await import('papaparse');
            return Papa.unparse(
                records({ ...options, columns: options.columns ?? 'id,name,email' }),
                { escapeFormulae: true, newline: '\n' },
            );
        }
        case 'test-media-json-fixtures':
            return json(records(options));
        case 'test-media-xml-fixtures':
            return `<?xml version="1.0" encoding="UTF-8"?>\n<records>\n${Array.from({ length: integer(options.count, 10, 1, 1000) }, (_, i) => `  <record id="${i + 1}"><name>Example ${i + 1}</name></record>`).join('\n')}\n</records>`;
        case 'test-media-binary-payload-generator': {
            const bytes = new Uint8Array(integer(options.size, 1024, 1, 262144)),
                mode = options.mode ?? 'sequence';
            if (!['zero', 'sequence', 'random'].includes(mode))
                throw new Error('Choose a supported byte pattern.');
            if (mode === 'random')
                for (let i = 0; i < bytes.length; i += 65536)
                    crypto.getRandomValues(bytes.subarray(i, i + 65536));
            else if (mode === 'sequence') bytes.forEach((_, index) => (bytes[index] = index % 256));
            return artifact('payload.bin', 'application/octet-stream', bytes);
        }
        case 'test-media-placeholder-images':
        case 'test-media-sample-avatars':
            return (await import('./image-design.js')).browserImage(id, input, options);
        case 'test-media-sample-pdf':
            return artifact(
                'sample.pdf',
                'application/pdf',
                samplePdf(input, integer(options.count, 1, 1, 10)),
            );
        case 'test-media-zip-generator':
            return artifact(
                'sample.zip',
                'application/zip',
                zipTextFiles(
                    input.trim()
                        ? JSON.parse(input)
                        : [{ name: 'hello.txt', text: 'Hello from socket.help\n' }],
                ),
            );
        case 'test-media-corrupt-file-fixtures': {
            const format = options.format ?? 'pdf',
                bytes =
                    format === 'pdf'
                        ? new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type')
                        : format === 'png'
                          ? new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
                          : format === 'zip'
                            ? new Uint8Array([80, 75, 3, 4])
                            : undefined;
            if (!bytes) throw new Error('Choose PDF, PNG, or ZIP.');
            return artifact(`corrupt.${format}`, 'application/octet-stream', bytes);
        }
        case 'test-media-tone-generator':
            return artifact(
                'tone.wav',
                'audio/wav',
                toneWav(Number(options.frequency ?? 440), Number(options.duration ?? 1)),
            );
    }
    throw new Error('Unsupported utility.');
}
