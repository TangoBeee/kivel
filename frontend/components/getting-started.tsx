'use client';
import { useEffect, useState } from 'react';
import { CaretDown, Check, Copy, Plug } from '@phosphor-icons/react';
import { DropdownMenu } from '@radix-ui/themes';
import { api } from '../lib/api';
import { siteOrigin } from '../lib/site';
import { setupPrompt } from '../lib/setup-prompt';

const endpoint = `${siteOrigin}/mcp`;

/** The agents Kivel walks people through, with the one thing each needs pasted or run. */
const clients = [
    {
        id: 'claude-code',
        name: 'Claude Code',
        tone: ['#f3d7c7', '#d97a55'],
        manual: `claude mcp add --transport http kivel ${endpoint}`,
        where: 'Or add it yourself, in your terminal:',
    },
    {
        id: 'cursor',
        name: 'Cursor',
        tone: ['#dcdcdc', '#2b2b2b'],
        manual: `{ "mcpServers": { "kivel": { "url": "${endpoint}" } } }`,
        where: 'Or add it yourself, in ~/.cursor/mcp.json:',
    },
    {
        id: 'codex',
        name: 'Codex',
        tone: ['#d9e4ff', '#3d5bd9'],
        manual: `[mcp_servers.kivel]\nurl = "${endpoint}"`,
        where: 'Or add it yourself, in ~/.codex/config.toml:',
    },
    {
        id: 'other',
        name: 'Any MCP client',
        tone: ['#d8eedf', '#2f8a57'],
        manual: endpoint,
        where: 'Or add this remote MCP server yourself:',
    },
] as const;

const examples = [
    {
        title: 'Sign up and read the code',
        art: { src: '/start/email.webp', size: '205%', position: '94% 31%' },
        prompt: 'Create a Kivel email inbox, sign up on our staging site with it, wait for the verification email and use the code to finish signing up.',
        tone: '#a52758',
    },
    {
        title: 'Catch a Stripe webhook',
        art: { src: '/start/webhooks.webp', size: '150%', position: '62% 22%' },
        prompt: 'Make a Kivel webhook URL, point our Stripe test endpoint at it, trigger a checkout and show me the payload and whether the signature is valid.',
        tone: '#1a5ce6',
    },
    {
        title: 'Build against a mock API',
        art: { src: '/start/activity.webp', size: '175%', position: '38% 78%' },
        prompt: 'Create a Kivel mock REST API from our openapi.yaml with a slow and a failing scenario, then build the client against it and test both cases.',
        tone: '#5840b7',
    },
    {
        title: 'Ask me before deploying',
        art: { src: '/start/phones.webp', size: '250%', position: '31% 32%' },
        prompt: 'Before you deploy to production, ask me with Kivel ask_human and wait for my answer. Include what changed and the test results.',
        tone: '#9a5a0c',
    },
];

function CopyLine({ text, label, shown }: { text: string; label: string; shown?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="start-line">
            <code>{shown ?? text}</code>
            <button
                type="button"
                className="start-copy"
                aria-label={label}
                onClick={async () => {
                    try {
                        await navigator.clipboard.writeText(text);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                    } catch {}
                }}
            >
                {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="bold" />}
                {copied ? 'Copied' : 'Copy'}
            </button>
        </div>
    );
}

export function GettingStarted({
    workspace,
    onRename,
}: {
    workspace: string;
    onRename: () => void;
}) {
    const [clientId, setClientId] = useState<(typeof clients)[number]['id']>('claude-code');
    const client = clients.find((entry) => entry.id === clientId)!;
    const [agents, setAgents] = useState<{ id: string; name: string; client?: string }[] | null>(
        null,
    );
    // Updates by itself: the page notices when an agent finishes signing in.
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        let stopped = false;
        async function poll() {
            try {
                const value = await (await api('/api/agents')).json();
                if (!stopped) setAgents(value.agents ?? []);
            } catch {}
            if (!stopped) timer = setTimeout(poll, 4000);
        }
        void poll();
        return () => {
            stopped = true;
            clearTimeout(timer);
        };
    }, []);
    const connected = agents?.[0];
    return (
        <div className="start">
            <header className="start-intro">
                <span className="start-intro-mark" aria-hidden="true">
                    <Plug size={16} />
                </span>
                <div>
                    <h1>Welcome. Getting started</h1>
                    <p>
                        We made your workspace <strong>{workspace}</strong>.{' '}
                        <button type="button" className="start-link" onClick={onRename}>
                            Rename it
                        </button>{' '}
                        any time.
                    </p>
                </div>
            </header>

            <section className="start-card start-setup" aria-labelledby="start-step-1">
                <div className="start-side">
                    <div className="start-step">
                        <span className="start-number">1</span>
                        <h2 id="start-step-1">Set up your</h2>
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger>
                                <button type="button" className="start-picker">
                                    <span
                                        className="start-picker-dot"
                                        style={{ background: client.tone[1] }}
                                    />
                                    {client.name}
                                    <CaretDown size={12} weight="bold" />
                                </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content align="start">
                                {clients.map((entry) => (
                                    <DropdownMenu.Item
                                        key={entry.id}
                                        onSelect={() => setClientId(entry.id)}
                                    >
                                        {entry.name}
                                    </DropdownMenu.Item>
                                ))}
                            </DropdownMenu.Content>
                        </DropdownMenu.Root>
                    </div>
                    <div
                        className="start-art"
                        style={
                            {
                                '--art-a': client.tone[0],
                                '--art-b': client.tone[1],
                            } as React.CSSProperties
                        }
                        aria-hidden="true"
                    >
                        <span>{client.name}</span>
                    </div>
                </div>
                <div className="start-main">
                    <p className="start-for">
                        Setting up Kivel for <strong>{client.name}</strong>
                    </p>
                    <div className="start-well">
                        <h3>In your agent’s chat, send:</h3>
                        <CopyLine
                            text={setupPrompt}
                            shown={`Set up Kivel for me (${siteOrigin})`}
                            label="Copy the setup prompt"
                        />
                        <p>
                            Copies the full setup prompt. Your agent asks to join this workspace and
                            you approve it in the browser.
                        </p>
                    </div>
                    <div className="start-well">
                        <h3>{client.where}</h3>
                        <CopyLine text={client.manual} label="Copy the setup command" />
                    </div>
                    <div className={`start-well start-wait ${connected ? 'is-done' : ''}`}>
                        <h3>
                            <span className="start-dot" aria-hidden="true" />
                            {connected
                                ? `${connected.name} is connected`
                                : 'Waiting for your agent…'}
                        </h3>
                        <p role="status">
                            {connected
                                ? 'Your agent can use every Kivel tool now. Try one of the examples below.'
                                : 'Send the setup to your agent. This page updates by itself when your agent reaches Kivel.'}
                        </p>
                    </div>
                </div>
            </section>

            <section className="start-card" aria-labelledby="start-step-2">
                <div className="start-step">
                    <span className="start-number">2</span>
                    <h2 id="start-step-2">Try it out</h2>
                </div>
                <p className="start-lead">Copy an example below and send it to your agent.</p>
                <div className="start-examples">
                    {examples.map((example) => (
                        <article key={example.title} className="start-example">
                            <span
                                className="start-example-art"
                                style={
                                    {
                                        '--art-b': example.tone,
                                        backgroundImage: `url(${example.art.src})`,
                                        backgroundSize: example.art.size,
                                        backgroundPosition: example.art.position,
                                    } as React.CSSProperties
                                }
                                aria-hidden="true"
                            />
                            <h3>{example.title}</h3>
                            <p>{example.prompt}</p>
                            <CopyLine
                                text={example.prompt}
                                shown="Copy this prompt"
                                label={`Copy the prompt: ${example.title}`}
                            />
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
}
