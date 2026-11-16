'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertDialog, Button } from '@radix-ui/themes';
import { ChatCircleDots } from '@phosphor-icons/react';
import type { ApprovalDelivery, ApprovalEvent, ApprovalAction } from '@kivel.io/sdk';
import { api, ApiError } from '../lib/api';
import { EmailDraftFields, EmailDraftContent } from './email-drafts';
import type { DraftContent } from './email-drafts';
import { useViewer } from '../lib/viewer';

interface Approval {
    id: string;
    agentName: string;
    question: string;
    details?: string;
    action?: ApprovalAction;
    note?: string;
    options: string[];
    emailDraft?: { id: string };
    status: 'pending' | 'answered' | 'expired';
    answer?: string;
    answeredBy?: string;
    expiresAt: string;
}

/** Where a human answers a question an agent asked with ask_human. */
export function AgentQuestion({ approvalId }: { approvalId?: string } = {}) {
    const viewer = useViewer();
    const [id, setId] = useState(approvalId ?? '');
    const [approval, setApproval] = useState<Approval | null>(null);
    const [draft, setDraft] = useState<DraftContent>();
    const [editing, setEditing] = useState(false);
    const [edited, setEdited] = useState<DraftContent>();
    const [note, setNote] = useState('');
    const [error, setError] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!approvalId) setId(new URLSearchParams(location.search).get('id') ?? '');
    }, [approvalId]);
    useEffect(() => {
        if (!id || viewer.status !== 'user') return;
        const controller = new AbortController();
        setApproval(null);
        setError('');
        void api(`/api/approvals/${encodeURIComponent(id)}`, { signal: controller.signal })
            .then((response) => response.json())
            .then((value) => {
                if (!controller.signal.aborted) setApproval(value);
            })
            .catch((failure: Error) => {
                if (!controller.signal.aborted) setError(failure.message);
            });
        return () => controller.abort();
    }, [id, viewer.status, viewer.status === 'user' ? viewer.workspaceId : undefined]);

    useEffect(() => {
        if (approval?.status !== 'pending') return;
        const timer = setTimeout(
            () => {
                setApproval((current) =>
                    current?.id === approval.id && current.status === 'pending'
                        ? { ...current, status: 'expired' }
                        : current,
                );
            },
            Math.max(0, Date.parse(approval.expiresAt) - Date.now()),
        );
        return () => clearTimeout(timer);
    }, [approval]);

    const draftId = approval?.emailDraft?.id;
    useEffect(() => {
        if (!draftId) return;
        const controller = new AbortController();
        void api(`/api/email-drafts/${draftId}`, { signal: controller.signal })
            .then((response) => response.json())
            .then((result) => setDraft(result.content))
            .catch((failure: Error) => {
                if (!controller.signal.aborted) setError(failure.message);
            });
        return () => controller.abort();
    }, [draftId]);

    async function answer(option: string) {
        setBusy(true);
        setError('');
        try {
            const response = await api(`/api/approvals/${encodeURIComponent(id)}/answer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    answer: option,
                    ...(note.trim() ? { note } : {}),
                    ...(option === 'Approve' && editing ? { editedEmail: edited } : {}),
                }),
            });
            setApproval(await response.json());
        } catch (failure) {
            if (failure instanceof ApiError && failure.status === 409) {
                const current = await api(`/api/approvals/${encodeURIComponent(id)}`)
                    .then((response) => response.json())
                    .catch(() => undefined);
                if (current) setApproval(current);
            }
            setError(
                failure instanceof ApiError || failure instanceof Error
                    ? failure.message
                    : 'Something went wrong.',
            );
        } finally {
            setBusy(false);
        }
    }

    const canAnswer = viewer.status === 'user' && ['owner', 'admin'].includes(viewer.role);
    const action = approval?.action;
    const proposedAction = action && (
        <dl className="approval-action">
            <div>
                <dt>Action</dt>
                <dd>
                    <code>{action.type}</code>
                </dd>
            </div>
            <div>
                <dt>Target</dt>
                <dd>{action.target}</dd>
            </div>
            {action.summary && (
                <div>
                    <dt>Summary</dt>
                    <dd>{action.summary}</dd>
                </div>
            )}
        </dl>
    );
    const remember = () => {
        try {
            sessionStorage.setItem('kivel:after-signin', `/approve/?id=${encodeURIComponent(id)}`);
        } catch {}
    };
    return (
        <div className="page-width agent-link">
            <div className="agent-link-card">
                <span className="agent-link-icon">
                    <ChatCircleDots size={28} />
                </span>
                {!id ? (
                    <>
                        <h1>No question here</h1>
                        <p>Open the link your agent or the email gave you.</p>
                    </>
                ) : viewer.status === 'loading' ? (
                    <p className="agent-link-muted">Loading…</p>
                ) : viewer.status === 'guest' ? (
                    <>
                        <h1>Your agent is waiting for you</h1>
                        <p>
                            Sign in to see its question. Only workspace owners and admins can
                            answer.
                        </p>
                        <div className="agent-link-actions">
                            <Link
                                className="button button-primary"
                                href="/login/"
                                onClick={remember}
                            >
                                Sign in
                            </Link>
                        </div>
                    </>
                ) : error && !approval ? (
                    <>
                        <h1>This link does not work</h1>
                        <p>
                            {error} If you belong to several workspaces, switch to the one the agent
                            uses.
                        </p>
                    </>
                ) : !approval ? (
                    <p className="agent-link-muted">Loading…</p>
                ) : approval.status === 'answered' ? (
                    <>
                        <h1>Answered: {approval.answer}</h1>
                        {proposedAction}
                        {approval.note && <p>{approval.note}</p>}
                        <p>
                            {approval.agentName} has the answer
                            {approval.answeredBy ? ` from ${approval.answeredBy}` : ''} and carries
                            on by itself.
                        </p>
                        <div className="agent-link-actions">
                            <Link className="button button-secondary" href="/agents/">
                                See agent activity
                            </Link>
                        </div>
                    </>
                ) : approval.status === 'expired' ? (
                    <>
                        <h1>This question expired</h1>
                        {proposedAction}
                        <p>
                            {approval.agentName} stopped waiting. It can ask again if it still needs
                            you.
                        </p>
                    </>
                ) : (
                    <>
                        <p className="agent-question-eyebrow">{approval.agentName} asks</p>
                        <h1>{approval.question}</h1>
                        {proposedAction}
                        {approval.details && (
                            <p className="agent-question-details">{approval.details}</p>
                        )}
                        {draftId &&
                            (draft ? (
                                <div className="email-draft-panel">
                                    {editing && edited ? (
                                        <div className="email-create-form">
                                            <EmailDraftFields value={edited} onChange={setEdited} />
                                        </div>
                                    ) : (
                                        <EmailDraftContent value={draft} />
                                    )}
                                    {canAnswer && (
                                        <Button
                                            type="button"
                                            variant="soft"
                                            color="gray"
                                            size="2"
                                            onClick={() => {
                                                setEdited(draft);
                                                setEditing(!editing);
                                            }}
                                        >
                                            {editing ? 'Discard edits' : 'Edit draft'}
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                !error && <p role="status">Loading draft…</p>
                            ))}
                        {canAnswer && (
                            <label className="agent-question-note">
                                <span>Note for the agent (optional)</span>
                                <textarea
                                    name="note"
                                    autoComplete="off"
                                    rows={2}
                                    maxLength={1000}
                                    value={note}
                                    onChange={(event) => setNote(event.target.value)}
                                />
                            </label>
                        )}
                        {error && (
                            <p className="agent-link-error" role="alert">
                                {error}
                            </p>
                        )}
                        {canAnswer ? (
                            <div className="agent-link-actions">
                                {approval.options.map((option, index) => (
                                    <Button
                                        key={option}
                                        size="3"
                                        color={index === 0 ? 'green' : 'gray'}
                                        variant={index === 0 ? 'solid' : 'soft'}
                                        disabled={
                                            busy ||
                                            Boolean(draftId && option === 'Approve' && !draft)
                                        }
                                        onClick={() =>
                                            action ? setConfirmation(option) : void answer(option)
                                        }
                                    >
                                        {editing && option === 'Approve'
                                            ? 'Approve edited draft'
                                            : option}
                                    </Button>
                                ))}
                            </div>
                        ) : (
                            <p>Only workspace owners and admins can answer.</p>
                        )}
                        <p className="agent-link-muted">
                            Expires {new Date(approval.expiresAt).toLocaleString()}. Your answer is
                            final and logged.
                        </p>
                    </>
                )}
                {approval && (
                    <ApprovalHistory key={approval.id} id={approval.id} status={approval.status} />
                )}
                <AlertDialog.Root
                    open={!!confirmation}
                    onOpenChange={(open) => {
                        if (!open) setConfirmation('');
                    }}
                >
                    <AlertDialog.Content maxWidth="420px">
                        <AlertDialog.Title>Confirm your answer</AlertDialog.Title>
                        <AlertDialog.Description>
                            Send “{confirmation}” to {approval?.agentName} for {action?.target}?
                        </AlertDialog.Description>
                        <div className="button-row">
                            <AlertDialog.Cancel>
                                <Button variant="soft" color="gray">
                                    Cancel
                                </Button>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action>
                                <Button onClick={() => void answer(confirmation)}>
                                    Send answer
                                </Button>
                            </AlertDialog.Action>
                        </div>
                    </AlertDialog.Content>
                </AlertDialog.Root>
            </div>
        </div>
    );
}

const eventLabels = {
    requested: 'Requested',
    answered: 'Answered',
    expired: 'Expired',
    consumed: 'Used',
};
const deliveryLabels = {
    requested: 'Request',
    answered: 'Answer',
    expired: 'Expiry',
    reminder: 'Reminder',
    escalated: 'Escalation',
};
function ApprovalHistory({ id, status }: { id: string; status: Approval['status'] }) {
    const [events, setEvents] = useState<ApprovalEvent[]>([]);
    const [deliveries, setDeliveries] = useState<ApprovalDelivery[]>([]);
    const [error, setError] = useState('');
    const [refresh, setRefresh] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setError('');
        const load = (path: string) =>
            api(`/api/approvals/${id}/${path}`, { signal: controller.signal }).then((response) =>
                response.json(),
            );
        void Promise.all([load('events'), load('deliveries')])
            .then(([audit, notices]) => {
                if (!controller.signal.aborted) {
                    setEvents(audit.events);
                    setDeliveries(notices.deliveries);
                }
            })
            .catch((failure: Error) => {
                if (!controller.signal.aborted) setError(failure.message);
            });
        return () => controller.abort();
    }, [id, status, refresh]);
    return (
        <section className="approval-history" aria-label="Approval history">
            <div className="approval-history-heading">
                <h2>Activity</h2>
                <Button
                    size="1"
                    variant="surface"
                    color="gray"
                    onClick={() => setRefresh((value) => value + 1)}
                >
                    Refresh
                </Button>
            </div>
            {events.length > 0 && (
                <ol>
                    {events.map((event) => (
                        <li key={event.type}>
                            <span>
                                <strong>{eventLabels[event.type]}</strong>
                                {event.actor ? ` · ${event.actor}` : ''}
                                {event.outcome ? ` · ${event.outcome}` : ''}
                            </span>
                            <time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time>
                        </li>
                    ))}
                </ol>
            )}
            {deliveries.length > 0 && (
                <>
                    <h3>Webhook delivery</h3>
                    <ul>
                        {deliveries.map((entry) => (
                            <li key={entry.id}>
                                <span>{deliveryLabels[entry.kind]}</span>
                                <small>
                                    {entry.state}
                                    {entry.attempts
                                        ? ` · ${entry.attempts} attempt${entry.attempts === 1 ? '' : 's'}`
                                        : ''}
                                    {entry.httpStatus ? ` · HTTP ${entry.httpStatus}` : ''}
                                </small>
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {error && <p role="alert">{error}</p>}
        </section>
    );
}
