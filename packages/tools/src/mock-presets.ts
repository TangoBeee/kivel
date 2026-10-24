import type { MockRoute } from './mock-config.js';
const route = (
    method: string,
    path: string,
    status: number,
    body: unknown,
    extra: Partial<MockRoute> = {},
): MockRoute => ({
    method,
    path,
    status,
    body: JSON.stringify(body, null, 2),
    headers: { 'content-type': 'application/json' },
    delayMs: 0,
    ...extra,
});
export function mockPreset(id: string): MockRoute[] | undefined {
    if (id === 'mock-apis-mock-response-templates')
        return [
            route(
                'GET',
                '/users/:id',
                200,
                { id: '{{path.id}}', name: '{{query.name}}' },
                { template: true },
            ),
            route('POST', '/greet', 200, { message: 'Hello {{body.name}}' }, { template: true }),
        ];
    if (id === 'mock-apis-authentication-mock')
        return [
            route(
                'GET',
                '/protected',
                200,
                { authenticated: true },
                {
                    condition: {
                        source: 'header',
                        key: 'authorization',
                        value: 'Bearer test-token',
                    },
                },
            ),
            route('GET', '/protected', 401, { error: 'Missing or incorrect test bearer token' }),
        ];
    if (id === 'mock-apis-graphql-mock')
        return [
            route(
                'POST',
                '/graphql',
                200,
                { data: { viewer: { id: 'user_test_1', name: 'Test user' } } },
                { condition: { source: 'body', key: 'operationName', value: 'GetViewer' } },
            ),
            route('POST', '/graphql', 200, {
                errors: [
                    { message: 'Use operationName GetViewer for the configured test response.' },
                ],
            }),
        ];
    if (id === 'mock-apis-third-party-api-simulator')
        return [
            route(
                'GET',
                '/users/:id',
                200,
                { id: '{{path.id}}', name: 'Test user', email: 'user@example.test' },
                { template: true },
            ),
            route(
                'GET',
                '/search',
                200,
                { query: '{{query.q}}', results: [{ id: 'item_test_1', title: 'Sample result' }] },
                { template: true },
            ),
            route('GET', '/unavailable', 503, { error: 'Simulated upstream unavailable' }),
        ];
    if (id === 'mock-apis-payment-api-sandbox')
        return [
            route('POST', '/payments/success', 201, {
                id: 'pay_test_success',
                status: 'succeeded',
                amount: 2000,
                currency: 'usd',
                livemode: false,
            }),
            route('POST', '/payments/decline', 402, {
                error: { code: 'card_declined', message: 'Simulated decline' },
                livemode: false,
            }),
            route('POST', '/payments/pending', 202, {
                id: 'pay_test_pending',
                status: 'processing',
                livemode: false,
            }),
            route('POST', '/refunds', 200, {
                id: 'refund_test',
                status: 'succeeded',
                livemode: false,
            }),
        ];
}
