export interface LlmMockConfig {
    provider: 'openai' | 'anthropic';
    model: string;
    text: string;
    intervalMs: number;
    interruptAfterChunks?: number;
}
export function validateLlmMock(value: unknown): LlmMockConfig {
    const input = value as Partial<LlmMockConfig> | null;
    if (
        !input ||
        !['openai', 'anthropic'].includes(input.provider ?? '') ||
        typeof input.text !== 'string' ||
        !input.text.trim() ||
        Array.from(input.text).length > 8192 ||
        typeof input.model !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(input.model)
    )
        throw new Error(
            'Choose OpenAI or Anthropic, a model label and 1–8192 characters of scripted response text.',
        );
    if (
        Object.keys(input).some(
            (key) =>
                !['provider', 'model', 'text', 'intervalMs', 'interruptAfterChunks'].includes(key),
        )
    )
        throw new Error('Unknown LLM configuration field.');
    const intervalMs = input.intervalMs ?? 20;
    const chunks = Math.ceil(Array.from(input.text).length / 64);
    if (
        !Number.isInteger(intervalMs) ||
        intervalMs < 0 ||
        intervalMs > 250 ||
        (chunks - 1) * intervalMs > 5000
    )
        throw new Error(
            'Use a 0–250 ms interval and keep the stream within five seconds. Reduce the interval or text length.',
        );
    if (
        input.interruptAfterChunks !== undefined &&
        (!Number.isInteger(input.interruptAfterChunks) ||
            input.interruptAfterChunks < 1 ||
            input.interruptAfterChunks > chunks)
    )
        throw new Error(`interruptAfterChunks must be between 1 and ${chunks}.`);
    return {
        provider: input.provider!,
        model: input.model,
        text: input.text,
        intervalMs,
        ...(input.interruptAfterChunks !== undefined
            ? { interruptAfterChunks: input.interruptAfterChunks }
            : {}),
    };
}

export const llmMockSchema = {
    type: 'object',
    required: ['provider', 'model', 'text'],
    additionalProperties: false,
    properties: {
        provider: { type: 'string', enum: ['openai', 'anthropic'] },
        model: { type: 'string', minLength: 1, maxLength: 80 },
        text: { type: 'string', minLength: 1, maxLength: 8192 },
        intervalMs: { type: 'integer', minimum: 0, maximum: 250, default: 20 },
        interruptAfterChunks: {
            type: 'integer',
            minimum: 1,
            maximum: 128,
            description: 'End without a completion event after this many 64-character text chunks.',
        },
    },
    description:
        'Text-only OpenAI Chat Completions or Anthropic Messages test double. Empty routes required. Estimated usage; streams are limited to five seconds. Does not run a model or execute tools.',
} as const;
