'use client';

import { useState } from 'react';
import { AlertDialog, Button, Select, TextField } from '@radix-ui/themes';
import { api } from '../lib/api';
import { CopyButton } from './copy-button';

interface InboxKey {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    expiresAt: string;
}

export function EmailInboxAccess({ id }: { id: string }) {
    const path = `/api/email-inboxes/${id}/keys`;
    const [keys, setKeys] = useState<InboxKey[]>();
    const [secret, setSecret] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function run(action?: () => Promise<void>) {
        setBusy(true);
        setError('');
        try {
            await action?.();
            const data = await (await api(path)).json();
            setKeys(data.keys);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to manage inbox keys.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <details
            className="connection-details"
            onToggle={(event) => {
                if (event.currentTarget.open && !keys && !busy) void run();
                if (!event.currentTarget.open) setSecret('');
            }}
        >
            <summary>Inbox access</summary>
            <div className="connection-content email-settings">
                <p>Give an agent access to this inbox without sharing the rest of the workspace.</p>
                <form
                    className="email-create-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const form = event.currentTarget;
                        const data = new FormData(form);
                        void run(async () => {
                            const value = await (
                                await api(path, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        name: data.get('name'),
                                        write: data.get('access') === 'write',
                                    }),
                                })
                            ).json();
                            setSecret(value.key);
                            form.reset();
                        });
                    }}
                >
                    <label>
                        Key name <TextField.Root name="name" maxLength={80} required />
                    </label>
                    <label>
                        Access{' '}
                        <Select.Root name="access" defaultValue="read">
                            <Select.Trigger aria-label="Inbox key access" />
                            <Select.Content>
                                <Select.Item value="read">Read email</Select.Item>
                                <Select.Item value="write">
                                    Read, send and organize email
                                </Select.Item>
                            </Select.Content>
                        </Select.Root>
                    </label>
                    <Button type="submit" disabled={busy}>
                        Create inbox key
                    </Button>
                </form>
                {secret && (
                    <div className="email-settings">
                        <p role="status">Copy this key now. It is only shown once.</p>
                        <div className="code-row">
                            <code>{secret}</code>
                            <CopyButton text={secret} label="Copy inbox key" />
                        </div>
                        <Button size="1" variant="ghost" onClick={() => setSecret('')}>
                            Hide key
                        </Button>
                    </div>
                )}
                {busy && !keys && <p role="status">Loading inbox keys</p>}
                {keys?.length === 0 && <p>No inbox keys yet.</p>}
                {keys?.map((key) => (
                    <div key={key.id} className="email-action-row">
                        <span>
                            <strong>{key.name}</strong> · {key.prefix}… · Expires{' '}
                            {new Date(key.expiresAt).toLocaleDateString()}
                        </span>
                        <AlertDialog.Root>
                            <AlertDialog.Trigger>
                                <Button size="1" color="red" variant="soft">
                                    Revoke
                                </Button>
                            </AlertDialog.Trigger>
                            <AlertDialog.Content>
                                <AlertDialog.Title>Revoke {key.name}?</AlertDialog.Title>
                                <AlertDialog.Description>
                                    New requests using this key will stop working.
                                </AlertDialog.Description>
                                <div className="dialog-actions">
                                    <AlertDialog.Cancel>
                                        <Button variant="soft">Keep key</Button>
                                    </AlertDialog.Cancel>
                                    <AlertDialog.Action>
                                        <Button
                                            color="red"
                                            onClick={() =>
                                                void run(async () => {
                                                    await api(`${path}/${key.id}`, {
                                                        method: 'DELETE',
                                                    });
                                                    setSecret('');
                                                })
                                            }
                                        >
                                            Revoke key
                                        </Button>
                                    </AlertDialog.Action>
                                </div>
                            </AlertDialog.Content>
                        </AlertDialog.Root>
                    </div>
                ))}
                {error && <p role="alert">{error}</p>}
            </div>
        </details>
    );
}
