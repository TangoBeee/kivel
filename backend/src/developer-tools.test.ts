import assert from 'node:assert/strict';
import test from 'node:test';
import { runBrowserOperation as run } from '@socket-help/tools/engine';
import type { BrowserOperationId, OperationOptions } from '@socket-help/tools/definitions';
import { ToolRunner } from '@socket-help/tools/node';
import { catalog, toolPageHref } from '@socket-help/tools/catalog';
import { readablePage, emailAuthenticationReport, sitemapContents } from './developer-network.js';
import { NetworkRunner } from './network-tools.js';
import { buildApp } from './app.js';
const result = async (id: BrowserOperationId, input = '', options: OperationOptions = {}) =>
    JSON.parse(await run(id, input, options));
function remainder(value: string) {
    let rest = 0;
    for (const letter of value)
        for (const digit of /[A-Z]/.test(letter) ? String(letter.charCodeAt(0) - 55) : letter)
            rest = (rest * 10 + Number(digit)) % 97;
    return rest;
}
test('test identities are unique and localized with reserved email domains', async () => {
    for (const locale of ['en-US', 'en-GB', 'de-DE', 'fr-FR']) {
        const value = await result('developer-fake-identity-generator', '', {
            locale,
            count: '50',
        });
        assert.equal(value.identities.length, 50);
        for (const field of ['name', 'email', 'phone', 'company'])
            assert.equal(new Set(value.identities.map((row: any) => row[field])).size, 50, field);
        assert.ok(
            value.identities.every(
                (row: any) =>
                    row.email.endsWith('@example.test') && row.address.country.length === 2,
            ),
        );
    }
    await assert.rejects(result('developer-fake-identity-generator', '', { count: '51' }));
    await assert.rejects(result('developer-fake-identity-generator', '', { locale: 'xx' }));
});
test('test IBANs have country lengths and valid checksums and US routing checksums are valid', async () => {
    const lengths = { DE: 22, GB: 22, NL: 18, FR: 27, ES: 24, BE: 16 };
    for (const [country, length] of Object.entries(lengths)) {
        const { accounts } = await result('developer-test-bank-account-generator', '', {
            country,
            count: '50',
        });
        assert.equal(new Set(accounts.map((row: any) => row.iban)).size, 50);
        for (const row of accounts) {
            assert.equal(row.iban.length, length);
            assert.equal(remainder(row.iban.slice(4) + row.iban.slice(0, 4)), 1);
        }
    }
    const { accounts } = await result('developer-test-bank-account-generator', '', {
        country: 'US',
        count: '50',
    });
    for (const row of accounts) {
        assert.match(row.routingNumber, /^\d{9}$/);
        assert.match(row.accountNumber, /^\d{12}$/);
        assert.equal(
            [...row.routingNumber].reduce(
                (sum, digit, i) => sum + Number(digit) * [3, 7, 1][i % 3]!,
                0,
            ) % 10,
            0,
        );
    }
    await assert.rejects(result('developer-test-bank-account-generator', '', { country: 'XX' }));
});
test('schema inference merges array shapes, nullable types and required intersections', async () => {
    const { schema } = await result(
        'developer-json-schema-from-sample',
        '[{"id":1,"name":"Ada"},{"id":2,"name":null,"age":20}]',
    );
    assert.deepEqual(schema.items.required, ['id', 'name']);
    assert.deepEqual(schema.items.properties.name.anyOf, [{ type: 'string' }, { type: 'null' }]);
    assert.equal(schema.items.properties.age.type, 'integer');
    assert.equal(
        (await result('developer-json-schema-from-sample', '[1,1.5]')).schema.items.type,
        'number',
    );
    const special = await result('developer-json-schema-from-sample', '{"__proto__":1,"a/b":true}');
    assert.equal(special.schema.properties.__proto__.type, 'integer');
    await assert.rejects(
        result('developer-json-schema-from-sample', '['.repeat(65) + '0' + ']'.repeat(65)),
        /nesting/,
    );
});
test('JSON Schema validation supports drafts, formats, local refs and safe patterns', async (t) => {
    const runner = new ToolRunner();
    t.after(() => runner.close());
    const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { email: { type: 'string', format: 'email' } },
        required: ['email'],
        additionalProperties: false,
    };
    const valid = JSON.parse(
        await runner.run('developer-json-schema-validator', '{"email":"ada@example.test"}', {
            schema: JSON.stringify(schema),
        }),
    );
    assert.equal(valid.valid, true);
    const invalid = await result('developer-json-schema-validator', '{"email":"bad"}', {
        schema: JSON.stringify(schema),
    });
    assert.equal(invalid.valid, false);
    assert.equal(invalid.errors[0].path, '/email');
    assert.equal(
        (
            await result('developer-json-schema-validator', '3', {
                schema: '{"$defs":{"n":{"type":"integer"}},"$ref":"#/$defs/n"}',
            })
        ).valid,
        true,
    );
    assert.equal(
        (
            await result('developer-json-schema-validator', '"aaaa!"', {
                schema: '{"type":"string","pattern":"^(a+)+$"}',
            })
        ).valid,
        false,
    );
    await assert.rejects(
        result('developer-json-schema-validator', '{}', {
            schema: '{"$ref":"https://example.com/schema"}',
        }),
        /Bundle/,
    );
    await assert.rejects(
        result('developer-json-schema-validator', '"a"', { schema: '{"pattern":"(?=a)"}' }),
        /compiled/,
    );
    assert.equal(
        (await result('developer-json-schema-validator', '1', { schema: 'false' })).valid,
        false,
    );
});
test('OpenAPI validation gives source lines and rejects malformed contracts without repairing required fields', async (t) => {
    const runner = new ToolRunner();
    t.after(() => runner.close());
    const source =
        'openapi: 3.1.0\ninfo:\n  title: Example\n  version: 1.0.0\npaths:\n  /items:\n    get:\n      responses:\n        "200":\n          description: OK';
    const valid = JSON.parse(await runner.run('developer-openapi-validator', source));
    assert.equal(valid.valid, true, JSON.stringify(valid));
    assert.equal(valid.operations, 1);
    assert.ok(
        valid.warnings.some((row: any) => row.line === 8 && row.message.includes('operationId')),
    );
    const missing = await result(
        'developer-openapi-validator',
        source.replace('  version: 1.0.0\n', ''),
    );
    assert.equal(missing.valid, false);
    assert.ok(missing.errors.some((row: any) => row.path === '/info/version'));
    const bad = await result(
        'developer-openapi-validator',
        source.replace('description: OK', 'description: 99'),
    );
    assert.equal(bad.valid, false);
    assert.ok(bad.errors.some((row: any) => row.line >= 7));
    assert.equal((await result('developer-openapi-validator', 'openapi: [')).valid, false);
    await assert.rejects(result('developer-openapi-validator', 'swagger: "2.0"'), /3.0/);
    const ref = source.replace(
        'description: OK',
        'description: OK\n          content:\n            application/json:\n              schema:\n                $ref: https://example.com/schema',
    );
    const external = await result('developer-openapi-validator', ref);
    assert.ok(external.warnings.some((row: any) => row.message.includes('not fetched')));
});
test('secret scanning never returns full secrets and reports source positions', async () => {
    const secret = 'ghp_' + 'a'.repeat(36),
        generic = 'secret'.repeat(4);
    const value = await result(
        'developer-secret-scanner',
        `ready\nTOKEN=${secret}\nclient_secret="${generic}"\n-----BEGIN PRIVATE KEY-----`,
    );
    assert.equal(value.count, 3);
    assert.equal(value.findings[0].line, 2);
    assert.equal(value.findings[0].column, 7);
    assert.ok(!JSON.stringify(value).includes(secret));
    assert.ok(!JSON.stringify(value).includes(generic));
    assert.equal((await result('developer-secret-scanner', 'hello world')).count, 0);
    await assert.rejects(result('developer-secret-scanner', 'a'.repeat(65537)), /64 KiB/);
});
test('phone parsing uses full metadata and rejects text, invalid country and oversized inputs', async () => {
    const value = await result('developer-phone-number-validator', '020 7946 0958', {
        country: 'GB',
    });
    assert.equal(value.valid, true);
    assert.equal(value.e164, '+442079460958');
    assert.equal(value.type, 'FIXED_LINE');
    assert.equal(
        (await result('developer-phone-number-validator', 'call +442079460958')).valid,
        false,
    );
    assert.equal((await result('developer-phone-number-validator', '123')).valid, false);
    await assert.rejects(
        result('developer-phone-number-validator', '1'.repeat(65)),
        /64 characters/,
    );
    await assert.rejects(result('developer-phone-number-validator', '123', { country: 'ZZ' }));
});
test('timezone conversion resolves exact instants and rejects DST gaps and folds by default', async () => {
    const options = { from: 'America/New_York', timezone: 'Asia/Kolkata' };
    const value = await result('developer-timezone-converter', '2026-11-03T10:30:00', options);
    assert.match(value.destination, /21:00:00\+05:30/);
    for (const input of ['2026-03-08T02:30:00', '2026-11-01T01:30:00']) {
        await assert.rejects(
            result('developer-timezone-converter', input, options),
            /daylight saving/,
        );
        const earlier = await result('developer-timezone-converter', input, {
            ...options,
            disambiguation: 'earlier',
        });
        const later = await result('developer-timezone-converter', input, {
            ...options,
            disambiguation: 'later',
        });
        assert.equal(later.unixSeconds - earlier.unixSeconds, 3600);
    }
    assert.equal(
        (await result('developer-timezone-converter', '2026-11-03T15:30:00Z', options)).unixSeconds,
        value.unixSeconds,
    );
    await assert.rejects(
        result('developer-timezone-converter', '2026-01-01T00:00', { timezone: 'Mars/Olympus' }),
    );
});
test('date calculations handle leap years, constrained month ends and reverse differences', async () => {
    assert.equal(
        (await result('developer-date-calculator', '2028-01-31', { duration: 'P1M' })).result,
        '2028-02-29',
    );
    assert.equal(
        (await result('developer-date-calculator', '2028-02-29', { duration: 'P1Y' })).result,
        '2029-02-28',
    );
    assert.equal(
        (await result('developer-date-calculator', '2028-03-01', { duration: '-P1D' })).result,
        '2028-02-29',
    );
    assert.equal(
        (
            await result('developer-date-calculator', '2028-03-01', {
                action: 'difference',
                to: '2028-02-28',
            })
        ).totalDays,
        -2,
    );
    for (const input of ['2026-02-30', '2026-1-1'])
        await assert.rejects(result('developer-date-calculator', input));
    await assert.rejects(result('developer-date-calculator', '2026-01-01', { duration: 'PT24H' }));
});
test('page extraction removes executable and unrelated content and preserves readable structure', () => {
    const page = readablePage(
        '<title>Guide</title><meta name="description" content="A guide"><nav>Menu</nav><main><h1>Hello</h1><p>Read <a href="/docs">docs</a>.</p><pre><code>const x = 1;</code></pre><script>alert(1)</script><a href="javascript:alert(1)">bad</a><img src="/track"></main>',
        'https://example.com/page',
    );
    assert.equal(page.title, 'Guide');
    assert.equal(page.description, 'A guide');
    assert.match(page.markdown, /# Hello/);
    assert.match(page.markdown, /https:\/\/example.com\/docs/);
    assert.match(page.markdown, /```/);
    assert.ok(!page.markdown.includes('alert(1)'));
    assert.ok(!page.text.includes('Menu'));
    assert.ok(!page.html.includes('<img'));
    assert.equal(page.links.length, 1);
});
test('email diagnostics distinguish optional BIMI, missing DKIM, unsafe SPF and invalid policies', () => {
    const report = emailAuthenticationReport(
        'example.com',
        [
            { type: 'SPF', name: 'example.com', values: ['v=spf1 +all'], status: 0 },
            { type: 'DMARC', name: '_dmarc.example.com', values: ['v=DMARC1; p=none'], status: 0 },
            { type: 'DKIM', name: 's._domainkey.example.com', values: ['v=DKIM1; p='], status: 0 },
            { type: 'MX', name: 'example.com', values: ['0 .'], status: 0 },
        ],
        's',
    );
    assert.ok(report.findings.some((row) => row.message.includes('+all')));
    assert.ok(report.findings.some((row) => row.message.includes('p=none')));
    assert.ok(report.findings.some((row) => row.message.includes('empty p=')));
    assert.ok(report.findings.some((row) => row.message.includes('null MX')));
    assert.ok(report.findings.some((row) => row.message.includes('optional')));
    const expanded = emailAuthenticationReport(
        'example.com',
        [
            {
                type: 'SPF',
                name: 'example.com',
                values: ['v=spf1 ' + 'a '.repeat(11) + 'all'],
                status: 0,
            },
        ],
        '',
    );
    assert.ok(expanded.findings.some((row) => row.message.includes('ten DNS')));
    assert.ok(expanded.findings.some((row) => row.message.includes('authorizes any')));
});
test('sitemap parsing is bounded and lists indexes without fetching their entries', () => {
    const sitemap = sitemapContents(
        '<urlset><url><loc>https://example.com/docs</loc><lastmod>2026-01-01</lastmod></url><url><loc>bad</loc></url></urlset>',
        'https://example.com/sitemap.xml',
    );
    assert.equal(sitemap.entries.length, 2);
    assert.equal(sitemap.problems.length, 1);
    assert.equal(
        sitemapContents(
            '<sitemapindex><sitemap><loc>https://example.com/part.xml</loc></sitemap></sitemapindex>',
            'https://example.com/sitemap.xml',
        ).kind,
        'index',
    );
    assert.throws(
        () =>
            sitemapContents(
                '<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><urlset/>',
                'https://example.com/',
            ),
        /DTD/,
    );
});
test('new network tools reject unsafe destinations and use shared bounded runners', async (t) => {
    const network = new NetworkRunner();
    t.after(() => network.close());
    for (const id of [
        'network-web-page-to-markdown',
        'network-robots-and-sitemap-checker',
    ] as const)
        await assert.rejects(
            network.run(id, 'http://127.0.0.1', {}, new AbortController().signal),
            /Private/,
        );
    await assert.rejects(
        network.run(
            'email-email-authentication-checker',
            'localhost',
            {},
            new AbortController().signal,
        ),
        /public DNS/,
    );
    await assert.rejects(
        network.run(
            'email-email-authentication-checker',
            'example.com',
            { selector: 'bad/selector' },
            new AbortController().signal,
        ),
        /selector/,
    );
});
test('new tools appear in HTTP discovery and describe with their options', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const ids = [
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
    ];
    for (const id of ids) {
        const tool = catalog.find((tool) => tool.id === id)!;
        assert.equal(tool.status, 'available');
        assert.equal(tool.href, toolPageHref(tool));
        const response = await app.inject(`/api/tools/${id}`);
        assert.equal(response.statusCode, 200, response.body);
    }
    const schema = await app.inject({
        method: 'POST',
        url: '/api/tools/developer-json-schema-validator/run',
        payload: { input: '42', options: { schema: '{"type":"integer"}' } },
    });
    assert.equal(schema.statusCode, 200, schema.body);
    assert.equal(JSON.parse(schema.json().output).valid, true);
    const scan = await app.inject({
        method: 'POST',
        url: '/api/tools/developer-secret-scanner/run',
        payload: { input: 'ghp_' + 'a'.repeat(36) },
    });
    assert.equal(scan.statusCode, 200, scan.body);
    assert.ok(!scan.body.includes('a'.repeat(36)));
});
