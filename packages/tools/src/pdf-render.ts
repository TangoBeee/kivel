import { MEDIA_INPUT_BYTES, GENERATED_FILE_BYTES, IMAGE_PIXELS } from './media-limits.js';
import { fileURLToPath } from 'node:url';
import type { OperationOptions } from './definitions.js';
import { artifact } from './artifacts.js';
export async function runPdfRender(
    id: string,
    options: OperationOptions,
    file?: { name: string; bytes: Uint8Array },
) {
    if (
        !file?.bytes.length ||
        file.bytes.length > MEDIA_INPUT_BYTES ||
        !Buffer.from(file.bytes.subarray(0, 5)).equals(Buffer.from('%PDF-'))
    )
        throw new Error('Choose a PDF within your input allowance (maximum 10 MiB).');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const base = import.meta.resolve('pdfjs-dist/package.json');
    const task = getDocument({
        data: Uint8Array.from(file.bytes),
        enableXfa: false,
        disableFontFace: true,
        useSystemFonts: false,
        useWorkerFetch: false,
        verbosity: 0,
        stopAtErrors: true,
        maxImageSize: IMAGE_PIXELS,
        canvasMaxAreaInBytes: 16000000,
        standardFontDataUrl: fileURLToPath(new URL('./standard_fonts/', base)),
        cMapUrl: fileURLToPath(new URL('./cmaps/', base)),
        cMapPacked: true,
        wasmUrl: fileURLToPath(new URL('./wasm/', base)),
    });
    try {
        const pdf = await task.promise;
        if (!pdf.numPages || pdf.numPages > 200)
            throw new Error('Use a PDF with one to 200 pages.');
        if (id === 'everyday-extract-pdf-text') {
            let output = '';
            for (let index = 1; index <= pdf.numPages; index++) {
                const page = await pdf.getPage(index),
                    content = await page.getTextContent();
                output += `--- Page ${index} ---\n`;
                for (const item of content.items)
                    if ('str' in item) {
                        output += item.str + (item.hasEOL ? '\n' : ' ');
                        if (output.length > 262144)
                            throw new Error('Extracted text exceeds 256 KiB.');
                    }
                output += '\n\n';
                page.cleanup();
            }
            if (new TextEncoder().encode(output).length > 262144)
                throw new Error('Extracted text exceeds 256 KiB.');
            return output.trimEnd();
        }
        const number = Number(options.page ?? 1),
            width = Number(options.width ?? 800),
            format = options.format ?? 'png';
        if (!Number.isInteger(number) || number < 1 || number > pdf.numPages)
            throw new Error(`Choose a page from 1 to ${pdf.numPages}.`);
        if (
            !Number.isInteger(width) ||
            width < 64 ||
            width > 2048 ||
            !['png', 'jpeg'].includes(format)
        )
            throw new Error('Choose PNG or JPEG and width from 64 to 2048 px.');
        const page = await pdf.getPage(number),
            original = page.getViewport({ scale: 1 }),
            viewport = page.getViewport({ scale: width / original.width });
        if (
            !Number.isFinite(viewport.height) ||
            viewport.height < 1 ||
            width * Math.ceil(viewport.height) > 4000000
        )
            throw new Error('Rendered page exceeds four million pixels.');
        const { createCanvas } = await import('@napi-rs/canvas');
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({
            canvas: canvas as unknown as HTMLCanvasElement,
            canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D,
            viewport,
            annotationMode: 0,
        }).promise;
        const output =
            format === 'jpeg'
                ? await canvas.encode('jpeg', { quality: 85 })
                : await canvas.encode('png');
        return artifact(
            `page-${number}.${format === 'jpeg' ? 'jpg' : 'png'}`,
            `image/${format}`,
            output,
        );
    } catch (error) {
        throw new Error(
            error instanceof Error ? error.message.slice(0, 500) : 'Unable to process this PDF.',
        );
    } finally {
        await task.destroy();
    }
}
