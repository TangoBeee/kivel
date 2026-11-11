import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { buildApp } from './app.js';
import { ResourceStore } from './resources.js';
import { MemoryIdentityRepository } from './identity.js';
import { MemoryApprovals } from './approvals.js';
import { checkoutCards } from '@kivel.io/tools/test-payments';
import { plans } from '@kivel.io/tools/plans';

async function fixture(t: { after(fn: () => Promise<unknown>): void }) {
    const identities = new MemoryIdentityRepository(),
        resources = new ResourceStore(),
        approvals = new MemoryApprovals();
    const user = identities.register('payment-owner', 'test')!;
    identities.setEntitlement(
        user.personalAccountId,
        'team',
        new Date(Date.now() + 86400000).toISOString(),
    );
    function session(subject = user, account = subject.personalAccountId) {
        const token = randomBytes(32).toString('base64url');
        identities.createSession(subject.id, account, token);
        return { origin: 'http://localhost:3000', cookie: `kivel_session=${token}` };
    }
    const human = session(),
        identity = identities.authenticateSession(human.cookie.split('=')[1]!)!;
    const key = identities.createKey(
        identity,
        'Payment agent',
        ['resources:read', 'resources:write', 'account:read'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    const agent = { authorization: `Bearer ${key.key}` };
    const readKey = identities.createKey(
        identity,
        'Reader',
        ['resources:read'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    const read = { authorization: `Bearer ${readKey.key}` };
    const outsider = session(identities.register('payment-outsider', 'test')!);
    async function member(role: 'admin' | 'viewer' | 'member') {
        const invited = identities.register(`payment-${role}`, 'test')!,
            token = randomUUID();
        identities.invite(user.personalAccountId, invited.username, role, token);
        identities.acceptInvite(invited.id, invited.username, token);
        return session(invited, user.personalAccountId);
    }
    const deliveries: { body: string; signature: string }[] = [];
    let attempts = 0;
    const app = buildApp({
        identityStore: identities,
        resourceStore: resources,
        approvalStore: approvals,
        authSecret: 'test-payments-secret-with-enough-entropy',
        forwardDelays: [0, 0, 0],
        forwardSend: async (_url, _signal, input) => {
            deliveries.push({
                body: input.requestBody!,
                signature: input.headers['x-kivel-signature']!,
            });
            return { status: ++attempts === 1 ? 503 : 200 };
        },
    });
    t.after(() => app.close());
    const post = (url: string, payload: object, headers: Record<string, string> = agent) =>
        app.inject({ method: 'POST', url, headers, payload });
    const get = (url: string, headers: Record<string, string> = agent) =>
        app.inject({ method: 'GET', url, headers });
    async function create(kind: string, body: object, headers: Record<string, string> = agent) {
        const response = await post(`/api/test-${kind}`, body, headers);
        assert.equal(response.statusCode, 201, response.body);
        return response.json();
    }
    return {
        app,
        resources,
        approvals,
        human,
        agent,
        read,
        outsider,
        member,
        post,
        get,
        create,
        deliveries,
        owner: user.personalAccountId,
    };
}

test('test wallets enforce human-only controls, permissions, isolation and existing resource lifecycle', async (t) => {
    const f = await fixture(t);
    assert.equal(
        (await f.post('/api/test-wallets', { name: 'Forbidden', perPaymentLimit: 100 })).statusCode,
        403,
    );
    const wallet = await f.create('wallets', { name: 'Agent wallet', balance: 100 });
    assert.equal(wallet.perPaymentLimit, plans.team.testPayments.perPayment);
    assert.equal(wallet.testMode, true);
    for (const headers of [f.agent, f.read, await f.member('viewer'), await f.member('member')]) {
        assert.equal(
            (
                await f.app.inject({
                    method: 'PATCH',
                    url: `/api/test-wallets/${wallet.id}`,
                    headers,
                    payload: { approvalThreshold: 100 },
                })
            ).statusCode,
            403,
        );
    }
    for (const headers of [f.human, await f.member('admin')])
        assert.equal(
            (
                await f.app.inject({
                    method: 'PATCH',
                    url: `/api/test-wallets/${wallet.id}`,
                    headers,
                    payload: { perPaymentLimit: 10, dailyLimit: 20, approvalThreshold: 5 },
                })
            ).statusCode,
            200,
        );
    assert.equal((await f.get(`/api/test-wallets/${wallet.id}`, f.outsider)).statusCode, 404);
    assert.equal(
        (
            await f.post(
                `/api/test-wallets/${wallet.id}/pay`,
                { payee: 'test store', amount: 1, idempotencyKey: 'read' },
                f.read,
            )
        ).statusCode,
        403,
    );
    assert.equal(
        (
            await f.app.inject({
                method: 'PUT',
                url: `/api/mocks/${wallet.id}`,
                headers: f.agent,
                payload: { name: 'Bypass', routes: [] },
            })
        ).statusCode,
        400,
    );
    assert.equal(
        (await f.post(`/api/mocks/${wallet.id}/sharing`, { visibility: 'public' })).statusCode,
        400,
    );
    assert.equal((await f.get(`/mock/${wallet.id}`)).statusCode, 404);
    const deleted = await f.app.inject({
        method: 'DELETE',
        url: `/api/mocks/${wallet.id}`,
        headers: f.agent,
    });
    assert.equal(deleted.statusCode, 204);
    assert.equal((await f.get(`/api/test-wallets/${wallet.id}`)).statusCode, 404);
});

test('wallet approvals are owner/admin browser-only, caller-bound and debit once with a refusal ledger', async (t) => {
    const f = await fixture(t),
        wallet = await f.create(
            'wallets',
            {
                name: 'Approval wallet',
                balance: 30,
                perPaymentLimit: 10,
                dailyLimit: 15,
                approvalThreshold: 2,
            },
            f.human,
        );
    const payment = {
        payee: 'Test research',
        amount: 5,
        memo: 'fixture',
        idempotencyKey: 'approval-test',
    };
    const pending = await f.post(`/api/test-wallets/${wallet.id}/pay`, payment);
    assert.equal(pending.statusCode, 202, pending.body);
    const approvalId = pending.json().approvalId;
    for (const headers of [f.agent, f.read, await f.member('viewer'), await f.member('member')])
        assert.equal(
            (await f.post(`/api/approvals/${approvalId}/answer`, { answer: 'Approve' }, headers))
                .statusCode,
            403,
        );
    assert.equal(
        (
            await f.post(
                `/api/approvals/${approvalId}/answer`,
                { answer: 'Approve' },
                await f.member('admin'),
            )
        ).statusCode,
        200,
    );
    const responses = await Promise.all(
        Array.from({ length: 4 }, () => f.post(`/api/test-wallets/${wallet.id}/pay`, payment)),
    );
    assert.ok(
        responses.every((response) => response.statusCode === 200),
        responses.map((response) => response.body).join('\n'),
    );
    assert.equal((await f.get(`/api/test-wallets/${wallet.id}`)).json().balance, 25);
    assert.equal(
        (await f.post(`/api/test-wallets/${wallet.id}/pay`, { ...payment, amount: 6 })).statusCode,
        409,
    );
    assert.equal(
        (
            await f.post(`/api/test-wallets/${wallet.id}/pay`, {
                ...payment,
                idempotencyKey: 'too-large',
                amount: 11,
            })
        ).statusCode,
        403,
    );
    const ledger = (await f.get(`/api/test-wallets/${wallet.id}/transactions`)).json().transactions;
    assert.equal(ledger.length, 2);
    assert.equal(ledger[0].reason, 'Per-payment limit exceeded.');
    assert.ok(ledger[1].events.some((event: { status: string }) => event.status === 'approved'));
    assert.equal(
        (await f.post(`/api/test-wallets/${wallet.id}/top-up`, { amount: 10 })).json().balance,
        35,
    );
});

test('paywall issues x402 v1 requirements and HMAC wallet tokens, rejecting replay, wrong target and changed limits', async (t) => {
    const f = await fixture(t),
        wallet = await f.create('wallets', { name: 'Wallet' }),
        paywall = await f.create('paywalls', {
            name: 'Article',
            amount: 1,
            response: { status: 200, body: { content: 'Test article' } },
        });
    const path = `/pay/${paywall.id}/article?format=json`;
    const required = await f.get(path);
    assert.equal(required.statusCode, 402);
    assert.equal(required.json().accepts[0].network, 'base-sepolia');
    const input = {
        payee: `http://localhost:3000${path}`,
        idempotencyKey: 'paywall',
        authorizeOnly: true,
    };
    const authorized = await f.post(`/api/test-wallets/${wallet.id}/pay`, input);
    assert.equal(authorized.statusCode, 200, authorized.body);
    assert.equal(authorized.json().status, 'authorized');
    const token = authorized.json().paymentHeader;
    assert.equal(Buffer.from(token, 'base64').toString().includes(f.owner), false);
    assert.equal((await f.get(`/pay/${paywall.id}/other`, { 'x-payment': token })).statusCode, 403);
    const content = await f.get(path, { 'x-payment': token });
    assert.equal(content.statusCode, 200, content.body);
    assert.deepEqual(content.json(), { content: 'Test article' });
    assert.equal(
        JSON.parse(Buffer.from(String(content.headers['x-payment-response']), 'base64').toString())
            .testMode,
        true,
    );
    assert.equal((await f.get(path, { 'x-payment': token })).statusCode, 409);
    assert.equal((await f.get(`/api/test-wallets/${wallet.id}`)).json().balance, 99);
    const second = (
        await f.post(`/api/test-wallets/${wallet.id}/pay`, { ...input, idempotencyKey: 'changed' })
    ).json();
    await f.app.inject({
        method: 'PATCH',
        url: `/api/test-wallets/${wallet.id}`,
        headers: f.human,
        payload: { perPaymentLimit: 0 },
    });
    assert.equal((await f.get(path, { 'x-payment': second.paymentHeader })).statusCode, 409);
    const inspected = await f.get(`/api/mocks/${paywall.id}/calls`);
    assert.ok(inspected.json().calls.length >= 4, inspected.body);
});

test('permissive paywalls validate structure without claiming settlement', async (t) => {
    const f = await fixture(t),
        paywall = await f.create('paywalls', {
            name: 'Permissive',
            amount: 1,
            modes: ['permissive'],
        });
    const payload = {
        x402Version: 1,
        scheme: 'exact',
        network: 'base-sepolia',
        payload: {
            signature: `0x${'a'.repeat(130)}`,
            authorization: {
                from: `0x${'1'.repeat(40)}`,
                to: `0x${'2'.repeat(40)}`,
                value: '1000000',
                validAfter: '0',
                validBefore: '9999999999',
                nonce: `0x${'3'.repeat(64)}`,
            },
        },
    };
    assert.equal(
        (
            await f.get(`/pay/${paywall.id}`, {
                'x-payment': Buffer.from(JSON.stringify(payload)).toString('base64'),
            })
        ).statusCode,
        200,
    );
    assert.equal(
        (await f.get(`/pay/${paywall.id}`, { 'x-payment': Buffer.from('{}').toString('base64') }))
            .statusCode,
        400,
    );
});

test('checkout pages never collect cards, all outcomes work, secrets stay private and webhooks retry with a valid signature', async (t) => {
    const f = await fixture(t),
        checkout = await f.create('checkouts', {
            name: 'Demo',
            item: '<script>bad</script>',
            description: 'Fixture',
            amount: 5,
            webhookUrl: 'https://hooks.example.org/payment',
            successUrl: 'https://example.org/done',
        });
    const raw = await f.resources.read(checkout.id, 'mock', '', f.owner);
    assert.ok(raw && !JSON.stringify(raw).includes(checkout.webhookSecret));
    for (const path of [`/api/test-checkouts/${checkout.id}`, `/api/mocks/${checkout.id}`]) {
        const response = await f.get(path);
        assert.equal(response.statusCode, 200);
        assert.equal(response.body.includes(checkout.webhookSecret), false);
        assert.equal(response.body.includes('webhookSecret'), false);
    }
    const hosted = await f.get(`/checkout/${checkout.id}`);
    assert.equal(hosted.headers['x-robots-tag'], 'noindex, nofollow');
    assert.match(hosted.body, /Test mode, no real payment/);
    assert.ok(hosted.body.includes('&lt;script&gt;bad&lt;/script&gt;'));
    assert.equal(/name="(?:card|number|expiry|cvc)"/.test(hosted.body), false);
    for (const [expected, number] of Object.entries(checkoutCards)) {
        const response = await f.post(`/api/test-checkouts/${checkout.id}/complete`, {
            card: { number, expiry: '12/2030', cvc: '123' },
            idempotencyKey: expected,
        });
        assert.equal(response.statusCode, 200, response.body);
        assert.equal(response.json().outcome, expected);
        if (expected === 'requires_verification') {
            const verified = await f.post(`/api/test-checkouts/${checkout.id}/confirm`, {
                confirmationToken: response.json().confirmationToken,
            });
            assert.equal(verified.json().outcome, 'succeeded', verified.body);
        }
    }
    assert.equal(f.deliveries.length, 6);
    const { body, signature } = f.deliveries[0]!,
        timestamp = /t=(\d+)/.exec(signature)![1];
    assert.ok(
        signature.endsWith(
            createHmac('sha256', checkout.webhookSecret)
                .update(`${timestamp}.${body}`)
                .digest('hex'),
        ),
    );
    const current = (await f.get(`/api/test-checkouts/${checkout.id}`)).json();
    assert.equal(current.attempts.length, 5);
    assert.equal(current.deliveries[0].attempts, 2);
    const stored = JSON.stringify(await f.resources.read(checkout.id, 'mock', '', f.owner));
    for (const number of Object.values(checkoutCards)) assert.equal(stored.includes(number), false);
    const calls = (await f.get(`/api/mocks/${checkout.id}/calls`)).body;
    for (const number of Object.values(checkoutCards)) assert.equal(calls.includes(number), false);
    assert.equal(
        (
            await f.post(
                `/api/test-checkouts/${checkout.id}/complete`,
                { card: { number: checkoutCards.succeeded }, idempotencyKey: 'foreign' },
                f.outsider,
            )
        ).statusCode,
        404,
    );
});

test('SDK, CLI, MCP discovery, configuration and approval waits use the same test payment routes', async (t) => {
    const { Kivel } = await import('@kivel.io/sdk');
    const { command, needsInput } = await import('@kivel.io/cli');
    const f = await fixture(t);
    const client = new Kivel({
        apiKey: f.agent.authorization.slice(7),
        fetch: async (url, options) => {
            const request = new Request(url, options);
            const body =
                request.method === 'GET' || request.method === 'DELETE'
                    ? undefined
                    : await request.text();
            const response = await f.app.inject({
                method: request.method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
                url: new URL(request.url).pathname + new URL(request.url).search,
                headers: Object.fromEntries(request.headers),
                ...(body ? { payload: body } : {}),
            });
            return new Response(response.body || null, {
                status: response.statusCode,
                headers: response.headers as Record<string, string>,
            });
        },
    });
    const wallet = await client.createTestWallet({ name: 'SDK wallet', balance: 10 });
    assert.equal((await client.walletBalance(wallet.id)).balance, 10);
    const bytes = new TextEncoder().encode(JSON.stringify({ amount: 5 }));
    assert.ok(needsInput(['test-wallet', 'top-up', wallet.id]));
    assert.equal(
        (
            (await command(client, ['test-wallet', 'top-up', wallet.id], bytes)) as {
                balance: number;
            }
        ).balance,
        15,
    );
    async function call(name: string, args: object) {
        const response = await f.post(
            '/mcp',
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
            { ...f.agent, accept: 'application/json, text/event-stream' },
        );
        const result = response.json().result;
        assert.ok(result, response.body);
        return { result, value: JSON.parse(result.content[0].text) };
    }
    const paywall = await call('create_test_paywall', { name: 'MCP article', amount: 1 });
    assert.equal(paywall.result.isError, false, JSON.stringify(paywall));
    assert.equal(
        (await call('inspect_mock_api', { id: paywall.value.id })).value.endpointUrl,
        paywall.value.endpointUrl,
    );
    const paid = await call('wallet_pay', {
        id: wallet.id,
        payee: paywall.value.endpointUrl,
        idempotencyKey: 'mcp-pay',
    });
    assert.equal(paid.value.status, 'succeeded', JSON.stringify(paid));
    for (const toolId of [
        'agents-test-wallet',
        'agents-test-x402-paywall',
        'agents-test-checkout',
    ]) {
        assert.equal((await call('describe_tool', { toolId })).value.status, 'available');
        assert.ok(
            (await call('search_tools', { query: toolId })).value.tools.some(
                (entry: { id: string }) => entry.id === toolId,
            ),
        );
    }
    assert.equal(
        (
            await call('resource_request', {
                kind: 'test-wallets',
                action: 'update',
                id: wallet.id,
                config: { approvalThreshold: 0 },
            })
        ).result.isError,
        true,
    );
    const sensitive = await client.createTestWallet({ name: 'Ask first', balance: 200 });
    const waiting = call('wallet_pay', {
        id: sensitive.id,
        payee: 'test service',
        amount: 101,
        idempotencyKey: 'wait-mcp',
        timeoutSeconds: 2,
    });
    let approvalId: string | undefined;
    for (let i = 0; i < 40; i++) {
        approvalId = f.approvals.list(f.owner, true)[0]?.id;
        if (approvalId) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(approvalId);
    assert.equal(
        (await f.post(`/api/approvals/${approvalId}/answer`, { answer: 'Approve' }, f.human))
            .statusCode,
        200,
    );
    assert.equal((await waiting).value.status, 'succeeded');
    assert.equal((await client.listWalletTransactions(wallet.id)).transactions.length, 2);
    await client.deleteTestPayment('wallets', wallet.id);
    assert.equal((await client.testPayments('wallets')).resources.length, 1);
});

test('wallet daily limits, rejection, expired holds and rate limits cannot be bypassed', async (t) => {
    const f = await fixture(t),
        wallet = await f.create(
            'wallets',
            {
                name: 'Limits',
                balance: 100,
                perPaymentLimit: 10,
                dailyLimit: 10,
                approvalThreshold: 5,
            },
            f.human,
        );
    const body = { payee: 'Test payee', amount: 6, idempotencyKey: 'reject' };
    const asked = (await f.post(`/api/test-wallets/${wallet.id}/pay`, body)).json();
    await f.post(`/api/approvals/${asked.approvalId}/answer`, { answer: 'Reject' }, f.human);
    assert.equal((await f.post(`/api/test-wallets/${wallet.id}/pay`, body)).statusCode, 403);
    for (const idempotencyKey of ['five-1', 'five-2'])
        assert.equal(
            (
                await f.post(`/api/test-wallets/${wallet.id}/pay`, {
                    payee: 'Test',
                    amount: 5,
                    idempotencyKey,
                })
            ).statusCode,
            200,
        );
    const refused = await f.post(`/api/test-wallets/${wallet.id}/pay`, {
        payee: 'Test',
        amount: 1,
        idempotencyKey: 'daily',
    });
    assert.equal(refused.statusCode, 403);
    assert.match(refused.body, /Daily test payment limit/);
    const heldWallet = await f.create('wallets', { name: 'Holds', balance: 1 }),
        paywall = await f.create('paywalls', { name: 'Test', amount: 1 });
    const hold = (
        await f.post(`/api/test-wallets/${heldWallet.id}/pay`, {
            payee: paywall.endpointUrl,
            idempotencyKey: 'hold',
            authorizeOnly: true,
        })
    ).json();
    assert.equal(
        (
            await f.post(`/api/test-wallets/${heldWallet.id}/pay`, {
                payee: 'Other',
                amount: 1,
                idempotencyKey: 'overdraw',
            })
        ).statusCode,
        403,
    );
    await f.resources.mutateMock(
        heldWallet.id,
        { ownerId: f.owner, managementToken: '' },
        (payload) => {
            (
                payload.paymentState as { transactions: { expiresAt: string }[] }
            ).transactions[0]!.expiresAt = new Date(Date.now() - 1000).toISOString();
            return { payload, result: true };
        },
    );
    assert.equal(
        (await f.get(`/pay/${paywall.id}`, { 'x-payment': hold.paymentHeader })).statusCode,
        409,
    );
    assert.equal(
        (
            await f.post(`/api/test-wallets/${heldWallet.id}/pay`, {
                payee: 'Other',
                amount: 1,
                idempotencyKey: 'after-expiry',
            })
        ).statusCode,
        200,
    );
    const topups = await Promise.all(
        Array.from({ length: 61 }, () =>
            f.post(`/api/test-wallets/${wallet.id}/top-up`, { amount: 1 }),
        ),
    );
    assert.equal(topups.filter((response) => response.statusCode === 429).length, 1);
});

test('a payment refused by the approval allowance leaves a ledger entry and no debit', async (t) => {
    const f = await fixture(t);
    const wallet = await f.create(
        'wallets',
        { name: 'Approval fixture', balance: 50, approvalThreshold: 5 },
        f.human,
    );
    const original = f.approvals.create.bind(f.approvals);
    const filler = () => ({
        id: randomUUID(),
        accountId: f.owner,
        agentName: 'Fixture',
        question: 'Approve?',
        options: ['Approve', 'Reject'],
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    for (let i = 1; i < plans.team.approvalQuestionsPerDay; i++) original(filler(), 'team');
    f.approvals.create = (approval, plan, queueDraft) => {
        if (approval.walletPayment) original(filler(), plan);
        return original(approval, plan, queueDraft);
    };
    const response = await f.post(`/api/test-wallets/${wallet.id}/pay`, {
        amount: 7,
        payee: 'Fixture',
        idempotencyKey: randomUUID(),
    });
    assert.equal(response.statusCode, 402, response.body);
    assert.equal(response.json().limit, 'approvals.questions');
    assert.equal((await f.get(`/api/test-wallets/${wallet.id}`)).json().balance, 50);
    const ledger = (await f.get(`/api/test-wallets/${wallet.id}/transactions`)).json().transactions;
    assert.equal(ledger[0].status, 'refused');
});
