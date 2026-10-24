import { avOperations } from './av-definitions.js';
import type { ExtraDefinition, UtilityField } from './extra-definitions.js';
const quality: UtilityField = {
    key: 'quality',
    label: 'Quality (WebP / JPEG)',
    type: 'number',
    defaultValue: '80',
    min: 1,
    max: 100,
};
const format: UtilityField = {
    key: 'format',
    label: 'Output format',
    defaultValue: 'webp',
    choices: [
        ['webp', 'WebP'],
        ['jpeg', 'JPEG'],
        ['png', 'PNG'],
    ],
};
const dimension = (key: 'width' | 'height', value = '800'): UtilityField => ({
    key,
    label: key === 'width' ? 'Width (px)' : 'Height (px)',
    type: 'number',
    defaultValue: value,
    min: 1,
    max: 4096,
});
const limits =
    'Processed on the server in a bounded worker; files and results are not stored. Up to 10 MiB of combined file input on every plan. Text input and hosted daily allowances are separate. JPEG, PNG, WebP, GIF, AVIF and TIFF inputs, up to 16 million pixels. Animated and multi-page images are rejected. Outputs are limited to 5 MiB and omit embedded metadata.';
function image(
    action: string,
    intro: string,
    fields: readonly UtilityField[] = [],
    example = 'Upload an image → preview and download the result',
    preview: 'file' | null = 'file',
): ExtraDefinition {
    return {
        action,
        intro,
        input: false,
        file: true,
        fields,
        preview: preview ?? undefined,
        steps: [
            'Choose an image within your input allowance.',
            'Set the options and run the tool.',
            preview ? 'Preview and download the result.' : 'Inspect the result.',
        ],
        limits,
        useCase: intro,
        example,
    };
}
const pdfLimits =
    'Processed on the server without retaining uploads or results. Up to 10 MiB of file input and 200 pages. Encrypted and damaged PDFs are unsupported. Output is limited to 5 MiB. Page copying preserves page content, but document-level bookmarks, forms, signatures and attachments are not transferred. This is not a PDF sanitization tool.';
function pdf(action: string, intro: string, fields: readonly UtilityField[] = []): ExtraDefinition {
    return {
        action,
        intro,
        input: false,
        file: true,
        preview: 'file',
        fields,
        steps: [
            'Choose a PDF within your input allowance.',
            'Set page options and run the tool.',
            'Download the resulting PDF.',
        ],
        limits: pdfLimits,
        useCase: intro,
        example: 'Page selection: 1,3-5',
    };
}
export const mediaOperations = {
    ...avOperations,
    'everyday-merge-pdfs': {
        ...pdf('Merge PDFs', 'Combine PDF documents in the selected file order.'),
        multiple: true,
        steps: [
            'Choose two to 20 PDFs, within your combined input allowance.',
            'Arrange the files in the desired order.',
            'Merge and download the PDF.',
        ],
        example: 'first.pdf + second.pdf → merged.pdf',
        limits: pdfLimits + ' Up to 20 files and 200 pages combined.',
    },
    'everyday-image-to-pdf': {
        ...pdf('Create PDF', 'Combine raster images into a PDF with one image per page.'),
        multiple: true,
        steps: [
            'Choose up to 20 images within your combined input allowance.',
            'Arrange them in page order.',
            'Create and download the PDF.',
        ],
        example: 'image-1.png + image-2.jpg → images.pdf',
        limits: 'Processed in a bounded worker without retaining files. Up to 10 MiB of combined file input. Up to 20 single-frame raster images, sixteen million pixels combined and 5 MiB output. Images are oriented and re-encoded without metadata; each page follows its image proportions at 96 DPI. SVG, animations and multi-page images are unsupported.',
    },
    'everyday-extract-pdf-text': {
        ...pdf('Extract text', 'Extract existing text from a PDF, preserving page boundaries.'),
        preview: undefined,
        example: 'PDF → text grouped by page',
        limits:
            pdfLimits +
            ' Extracts up to 256 KiB of existing text. Scanned images require OCR and may return no text. Reading order follows the PDF content and may differ from its visual layout.',
    },
    'everyday-pdf-to-image': {
        ...pdf('Render page', 'Render a selected PDF page as a downloadable PNG or JPEG.', [
            {
                key: 'page',
                label: 'Page number',
                type: 'number',
                defaultValue: '1',
                min: 1,
                max: 200,
            },
            dimension('width'),
            {
                key: 'format',
                label: 'Image format',
                defaultValue: 'png',
                choices: [
                    ['png', 'PNG'],
                    ['jpeg', 'JPEG'],
                ],
            },
        ]),
        example: 'PDF page 1 → page-1.png',
        limits:
            pdfLimits +
            ' Renders one page at a time, width 64–2048 px and up to four million pixels. Scripts and interactive annotations are disabled. Embedded images over sixteen million pixels are omitted to bound decoding memory.',
    },
    'everyday-split-pdf': pdf(
        'Extract pages',
        'Save selected PDF pages as a smaller, separate PDF. Run again for another selection.',
        [{ key: 'pages', label: 'Pages (for example 1,3-5)', defaultValue: '1' }],
    ),
    'everyday-reorder-pdf-pages': pdf(
        'Reorder pages',
        'Create a PDF with every page arranged in your chosen order.',
        [{ key: 'pages', label: 'Page order (include every page once)', defaultValue: '2,1' }],
    ),
    'everyday-compress-pdf': {
        ...pdf(
            'Optimize PDF',
            'Re-save a PDF using compressed object streams, keeping the original when it is smaller.',
        ),
        example: 'PDF → optimized PDF',
        limits: 'Processed in a bounded worker without storing files. Up to 10 MiB of file input and 200 pages. Encrypted or damaged PDFs are unsupported. This optimizes document structure; it does not downsample images or guarantee a smaller file. Digital signatures can be invalidated by rewriting. The original is returned if the rewritten file is larger.',
    },
    'everyday-image-compressor': image(
        'Compress image',
        'Re-encode an image as WebP, JPEG or lossless PNG. File size depends on the source and chosen format.',
        [format, quality],
    ),
    'everyday-image-resizer': image(
        'Resize image',
        'Fit an image inside a width and height while preserving its aspect ratio, without enlargement.',
        [dimension('width'), dimension('height'), format, quality],
    ),
    'everyday-image-converter': image('Convert image', 'Convert an image to WebP, JPEG or PNG.', [
        format,
        quality,
    ]),
    'everyday-image-cropper': image(
        'Crop image',
        'Extract an exact rectangular region using coordinates after EXIF orientation is applied.',
        [
            { key: 'x', label: 'Left (px)', type: 'number', defaultValue: '0', min: 0, max: 4095 },
            { key: 'y', label: 'Top (px)', type: 'number', defaultValue: '0', min: 0, max: 4095 },
            dimension('width', '100'),
            dimension('height', '100'),
            format,
        ],
    ),
    'everyday-image-metadata': image(
        'Inspect image',
        'Inspect format, dimensions, orientation, channels and embedded metadata presence without exposing raw metadata blobs.',
        [],
        'Image → width, height, channels, format, orientation and metadata presence',
        null,
    ),
    'everyday-exif-remover': image(
        'Remove metadata',
        'Re-encode an image without EXIF, XMP, IPTC or embedded camera and location metadata.',
        [format, quality],
    ),
    'everyday-color-extractor': image(
        'Extract colors',
        'Find frequent colors from a small, alpha-aware image sample.',
        [{ key: 'count', label: 'Colors', type: 'number', defaultValue: '8', min: 1, max: 16 }],
        'Image → sampled palette with hex colors and percentages',
        null,
    ),
    'everyday-simple-image-editor': image(
        'Edit image',
        'Rotate, mirror or make a grayscale copy of an image.',
        [
            {
                key: 'rotation',
                label: 'Rotation',
                defaultValue: '0',
                choices: [
                    ['0', 'None'],
                    ['90', '90° clockwise'],
                    ['180', '180°'],
                    ['270', '270° clockwise'],
                ],
            },
            {
                key: 'flip',
                label: 'Mirror',
                defaultValue: 'none',
                choices: [
                    ['none', 'None'],
                    ['horizontal', 'Horizontal'],
                    ['vertical', 'Vertical'],
                ],
            },
            {
                key: 'mode',
                label: 'Color',
                defaultValue: 'color',
                choices: [
                    ['color', 'Color'],
                    ['grayscale', 'Grayscale'],
                ],
            },
            format,
            quality,
        ],
    ),
} as const;
export type MediaOperationId = keyof typeof mediaOperations;
