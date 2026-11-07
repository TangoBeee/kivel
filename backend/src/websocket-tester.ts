import WebSocket from 'ws';
import type { ClientOptions } from 'ws';
import type { RequestOptions } from 'node:http';
import { ToolExecutionError } from '@kivel/tools/node';
import type { OperationOptions } from '@kivel/tools/definitions';
import { publicUrl, resolvePublic } from './public-network.js';
import { webSocketMessageBytes } from './websocket-mock.js';

export async function testWebSocket(input: string, options: OperationOptions, signal: AbortSignal) {
    if (!/^wss?:\/\//i.test(input))
        throw new ToolExecutionError('Enter a public ws:// or wss:// URL.');
    const url = publicUrl(input.replace(/^ws/i, 'http'));
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const { body, secret, protocol } = options;
    if (secret && (url.protocol !== 'wss:' || !/^[A-Za-z0-9_-]{43}$/.test(secret)))
        throw new ToolExecutionError('Use a 43-character resource access token with a WSS URL.');
    if (protocol && (protocol.length > 100 || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(protocol)))
        throw new ToolExecutionError('Enter one valid WebSocket subprotocol.');
    const binary = options.format === 'base64';
    if (
        binary &&
        body &&
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body)
    )
        throw new ToolExecutionError('Enter a valid base64 message.');
    const payload = body ? Buffer.from(body, binary ? 'base64' : 'utf8') : undefined;
    const [address] = await resolvePublic(url.hostname, signal);
    if (signal.aborted) throw new ToolExecutionError('Request cancelled.', 'cancelled');

    return captureWebSocket(url, { address: address!.address, family: address!.family }, signal, {
        ...(protocol ? { protocol } : {}),
        ...(secret ? { secret } : {}),
        ...(payload ? { payload } : {}),
        binary,
    });
}

type Message = { atMs: number; bytes: number; encoding: 'text' | 'base64'; data: string };
type Capture = {
    connected: boolean;
    status: number | undefined;
    handshakeMs: number | undefined;
    protocol: string | undefined;
    messages: Message[];
    close: { code: number; reason: string } | undefined;
    stop: string | undefined;
    error: string | undefined;
    durationMs: number;
};

export function captureWebSocket(
    url: URL,
    address: { address: string; family: number },
    signal: AbortSignal,
    options: { protocol?: string; secret?: string; payload?: Buffer; binary?: boolean } = {},
) {
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const clientOptions: Omit<ClientOptions, 'agent'> & Pick<RequestOptions, 'lookup' | 'agent'> = {
        agent: false,
        family: address.family,
        lookup: (_host, config, callback) => {
            if (config.all) callback(null, [address]);
            else callback(null, address.address, address.family);
        },
        maxPayload: webSocketMessageBytes,
        maxBufferedChunks: 128,
        maxFragments: 128,
        perMessageDeflate: false,
        followRedirects: false,
        handshakeTimeout: 4000,
        headers: {
            'User-Agent': 'Kivel network tools (+https://kivel.io/contact/; support@kivel.io)',
            ...(options.secret ? { 'X-Access-Token': options.secret } : {}),
        },
    };
    const socket = new WebSocket(
        url,
        options.protocol ? [options.protocol] : [],
        clientOptions as ClientOptions,
    );
    const messages: Message[] = [];
    let handshakeMs: number | undefined;
    let status: number | undefined;
    let protocol: string | undefined;
    let stop: string | undefined;
    let error: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    return new Promise<Capture>((resolve) => {
        const cancel = () => socket.terminate();
        signal.addEventListener('abort', cancel, { once: true });
        socket.on('unexpected-response', (_request, response) => {
            status = response.statusCode;
            error = 'The server did not accept the WebSocket upgrade.';
            socket.terminate();
        });
        socket.on('error', (cause: NodeJS.ErrnoException) => {
            error ??=
                cause.code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'
                    ? 'The server sent a message larger than 16 KiB.'
                    : handshakeMs === undefined
                      ? 'Could not establish the WebSocket connection.'
                      : 'The WebSocket connection failed.';
        });
        socket.once('open', () => {
            status = 101;
            handshakeMs = elapsed();
            protocol = socket.protocol || undefined;
            if (options.payload) socket.send(options.payload, { binary: options.binary ?? false });
            timer = setTimeout(() => {
                stop = 'Capture window ended';
                socket.terminate();
            }, 3000).unref();
        });
        socket.on('message', (data, binary) => {
            if (stop) return;
            const buffer = data as Buffer;
            messages.push({
                atMs: elapsed(),
                bytes: buffer.length,
                encoding: binary ? 'base64' : 'text',
                data: buffer.toString(binary ? 'base64' : 'utf8'),
            });
            if (messages.length >= 10) {
                stop = 'Message limit reached';
                socket.terminate();
            }
        });
        socket.once('close', (code, reason) => {
            clearTimeout(timer);
            signal.removeEventListener('abort', cancel);
            resolve({
                connected: handshakeMs !== undefined,
                status,
                handshakeMs,
                protocol,
                messages,
                close:
                    handshakeMs !== undefined && !stop
                        ? { code, reason: reason.toString() }
                        : undefined,
                stop,
                error,
                durationMs: elapsed(),
            });
        });
        if (signal.aborted) cancel();
    });
}
