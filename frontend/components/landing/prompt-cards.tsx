'use client';

import { useState, type ComponentType } from 'react';
import { motion } from 'motion/react';
import {
    Check,
    Copy,
    EnvelopeSimple,
    Heartbeat,
    Key,
    Plugs,
    ShieldCheck,
    WebhooksLogo,
    type IconProps,
} from '@phosphor-icons/react';
import { Reveal } from './reveal';

const prompts: {
    title: string;
    client: string;
    Icon: ComponentType<IconProps>;
    tint: string;
    text: string;
}[] = [
    {
        title: 'Test the signup flow',
        client: 'Claude Code · Email inbox',
        Icon: EnvelopeSimple,
        tint: 'is-pink',
        text: 'Create a Kivel inbox, sign up on our staging site with it, wait for the verification email and finish the signup with the code. Tell me exactly where it broke.',
    },
    {
        title: 'Debug Stripe webhooks',
        client: 'Cursor · Webhook URL',
        Icon: WebhooksLogo,
        tint: 'is-blue',
        text: 'Make a Kivel webhook URL and point our Stripe test account at it. Trigger a test checkout, then compare the payload with what our handler expects. If the fields differ, fix the handler, replay the event and show me the response it returns now. Keep the request history so I can check it later.',
    },
    {
        title: 'Log in with 2FA',
        client: 'Claude Code · Authenticator',
        Icon: Key,
        tint: 'is-yellow',
        text: 'Use the authenticator I set up in Kivel to get the current code, log in to our admin panel and export last week’s orders as CSV.',
    },
    {
        title: 'Mock a flaky API',
        client: 'Codex · Mock API',
        Icon: Plugs,
        tint: 'is-violet',
        text: 'Spin up a mock of the payments API that fails every third request with a 503. Run our retry logic against it and report how long recovery takes.',
    },
    {
        title: 'Ship with a human check',
        client: 'Any MCP client · Approvals',
        Icon: ShieldCheck,
        tint: 'is-blue',
        text: 'Before you run the production migration, ask me for approval with a short summary of what will change. Wait for my answer, then continue or stop.',
    },
    {
        title: 'Watch the deploy',
        client: 'Claude Code · Monitor',
        Icon: Heartbeat,
        tint: 'is-orange',
        text: 'Add a Kivel monitor for our staging health check and email me if it goes down after tonight’s deploy.',
    },
];

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <motion.button
            type="button"
            className={`kv-copy ${copied ? 'is-copied' : ''}`}
            whileTap={{ scale: 0.86 }}
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                } catch {}
            }}
        >
            <motion.span
                key={String(copied)}
                initial={{ scale: 0.4 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 14 }}
            >
                {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
            </motion.span>
            <span aria-live="polite">{copied ? 'Copied' : 'Copy prompt'}</span>
        </motion.button>
    );
}

export function PromptCards() {
    const columns = [
        prompts.filter((_, i) => i % 3 === 0),
        prompts.filter((_, i) => i % 3 === 1),
        prompts.filter((_, i) => i % 3 === 2),
    ];
    return (
        <section className="kv-container kv-prompts" aria-labelledby="prompts-heading">
            <Reveal className="kv-center">
                <h2 id="prompts-heading" className="kv-title kv-section-title">
                    What agents do with Kivel
                </h2>
                <p className="kv-section-text">
                    Paste one of these into your agent once it is connected.
                    <br />
                    Each one runs on real Kivel tools.
                </p>
            </Reveal>
            <div className="kv-prompt-grid">
                {columns.map((column, c) => (
                    <div key={c} className="kv-prompt-column">
                        {column.map((item, r) => (
                            <Reveal
                                key={item.title}
                                as="article"
                                className="kv-prompt-card"
                                delay={c * 0.1 + r * 0.05}
                            >
                                <header>
                                    <span
                                        className={`kv-prompt-avatar ${item.tint}`}
                                        aria-hidden="true"
                                    >
                                        <item.Icon size={24} weight="duotone" />
                                    </span>
                                    <span>
                                        <h3>{item.title}</h3>
                                        <small>{item.client}</small>
                                    </span>
                                </header>
                                <p>{item.text}</p>
                                <CopyButton text={item.text} />
                            </Reveal>
                        ))}
                    </div>
                ))}
            </div>
        </section>
    );
}
