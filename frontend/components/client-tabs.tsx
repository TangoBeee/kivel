'use client';

import { useState } from 'react';
import { CodeExample } from './code-example';

interface Client {
    id: string;
    name: string;
    where: string;
    code: string;
    note?: string;
}

/** One client at a time: pick yours, copy one snippet. */
export function ClientTabs({ clients }: { clients: Client[] }) {
    const [active, setActive] = useState(clients[0]!.id);
    const current = clients.find((client) => client.id === active)!;
    function onKey(event: React.KeyboardEvent<HTMLDivElement>) {
        const index = clients.findIndex((client) => client.id === active);
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        const next = clients[(index + step + clients.length) % clients.length]!;
        setActive(next.id);
        document.getElementById(`client-tab-${next.id}`)?.focus();
    }
    return (
        <div className="client-tabs">
            <div role="tablist" aria-label="MCP clients" onKeyDown={onKey}>
                {clients.map((client) => (
                    <button
                        key={client.id}
                        id={`client-tab-${client.id}`}
                        role="tab"
                        aria-selected={client.id === active}
                        aria-controls="client-panel"
                        tabIndex={client.id === active ? 0 : -1}
                        onClick={() => setActive(client.id)}
                    >
                        {client.name}
                    </button>
                ))}
            </div>
            <div id="client-panel" role="tabpanel" aria-labelledby={`client-tab-${active}`}>
                <CodeExample title={current.where} code={current.code} />
                {current.note && <p>{current.note}</p>}
            </div>
        </div>
    );
}
