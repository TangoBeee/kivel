import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { LlmMockConfig } from '@kivel/tools/llm-mock';

export function sendLlmMock(
    config: LlmMockConfig,
    path: string,
    request: FastifyRequest,
    reply: FastifyReply,
    streams: Set<AbortController>,
) {
    const anthropic = config.provider === 'anthropic';
    const fail = (status: number, message: string) =>
        reply.code(status).send(
            anthropic
                ? { type: 'error', error: { type: 'invalid_request_error', message } }
                : {
                      error: {
                          message,
                          type: 'invalid_request_error',
                          code: null,
                          param: null,
                      },
                  },
        );
    if (request.method !== 'POST' || path !== (anthropic ? '/v1/messages' : '/v1/chat/completions'))
        return fail(404, 'Use the configured provider POST endpoint under /v1.');
    let body: Record<string, unknown>;
    try {
        body = Buffer.isBuffer(request.body)
            ? JSON.parse(request.body.toString('utf8'))
            : (request.body as Record<string, unknown>);
    } catch {
        return fail(400, 'Provide a JSON messages request.');
    }
    if (
        !body ||
        !Array.isArray(body.messages) ||
        !body.messages.length ||
        typeof body.model !== 'string' ||
        !body.model ||
        (body.stream !== undefined && typeof body.stream !== 'boolean')
    )
        return fail(400, 'Provide model, a nonempty messages array and optional boolean stream.');
    const maximum = body.max_completion_tokens ?? body.max_tokens;
    if (
        (anthropic || maximum !== undefined) &&
        (!Number.isInteger(maximum) || Number(maximum) < 1 || Number(maximum) > 8192)
    )
        return fail(400, 'max_tokens must be between 1 and 8192.');
    const text = Array.from(config.text)
        .slice(0, maximum === undefined ? undefined : Number(maximum) * 4)
        .join('');
    const limited = text.length < config.text.length;
    const tokens = Math.ceil(Array.from(text).length / 4);
    const inputTokens = Math.ceil(JSON.stringify(body.messages).length / 4);
    const id = `${anthropic ? 'msg' : 'chatcmpl'}_mock_${randomUUID().replaceAll('-', '')}`;
    const created = Math.floor(Date.now() / 1000);
    reply.header('X-Socket-Mock', 'llm-text-only').header('X-Mock-Usage', 'estimated');
    if (!body.stream)
        return reply.send(
            anthropic
                ? {
                      id,
                      type: 'message',
                      role: 'assistant',
                      content: [{ type: 'text', text }],
                      model: config.model,
                      stop_reason: limited ? 'max_tokens' : 'end_turn',
                      stop_sequence: null,
                      usage: { input_tokens: inputTokens, output_tokens: tokens },
                  }
                : {
                      id,
                      object: 'chat.completion',
                      created,
                      model: config.model,
                      choices: [
                          {
                              index: 0,
                              message: { role: 'assistant', content: text, refusal: null },
                              finish_reason: limited ? 'length' : 'stop',
                              logprobs: null,
                          },
                      ],
                      usage: {
                          prompt_tokens: inputTokens,
                          completion_tokens: tokens,
                          total_tokens: inputTokens + tokens,
                      },
                      system_fingerprint: 'kivel-mock',
                  },
        );
    if (streams.size >= 16)
        return reply
            .code(503)
            .header('Retry-After', '5')
            .send({ error: 'Stream capacity reached.' });
    const controller = new AbortController(),
        abort = () => controller.abort();
    streams.add(controller);
    const event = (type: string, data: unknown) =>
        `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    const chunk = (delta: object, finish: string | null = null) =>
        `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: config.model, choices: [{ index: 0, delta, finish_reason: finish, logprobs: null }] })}\n\n`;
    const characters = Array.from(text);
    const output = Readable.from(
        (async function* () {
            if (anthropic) {
                yield event('message_start', {
                    type: 'message_start',
                    message: {
                        id,
                        type: 'message',
                        role: 'assistant',
                        model: config.model,
                        content: [],
                        stop_reason: null,
                        stop_sequence: null,
                        usage: { input_tokens: inputTokens, output_tokens: 0 },
                    },
                });
                yield event('content_block_start', {
                    type: 'content_block_start',
                    index: 0,
                    content_block: { type: 'text', text: '' },
                });
            } else yield chunk({ role: 'assistant', content: '' });
            for (let offset = 0, count = 0; offset < characters.length; offset += 64) {
                if (count++)
                    await delay(config.intervalMs, undefined, { signal: controller.signal });
                if (controller.signal.aborted) return;
                const piece = characters.slice(offset, offset + 64).join('');
                yield anthropic
                    ? event('content_block_delta', {
                          type: 'content_block_delta',
                          index: 0,
                          delta: { type: 'text_delta', text: piece },
                      })
                    : chunk({ content: piece });
                if (config.interruptAfterChunks === count) return;
            }
            if (anthropic) {
                yield event('content_block_stop', { type: 'content_block_stop', index: 0 });
                yield event('message_delta', {
                    type: 'message_delta',
                    delta: {
                        stop_reason: limited ? 'max_tokens' : 'end_turn',
                        stop_sequence: null,
                    },
                    usage: { output_tokens: tokens },
                });
                yield event('message_stop', { type: 'message_stop' });
            } else {
                yield chunk({}, limited ? 'length' : 'stop');
                if ((body.stream_options as { include_usage?: boolean } | undefined)?.include_usage)
                    yield `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: config.model, choices: [], usage: { prompt_tokens: inputTokens, completion_tokens: tokens, total_tokens: inputTokens + tokens } })}\n\n`;
                yield 'data: [DONE]\n\n';
            }
        })(),
        { signal: controller.signal },
    );
    request.raw.once('aborted', abort);
    reply.raw.once('close', abort);
    output.once('close', () => {
        streams.delete(controller);
        request.raw.removeListener('aborted', abort);
        reply.raw.removeListener('close', abort);
        controller.abort();
    });
    return reply.type('text/event-stream').header('X-Accel-Buffering', 'no').send(output);
}
