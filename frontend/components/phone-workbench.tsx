'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, TextField, AlertDialog } from '@radix-ui/themes';
import { api } from '../lib/api';
import { useViewer } from '../lib/viewer';
import { CopyButton } from './copy-button';
interface Phone {
    id: string;
    number: string;
    state: string;
    pausedAt: string | null;
}
interface Sms {
    id: string;
    from: string;
    text: string;
    at: string;
    codes: string[];
}
export function PhoneWorkbench() {
    const viewer = useViewer();
    const [enabled, setEnabled] = useState(false),
        [numbers, setNumbers] = useState<Phone[]>([]),
        [offers, setOffers] = useState<{ number: string }[]>([]),
        [selected, setSelected] = useState(''),
        [messages, setMessages] = useState<Sms[]>([]),
        [area, setArea] = useState(''),
        [quantity, setQuantity] = useState('1'),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(''),
        [notice, setNotice] = useState('');
    const [purchaseKeys, setPurchaseKeys] = useState<Record<string, string>>({}),
        [billingKey, setBillingKey] = useState('');
    async function refresh() {
        const value = await (await api('/api/phone-numbers')).json();
        setEnabled(value.enabled);
        setNumbers(value.numbers);
    }
    useEffect(() => {
        if (viewer.status !== 'user') return;
        let live = true;
        setNumbers([]);
        setSelected('');
        setMessages([]);
        const load = () => {
            void api('/api/phone-numbers')
                .then((response) => response.json())
                .then((value) => {
                    if (live) {
                        setEnabled(value.enabled);
                        setNumbers(value.numbers);
                    }
                })
                .catch((failure) => {
                    if (live) setError(failure.message);
                });
        };
        load();
        const timer = window.setInterval(load, 15000);
        return () => {
            live = false;
            window.clearInterval(timer);
        };
    }, [viewer.status, viewer.status === 'user' ? viewer.workspace : '']);
    useEffect(() => {
        setMessages([]);
        if (!selected) return;
        let live = true;
        const load = () => {
            void api(`/api/phone-numbers/${selected}/sms`)
                .then((response) => response.json())
                .then((value) => {
                    if (live) setMessages(value.messages);
                })
                .catch((failure) => {
                    if (live) setError(failure.message);
                });
        };
        load();
        const timer = window.setInterval(load, 5000);
        return () => {
            live = false;
            window.clearInterval(timer);
        };
    }, [selected]);
    async function run(work: () => Promise<void>) {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await work();
        } catch (failure) {
            setError(
                failure instanceof Error ? failure.message : 'Unable to complete this request.',
            );
        } finally {
            setBusy(false);
        }
    }
    async function search() {
        await run(async () => {
            setOffers(
                (
                    await (
                        await api(
                            `/api/phone-numbers/available?areaCode=${encodeURIComponent(area)}`,
                        )
                    ).json()
                ).numbers,
            );
        });
    }
    async function purchase(number: string) {
        const key = purchaseKeys[number] ?? crypto.randomUUID();
        setPurchaseKeys((current) => ({ ...current, [number]: key }));
        await run(async () => {
            await api('/api/phone-numbers', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'idempotency-key': key },
                body: JSON.stringify({ number }),
            });
            setNotice('Order submitted. Activation can take a few minutes.');
            setOffers([]);
            await refresh();
        });
    }
    async function billing() {
        const key = billingKey || crypto.randomUUID();
        setBillingKey(key);
        await run(async () => {
            const value = await (
                await api('/api/billing/phone-addon', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'idempotency-key': key },
                    body: JSON.stringify({ quantity: Number(quantity), confirm: true }),
                })
            ).json();
            if (value.payment_link) {
                const url = new URL(value.payment_link);
                if (url.protocol !== 'https:' || !/(^|\.)dodopayments\.com$/.test(url.hostname))
                    throw new Error('Invalid checkout destination.');
                location.assign(url.href);
            } else {
                setNotice(
                    'Billing change submitted. Allow the signed billing event to update your number allowance.',
                );
                setBillingKey('');
                await refresh();
            }
        });
    }
    return (
        <div className="page-width work-page">
            <header className="content-intro">
                <h1>Workspace phone numbers</h1>
                <p>
                    Dedicated US numbers for inbound SMS. Add-on billing, number activation and
                    release are managed separately.
                </p>
            </header>
            {error && (
                <p className="alert" role="alert">
                    {error}
                </p>
            )}
            {notice && <p role="status">{notice}</p>}
            {viewer.status === 'guest' ? (
                <Link className="button" href="/account/">
                    Sign in
                </Link>
            ) : viewer.status === 'loading' ? (
                <p role="status">Loading your workspace…</p>
            ) : !enabled && !numbers.length ? (
                <div className="dashboard-empty">
                    <h2>Phone service is not enabled yet.</h2>
                    <p>
                        Telnyx setup and confirmed add-on pricing are required before numbers can be
                        purchased. No number is bought or billed from this page while disabled.
                    </p>
                </div>
            ) : (
                <div className="llm-workspace">
                    <section className="email-create-form">
                        <h2>Number allowance</h2>
                        <p className="muted">
                            Pro or Team and a paid phone add-on are required. The workspace owner
                            controls billing. The payment page shows the configured price and
                            prorated charge before payment.
                        </p>
                        <label>
                            Total paid number slots
                            <TextField.Root
                                type="number"
                                min={0}
                                max={10}
                                value={quantity}
                                onChange={(event) => {
                                    setQuantity(event.target.value);
                                    setBillingKey('');
                                }}
                            />
                        </label>
                        <AlertDialog.Root>
                            <AlertDialog.Trigger>
                                <Button disabled={busy || !viewer.owner || !enabled}>
                                    Review billing change
                                </Button>
                            </AlertDialog.Trigger>
                            <AlertDialog.Content>
                                <AlertDialog.Title>Change the paid phone add-on?</AlertDialog.Title>
                                <AlertDialog.Description>
                                    The total will become {quantity} slots. Reducing it pauses
                                    excess numbers and releases them after seven days. Pending
                                    payment must complete before new slots are granted.
                                </AlertDialog.Description>
                                <div className="dialog-actions">
                                    <AlertDialog.Cancel>
                                        <Button variant="soft">Cancel</Button>
                                    </AlertDialog.Cancel>
                                    <AlertDialog.Action>
                                        <Button
                                            onClick={() => {
                                                void billing();
                                            }}
                                        >
                                            Continue
                                        </Button>
                                    </AlertDialog.Action>
                                </div>
                            </AlertDialog.Content>
                        </AlertDialog.Root>
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void search();
                            }}
                        >
                            <label>
                                US area code
                                <TextField.Root
                                    inputMode="numeric"
                                    pattern="[2-9][0-9]{2}"
                                    placeholder="212"
                                    required
                                    value={area}
                                    onChange={(event) => setArea(event.target.value)}
                                />
                            </label>
                            <Button type="submit" variant="soft" disabled={busy || !enabled}>
                                Find a number
                            </Button>
                        </form>
                        {offers.map((offer) => (
                            <div className="code-row" key={offer.number}>
                                <code>{offer.number}</code>
                                <Button
                                    disabled={busy}
                                    onClick={() => {
                                        void purchase(offer.number);
                                    }}
                                >
                                    Use paid slot
                                </Button>
                            </div>
                        ))}
                        <p className="muted">
                            Keep purchase keys after an uncertain result. Releasing a number stops
                            Telnyx number charges; it does not cancel the Dodo add-on. Change the
                            slot count above to adjust billing. Outbound SMS and calls are not
                            enabled in this phase.
                        </p>
                    </section>
                    <section className="llm-preview">
                        <h2>Your numbers</h2>
                        {numbers.length ? (
                            numbers.map((phone) => (
                                <article className="monitor-item" key={phone.id}>
                                    <div className="code-row">
                                        <code>{phone.number}</code>
                                        <CopyButton
                                            compact
                                            text={phone.number}
                                            label="Copy phone number"
                                        />
                                    </div>
                                    <p className="muted">
                                        {phone.state}
                                        {phone.pausedAt
                                            ? ` · paused ${new Date(phone.pausedAt).toLocaleDateString()}`
                                            : ''}
                                    </p>
                                    <div className="button-row">
                                        <Button
                                            disabled={busy}
                                            variant="soft"
                                            onClick={() => setSelected(phone.id)}
                                        >
                                            Read SMS
                                        </Button>
                                        <AlertDialog.Root>
                                            <AlertDialog.Trigger>
                                                <Button disabled={busy} color="red" variant="ghost">
                                                    Release number
                                                </Button>
                                            </AlertDialog.Trigger>
                                            <AlertDialog.Content>
                                                <AlertDialog.Title>
                                                    Release {phone.number}?
                                                </AlertDialog.Title>
                                                <AlertDialog.Description>
                                                    This permanently releases the number at Telnyx.
                                                    It cannot be reclaimed here.
                                                </AlertDialog.Description>
                                                <div className="dialog-actions">
                                                    <AlertDialog.Cancel>
                                                        <Button variant="soft">Keep number</Button>
                                                    </AlertDialog.Cancel>
                                                    <AlertDialog.Action>
                                                        <Button
                                                            color="red"
                                                            onClick={() => {
                                                                void run(async () => {
                                                                    await api(
                                                                        `/api/phone-numbers/${phone.id}`,
                                                                        { method: 'DELETE' },
                                                                    );
                                                                    if (selected === phone.id)
                                                                        setSelected('');
                                                                    await refresh();
                                                                });
                                                            }}
                                                        >
                                                            Release number
                                                        </Button>
                                                    </AlertDialog.Action>
                                                </div>
                                            </AlertDialog.Content>
                                        </AlertDialog.Root>
                                    </div>
                                </article>
                            ))
                        ) : (
                            <p className="muted">
                                Numbers appear here after an order is submitted.
                            </p>
                        )}
                        {selected && (
                            <section aria-label="Received SMS">
                                <h3>Received messages</h3>
                                {messages.length ? (
                                    messages.map((message) => (
                                        <article className="monitor-item" key={message.id}>
                                            <p>
                                                <strong>{message.from}</strong> ·{' '}
                                                {new Date(message.at).toLocaleString()}
                                            </p>
                                            <p
                                                style={{
                                                    whiteSpace: 'pre-wrap',
                                                    overflowWrap: 'anywhere',
                                                }}
                                            >
                                                {message.text}
                                            </p>
                                            <div className="button-row">
                                                {message.codes.map((code) => (
                                                    <CopyButton
                                                        key={code}
                                                        text={code}
                                                        label={code}
                                                    />
                                                ))}
                                            </div>
                                        </article>
                                    ))
                                ) : (
                                    <p className="muted">No received SMS yet.</p>
                                )}
                            </section>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}
