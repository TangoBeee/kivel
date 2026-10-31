import { MEDIA_INPUT_BYTES, GENERATED_FILE_BYTES, IMAGE_PIXELS } from './media-limits.js';
import { isRasterImage } from './media-input.js';
import sharp from 'sharp';
import { artifact } from './artifacts.js';
import { mediaOperations } from './media-definitions.js';
import type { MediaOperationId } from './media-definitions.js';
import type { OperationOptions } from './definitions.js';
sharp.cache(false);
sharp.concurrency(1);
function integer(
    field: string,
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
) {
    const number = value === undefined ? fallback : Number(value);
    if (
        (!value?.trim() && value !== undefined) ||
        !Number.isInteger(number) ||
        number < min ||
        number > max
    )
        throw new Error(`${field} must be an integer from ${min} to ${max}.`);
    return number;
}
export async function runMedia(
    id: MediaOperationId,
    options: OperationOptions,
    file?: { name: string; bytes: Uint8Array } | { name: string; bytes: Uint8Array }[],
): Promise<string> {
    if (['everyday-merge-pdfs', 'everyday-image-to-pdf'].includes(id))
        return (await import('./pdf-engine.js')).runPdfMultiple(
            id,
            Array.isArray(file) ? file : file ? [file] : [],
        );
    if (Array.isArray(file)) throw new Error('Choose one file for this tool.');
    if (['everyday-extract-pdf-text', 'everyday-pdf-to-image'].includes(id))
        return (await import('./pdf-render.js')).runPdfRender(id, options, file);
    if (!file?.bytes.length || file.bytes.length > MEDIA_INPUT_BYTES)
        throw new Error(
            'Choose a nonempty image within your hosted input allowance (maximum 10 MiB).',
        );
    if (['everyday-split-pdf', 'everyday-reorder-pdf-pages', 'everyday-compress-pdf'].includes(id))
        return (await import('./pdf-engine.js')).runPdf(id, options, file);
    const definition = mediaOperations[id];
    for (const field of definition.fields ?? [])
        if (
            field.choices &&
            options[field.key] !== undefined &&
            !field.choices.some(([value]) => value === options[field.key])
        )
            throw new Error(`Choose a supported value for ${field.label}.`);
    const buffer = Buffer.from(file.bytes);
    if (!isRasterImage(buffer))
        throw new Error('Use a supported raster image: JPEG, PNG, WebP, GIF, AVIF or TIFF.');
    const metadata = await sharp(buffer, {
        limitInputPixels: IMAGE_PIXELS,
        failOn: 'warning',
    }).metadata();
    if (
        !['jpeg', 'png', 'webp', 'gif', 'avif', 'heif', 'tiff'].includes(metadata.format ?? '') ||
        !metadata.width ||
        !metadata.height
    )
        throw new Error('Use a supported raster image: JPEG, PNG, WebP, GIF, AVIF or TIFF.');
    if ((metadata.pages ?? 1) !== 1)
        throw new Error('Animated and multi-page images are not supported.');
    if (id === 'everyday-image-metadata')
        return JSON.stringify(
            {
                filename: file.name,
                bytes: buffer.length,
                format: metadata.format,
                width: metadata.width,
                height: metadata.height,
                channels: metadata.channels,
                space: metadata.space,
                depth: metadata.depth,
                hasAlpha: metadata.hasAlpha,
                orientation: metadata.orientation ?? null,
                autoOriented: metadata.autoOrient,
                density: metadata.density ?? null,
                embeddedMetadata: {
                    exif: !!metadata.exif,
                    xmp: !!metadata.xmp,
                    iptc: !!metadata.iptc,
                    icc: !!metadata.icc,
                },
                note: 'Metadata presence is reported; no remote resources are fetched.',
            },
            null,
            2,
        );
    let pipeline = sharp(buffer, {
        limitInputPixels: IMAGE_PIXELS,
        failOn: 'warning',
    }).autoOrient();
    if (id === 'everyday-color-extractor') {
        const { data, info } = await pipeline
            .resize(96, 96, { fit: 'inside', withoutEnlargement: true })
            .toColourspace('srgb')
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        const bins = new Map<string, { r: number; g: number; b: number; weight: number }>();
        let total = 0;
        for (let i = 0; i < data.length; i += info.channels) {
            const weight = data[i + 3]! / 255;
            if (!weight) continue;
            const r = data[i]!,
                g = data[i + 1]!,
                b = data[i + 2]!,
                key = `${r >> 4},${g >> 4},${b >> 4}`,
                bin = bins.get(key) ?? { r: 0, g: 0, b: 0, weight: 0 };
            bin.r += r * weight;
            bin.g += g * weight;
            bin.b += b * weight;
            bin.weight += weight;
            total += weight;
            bins.set(key, bin);
        }
        const colors = [...bins.values()]
            .sort((a, b) => b.weight - a.weight)
            .slice(0, integer('count', options.count, 8, 1, 16))
            .map((bin) => ({
                hex:
                    '#' +
                    [bin.r, bin.g, bin.b]
                        .map((value) =>
                            Math.round(value / bin.weight)
                                .toString(16)
                                .padStart(2, '0'),
                        )
                        .join(''),
                percentage: Math.round((bin.weight / total) * 10000) / 100,
            }));
        return JSON.stringify(
            {
                colors,
                sample: { width: info.width, height: info.height },
                method: 'Frequency of 4-bit RGB bins, weighted by alpha. Percentages refer to all visible sampled pixels.',
            },
            null,
            2,
        );
    }
    if (id === 'everyday-image-cropper') {
        const left = integer('x', options.x, 0, 0, 4095),
            top = integer('y', options.y, 0, 0, 4095),
            width = integer('width', options.width, 100, 1, 4096),
            height = integer('height', options.height, 100, 1, 4096);
        const rotated = [5, 6, 7, 8].includes(metadata.orientation ?? 1),
            imageWidth = rotated ? metadata.height : metadata.width,
            imageHeight = rotated ? metadata.width : metadata.height;
        if (left + width > imageWidth || top + height > imageHeight)
            throw new Error('Crop rectangle must fit inside the oriented image.');
        pipeline = pipeline.extract({ left, top, width, height });
    }
    if (id === 'everyday-image-resizer')
        pipeline = pipeline.resize(
            integer('width', options.width, 800, 1, 4096),
            integer('height', options.height, 800, 1, 4096),
            { fit: 'inside', withoutEnlargement: true },
        );
    if (id === 'everyday-simple-image-editor') {
        pipeline = pipeline.rotate(integer('rotation', options.rotation, 0, 0, 270));
        if (options.flip === 'horizontal') pipeline = pipeline.flop();
        if (options.flip === 'vertical') pipeline = pipeline.flip();
        if (options.mode === 'grayscale') pipeline = pipeline.grayscale();
    }
    const format = options.format ?? 'webp',
        quality = format === 'png' ? 80 : integer('quality', options.quality, 80, 1, 100);
    if (format === 'jpeg')
        pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true });
    else if (format === 'png') pipeline = pipeline.png({ compressionLevel: 9 });
    else pipeline = pipeline.webp({ quality });
    const output = await pipeline.toBuffer();
    if (output.length > GENERATED_FILE_BYTES)
        throw new Error('Output exceeds 5 MiB. Reduce dimensions or quality.');
    return artifact(`image.${format === 'jpeg' ? 'jpg' : format}`, `image/${format}`, output);
}
