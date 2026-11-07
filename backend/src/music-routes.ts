import { readMusicTrack } from './music-assets.js';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { ToolRunner } from '@socket-help/tools/node';
import { musicTracks } from '@socket-help/tools/audio';
export function registerMusic(app: FastifyInstance, frontendDir?: string) {
    const runner = new ToolRunner(1, 4, 6000),
        cache = new Map<string, { bytes: Buffer; etag: string }>(),
        pending = new Map<string, Promise<{ bytes: Buffer; etag: string }>>();
    app.addHook('onClose', () => runner.close());
    const load = (id: string, format: 'wav' | 'mp3') => {
        const key = `${id}:${format}`;
        const saved = cache.get(key);
        if (saved) {
            cache.delete(key);
            cache.set(key, saved);
            return Promise.resolve(saved);
        }
        const task = pending.get(key);
        if (task) return task;
        const next = (
            format === 'mp3'
                ? readMusicTrack(id, frontendDir)
                : runner
                      .run('test-media-music-library', '', { mode: id })
                      .then((output) => Buffer.from(JSON.parse(output).base64, 'base64'))
        )
            .then((bytes) => {
                const value = {
                    bytes,
                    etag: `"${createHash('sha256').update(bytes).digest('hex')}"`,
                };
                while (cache.size >= 3) cache.delete(cache.keys().next().value!);
                cache.set(key, value);
                return value;
            })
            .finally(() => pending.delete(key));
        pending.set(key, next);
        return next;
    };
    app.get('/api/music', async () => ({
        license: 'CC0-1.0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        origin: 'Original Kivel procedural compositions and synthesized recordings. No third-party samples.',
        tracks: musicTracks.map((t) => ({
            ...t,
            durationSeconds: (48 * 240) / t.bpm,
            loopDurationSeconds: (8 * 240) / t.bpm,
            audioUrl: `/api/music/${t.id}/audio.mp3`,
            loopUrl: `/api/music/${t.id}/audio.wav`,
            downloadUrl: `/api/music/${t.id}/audio.mp3?download=1`,
        })),
    }));
    for (const format of ['wav', 'mp3'] as const)
        app.get<{ Params: { id: string }; Querystring: { download?: string } }>(
            `/api/music/:id/audio.${format}`,
            { exposeHeadRoute: true },
            async (request, reply) => {
                if (!musicTracks.some((t) => t.id === request.params.id))
                    return reply.code(404).send({ error: 'Music track not found.' });
                let rendered;
                try {
                    rendered = await load(request.params.id, format);
                } catch {
                    return reply.header('Retry-After', '2').code(503).send({
                        error: 'The music renderer is busy or unavailable. Try again shortly.',
                    });
                }
                const { bytes, etag } = rendered;
                reply
                    .header('ETag', etag)
                    .header('Cache-Control', 'public, max-age=3600')
                    .header('Accept-Ranges', 'bytes')
                    .header(
                        'Content-Disposition',
                        `${request.query.download === '1' ? 'attachment' : 'inline'}; filename="${request.params.id}.${format}"`,
                    )
                    .type(format === 'mp3' ? 'audio/mpeg' : 'audio/wav');
                if (
                    request.headers['if-none-match']
                        ?.split(',')
                        .map((x) => x.trim().replace(/^W\//, ''))
                        .includes(etag)
                )
                    return reply.code(304).send();
                const range = request.headers.range;
                if (
                    range &&
                    (!request.headers['if-range'] || request.headers['if-range'] === etag)
                ) {
                    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
                    if (!match || (!match[1] && !match[2]))
                        return reply
                            .header('Content-Range', `bytes */${bytes.length}`)
                            .code(416)
                            .send();
                    const start = match[1]
                            ? Number(match[1])
                            : Math.max(0, bytes.length - Number(match[2])),
                        end = match[1]
                            ? match[2]
                                ? Math.min(Number(match[2]), bytes.length - 1)
                                : bytes.length - 1
                            : bytes.length - 1;
                    if (
                        !Number.isSafeInteger(start) ||
                        !Number.isSafeInteger(end) ||
                        start < 0 ||
                        start >= bytes.length ||
                        end < start
                    )
                        return reply
                            .header('Content-Range', `bytes */${bytes.length}`)
                            .code(416)
                            .send();
                    return reply
                        .header('Content-Range', `bytes ${start}-${end}/${bytes.length}`)
                        .header('Content-Length', end - start + 1)
                        .code(206)
                        .send(bytes.subarray(start, end + 1));
                }
                return reply.header('Content-Length', bytes.length).send(bytes);
            },
        );
}
