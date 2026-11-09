'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { AgentQuestion } from './agent-question';

export function ApprovalsPanel({ id, onOpen }: { id?: string; onOpen(id?: string): void }) {
    const [items, setItems] = useState<
        { id: string; question: string; agentName: string; status: string }[] | null
    >(null);
    const [error, setError] = useState('');
    useEffect(() => {
        if (id) return;
        const controller = new AbortController();
        void api('/api/approvals', { signal: controller.signal })
            .then((response) => response.json())
            .then((value) => setItems(value.approvals))
            .catch((failure: Error) => {
                if (!controller.signal.aborted) setError(failure.message);
            });
        return () => controller.abort();
    }, [id]);
    if (id)
        return (
            <div>
                <button type="button" className="button" onClick={() => onOpen()}>
                    Back to approvals
                </button>
                <AgentQuestion key={id} approvalId={id} />
            </div>
        );
    if (error) return <p role="alert">{error}</p>;
    if (!items) return <p role="status">Loading approvals…</p>;
    if (!items.length) return <p className="muted">Questions from your agents will appear here.</p>;
    return (
        <ul className="home-rows">
            {items.map((item) => (
                <li key={item.id}>
                    <span className="home-row-main">
                        <strong>{item.question}</strong>
                        <small>
                            {item.agentName} · {item.status}
                        </small>
                    </span>
                    <button
                        type="button"
                        className="button button-small"
                        onClick={() => onOpen(item.id)}
                    >
                        View question
                    </button>
                </li>
            ))}
        </ul>
    );
}
