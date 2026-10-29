'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@radix-ui/themes';
import { ChatCircleDots } from '@phosphor-icons/react';
import { api, ApiError } from '../lib/api';
import { useViewer } from '../lib/viewer';

interface Approval {
    id: string;
    agentName: string;
    question: string;
    details?: string;
    options: string[];
    status: 'pending' | 'answered' | 'expired';
    answer?: string;
    answeredBy?: string;
    expiresAt: string;
}

/** Where a human answers a question an agent asked with ask_human. */
export function AgentQuestion() {
    const viewer = useViewer();
    const [id, setId] = useState('');
    const [approval, setApproval] = useState<Approval | null>(null);
    const [note, setNote] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setId(new URLSearchParams(location.search).get('id') ?? '');
    }, []);
    useEffect(() => {
        if (!id || viewer.status !== 'user') return;
        void api(`/api/approvals/${encodeURIComponent(id)}`)
            .then((response) => response.json())
            .then(setApproval)
            .catch((failure) =>
                setError(
                    failure instanceof Error ? failure.message : 'Unable to load this question.',
                ),
            );
    }, [id, viewer.status]);

    async function answer(option: string) {
        setBusy(true);
        setError('');
        try {
            const response = await api(`/api/approvals/${encodeURIComponent(id)}/answer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(note.trim() ? { answer: option, note } : { answer: option }),
            });
            setApproval(await response.json());
        } catch (failure) {
            setError(
                failure instanceof ApiError || failure instanceof Error
                    ? failure.message
                    : 'Something went wrong.',
            );
        } finally {
            setBusy(false);
        }
    }

    const remember = () => {
        try {
            sessionStorage.setItem(
                'socket-help:after-signin',
                `/approve/?id=${encodeURIComponent(id)}`,
            );
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
                                href="/account/#signin"
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
                        <p>
                            {approval.agentName} has the answer
                            {approval.answeredBy ? ` from ${approval.answeredBy}` : ''} and carries
                            on by itself.
                        </p>
                        <div className="agent-link-actions">
                            <Link className="button button-secondary" href="/account/#agents">
                                See agent activity
                            </Link>
                        </div>
                    </>
                ) : approval.status === 'expired' ? (
                    <>
                        <h1>This question expired</h1>
                        <p>
                            {approval.agentName} stopped waiting. It can ask again if it still needs
                            you.
                        </p>
                    </>
                ) : (
                    <>
                        <p className="agent-question-eyebrow">{approval.agentName} asks</p>
                        <h1>{approval.question}</h1>
                        {approval.details && (
                            <p className="agent-question-details">{approval.details}</p>
                        )}
                        <label className="agent-question-note">
                            <span>Note for the agent (optional)</span>
                            <textarea
                                rows={2}
                                maxLength={1000}
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                            />
                        </label>
                        {error && (
                            <p className="agent-link-error" role="alert">
                                {error}
                            </p>
                        )}
                        <div className="agent-link-actions">
                            {approval.options.map((option, index) => (
                                <Button
                                    key={option}
                                    size="3"
                                    color={index === 0 ? 'green' : 'gray'}
                                    variant={index === 0 ? 'solid' : 'soft'}
                                    disabled={busy}
                                    onClick={() => void answer(option)}
                                >
                                    {option}
                                </Button>
                            ))}
                        </div>
                        <p className="agent-link-muted">
                            Expires {new Date(approval.expiresAt).toLocaleString()}. Your answer is
                            final and logged.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
