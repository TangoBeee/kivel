import { artifact, xmlEscape } from './artifacts.js';
import type { OperationOptions } from './definitions.js';
export const imagePalettes = {
    sage: ['#e4ece4', '#355a47', '#91ae95'],
    clay: ['#f1e3d6', '#694635', '#c58e69'],
    ocean: ['#ddebef', '#254f66', '#73a7b7'],
    lavender: ['#ebe5ef', '#574364', '#ad97bc'],
    ink: ['#e8e8e3', '#272e2c', '#9da59f'],
    sunrise: ['#f6e5c9', '#694238', '#df9c69'],
} as const;
export function designImage(id: string, input: string, options: OperationOptions) {
    if (input.length > 200) throw new Error('Use a label or name up to 200 characters.');
    if (options.action !== undefined && !['palette', 'custom'].includes(options.action))
        throw new Error('Choose palette or custom color controls.');
    const avatar = id === 'test-media-sample-avatars',
        width = Number(options.width ?? (avatar ? 256 : 1200)),
        height = avatar ? width : Number(options.height ?? 630),
        seed = Number(options.seed ?? 41),
        palette = options.theme ?? 'sage',
        style = options.style ?? (avatar ? 'initials' : 'landscape');
    if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 32 ||
        height < 32 ||
        width > 4096 ||
        height > 4096 ||
        width * height > 16000000
    )
        throw new Error(
            'Use whole-number dimensions from 32 to 4,096 pixels, up to 16 million pixels.',
        );
    if (
        !Number.isSafeInteger(seed) ||
        seed < 1 ||
        seed > 2147483647 ||
        !Object.hasOwn(imagePalettes, palette)
    )
        throw new Error('Choose a palette and a seed from 1 to 2,147,483,647.');
    if (
        !(
            avatar
                ? ['initials', 'identicon', 'orbit', 'bot']
                : ['landscape', 'gradient', 'geometric', 'grid', 'solid']
        ).includes(style)
    )
        throw new Error('Choose a supported image style.');
    const colors = [...imagePalettes[palette as keyof typeof imagePalettes]] as string[];
    for (const [index, key] of ['background', 'foreground', 'accent'].entries())
        if (options.action !== 'palette' && options[key as keyof OperationOptions]) {
            const color = options[key as keyof OperationOptions]!;
            if (!/^#[a-f0-9]{6}$/i.test(color))
                throw new Error('Custom colors use six-digit hex values, such as #355a47.');
            colors[index] = color;
        }
    let state = seed;
    for (const c of avatar ? input : '') state = (state * 31 + c.codePointAt(0)!) >>> 0;
    const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
    const [bg, fg, accent] = colors as [string, string, string];
    const name = input.trim(),
        label = xmlEscape(name),
        subtitle = options.subtitle ?? '';
    if (subtitle.length > 200) throw new Error('Use a subtitle up to 200 characters.');
    const shape = options.mode ?? 'rounded';
    if (!['rounded', 'circle', 'square'].includes(shape))
        throw new Error('Choose a supported shape.');
    const radius = avatar ? (shape === 'circle' ? 50 : shape === 'square' ? 0 : 22) : 0;
    let art = '',
        caption = '';
    if (avatar) {
        if (style === 'initials') {
            const initials = (name || 'Example User')
                .split(/\s+/u)
                .slice(0, 2)
                .map((p) => [...p][0] ?? '')
                .join('')
                .toUpperCase();
            art = `<circle cx="78" cy="18" r="36" fill="${accent}" opacity=".55"/><text x="50" y="52" text-anchor="middle" dominant-baseline="middle" fill="${fg}" font-family="sans-serif" font-size="35" font-weight="600">${xmlEscape(initials)}</text>`;
        }
        if (style === 'identicon')
            for (let y = 0; y < 5; y++)
                for (let x = 0; x < 3; x++)
                    if (random() > 0.45) {
                        const color = random() > 0.5 ? fg : accent;
                        for (const mirror of x === 2 ? [2] : [x, 4 - x])
                            art += `<rect x="${15 + mirror * 14}" y="${15 + y * 14}" width="12" height="12" rx="3" fill="${color}"/>`;
                    }
        if (style === 'orbit') {
            art = `<circle cx="50" cy="50" r="16" fill="${fg}"/>`;
            for (let i = 0; i < 4; i++) {
                const a = random() * Math.PI * 2,
                    r = 29 + random() * 10;
                art += `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${accent}" stroke-width="${1 + (i % 2)}"/><circle cx="${50 + Math.cos(a) * r}" cy="${50 + Math.sin(a) * r}" r="${3 + i}" fill="${fg}"/>`;
            }
        }
        if (style === 'bot') {
            const eye = 3 + random() * 3;
            art = `<path d="M50 19v10" stroke="${fg}" stroke-width="3"/><circle cx="50" cy="17" r="4" fill="${accent}"/><rect x="22" y="29" width="56" height="49" rx="15" fill="${fg}"/><circle cx="38" cy="49" r="${eye}" fill="${bg}"/><circle cx="62" cy="49" r="${eye}" fill="${bg}"/><path d="M39 65h22" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>`;
        }
    } else {
        if (style === 'gradient')
            art = `<rect width="100" height="100" fill="url(#wash)"/><circle cx="${20 + random() * 60}" cy="${20 + random() * 45}" r="40" fill="${accent}" opacity=".3"/>`;
        if (style === 'landscape') {
            const sunX = 60 + random() * 25;
            art = `<rect width="100" height="100" fill="url(#wash)"/><circle cx="${sunX}" cy="${20 + random() * 15}" r="${8 + random() * 6}" fill="${accent}"/><path d="M-5 68L${15 + random() * 15} 28 55 73 80 43 110 80V100H-5Z" fill="${accent}" opacity=".7"/><path d="M-5 83Q25 ${45 + random() * 25} 60 77T110 80V100H-5Z" fill="${fg}" opacity=".85"/><path d="M-5 94Q35 78 65 91T110 90V100H-5Z" fill="${fg}"/>`;
        }
        if (style === 'geometric')
            for (let i = 0; i < 14; i++) {
                const x = random() * 100,
                    y = random() * 100,
                    s = 8 + random() * 28;
                art +=
                    i % 2
                        ? `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" rx="${s * 0.2}" fill="${i % 3 ? accent : fg}" opacity=".4" transform="rotate(${Math.round(random() * 90)} ${x} ${y})"/>`
                        : `<circle cx="${x}" cy="${y}" r="${s / 2}" fill="${i % 3 ? accent : fg}" opacity=".4"/>`;
            }
        if (style === 'grid') art = '<rect width="100" height="100" fill="url(#grid)"/>';
        if (name) {
            const size = Math.min(
                    width * 0.07,
                    height * 0.14,
                    (width * 1.35) / Math.max(12, [...name].length),
                ),
                y = height * (subtitle ? 0.78 : 0.84);
            caption = `<rect x="0" y="${y - size * 1.7}" width="${width}" height="${height - y + size * 1.7}" fill="${bg}" opacity=".92"/><text x="${width * 0.06}" y="${y}" fill="${fg}" font-family="sans-serif" font-size="${size}" font-weight="600">${label}</text>${subtitle ? `<text x="${width * 0.06}" y="${height * 0.9}" fill="${fg}" font-family="sans-serif" font-size="${Math.min(width * 0.035, height * 0.07, (width * 1.35) / Math.max(20, [...subtitle].length))}">${xmlEscape(subtitle)}</text>` : ''}`;
        }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${label || (avatar ? 'Generated avatar' : 'Generated illustration')}</title><defs><linearGradient id="wash" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${bg}"/><stop offset="1" stop-color="${accent}"/></linearGradient><pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="${fg}" opacity=".2" stroke-width=".35"/></pattern><clipPath id="clip"><rect width="100" height="100" rx="${radius}"/></clipPath></defs><g transform="scale(${width / 100} ${height / 100})" clip-path="url(#clip)"><rect width="100" height="100" fill="${bg}"/>${art}</g>${caption}</svg>`;
    return { svg, width, height, style, seed, palette };
}
export async function browserImage(id: string, input: string, options: OperationOptions) {
    const design = designImage(id, input, options),
        format = options.format ?? 'svg';
    if (!['svg', 'png'].includes(format)) throw new Error('Choose SVG or PNG.');
    if (format === 'svg')
        return artifact(
            id === 'test-media-sample-avatars' ? 'avatar.svg' : 'illustration.svg',
            'image/svg+xml',
            design.svg,
        );
    if (typeof document === 'undefined')
        throw new Error('PNG rendering requires the hosted API or a browser.');
    const url = URL.createObjectURL(new Blob([design.svg], { type: 'image/svg+xml' }));
    try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('Image preview took too long.')),
                10000,
            );
            image.onload = () => {
                clearTimeout(timer);
                resolve();
            };
            image.onerror = () => {
                clearTimeout(timer);
                reject(new Error('Unable to render the image. Try SVG export.'));
            };
            image.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = design.width;
        canvas.height = design.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas rendering is unavailable. Use SVG.');
        context.drawImage(image, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error('Unable to export PNG.'))),
                'image/png',
            ),
        );
        return artifact(
            id === 'test-media-sample-avatars' ? 'avatar.png' : 'illustration.png',
            'image/png',
            new Uint8Array(await blob.arrayBuffer()),
        );
    } finally {
        URL.revokeObjectURL(url);
    }
}
