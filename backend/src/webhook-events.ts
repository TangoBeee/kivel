import { createHmac, randomUUID } from 'node:crypto';
import type { OperationOptions } from '@kivel/tools/definitions';
import { ToolExecutionError } from '@kivel/tools/node';
import { publicRequest, publicUrl } from './public-network.js';

const types = {
    stripe: ['checkout.session.completed', 'payment_intent.succeeded', 'invoice.paid'],
    github: ['push', 'pull_request'],
    shopify: ['orders/create', 'orders/paid'],
} as const;
export function webhookEvent(
    options: OperationOptions,
    now = Date.now(),
    id: string = randomUUID(),
) {
    const provider = options.mode ?? 'stripe';
    if (!Object.hasOwn(types, provider))
        throw new ToolExecutionError('Choose Stripe, GitHub or Shopify.');
    const supported = types[provider as keyof typeof types] as readonly string[];
    const eventType =
        !options.action || options.action === 'default' ? supported[0]! : options.action;
    if (!supported.includes(eventType))
        throw new ToolExecutionError('Choose an event type supported by this provider.');
    const secret = options.secret ?? '';
    if (!secret || Buffer.byteLength(secret) > 256)
        throw new ToolExecutionError('secret is required and must be 1–256 bytes.');
    const timestamp = Math.floor(now / 1000);
    let payload: unknown;
    if (options.body?.trim()) {
        try {
            payload = JSON.parse(options.body);
        } catch {
            throw new ToolExecutionError('Custom payload must be a JSON object.');
        }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload))
            throw new ToolExecutionError('Custom payload must be a JSON object.');
        if (provider === 'stripe' && (payload as { type?: unknown }).type !== eventType)
            throw new ToolExecutionError(
                'Custom Stripe payload.type must match the selected event type.',
            );
    } else if (provider === 'stripe') {
        const object = eventType.startsWith('checkout')
            ? {
                  id: `cs_test_${id.replaceAll('-', '')}`,
                  object: 'checkout.session',
                  mode: 'payment',
                  payment_status: 'paid',
                  status: 'complete',
                  currency: 'usd',
                  amount_total: 2000,
                  customer: 'cus_test_fixture',
                  metadata: { source: 'kivel-test' },
              }
            : eventType.startsWith('invoice')
              ? {
                    id: 'in_test_fixture',
                    object: 'invoice',
                    status: 'paid',
                    currency: 'usd',
                    amount_paid: 2000,
                    customer: 'cus_test_fixture',
                }
              : {
                    id: 'pi_test_fixture',
                    object: 'payment_intent',
                    status: 'succeeded',
                    currency: 'usd',
                    amount: 2000,
                };
        payload = {
            id: `evt_test_${id.replaceAll('-', '')}`,
            object: 'event',
            created: timestamp,
            livemode: false,
            type: eventType,
            data: { object },
            pending_webhooks: 1,
        };
    } else if (provider === 'github') {
        const repository = {
            id: 1,
            name: 'fixture-repo',
            full_name: 'test-owner/fixture-repo',
            private: true,
            html_url: 'https://github.com/test-owner/fixture-repo',
        };
        payload =
            eventType === 'push'
                ? {
                      ref: 'refs/heads/main',
                      before: '0'.repeat(40),
                      after: 'a'.repeat(40),
                      repository,
                      pusher: { name: 'test-user', email: 'test-user@example.com' },
                      sender: { login: 'test-user', id: 1 },
                      commits: [
                          {
                              id: 'a'.repeat(40),
                              message: 'Synthetic webhook fixture',
                              timestamp: new Date(now).toISOString(),
                              author: { name: 'Test user', email: 'test-user@example.com' },
                          },
                      ],
                  }
                : {
                      action: 'opened',
                      number: 42,
                      pull_request: {
                          id: 42,
                          number: 42,
                          state: 'open',
                          title: 'Synthetic pull request',
                          head: { ref: 'feature', sha: 'a'.repeat(40) },
                          base: { ref: 'main', sha: 'b'.repeat(40) },
                      },
                      repository,
                      sender: { login: 'test-user', id: 1 },
                  };
    } else
        payload = {
            id: 123456789,
            name: '#1001',
            email: 'customer@example.com',
            created_at: new Date(now).toISOString(),
            currency: 'USD',
            total_price: '20.00',
            financial_status: 'paid',
            test: true,
            line_items: [{ id: 1, title: 'Test item', quantity: 1, price: '20.00' }],
        };
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-kivel-synthetic-event': 'true',
    };
    if (provider === 'stripe')
        headers['stripe-signature'] =
            `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
    else if (provider === 'github') {
        headers['x-github-event'] = eventType;
        headers['x-github-delivery'] = id;
        headers['x-hub-signature-256'] =
            `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    } else {
        headers['x-shopify-topic'] = eventType;
        headers['x-shopify-shop-domain'] = 'kivel-fixture.myshopify.com';
        headers['x-shopify-webhook-id'] = id;
        headers['x-shopify-hmac-sha256'] = createHmac('sha256', secret)
            .update(body)
            .digest('base64');
    }
    return { provider, eventType, body, headers };
}
export async function simulateWebhook(
    input: string,
    options: OperationOptions,
    signal: AbortSignal,
    send = publicRequest,
) {
    const target = publicUrl(input);
    const event = webhookEvent(options);
    const response = await send(target.href, signal, {
        method: 'POST',
        headers: event.headers,
        requestBody: event.body,
        limit: 65536,
    });
    return {
        kind: 'webhook-event',
        delivered: response.status >= 200 && response.status < 300,
        provider: event.provider,
        eventType: event.eventType,
        request: {
            method: 'POST',
            url: target.href,
            headers: event.headers,
            body: JSON.parse(event.body),
        },
        response: {
            status: response.status,
            durationMs: Math.round(response.timings.totalMs),
            headers: response.headers,
            body: response.body.toString('utf8'),
            truncated: response.truncated,
        },
        note: `The target returned HTTP ${response.status}. ${response.status >= 200 && response.status < 300 ? 'It accepted the signed synthetic event.' : 'It did not accept the signed synthetic event.'} The test signature does not establish provider origin.`,
    };
}
