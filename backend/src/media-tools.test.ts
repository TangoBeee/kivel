import assert from 'node:assert/strict';
import test from 'node:test';
import { samplePdf } from '@kivel/tools/artifacts';
import { runMedia } from '@kivel/tools/media-engine';
import { mediaOperations } from '@kivel/tools/media-definitions';
import { ToolRunner } from '@kivel/tools/node';
import { buildApp } from './app.js';
const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVQImWP4z8DAwPAfAAcAAf/89wURAAAAAElFTkSuQmCC',
    'base64',
);
const file = { name: 'fixture.png', bytes: png };
const jpeg = Buffer.from(
    '/9j/4QDQRXhpZgAASUkqAAgAAAAHABIBAwABAAAAAQAAABoBBQABAAAAYgAAABsBBQABAAAAagAAACgBAwABAAAAAgAAADsBAgAIAAAAcgAAABMCAwABAAAAAQAAAGmHBAABAAAAegAAAAAAAAA4YwAA6AMAADhjAADoAwAARml4dHVyZQAGAACQBwAEAAAAMDIxMAGRBwAEAAAAAQIDAACgBwAEAAAAMDEwMAGgAwABAAAA//8AAAKgBAABAAAAAgAAAAOgBAABAAAAAQAAAAAAAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAbEAEAAAcAAAAAAAAAAAAAAAAAAQIEBTRzsf/EABUBAQEAAAAAAAAAAAAAAAAAAAQI/8QAHBEAAAYDAAAAAAAAAAAAAAAAAAEDNHKxAgQF/9oADAMBAAIRAxEAPwCB3DPqds3YgKF5zRKONEBb7pWR2Y//2Q==',
    'base64',
);

test('image tools create decodable artifacts and exact crops, palettes, rotations and sizes', async () => {
    for (const id of [
        'everyday-image-compressor',
        'everyday-image-converter',
        'everyday-image-resizer',
        'everyday-simple-image-editor',
    ] as const) {
        const result = JSON.parse(
            await runMedia(id, { format: 'png', width: '1', height: '1', rotation: '90' }, file),
        );
        const value = JSON.parse(
            await runMedia(
                'everyday-image-metadata',
                {},
                { name: result.filename, bytes: Buffer.from(result.base64, 'base64') },
            ),
        );
        assert.equal(value.format, 'png');
        assert.equal(
            value.width,
            id === 'everyday-image-resizer' || id === 'everyday-simple-image-editor' ? 1 : 2,
        );
        assert.equal(value.height, id === 'everyday-simple-image-editor' ? 2 : 1);
        assert.equal(value.embeddedMetadata.exif, false);
    }
    const result = JSON.parse(
        await runMedia(
            'everyday-image-cropper',
            { format: 'png', x: '1', y: '0', width: '1', height: '1' },
            file,
        ),
    );
    const palette = JSON.parse(
        await runMedia(
            'everyday-color-extractor',
            {},
            { name: result.filename, bytes: Buffer.from(result.base64, 'base64') },
        ),
    );
    assert.deepEqual(palette.colors, [{ hex: '#0000ff', percentage: 100 }]);
    assert.equal(mediaOperations['everyday-image-metadata'].preview, undefined);
    assert.equal(mediaOperations['everyday-color-extractor'].preview, undefined);
});
test('EXIF removal drops embedded metadata and rejects unsupported and invalid image inputs', async () => {
    assert.equal(
        JSON.parse(
            await runMedia('everyday-image-metadata', {}, { name: 'fixture.jpg', bytes: jpeg }),
        ).embeddedMetadata.exif,
        true,
    );
    const result = JSON.parse(
        await runMedia(
            'everyday-exif-remover',
            { format: 'jpeg' },
            { name: 'fixture.jpg', bytes: jpeg },
        ),
    );
    const cleaned = JSON.parse(
        await runMedia(
            'everyday-image-metadata',
            {},
            { name: result.filename, bytes: Buffer.from(result.base64, 'base64') },
        ),
    );
    assert.deepEqual(cleaned.embeddedMetadata, {
        exif: false,
        xmp: false,
        iptc: false,
        icc: false,
    });
    await assert.rejects(
        runMedia(
            'everyday-image-converter',
            {},
            {
                name: 'unsafe.svg',
                bytes: Buffer.from(
                    '<svg xmlns="http://www.w3.org/2000/svg"><image href="http://127.0.0.1/"/></svg>',
                ),
            },
        ),
        /raster image/,
    );
    await assert.rejects(
        runMedia('everyday-image-cropper', { width: '3', height: '1' }, file),
        /fit inside/,
    );
    await assert.rejects(
        runMedia('everyday-image-converter', { format: 'exe' }, file),
        /supported value/,
    );
    await assert.rejects(runMedia('everyday-image-converter', { quality: '101' }, file), /integer/);
});
test('image tools run through the isolated processor and enforce hosted API file limits', async (t) => {
    const runner = new ToolRunner();
    t.after(() => runner.close());
    const result = JSON.parse(
        await runner.run('everyday-image-converter', '', { format: 'png' }, file),
    );
    assert.equal(result.mediaType, 'image/png');
    const app = buildApp();
    t.after(() => app.close());
    const response = await app.inject({
        method: 'POST',
        url: '/api/tools/everyday-image-cropper/run',
        payload: {
            options: { x: '1', width: '1', height: '1', format: 'png' },
            file: { name: file.name, base64: png.toString('base64') },
        },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.json().output).mediaType, 'image/png');
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/tools/everyday-image-converter/run',
                payload: {
                    file: {
                        name: 'large.png',
                        base64: Buffer.alloc(10 * 1048576 + 1).toString('base64'),
                    },
                },
            })
        ).statusCode,
        400,
    );
});

test('PDF page tools extract selections, enforce complete reorderings, and keep optimization bounded', async (t) => {
    const runner = new ToolRunner();
    t.after(() => runner.close());
    const source = { name: 'fixture.pdf', bytes: samplePdf('Fixture', 3) };
    const split = JSON.parse(await runner.run('everyday-split-pdf', '', { pages: '1,3' }, source));
    assert.equal(split.mediaType, 'application/pdf');
    assert.equal(Buffer.from(split.base64, 'base64').subarray(0, 5).toString(), '%PDF-');
    const reordered = JSON.parse(
        await runner.run('everyday-reorder-pdf-pages', '', { pages: '3,2,1' }, source),
    );
    assert.equal(reordered.kind, 'file');
    const optimized = JSON.parse(await runner.run('everyday-compress-pdf', '', {}, source));
    assert.ok(optimized.bytes <= source.bytes.length);
    await assert.rejects(
        runner.run('everyday-split-pdf', '', { pages: '4' }, source),
        /from 1 to 3/,
    );
    await assert.rejects(
        runner.run('everyday-reorder-pdf-pages', '', { pages: '2,1' }, source),
        /every page/,
    );
    await assert.rejects(
        runner.run('everyday-reorder-pdf-pages', '', { pages: '1,1,2' }, source),
        /only once/,
    );
    await assert.rejects(
        runner.run('everyday-split-pdf', '', { pages: '1' }, file),
        /Choose a PDF/,
    );
});

test('PDF merge, image-to-PDF, text extraction and rendering work through bounded workers', async (t) => {
    const runner = new ToolRunner();
    t.after(() => runner.close());
    const a = { name: 'a.pdf', bytes: samplePdf('First document', 2) },
        b = { name: 'b.pdf', bytes: samplePdf('Second document', 1) };
    const merged = JSON.parse(await runner.run('everyday-merge-pdfs', '', {}, [a, b]));
    const mergedFile = { name: merged.filename, bytes: Buffer.from(merged.base64, 'base64') };
    const text = await runner.run('everyday-extract-pdf-text', '', {}, mergedFile);
    assert.match(text, /First document/);
    assert.match(text, /Second document/);
    assert.ok(text.indexOf('First document') < text.indexOf('Second document'));
    assert.match(text, /--- Page 3 ---/);
    const images = JSON.parse(await runner.run('everyday-image-to-pdf', '', {}, [file, file]));
    assert.equal(images.mediaType, 'application/pdf');
    const rendered = JSON.parse(
        await runner.run(
            'everyday-pdf-to-image',
            '',
            { page: '1', width: '320', format: 'png' },
            a,
        ),
    );
    const meta = JSON.parse(
        await runner.run(
            'everyday-image-metadata',
            '',
            {},
            { name: rendered.filename, bytes: Buffer.from(rendered.base64, 'base64') },
        ),
    );
    assert.equal(meta.width, 320);
    assert.equal(meta.format, 'png');
    await assert.rejects(runner.run('everyday-pdf-to-image', '', { page: '3' }, a), /from 1 to 2/);
    await assert.rejects(runner.run('everyday-merge-pdfs', '', {}, [a]), /at least two/);
});
test('multi-file API requests share one combined allowance and are restricted to supported tools', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const payload = {
        file: [
            { name: 'one.pdf', base64: Buffer.from(samplePdf('One', 1)).toString('base64') },
            { name: 'two.pdf', base64: Buffer.from(samplePdf('Two', 1)).toString('base64') },
        ],
    };
    const merged = await app.inject({
        method: 'POST',
        url: '/api/tools/everyday-merge-pdfs/run',
        payload,
    });
    assert.equal(merged.statusCode, 200);
    assert.equal(JSON.parse(merged.json().output).filename, 'merged.pdf');
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/tools/everyday-image-metadata/run',
                payload,
            })
        ).statusCode,
        400,
    );
    const large = {
        file: Array.from({ length: 2 }, (_, i) => ({
            name: `file-${i}.pdf`,
            base64: Buffer.alloc(6 * 1048576).toString('base64'),
        })),
    };
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/tools/everyday-merge-pdfs/run',
                payload: large,
            })
        ).statusCode,
        413,
    );
});

test('file processing uses the file allowance rather than the text quota and accepts ordinary photo dimensions', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const checksum = await app.inject({
        method: 'POST',
        url: '/api/tools/everyday-file-checksums/run',
        payload: { file: { name: 'fixture.bin', base64: Buffer.alloc(70000).toString('base64') } },
    });
    assert.equal(checksum.statusCode, 200);
    const { createRequire } = await import('node:module');
    const sharp = createRequire(import.meta.resolve('@kivel/tools/media-engine'))('sharp');
    const photo = await sharp({
        create: { width: 4000, height: 3000, channels: 3, background: '#386b50' },
    })
        .jpeg()
        .toBuffer();
    const runner = new ToolRunner(1, 2, 5000);
    t.after(() => runner.close());
    const result = JSON.parse(
        await runner.run(
            'everyday-image-resizer',
            '',
            { width: '1000', height: '1000', format: 'jpeg' },
            { name: 'photo.jpg', bytes: photo },
        ),
    );
    const metadata = await sharp(Buffer.from(result.base64, 'base64')).metadata();
    assert.equal(metadata.width, 1000);
    assert.equal(metadata.height, 750);
});

test('hosted request admission is bounded and releases capacity after responses', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
            app.inject({
                method: 'POST',
                url: '/api/tools/uuid/run',
                payload: { options: { count: '100' } },
            }),
        ),
    );
    assert.deepEqual(
        responses.map((response) => response.statusCode).sort(),
        [200, 200, 200, 200, 503],
    );
    assert.equal(
        responses.find((response) => response.statusCode === 503)!.headers['retry-after'],
        '2',
    );
    assert.equal(
        (await app.inject({ method: 'POST', url: '/api/tools/uuid/run', payload: {} })).statusCode,
        200,
    );
});
