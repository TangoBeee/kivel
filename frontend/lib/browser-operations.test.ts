import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBrowserOperation as run } from './browser-operations';

test('JWT inspection is explicitly unverified and handles Unicode claims locally', async () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const result = JSON.parse(
        await run(
            'developer-jwt-inspector',
            `${encode({ alg: 'none' })}.${encode({ name: 'Zoë' })}.`,
        ),
    );
    assert.equal(result.verified, false);
    assert.equal(result.claims.name, 'Zoë');
    await assert.rejects(run('developer-jwt-inspector', 'invalid'));
});
test('CSV conversion preserves quotes, newlines and leading zeroes while rejecting ambiguous headers', async () => {
    const data = JSON.parse(await run('everyday-csv-to-json', 'id,name\n001,"Ada,\nLovelace"'));
    assert.deepEqual(data, [{ id: '001', name: 'Ada,\nLovelace' }]);
    await assert.rejects(run('everyday-csv-to-json', 'id,id\n1,2'));
    const csv = await run(
        'everyday-json-to-csv',
        '[{"name":"=HYPERLINK(1)","n":-5},{"other":{"ok":true}}]',
    );
    assert.match(csv, /'=HYPERLINK/);
    assert.match(csv, /-5/);
    assert.match(csv, /other/);
});
test('YAML conversion rejects duplicate keys, unsafe tags and excessive aliases', async () => {
    assert.deepEqual(
        JSON.parse(await run('everyday-data-format-converter', 'name: socket\nversion: 1')),
        { name: 'socket', version: 1 },
    );
    await assert.rejects(run('developer-yaml-formatter', 'name: one\nname: two'));
    await assert.rejects(
        run('everyday-data-format-converter', 'value: !!js/function function() {}'),
    );
    await assert.rejects(run('everyday-data-format-converter', 'value: .inf'));
});
test('timestamp conversion distinguishes seconds and milliseconds and rejects ambiguous local dates', async () => {
    assert.equal(
        JSON.parse(await run('everyday-timestamp-converter', '0')).iso,
        '1970-01-01T00:00:00.000Z',
    );
    assert.equal(
        JSON.parse(await run('everyday-timestamp-converter', '1000', { unit: 'milliseconds' }))
            .unixSeconds,
        1,
    );
    assert.equal(
        JSON.parse(await run('everyday-timestamp-converter', '2026-01-01', { unit: 'date' })).iso,
        '2026-01-01T00:00:00.000Z',
    );
    await assert.rejects(run('everyday-timestamp-converter', '2026-02-30', { unit: 'date' }));
    await assert.rejects(run('everyday-timestamp-converter', '2026-01-01T12:00', { unit: 'date' }));
});
test('HMAC matches a known SHA-256 vector', async () => {
    assert.equal(
        await run('developer-hmac-generator', 'The quick brown fox jumps over the lazy dog', {
            secret: 'key',
        }),
        'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    );
});
test('secure generators validate bounds and handle the full safe-integer interval', async () => {
    assert.equal((await run('everyday-password-generator', '', { length: '32' })).length, 32);
    await assert.rejects(run('everyday-password-generator', '', { length: '129' }));
    assert.equal(await run('everyday-random-generator', '', { min: '-10', max: '-10' }), '-10');
    for (let index = 0; index < 30; index++) {
        const value = Number(
            await run('everyday-random-generator', '', {
                min: '-9007199254740991',
                max: '9007199254740991',
            }),
        );
        assert.ok(Number.isSafeInteger(value));
    }
    await assert.rejects(run('everyday-random-generator', '', { min: '2', max: '1' }));
    await assert.rejects(run('everyday-random-generator', '', { min: '', max: '10' }));
});
test('file checksums use exact bytes and URL parsing preserves duplicate parameters', async () => {
    assert.equal(
        await run('everyday-file-checksums', '', {}, new File(['abc'], 'test.txt')),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    assert.deepEqual(
        JSON.parse(await run('developer-url-parser', 'https://example.com/?tag=one&tag=two')).query,
        [
            ['tag', 'one'],
            ['tag', 'two'],
        ],
    );
});

test('formatting and inspection preserve large integers while conversions reject precision loss', async () => {
    const large = '9007199254740993';
    assert.match(await run('developer-yaml-formatter', `large: ${large}`), new RegExp(large));
    await assert.rejects(run('everyday-data-format-converter', `large: ${large}`), /precision/);
    await assert.rejects(
        run('everyday-data-format-converter', '{"value":0.123456789012345678901}', {
            mode: 'json-yaml',
        }),
        /precision/,
    );
    await assert.rejects(run('everyday-json-to-csv', `[{"id":${large}}]`), /precision/);
    await assert.rejects(
        run('everyday-data-format-converter', '1: number-key'),
        /string mapping keys/,
    );
    await assert.rejects(
        run('developer-yaml-formatter', 'value: 0.123456789012345678901'),
        /precision/,
    );
    assert.match(await run('everyday-json-to-csv', `[{"id":"${large}"}]`), new RegExp(large));
    const jwt = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(`{"id":${large}}`).toString('base64url')}.`;
    assert.match(await run('developer-jwt-inspector', jwt), new RegExp(large));
    assert.equal(
        await run('everyday-file-checksums', '', {}, new File([], 'empty')),
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
});

test('generated cards have valid brand formats and unique numbers, names, expiry and CVV', async () => {
    const { passesLuhn, cardBrandNames, generateTestCards } =
        await import('@socket-help/tools/payment-cards');
    const now = new Date('2026-12-31T23:59:59Z');
    const patterns = {
        visa: /^4\d{15}$/,
        mastercard: /^(5[1-5]\d{14}|2\d{15})$/,
        amex: /^3[47]\d{13}$/,
        discover: /^(6011\d{12}|64[4-9]\d{13})$/,
        jcb: /^35\d{14}$/,
        diners: /^3[036]\d{12}$/,
        unionpay: /^62\d{14}$/,
    };
    for (const funding of ['credit', 'debit', 'prepaid'] as const) {
        for (const brand of Object.keys(cardBrandNames) as (keyof typeof cardBrandNames)[]) {
            const batch = generateTestCards(funding, { brand, count: '50', address: 'true' }, now);
            assert.equal(batch.testOnly, true);
            assert.equal(batch.mode, 'generated');
            for (const field of ['number', 'holder', 'cvc'] as const)
                assert.equal(new Set(batch.cards.map((card) => card[field])).size, 50, field);
            assert.equal(
                new Set(batch.cards.map((card) => `${card.expiryMonth}/${card.expiryYear}`)).size,
                50,
            );
            for (const card of batch.cards) {
                assert.equal(card.funding, funding);
                assert.match(card.number, patterns[brand]);
                assert.equal(passesLuhn(card.number), true);
                if (brand === 'mastercard')
                    assert.ok(
                        /^5[1-5]/.test(card.number) ||
                            (Number(card.number.slice(0, 4)) >= 2221 &&
                                Number(card.number.slice(0, 4)) <= 2720),
                    );
                if (brand === 'jcb')
                    assert.ok(
                        Number(card.number.slice(0, 4)) >= 3528 &&
                            Number(card.number.slice(0, 4)) <= 3589,
                    );
                assert.match(card.cvc, brand === 'amex' ? /^\d{4}$/ : /^\d{3}$/);
                assert.ok(card.expiryYear >= 2027 && card.expiryYear <= 2031);
                assert.ok(card.expiryMonth >= 1 && card.expiryMonth <= 12);
                assert.ok(card.billingAddress?.country);
                assert.equal(card.paymentMethod, undefined);
            }
        }
        const result = JSON.parse(
            await run(`developer-${funding}-card-generator`, '', { count: '50' }),
        );
        assert.equal(result.cards.length, 50);
        assert.equal(result.cards[0].billingAddress, undefined);
    }
});
test('sandbox mode preserves official provider numbers and never invents funding labels', async () => {
    const { sandboxCards, generateTestCards, passesLuhn } =
        await import('@socket-help/tools/payment-cards');
    for (const provider of ['stripe', 'adyen', 'braintree', 'paypal']) {
        const batch = generateTestCards('credit', { mode: 'sandbox', provider });
        assert.equal(batch.provider, provider);
        assert.ok(batch.source?.startsWith('https://'));
        assert.ok(
            sandboxCards.some(
                (card) => card.provider === provider && card.number === batch.cards[0]!.number,
            ),
        );
        assert.equal(passesLuhn(batch.cards[0]!.number), true);
        if (provider !== 'stripe') assert.equal(batch.cards[0]!.funding, 'unspecified');
    }
    assert.equal(
        generateTestCards('prepaid', { mode: 'sandbox' }).cards[0]!.paymentMethod,
        'pm_card_mastercard_prepaid',
    );
    assert.throws(
        () => generateTestCards('credit', { mode: 'sandbox', brand: 'visa', count: '2' }),
        /distinct official numbers/,
    );
});
test('card generation rejects unsupported options and unbounded counts', async () => {
    for (const count of ['0', '51', '-1', '1.5', 'Infinity', '', 'invalid'])
        await assert.rejects(run('developer-credit-card-generator', '', { count }));
    await assert.rejects(run('developer-prepaid-card-generator', '', { brand: 'unknown' }));
    await assert.rejects(run('developer-credit-card-generator', '', { mode: 'unknown' }));
    await assert.rejects(run('developer-credit-card-generator', '', { provider: 'unknown' }));
    await assert.rejects(run('developer-credit-card-generator', '', { address: 'maybe' }));
});
test('card validation checks exact fixtures and checksum failures without claiming a live card is valid', async () => {
    const { testCardFixtures } = await import('@socket-help/tools/payment-cards');
    for (const fixture of testCardFixtures) {
        const result = JSON.parse(await run('developer-card-number-validator', fixture.number));
        assert.equal(result.checksumValid, true);
        assert.equal(result.recognizedTestCard.funding, fixture.funding);
        assert.equal(result.last4, fixture.number.slice(-4));
        assert.equal(result.number, undefined);
        const changed = fixture.number.slice(0, -1) + ((Number(fixture.number.at(-1)) + 1) % 10);
        const failed = JSON.parse(await run('developer-card-number-validator', changed));
        assert.equal(failed.checksumValid, false);
        assert.equal(failed.recognizedTestCard, null);
    }
    assert.equal(
        JSON.parse(await run('developer-card-number-validator', '4242-4242 4242-4242'))
            .checksumValid,
        true,
    );
    const zero = JSON.parse(await run('developer-card-number-validator', '0000000000000000'));
    assert.equal(zero.checksumValid, true);
    assert.equal(zero.recognizedTestCard, null);
    assert.match(zero.note, /does not verify/);
    for (const input of [
        '',
        '424242424242',
        '42424242424242424242',
        '4242\n424242424242',
        '424242424242424x',
        '４２４２４２４２４２４２４２４２',
    ])
        await assert.rejects(run('developer-card-number-validator', input));
});

test('XML formatting preserves ordering and numeric text while rejecting malformed and entity-bearing documents', async () => {
    const result = await run(
        'developer-xml-formatter',
        '<root><x>001</x><x>9007199254740993</x><text>A&amp;B</text></root>',
    );
    assert.ok(result.indexOf('001') < result.indexOf('9007199254740993'));
    assert.match(result, /A&amp;B/);
    await assert.rejects(run('developer-xml-formatter', '<a><b></a>'));
    await assert.rejects(
        run(
            'developer-xml-formatter',
            '<!DOCTYPE root [<!ENTITY x SYSTEM "file:///etc/passwd">]><root>&x;</root>',
        ),
    );
    await assert.rejects(
        run('developer-xml-formatter', '<a>'.repeat(100) + 'x' + '</a>'.repeat(100)),
    );
});
test('regex matching handles groups, empty matches, and adversarial backtracking patterns within a bounded engine', async () => {
    const value = JSON.parse(
        await run('developer-regex-tester', 'Order 123 and 456', { pattern: '([0-9]+)' }),
    );
    assert.equal(value.matches[0].text, '123');
    assert.deepEqual(value.matches[0].groups, ['123']);
    assert.equal(value.matches[0].start, 6);
    const no = JSON.parse(
        await run('developer-regex-tester', 'a'.repeat(30000) + '!', { pattern: '(a+)+$' }),
    );
    assert.equal(no.matches.length, 0);
    const empty = JSON.parse(await run('developer-regex-tester', 'abc', { pattern: 'a*' }));
    assert.ok(empty.matches.length < 10);
    await assert.rejects(run('developer-regex-tester', 'abc', { pattern: '(a)\\1' }));
    await assert.rejects(run('developer-regex-tester', 'abc', { flags: 'x' }));
});
test('ULIDs encode current time and remain unique and monotonic within a generated batch', async () => {
    const before = Date.now(),
        ids = (await run('developer-ulid-generator', '', { count: '100' })).split('\n');
    assert.equal(new Set(ids).size, 100);
    assert.deepEqual(ids, [...ids].sort());
    for (const id of ids) assert.match(id, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let timestamp = 0;
    for (const c of ids[0]!.slice(0, 10)) timestamp = timestamp * 32 + alphabet.indexOf(c);
    assert.ok(timestamp >= before && timestamp <= Date.now());
});
test('cron inspection respects the selected timezone and returns exact upcoming UTC times', async () => {
    const value = JSON.parse(
        await run('developer-cron-expression-helper', '0 9 * * *', {
            timezone: 'Asia/Kolkata',
            start: '2026-10-26T00:00:00Z',
            count: '2',
        }),
    );
    assert.equal(value.occurrences[0].iso, '2026-10-26T03:30:00.000Z');
    assert.equal(value.occurrences[1].iso, '2026-10-27T03:30:00.000Z');
    assert.equal(value.scheduled, false);
    await assert.rejects(run('developer-cron-expression-helper', 'not cron'));
    await assert.rejects(
        run('developer-cron-expression-helper', '0 9 * * *', { timezone: 'Not/AZone' }),
    );
});
test('request construction quotes shell metacharacters and cURL inspection never expands commands or reads files', async () => {
    const built = JSON.parse(
        await run('developer-http-request-builder', 'https://example.com/test', {
            method: 'POST',
            headers: 'X-Test: one\nX-Test: two',
            body: "a'b;$(whoami)",
        }),
    );
    const parsed = JSON.parse(await run('developer-curl-builder-parser', built.curl));
    assert.equal(parsed.body, "a'b;$(whoami)");
    assert.equal(parsed.headers.length, 2);
    assert.equal(parsed.executed, false);
    const file = JSON.parse(
        await run(
            'developer-curl-builder-parser',
            'curl https://example.com --data-binary @secret.txt',
        ),
    );
    assert.equal(file.body, '@secret.txt');
    await assert.rejects(run('developer-curl-builder-parser', 'curl https://example.com; whoami'));
    await assert.rejects(run('developer-curl-builder-parser', 'curl file:///etc/passwd'));
    await assert.rejects(
        run('developer-http-request-builder', 'https://example.com', {
            headers: 'Bad header: value',
        }),
    );
});
test('diffs distinguish additions and removals while environment conversion round-trips quoted values', async () => {
    const diff = JSON.parse(
        await run('developer-code-diff-checker', 'a\nb\n', { comparison: 'a\nc\n' }),
    );
    assert.equal(diff.identical, false);
    assert.ok(diff.changes.some((c: { type: string }) => c.type === 'added'));
    assert.ok(diff.changes.some((c: { type: string }) => c.type === 'removed'));
    const original = {
        A: 'hello # world',
        B: 'a\nb',
        C: '${HOME}',
        D: 'He said "yes"',
        E: "it's ready",
    };
    const env = await run('developer-environment-variable-formatter', JSON.stringify(original), {
        mode: 'env',
    });
    assert.deepEqual(
        JSON.parse(await run('developer-environment-variable-formatter', env, { mode: 'json' })),
        original,
    );
    await assert.rejects(
        run('developer-environment-variable-formatter', '{"A":1}', { mode: 'env' }),
    );
    await assert.rejects(run('developer-environment-variable-formatter', '__proto__=bad'));
});
test('unit conversions enforce dimensions and absolute-zero limits', async () => {
    const result = async (value: string, from: string, to: string) =>
        JSON.parse(await run('everyday-unit-converter', value, { from, to })).result;
    assert.equal(await result('1', 'mi', 'm'), 1609.344);
    assert.equal(await result('32', 'F', 'C'), 0);
    assert.equal(await result('0', 'C', 'F'), 32);
    assert.equal(await result('1', 'gal', 'L'), 3.785411784);
    await assert.rejects(result('1', 'kg', 'm'));
    await assert.rejects(result('-274', 'C', 'K'));
    await assert.rejects(result('NaN', 'm', 'km'));
});
test('fixture generators produce safe CSV and valid XML, with bounded counts and fields', async () => {
    const csv = await run('test-media-dummy-csv', '', { count: '2' });
    assert.match(csv, /person2@example.test/);
    const rows = JSON.parse(await run('test-media-json-fixtures', '', { count: '2' }));
    assert.equal(rows[1].id, 2);
    assert.equal(rows[0].active, true);
    const xml = await run('test-media-xml-fixtures', '', { count: '2' });
    assert.match(await run('developer-xml-formatter', xml), /<record id="2">/);
    await assert.rejects(run('test-media-json-fixtures', '', { count: '1001' }));
    await assert.rejects(run('test-media-dummy-csv', '', { columns: 'id,id' }));
    await assert.rejects(run('test-media-json-fixtures', '', { columns: '__proto__' }));
});
test('downloadable fixtures carry exact bytes, correct file signatures, and escaped SVG labels', async () => {
    const binary = JSON.parse(
        await run('test-media-binary-payload-generator', '', { size: '1025' }),
    );
    const bytes = Buffer.from(binary.base64, 'base64');
    assert.equal(bytes.length, 1025);
    assert.equal(bytes[256], 0);
    assert.equal(bytes[255], 255);
    const svg = Buffer.from(
        JSON.parse(await run('test-media-placeholder-images', '<script>alert(1)</script>')).base64,
        'base64',
    ).toString();
    assert.ok(!svg.includes('<script>'));
    assert.ok(svg.includes('&lt;script&gt;'));
    const qr = Buffer.from(
        JSON.parse(await run('everyday-qr-code-generator', 'こんにちは')).base64,
        'base64',
    ).toString();
    assert.match(qr, /<svg/);
    assert.match(qr, /viewBox=/);
    const pdf = JSON.parse(await run('test-media-sample-pdf', 'Hello (fixture)', { count: '2' }));
    assert.equal(Buffer.from(pdf.base64, 'base64').subarray(0, 8).toString(), '%PDF-1.4');
    const zip = JSON.parse(
        await run('test-media-zip-generator', '[{"name":"hello.txt","text":"Hello"}]'),
    );
    assert.equal(Buffer.from(zip.base64, 'base64').readUInt32LE(0), 0x04034b50);
    await assert.rejects(
        run('test-media-zip-generator', '[{"name":"../escape.txt","text":"bad"}]'),
    );
    const wav = Buffer.from(
        JSON.parse(
            await run('test-media-tone-generator', '', { duration: '0.5', frequency: '1000' }),
        ).base64,
        'base64',
    );
    assert.equal(wav.subarray(8, 12).toString(), 'WAVE');
    assert.equal(wav.readUInt32LE(24), 16000);
    assert.equal(wav.readUInt32LE(40), 16000);
    assert.equal(wav.length, 16044);
});

test('OpenAPI conversion creates validated static routes, resolves local schemas, and rejects remote references and invalid mock headers', async () => {
    const spec = {
        openapi: '3.1.0',
        info: { title: 'Orders' },
        paths: {
            '/orders/{id}': {
                get: {
                    responses: {
                        '200': {
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/Order' },
                                },
                            },
                        },
                    },
                },
            },
        },
        components: {
            schemas: {
                Order: {
                    type: 'object',
                    properties: { id: { type: 'integer' }, state: { enum: ['ready', 'pending'] } },
                },
            },
        },
    };
    const config = JSON.parse(await run('mock-apis-openapi-to-mock', JSON.stringify(spec)));
    assert.equal(config.routes[0].path, '/orders/:id');
    assert.deepEqual(JSON.parse(config.routes[0].body), { id: 0, state: 'ready' });
    const validated = JSON.parse(
        await run('mock-apis-mock-configuration-import', JSON.stringify(config)),
    );
    assert.equal(validated.routes[0].delayMs, 0);
    const bad = structuredClone(spec);
    bad.paths['/orders/{id}'].get.responses['200'].content['application/json'].schema.$ref =
        'https://example.com/schema';
    await assert.rejects(run('mock-apis-openapi-to-mock', JSON.stringify(bad)));
    config.routes[0].headers = { 'set-cookie': 'bad=1' };
    await assert.rejects(run('mock-apis-mock-configuration-import', JSON.stringify(config)));
});
test('barcodes and file metadata use real artifacts and preserve exact input bytes', async () => {
    const barcode = JSON.parse(await run('everyday-barcode-generator', 'EXAMPLE-001'));
    assert.match(Buffer.from(barcode.base64, 'base64').toString(), /<svg/);
    await assert.rejects(run('everyday-barcode-generator', 'abc', { format: 'ean13' }));
    const bytes = new TextEncoder().encode('%PDF-1.4\n');
    const file = { name: 'sample.pdf', size: bytes.length, arrayBuffer: async () => bytes.buffer };
    const info = JSON.parse(await run('files-file-metadata-inspector', '', {}, file));
    assert.equal(info.size, bytes.length);
    assert.equal(info.signatureHint, 'PDF');
    assert.equal(info.extension, 'pdf');
});

test('email inspection decodes MIME and hashes exact attachment bytes without executing content', async () => {
    const raw =
        'From: Example <sender@example.test>\r\nTo: recipient@example.test\r\nSubject: =?UTF-8?B?SGVsbG8g8J+MjQ==?=\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="fixture"\r\n\r\n--fixture\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHello.\r\n--fixture\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="test.txt"\r\nContent-Transfer-Encoding: base64\r\n\r\nYWJj\r\n--fixture--\r\n';
    const email = JSON.parse(await run('email-email-inspector', raw));
    assert.equal(email.subject, 'Hello 🌍');
    assert.match(email.text, /Hello/);
    assert.equal(email.attachments[0].bytes, 3);
    const { createHash } = await import('node:crypto');
    assert.equal(email.attachments[0].sha256, createHash('sha256').update('abc').digest('hex'));
    const attachments = JSON.parse(
        await run('email-attachment-inspector', '', {}, new File([raw], 'message.eml')),
    );
    assert.equal(attachments.attachments[0].filename, 'test.txt');
    assert.equal(attachments.attachments[0].content, undefined);
    await assert.rejects(run('email-email-inspector', 'No email headers here'), /headers/);
});
test('email templates escape substitutions and cap expansion while previews preserve untrusted source', async () => {
    assert.equal(
        await run('email-email-template-tester', '<p>{{name}} {{missing}}</p>', {
            values: '{"name":"<Ada>"}',
        }),
        '<p>&lt;Ada&gt; {{missing}}</p>',
    );
    await assert.rejects(
        run('email-email-template-tester', '{{x}}'.repeat(100), {
            values: JSON.stringify({ x: 'a'.repeat(4096) }),
        }),
        /256 KiB/,
    );
    await assert.rejects(
        run('email-email-template-tester', '{{x}}', { values: '{"x":1}' }),
        /string values/,
    );
    const source = '<h1>Hello</h1><script>alert(1)</script>';
    assert.equal(await run('email-email-html-preview', source), source);
});

test('XML preserves mixed text spacing, comments, CDATA and explicit space preservation', async () => {
    const mixed = '<p>Hello <b>world</b>!</p>';
    assert.equal(await run('developer-xml-formatter', mixed), mixed);
    const preserved = '<root xml:space="preserve">  <child> data </child>  </root>';
    assert.equal(await run('developer-xml-formatter', preserved), preserved);
    const xml = await run('developer-xml-formatter', '<root><!--keep--><![CDATA[a < b]]></root>');
    assert.match(xml, /<!--keep-->/);
    assert.match(xml, /<!\[CDATA\[a < b\]\]>/);
});
test('environment serialization round-trips values containing all quote styles and backslashes', async () => {
    const original = { VALUE: 'single\' double" tick` slash\\ newline\nend' };
    const env = await run('developer-environment-variable-formatter', JSON.stringify(original), {
        mode: 'env',
    });
    assert.deepEqual(
        JSON.parse(await run('developer-environment-variable-formatter', env, { mode: 'json' })),
        original,
    );
});

test('webhook signatures verify each preset against independently generated HMACs', async () => {
    const { createHmac, createHash } = await import('node:crypto');
    const { verifyWebhookSignature } = await import('@socket-help/tools/webhooks');
    const now = Date.now(),
        timestamp = String(Math.floor(now / 1000)),
        secret = 'test-signing-secret';
    const body = new TextEncoder().encode('{"event":"created","webhookTimestamp":' + now + '}');
    const text = new TextDecoder().decode(body);
    const hmac = (
        content: string,
        algorithm = 'sha256',
        encoding: 'hex' | 'base64' = 'hex',
        key: string | Buffer = secret,
    ) => createHmac(algorithm, key).update(content).digest(encoding);
    const fixtures = [
        {
            provider: 'stripe',
            headers: {
                'stripe-signature': `t=${timestamp},v1=invalid,v1=${hmac(`${timestamp}.${text}`)}`,
            },
        },
        { provider: 'github', headers: { 'x-hub-signature-256': `sha256=${hmac(text)}` } },
        {
            provider: 'shopify',
            headers: { 'x-shopify-hmac-sha256': hmac(text, 'sha256', 'base64') },
        },
        {
            provider: 'slack',
            headers: {
                'x-slack-request-timestamp': timestamp,
                'x-slack-signature': `v0=${hmac(`v0:${timestamp}:${text}`)}`,
            },
        },
        {
            provider: 'paddle',
            headers: {
                'paddle-signature': `ts=${timestamp};h1=bad;h1=${hmac(`${timestamp}:${text}`)}`,
            },
        },
        { provider: 'linear', headers: { 'linear-signature': hmac(text) } },
    ] as const;
    for (const fixture of fixtures) {
        const result = await verifyWebhookSignature({ ...fixture, secret, body, now });
        assert.equal(result.valid, true, fixture.provider + ': ' + result.reason);
        assert.equal(
            (await verifyWebhookSignature({ ...fixture, secret: 'wrong', body, now })).valid,
            false,
        );
        assert.equal(
            (
                await verifyWebhookSignature({
                    ...fixture,
                    secret,
                    body: new TextEncoder().encode(text + ' '),
                    now,
                })
            ).valid,
            false,
        );
    }
    for (const provider of ['svix', 'dodo'] as const) {
        const key = Buffer.from('a deterministic binary signing secret');
        const header = `v1,wrong v1,${hmac(`msg_test.${timestamp}.${text}`, 'sha256', 'base64', key)}`;
        const result = await verifyWebhookSignature({
            provider,
            body,
            secret: 'whsec_' + key.toString('base64'),
            headers: {
                'webhook-id': 'msg_test',
                'webhook-timestamp': timestamp,
                'webhook-signature': header,
            },
            now,
        });
        assert.equal(result.valid, true, result.reason);
    }
    const svixVector = await verifyWebhookSignature({
        provider: 'svix',
        secret: 'whsec_plJ3nmyCDGBKInavdOK15jsl',
        body: new TextEncoder().encode('{"event_type":"ping","data":{"success":true}}'),
        headers: {
            'svix-id': 'msg_loFOjxBNrRLzqYUf',
            'svix-timestamp': '1731705121',
            'svix-signature': 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=',
        },
        now: 1731705121000,
    });
    assert.equal(svixVector.valid, true, svixVector.reason);
    const form = 'Body=hello&From=%2B12025550101&Tag=b&Tag=a',
        url = 'https://example.test/hooks/callback?b=2&a=%2F';
    const formSignature = hmac(url + 'BodyhelloFrom+12025550101TagaTagb', 'sha1', 'base64');
    assert.equal(
        (
            await verifyWebhookSignature({
                provider: 'twilio',
                secret,
                body: new TextEncoder().encode(form),
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'x-twilio-signature': formSignature,
                },
                url,
            })
        ).valid,
        true,
    );
    const jsonUrl = url + '&bodySHA256=' + createHash('sha256').update(body).digest('hex');
    const twilio = {
        provider: 'twilio' as const,
        secret,
        body,
        headers: {
            'content-type': 'application/json',
            'x-twilio-signature': hmac(jsonUrl, 'sha1', 'base64'),
        },
        url: jsonUrl,
    };
    assert.equal((await verifyWebhookSignature(twilio)).valid, true);
    assert.equal(
        (await verifyWebhookSignature({ ...twilio, url: url + '&bodySHA256=bad' })).valid,
        false,
    );
    for (const algorithm of ['SHA-256', 'SHA-1'] as const)
        for (const encoding of ['hex', 'base64'] as const) {
            assert.equal(
                (
                    await verifyWebhookSignature({
                        provider: 'custom',
                        secret,
                        body,
                        headers: {
                            'x-check': hmac(
                                text,
                                algorithm === 'SHA-1' ? 'sha1' : 'sha256',
                                encoding,
                            ),
                        },
                        headerName: 'x-check',
                        algorithm,
                        encoding,
                    })
                ).valid,
                true,
            );
        }
});

test('webhook signature failures explain stale timestamps, missing headers and exact-byte mismatches', async () => {
    const { createHmac } = await import('node:crypto');
    const { verifyWebhookSignature } = await import('@socket-help/tools/webhooks');
    const secret = 'fixture',
        body = new Uint8Array([0, 255, 128]),
        timestamp = '1731705121';
    const digest = createHmac('sha256', secret)
        .update(Buffer.concat([Buffer.from(timestamp + '.'), body]))
        .digest('hex');
    const base = {
        provider: 'stripe' as const,
        secret,
        body,
        headers: { 'stripe-signature': `t=${timestamp},v1=${digest}` },
    };
    assert.equal((await verifyWebhookSignature({ ...base, now: 1731705121000 })).valid, true);
    assert.match((await verifyWebhookSignature({ ...base, now: 1731705521000 })).reason, /outside/);
    assert.equal((await verifyWebhookSignature({ ...base, now: 1731704721000 })).valid, false);
    assert.match(
        (await verifyWebhookSignature({ ...base, headers: {}, now: 1731705121000 })).reason,
        /Missing/,
    );
    assert.equal(
        (
            await verifyWebhookSignature({
                ...base,
                body: new TextEncoder().encode('\u0000�'),
                now: 1731705121000,
            })
        ).valid,
        false,
    );
    assert.equal(
        (
            await verifyWebhookSignature({
                ...base,
                headers: { 'stripe-signature': `t=${timestamp},t=${timestamp},v1=${digest}` },
            })
        ).valid,
        false,
    );
    assert.equal(
        (await verifyWebhookSignature({ ...base, body: new Uint8Array(102401) })).valid,
        false,
    );
});

test('webhook body previews preserve duplicate fields, list multipart files and never render untrusted markup', async () => {
    const { parseWebhookBody } = await import('@socket-help/tools/webhooks');
    const bytes = (text: string) => new TextEncoder().encode(text);
    assert.deepEqual(
        (await parseWebhookBody(bytes('{"hello":"world"}'), 'application/vnd.test+json')).data,
        { hello: 'world' },
    );
    assert.deepEqual(
        (
            await parseWebhookBody(
                bytes('tag=a&tag=b&name=Alex+Example'),
                'application/x-www-form-urlencoded',
            )
        ).fields,
        [
            { name: 'tag', value: 'a' },
            { name: 'tag', value: 'b' },
            { name: 'name', value: 'Alex Example' },
        ],
    );
    const form = new FormData();
    form.append('label', 'test');
    form.append('file', new Blob([new Uint8Array([0, 255, 128])]), 'sample.bin');
    const request = new Request('https://example.test', { method: 'POST', body: form });
    const parsed = await parseWebhookBody(
        new Uint8Array(await request.arrayBuffer()),
        request.headers.get('content-type')!,
    );
    assert.deepEqual(
        parsed.parts?.map((part) => part.kind),
        ['field', 'file'],
    );
    assert.equal(parsed.parts?.[1]?.bytes, 3);
    assert.equal(
        (await parseWebhookBody(bytes('<event><name>created</name></event>'), 'application/xml'))
            .kind,
        'XML',
    );
    assert.equal(
        (
            await parseWebhookBody(
                bytes('<!DOCTYPE x [<!ENTITY x "unsafe">]><x>&x;</x>'),
                'application/xml',
            )
        ).kind,
        'Unparsed body',
    );
    assert.equal(
        (await parseWebhookBody(bytes('<script>alert(1)</script>'), 'text/html')).text,
        '<script>alert(1)</script>',
    );
    assert.equal(
        (await parseWebhookBody(new Uint8Array([0, 255, 128]), 'application/octet-stream')).hex,
        '00 ff 80',
    );
    assert.equal(
        (await parseWebhookBody(bytes('broken'), 'application/json')).kind,
        'Unparsed body',
    );
});
