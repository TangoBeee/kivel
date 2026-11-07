import { deliveryFeedback } from './feedback.js';

const MAX_RAW = 5 * 1024 * 1024;
const MAX_TEXT = 64 * 1024;
const encoder = new TextEncoder();
function base64(content) {
    const bytes = new Uint8Array(content);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return btoa(binary);
}

async function sign(secret, payload) {
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return [...new Uint8Array(signature)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

// Receives mail for the catch-all address, keeps only what agents need and hands it to Kivel.
export function createEmailWorker(parse) {
    return {
        async email(message, env) {
            if (message.rawSize > MAX_RAW) {
                message.setReject('Message too large.');
                return;
            }
            const parsed = await parse(await new Response(message.raw).arrayBuffer());
            if ((parsed.attachments ?? []).length > 20) {
                message.setReject('Too many attachments. Maximum 20 per message.');
                return;
            }
            const body = JSON.stringify({
                rawSize: message.rawSize,
                to: message.to,
                mailFrom: message.from,
                feedback: deliveryFeedback(parsed, message.from),
                messageId: parsed.messageId,
                cc: (parsed.cc ?? []).flatMap((mailbox) => mailbox.address ?? []).slice(0, 30),
                inReplyTo: parsed.inReplyTo,
                references:
                    typeof parsed.references === 'string'
                        ? (parsed.references.match(/<[^<>]+>/g) ?? [])
                        : [],
                from: parsed.from?.address
                    ? `${parsed.from.name ? `${parsed.from.name} ` : ''}<${parsed.from.address}>`
                    : message.from,
                subject: (parsed.subject ?? '').slice(0, 998),
                text: (parsed.text ?? '').slice(0, MAX_TEXT),
                html: (parsed.html ?? '').slice(0, MAX_TEXT),
                attachments: (parsed.attachments ?? []).slice(0, 20).map((item) => ({
                    filename: item.filename ?? '',
                    mimeType: item.mimeType ?? '',
                    size: item.content?.byteLength ?? 0,
                    base64: base64(item.content ?? new ArrayBuffer(0)),
                })),
            });
            const timestamp = String(Math.floor(Date.now() / 1000));
            const response = await fetch(env.INGEST_URL, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-socket-timestamp': timestamp,
                    'x-socket-signature': `sha256=${await sign(env.EMAIL_INGEST_SECRET, `${timestamp}.${body}`)}`,
                },
                body,
            });
            if (response.status === 404) message.setReject('No such mailbox.');
            else if (response.status === 429) message.setReject('Mailbox is full.');
            else if (response.status === 413)
                message.setReject('Message or attachment storage limit exceeded.');
            // Anything else unexpected makes Cloudflare report a temporary failure to the sender.
            else if (!response.ok) throw new Error(`Kivel ingest returned ${response.status}.`);
        },
    };
}
