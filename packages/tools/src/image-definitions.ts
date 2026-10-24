import type { ExtraDefinition, UtilityField } from './extra-definitions.js';
const theme: UtilityField = {
    key: 'theme',
    label: 'Palette',
    defaultValue: 'sage',
    choices: [
        ['sage', 'Sage'],
        ['clay', 'Clay'],
        ['ocean', 'Ocean'],
        ['lavender', 'Lavender'],
        ['ink', 'Ink'],
        ['sunrise', 'Sunrise'],
    ],
};
const seed: UtilityField = {
    key: 'seed',
    label: 'Variation seed',
    type: 'number',
    defaultValue: '41',
    min: 1,
    max: 2147483647,
};
const format: UtilityField = {
    key: 'format',
    label: 'Download format',
    defaultValue: 'svg',
    choices: [
        ['svg', 'SVG · editable vector'],
        ['png', 'PNG · raster image'],
    ],
};
const custom: readonly UtilityField[] = [
    {
        key: 'background',
        label: 'Custom background (optional hex)',
        defaultValue: '',
        when: ['action', 'custom'],
    },
    {
        key: 'foreground',
        label: 'Custom foreground (optional hex)',
        defaultValue: '',
        when: ['action', 'custom'],
    },
    {
        key: 'accent',
        label: 'Custom accent (optional hex)',
        defaultValue: '',
        when: ['action', 'custom'],
    },
];
export const imageDesignOperations = {
    'test-media-placeholder-images': {
        action: 'Generate artwork',
        input: true,
        inputLabel: 'Title or label (optional)',
        placeholder: 'A quieter kind of launch',
        preview: 'file',
        fields: [
            {
                key: 'style',
                label: 'Artwork style',
                defaultValue: 'landscape',
                choices: [
                    ['landscape', 'Landscape illustration'],
                    ['gradient', 'Soft gradient'],
                    ['geometric', 'Geometric composition'],
                    ['grid', 'Technical grid'],
                    ['solid', 'Solid background'],
                ],
            },
            theme,
            {
                key: 'width',
                label: 'Width (px)',
                type: 'number',
                defaultValue: '1200',
                min: 32,
                max: 4096,
            },
            {
                key: 'height',
                label: 'Height (px)',
                type: 'number',
                defaultValue: '630',
                min: 32,
                max: 4096,
            },
            {
                key: 'subtitle',
                label: 'Subtitle (optional)',
                defaultValue: '',
            },
            seed,
            format,
            {
                key: 'action',
                label: 'Color controls',
                defaultValue: 'palette',
                choices: [
                    ['palette', 'Use palette'],
                    ['custom', 'Custom hex colors'],
                ],
            },
            ...custom,
        ],
        intro: 'Create original landscape, abstract, gradient and grid artwork with custom dimensions, captions and palettes. Export editable SVG or ready-to-use PNG.',
        steps: [
            'Choose an artwork style, palette and output dimensions.',
            'Add an optional title and subtitle, then choose a variation seed.',
            'Preview the full composition and export SVG or PNG. Use custom hex colors to match your project.',
        ],
        limits: '32–4,096 pixels per side, up to 16 million pixels and 5 MiB output. Captions and subtitles are limited to 200 characters. No remote photographs, fonts or stock-image APIs are used. PNG output rasterizes the generated vector; browser and hosted font rendering may differ. SVG output is deterministic for the same settings.',
        useCase:
            'Create a useful hero image, social preview or upload fixture with the proportions and visual style your project needs.',
        example: 'Landscape · Ocean palette · 1200 × 630 · title and subtitle · PNG export',
    },
    'test-media-sample-avatars': {
        action: 'Generate avatar',
        input: true,
        inputLabel: 'Name or identity seed',
        placeholder: 'Ada Lovelace',
        preview: 'file',
        fields: [
            {
                key: 'style',
                label: 'Avatar style',
                defaultValue: 'initials',
                choices: [
                    ['initials', 'Initials'],
                    ['identicon', 'Symmetric identicon'],
                    ['orbit', 'Orbital mark'],
                    ['bot', 'Geometric robot'],
                ],
            },
            theme,
            {
                key: 'mode',
                label: 'Shape',
                defaultValue: 'rounded',
                choices: [
                    ['rounded', 'Rounded square'],
                    ['circle', 'Circle'],
                    ['square', 'Square'],
                ],
            },
            {
                key: 'width',
                label: 'Size (px)',
                type: 'number',
                defaultValue: '256',
                min: 32,
                max: 4096,
            },
            seed,
            format,
            {
                key: 'action',
                label: 'Color controls',
                defaultValue: 'palette',
                choices: [
                    ['palette', 'Use palette'],
                    ['custom', 'Custom hex colors'],
                ],
            },
            ...custom,
        ],
        intro: 'Generate consistent profile images as initials, symmetric identicons, orbital marks or geometric robots. Customize the shape, palette, size and variation, then export SVG or PNG.',
        steps: [
            'Enter a name or synthetic identity seed.',
            'Choose the style, shape, palette and size.',
            'Generate the avatar. Keep the same seed for a stable identity or change it for a new variation.',
        ],
        limits: '32–4,000 pixels square, up to 16 million pixels and 5 MiB output. No photographs or real-person likenesses are generated. Names are processed locally in the browser; hosted calls follow normal input and usage rules. Identicons are decorative and are not identity verification or a secure hash visualizer.',
        useCase:
            'Give development accounts, a directory or a prototype recognizable images without using real profile photos.',
        example: 'Ada Lovelace · Identicon · Ocean · Circle · 256 px · PNG',
    },
} satisfies Record<string, ExtraDefinition>;
