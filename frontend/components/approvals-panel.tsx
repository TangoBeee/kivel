'use client';

import { useEffect, useState } from 'react';
import { Button, TextField } from '@radix-ui/themes';
import { ArrowLeft, Bell, ShieldCheck } from '@phosphor-icons/react';
import type { Approval, ApprovalListOptions, ApprovalNotificationPolicy } from '@kivel.io/sdk';
import { api } from '../lib/api';
import { timeLeft } from '../lib/activity-labels';
import { useViewer } from '../lib/viewer';
import { AgentQuestion } from './agent-question';
import { AppSelect, SelectOption } from './app-select';
import { CopyButton } from './copy-button';

const statusLabels = { pending: 'Pending', answered: 'Answered', expired: 'Expired' };

export function ApprovalsPanel({ id, onOpen }: { id?: string; onOpen(id?: string): void }) {
    const viewer = useViewer();
    const workspace = viewer.status === 'user' ? viewer.workspaceId : undefined;
    const canConfigure = viewer.status === 'user' && ['owner', 'admin'].includes(viewer.role);
    const [items, setItems] = useState<Approval[] | null>(null);
    const [filters, setFilters] = useState<ApprovalListOptions>({});
    const [cursor, setCursor] = useState('');
    const [nextCursor, setNextCursor] = useState('');
    const [showPolicy, setShowPolicy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        if (id || showPolicy || !workspace) return;
        const controller = new AbortController();
        const query = new URLSearchParams({ limit: '25' });
        if (filters.status) query.set('status', filters.status);
        if (filters.agent?.trim()) query.set('agent', filters.agent.trim());
        if (filters.outcome?.trim()) query.set('outcome', filters.outcome.trim());
        if (cursor) query.set('cursor', cursor);
        const timer = setTimeout(() => {
            setError('');
            void api(`/api/approvals?${query}`, { signal: controller.signal })
                .then((response) => response.json())
                .then((value) => {
                    if (controller.signal.aborted) return;
                    setItems(value.approvals);
                    setNextCursor(value.nextCursor ?? '');
                })
                .catch((failure: Error) => {
                    if (!controller.signal.aborted) setError(failure.message);
                });
        }, 200);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [id, workspace, filters, cursor, showPolicy]);

    function update(next: ApprovalListOptions) {
        setCursor('');
        setNextCursor('');
        setItems(null);
        setFilters({ ...filters, ...next });
    }
    const back = (onClick: () => void) => (
        <Button size="2" variant="soft" color="gray" onClick={onClick}>
            <ArrowLeft size={15} aria-hidden /> Back to approvals
        </Button>
    );
    if (id)
        return (
            <div className="approval-workspace">
                {back(() => onOpen())}
                <AgentQuestion key={id} approvalId={id} />
            </div>
        );
    if (showPolicy && canConfigure)
        return (
            <div className="approval-workspace">
                {back(() => setShowPolicy(false))}
                <NotificationSettings key={workspace} />
            </div>
        );
    return (
        <section className="approval-workspace" aria-label="Approval requests">
            <div className="approval-toolbar">
                <div className="approval-filters" role="group" aria-label="Filter approvals">
                    <label>
                        Status
                        <AppSelect
                            aria-label="Status"
                            value={filters.status ?? 'all'}
                            onChange={(event) =>
                                update({
                                    status:
                                        event.target.value === 'all'
                                            ? undefined
                                            : (event.target.value as Approval['status']),
                                })
                            }
                        >
                            <SelectOption value="all">All statuses</SelectOption>
                            <SelectOption value="pending">Pending</SelectOption>
                            <SelectOption value="answered">Answered</SelectOption>
                            <SelectOption value="expired">Expired</SelectOption>
                        </AppSelect>
                    </label>
                    <label>
                        Agent name
                        <TextField.Root
                            size="2"
                            placeholder="Exact name"
                            maxLength={120}
                            value={filters.agent ?? ''}
                            onChange={(event) => update({ agent: event.target.value })}
                        />
                    </label>
                    <label>
                        Outcome
                        <TextField.Root
                            size="2"
                            placeholder="Any answer"
                            maxLength={60}
                            value={filters.outcome ?? ''}
                            onChange={(event) => update({ outcome: event.target.value })}
                        />
                    </label>
                </div>
                {canConfigure && (
                    <Button size="2" variant="surface" onClick={() => setShowPolicy(true)}>
                        <Bell size={16} aria-hidden /> Notification settings
                    </Button>
                )}
            </div>
            {error ? (
                <p role="alert" className="alert">
                    {error}
                </p>
            ) : !items ? (
                <p role="status">Loading approvals…</p>
            ) : items.length ? (
                <ul className="approval-list">
                    {items.map((item) => (
                        <li key={item.id}>
                            <button
                                type="button"
                                onClick={() => onOpen(item.id)}
                                className="approval-list-row"
                            >
                                <ShieldCheck size={19} aria-hidden />
                                <span className="approval-list-title">
                                    <strong>{item.question}</strong>
                                    <small>
                                        {item.agentName}
                                        {item.action ? ` · ${item.action.target}` : ''}
                                    </small>
                                </span>
                                <span className="approval-status" data-status={item.status}>
                                    {item.answer ?? statusLabels[item.status]}
                                </span>
                                <small className="approval-list-time">
                                    {item.status === 'pending'
                                        ? `Expires ${timeLeft(item.expiresAt)}`
                                        : new Date(
                                              item.answeredAt ?? item.expiresAt,
                                          ).toLocaleDateString()}
                                </small>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="muted">
                    {Object.values(filters).some(Boolean)
                        ? 'No approvals match these filters.'
                        : 'Questions from your agents will appear here.'}
                </p>
            )}
            {(cursor || nextCursor) && (
                <div className="button-row">
                    {cursor && (
                        <Button
                            size="2"
                            variant="surface"
                            onClick={() => {
                                setItems(null);
                                setCursor('');
                            }}
                        >
                            Latest approvals
                        </Button>
                    )}
                    {nextCursor && (
                        <Button
                            size="2"
                            variant="surface"
                            onClick={() => {
                                setItems(null);
                                setCursor(nextCursor);
                            }}
                        >
                            Older approvals
                        </Button>
                    )}
                </div>
            )}
        </section>
    );
}

function NotificationSettings() {
    const [policy, setPolicy] = useState<ApprovalNotificationPolicy | null>(null);
    const [url, setUrl] = useState('');
    const [reminder, setReminder] = useState('');
    const [escalation, setEscalation] = useState('');
    const [escalationUrl, setEscalationUrl] = useState('');
    const [secret, setSecret] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    function apply(value: ApprovalNotificationPolicy) {
        setPolicy(value);
        setUrl(value.url ?? '');
        setReminder(value.reminderMinutes?.toString() ?? '');
        setEscalation(value.escalationMinutes?.toString() ?? '');
        setEscalationUrl(value.escalationUrl ?? '');
    }
    useEffect(() => {
        const controller = new AbortController();
        void api('/api/approvals/policy', { signal: controller.signal })
            .then((response) => response.json())
            .then((value) => {
                if (!controller.signal.aborted) apply(value);
            })
            .catch((failure: Error) => {
                if (!controller.signal.aborted) setError(failure.message);
            });
        return () => controller.abort();
    }, []);
    async function save(disable = false, rotateSecret = false) {
        setBusy(true);
        setError('');
        setMessage('');
        setSecret('');
        try {
            const response = await api('/api/approvals/policy', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(
                    disable
                        ? { url: null }
                        : {
                              url: url.trim(),
                              reminderMinutes: reminder ? Number(reminder) : null,
                              escalationMinutes: escalation ? Number(escalation) : null,
                              escalationUrl: escalationUrl.trim() || null,
                              rotateSecret,
                          },
                ),
            });
            const value: ApprovalNotificationPolicy & { signingSecret?: string } =
                await response.json();
            apply(value);
            setSecret(value.signingSecret ?? '');
            setMessage(disable ? 'Signed notifications disabled.' : 'Notification settings saved.');
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to save the policy.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="approval-policy" aria-label="Notification settings">
            <h2>Signed notifications</h2>
            <p className="muted">
                Send approval updates to a public HTTPS endpoint. Reminders and escalations run
                while the request is pending.
            </p>
            {!policy && !error && <p role="status">Loading settings…</p>}
            {policy && (
                <form
                    className="approval-policy-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void save();
                    }}
                >
                    <label>
                        Webhook URL
                        <TextField.Root
                            type="url"
                            required
                            value={url}
                            onChange={(event) => setUrl(event.target.value)}
                        />
                    </label>
                    <div className="approval-policy-delays">
                        <label>
                            Reminder after (minutes)
                            <TextField.Root
                                type="number"
                                min="1"
                                max="1439"
                                value={reminder}
                                onChange={(event) => setReminder(event.target.value)}
                            />
                        </label>
                        <label>
                            Escalate after (minutes)
                            <TextField.Root
                                type="number"
                                min="1"
                                max="1439"
                                value={escalation}
                                onChange={(event) => setEscalation(event.target.value)}
                            />
                        </label>
                    </div>
                    {escalation && (
                        <label>
                            Escalation URL (optional)
                            <TextField.Root
                                type="url"
                                value={escalationUrl}
                                onChange={(event) => setEscalationUrl(event.target.value)}
                            />
                        </label>
                    )}
                    <div className="button-row">
                        <Button type="submit" disabled={busy}>
                            Save settings
                        </Button>
                        {policy.enabled && (
                            <>
                                <Button
                                    type="button"
                                    variant="surface"
                                    disabled={busy || !url}
                                    onClick={() => void save(false, true)}
                                >
                                    Rotate signing secret
                                </Button>
                                <Button
                                    type="button"
                                    variant="soft"
                                    color="red"
                                    disabled={busy}
                                    onClick={() => void save(true)}
                                >
                                    Disable notifications
                                </Button>
                            </>
                        )}
                    </div>
                </form>
            )}
            {secret && (
                <div className="account-secret" role="status">
                    <strong>Copy the signing secret now</strong>
                    <code>{secret}</code>
                    <CopyButton text={secret} label="Copy signing secret" />
                </div>
            )}
            {message && <p role="status">{message}</p>}
            {error && (
                <p role="alert" className="alert">
                    {error}
                </p>
            )}
        </section>
    );
}
