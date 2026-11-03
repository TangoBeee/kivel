import { parentPort } from 'node:worker_threads';
import { File } from 'node:buffer';
import { runBrowserOperation } from './engine.js';
import type { ToolId } from './engine.js';
import { mediaOperations } from './media-definitions.js';
import type { MediaOperationId } from './media-definitions.js';
import type { OperationOptions } from './definitions.js';
parentPort?.on(
    'message',
    async (task: {
        id: string;
        toolId: ToolId | MediaOperationId | import('./network-parsers.js').NetworkParseId;
        input: string;
        options: OperationOptions;
        file?: { name: string; bytes: Uint8Array } | { name: string; bytes: Uint8Array }[];
    }) => {
        try {
            const file =
                task.file && !Array.isArray(task.file)
                    ? new File([task.file.bytes as Uint8Array<ArrayBuffer>], task.file.name)
                    : undefined;
            const png =
                ['test-media-placeholder-images', 'test-media-sample-avatars'].includes(
                    task.toolId,
                ) && task.options.format === 'png';
            const parse = ['parse-web-page', 'parse-sitemap', 'parse-link-preview'].includes(
                task.toolId,
            );
            const output = parse
                ? JSON.stringify(
                      (await import('./network-parsers.js')).runNetworkParse(
                          task.toolId as import('./network-parsers.js').NetworkParseId,
                          task.input,
                          task.options.origin ?? 'https://example.com',
                      ),
                  )
                : png
                  ? await renderPng(task.toolId, task.input, task.options)
                  : Object.hasOwn(mediaOperations, task.toolId)
                    ? await (
                          await import('./media-engine.js')
                      ).runMedia(task.toolId as MediaOperationId, task.options, task.file)
                    : await runBrowserOperation(
                          task.toolId as ToolId,
                          task.input,
                          task.options,
                          file,
                      );
            parentPort?.postMessage({ id: task.id, output });
        } catch (error) {
            parentPort?.postMessage({
                id: task.id,
                error:
                    error instanceof Error
                        ? error.message.slice(0, 1000)
                        : 'Unable to process input.',
            });
        }
    },
);

async function renderPng(id: string, input: string, options: OperationOptions) {
    const { designImage } = await import('./image-design.js'),
        { artifact } = await import('./artifacts.js'),
        { default: sharp } = await import('sharp');
    const { svg } = designImage(id, input, options);
    sharp.cache(false);
    sharp.concurrency(1);
    const bytes = await sharp(Buffer.from(svg), { limitInputPixels: 16000000 }).png().toBuffer();
    return artifact(
        id === 'test-media-sample-avatars' ? 'avatar.png' : 'illustration.png',
        'image/png',
        bytes,
    );
}
