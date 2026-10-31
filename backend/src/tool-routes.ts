import type { publicRequest } from './public-network.js';
import { readMusicTrack } from './music-assets.js';
import { artifact } from '@socket-help/tools/artifacts';
import { musicTracks, defaultRecipe } from '@socket-help/tools/audio';
import type { ExtraDefinition } from '@socket-help/tools/extra-definitions';
import { AvRunner } from '@socket-help/tools/av';
import { avOperations } from '@socket-help/tools/av-definitions';
import type { AvOperationId } from '@socket-help/tools/av-definitions';
import { mediaOperations } from '@socket-help/tools/media-definitions';
import type { MediaOperationId } from '@socket-help/tools/media-definitions';
import { networkOperations } from '@socket-help/tools/network-definitions';
import type { NetworkOperationId } from '@socket-help/tools/network-definitions';
import { NetworkRunner } from './network-tools.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { catalog, toolPageHref, toolAvailability } from '@socket-help/tools/catalog';
import type { ServerCapabilities } from '@socket-help/tools/catalog';
import { browserOperations } from '@socket-help/tools/definitions';
import type { OperationOptions } from '@socket-help/tools/definitions';
import type { ToolId } from '@socket-help/tools/engine';
import { ToolRunner, ToolExecutionError } from '@socket-help/tools/node';
import { entitlement } from './entitlements.js';
import { plans } from '@socket-help/tools/plans';
import { Access, HttpError, requireWorkspace } from './access.js';
export const executableIds = [
    'json',
    'base64',
    'url',
    'uuid',
    'hash',
    ...Object.keys(browserOperations),
    ...Object.keys(networkOperations),
    ...Object.keys(mediaOperations),
] as (ToolId | NetworkOperationId | MediaOperationId)[];
const optionKeys = [
    'cursor',
    'theme',
    'seed',
    'background',
    'foreground',
    'accent',
    'style',
    'subtitle',
    'page',
    'values',
    'pages',
    'quality',
    'x',
    'y',
    'rotation',
    'flip',
    'recordType',
    'origin',
    'headerNames',
    'credentials',
    'expectedTxt',
    'action',
    'pattern',
    'flags',
    'comparison',
    'timezone',
    'start',
    'method',
    'headers',
    'body',
    'from',
    'to',
    'columns',
    'size',
    'width',
    'height',
    'format',
    'frequency',
    'duration',
    'level',
    'brand',
    'count',
    'mode',
    'secret',
    'length',
    'min',
    'max',
    'algorithm',
    'unit',
];
export function executionGuide(id: string) {
    const definition = (
        {
            json: {
                action: 'Format JSON',
                input: true,
                inputLabel: 'JSON source',
                placeholder: '{"ready":true}',
                intro: 'Format or minify JSON while preserving large numeric literals and duplicate keys.',
                fields: [
                    {
                        key: 'action',
                        label: 'Action',
                        defaultValue: 'format',
                        choices: [
                            ['format', 'Format'],
                            ['minify', 'Minify'],
                        ],
                    },
                ],
            },
            base64: {
                action: 'Convert Base64',
                input: true,
                inputLabel: 'Text or Base64',
                placeholder: 'Hello',
                intro: 'Encode UTF-8 text or decode Base64 back to UTF-8.',
                fields: [
                    {
                        key: 'action',
                        label: 'Action',
                        defaultValue: 'encode',
                        choices: [
                            ['encode', 'Encode'],
                            ['decode', 'Decode'],
                        ],
                    },
                ],
            },
            url: {
                action: 'Convert URL encoding',
                input: true,
                inputLabel: 'Text or encoded component',
                placeholder: 'hello world',
                intro: 'Percent-encode or decode a URL component.',
                fields: [
                    {
                        key: 'action',
                        label: 'Action',
                        defaultValue: 'encode',
                        choices: [
                            ['encode', 'Encode'],
                            ['decode', 'Decode'],
                        ],
                    },
                ],
            },
            uuid: {
                action: 'Generate UUIDs',
                input: false,
                intro: 'Create cryptographically random UUID v4 identifiers.',
                fields: [
                    {
                        key: 'count',
                        label: 'Identifiers',
                        type: 'number',
                        defaultValue: '1',
                        min: 1,
                        max: 100,
                    },
                ],
            },
            hash: {
                action: 'Calculate digest',
                input: true,
                inputLabel: 'Text',
                placeholder: 'Hello',
                intro: 'Calculate a SHA digest over the exact UTF-8 text.',
                fields: [
                    {
                        key: 'algorithm',
                        label: 'Algorithm',
                        defaultValue: 'SHA-256',
                        choices: [
                            ['SHA-256', 'SHA-256'],
                            ['SHA-384', 'SHA-384'],
                            ['SHA-512', 'SHA-512'],
                        ],
                    },
                ],
            },
            ...browserOperations,
            ...networkOperations,
            ...mediaOperations,
        } as unknown as Record<string, Partial<ExtraDefinition>>
    )[id];
    return definition
        ? {
              action: definition.action,
              acceptsText: definition.input,
              acceptsFile: definition.file ?? false,
              multipleFiles: definition.multiple ?? false,
              inputLabel: definition.inputLabel,
              inputExample: definition.placeholder,
              options: definition.fields ?? [],
              description: definition.intro,
              steps: definition.steps,
              limits: definition.limits,
              example: definition.example,
          }
        : undefined;
}
export class ToolService {
    private runner = new ToolRunner();
    private network: NetworkRunner;
    private av = new AvRunner();
    private media = new ToolRunner(1, 2, 5000);
    constructor(
        private access: Access,
        private frontendDir?: string,
        eventSend?: typeof publicRequest,
    ) {
        this.network = new NetworkRunner(eventSend);
    }
    close() {
        this.network.close();
        return Promise.all([this.runner.close(), this.media.close(), this.av.close()]);
    }
    private async music(id: string) {
        const track = musicTracks.find((track) => track.id === id);
        if (!track) throw new ToolExecutionError('Choose a track from the music library.');
        const bytes = await readMusicTrack(id, this.frontendDir);
        return JSON.stringify({
            ...JSON.parse(artifact(`${id}.mp3`, 'audio/mpeg', bytes)),
            license: 'CC0-1.0',
            licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
            track: { title: track.title, duration: (48 * 240) / track.bpm, bpm: track.bpm },
            baseLoopRecipe: defaultRecipe(id),
        });
    }
    private musicLinks(options: OperationOptions) {
        const track = musicTracks.find((track) => track.id === (options.mode ?? musicTracks[0].id));
        if (!track) throw new ToolExecutionError('Choose a track from the music library.');
        const format = options.format ?? 'wav';
        if (!['wav', 'mp3'].includes(format))
            throw new ToolExecutionError('format must be wav or mp3.');
        const url = new URL(`/api/music/${track.id}/audio.${format}`, this.access.origin).href;
        return JSON.stringify({
            kind: 'audio',
            name: `${track.id}.${format}`,
            mimeType: format === 'mp3' ? 'audio/mpeg' : 'audio/wav',
            audioUrl: url,
            downloadUrl: `${url}?download=1`,
            license: 'CC0-1.0',
            licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
            track,
        });
    }
    async run(request: FastifyRequest, toolId: string, value: unknown, linksOnly = false) {
        if (!executableIds.includes(toolId as ToolId))
            throw new HttpError(404, 'This tool is not available for execution.');
        const actor = await this.access.scope(request, 'tools:run');
        const minimumPlan = catalog.find((tool) => tool.id === toolId)?.minimumPlan;
        if (minimumPlan) entitlement(actor.identity, { minimumPlan }, this.access.origin);
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new HttpError(400, 'Provide a JSON object with input and options.');
        const body = value as Record<string, unknown>,
            plan = plans[actor.plan];
        if (Object.keys(body).some((key) => !['input', 'options', 'file'].includes(key)))
            throw new HttpError(400, 'Unknown execution field.');
        const input = body.input ?? '';
        if (typeof input !== 'string' || Buffer.byteLength(input) > plan.inputBytes)
            throw new HttpError(413, `Input exceeds your ${plan.inputBytes / 1024} KiB allowance.`);
        const options = body.options ?? {};
        if (
            !options ||
            typeof options !== 'object' ||
            Array.isArray(options) ||
            Object.entries(options).some(
                ([key, value]) =>
                    !optionKeys.includes(key) ||
                    typeof value !== 'string' ||
                    value.length > plan.inputBytes,
            )
        )
            throw new HttpError(400, 'Options must contain supported string values.');
        if (Buffer.byteLength(JSON.stringify(options)) + Buffer.byteLength(input) > plan.inputBytes)
            throw new HttpError(413, 'Input and options exceed your plan allowance.');
        // Requests that can change state on a third-party server need an accountable sender.
        if (
            !actor.identity &&
            (toolId === 'mock-apis-api-test-scenarios' ||
                (toolId === 'network-request-replay' &&
                    !['GET', 'HEAD', 'OPTIONS', undefined].includes(
                        (options as OperationOptions).method,
                    )))
        )
            requireWorkspace(actor);
        type FileInput = { name: string; bytes: Uint8Array };
        let file: FileInput | FileInput[] | undefined;
        if (body.file !== undefined) {
            const multiple = Array.isArray(body.file),
                entries = multiple ? (body.file as unknown[]) : [body.file];
            if (
                multiple &&
                (!['everyday-merge-pdfs', 'everyday-image-to-pdf'].includes(toolId) ||
                    !entries.length ||
                    entries.length > 20)
            )
                throw new HttpError(400, 'This tool requires one to 20 files.');
            const decoded: FileInput[] = [];
            let totalBytes = 0;
            for (const entry of entries) {
                const value = entry as Record<string, unknown>;
                if (
                    ![
                        'everyday-file-checksums',
                        'files-file-metadata-inspector',
                        'email-email-inspector',
                        'email-attachment-inspector',
                        'email-email-verification-tester',
                        ...Object.keys(mediaOperations),
                    ].includes(toolId) ||
                    !value ||
                    typeof value !== 'object' ||
                    Array.isArray(value) ||
                    typeof value.name !== 'string' ||
                    !value.name ||
                    value.name.length > 150 ||
                    typeof value.base64 !== 'string' ||
                    value.base64.length > Math.ceil(plan.fileBytes / 3) * 4
                )
                    throw new HttpError(
                        400,
                        'Provide a supported file tool with bounded name and Base64 contents.',
                    );
                const bytes = Buffer.from(value.base64, 'base64');
                if (bytes.toString('base64') !== value.base64 || bytes.length > plan.fileBytes)
                    throw new HttpError(
                        400,
                        'File contents must be canonical Base64 within your file upload allowance.',
                    );
                totalBytes += bytes.length;
                if (totalBytes > plan.fileBytes)
                    throw new HttpError(413, 'Combined files exceed the 10 MiB upload allowance.');
                decoded.push({ name: value.name, bytes });
            }
            file = multiple ? decoded : decoded[0];
        }
        const usage = await this.access.identities.consumeRun(
            actor.quotaKey,
            actor.identity?.account.id ?? null,
            plan.runsPerDay,
        );
        if (!usage.allowed)
            throw new HttpError(
                429,
                'Daily hosted tool allowance reached. It resets at 00:00 UTC.',
                Math.ceil((86400000 - (Date.now() % 86400000)) / 1000),
            );
        const controller = new AbortController(),
            abort = () => controller.abort();
        request.raw.once('aborted', abort);
        request.raw.socket?.once('close', abort);
        try {
            const output =
                linksOnly && toolId === 'test-media-music-library'
                    ? this.musicLinks(options as OperationOptions)
                    : toolId === 'test-media-music-library' &&
                        options &&
                        (options as OperationOptions).format === 'mp3'
                      ? await this.music((options as OperationOptions).mode ?? musicTracks[0].id)
                      : Object.hasOwn(avOperations, toolId)
                        ? await this.av.run(
                              toolId as AvOperationId,
                              options as OperationOptions,
                              file,
                              controller.signal,
                          )
                        : Object.hasOwn(networkOperations, toolId)
                          ? await this.network.run(
                                toolId as NetworkOperationId,
                                input,
                                options as OperationOptions,
                                controller.signal,
                            )
                          : await (
                                Object.hasOwn(mediaOperations, toolId) ? this.media : this.runner
                            ).run(
                                toolId as ToolId | MediaOperationId,
                                input,
                                options as OperationOptions,
                                file,
                                controller.signal,
                            );
            return {
                toolId,
                output,
                usage: {
                    used: usage.used,
                    limit: plan.runsPerDay,
                    resetsAt: new Date(
                        Math.floor(Date.now() / 86400000) * 86400000 + 86400000,
                    ).toISOString(),
                },
            };
        } catch (error) {
            // Timeouts and cancellations used real compute, so they keep the reserved run.
            if (
                !controller.signal.aborted &&
                !(
                    error instanceof ToolExecutionError &&
                    (error.code === 'timeout' || error.code === 'cancelled')
                )
            )
                await this.access.identities.releaseRun(actor.quotaKey, usage.day);
            if (error instanceof ToolExecutionError)
                throw new HttpError(
                    error.code === 'busy' ? 503 : error.code === 'timeout' ? 408 : 400,
                    error.message,
                );
            throw error;
        } finally {
            request.raw.removeListener('aborted', abort);
            request.raw.socket?.removeListener('close', abort);
        }
    }
}
export function registerTools(
    app: FastifyInstance,
    access: Access,
    service: ToolService,
    capabilities: ServerCapabilities,
) {
    const active = new Set<FastifyRequest>();
    app.addHook('onResponse', async (request) => {
        active.delete(request);
    });
    app.addHook('onRequestAbort', async (request) => {
        active.delete(request);
    });
    app.get('/api/tools', async () => ({
        tools: catalog
            .map((entry) => toolAvailability(entry, capabilities))
            .map((tool) => ({
                id: tool.id,
                name: tool.name,
                description: tool.description,
                categoryId: tool.categoryId,
                minimumPlan: tool.minimumPlan ?? null,
                status: tool.status,
                ...('availabilityReason' in tool
                    ? { availabilityReason: tool.availabilityReason }
                    : {}),
                page: toolPageHref(tool),
                guide: executionGuide(tool.id),
                execution: executableIds.includes(tool.id as ToolId)
                    ? `/api/tools/${tool.id}/run`
                    : null,
                interfaces:
                    tool.status === 'available'
                        ? ['web', 'api', 'sdk', 'cli', 'curl', 'mcp', 'ssh']
                        : [],
            })),
    }));
    app.get<{ Params: { id: string } }>('/api/tools/:id', async (request) => {
        const entry = catalog.find((tool) => tool.id === request.params.id);
        if (!entry) throw new HttpError(404, 'Tool not found.');
        const tool = toolAvailability(entry, capabilities);
        return {
            ...tool,
            page: toolPageHref(tool),
            execution: executableIds.includes(tool.id as ToolId)
                ? `/api/tools/${tool.id}/run`
                : null,
            guide: executionGuide(tool.id),
        };
    });
    app.post<{ Params: { id: string } }>(
        '/api/tools/:id/run',
        {
            bodyLimit: 16 * 1024 * 1024,
            onRequest: async (request, reply) => {
                if (active.size >= 4)
                    return reply
                        .header('Retry-After', '2')
                        .code(503)
                        .send({ error: 'Tool processors are busy. Try again shortly.' });
                active.add(request);
            },
        },
        (request) => service.run(request, request.params.id, request.body),
    );
    app.get('/api/usage', async (request) => {
        const actor = await access.actor(request);
        return {
            plan: actor.plan,
            limits: plans[actor.plan],
            runsToday: await access.identities.runUsage(actor.quotaKey),
            resetsAt: new Date(
                Math.floor(Date.now() / 86400000) * 86400000 + 86400000,
            ).toISOString(),
        };
    });
}
