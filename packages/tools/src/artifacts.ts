import { GENERATED_FILE_BYTES } from './media-limits.js';
export interface GeneratedArtifact {
    kind: 'file';
    filename: string;
    mediaType: string;
    bytes: number;
    base64: string;
    previewText?: string;
}
export function artifact(filename: string, mediaType: string, value: string | Uint8Array): string {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    if (bytes.length > GENERATED_FILE_BYTES) throw new Error('Generated file exceeds 5 MiB.');
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return JSON.stringify(
        { kind: 'file', filename, mediaType, bytes: bytes.length, base64: btoa(binary) },
        null,
        2,
    );
}
export function xmlEscape(text: string): string {
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(text))
        throw new Error('The label contains characters that XML cannot represent.');
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}
export function samplePdf(text: string, pages: number): Uint8Array {
    if (text.length > 1000 || /[^\x09\x0a\x0d\x20-\x7e]/.test(text))
        throw new Error('PDF sample text supports up to 1,000 ASCII characters.');
    const escape = (value: string) => value.replace(/[\\()]/g, '\\$&');
    const lines = (text || 'Kivel sample document')
        .replace(/\r\n?/g, '\n')
        .replace(/\t/g, '    ')
        .split('\n')
        .flatMap((line) => line.match(/.{1,80}/g) ?? ['']);
    if (lines.length > 40) throw new Error('Use at most 40 wrapped lines per sample page.');
    const objects = ['', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    const kids: string[] = [];
    for (let index = 0; index < pages; index++) {
        const pageId = objects.length + 1,
            contentId = pageId + 1;
        kids.push(`${pageId} 0 R`);
        const content = `BT /F1 12 Tf 50 740 Td 16 TL\n${lines.map((line, position) => `${position ? 'T* ' : ''}(${escape(line)}) Tj`).join('\n')}\nT* (Page ${index + 1} of ${pages}) Tj ET\n`;
        objects.push(
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
        );
        objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
    }
    objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[1] = `<< /Type /Pages /Count ${pages} /Kids [${kids.join(' ')}] >>`;
    let output = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(output.length);
        output += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = output.length;
    output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
        .join(
            '',
        )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new TextEncoder().encode(output);
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
function crc32(bytes: Uint8Array) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
export function zipTextFiles(value: unknown): Uint8Array {
    if (!Array.isArray(value) || !value.length || value.length > 20)
        throw new Error('Provide one to 20 files as a JSON array.');
    const files: { name: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = [];
    const names = new Set<string>();
    let localSize = 0,
        totalBytes = 0;
    for (const item of value) {
        if (
            !item ||
            typeof item !== 'object' ||
            typeof item.name !== 'string' ||
            typeof item.text !== 'string' ||
            Object.keys(item).some((key) => !['name', 'text'].includes(key))
        )
            throw new Error('Each file needs only a name and a text string.');
        const name = item.name;
        if (
            !name ||
            name.length > 150 ||
            /[\\:\x00-\x1f\x7f]/.test(name) ||
            name.startsWith('/') ||
            name.endsWith('/') ||
            name.split('/').some((part: string) => !part || part === '.' || part === '..') ||
            names.has(name)
        )
            throw new Error(
                'Use unique relative file paths without traversal or control characters.',
            );
        names.add(name);
        const encoded = new TextEncoder().encode(name),
            data = new TextEncoder().encode(item.text);
        totalBytes += data.length;
        if (totalBytes > 262144) throw new Error('ZIP text exceeds 256 KiB.');
        files.push({ name: encoded, data, crc: crc32(data), offset: localSize });
        localSize += 30 + encoded.length + data.length;
    }
    const centralSize = files.reduce((sum, file) => sum + 46 + file.name.length, 0),
        output = new Uint8Array(localSize + centralSize + 22),
        view = new DataView(output.buffer);
    let offset = 0;
    for (const file of files) {
        view.setUint32(offset, 0x04034b50, true);
        view.setUint16(offset + 4, 20, true);
        view.setUint16(offset + 6, 0x800, true);
        view.setUint16(offset + 12, 0x5821, true);
        view.setUint32(offset + 14, file.crc, true);
        view.setUint32(offset + 18, file.data.length, true);
        view.setUint32(offset + 22, file.data.length, true);
        view.setUint16(offset + 26, file.name.length, true);
        output.set(file.name, offset + 30);
        output.set(file.data, offset + 30 + file.name.length);
        offset += 30 + file.name.length + file.data.length;
    }
    for (const file of files) {
        view.setUint32(offset, 0x02014b50, true);
        view.setUint16(offset + 4, 20, true);
        view.setUint16(offset + 6, 20, true);
        view.setUint16(offset + 8, 0x800, true);
        view.setUint16(offset + 14, 0x5821, true);
        view.setUint32(offset + 16, file.crc, true);
        view.setUint32(offset + 20, file.data.length, true);
        view.setUint32(offset + 24, file.data.length, true);
        view.setUint16(offset + 28, file.name.length, true);
        view.setUint32(offset + 42, file.offset, true);
        output.set(file.name, offset + 46);
        offset += 46 + file.name.length;
    }
    view.setUint32(offset, 0x06054b50, true);
    view.setUint16(offset + 8, files.length, true);
    view.setUint16(offset + 10, files.length, true);
    view.setUint32(offset + 12, centralSize, true);
    view.setUint32(offset + 16, localSize, true);
    return output;
}
export function toneWav(frequency: number, duration: number): Uint8Array {
    if (
        !Number.isFinite(frequency) ||
        frequency < 20 ||
        frequency > 7500 ||
        !Number.isFinite(duration) ||
        duration < 0.1 ||
        duration > 5
    )
        throw new Error('Use 20–7,500 Hz and 0.1–5 seconds.');
    const rate = 16000,
        samples = Math.round(duration * rate),
        output = new Uint8Array(44 + samples * 2),
        view = new DataView(output.buffer);
    const text = (offset: number, value: string) =>
        output.set(new TextEncoder().encode(value), offset);
    text(0, 'RIFF');
    view.setUint32(4, output.length - 8, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, samples * 2, true);
    for (let i = 0; i < samples; i++) {
        const envelope = Math.min(1, i / 160, (samples - 1 - i) / 160);
        view.setInt16(
            44 + i * 2,
            Math.round(Math.sin((2 * Math.PI * frequency * i) / rate) * 8191 * envelope),
            true,
        );
    }
    return output;
}
