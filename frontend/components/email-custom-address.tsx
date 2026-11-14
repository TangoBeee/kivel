'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertDialog, Button, TextField } from '@radix-ui/themes';
import { api } from '../lib/api';
import { siteOrigin } from '../lib/site';
import { CopyButton } from './copy-button';

type Address = { address: string; verifiedAt: string };
type DnsRecord = { name: string; value: string };
type Route = { ingestUrl: string; routingKey: string };

function WorkerField({
    name,
    value,
    label,
    secret = false,
}: {
    name: string;
    value: string;
    label: string;
    secret?: boolean;
}) {
    return (
        <div className="email-route-field">
            <div>
                <code>{name}</code>
                <span>{secret ? 'Keep this secret' : value}</span>
            </div>
            <CopyButton text={value} label={label} compact />
        </div>
    );
}

export function EmailCustomAddress({ id }: { id: string }) {
    const path = `/api/email-inboxes/${id}/custom-address`;
    const [current, setCurrent] = useState<Address | null>();
    const [address, setAddress] = useState('');
    const [dns, setDns] = useState<DnsRecord>();
    const [route, setRoute] = useState<Route>();
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function run(fn: () => Promise<void>) {
        setBusy(true);
        setError('');
        try {
            await fn();
        } catch (failure) {
            setError(
                failure instanceof Error ? failure.message : 'Unable to update the custom address.',
            );
        } finally {
            setBusy(false);
        }
    }

    function verify(rotate = false) {
        void run(async () => {
            const response = await api(path, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: current?.address ?? address, rotate }),
            });
            const config = await response.json();
            setCurrent(config.customAddress);
            setRoute(config);
        });
    }

    return (
        <details
            className="connection-details"
            onToggle={(event) => {
                if (event.currentTarget.open && current === undefined && !busy)
                    void run(async () => {
                        setCurrent((await (await api(path)).json()).customAddress);
                    });
                if (!event.currentTarget.open) setRoute(undefined);
            }}
        >
            <summary>Custom receiving address</summary>
            <div className="connection-content email-settings">
                <p>
                    Receive mail from a subdomain you control in this inbox. Outgoing mail still
                    uses the Kivel address.
                </p>
                <Link className="text-link" href={`${siteOrigin}/docs/custom-email-address/`}>
                    Cloudflare setup guide
                </Link>
                {current === undefined ? (
                    <p role="status">
                        {busy ? 'Loading custom address' : 'Reopen this section to try again.'}
                    </p>
                ) : current ? (
                    <div className="email-settings">
                        <p>
                            <strong>{current.address}</strong> · DNS checked
                        </p>
                        <div className="button-row">
                            <Button
                                size="2"
                                variant="soft"
                                disabled={busy}
                                onClick={() => verify()}
                            >
                                Show Worker settings
                            </Button>
                            <AlertDialog.Root>
                                <AlertDialog.Trigger>
                                    <Button size="2" variant="soft" disabled={busy}>
                                        Rotate key
                                    </Button>
                                </AlertDialog.Trigger>
                                <AlertDialog.Content>
                                    <AlertDialog.Title>Replace the Worker key?</AlertDialog.Title>
                                    <AlertDialog.Description>
                                        Mail delivery to this address stops until the Worker uses
                                        the new key.
                                    </AlertDialog.Description>
                                    <div className="dialog-actions">
                                        <AlertDialog.Cancel>
                                            <Button variant="soft">Keep key</Button>
                                        </AlertDialog.Cancel>
                                        <AlertDialog.Action>
                                            <Button onClick={() => verify(true)}>
                                                Replace key
                                            </Button>
                                        </AlertDialog.Action>
                                    </div>
                                </AlertDialog.Content>
                            </AlertDialog.Root>
                            <AlertDialog.Root>
                                <AlertDialog.Trigger>
                                    <Button size="2" variant="soft" color="red" disabled={busy}>
                                        Remove address
                                    </Button>
                                </AlertDialog.Trigger>
                                <AlertDialog.Content>
                                    <AlertDialog.Title>Remove this address?</AlertDialog.Title>
                                    <AlertDialog.Description>
                                        New mail to this address will stop arriving. Inbox history
                                        stays.
                                    </AlertDialog.Description>
                                    <div className="dialog-actions">
                                        <AlertDialog.Cancel>
                                            <Button variant="soft">Keep address</Button>
                                        </AlertDialog.Cancel>
                                        <AlertDialog.Action>
                                            <Button
                                                color="red"
                                                onClick={() =>
                                                    void run(async () => {
                                                        await api(path, { method: 'DELETE' });
                                                        setCurrent(null);
                                                        setRoute(undefined);
                                                        setDns(undefined);
                                                    })
                                                }
                                            >
                                                Remove address
                                            </Button>
                                        </AlertDialog.Action>
                                    </div>
                                </AlertDialog.Content>
                            </AlertDialog.Root>
                        </div>
                    </div>
                ) : (
                    <form
                        className="email-create-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void run(async () => {
                                const query = new URLSearchParams({ address });
                                const response = await api(`${path}?${query}`);
                                const value = await response.json();
                                setAddress(value.address);
                                setDns(value.dns);
                            });
                        }}
                    >
                        <label>
                            Custom email address
                            <TextField.Root
                                type="email"
                                value={address}
                                maxLength={254}
                                required
                                placeholder="agent@agents.example.com"
                                onChange={(event) => {
                                    setAddress(event.target.value);
                                    setDns(undefined);
                                }}
                            />
                        </label>
                        <Button type="submit" disabled={busy}>
                            Get DNS record
                        </Button>
                    </form>
                )}
                {!current && dns && (
                    <div className="email-settings">
                        <p>Add this TXT record and enable Email Routing on the subdomain.</p>
                        <div className="code-row">
                            <code>{dns.name}</code>
                            <CopyButton text={dns.name} label="Copy TXT name" />
                        </div>
                        <div className="code-row">
                            <code>{dns.value}</code>
                            <CopyButton text={dns.value} label="Copy TXT value" />
                        </div>
                        <Button disabled={busy} onClick={() => verify()}>
                            Verify DNS
                        </Button>
                    </div>
                )}
                {route && current && (
                    <div className="email-settings">
                        <p>
                            Set these values in your Cloudflare Worker and route this exact address
                            to it.
                        </p>
                        <WorkerField
                            name="INGEST_URL"
                            value={route.ingestUrl}
                            label="Copy ingest URL"
                        />
                        <WorkerField
                            name="CUSTOM_ROUTE_ADDRESS"
                            value={current.address}
                            label="Copy route address"
                        />
                        <WorkerField
                            name="CUSTOM_ROUTE_KEY"
                            value={route.routingKey}
                            label="Copy routing key"
                            secret
                        />
                        <Button variant="ghost" size="2" onClick={() => setRoute(undefined)}>
                            Hide Worker settings
                        </Button>
                    </div>
                )}
                {error && <p role="alert">{error}</p>}
            </div>
        </details>
    );
}
