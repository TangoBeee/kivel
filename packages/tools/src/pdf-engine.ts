import { MEDIA_INPUT_BYTES, GENERATED_FILE_BYTES, IMAGE_PIXELS } from './media-limits.js';
import { isRasterImage } from './media-input.js';
import { PDFDocument } from 'pdf-lib';
import type { OperationOptions } from './definitions.js';
import { artifact } from './artifacts.js';
function pages(value: string, count: number) {
    if (!value.trim()) throw new Error('Enter page numbers or ranges, for example 1,3-5.');
    const output: number[] = [];
    for (const piece of value.split(',')) {
        const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(piece);
        if (!match) throw new Error('Use comma-separated page numbers or ascending ranges.');
        const first = Number(match[1]),
            last = Number(match[2] ?? match[1]);
        if (first < 1 || last > count || last < first || last - first > 199)
            throw new Error(`Page selections must be from 1 to ${count}.`);
        for (let page = first; page <= last; page++) {
            if (output.includes(page - 1)) throw new Error('Select each page only once.');
            output.push(page - 1);
        }
    }
    return output;
}
export async function runPdf(
    id: string,
    options: OperationOptions,
    file?: { name: string; bytes: Uint8Array },
) {
    if (
        !file?.bytes.length ||
        file.bytes.length > MEDIA_INPUT_BYTES ||
        !Buffer.from(file.bytes.subarray(0, 5)).equals(Buffer.from('%PDF-'))
    )
        throw new Error('Choose a PDF within your hosted input allowance (maximum 10 MiB).');
    let source: PDFDocument;
    try {
        source = await PDFDocument.load(file.bytes, {
            updateMetadata: false,
            throwOnInvalidObject: true,
        });
    } catch {
        throw new Error(
            'Unable to read this PDF. Encrypted or damaged documents are not supported.',
        );
    }
    const count = source.getPageCount();
    if (!count || count > 200) throw new Error('Use a PDF with one to 200 pages.');
    if (id === 'everyday-compress-pdf') {
        const result = await source.save({
            useObjectStreams: true,
            addDefaultPage: false,
            objectsPerTick: 25,
        });
        return artifact(
            'optimized.pdf',
            'application/pdf',
            result.length < file.bytes.length ? result : file.bytes,
        );
    }
    const selected = pages(options.pages ?? '', count);
    if (id === 'everyday-reorder-pdf-pages' && selected.length !== count)
        throw new Error('For reordering, include every page exactly once.');
    const result = await PDFDocument.create();
    for (const page of await result.copyPages(source, selected)) result.addPage(page);
    return artifact(
        id === 'everyday-split-pdf' ? 'selected-pages.pdf' : 'reordered.pdf',
        'application/pdf',
        await result.save({ useObjectStreams: true, addDefaultPage: false }),
    );
}

export async function runPdfMultiple(id: string, files: { name: string; bytes: Uint8Array }[]) {
    if (
        files.length < (id === 'everyday-merge-pdfs' ? 2 : 1) ||
        files.length > 20 ||
        files.reduce((n, file) => n + file.bytes.length, 0) > MEDIA_INPUT_BYTES
    )
        throw new Error(
            'Choose up to 20 files within 10 MiB combined; merging requires at least two PDFs.',
        );
    const result = await PDFDocument.create();
    let pages = 0,
        totalPixels = 0;
    for (const file of files) {
        if (id === 'everyday-merge-pdfs') {
            if (!Buffer.from(file.bytes.subarray(0, 5)).equals(Buffer.from('%PDF-')))
                throw new Error('Choose PDF files only.');
            let source: PDFDocument;
            try {
                source = await PDFDocument.load(file.bytes, {
                    updateMetadata: false,
                    throwOnInvalidObject: true,
                });
            } catch {
                throw new Error('Unable to read an encrypted or damaged PDF.');
            }
            pages += source.getPageCount();
            if (pages > 200) throw new Error('Combined PDFs must have at most 200 pages.');
            for (const page of await result.copyPages(source, source.getPageIndices()))
                result.addPage(page);
        } else {
            if (!isRasterImage(file.bytes)) throw new Error('Use a supported raster image.');
            const { default: sharp } = await import('sharp');
            const meta = await sharp(file.bytes, {
                limitInputPixels: IMAGE_PIXELS,
                failOn: 'warning',
            }).metadata();
            if (
                !['jpeg', 'png', 'webp', 'gif', 'heif', 'tiff'].includes(meta.format ?? '') ||
                !meta.width ||
                !meta.height ||
                (meta.pages ?? 1) !== 1
            )
                throw new Error('Use single-frame raster images only.');
            totalPixels += meta.width * meta.height;
            if (totalPixels > IMAGE_PIXELS)
                throw new Error('Combined source images must have at most sixteen million pixels.');
            const pipeline = sharp(file.bytes, {
                limitInputPixels: IMAGE_PIXELS,
                failOn: 'warning',
            }).autoOrient();
            const jpeg = meta.format === 'jpeg';
            const bytes = await (jpeg ? pipeline.jpeg({ quality: 90 }) : pipeline.png()).toBuffer();
            if (bytes.length > GENERATED_FILE_BYTES)
                throw new Error(
                    'An embedded image exceeds 5 MiB. Resize it before creating the PDF.',
                );
            const image = jpeg ? await result.embedJpg(bytes) : await result.embedPng(bytes),
                scale = 72 / 96;
            const page = result.addPage([image.width * scale, image.height * scale]);
            page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
        }
    }
    return artifact(
        id === 'everyday-merge-pdfs' ? 'merged.pdf' : 'images.pdf',
        'application/pdf',
        await result.save({ useObjectStreams: true, addDefaultPage: false }),
    );
}
