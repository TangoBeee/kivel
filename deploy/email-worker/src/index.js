import { deliveryFeedback } from './feedback.js';
import PostalMime from 'postal-mime';

const MAX_RAW = 10 * 1024 * 1024;
const MAX_TEXT = 64 * 1024;
const encoder = new TextEncoder();

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

// Receives mail for the catch-all address, keeps only what agents need and hands it to socket.help.
export default {
    async email(message, env) {
        if (message.rawSize > MAX_RAW) {
            message.setReject('Message too large.');
            return;
        }
        const parsed = await PostalMime.parse(await new Response(message.raw).arrayBuffer());
        const body = JSON.stringify({
            to: message.to,
            feedback: deliveryFeedback(parsed, message.from),
            messageId: parsed.messageId,
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
        // Anything else unexpected makes Cloudflare report a temporary failure to the sender.
        else if (!response.ok) throw new Error(`socket.help ingest returned ${response.status}.`);
    },
};
