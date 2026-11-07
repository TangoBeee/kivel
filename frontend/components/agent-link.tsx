'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@radix-ui/themes';
import { Robot } from '@phosphor-icons/react';
import { api, ApiError } from '../lib/api';
import { useViewer } from '../lib/viewer';

interface Request {
    name: string;
    client?: string;
    status: 'pending' | 'approved' | 'denied' | 'delivered';
    expiresAt: string;
    workspace: { name: string; plan: string };
    canApprove: boolean;
    agents: { id: string; name: string; lastUsedAt: string | null }[];
    limit: number;
}

const ago = (value: string | null) => {
    if (!value) return 'never used';
    const minutes = Math.round((Date.now() - Date.parse(value)) / 60000);
    if (minutes < 60) return `active ${Math.max(1, minutes)} min ago`;
    const hours = Math.round(minutes / 60);
    return hours < 48 ? `active ${hours} h ago` : `active ${Math.round(hours / 24)} days ago`;
};

/** Where a human approves an agent that asked to join their workspace. */
export function AgentLink() {
    const viewer = useViewer();
    const [code, setCode] = useState('');
    const [typed, setTyped] = useState('');
    const [request, setRequest] = useState<Request | null>(null);
    const [replace, setReplace] = useState('');
    const [outcome, setOutcome] = useState<'approved' | 'denied' | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setCode(new URLSearchParams(location.search).get('code') ?? '');
    }, []);
    useEffect(() => {
        if (!code || viewer.status !== 'user') return;
        setError('');
        void api(`/api/agents/login/${encodeURIComponent(code)}`)
            .then((response) => response.json())
            .then(setRequest)
            .catch((failure) =>
                setError(
                    failure instanceof Error ? failure.message : 'Unable to load this request.',
                ),
            );
    }, [code, viewer.status]);

    async function answer(approve: boolean) {
        setBusy(true);
        setError('');
        try {
            await api(
                `/api/agents/login/${encodeURIComponent(code)}/${approve ? 'approve' : 'deny'}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(replace ? { replaceAgentId: replace } : {}),
                },
            );
            setOutcome(approve ? 'approved' : 'denied');
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

    const full = !!request && request.agents.length >= request.limit;
    return (
        <div className="page-width agent-link">
            <div className="agent-link-card">
                <span className="agent-link-icon">
                    <Robot size={28} />
                </span>
                {!code ? (
                    <form
                        className="agent-link-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            setCode(typed);
                            history.replaceState(null, '', `?code=${encodeURIComponent(typed)}`);
                        }}
                    >
                        <h1>Connect an agent</h1>
                        <p>Enter the code your agent showed you.</p>
                        <input
                            autoFocus
                            required
                            value={typed}
                            placeholder="ABCD-1234"
                            onChange={(event) => setTyped(event.target.value.toUpperCase())}
                        />
                        <Button size="3" color="green" type="submit">
                            Continue
                        </Button>
                    </form>
                ) : viewer.status === 'loading' ? (
                    <p className="agent-link-muted">Loading…</p>
                ) : viewer.status === 'guest' ? (
                    <>
                        <h1>An agent wants to connect</h1>
                        <p>Sign in or create a free account to see and approve it.</p>
                        <div className="agent-link-actions">
                            <Link
                                className="button button-primary"
                                href="/account/#signin"
                                onClick={() => {
                                    try {
                                        sessionStorage.setItem(
                                            'kivel:after-signin',
                                            `/link/?code=${encodeURIComponent(code)}`,
                                        );
                                    } catch {}
                                }}
                            >
                                Sign in
                            </Link>
                            <Link
                                className="button button-secondary"
                                href="/account/#register"
                                onClick={() => {
                                    try {
                                        sessionStorage.setItem(
                                            'kivel:after-signin',
                                            `/link/?code=${encodeURIComponent(code)}`,
                                        );
                                    } catch {}
                                }}
                            >
                                Create free account
                            </Link>
                        </div>
                    </>
                ) : outcome ? (
                    <>
                        <h1>{outcome === 'approved' ? 'Agent connected' : 'Request denied'}</h1>
                        <p>
                            {outcome === 'approved'
                                ? `${request?.name} can now use your workspace. Go back to your agent; it picks up its key by itself.`
                                : 'The agent was told no. Nothing was added to your workspace.'}
                        </p>
                        <div className="agent-link-actions">
                            <Link className="button button-secondary" href="/account/#agents">
                                See your agents
                            </Link>
                        </div>
                    </>
                ) : error && !request ? (
                    <>
                        <h1>This link does not work</h1>
                        <p>{error}</p>
                    </>
                ) : request ? (
                    request.status !== 'pending' ? (
                        <>
                            <h1>Already answered</h1>
                            <p>
                                This request was already{' '}
                                {request.status === 'denied' ? 'denied' : 'approved'}.
                            </p>
                        </>
                    ) : (
                        <>
                            <h1>
                                Connect <em>{request.name}</em>?
                            </h1>
                            <p>
                                It asked to use the <strong>{request.workspace.name}</strong>{' '}
                                workspace
                                {request.client ? ` from ${request.client}` : ''}. It will be able
                                to create inboxes, mocks and monitors, run tools and read your
                                usage. You can remove it any time.
                            </p>
                            <p className="agent-link-code">
                                Code {code.toUpperCase()}. Only approve if your agent showed you
                                this code.
                            </p>
                            {full && (
                                <fieldset className="agent-link-full">
                                    <legend>
                                        Your {request.workspace.plan} plan includes {request.limit}{' '}
                                        agents. Choose one to replace, or{' '}
                                        <Link href="/plans/">upgrade for more</Link>.
                                    </legend>
                                    {request.agents.map((agent) => (
                                        <label key={agent.id}>
                                            <input
                                                type="radio"
                                                name="replace"
                                                value={agent.id}
                                                checked={replace === agent.id}
                                                onChange={() => setReplace(agent.id)}
                                            />
                                            <span>
                                                <strong>{agent.name}</strong>
                                                <small>{ago(agent.lastUsedAt)}</small>
                                            </span>
                                        </label>
                                    ))}
                                </fieldset>
                            )}
                            {error && (
                                <p className="agent-link-error" role="alert">
                                    {error}
                                </p>
                            )}
                            {request.canApprove ? (
                                <div className="agent-link-actions">
                                    <Button
                                        size="3"
                                        color="green"
                                        disabled={busy || (full && !replace)}
                                        onClick={() => void answer(true)}
                                    >
                                        {full ? 'Replace and connect' : 'Approve'}
                                    </Button>
                                    <Button
                                        size="3"
                                        variant="soft"
                                        color="gray"
                                        disabled={busy}
                                        onClick={() => void answer(false)}
                                    >
                                        Deny
                                    </Button>
                                </div>
                            ) : (
                                <p className="agent-link-muted">
                                    Only workspace owners and admins can approve agents. Ask your
                                    workspace owner to open this link.
                                </p>
                            )}
                        </>
                    )
                ) : (
                    <p className="agent-link-muted">Loading…</p>
                )}
            </div>
        </div>
    );
}
