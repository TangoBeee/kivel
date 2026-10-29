'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
    Brain,
    ChatCircleDots,
    Cube,
    EnvelopeSimple,
    Pulse,
    WebhooksLogo,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

interface Capability {
    id: string;
    label: string;
    icon: Icon;
    title: string;
    body: string;
    limit: string;
    code: string;
}

// Each example is the tool call an agent makes over MCP and the shape of what comes back.
const capabilities: Capability[] = [
    {
        id: 'webhooks',
        label: 'Webhooks',
        icon: WebhooksLogo,
        title: 'Catch the callback your code is waiting for.',
        body: 'A private URL that records every request. The agent blocks until Stripe, GitHub or your own service calls it, then reads the headers and body.',
        limit: 'Free: 20 live resources, kept up to 7 days',
        code: `→ create_webhook_inbox()
← { "url": "https://socket.help/hooks/7f3c…" }

→ wait_for_webhook({ "id": "7f3c…", "timeoutSeconds": 30 })
← {
    "method": "POST",
    "headers": { "stripe-signature": "t=1793…,v1=5e0a…" },
    "body": { "type": "checkout.session.completed" }
  }`,
    },
    {
        id: 'email',
        label: 'Email',
        icon: EnvelopeSimple,
        title: 'Sign up, get the code, finish verification.',
        body: 'A receive only address for testing sign up and reset flows. One time codes and verification links come back already extracted.',
        limit: 'Receive only, so there is nothing to spam with',
        code: `→ create_email_inbox()
← { "address": "k4vq2m@socketspace.xyz" }

→ wait_for_email({ "id": "e91a…", "timeoutSeconds": 30 })
← {
    "from": "hello@staging.yourapp.dev",
    "subject": "Confirm your account",
    "codes": ["482913"],
    "links": ["https://staging.yourapp.dev/verify?t=…"]
  }`,
    },
    {
        id: 'approval',
        label: 'Ask a human',
        icon: ChatCircleDots,
        title: 'Pause before anything you cannot undo.',
        body: 'The agent asks, you get an email with a link, and only you can answer, signed in. Every answer is kept with who gave it.',
        limit: 'Free: 20 questions a day',
        code: `→ ask_human({
    "question": "Deploy build 412 to production?",
    "options": ["Deploy", "Wait"]
  })
← { "answerUrl": "https://socket.help/approve/?id=…", "emailed": true }

→ wait_for_approval({ "id": "…" })
← { "status": "answered", "answer": "Deploy", "note": "After 6pm is fine" }`,
    },
    {
        id: 'mocks',
        label: 'Mock APIs',
        icon: Cube,
        title: 'A fake API that fails on purpose.',
        body: 'Routes, templated fake data and CRUD records in one call. Add a failure rate to see how your code handles a flaky dependency.',
        limit: 'Pro: proxy a real API and record its responses',
        code: `→ create_mock_api({
    "name": "Payments",
    "routes": [{
      "method": "POST", "path": "/charges", "status": 201,
      "body": { "id": "{{fake.uuid}}", "amount": 4200 }
    }],
    "failureRate": 0.1
  })
← { "baseUrl": "https://socket.help/m/9d2e…" }`,
    },
    {
        id: 'memory',
        label: 'Memory',
        icon: Brain,
        title: 'Remember what happened last session.',
        body: 'Small JSON values under a namespace, shared by every agent in the workspace. Set an expiry or keep them.',
        limit: 'Free: 5 MiB per workspace',
        code: `→ memory_set({
    "namespace": "deploys",
    "key": "last-green",
    "value": { "build": 411, "at": "2026-10-28T17:02Z" }
  })
← { "stored": true }

// Tomorrow, in a new session
→ memory_get({ "namespace": "deploys", "key": "last-green" })
← { "value": { "build": 411, "at": "2026-10-28T17:02Z" } }`,
    },
    {
        id: 'monitors',
        label: 'Monitors',
        icon: Pulse,
        title: 'Keep watching after the session ends.',
        body: 'HTTP checks, certificate expiry and cron heartbeats. When something breaks, your human gets the email, not a dead terminal.',
        limit: 'Free: 20 monitors, every 5 minutes',
        code: `→ create_monitor({
    "kind": "http",
    "target": "https://staging.yourapp.dev/health",
    "expectStatus": 200,
    "intervalSeconds": 300
  })
← { "id": "c81f…", "status": "up" }

// Two failed checks in a row: the owner is emailed.`,
    },
];

const highlight = (code: string) =>
    code.split('\n').map((line, index) => (
        <span
            key={index}
            className={
                line.startsWith('→')
                    ? 'is-call'
                    : line.startsWith('←')
                      ? 'is-return'
                      : line.startsWith('//')
                        ? 'is-comment'
                        : undefined
            }
        >
            {line}
            {'\n'}
        </span>
    ));

/** What an agent can do, as the real tool calls it makes. */
export function Capabilities() {
    const [active, setActive] = useState(capabilities[0]!.id);
    const reduce = useReducedMotion();
    const current = capabilities.find((item) => item.id === active)!;
    // Arrow keys move between tabs; only the selected tab is in the Tab order.
    function onKey(event: React.KeyboardEvent<HTMLDivElement>) {
        const index = capabilities.findIndex((item) => item.id === active);
        const next =
            event.key === 'ArrowRight'
                ? (index + 1) % capabilities.length
                : event.key === 'ArrowLeft'
                  ? (index - 1 + capabilities.length) % capabilities.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? capabilities.length - 1
                      : -1;
        if (next < 0) return;
        event.preventDefault();
        const id = capabilities[next]!.id;
        setActive(id);
        document.getElementById(`cap-tab-${id}`)?.focus();
    }
    return (
        <div className="home-caps">
            <div
                className="home-caps-tabs"
                role="tablist"
                aria-label="Capabilities"
                onKeyDown={onKey}
            >
                {capabilities.map((item) => (
                    <button
                        key={item.id}
                        role="tab"
                        id={`cap-tab-${item.id}`}
                        aria-selected={item.id === active}
                        tabIndex={item.id === active ? 0 : -1}
                        aria-controls="cap-panel"
                        onClick={() => setActive(item.id)}
                    >
                        <item.icon size={18} />
                        {item.label}
                    </button>
                ))}
            </div>
            <div
                className="home-caps-panel"
                role="tabpanel"
                id="cap-panel"
                aria-labelledby={`cap-tab-${active}`}
            >
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={current.id}
                        className="home-caps-grid"
                        initial={reduce ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <pre className="home-code" translate="no">
                            <code>{highlight(current.code)}</code>
                        </pre>
                        <div className="home-caps-copy">
                            <h3>{current.title}</h3>
                            <p>{current.body}</p>
                            <p className="home-caps-limit">{current.limit}</p>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
