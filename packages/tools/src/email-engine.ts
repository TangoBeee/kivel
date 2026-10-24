import type { ToolFile } from './engine.js';
import type { OperationOptions } from './definitions.js';
import { xmlEscape } from './artifacts.js';
export async function runEmail(
    id: string,
    input: string,
    options: OperationOptions,
    file?: ToolFile,
) {
    if (id === 'email-email-html-preview') {
        if (!input.trim()) throw new Error('Paste email HTML to preview.');
        return input;
    }
    if (id === 'email-email-template-tester') {
        if (!input.trim()) throw new Error('Paste an HTML email template.');
        let values: unknown;
        try {
            values = JSON.parse(options.values ?? '{}');
        } catch {
            throw new Error('Template values must be a JSON object of strings.');
        }
        if (
            !values ||
            typeof values !== 'object' ||
            Array.isArray(values) ||
            Object.keys(values).length > 100 ||
            Object.entries(values).some(
                ([key, value]) =>
                    !/^\w{1,64}$/.test(key) || typeof value !== 'string' || value.length > 4096,
            )
        )
            throw new Error(
                'Use up to 100 named string values, with simple letters, digits and underscores as keys.',
            );
        let renderedLength = input.length;
        const rendered = input.replace(/\{\{\s*(\w{1,64})\s*\}\}/g, (match, key: string) => {
            const value = Object.hasOwn(values as object, key)
                ? xmlEscape((values as Record<string, string>)[key]!)
                : match;
            renderedLength += value.length - match.length;
            if (renderedLength > 262144) throw new Error('Rendered HTML exceeds 256 KiB.');
            return value;
        });
        if (new TextEncoder().encode(rendered).length > 262144)
            throw new Error('Rendered HTML exceeds 256 KiB.');
        return rendered;
    }
    if (file && file.size > 1048576) throw new Error('Use an EML file up to 1 MiB.');
    const raw = file ? new Uint8Array(await file.arrayBuffer()) : new TextEncoder().encode(input);
    if (!raw.length) throw new Error('Paste a raw email or choose an EML file.');
    const { default: PostalMime } = await import('postal-mime');
    const email = await PostalMime.parse(raw, {
        attachmentEncoding: 'arraybuffer',
        maxNestingDepth: 16,
        maxHeadersSize: 65536,
        maxPartCount: 100,
        maxRfc822NestingDepth: 2,
        maxForwardedAddresses: 100,
    });
    if (!email.headers.length)
        throw new Error('No email headers found. Use raw RFC 822 / EML content.');
    if (id === 'email-email-verification-tester') {
        const content = `${email.text ?? ''}\n${email.html ?? ''}`;
        const links = [
            ...new Set(
                (content.match(/https?:\/\/[^\s<>"']+/gi) ?? []).map((value) =>
                    value.replace(/&amp;/g, '&').replace(/[.,);]+$/, ''),
                ),
            ),
        ].slice(0, 50);
        const codes = [
            ...new Set((email.text ?? email.html ?? '').match(/\b\d{4,8}\b/g) ?? []),
        ].slice(0, 20);
        return JSON.stringify(
            {
                subject: email.subject ?? '',
                recipient: email.to?.map((value) => value.address).join(', ') ?? '',
                codes,
                links: links.map((url) => ({ url })),
                note: 'Candidates only. Links were not opened and codes were not validated. Dates and other numbers can appear as code candidates.',
            },
            null,
            2,
        );
    }
    const attachments = await Promise.all(
        email.attachments.map(async (item) => {
            const bytes = new Uint8Array(item.content as ArrayBuffer),
                hash = await crypto.subtle.digest('SHA-256', bytes);
            return {
                filename: item.filename,
                mimeType: item.mimeType,
                disposition: item.disposition,
                contentId: item.contentId ?? null,
                bytes: bytes.length,
                sha256: Array.from(new Uint8Array(hash), (byte) =>
                    byte.toString(16).padStart(2, '0'),
                ).join(''),
            };
        }),
    );
    if (id === 'email-attachment-inspector')
        return JSON.stringify(
            {
                subject: email.subject ?? null,
                attachments,
                note: 'Names and MIME labels come from the message. Attachments are hashed without execution; this is not malware scanning.',
            },
            null,
            2,
        );
    return JSON.stringify(
        {
            from: email.from ?? null,
            to: email.to ?? [],
            cc: email.cc ?? [],
            bcc: email.bcc ?? [],
            subject: email.subject ?? null,
            date: email.date ?? null,
            messageId: email.messageId ?? null,
            headers: email.headers,
            text: email.text ?? '',
            html: email.html ?? '',
            attachments,
            note: 'Sender addresses, dates and authentication headers are untrusted message data. No DNS lookup, signature verification, delivery check or remote image request is performed.',
        },
        null,
        2,
    );
}
