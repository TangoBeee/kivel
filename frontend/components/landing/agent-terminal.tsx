'use client';

import { useEffect, useState } from 'react';

type Line = { kind: 'user' | 'call' | 'result' | 'agent'; text: string; tool?: string };

// A scripted replay, not a live agent: it shows the real MCP tool names an agent would call.
const script: Line[] = [
    { kind: 'user', text: 'Add Stripe webhooks to my app and prove they work.' },
    { kind: 'call', tool: 'create_webhook_inbox', text: '{ "ttlSeconds": 3600 }' },
    { kind: 'result', text: 'webhookUrl: https://socket.help/hooks/7f3c…e21a' },
    {
        kind: 'agent',
        text: 'Pointed the Stripe test endpoint at the inbox and sent a test payment.',
    },
    { kind: 'call', tool: 'wait_for_webhook', text: '{ "timeoutSeconds": 25 }' },
    { kind: 'result', text: '✓ checkout.session.completed received in 1.8 s' },
    { kind: 'call', tool: 'create_mock_api', text: 'GET /orders/:id → 200 { "status": "paid" }' },
    { kind: 'call', tool: 'run_tool', text: '{ "toolId": "json", "input": "<event payload>" }' },
    { kind: 'result', text: '✓ valid JSON · signature header present' },
    { kind: 'agent', text: 'Done. The handler is verified against a real Stripe event.' },
];

export function AgentTerminal() {
    const [shown, setShown] = useState(script.length);
    useEffect(() => {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        // Start on the finished session so the first paint is never empty, then replay it.
        let step = script.length;
        let timer: ReturnType<typeof setTimeout>;
        const next = () => {
            step = step >= script.length ? 1 : step + 1;
            setShown(step);
            timer = setTimeout(next, step === script.length ? 5000 : 850);
        };
        timer = setTimeout(next, 5000);
        return () => clearTimeout(timer);
    }, []);
    return (
        <figure className="lp-terminal" aria-label="An AI agent using socket.help tools">
            <div className="lp-terminal-bar" aria-hidden="true">
                <span />
                <span />
                <span />
                <em>agent · socket.help MCP</em>
            </div>
            <ol>
                {script.slice(0, shown).map((line, index) => (
                    <li key={index} className={`is-${line.kind}`}>
                        {line.kind === 'user' && <b>you</b>}
                        {line.kind === 'call' && <b>{line.tool}</b>}
                        {line.kind === 'result' && <b aria-hidden="true">↳</b>}
                        {line.kind === 'agent' && <b>agent</b>}
                        <span>{line.text}</span>
                    </li>
                ))}
                {shown < script.length && <li className="lp-terminal-cursor" aria-hidden="true" />}
            </ol>
            <figcaption>Replay of a typical agent session. Tool names are real.</figcaption>
        </figure>
    );
}
