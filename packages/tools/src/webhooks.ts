import { XMLParser, XMLValidator } from 'fast-xml-parser';
export async function parseWebhookBody(bytes: Uint8Array, contentType: string) {
    if (bytes.length > 102400) throw new Error('Body exceeds 100 KiB.');
    const type = contentType.split(';')[0]!.trim().toLowerCase();
    const text = new TextDecoder().decode(bytes);
    try {
        if (type === 'application/json' || type.endsWith('+json'))
            return { kind: 'JSON', data: JSON.parse(text) };
        if (type === 'application/x-www-form-urlencoded')
            return {
                kind: 'Form fields',
                fields: [...new URLSearchParams(text)].map(([name, value]) => ({ name, value })),
            };
        if (type === 'multipart/form-data') {
            const form = await new Response(new Blob([Uint8Array.from(bytes)]), {
                headers: { 'Content-Type': contentType },
            }).formData();
            const entries = [...form];
            return {
                kind: 'Multipart',
                parts: entries.slice(0, 100).map(([name, value]) =>
                    typeof value === 'string'
                        ? {
                              name,
                              kind: 'field',
                              value: value.slice(0, 4096),
                              truncated: value.length > 4096,
                          }
                        : {
                              name,
                              kind: 'file',
                              filename: value.name,
                              bytes: value.size,
                              mediaType: value.type || 'application/octet-stream',
                          },
                ),
                totalParts: entries.length,
                truncated: entries.length > 100,
            };
        }
        if (type === 'application/xml' || type === 'text/xml' || type.endsWith('+xml')) {
            if (/<!DOCTYPE|<!ENTITY/i.test(text))
                throw new Error('DTD and entity declarations are not parsed.');
            const valid = XMLValidator.validate(text);
            if (valid !== true)
                throw new Error(`Invalid XML at line ${valid.err.line}: ${valid.err.msg}`);
            return {
                kind: 'XML',
                data: new XMLParser({
                    ignoreAttributes: false,
                    processEntities: false,
                    maxNestedTags: 64,
                }).parse(text),
            };
        }
        if (type.startsWith('text/') || !type) {
            try {
                new TextDecoder('utf-8', { fatal: true }).decode(bytes);
                return { kind: 'Text', text };
            } catch {}
        }
        return {
            kind: 'Binary',
            bytes: bytes.length,
            mediaType: type || 'application/octet-stream',
            hex: Array.from(bytes.slice(0, 256), (byte) => byte.toString(16).padStart(2, '0')).join(
                ' ',
            ),
            truncated: bytes.length > 256,
        };
    } catch (error) {
        return {
            kind: 'Unparsed body',
            problem:
                error instanceof SyntaxError
                    ? 'Invalid JSON. Inspect the original bytes below.'
                    : error instanceof Error
                      ? error.message
                      : 'Unable to parse this content type.',
            text,
        };
    }
}
