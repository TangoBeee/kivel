import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { artifact } from './artifacts.js';
import { avOperations } from './av-definitions.js';
import type { AvOperationId } from './av-definitions.js';
import type { OperationOptions } from './definitions.js';
import { ToolExecutionError } from './node-runner.js';
import { MEDIA_INPUT_BYTES, GENERATED_FILE_BYTES } from './media-limits.js';
const allowedFormats = 'mov,matroska,webm,avi,wav,mp3,ogg,flac,aac,gif';
const inputArgs = [
    '-protocol_whitelist',
    'file',
    '-format_whitelist',
    allowedFormats,
    '-probesize',
    '5242880',
    '-analyzeduration',
    '2000000',
    '-threads',
    '1',
];
function number(
    field: string,
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
) {
    const result = value === undefined ? fallback : Number(value);
    if (
        (value !== undefined && !value.trim()) ||
        !Number.isFinite(result) ||
        result < min ||
        result > max
    )
        throw new ToolExecutionError(`${field} must be a number from ${min} to ${max}.`);
    return result;
}
export class AvRunner {
    private active = new Set<AbortController>();
    private closed = false;
    private completions = new Set<Promise<void>>();
    close() {
        this.closed = true;
        for (const controller of this.active) controller.abort();
        return Promise.all([...this.completions]);
    }
    async run(
        id: AvOperationId,
        options: OperationOptions,
        file?: { name: string; bytes: Uint8Array } | { name: string; bytes: Uint8Array }[],
        signal?: AbortSignal,
    ) {
        if (this.closed || this.active.size)
            throw new ToolExecutionError('The media processor is busy. Try again shortly.', 'busy');
        if (signal?.aborted) throw new ToolExecutionError('Request cancelled.', 'cancelled');
        const controller = new AbortController(),
            abort = () => controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        this.active.add(controller);
        let finish!: () => void;
        const completion = new Promise<void>((resolve) => {
            finish = resolve;
        });
        this.completions.add(completion);
        const timer = setTimeout(abort, 20000);
        let directory: string | undefined;
        try {
            const definition = avOperations[id];
            for (const field of definition.fields ?? [])
                if (
                    field.choices &&
                    options[field.key] !== undefined &&
                    !field.choices.some(([v]) => v === options[field.key])
                )
                    throw new ToolExecutionError(`Choose a supported value for ${field.label}.`);
            if (
                definition.file &&
                (Array.isArray(file) ||
                    !file?.bytes.length ||
                    file.bytes.length > MEDIA_INPUT_BYTES)
            )
                throw new ToolExecutionError('Choose one audio or video file up to 10 MiB.');
            directory = await mkdtemp(join(tmpdir(), 'socket-media-'));
            const source = join(directory, 'input');
            const args: string[] = [
                '-hide_banner',
                '-loglevel',
                'error',
                '-nostdin',
                '-y',
                '-max_alloc',
                '67108864',
                '-filter_threads',
                '1',
                '-filter_complex_threads',
                '1',
            ];
            const generated = !definition.file;
            let metadata: {
                format?: {
                    format_name?: string;
                    duration?: string;
                    size?: string;
                    bit_rate?: string;
                };
                streams?: {
                    codec_type?: string;
                    codec_name?: string;
                    width?: number;
                    height?: number;
                    duration?: string;
                    sample_rate?: string;
                    channels?: number;
                    avg_frame_rate?: string;
                }[];
            } = {};
            if (!generated && file && !Array.isArray(file)) {
                await writeFile(source, file.bytes, { mode: 0o600 });
                const probe = await this.process(
                    'ffprobe',
                    [
                        '-v',
                        'error',
                        '-max_alloc',
                        '67108864',
                        ...inputArgs,
                        '-show_format',
                        '-show_streams',
                        '-of',
                        'json',
                        source,
                    ],
                    controller.signal,
                );
                metadata = JSON.parse(probe);
                const seconds = Number(metadata.format?.duration);
                if (
                    !Number.isFinite(seconds) ||
                    seconds <= 0 ||
                    seconds > 120 ||
                    !metadata.streams?.length ||
                    metadata.streams.length > 8
                )
                    throw new ToolExecutionError(
                        'Use media with a known duration of up to 120 seconds and at most eight streams.',
                    );
                if (
                    metadata.streams.some(
                        (s) =>
                            (s.width ?? 0) * (s.height ?? 0) > 1920 * 1080 ||
                            (s.width ?? 0) > 1920 ||
                            (s.height ?? 0) > 1920,
                    )
                )
                    throw new ToolExecutionError('Source video is limited to 1920 × 1080 pixels.');
                if (id === 'everyday-media-metadata')
                    return JSON.stringify(
                        {
                            filename: file.name,
                            bytes: file.bytes.length,
                            container: metadata.format?.format_name,
                            durationSeconds: seconds,
                            bitrate: Number(metadata.format?.bit_rate) || null,
                            streams: metadata.streams.map((s) => ({
                                type: s.codec_type,
                                codec: s.codec_name,
                                width: s.width,
                                height: s.height,
                                channels: s.channels,
                                sampleRate: s.sample_rate,
                                frameRate: s.avg_frame_rate,
                            })),
                            note: 'Container and codec metadata only; no remote content was fetched.',
                        },
                        null,
                        2,
                    );
            }
            const audio = id.includes('audio-'),
                gif = id === 'everyday-gif-maker';
            const start = number('start', options.start, 0, 0, 120),
                duration = number(
                    'duration',
                    options.duration,
                    generated ? 3 : gif ? 3 : 120,
                    0.1,
                    generated || gif ? 10 : 120,
                );
            const width = number('width', options.width, gif ? 320 : 640, 64, gif ? 640 : 1280);
            if (!Number.isInteger(width))
                throw new ToolExecutionError('width must be a whole number of pixels.');
            const video = metadata.streams?.some((s) => s.codec_type === 'video'),
                hasAudio = metadata.streams?.some((s) => s.codec_type === 'audio');
            if (!generated && (audio ? !hasAudio : !video))
                throw new ToolExecutionError(
                    audio ? 'This file has no audio track.' : 'This file has no video track.',
                );
            if (!generated && start >= Number(metadata.format?.duration))
                throw new ToolExecutionError('Start time must be before the end of the file.');
            const format = audio
                ? (options.format ?? 'mp3')
                : gif
                  ? 'gif'
                  : id === 'everyday-video-converter'
                    ? (options.format ?? 'mp4')
                    : 'mp4';
            if (!(audio ? ['mp3', 'wav', 'ogg'] : ['mp4', 'webm', 'gif']).includes(format))
                throw new ToolExecutionError('Choose a supported output format.');
            if (generated) {
                args.push(
                    '-f',
                    'lavfi',
                    '-i',
                    `testsrc2=size=${width}x${Math.max(2, Math.floor((width * 9) / 16 / 2) * 2)}:rate=24:duration=${duration}`,
                );
                if (id === 'test-media-sample-video' && (options.mode ?? 'tone') === 'tone')
                    args.push(
                        '-f',
                        'lavfi',
                        '-i',
                        `sine=frequency=440:sample_rate=44100:duration=${duration}`,
                    );
            } else args.push(...inputArgs, '-ss', String(start), '-i', source);
            args.push(
                '-t',
                String(duration),
                '-map_metadata',
                '-1',
                '-map_chapters',
                '-1',
                '-threads',
                '1',
            );
            if (audio) {
                args.push(
                    '-map',
                    '0:a:0',
                    '-vn',
                    '-ac',
                    '2',
                    '-ar',
                    format === 'ogg' ? '48000' : '44100',
                    '-c:a',
                    format === 'mp3' ? 'libmp3lame' : format === 'wav' ? 'pcm_s16le' : 'libopus',
                );
                if (format !== 'wav') args.push('-b:a', '128k');
            } else if (gif)
                args.push(
                    '-map',
                    '0:v:0',
                    '-an',
                    '-vf',
                    `fps=10,scale=${width}:-1:flags=lanczos`,
                    '-loop',
                    '0',
                );
            else {
                args.push(
                    '-map',
                    '0:v:0',
                    '-map',
                    generated &&
                        id === 'test-media-sample-video' &&
                        (options.mode ?? 'tone') === 'tone'
                        ? '1:a:0'
                        : '0:a:0?',
                    '-vf',
                    `scale=w='min(${width},iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
                    '-r',
                    '24',
                    '-c:v',
                    format === 'mp4' ? 'libx264' : 'libvpx-vp9',
                    '-pix_fmt',
                    'yuv420p',
                );
                if (format === 'mp4')
                    args.push(
                        '-preset',
                        'ultrafast',
                        '-crf',
                        String(number('quality', options.quality, 28, 18, 40)),
                        '-movflags',
                        id === 'test-media-media-stream-fixtures'
                            ? '+frag_keyframe+empty_moov+default_base_moof'
                            : '+faststart',
                    );
                else args.push('-deadline', 'realtime', '-cpu-used', '8', '-b:v', '600k');
                args.push('-c:a', format === 'mp4' ? 'aac' : 'libopus', '-b:a', '96k');
            }
            const target = join(directory, `output.${format}`);
            args.push('-fs', String(GENERATED_FILE_BYTES + 65536), target);
            await this.process('ffmpeg', args, controller.signal);
            if ((await stat(target)).size > GENERATED_FILE_BYTES)
                throw new ToolExecutionError(
                    'Output exceeds 5 MiB. Choose a shorter duration or smaller dimensions.',
                );
            const bytes = await readFile(target);
            return artifact(
                `kivel.${format}`,
                (
                    {
                        mp4: 'video/mp4',
                        webm: 'video/webm',
                        gif: 'image/gif',
                        mp3: 'audio/mpeg',
                        wav: 'audio/wav',
                        ogg: 'audio/ogg',
                    } as Record<string, string>
                )[format]!,
                bytes,
            );
        } catch (error) {
            if (controller.signal.aborted)
                throw new ToolExecutionError(
                    signal?.aborted
                        ? 'Request cancelled.'
                        : 'Media processing exceeded 20 seconds.',
                    signal?.aborted ? 'cancelled' : 'timeout',
                );
            throw error;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            try {
                if (directory) await rm(directory, { recursive: true, force: true });
            } finally {
                this.active.delete(controller);
                this.completions.delete(completion);
                finish();
            }
        }
    }
    private process(program: string, args: string[], signal: AbortSignal): Promise<string> {
        return new Promise((resolve, reject) => {
            const child = spawn(program, args, {
                signal,
                killSignal: 'SIGKILL',
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { PATH: process.env.PATH, LANG: 'C' },
            });
            let output = '',
                size = 0,
                spawnError: Error | undefined;
            child.stdout.on('data', (chunk: Buffer) => {
                size += chunk.length;
                if (size > 128 * 1024) child.kill('SIGKILL');
                else output += chunk.toString();
            });
            child.stderr.resume();
            child.once('error', (err) => {
                spawnError = err;
            });
            child.once('close', (code) => {
                if (spawnError || code !== 0 || size > 128 * 1024)
                    reject(
                        new ToolExecutionError(
                            (spawnError as NodeJS.ErrnoException)?.code === 'ENOENT'
                                ? 'The media runtime is not installed. Use the Docker deployment or install FFmpeg and ffprobe.'
                                : 'Unable to process this media. Use a supported, undamaged audio or video file within the limits.',
                        ),
                    );
                else resolve(output);
            });
        });
    }
}
