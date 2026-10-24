import type { OperationOptions } from './definitions.js';
import { artifact, xmlEscape, zipTextFiles } from './artifacts.js';
interface TextToken {
    type: string;
    text?: string;
    raw?: string;
    tokens?: TextToken[];
    items?: { tokens: TextToken[] }[];
    href?: string;
    ordered?: boolean;
    start?: number | string;
}
function markdownText(tokens: TextToken[], depth = 0): string {
    if (depth > 64) throw new Error('Document nesting exceeds 64 levels.');
    return tokens
        .map((token) => {
            if (token.type === 'space') return '';
            if (token.type === 'br') return '\n';
            if (token.type === 'list')
                return (
                    (token.items ?? [])
                        .map(
                            (item, index) =>
                                `${token.ordered ? `${Number(token.start ?? 1) + index}.` : '•'} ${markdownText(item.tokens, depth + 1).trim()}`,
                        )
                        .join('\n') + '\n\n'
                );
            const text = token.tokens
                ? markdownText(token.tokens, depth + 1)
                : (token.text ?? token.raw ?? '');
            if (token.type === 'link' || token.type === 'image')
                return `${text}${token.href ? ` (${token.href})` : ''}`;
            return (
                text +
                (['heading', 'paragraph', 'blockquote', 'code'].includes(token.type) ? '\n\n' : '')
            );
        })
        .join('');
}
export async function runData(
    id: string,
    input: string,
    options: OperationOptions,
): Promise<string> {
    if (id === 'agents-mcp-tool-call-inspector') {
        const messages: unknown = JSON.parse(input);
        if (!Array.isArray(messages) || !messages.length || messages.length > 200)
            throw new Error('Provide an array of one to 200 JSON-RPC messages.');
        const calls: {
            id: unknown;
            method: string;
            tool?: string;
            arguments?: unknown;
            status: string;
            result?: unknown;
            error?: unknown;
        }[] = [];
        const pending = new Map<string, number>();
        const responses = new Set<string>();
        const warnings: string[] = [];
        for (const [index, message] of messages.entries()) {
            if (
                !message ||
                typeof message !== 'object' ||
                Array.isArray(message) ||
                message.jsonrpc !== '2.0' ||
                (message.id !== undefined &&
                    typeof message.id !== 'string' &&
                    !(typeof message.id === 'number' && Number.isSafeInteger(message.id)) &&
                    message.id !== null)
            )
                throw new Error(`Message ${index + 1} is not a supported JSON-RPC 2.0 message.`);
            const key = JSON.stringify(message.id);
            if (typeof message.method === 'string') {
                if (pending.has(key) && message.id !== undefined)
                    warnings.push(`Request ID ${key} was reused before its response.`);
                calls.push({
                    id: message.id ?? null,
                    method: message.method,
                    tool:
                        message.method === 'tools/call' && typeof message.params?.name === 'string'
                            ? message.params.name
                            : undefined,
                    arguments: message.params?.arguments,
                    status: message.id === undefined ? 'Notification' : 'Waiting for response',
                });
                if (message.id !== undefined) {
                    pending.set(key, calls.length - 1);
                    responses.delete(key);
                }
            } else {
                if (Object.hasOwn(message, 'result') === Object.hasOwn(message, 'error'))
                    throw new Error(`Response ${index + 1} must have either result or error.`);
                const target = pending.get(key);
                if (target === undefined) {
                    warnings.push(`Response ${index + 1} has no matching request ID ${key}.`);
                    continue;
                }
                if (responses.has(key)) {
                    warnings.push(`Request ID ${key} has more than one response.`);
                    continue;
                }
                responses.add(key);
                Object.assign(calls[target]!, {
                    status: message.error
                        ? 'Protocol error'
                        : message.result?.isError
                          ? 'Tool error'
                          : 'Completed',
                    result: message.result,
                    error: message.error,
                });
            }
        }
        return JSON.stringify(
            {
                messages: messages.length,
                requests: calls.filter((c) => c.status !== 'Notification').length,
                errors: calls.filter((c) => c.status.includes('error')).length,
                calls,
                warnings,
            },
            null,
            2,
        );
    }
    if (id === 'everyday-document-converter') {
        if (!input.trim() || new TextEncoder().encode(input).length > 65536)
            throw new Error('Enter document text up to 64 KiB.');
        const format = options.format ?? 'html',
            from = options.from ?? 'markdown';
        if (!['markdown', 'text'].includes(from) || !['html', 'txt', 'docx'].includes(format))
            throw new Error('Choose supported document formats.');
        const plain =
            from === 'markdown'
                ? markdownText((await import('marked')).Lexer.lex(input) as TextToken[]).trim()
                : input;
        if (format === 'txt') return artifact('document.txt', 'text/plain;charset=utf-8', plain);
        if (format === 'html') {
            const html =
                from === 'markdown'
                    ? await (await import('marked')).marked.parse(input, { async: false })
                    : `<pre>${xmlEscape(input)}</pre>`;
            return artifact(
                'document.html',
                'text/html;charset=utf-8',
                `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Document</title></head><body>${html}</body></html>`,
            );
        }
        const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${plain
            .replace(/\r\n?/g, '\n')
            .split('\n')
            .map(
                (line) =>
                    `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`,
            )
            .join(
                '',
            )}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
        const result = artifact(
            'document.docx',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            zipTextFiles([
                {
                    name: '[Content_Types].xml',
                    text: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
                },
                {
                    name: '_rels/.rels',
                    text: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
                },
                { name: 'word/document.xml', text: document },
            ]),
        );
        return JSON.stringify({ ...JSON.parse(result), previewText: plain });
    }
    const count = Number(options.count ?? 10),
        format = options.format ?? 'json',
        mode = id === 'databases-seed-data-generator' ? 'contacts' : (options.mode ?? 'contacts');
    if (!Number.isInteger(count) || count < 1 || count > 1000)
        throw new Error('Choose between 1 and 1,000 records.');
    if (
        !['json', 'csv', ...(id === 'databases-seed-data-generator' ? ['sql'] : [])].includes(
            format,
        ) ||
        !['contacts', 'products', 'events'].includes(mode)
    )
        throw new Error('Choose a supported dataset and format.');
    const table = input.trim() || 'contacts';
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(table))
        throw new Error(
            'Use a table name with letters, digits or underscores, starting with a letter or underscore.',
        );
    const rows = Array.from({ length: count }, (_, i) =>
        mode === 'products'
            ? {
                  id: i + 1,
                  name: `Test product ${i + 1}`,
                  sku: `TEST-${String(i + 1).padStart(4, '0')}`,
                  price: (((i * 791) % 20000) + 100) / 100,
                  in_stock: i % 4 !== 0,
              }
            : mode === 'events'
              ? {
                    id: i + 1,
                    type: ['created', 'updated', 'completed'][i % 3],
                    timestamp: new Date(Date.UTC(2025, 0, 1, 0, i)).toISOString(),
                    reference: `test-${i + 1}`,
                }
              : {
                    id: i + 1,
                    name: `Test contact ${i + 1}`,
                    email: `contact${i + 1}@example.test`,
                    active: i % 3 !== 0,
                },
    );
    if (format === 'json') return JSON.stringify(rows, null, 2);
    const columns = Object.keys(rows[0]!);
    if (format === 'csv') return (await import('papaparse')).default.unparse(rows);
    const quote = (v: unknown) =>
        typeof v === 'boolean'
            ? v
                ? 'TRUE'
                : 'FALSE'
            : typeof v === 'number'
              ? String(v)
              : `'${String(v).replaceAll("'", "''")}'`;
    return `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES\n${rows.map((row) => `(${columns.map((c) => quote((row as Record<string, unknown>)[c])).join(', ')})`).join(',\n')};`;
}
