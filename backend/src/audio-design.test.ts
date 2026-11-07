import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultRecipe, renderAudio, validateRecipe, musicTracks } from '@kivel/tools/audio';
import { designImage } from '@kivel/tools/image-design';
import { ToolRunner } from '@kivel/tools/node';
import { buildApp } from './app.js';
import { runMedia } from '@kivel/tools/media-engine';

test('custom audio is deterministic, stereo, bounded and changes with editable tracks', () => {
    const recipe = { ...defaultRecipe(), bars: 1 as number },
        a = JSON.parse(renderAudio(recipe)),
        bytes = Buffer.from(a.base64, 'base64');
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(bytes.readUInt16LE(22), 2);
    assert.equal(bytes.readUInt32LE(24), 44100);
    assert.equal(bytes.readUInt16LE(34), 16);
    assert.equal(a.base64, JSON.parse(renderAudio(recipe)).base64);
    assert.ok(a.audio.duration > 3);
    assert.ok(a.audio.peak <= 0.88);
    const quiet = JSON.parse(
        renderAudio({ ...recipe, levels: { melody: 0, bass: 0, drums: 0, pad: 0 } }),
    );
    assert.ok(
        Buffer.from(quiet.base64, 'base64')
            .subarray(44)
            .every((byte) => byte === 0),
    );
    const changed = JSON.parse(
        renderAudio({ ...recipe, melody: recipe.melody.map((n) => (n === null ? null : n + 2)) }),
    );
    assert.notEqual(changed.base64, a.base64);
    assert.throws(() => validateRecipe({ ...recipe, bpm: 0 }));
    assert.throws(() => validateRecipe({ ...recipe, bpm: 55, bars: 8 }), /29 seconds/);
    assert.throws(() => validateRecipe({ ...recipe, melody: [999] }));
    assert.throws(() => validateRecipe({ ...recipe, reverb: Infinity }));
});
test('music library has real byte-range playback, stable licensing metadata and conditional downloads', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const listing = (await app.inject('/api/music')).json();
    assert.equal(listing.license, 'CC0-1.0');
    assert.equal(listing.tracks.length, 6);
    const path = listing.tracks[0].loopUrl;
    const first = await app.inject({ url: path, headers: { range: 'bytes=0-43' } });
    assert.equal(first.statusCode, 206);
    assert.equal(first.rawPayload.length, 44);
    assert.equal(first.rawPayload.subarray(0, 4).toString(), 'RIFF');
    assert.match(String(first.headers['content-range']), /^bytes 0-43\//);
    assert.equal(first.headers['accept-ranges'], 'bytes');
    const etag = String(first.headers.etag);
    assert.equal(
        (await app.inject({ url: path, headers: { 'if-none-match': etag } })).statusCode,
        304,
    );
    const tail = await app.inject({ url: path, headers: { range: 'bytes=-32' } });
    assert.equal(tail.statusCode, 206);
    assert.equal(tail.rawPayload.length, 32);
    for (const range of ['bytes=999999999-', 'bytes=-0', 'bytes=5-2', 'bytes=0-1,3-4', 'bytes='])
        assert.equal((await app.inject({ url: path, headers: { range } })).statusCode, 416, range);
    const head = await app.inject({ method: 'HEAD', url: path + '?download=1' });
    assert.equal(head.statusCode, 200);
    assert.equal(head.rawPayload.length, 0);
    assert.match(String(head.headers['content-disposition']), /attachment/);
    assert.equal((await app.inject('/api/music/not-a-track/audio.wav')).statusCode, 404);
    const mp3 = await app.inject({
        url: listing.tracks[0].audioUrl,
        headers: { range: 'bytes=0-127' },
    });
    assert.equal(mp3.statusCode, 206);
    assert.equal(mp3.headers['content-type'], 'audio/mpeg');
    assert.equal(mp3.rawPayload.subarray(0, 3).toString(), 'ID3');
    const exportTrack = await app.inject({
        method: 'POST',
        url: '/api/tools/test-media-music-library/run',
        payload: { options: { format: 'mp3', mode: musicTracks[0].id } },
    });
    assert.equal(exportTrack.statusCode, 200, exportTrack.body);
    const exported = JSON.parse(exportTrack.json().output);
    assert.equal(exported.license, 'CC0-1.0');
    assert.ok(exported.track.duration > 90);
    assert.equal(exported.mediaType, 'audio/mpeg');
    assert.equal((await app.inject('/api/usage')).json().runsToday, 1);
});
test('all music presets can be rendered by the same hosted engine within its worker limit', async (t) => {
    const runner = new ToolRunner();
    t.after(() => runner.close());
    for (const track of musicTracks) {
        const artifact = JSON.parse(
            await runner.run('test-media-music-library', '', { mode: track.id }),
        );
        assert.ok(artifact.bytes < 5 * 1048576);
        assert.equal(artifact.recipe.voice, track.voice);
    }
});
test('image artwork and avatars preserve dimensions, escape captions and support real PNG exports', async (t) => {
    const runner = new ToolRunner();
    t.after(() => runner.close());
    const first = designImage('test-media-placeholder-images', 'A <title> & label', {
        style: 'landscape',
        width: '1200',
        height: '630',
        seed: '41',
    });
    assert.ok(first.svg.includes('A &lt;title&gt; &amp; label'));
    assert.ok(first.svg.includes('viewBox="0 0 1200 630"'));
    assert.equal(
        first.svg,
        designImage('test-media-placeholder-images', 'A <title> & label', {
            style: 'landscape',
            width: '1200',
            height: '630',
            seed: '41',
        }).svg,
    );
    assert.notEqual(
        first.svg,
        designImage('test-media-placeholder-images', 'A <title> & label', {
            style: 'landscape',
            seed: '42',
        }).svg,
    );
    for (const style of ['initials', 'identicon', 'orbit', 'bot']) {
        const result = JSON.parse(
            await runner.run('test-media-sample-avatars', 'Ada', {
                style,
                format: 'png',
                width: '128',
                mode: 'circle',
            }),
        );
        const image = JSON.parse(
            await runMedia(
                'everyday-image-metadata',
                {},
                { name: result.filename, bytes: Buffer.from(result.base64, 'base64') },
            ),
        );
        assert.equal(image.width, 128);
        assert.equal(image.height, 128);
        assert.equal(image.format, 'png');
    }
    const banner = JSON.parse(
        await runner.run('test-media-placeholder-images', 'My banner', {
            format: 'png',
            width: '1200',
            height: '630',
        }),
    );
    const meta = JSON.parse(
        await runMedia(
            'everyday-image-metadata',
            {},
            { name: banner.filename, bytes: Buffer.from(banner.base64, 'base64') },
        ),
    );
    assert.equal(meta.width, 1200);
    assert.equal(meta.height, 630);
    assert.throws(() =>
        designImage('test-media-placeholder-images', '', {
            background: 'url(https://example.com)',
        }),
    );
    assert.throws(() => designImage('test-media-sample-avatars', '', { width: '4096' }));
});

test('tool descriptors expose actionable options through HTTP, SDK, CLI and MCP', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const detail = (await app.inject('/api/tools/test-media-placeholder-images')).json();
    assert.ok(detail.guide.options.some((option: { key: string }) => option.key === 'format'));
    assert.ok(detail.guide.steps.length >= 3);
    const rpc = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { accept: 'application/json, text/event-stream' },
        payload: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'describe_tool', arguments: { toolId: 'test-media-audio-composer' } },
        },
    });
    assert.equal(rpc.json().result.isError, false);
    const descriptor = JSON.parse(rpc.json().result.content[0].text);
    assert.ok(descriptor.guide.inputExample.includes('melody'));
    const { Kivel } = await import('@kivel/sdk'),
        { command } = await import('@kivel/cli');
    const client = new Kivel({
        baseUrl: 'http://localhost:3000',
        fetch: async (url, options) => {
            const value = await app.inject({ method: 'GET', url: new URL(String(url)).pathname });
            return new Response(value.body, {
                status: value.statusCode,
                headers: { 'content-type': 'application/json' },
            });
        },
    });
    assert.equal((await client.tool('test-media-music-library')).id, 'test-media-music-library');
    assert.equal(
        ((await command(client, ['describe', 'test-media-placeholder-images'])) as any).id,
        'test-media-placeholder-images',
    );
});
