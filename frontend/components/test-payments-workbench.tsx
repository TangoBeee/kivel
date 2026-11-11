'use client';
import Link from 'next/link';
import { appLink } from '../lib/app-routes';
import { useEffect, useRef, useState } from 'react';
import { AlertDialog, Button, Select, Tabs, TextArea, TextField } from '@radix-ui/themes';
import { checkoutCards } from '@kivel.io/tools/test-payments';
import type {
    CheckoutOutcome,
    TestPaymentResource,
    TestTransaction,
} from '@kivel.io/tools/test-payments';
import { plans, type PlanId } from '@kivel.io/tools/plans';
import { useViewer } from '../lib/viewer';
import { api } from '../lib/api';
import { CopyButton } from './copy-button';
import { ToolHeader } from './tool-header';
import { MockCalls } from './mock-calls';

const paths = { wallet: 'wallets', paywall: 'paywalls', checkout: 'checkouts' } as const;
const labels = { wallet: 'Wallets', paywall: 'Paywalls', checkout: 'Checkouts' };
const outcomeLabels = {
    succeeded: 'Payment succeeds',
    declined: 'Declined',
    insufficient_funds: 'Insufficient funds',
    requires_verification: 'Needs verification',
    expired: 'Expired card',
};
const money = (value = 0, currency = 'USD') =>
    new Intl.NumberFormat('en', { style: 'currency', currency }).format(value);
async function write(path: string, body: object, method = 'POST') {
    return (
        await api(
            path,
            { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
            45000,
        )
    ).json();
}
function PaymentForm({
    kind,
    entry,
    canManage,
    plan,
    onSave,
    onCancel,
}: {
    kind: TestPaymentResource['kind'];
    entry?: TestPaymentResource;
    canManage: boolean;
    plan: string;
    onSave(input: object): Promise<void>;
    onCancel(): void;
}) {
    const defaults = plans[plan as PlanId]?.testPayments ?? plans.free.testPayments;
    const [name, setName] = useState(entry?.name ?? '');
    const [amount, setAmount] = useState(String(entry?.amount ?? 1));
    const [balance, setBalance] = useState('100');
    const [item, setItem] = useState(entry?.item ?? 'Test purchase');
    const [description, setDescription] = useState(entry?.description ?? '');
    const [currency, setCurrency] = useState(entry?.currency ?? 'USD');
    const [mode, setMode] = useState(
        entry?.modes?.length === 2 ? 'both' : (entry?.modes?.[0] ?? 'wallet'),
    );
    const [response, setResponse] = useState(
        JSON.stringify(
            entry?.response?.body ?? { message: 'Test content unlocked.', testMode: true },
            null,
            2,
        ),
    );
    const [status, setStatus] = useState(String(entry?.response?.status ?? 200));
    const [perPayment, setPerPayment] = useState(
        String(entry?.perPaymentLimit ?? defaults.perPayment),
    );
    const [daily, setDaily] = useState(String(entry?.dailyLimit ?? defaults.daily));
    const [threshold, setThreshold] = useState(
        String(entry?.approvalThreshold ?? defaults.approval),
    );
    const [webhookUrl, setWebhookUrl] = useState(entry?.webhookUrl ?? '');
    const [successUrl, setSuccessUrl] = useState(entry?.successUrl ?? '');
    const [cancelUrl, setCancelUrl] = useState(entry?.cancelUrl ?? '');
    const [busy, setBusy] = useState(false),
        [error, setError] = useState('');
    return (
        <form
            className="email-create-form payment-form"
            onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                setError('');
                void (async () => {
                    const input = {
                        name,
                        ...(kind === 'wallet'
                            ? {
                                  ...(!entry ? { balance: Number(balance) } : {}),
                                  ...(canManage
                                      ? {
                                            perPaymentLimit: Number(perPayment),
                                            dailyLimit: Number(daily),
                                            approvalThreshold: Number(threshold),
                                        }
                                      : {}),
                              }
                            : {
                                  amount: Number(amount),
                                  description,
                                  ...(kind === 'paywall'
                                      ? {
                                            modes:
                                                mode === 'both' ? ['wallet', 'permissive'] : [mode],
                                            response: {
                                                status: Number(status),
                                                body: JSON.parse(response),
                                            },
                                        }
                                      : { item, currency, webhookUrl, successUrl, cancelUrl }),
                              }),
                    };
                    await onSave(input);
                })()
                    .catch((failure: Error) => setError(failure.message))
                    .finally(() => setBusy(false));
            }}
        >
            <h2>
                {entry ? 'Edit' : 'New'} test {kind}
            </h2>
            <label>
                Name
                <TextField.Root
                    required
                    maxLength={80}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={kind === 'wallet' ? 'Research agent' : 'My test integration'}
                />
            </label>
            {kind === 'wallet' ? (
                <>
                    {!entry && (
                        <label>
                            Starting test balance (USD)
                            <TextField.Root
                                type="number"
                                min="0"
                                max="1000000"
                                step="0.01"
                                required
                                value={balance}
                                onChange={(event) => setBalance(event.target.value)}
                            />
                        </label>
                    )}
                    {canManage ? (
                        <fieldset className="payment-controls">
                            <legend>Agent spending controls</legend>
                            <p className="muted">
                                Only workspace owners and admins can change these in the browser.
                            </p>
                            <label>
                                Per-payment limit (USD)
                                <TextField.Root
                                    required
                                    type="number"
                                    min="0"
                                    max="1000000"
                                    step="0.01"
                                    value={perPayment}
                                    onChange={(event) => setPerPayment(event.target.value)}
                                />
                            </label>
                            <label>
                                Daily limit (USD)
                                <TextField.Root
                                    required
                                    type="number"
                                    min="0"
                                    max="1000000"
                                    step="0.01"
                                    value={daily}
                                    onChange={(event) => setDaily(event.target.value)}
                                />
                            </label>
                            <label>
                                Ask above (USD)
                                <TextField.Root
                                    required
                                    type="number"
                                    min="0"
                                    max="1000000"
                                    step="0.01"
                                    value={threshold}
                                    onChange={(event) => setThreshold(event.target.value)}
                                />
                            </label>
                        </fieldset>
                    ) : (
                        <p className="muted">
                            Your plan defaults apply: {money(defaults.perPayment)} per payment,{' '}
                            {money(defaults.daily)} per UTC day, human approval above{' '}
                            {money(defaults.approval)}. An owner or admin can change these.
                        </p>
                    )}
                </>
            ) : (
                <>
                    <div className="payment-form-grid">
                        <label>
                            Test amount
                            <TextField.Root
                                type="number"
                                required
                                min="0.01"
                                max="1000000"
                                step="0.01"
                                value={amount}
                                onChange={(event) => setAmount(event.target.value)}
                            />
                        </label>
                        {kind === 'checkout' && (
                            <label>
                                Currency
                                <Select.Root value={currency} onValueChange={setCurrency}>
                                    <Select.Trigger aria-label="Currency" />
                                    <Select.Content>
                                        {['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map((value) => (
                                            <Select.Item key={value} value={value}>
                                                {value}
                                            </Select.Item>
                                        ))}
                                    </Select.Content>
                                </Select.Root>
                            </label>
                        )}
                    </div>
                    {kind === 'checkout' && (
                        <label>
                            Item name
                            <TextField.Root
                                required
                                maxLength={80}
                                value={item}
                                onChange={(event) => setItem(event.target.value)}
                            />
                        </label>
                    )}
                    <label>
                        Description
                        <TextField.Root
                            maxLength={80}
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                        />
                    </label>
                    {kind === 'paywall' ? (
                        <>
                            <label>
                                Payment mode
                                <Select.Root value={mode} onValueChange={setMode}>
                                    <Select.Trigger aria-label="Payment mode" />
                                    <Select.Content>
                                        <Select.Item value="wallet">Test wallets</Select.Item>
                                        <Select.Item value="permissive">
                                            Permissive fixtures
                                        </Select.Item>
                                        <Select.Item value="both">Both</Select.Item>
                                    </Select.Content>
                                </Select.Root>
                            </label>
                            <p className="muted">
                                Wallet mode verifies a Kivel test token. Permissive mode checks x402
                                payload structure only. Neither settles real funds.
                            </p>
                            <label>
                                Success status
                                <TextField.Root
                                    required
                                    type="number"
                                    min="200"
                                    max="299"
                                    value={status}
                                    onChange={(event) => setStatus(event.target.value)}
                                />
                            </label>
                            <label>
                                Content after payment (JSON)
                                <TextArea
                                    required
                                    rows={5}
                                    value={response}
                                    onChange={(event) => setResponse(event.target.value)}
                                />
                            </label>
                        </>
                    ) : (
                        <>
                            <label>
                                Webhook URL (optional)
                                <TextField.Root
                                    type="url"
                                    maxLength={2048}
                                    value={webhookUrl}
                                    onChange={(event) => setWebhookUrl(event.target.value)}
                                    placeholder="https://kivel.io/hooks/…"
                                />
                            </label>
                            <label>
                                Success URL (optional)
                                <TextField.Root
                                    type="url"
                                    maxLength={2048}
                                    value={successUrl}
                                    onChange={(event) => setSuccessUrl(event.target.value)}
                                />
                            </label>
                            <label>
                                Cancel URL (optional)
                                <TextField.Root
                                    type="url"
                                    maxLength={2048}
                                    value={cancelUrl}
                                    onChange={(event) => setCancelUrl(event.target.value)}
                                />
                            </label>
                            <p className="muted">
                                The hosted page offers test outcome buttons. It never asks for card
                                details. Webhooks are signed; save the secret shown once after
                                creation.
                            </p>
                        </>
                    )}
                </>
            )}
            {error && (
                <p role="alert" className="error">
                    {error}
                </p>
            )}
            <div className="payment-actions">
                <Button disabled={busy}>
                    {busy ? 'Saving…' : entry ? 'Save changes' : `Create test ${kind}`}
                </Button>
                <Button type="button" variant="soft" color="gray" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </form>
    );
}
function WalletDetail({
    entry,
    canWrite,
    onRefresh,
}: {
    entry: TestPaymentResource;
    canWrite: boolean;
    onRefresh(): Promise<void>;
}) {
    const [transactions, setTransactions] = useState<TestTransaction[]>([]),
        [cursor, setCursor] = useState('');
    const [payee, setPayee] = useState(''),
        [amount, setAmount] = useState('1'),
        [memo, setMemo] = useState('');
    const [topup, setTopup] = useState('100'),
        [key, setKey] = useState('');
    const [result, setResult] = useState<{
        status: string;
        answerUrl?: string;
        content?: unknown;
    } | null>(null);
    const [busy, setBusy] = useState(false),
        [error, setError] = useState('');
    async function ledger(after = '') {
        const value = await (
            await api(
                `/api/test-wallets/${entry.id}/transactions${after ? `?cursor=${encodeURIComponent(after)}` : ''}`,
            )
        ).json();
        setTransactions((items) =>
            after ? [...items, ...value.transactions] : value.transactions,
        );
        setCursor(value.nextCursor ?? '');
    }
    useEffect(() => {
        void ledger().catch((failure: Error) => setError(failure.message));
    }, [entry.id]);
    function edited() {
        setKey('');
        setResult(null);
    }
    async function perform(work: () => Promise<void>) {
        setBusy(true);
        setError('');
        try {
            await work();
            await onRefresh();
            await ledger();
        } catch (failure) {
            setError((failure as Error).message);
            await ledger().catch(() => {});
        } finally {
            setBusy(false);
        }
    }
    return (
        <>
            <dl className="payment-facts">
                <div>
                    <dt>Available test balance</dt>
                    <dd>{money(entry.availableBalance ?? entry.balance)}</dd>
                </div>
                <div>
                    <dt>Per payment</dt>
                    <dd>{money(entry.perPaymentLimit)}</dd>
                </div>
                <div>
                    <dt>Daily limit (UTC)</dt>
                    <dd>{money(entry.dailyLimit)}</dd>
                </div>
                <div>
                    <dt>Human approval above</dt>
                    <dd>{money(entry.approvalThreshold)}</dd>
                </div>
            </dl>
            {canWrite && (
                <div className="payment-work-grid">
                    <form
                        className="email-create-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const requestKey = key || crypto.randomUUID();
                            setKey(requestKey);
                            void perform(async () =>
                                setResult(
                                    await write(`/api/test-wallets/${entry.id}/pay`, {
                                        payee,
                                        amount: Number(amount),
                                        memo,
                                        idempotencyKey: requestKey,
                                    }),
                                ),
                            );
                        }}
                    >
                        <h3>Make a test payment</h3>
                        <label>
                            Payee or Kivel test URL
                            <TextField.Root
                                required
                                maxLength={2048}
                                value={payee}
                                onChange={(event) => {
                                    setPayee(event.target.value);
                                    edited();
                                }}
                                placeholder="https://kivel.io/pay/… or a payee name"
                            />
                        </label>
                        <label>
                            Test amount (USD)
                            <TextField.Root
                                required
                                type="number"
                                min="0.01"
                                max="1000000"
                                step="0.01"
                                value={amount}
                                onChange={(event) => {
                                    setAmount(event.target.value);
                                    edited();
                                }}
                            />
                        </label>
                        <label>
                            Memo
                            <TextField.Root
                                maxLength={200}
                                value={memo}
                                onChange={(event) => {
                                    setMemo(event.target.value);
                                    edited();
                                }}
                            />
                        </label>
                        <Button disabled={busy}>
                            {busy
                                ? 'Working…'
                                : result?.status === 'awaitingApproval'
                                  ? 'Check approval and continue'
                                  : key && result
                                    ? 'Retry same test payment'
                                    : 'Pay with test units'}
                        </Button>
                        {result && (
                            <div className="payment-result" role="status">
                                <strong>
                                    {result.status === 'awaitingApproval'
                                        ? 'Waiting for human approval'
                                        : 'Test payment succeeded'}
                                </strong>
                                {result.answerUrl && (
                                    <p>
                                        <Link href={result.answerUrl}>Review approval</Link>, then
                                        continue here. The same payment cannot debit twice.
                                    </p>
                                )}
                                {result.content !== undefined && (
                                    <pre>{JSON.stringify(result.content, null, 2)}</pre>
                                )}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                        setKey('');
                                        setResult(null);
                                    }}
                                >
                                    Start a new test payment
                                </Button>
                            </div>
                        )}
                    </form>
                    <form
                        className="email-create-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void perform(async () => {
                                await write(`/api/test-wallets/${entry.id}/top-up`, {
                                    amount: Number(topup),
                                });
                            });
                        }}
                    >
                        <h3>Add test balance</h3>
                        <p className="muted">Free top-ups. No payment method or real funds.</p>
                        <label>
                            Test units (USD)
                            <TextField.Root
                                required
                                type="number"
                                min="0.01"
                                max="1000000"
                                step="0.01"
                                value={topup}
                                onChange={(event) => setTopup(event.target.value)}
                            />
                        </label>
                        <Button variant="soft" color="gray" disabled={busy}>
                            Top up test wallet
                        </Button>
                    </form>
                </div>
            )}
            {error && (
                <p role="alert" className="error">
                    {error}
                </p>
            )}
            <section className="payment-ledger">
                <div className="home-section-head">
                    <h3>Ledger</h3>
                    <Button
                        variant="ghost"
                        onClick={() =>
                            void ledger().catch((failure: Error) => setError(failure.message))
                        }
                    >
                        Refresh
                    </Button>
                </div>
                {transactions.length ? (
                    <ul className="home-rows">
                        {transactions.map((tx) => (
                            <li key={tx.id}>
                                <div className="payment-ledger-row">
                                    <div>
                                        <strong>{tx.payee}</strong>
                                        <small>
                                            {tx.memo ||
                                                (tx.kind === 'topup'
                                                    ? 'Free test balance'
                                                    : 'Test payment')}{' '}
                                            · {new Date(tx.at).toLocaleString()}
                                        </small>
                                        <span>
                                            {tx.status === 'awaitingApproval'
                                                ? 'Awaiting approval'
                                                : tx.status}
                                            {tx.reason ? `: ${tx.reason}` : ''}
                                        </span>
                                        {tx.events.length > 1 && (
                                            <small>
                                                {tx.events.map((event) => event.status).join(' → ')}
                                            </small>
                                        )}
                                    </div>
                                    <strong>
                                        {tx.kind === 'topup' ? '+' : '−'}
                                        {money(tx.amount)}
                                    </strong>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="empty-state">
                        No test payments yet. Your first payment or top-up appears here.
                    </p>
                )}
                {cursor && (
                    <Button
                        variant="soft"
                        onClick={() =>
                            void ledger(cursor).catch((failure: Error) => setError(failure.message))
                        }
                    >
                        Load more
                    </Button>
                )}
            </section>
        </>
    );
}
function CheckoutDetail({
    entry,
    canWrite,
    onRefresh,
}: {
    entry: TestPaymentResource;
    canWrite: boolean;
    onRefresh(): Promise<void>;
}) {
    const [busy, setBusy] = useState(false),
        [error, setError] = useState(''),
        [confirmationToken, setConfirmationToken] = useState('');
    async function complete(outcome?: CheckoutOutcome) {
        setBusy(true);
        setError('');
        try {
            const result = await write(
                `/api/test-checkouts/${entry.id}/${outcome ? 'complete' : 'confirm'}`,
                outcome
                    ? {
                          card: { number: checkoutCards[outcome] },
                          idempotencyKey: crypto.randomUUID(),
                      }
                    : { confirmationToken },
            );
            setConfirmationToken(result.confirmationToken ?? '');
            await onRefresh();
        } catch (failure) {
            setError((failure as Error).message);
        } finally {
            setBusy(false);
        }
    }
    return (
        <>
            <dl className="payment-facts">
                <div>
                    <dt>Item</dt>
                    <dd>{entry.item}</dd>
                </div>
                <div>
                    <dt>Test amount</dt>
                    <dd>{money(entry.amount, entry.currency)}</dd>
                </div>
            </dl>
            <p className="muted">{entry.description}</p>
            {canWrite && (
                <section>
                    <h3>Simulate an outcome</h3>
                    <div className="payment-actions">
                        {Object.keys(checkoutCards).map((outcome) => (
                            <Button
                                key={outcome}
                                variant="soft"
                                color="gray"
                                disabled={busy}
                                onClick={() => void complete(outcome as CheckoutOutcome)}
                            >
                                {outcomeLabels[outcome as CheckoutOutcome]}
                            </Button>
                        ))}
                    </div>
                    {confirmationToken && (
                        <div className="payment-result">
                            <p>The test payment needs an extra verification step.</p>
                            <Button disabled={busy} onClick={() => void complete()}>
                                Confirm test payment
                            </Button>
                        </div>
                    )}
                </section>
            )}
            {error && (
                <p role="alert" className="error">
                    {error}
                </p>
            )}
            <h3>Test attempts</h3>
            {entry.attempts?.length ? (
                <ul className="home-rows">
                    {[...entry.attempts].reverse().map((attempt) => (
                        <li key={attempt.id}>
                            <div className="payment-ledger-row">
                                <strong>
                                    {attempt.outcome === 'succeeded'
                                        ? 'Succeeded'
                                        : outcomeLabels[attempt.outcome]}
                                </strong>
                                <span>
                                    {attempt.last4 ? `•••• ${attempt.last4} · ` : ''}
                                    {new Date(attempt.at).toLocaleString()}
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="empty-state">
                    No attempts yet. Open the hosted page or select an outcome above.
                </p>
            )}
            <h3>Webhook deliveries</h3>
            <p className="muted">
                {entry.webhookUrl ||
                    'Add a public webhook URL in settings to receive signed test events.'}
            </p>
            {entry.deliveries?.length ? (
                <ul className="home-rows">
                    {[...entry.deliveries].reverse().map((delivery) => (
                        <li key={delivery.requestId}>
                            <div className="payment-ledger-row">
                                <strong>
                                    {delivery.status
                                        ? `HTTP ${delivery.status}`
                                        : 'Delivery failed'}
                                </strong>
                                <span>
                                    {delivery.attempts}{' '}
                                    {delivery.attempts === 1 ? 'attempt' : 'attempts'} ·{' '}
                                    {delivery.error || new Date(delivery.at).toLocaleString()}
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : null}
            <MockCalls id={entry.id} token="" />
        </>
    );
}
export function PaymentsPanel({
    initialKind = 'wallet',
    onChange,
}: {
    initialKind?: TestPaymentResource['kind'];
    onChange?(): void;
}) {
    const viewer = useViewer();
    const [kind, setKind] = useState(() => {
            if (typeof window === 'undefined' || location.pathname !== '/payments/')
                return initialKind;
            const tab = new URLSearchParams(location.search).get('tab');
            return tab === 'paywalls' ? 'paywall' : tab === 'checkouts' ? 'checkout' : initialKind;
        }),
        [entries, setEntries] = useState<TestPaymentResource[]>([]);
    const [selected, setSelected] = useState<TestPaymentResource | null>(null),
        [form, setForm] = useState(false);
    const [error, setError] = useState(''),
        [loading, setLoading] = useState(true),
        [secret, setSecret] = useState('');
    const [loadedWorkspace, setLoadedWorkspace] = useState('');
    const workspace = viewer.status === 'user' ? viewer.workspaceId : '';
    const current = useRef(workspace);
    current.current = workspace;
    const canManage = viewer.status === 'user' && ['owner', 'admin'].includes(viewer.role);
    const canWrite = viewer.status === 'user' && viewer.role !== 'viewer';
    useEffect(() => {
        setSelected(null);
        setEntries([]);
        setForm(false);
        setSecret('');
        setError('');
        setLoading(true);
        if (viewer.status !== 'user') {
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        void api(`/api/test-${paths[kind]}`, { signal: controller.signal })
            .then((response) => response.json())
            .then((value) => {
                if (controller.signal.aborted) return;
                setEntries(value.resources);
                const query = new URLSearchParams(location.search);
                const id = query.get('id') ?? query.get('resource');
                if (id)
                    setSelected(
                        value.resources.find((entry: TestPaymentResource) => entry.id === id) ??
                            null,
                    );
            })
            .catch((failure: Error) => {
                if (!controller.signal.aborted) setError(failure.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoadedWorkspace(workspace);
                    setLoading(false);
                }
            });
        return () => controller.abort();
    }, [viewer.status, workspace, kind]);
    function update(entry: TestPaymentResource) {
        if (current.current !== workspace) return;
        setSelected(entry);
        setEntries((items) =>
            items.some((item) => item.id === entry.id)
                ? items.map((item) => (item.id === entry.id ? entry : item))
                : [entry, ...items],
        );
        onChange?.();
    }
    async function refresh() {
        if (selected) update(await (await api(`/api/test-${paths[kind]}/${selected.id}`)).json());
    }
    if (viewer.status === 'loading') return <p role="status">Loading test payments…</p>;
    if (viewer.status !== 'user')
        return (
            <p>
                <Link href={appLink('/login/')}>Sign in</Link> to test agent payments with fake
                money.
            </p>
        );
    if (loadedWorkspace !== workspace) return <p role="status">Loading test payments…</p>;
    return (
        <section className="payments-panel">
            <p className="payment-banner">
                <strong>Test mode</strong>
                <span>
                    Fake money only. No real funds, blockchain transactions or private keys.
                </span>
            </p>
            <Tabs.Root value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
                <Tabs.List aria-label="Test payment resources">
                    {(Object.keys(paths) as (keyof typeof paths)[]).map((value) => (
                        <Tabs.Trigger key={value} value={value}>
                            {labels[value]}
                        </Tabs.Trigger>
                    ))}
                </Tabs.List>
            </Tabs.Root>
            {error && (
                <p role="alert" className="error">
                    {error}
                </p>
            )}
            {loading ? (
                <p role="status">Loading {labels[kind].toLowerCase()}…</p>
            ) : (
                <>
                    {(selected || form) && (
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setSelected(null);
                                setForm(false);
                                setSecret('');
                            }}
                        >
                            Back to {labels[kind].toLowerCase()}
                        </Button>
                    )}
                    {form ? (
                        <PaymentForm
                            key={selected?.id ?? `${workspace}:${kind}`}
                            kind={kind}
                            {...(selected ? { entry: selected } : {})}
                            canManage={canManage}
                            plan={viewer.plan}
                            onCancel={() => setForm(false)}
                            onSave={async (input) => {
                                const value = await write(
                                    `/api/test-${paths[kind]}${selected ? `/${selected.id}` : ''}`,
                                    input,
                                    selected ? 'PATCH' : 'POST',
                                );
                                if (current.current !== workspace) return;
                                setSecret(value.webhookSecret ?? '');
                                update(value);
                                setForm(false);
                            }}
                        />
                    ) : selected ? (
                        <>
                            <div className="payment-detail-heading">
                                <div>
                                    <h2>{selected.name}</h2>
                                    <p className="muted">
                                        Expires {new Date(selected.expiresAt).toLocaleString()}
                                    </p>
                                </div>
                                {canWrite && (
                                    <div className="payment-actions">
                                        <Button
                                            variant="soft"
                                            color="gray"
                                            onClick={() => setForm(true)}
                                        >
                                            Settings
                                        </Button>
                                        <AlertDialog.Root>
                                            <AlertDialog.Trigger>
                                                <Button variant="ghost" color="gray">
                                                    Delete
                                                </Button>
                                            </AlertDialog.Trigger>
                                            <AlertDialog.Content maxWidth="420px">
                                                <AlertDialog.Title>
                                                    Delete test {kind}?
                                                </AlertDialog.Title>
                                                <AlertDialog.Description>
                                                    This removes the resource and its test history.
                                                    It cannot be undone.
                                                </AlertDialog.Description>
                                                <div className="payment-actions">
                                                    <AlertDialog.Cancel>
                                                        <Button variant="soft" color="gray">
                                                            Cancel
                                                        </Button>
                                                    </AlertDialog.Cancel>
                                                    <AlertDialog.Action>
                                                        <Button
                                                            color="gray"
                                                            onClick={() => {
                                                                void api(
                                                                    `/api/test-${paths[kind]}/${selected.id}`,
                                                                    { method: 'DELETE' },
                                                                )
                                                                    .then(() => {
                                                                        if (
                                                                            current.current !==
                                                                            workspace
                                                                        )
                                                                            return;
                                                                        setEntries((items) =>
                                                                            items.filter(
                                                                                (item) =>
                                                                                    item.id !==
                                                                                    selected.id,
                                                                            ),
                                                                        );
                                                                        setSelected(null);
                                                                        setSecret('');
                                                                        onChange?.();
                                                                    })
                                                                    .catch((failure: Error) =>
                                                                        setError(failure.message),
                                                                    );
                                                            }}
                                                        >
                                                            Delete test {kind}
                                                        </Button>
                                                    </AlertDialog.Action>
                                                </div>
                                            </AlertDialog.Content>
                                        </AlertDialog.Root>
                                    </div>
                                )}
                            </div>
                            <div className="payment-address">
                                <code>{selected.endpointUrl ?? selected.id}</code>
                                <CopyButton
                                    text={selected.endpointUrl ?? selected.id}
                                    label={
                                        selected.endpointUrl ? 'Copy test URL' : 'Copy wallet ID'
                                    }
                                />
                                {selected.kind === 'checkout' && (
                                    <a href={selected.endpointUrl} target="_blank" rel="noreferrer">
                                        Open test checkout
                                    </a>
                                )}
                            </div>
                            {secret && (
                                <div className="payment-result">
                                    <strong>Save your webhook secret</strong>
                                    <p>Shown once. Verify the signature before trusting events.</p>
                                    <div className="payment-address">
                                        <code>{secret}</code>
                                        <CopyButton text={secret} label="Copy webhook secret" />
                                    </div>
                                    <Button variant="ghost" onClick={() => setSecret('')}>
                                        Hide secret
                                    </Button>
                                </div>
                            )}
                            {kind === 'wallet' ? (
                                <WalletDetail
                                    key={`${workspace}:${selected.id}`}
                                    entry={selected}
                                    canWrite={canWrite}
                                    onRefresh={refresh}
                                />
                            ) : kind === 'checkout' ? (
                                <CheckoutDetail
                                    key={`${workspace}:${selected.id}`}
                                    entry={selected}
                                    canWrite={canWrite}
                                    onRefresh={refresh}
                                />
                            ) : (
                                <>
                                    <dl className="payment-facts">
                                        <div>
                                            <dt>Test price</dt>
                                            <dd>{money(selected.amount)}</dd>
                                        </div>
                                        <div>
                                            <dt>Payment modes</dt>
                                            <dd>{selected.modes?.join(', ')}</dd>
                                        </div>
                                    </dl>
                                    <p className="muted">
                                        Call this URL for HTTP 402 instructions, then use
                                        wallet_pay. To test your own x402 client, enable permissive
                                        fixtures in settings.
                                    </p>
                                    <h3>Unlocked content</h3>
                                    <pre className="payment-content">
                                        {JSON.stringify(selected.response?.body, null, 2)}
                                    </pre>
                                    <MockCalls id={selected.id} token="" />
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="home-section-head">
                                <h2>{labels[kind]}</h2>
                                {canWrite && (
                                    <Button onClick={() => setForm(true)}>New test {kind}</Button>
                                )}
                            </div>
                            {entries.length ? (
                                <ul className="home-rows">
                                    {entries.map((entry) => (
                                        <li key={entry.id}>
                                            <button
                                                className="payment-resource-row"
                                                onClick={() => {
                                                    setSelected(entry);
                                                    setSecret('');
                                                }}
                                            >
                                                <strong>{entry.name}</strong>
                                                <span>
                                                    {entry.kind === 'wallet'
                                                        ? `${money(entry.balance)} test balance`
                                                        : `${money(entry.amount, entry.currency)} · ${entry.kind === 'checkout' ? entry.item : entry.modes?.join(', ')}`}
                                                </span>
                                                <small>View {kind} →</small>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="empty-state">
                                    {kind === 'wallet'
                                        ? 'Give an agent test balance and spending controls. Payments above your threshold ask for human approval.'
                                        : kind === 'paywall'
                                          ? 'Create an HTTP 402 endpoint to test how your agent requests, approves and retries a payment.'
                                          : 'Test success, declines, verification and signed webhooks without entering card details.'}
                                </p>
                            )}
                        </>
                    )}
                </>
            )}
        </section>
    );
}
export function PaymentsWorkbench({ toolId }: { toolId: string }) {
    return (
        <div className="page-width work-page">
            <ToolHeader toolId={toolId} />
            <PaymentsPanel
                initialKind={
                    toolId === 'agents-test-checkout'
                        ? 'checkout'
                        : toolId === 'agents-test-x402-paywall'
                          ? 'paywall'
                          : 'wallet'
                }
            />
        </div>
    );
}
