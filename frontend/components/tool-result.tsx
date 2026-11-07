'use client';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { parseJsonSafely, formatJson } from '@kivel.io/tools/engine';
import { csvPreview } from '@kivel.io/tools/csv-preview';
import { parseSse } from '@kivel.io/tools/sse';
import { MarkdownPreview } from './generated-preview';
import { ResultPreview } from './result-preview';
import { CodeExample } from './code-example';
import { CopyButton } from './copy-button';
import { Icon } from './icons';
const object = (value: unknown): value is Record<string, any> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
const title = (key: string) =>
    (
        ({
            ttl: 'TTL',
            iban: 'IBAN',
            bban: 'BBAN',
            e164: 'E.164',
            utc: 'UTC',
            uri: 'Telephone URI',
            sha256: 'SHA-256',
            mimeType: 'MIME type',
            httpStatus: 'HTTP status',
        }) as Record<string, string>
    )[key] ??
    key
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replaceAll('_', ' ')
        .replace(/^./, (c) => c.toUpperCase());
const display = (value: unknown): string =>
    value === null || value === undefined
        ? '—'
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
const array = (value: unknown): any[] => (Array.isArray(value) ? value : []);
function Panel({
    title: label,
    detail,
    children,
}: {
    title: string;
    detail?: string;
    children: ReactNode;
}) {
    return (
        <section className="tool-result-panel">
            <header>
                <div>
                    <span className="result-eyebrow">Result preview</span>
                    <h2>{label}</h2>
                </div>
                {detail && <span className="result-count">{detail}</span>}
            </header>
            {children}
        </section>
    );
}
function Facts({ value }: { value: Record<string, unknown> }) {
    return (
        <dl className="result-facts">
            {Object.entries(value)
                .slice(0, 24)
                .map(([key, item]) => (
                    <div key={key}>
                        <dt>{title(key)}</dt>
                        <dd>
                            {typeof item === 'boolean' ? (
                                <span className="result-chip">{String(item)}</span>
                            ) : (
                                display(item)
                            )}
                        </dd>
                    </div>
                ))}
        </dl>
    );
}
function Status({ passed, children }: { passed: boolean; children: ReactNode }) {
    return (
        <span className={`result-chip ${passed ? 'is-good' : 'is-attention'}`}>
            <Icon name={passed ? 'check' : 'info'} size={13} />
            {children}
        </span>
    );
}
function Table({ rows, columns }: { rows: Record<string, unknown>[]; columns?: string[] }) {
    const keys =
        columns ?? [...new Set(rows.slice(0, 10).flatMap((row) => Object.keys(row)))].slice(0, 8);
    if (!rows.length) return <p className="result-empty">No records returned.</p>;
    return (
        <>
            <div
                className="result-table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Result records"
            >
                <table className="result-table">
                    <thead>
                        <tr>
                            {keys.map((key) => (
                                <th key={key}>{title(key)}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.slice(0, 50).map((row, index) => (
                            <tr key={index}>
                                {keys.map((key) => (
                                    <td key={key}>
                                        {typeof row[key] === 'boolean' ? (
                                            <span className="result-chip">{String(row[key])}</span>
                                        ) : (
                                            display(row[key])
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {rows.length > 50 && (
                <p className="tool-notice">
                    Showing 50 of {rows.length} rows. Raw output contains all records.
                </p>
            )}
        </>
    );
}
function Tree({ value, depth = 0 }: { value: unknown; depth?: number }): ReactNode {
    if (Array.isArray(value)) {
        if (value.every(object)) return <Table rows={value} />;
        return (
            <ol className="result-value-list">
                {value.slice(0, 30).map((item, index) => (
                    <li key={index}>
                        {object(item) || Array.isArray(item) ? (
                            depth < 3 ? (
                                <Tree value={item} depth={depth + 1} />
                            ) : (
                                display(item)
                            )
                        ) : (
                            display(item)
                        )}
                    </li>
                ))}
            </ol>
        );
    }
    if (!object(value)) return <p className="result-value">{display(value)}</p>;
    const simple = Object.fromEntries(
            Object.entries(value).filter(([, item]) => !object(item) && !Array.isArray(item)),
        ),
        nested = Object.entries(value).filter(([, item]) => object(item) || Array.isArray(item));
    return (
        <>
            {Object.keys(simple).length > 0 && <Facts value={simple} />}{' '}
            {nested.slice(0, 12).map(([key, item]) => (
                <section className="result-group" key={key}>
                    <h3>
                        {title(key)}
                        {Array.isArray(item) && <span className="result-count">{item.length}</span>}
                    </h3>
                    {depth < 3 ? (
                        <Tree value={item} depth={depth + 1} />
                    ) : (
                        <p className="tool-notice">Nested data is available in raw output.</p>
                    )}
                </section>
            ))}
        </>
    );
}
const dnsTypes: Record<number, string> = {
    1: 'A',
    2: 'NS',
    5: 'CNAME',
    6: 'SOA',
    15: 'MX',
    16: 'TXT',
    28: 'AAAA',
    257: 'CAA',
};
function DnsRecords({ value, label }: { value: any; label?: string }) {
    return (
        <div className="result-group dns-record-group">
            <div className="result-group-heading">
                <h3>{label ?? (value.type ? `${value.type} records` : 'DNS records')}</h3>
                {value.status !== undefined && (
                    <Status passed={value.status === 0}>
                        {(
                            {
                                0: 'Lookup completed',
                                2: 'Resolver error',
                                3: 'DNS name not found',
                                5: 'Query refused',
                            } as Record<number, string>
                        )[value.status] ?? `DNS response code ${value.status}`}
                    </Status>
                )}
            </div>
            {value.error ? (
                <p className="tool-notice">{value.error}</p>
            ) : (
                <Table
                    columns={['type', 'value', 'ttl', 'name']}
                    rows={array(value.answers).map((item) => ({
                        type: dnsTypes[item.type] ?? item.type,
                        name: item.name,
                        value: item.data,
                        ttl: typeof item.ttl === 'number' ? `${item.ttl} s` : 'Not supplied',
                    }))}
                />
            )}
        </div>
    );
}
function Redirects({ hops }: { hops: any[] }) {
    return (
        <ol className="result-timeline">
            {hops.map((hop, index) => (
                <li key={index}>
                    <span className="timeline-index">{index + 1}</span>
                    <div>
                        <span className={`result-chip ${hop.status >= 400 ? 'is-attention' : ''}`}>
                            HTTP {hop.status}
                        </span>
                        <p>{hop.url}</p>
                        {hop.location && <small>Location: {hop.location}</small>}
                    </div>
                </li>
            ))}
        </ol>
    );
}
export function StreamEventsPreview({ text }: { text: string }) {
    const result = parseSse(text);
    return (
        <Panel title="Event stream" detail={`${result.events.length} events`}>
            <Events events={result.events} />
        </Panel>
    );
}
function Events({ events }: { events: any[] }) {
    return events.length ? (
        <ol className="result-events">
            {events.slice(0, 50).map((event, index) => {
                let data = event.data;
                try {
                    data = formatJson(event.data);
                } catch {}
                return (
                    <li key={index}>
                        <div>
                            <span className="result-chip">{event.event || 'message'}</span>
                            <small>{event.id ? `ID ${event.id}` : `Event ${index + 1}`}</small>
                            <CopyButton
                                text={event.data}
                                label={`Copy event ${index + 1}`}
                                compact
                            />
                        </div>
                        <pre>{data}</pre>
                    </li>
                );
            })}
        </ol>
    ) : (
        <p className="result-empty">No complete events captured yet.</p>
    );
}
export function renderToolResult(toolId: string, text: string, input?: string): ReactNode | null {
    if (toolId === 'network-websocket-tester') {
        const result = JSON.parse(text);
        return (
            <Panel
                title={result.connected ? 'WebSocket connected' : 'Connection failed'}
                detail={`${result.messages.length} messages`}
            >
                <Facts
                    value={{
                        ...(result.status ? { upgrade: `HTTP ${result.status}` } : {}),
                        ...(result.handshakeMs !== undefined
                            ? { handshake: `${result.handshakeMs} ms` }
                            : {}),
                        ...(result.protocol ? { subprotocol: result.protocol } : {}),
                        ...(result.close
                            ? {
                                  closeCode: result.close.code,
                                  closeReason: result.close.reason || 'None',
                              }
                            : {}),
                    }}
                />
                {result.error && <p className="tool-notice">{result.error}</p>}
                {result.stop && <p className="field-help">{result.stop}.</p>}
                {result.messages.length ? (
                    <ol className="result-events">
                        {result.messages.map(
                            (
                                frame: {
                                    atMs: number;
                                    bytes: number;
                                    encoding: string;
                                    data: string;
                                },
                                index: number,
                            ) => (
                                <li key={index}>
                                    <div>
                                        <span className="result-chip">
                                            {frame.encoding === 'base64'
                                                ? 'Binary · base64'
                                                : 'Text'}
                                        </span>
                                        <small>
                                            +{frame.atMs} ms · {frame.bytes} bytes
                                        </small>
                                        <CopyButton
                                            compact
                                            text={frame.data}
                                            label={`Copy message ${index + 1}`}
                                        />
                                    </div>
                                    <pre>{frame.data || '(empty message)'}</pre>
                                </li>
                            ),
                        )}
                    </ol>
                ) : (
                    <p className="result-empty">No messages captured.</p>
                )}
            </Panel>
        );
    }
    if (
        [
            'developer-fake-identity-generator',
            'developer-test-bank-account-generator',
            'developer-json-schema-validator',
            'developer-json-schema-from-sample',
            'developer-openapi-validator',
            'developer-secret-scanner',
            'developer-phone-number-validator',
            'developer-timezone-converter',
            'developer-date-calculator',
            'network-web-page-to-markdown',
            'email-email-authentication-checker',
            'network-robots-and-sitemap-checker',
        ].includes(toolId)
    ) {
        const result = JSON.parse(text);
        if (toolId === 'developer-fake-identity-generator')
            return (
                <Panel title="Test identities" detail={`${result.count} records`}>
                    <p className="tool-notice">{result.notice}</p>
                    {result.identities.map((row: any) => (
                        <section className="result-group" key={row.email}>
                            <div className="result-group-heading">
                                <h3>{row.name}</h3>
                                <CopyButton
                                    text={JSON.stringify(row, null, 2)}
                                    label={`Copy ${row.name}`}
                                    compact
                                />
                            </div>
                            <Facts
                                value={{
                                    email: row.email,
                                    phone: row.phone,
                                    company: row.company,
                                    address: `${row.address.line1}, ${row.address.city} ${row.address.postalCode}`,
                                    country: row.address.country,
                                }}
                            />
                        </section>
                    ))}
                </Panel>
            );
        if (toolId === 'developer-test-bank-account-generator')
            return (
                <Panel title="Test bank accounts" detail={result.country}>
                    <p className="tool-notice">{result.notice}</p>
                    <Table
                        rows={result.accounts.map((row: any) =>
                            row.iban
                                ? { country: row.country, iban: row.formatted, bban: row.bban }
                                : row,
                        )}
                    />
                </Panel>
            );
        if (toolId === 'developer-json-schema-from-sample')
            return (
                <Panel title="Inferred JSON Schema">
                    <p className="tool-notice">{result.notice}</p>
                    <ResultPreview
                        text={JSON.stringify(result.schema, null, 2)}
                        title="Draft 2020-12 schema"
                        filename="schema.json"
                    />
                </Panel>
            );
        if (
            toolId === 'developer-json-schema-validator' ||
            toolId === 'developer-openapi-validator'
        )
            return (
                <Panel
                    title={
                        toolId === 'developer-openapi-validator'
                            ? 'OpenAPI validation'
                            : 'JSON validation'
                    }
                >
                    <Status passed={result.valid}>
                        {result.valid ? 'Valid document' : 'Validation failed'}
                    </Status>
                    {result.version && (
                        <Facts
                            value={{
                                version: result.version,
                                title: result.title,
                                operations: result.operations,
                            }}
                        />
                    )}
                    <section className="result-group">
                        <h3>Errors</h3>
                        {result.errors.length ? (
                            <Table
                                rows={result.errors}
                                columns={
                                    toolId === 'developer-openapi-validator'
                                        ? ['line', 'path', 'message']
                                        : ['path', 'keyword', 'message', 'details']
                                }
                            />
                        ) : (
                            <p className="result-empty">No validation errors.</p>
                        )}
                    </section>
                    {result.warnings?.length > 0 && (
                        <section className="result-group">
                            <h3>Review</h3>
                            <Table rows={result.warnings} columns={['line', 'path', 'message']} />
                        </section>
                    )}
                </Panel>
            );
        if (toolId === 'developer-secret-scanner')
            return (
                <Panel
                    title="Credential scan"
                    detail={`${result.count} finding${result.count === 1 ? '' : 's'}`}
                >
                    <p className="tool-notice">{result.notice}</p>
                    {result.count ? (
                        <Table
                            rows={result.findings}
                            columns={['provider', 'masked', 'line', 'column', 'severity']}
                        />
                    ) : (
                        <p className="result-empty">No matching credential patterns found.</p>
                    )}
                </Panel>
            );
        if (toolId === 'network-web-page-to-markdown')
            return (
                <Panel title={result.title || 'Extracted page'}>
                    <p className="tool-notice">{result.description || result.notice}</p>
                    <Facts
                        value={{
                            url: result.url,
                            canonical: result.canonical,
                            links: result.links.length,
                            headings: result.headings.length,
                        }}
                    />
                    <MarkdownPreview html={result.html} title="Extracted page preview" />
                    <details className="result-group">
                        <summary>Markdown and plain text</summary>
                        <ResultPreview text={result.markdown} title="Markdown" filename="page.md" />
                        <ResultPreview text={result.text} title="Plain text" filename="page.txt" />
                    </details>
                    <details className="result-group">
                        <summary>Page links</summary>
                        <Table rows={result.links} columns={['text', 'url']} />
                    </details>
                </Panel>
            );
        if (toolId === 'email-email-authentication-checker')
            return (
                <Panel title="Email authentication" detail={result.domain}>
                    <p className="tool-notice">{result.notice}</p>
                    <Table rows={result.findings} columns={['check', 'status', 'message']} />
                    <section className="result-group">
                        <h3>Published records</h3>
                        <Table
                            rows={result.records.map((row: any) => ({
                                type: row.type,
                                name: row.name,
                                values: row.values.join('\n') || 'No records',
                                resolverStatus: row.status,
                            }))}
                        />
                    </section>
                </Panel>
            );
        if (toolId === 'network-robots-and-sitemap-checker')
            return (
                <Panel title="Crawl rules">
                    <Status passed={result.allowed === true}>
                        {result.allowed === null
                            ? 'Crawl decision unavailable'
                            : result.allowed
                              ? 'Page allowed'
                              : 'Page blocked'}
                    </Status>
                    <Facts
                        value={{
                            url: result.url,
                            userAgent: result.userAgent,
                            robotsStatus: result.robotsStatus,
                            matchingLine: result.matchingLine,
                            matchingRule: result.matchingRule,
                            crawlDelay: result.crawlDelay,
                        }}
                    />
                    <p className="tool-notice">{result.notice}</p>
                    {result.sitemaps.map((sitemap: any) => (
                        <section className="result-group" key={sitemap.url}>
                            <h3>Sitemap</h3>
                            <Facts
                                value={{
                                    url: sitemap.url,
                                    status: sitemap.status,
                                    kind: sitemap.kind,
                                    entries: sitemap.totalEntries,
                                    truncated: sitemap.truncated,
                                }}
                            />
                            {sitemap.problems.map((problem: string) => (
                                <p className="tool-notice" key={problem}>
                                    {problem}
                                </p>
                            ))}
                            <Table rows={sitemap.entries} columns={['url', 'lastModified']} />
                        </section>
                    ))}
                </Panel>
            );
        const label =
            toolId === 'developer-phone-number-validator'
                ? 'Phone number'
                : toolId === 'developer-timezone-converter'
                  ? 'Converted time'
                  : 'Calendar result';
        return (
            <Panel title={label}>
                {typeof result.valid === 'boolean' && (
                    <Status passed={result.valid}>
                        {result.valid ? 'Valid format' : 'Invalid format'}
                    </Status>
                )}
                <Facts
                    value={Object.fromEntries(
                        Object.entries(result).filter(
                            ([key]) => !['notice', 'valid'].includes(key),
                        ),
                    )}
                />
                {result.e164 && <CopyButton text={result.e164} label="Copy E.164" />}
                {result.destination && (
                    <CopyButton text={result.destination} label="Copy converted time" />
                )}
                {result.result && <CopyButton text={result.result} label="Copy result date" />}
                {result.notice && <p className="tool-notice">{result.notice}</p>}
            </Panel>
        );
    }

    if (toolId === 'databases-seed-data-generator' && text.startsWith('INSERT'))
        return (
            <Panel title="SQL seed script">
                <CodeExample title="SQL INSERT statements" code={text} />
                <p className="tool-notice">
                    Synthetic test records. Review the script for your database before running it.
                </p>
            </Panel>
        );
    if (toolId === 'network-request-replay') {
        let response: any;
        try {
            response = JSON.parse(text);
        } catch {
            return null;
        }
        return (
            <Panel title={`HTTP ${response.status}`} detail={response.method}>
                <p className="tool-notice">{response.perspective}</p>
                <section className="result-group">
                    <h3>Response headers</h3>
                    <Table
                        rows={Object.entries(response.headers ?? {}).map(([header, value]) => ({
                            header,
                            value,
                        }))}
                    />
                </section>
                <section className="result-group">
                    <h3>Response body</h3>
                    <ResultPreview
                        text={response.body ?? ''}
                        title="Response"
                        filename="response.txt"
                    />
                </section>
                {response.truncated && (
                    <p className="tool-notice">Preview is limited to the first 256 KiB.</p>
                )}
                <Facts
                    value={{
                        dnsLookupMs: response.timings?.dnsMs,
                        responseHeadersMs: response.timings?.responseMs,
                        totalRequestMs: response.timings?.totalMs,
                    }}
                />
            </Panel>
        );
    }
    if (toolId === 'developer-api-response-formatter') {
        const split = text.indexOf('\n\n'),
            head = split < 0 ? text : text.slice(0, split),
            body = split < 0 ? '' : text.slice(split + 2),
            lines = head.split('\n');
        const headers = lines.slice(1).map((line) => {
            const i = line.indexOf(':');
            return { header: line.slice(0, i), value: line.slice(i + 1).trim() };
        });
        return (
            <Panel title="HTTP response" detail={lines[0]}>
                <Table rows={headers} />
                {body && (
                    <section className="result-group">
                        <h3>Response body</h3>
                        <ResultPreview text={body} title="Body" filename="response-body.txt" />
                    </section>
                )}
            </Panel>
        );
    }
    if (toolId === 'developer-curl-builder-parser' && text.startsWith('curl '))
        return (
            <Panel title="cURL command">
                <CodeExample title="cURL command" code={text} />
                <p className="tool-notice">
                    Copy the command to your own client. This tool does not send the request.
                </p>
            </Panel>
        );
    if (
        ['test-media-dummy-csv', 'everyday-json-to-csv'].includes(toolId) ||
        (toolId.startsWith('databases-') &&
            !text.trim().startsWith('[') &&
            !text.startsWith('INSERT'))
    ) {
        const result = csvPreview(text);
        return (
            <Panel title="CSV records" detail={`${result.meta.fields?.length ?? 0} columns`}>
                <Table rows={result.data.slice(0, 50)} />
                {(result.meta.truncated || result.data.length > 50) && (
                    <p className="tool-notice">
                        Preview is limited to 50 rows. Download raw output for the complete CSV.
                    </p>
                )}
            </Panel>
        );
    }
    if (['developer-code-diff-checker', 'everyday-text-comparison'].includes(toolId)) {
        let diff: any;
        try {
            diff = JSON.parse(text);
        } catch {
            return null;
        }
        let left = 0,
            right = 0;
        const lines = array(diff.changes).flatMap((part) => {
            if (typeof part.text !== 'string') return [];
            const values: string[] = part.text.split('\n');
            if (values.at(-1) === '') values.pop();
            return values.map((line) => ({
                text: line,
                type: part.type,
                left: part.type === 'added' ? '' : ++left,
                right: part.type === 'removed' ? '' : ++right,
            }));
        });
        return (
            <Panel
                title={
                    diff.identical
                        ? 'No changes'
                        : toolId === 'developer-code-diff-checker'
                          ? 'Code changes'
                          : 'Text comparison'
                }
                detail={`${lines.filter((line) => line.type !== 'unchanged').length} changed lines`}
            >
                <div className="result-diff">
                    {lines.slice(0, 2000).map((line, index) => (
                        <div
                            key={index}
                            className={
                                line.type === 'added'
                                    ? 'diff-added'
                                    : line.type === 'removed'
                                      ? 'diff-removed'
                                      : ''
                            }
                        >
                            <span>{line.left}</span>
                            <span>{line.right}</span>
                            <code>
                                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}{' '}
                                {line.text || ' '}
                            </code>
                        </div>
                    ))}
                </div>
                {lines.length > 2000 && (
                    <p className="tool-notice">
                        Showing the first 2,000 lines. Raw output contains the complete comparison.
                    </p>
                )}
            </Panel>
        );
    }
    if (
        [
            'hash',
            'developer-hmac-generator',
            'everyday-file-checksums',
            'everyday-password-generator',
            'everyday-random-generator',
            'base64',
            'url',
        ].includes(toolId)
    )
        return (
            <TokenOutput
                text={text}
                label={
                    toolId === 'everyday-password-generator'
                        ? 'Generated password'
                        : toolId === 'everyday-random-generator'
                          ? 'Generated number'
                          : ['base64', 'url'].includes(toolId)
                            ? 'Converted value'
                            : 'Checksum / digest'
                }
                secret={toolId === 'everyday-password-generator'}
            />
        );
    if (
        [
            'everyday-case-converter',
            'everyday-text-cleaner',
            'everyday-text-formatter',
            'everyday-extract-pdf-text',
        ].includes(toolId)
    )
        return (
            <Panel title="Text result" detail={`${text.length.toLocaleString()} characters`}>
                <div className="result-text-metrics">
                    <span>
                        {text.trim() ? text.trim().split(/\s+/u).length.toLocaleString() : 0} words
                    </span>
                    <span>{text.split('\n').length.toLocaleString()} lines</span>
                    <CopyButton text={text} label="Copy text" compact />
                </div>
                <div className="result-reading-pane">{text.slice(0, 65536)}</div>
                {text.length > 65536 && (
                    <p className="tool-notice">
                        Preview shows the first 64 KiB of characters; raw output contains all text.
                    </p>
                )}
            </Panel>
        );
    if (toolId === 'developer-ulid-generator' || toolId === 'uuid')
        return (
            <Panel title="Generated IDs" detail={`${text.split('\n').length} IDs`}>
                <ul className="result-id-list">
                    {text.split('\n').map((id, index) => (
                        <li key={index}>
                            <code>{id}</code>
                            <CopyButton text={id} label={`Copy ID ${index + 1}`} compact />
                        </li>
                    ))}
                </ul>
            </Panel>
        );
    let value: any;
    try {
        value = parseJsonSafely(text);
    } catch {
        return null;
    }
    if (Array.isArray(value))
        return (
            <Panel title="Records" detail={`${value.length} records`}>
                {toolId.startsWith('databases-') ? (
                    <>
                        <Table rows={value.slice(0, 50)} />
                        <p className="tool-notice">
                            Preview shows up to 50 rows. Copy or download the full output below.
                        </p>
                    </>
                ) : (
                    <Tree value={value} />
                )}
            </Panel>
        );
    if (!object(value)) return null;
    if (['developer-http-request-builder', 'developer-curl-builder-parser'].includes(toolId))
        return (
            <Panel title="Request preview" detail={value.method}>
                <div className="result-expression">
                    <code>{value.url}</code>
                </div>
                {array(value.headers).length > 0 && (
                    <Table rows={value.headers} columns={['name', 'value']} />
                )}{' '}
                {value.body && (
                    <section className="result-group">
                        <h3>Request body</h3>
                        <ResultPreview text={value.body} title="Body" filename="request-body.txt" />
                    </section>
                )}
                {value.curl && <CodeExample title="cURL command" code={value.curl} />}
                <p className="tool-notice">
                    This is a request recipe; no network request has been sent.
                </p>
            </Panel>
        );
    if (toolId === 'everyday-unit-converter')
        return (
            <Panel title="Converted measurement" detail={value.dimension}>
                <div className="result-conversion">
                    <span>
                        {value.value} {value.from}
                    </span>
                    <Icon name="arrow" size={24} />
                    <strong>
                        {Number(value.result.toPrecision(10)) !== value.result ? '≈ ' : ''}
                        {new Intl.NumberFormat('en', { maximumSignificantDigits: 10 }).format(
                            value.result,
                        )}{' '}
                        <small>{value.to}</small>
                    </strong>
                </div>
                {Number(value.result.toPrecision(10)) !== value.result && (
                    <p className="tool-notice">
                        Preview rounded to 10 significant digits. Copy keeps the full result.
                    </p>
                )}
                <CopyButton text={String(value.result)} label="Copy converted value" compact />
            </Panel>
        );
    if (['everyday-timestamp-converter', 'developer-unix-timestamp-converter'].includes(toolId))
        return (
            <Panel title="Date & time">
                <div className="result-date">{value.utc}</div>
                <Facts
                    value={{
                        iso: value.iso,
                        unixSeconds: value.unixSeconds,
                        unixMilliseconds: value.unixMilliseconds,
                    }}
                />
            </Panel>
        );
    if (toolId === 'developer-jwt-inspector')
        return (
            <Panel title="Decoded token">
                <Status passed={false}>Unverified claims</Status>
                <section className="result-group">
                    <h3>Header</h3>
                    <Tree value={value.header} />
                </section>
                <section className="result-group">
                    <h3>Claims</h3>
                    <Tree value={value.claims} />
                </section>
            </Panel>
        );
    if (Array.isArray(value.routes))
        return (
            <Panel
                title={value.name ?? 'Mock configuration'}
                detail={`${value.routes.length} routes`}
            >
                <div className="result-routes">
                    {value.routes.slice(0, 20).map((route: any, index: number) => (
                        <article key={index}>
                            <div>
                                <span className="result-chip">{route.method}</span>
                                <code>{route.path}</code>
                                <span className="result-chip">HTTP {route.status}</span>
                            </div>
                            <small>{route.delayMs} ms delay</small>
                            <pre>{route.body}</pre>
                        </article>
                    ))}
                </div>
                <p className="tool-notice">
                    Configuration only. Import it into the mock API editor to create an endpoint.
                </p>
            </Panel>
        );

    if (toolId === 'network-dns-lookup')
        return (
            <Panel title={value.name} detail={value.type}>
                <DnsRecords value={value} />
                <p className="tool-notice">
                    Answers from a public DNS lookup source. This does not identify the domain’s DNS
                    hosting provider.
                </p>
            </Panel>
        );
    if (toolId === 'network-dns-propagation' || toolId === 'domains-domain-validation')
        return (
            <Panel title={value.domain}>
                {value.answersMatch !== undefined && (
                    <Status passed={value.answersMatch}>
                        {value.answersMatch ? 'Lookup responses match' : 'Lookup responses differ'}
                    </Status>
                )}
                {value.expectedTxtFound !== undefined && (
                    <Status passed={value.expectedTxtFound}>
                        {value.expectedTxtFound ? 'TXT value found' : 'TXT value not found'}
                    </Status>
                )}
                <p className="tool-notice">
                    {toolId === 'network-dns-propagation'
                        ? 'Compares two public lookup sources, not the domain’s DNS hosting providers.'
                        : 'Checks published DNS records only.'}
                </p>
                {array(value.resolvers ?? value.records).map((item, index) => (
                    <DnsRecords
                        value={item}
                        key={index}
                        label={
                            toolId === 'network-dns-propagation'
                                ? `Lookup source ${index + 1}`
                                : undefined
                        }
                    />
                ))}
            </Panel>
        );
    if (toolId === 'network-ssl-tls-inspector')
        return (
            <Panel title={value.hostname} detail={value.protocol}>
                <div className="result-status-row">
                    <Status passed={value.authorized && value.hostnameMatches}>
                        {value.authorized && value.hostnameMatches
                            ? 'TLS checks passed'
                            : 'Certificate needs attention'}
                    </Status>
                    <span className="result-chip">
                        {value.daysUntilExpiry < 0
                            ? 'Certificate expired'
                            : value.daysUntilExpiry === 0
                              ? 'Expires in under 1 day'
                              : `Expires in ${value.daysUntilExpiry} days`}
                    </span>
                </div>
                <Facts
                    value={{
                        address: value.address,
                        port: value.port,
                        protocol: value.protocol,
                        cipher: value.cipher?.name,
                        handshake: `${value.handshakeMs} ms`,
                        hostnameMatches: value.hostnameMatches,
                        authorizationError: value.authorizationError,
                    }}
                />
                <p className="tool-notice">Certificate trust and hostname checked from Kivel.</p>
                <section className="result-group">
                    <h3>Certificate chain</h3>
                    {array(value.chain).map((cert, index) => (
                        <details key={index} className="result-certificate" open={index === 0}>
                            <summary>{cert.subject?.CN ?? `Certificate ${index + 1}`}</summary>
                            <Tree value={cert} />
                        </details>
                    ))}
                </section>
            </Panel>
        );
    if (toolId === 'network-link-preview-inspector')
        return (
            <Panel title="Link preview">
                <article className="result-link-card">
                    <span>{new URL(value.url).hostname}</span>
                    <h3>{value.title || 'Untitled page'}</h3>
                    <p>{value.description || 'No description declared.'}</p>
                    <small>{value.canonical || value.url}</small>
                </article>
                <Facts
                    value={{
                        status: value.status,
                        url: value.url,
                        canonical: value.canonical,
                        truncated: value.truncated,
                    }}
                />
                <section className="result-group">
                    <h3>Declared metadata</h3>
                    <Facts value={value.metadata ?? {}} />
                </section>
            </Panel>
        );
    if (toolId === 'network-sse-tester')
        return (
            <Panel title="Captured events" detail={`${array(value.events).length} events`}>
                <Facts
                    value={{
                        url: value.url,
                        bytes: value.bytes,
                        retryMs: value.retryMs,
                        comments: value.comments,
                    }}
                />
                <Events events={array(value.events)} />
                <p className="tool-notice">{value.note}</p>
            </Panel>
        );
    if (toolId === 'network-whois-rdap-lookup') {
        const data = value.data ?? {};
        return (
            <Panel
                title={data.unicodeName ?? data.ldhName ?? value.domain}
                detail="Registration records"
            >
                <Facts
                    value={{
                        domain: data.ldhName,
                        httpStatus: value.status,
                        status: array(data.status).join(', '),
                        DNSSEC: data.secureDNS?.delegationSigned,
                        'Registry response URL': value.source,
                    }}
                />
                <section className="result-group">
                    <h3>Registration timeline</h3>
                    <Table
                        rows={array(data.events).map((event) => ({
                            event: event.eventAction,
                            date: event.eventDate,
                        }))}
                    />
                </section>
                <section className="result-group">
                    <h3>Published entities</h3>
                    <Table
                        rows={array(data.entities).map((entity) => ({
                            role: array(entity.roles).join(', '),
                            name:
                                array(entity.vcardArray?.[1]).find((row) => row[0] === 'fn')?.[3] ??
                                entity.handle,
                            handle: entity.handle,
                        }))}
                    />
                </section>
                <p className="tool-notice">
                    Registry privacy redactions are preserved. Raw output includes the complete
                    public RDAP record.
                </p>
            </Panel>
        );
    }
    if (toolId === 'network-cors-tester')
        return (
            <Panel title="CORS preflight">
                <Status passed={value.checksPass}>
                    {value.checksPass ? 'Header checks pass' : 'Review preflight checks'}
                </Status>
                <div className="result-checks">
                    {Object.entries(value.checks ?? {}).map(([key, passed]) => (
                        <div key={key}>
                            <Icon name={passed ? 'check' : 'info'} size={17} />
                            <span>{title(key)}</span>
                            <strong>{passed ? 'Pass' : 'Review'}</strong>
                        </div>
                    ))}
                </div>
                <Facts
                    value={{
                        origin: value.origin,
                        method: value.requestedMethod,
                        status: value.status,
                    }}
                />
                <p className="tool-notice">{value.note}</p>
            </Panel>
        );
    if (toolId === 'mock-apis-webhook-event-simulator')
        return (
            <Panel title="Webhook delivery" detail={`HTTP ${value.response?.status}`}>
                <Facts
                    value={{
                        provider: value.provider,
                        event: value.eventType,
                        target: value.request?.url,
                        duration: `${value.response?.durationMs} ms`,
                    }}
                />
                <p className="tool-notice">{value.note}</p>
                <details>
                    <summary>Signed request</summary>
                    <ResultPreview
                        text={JSON.stringify(value.request, null, 2)}
                        title="Request headers and payload"
                    />
                </details>
                <ResultPreview
                    text={String(value.response?.body ?? '')}
                    title="Receiver response"
                />
                <details>
                    <summary>Receiver headers</summary>
                    <ResultPreview text={JSON.stringify(value.response?.headers ?? {}, null, 2)} />
                </details>
            </Panel>
        );
    if (
        [
            'network-http-header-inspector',
            'network-redirect-tester',
            'network-network-diagnostics',
        ].includes(toolId)
    )
        return (
            <Panel
                title={toolId === 'network-redirect-tester' ? 'Redirect journey' : 'HTTP response'}
                detail={`HTTP ${value.status}`}
            >
                <p className="tool-notice">Measured from Kivel’s server.</p>
                <Facts
                    value={{
                        url: value.url,
                        status: value.status,
                        ...(value.timings
                            ? {
                                  'DNS lookup time': `${value.timings.dnsMs} ms`,
                                  'Time to response headers': `${value.timings.responseMs} ms`,
                                  'Total request time': `${value.timings.totalMs} ms`,
                              }
                            : {}),
                    }}
                />
                <Redirects hops={array(value.hops)} />
                {value.headers && (
                    <section className="result-group">
                        <h3>Response headers</h3>
                        <Facts value={value.headers} />
                    </section>
                )}
                {value.addresses && (
                    <section className="result-group">
                        <h3>Resolved addresses</h3>
                        <Table rows={value.addresses} />
                    </section>
                )}
            </Panel>
        );
    if (toolId === 'everyday-color-extractor')
        return (
            <Panel title="Image palette" detail={`${array(value.colors).length} colors`}>
                <div className="result-palette">
                    {array(value.colors).map((color) => (
                        <article key={color.hex}>
                            <div
                                style={{
                                    backgroundColor: /^#[0-9a-f]{6}$/i.test(color.hex)
                                        ? color.hex
                                        : '#eee',
                                }}
                            />
                            <strong>{color.hex}</strong>
                            <small>{color.percentage}% of sample</small>
                            <CopyButton text={color.hex} label={`Copy ${color.hex}`} compact />
                        </article>
                    ))}
                </div>
                <p className="tool-notice">{value.method}</p>
            </Panel>
        );
    if (toolId === 'developer-regex-tester')
        return (
            <Panel title="Pattern matches" detail={`${array(value.matches).length} matches`}>
                {input !== undefined && (
                    <section className="result-group">
                        <h3>Matches in context</h3>
                        <RegexContext input={input} matches={array(value.matches)} />
                    </section>
                )}
                <Table rows={array(value.matches)} columns={['text', 'start', 'end', 'groups']} />
                {value.truncated && (
                    <p className="tool-notice">Only the first 100 matches are returned.</p>
                )}
            </Panel>
        );
    if (toolId === 'developer-cron-expression-helper')
        return (
            <Panel title="Next occurrences" detail={value.timezone}>
                <div className="result-expression">
                    <code>{value.expression}</code>
                    <span>Preview only · no job scheduled</span>
                </div>
                <Table rows={array(value.occurrences)} columns={['iso', 'local']} />
            </Panel>
        );
    if (toolId === 'everyday-media-metadata')
        return (
            <Panel title={value.filename ?? 'Media details'} detail={value.container}>
                <Facts
                    value={{
                        durationSeconds: value.durationSeconds,
                        bytes: value.bytes,
                        bitrate: value.bitrate,
                    }}
                />
                <section className="result-group">
                    <h3>Media streams</h3>
                    <Table rows={array(value.streams)} />
                </section>
                <p className="tool-notice">{value.note}</p>
            </Panel>
        );
    if (['files-file-metadata-inspector', 'everyday-image-metadata'].includes(toolId))
        return (
            <Panel
                title={value.filename ?? value.name ?? 'File details'}
                detail={value.format ?? value.detectedType ?? 'Metadata'}
            >
                <Tree value={value} />
            </Panel>
        );
    if (toolId === 'agents-mcp-server-inspector')
        return (
            <Panel
                title={
                    typeof value.server?.title === 'string'
                        ? value.server.title
                        : typeof value.server?.name === 'string'
                          ? value.server.name
                          : 'MCP server'
                }
                detail={value.protocolVersion}
            >
                <Facts
                    value={{
                        serverVersion: value.server?.version,
                        collection: value.collection,
                        items: array(value.items).length,
                    }}
                />
                <section className="result-group">
                    <h3>Capabilities</h3>
                    <Tree value={value.capabilities} />
                </section>
                {array(value.items).map((item, index) => (
                    <section className="result-group" key={index}>
                        <h3>
                            {typeof item.title === 'string'
                                ? item.title
                                : typeof item.name === 'string'
                                  ? item.name
                                  : 'Descriptor'}
                        </h3>
                        {typeof item.description === 'string' && (
                            <p className="result-message">{item.description}</p>
                        )}
                        <Tree
                            value={Object.fromEntries(
                                Object.entries(item).filter(
                                    ([key]) => !['title', 'name', 'description'].includes(key),
                                ),
                            )}
                        />
                    </section>
                ))}
                <p className="tool-notice">{value.note}</p>
                {value.nextCursor && (
                    <TokenOutput text={value.nextCursor} label="Next page cursor" />
                )}
                <p className="tool-notice">{value.safety}</p>
            </Panel>
        );
    if (toolId === 'agents-mcp-tool-call-inspector')
        return (
            <Panel title="MCP trace" detail={`${value.messages} messages`}>
                <Facts value={{ requests: value.requests, errors: value.errors }} />
                {array(value.calls).map((call, index) => (
                    <section className="result-group" key={index}>
                        <div className="result-group-heading">
                            <h3>{call.tool ?? call.method}</h3>
                            <Status passed={call.status === 'Completed'}>{call.status}</Status>
                        </div>
                        <Facts value={{ id: call.id, method: call.method }} />
                        <Tree
                            value={{
                                ...(call.arguments !== undefined
                                    ? { arguments: call.arguments }
                                    : {}),
                                ...(call.result !== undefined ? { result: call.result } : {}),
                                ...(call.error !== undefined ? { error: call.error } : {}),
                            }}
                        />
                    </section>
                ))}
                {array(value.warnings).length > 0 && (
                    <section className="result-group">
                        <h3>Trace warnings</h3>
                        <ul>
                            {array(value.warnings).map((warning, index) => (
                                <li key={index}>{warning}</li>
                            ))}
                        </ul>
                    </section>
                )}
            </Panel>
        );
    if (toolId === 'email-email-verification-tester')
        return (
            <Panel title={value.subject || 'Verification email'}>
                <Facts
                    value={{
                        recipient: value.recipient,
                        candidateCodes: array(value.codes).join(', ') || 'None found',
                    }}
                />
                <section className="result-group">
                    <h3>Links in the message</h3>
                    <Table rows={array(value.links)} columns={['url']} />
                </section>
                <p className="tool-notice">{value.note}</p>
            </Panel>
        );
    if (toolId === 'email-email-inspector')
        return (
            <Panel title={value.subject || 'Email message'}>
                <Facts
                    value={{
                        from: value.from?.address,
                        to: array(value.to)
                            .map((item) => item.address)
                            .join(', '),
                        date: value.date,
                        messageId: value.messageId,
                    }}
                />
                {value.text && (
                    <section className="result-group">
                        <h3>Message text</h3>
                        <p className="result-message">{value.text}</p>
                    </section>
                )}
                <section className="result-group">
                    <h3>Attachments</h3>
                    <Table
                        rows={array(value.attachments)}
                        columns={['filename', 'mimeType', 'bytes', 'sha256']}
                    />
                </section>
                <p className="tool-notice">{value.note}</p>
            </Panel>
        );
    return (
        <Panel
            title={Array.isArray(value) ? 'Records' : 'Result details'}
            detail={Array.isArray(value) ? `${value.length} records` : undefined}
        >
            <Tree value={value} />
        </Panel>
    );
}

function TokenOutput({
    text,
    label,
    secret = false,
}: {
    text: string;
    label: string;
    secret?: boolean;
}) {
    const [revealed, setRevealed] = useState(!secret);
    useEffect(() => setRevealed(!secret), [text, secret]);
    return (
        <Panel title={label} detail={`${text.length.toLocaleString()} characters`}>
            <div className="result-token">
                <code>
                    {revealed ? text.slice(0, 4096) : '•'.repeat(Math.min(text.length, 32))}
                </code>
                <div>
                    <CopyButton text={text} label="Copy value" compact />
                    {secret && (
                        <button
                            className="button button-small"
                            type="button"
                            onClick={() => setRevealed(!revealed)}
                        >
                            {revealed ? 'Hide' : 'Reveal'}
                        </button>
                    )}
                </div>
            </div>
            {text.length > 4096 && (
                <p className="tool-notice">
                    Long value truncated in the preview. Copy or download the complete result below.
                </p>
            )}
        </Panel>
    );
}

function RegexContext({ input, matches }: { input: string; matches: any[] }) {
    let offset = 0;
    const output: ReactNode[] = [];
    for (const [index, match] of matches.entries()) {
        if (
            !Number.isInteger(match.start) ||
            !Number.isInteger(match.end) ||
            match.start < offset ||
            match.end > input.length
        )
            continue;
        output.push(input.slice(offset, match.start));
        output.push(
            <mark key={index} title={`Match ${index + 1}, offset ${match.start}`}>
                {input.slice(match.start, match.end) || '∅'}
            </mark>,
        );
        offset = match.end;
    }
    output.push(input.slice(offset));
    return <div className="result-regex-context">{output}</div>;
}
