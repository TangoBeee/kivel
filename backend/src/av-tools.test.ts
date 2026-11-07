import assert from 'node:assert/strict';
import test from 'node:test';
import { AvRunner } from '@kivel.io/tools/av';
import { buildApp } from './app.js';
import { ToolRunner } from '@kivel.io/tools/node';

test('audio/video tools produce playable files and metadata through the shared service', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const run = async (id: string, options = {}, file?: { name: string; base64: string }) => {
        const response = await app.inject({
            method: 'POST',
            url: `/api/tools/${id}/run`,
            payload: { options, ...(file ? { file } : {}) },
        });
        assert.equal(response.statusCode, 200, response.body);
        return JSON.parse(response.json().output);
    };
    const clip = await run('test-media-sample-video', { duration: '1', width: '160' }),
        file = { name: 'fixture.mp4', base64: clip.base64 };
    assert.equal(clip.mediaType, 'video/mp4');
    assert.equal(Buffer.from(clip.base64, 'base64').subarray(4, 8).toString(), 'ftyp');
    for (const id of [
        'everyday-video-compressor',
        'everyday-video-converter',
        'everyday-video-trimmer',
        'everyday-gif-maker',
        'everyday-audio-extractor',
        'everyday-audio-converter',
        'everyday-audio-trimmer',
    ]) {
        const result = await run(id, { duration: '0.5', width: '160' }, file);
        assert.ok(result.bytes > 100);
        assert.ok(result.bytes < 5 * 1024 * 1024);
        const metadata = await run(
            'everyday-media-metadata',
            {},
            { name: result.filename, base64: result.base64 },
        );
        assert.ok(metadata.durationSeconds > 0 && metadata.durationSeconds < 2);
        assert.ok(metadata.streams.length > 0);
    }
    for (const format of ['webm', 'wav', 'ogg']) {
        const result = await run(
            format === 'webm' ? 'everyday-video-converter' : 'everyday-audio-converter',
            { format },
            file,
        );
        const metadata = await run(
            'everyday-media-metadata',
            {},
            { name: result.filename, base64: result.base64 },
        );
        assert.ok(metadata.durationSeconds > 0);
    }
    const silent = await run('test-media-silent-video', { duration: '0.5', width: '160' });
    const metadata = await run(
        'everyday-media-metadata',
        {},
        { name: silent.filename, base64: silent.base64 },
    );
    assert.equal(
        metadata.streams.some((stream: { type: string }) => stream.type === 'audio'),
        false,
    );
    const fragmented = await run('test-media-media-stream-fixtures', {
        duration: '0.5',
        width: '160',
    });
    assert.ok(Buffer.from(fragmented.base64, 'base64').includes(Buffer.from('moof')));
    const before = (await app.inject('/api/usage')).json().runsToday;
    const invalid = await app.inject({
        method: 'POST',
        url: '/api/tools/everyday-audio-converter/run',
        payload: {
            file: {
                name: 'playlist.m3u8',
                base64: Buffer.from('#EXTM3U\nhttp://127.0.0.1/private').toString('base64'),
            },
        },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal((await app.inject('/api/usage')).json().runsToday, before);
});
test('media jobs enforce cancellation, concurrency, supported formats and cleanup', async () => {
    const runner = new AvRunner();
    try {
        const task = runner.run('test-media-sample-video', { duration: '3', width: '320' });
        await assert.rejects(runner.run('test-media-silent-video', {}), /busy/);
        await task;
        await assert.rejects(runner.run('test-media-sample-video', { duration: '121' }), /number/);
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(
            runner.run('test-media-sample-video', {}, undefined, controller.signal),
            /cancelled/,
        );
    } finally {
        runner.close();
    }
});
test('fixture and document engines preserve deterministic records and produce valid Office packages', async (t) => {
    const runner = new ToolRunner();
    t.after(() => runner.close());
    const json = await runner.run('databases-test-fixtures', '', { mode: 'products', count: '3' });
    assert.equal(JSON.parse(json).length, 3);
    assert.equal(
        await runner.run('databases-test-fixtures', '', { mode: 'products', count: '3' }),
        json,
    );
    const sql = await runner.run('databases-seed-data-generator', 'contacts', {
        format: 'sql',
        count: '2',
    });
    assert.match(sql, /INSERT INTO "contacts"/);
    await assert.rejects(
        runner.run('databases-seed-data-generator', 'contacts; DROP TABLE users', {
            format: 'sql',
        }),
    );
    const markdown = JSON.parse(
        await runner.run(
            'everyday-document-converter',
            '# Project notes\n\nSome **important** details.',
            { from: 'markdown', format: 'docx' },
        ),
    );
    assert.equal(markdown.previewText, 'Project notes\n\nSome important details.');
    const table = JSON.parse(
        await runner.run('everyday-document-converter', '| a | b |\n|---|---|\n| 1 | 2 |', {
            from: 'markdown',
            format: 'txt',
        }),
    );
    assert.ok(Buffer.from(table.base64, 'base64').toString().includes('| 1 | 2 |'));
    const doc = JSON.parse(
        await runner.run('everyday-document-converter', 'Hello <world> & café', {
            format: 'docx',
            from: 'text',
        }),
    );
    const bytes = Buffer.from(doc.base64, 'base64');
    assert.equal(bytes.subarray(0, 2).toString(), 'PK');
    assert.ok(bytes.includes(Buffer.from('word/document.xml')));
    assert.ok(bytes.includes(Buffer.from('Hello &lt;world&gt; &amp; café')));
    assert.equal(doc.previewText, 'Hello <world> & café');
});

test('offline MCP traces preserve ID types and verification inspection never fetches links', async (t) => {
    const runner = new ToolRunner();
    t.after(() => runner.close());
    const trace = JSON.parse(
        await runner.run(
            'agents-mcp-tool-call-inspector',
            JSON.stringify([
                {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/call',
                    params: { name: 'lookup', arguments: { id: '42' } },
                },
                { jsonrpc: '2.0', id: '1', result: {} },
                {
                    jsonrpc: '2.0',
                    id: 1,
                    result: { isError: true, content: [{ type: 'text', text: 'Test failure' }] },
                },
                { jsonrpc: '2.0', method: 'notifications/initialized' },
            ]),
        ),
    );
    assert.equal(trace.calls[0].status, 'Tool error');
    assert.equal(trace.calls[1].status, 'Notification');
    assert.equal(trace.warnings.length, 1);
    await assert.rejects(runner.run('agents-mcp-tool-call-inspector', '[{"id":1}]'));
    const eml =
        'From: test@example.test\r\nTo: recipient@example.test\r\nSubject: Verify\r\nContent-Type: text/plain\r\n\r\nYour code is 123456. Open https://example.test/verify?code=test';
    const verification = JSON.parse(await runner.run('email-email-verification-tester', eml));
    assert.deepEqual(verification.codes, ['123456']);
    assert.equal(verification.links[0].url, 'https://example.test/verify?code=test');
});
