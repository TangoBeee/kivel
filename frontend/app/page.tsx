import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '../components/icons';
import type { IconName } from '../components/icons';
import { CommandBar } from '../components/landing/command-bar';
import { Interfaces } from '../components/landing/interfaces';
import { Reveal } from '../components/landing/reveal';
import { SignalTraces } from '../components/landing/signal-traces';
import { HeroPill } from '../components/landing/hero-pill';
import { SocketBoard } from '../components/landing/socket-board';
import { TaglineReveal } from '../components/landing/tagline-reveal';
import { toolGlyphs } from '../components/tool-glyphs';
import { siteOrigin } from '../lib/site';
import { catalog, categories } from '../lib/catalog';
import './landing.css';

const total = catalog.length;
const available = catalog.filter((tool) => tool.status === 'available').length;
const glyphs = toolGlyphs();
const description = `${available} working tools for formatting, conversion, webhooks, mock APIs, file sharing, and MCP. Explore ${total} tools in the catalog, with planned features clearly marked. No account or ads.`;

export const metadata: Metadata = {
    metadataBase: new URL(siteOrigin),
    title: { absolute: 'socket.help | One toolbox for the whole internet' },
    description,
    alternates: { canonical: '/' },
    openGraph: {
        type: 'website',
        url: '/',
        siteName: 'socket.help',
        title: 'One toolbox for the whole internet',
        description,
    },
    twitter: {
        card: 'summary_large_image',
        title: 'One toolbox for the whole internet',
        description,
    },
};

const audiences: { icon: IconName; label: string; title: string; body: string }[] = [
    {
        icon: 'shapes',
        label: 'For everyone',
        title: 'The everyday essentials',
        body: 'Format text, convert data, generate a password, or send a file to another computer. Process images and PDFs with bounded previews and downloads.',
    },
    {
        icon: 'code',
        label: 'For developers',
        title: 'Test infrastructure on tap',
        body: 'Mock APIs and webhook inboxes that appear in a second and clean up after themselves. Temporary databases and tunnels are on the roadmap.',
    },
    {
        icon: 'robot',
        label: 'For AI agents',
        title: 'A sandbox your agent can drive',
        body: 'Claude Code, Cursor, and your own agents can create, inspect, and tear down resources over MCP.',
    },
];

const promises: { icon: IconName; title: string; body: string }[] = [
    {
        icon: 'coffee',
        title: 'Free for everyone',
        body: 'Every available tool has a useful free allowance. The basics never sit behind a paywall.',
    },
    {
        icon: 'eye-off',
        title: 'No ads, ever',
        body: 'No banners, popups, sponsored results, or tracking analytics. Useful tools without advertising.',
    },
    {
        icon: 'code',
        title: 'Self-hostable',
        body: 'Run your own copy with the portable Docker setup. Keep your tools and temporary data on infrastructure you control.',
    },
    {
        icon: 'receipt',
        title: 'Limits in plain sight',
        body: 'Quotas, retention, and expiry are written down before you click, not discovered afterwards.',
    },
];

const faqs: { question: string; answer: string }[] = [
    {
        question: 'Is socket.help free?',
        answer: 'Yes. Available tools are free within the published limits, with no account required. Planned tools are marked Coming soon; free accounts add a workspace and larger allowances. Pro and Team checkout opens only when billing is configured.',
    },
    {
        question: 'Do I need an account?',
        answer: 'No. All currently available tools work without an account. Resources default to private, with separate access and management credentials. Public sharing is an explicit choice.',
    },
    {
        question: 'What happens to my files and data?',
        answer: 'Browser-local tools keep input on your device. Hosted resources start with a one-hour lifetime, with longer retention available within plan limits. Each tool explains what it stores and how to delete it.',
    },
    {
        question: 'What does a workspace include?',
        answer: 'A free account gives you a personal workspace for resources, API keys, usage, and recovery settings. Team plans support shared membership when billing is configured. Grouped Socket Spaces remain on the roadmap.',
    },
    {
        question: 'Can AI agents use socket.help?',
        answer: 'Yes. socket.help speaks MCP, so agents like Claude Code and Cursor can create mock services, capture callbacks, inspect results, and clean up, using the same resources you see in the browser.',
    },
    {
        question: 'Is there an API and a CLI?',
        answer: 'Server tools have a documented HTTP API, and you can use cURL in your terminal or CI. MCP exposes agent-friendly tools over the same resources and quotas. A TypeScript SDK and CLI are included as repository packages. An optional SSH gateway is available for self-hosted installs; see Integrations for setup.',
    },
    {
        question: 'How do you prevent abuse?',
        answer: 'Short default lifetimes, per tool rate limits, redaction of sensitive headers, and no anonymous outbound email. Hosted resources enforce access controls, size limits, and usage quotas.',
    },
    {
        question: 'Can I host socket.help myself?',
        answer: 'Yes. The portable Docker setup runs the application with PostgreSQL on your infrastructure. Optional HTTPS and SSH profiles support deployment workflows.',
    },
];

const jsonLd = [
    {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'socket.help',
        url: `${siteOrigin}/`,
        description,
    },
    {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map(({ question, answer }) => ({
            '@type': 'Question',
            name: question,
            acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
    },
];

function PrimaryAction() {
    return (
        <Link href="/catalog/" className="lp-button">
            Browse all {total} tools
            <Icon name="arrow" size={16} />
        </Link>
    );
}

function AudienceVisual({ index }: { index: number }) {
    const examples = [
        { label: 'Format JSON', code: '{"ready":true} → {\n  "ready": true\n}' },
        { label: 'Mock a response', code: 'GET /orders → 200\n[{ "id": "test-001" }]' },
        { label: 'Connect an agent', code: 'tools/list → discover\ntools/call → run_tool' },
    ];
    const example = examples[index]!;
    return (
        <div className="lp-mini lp-example">
            <span>{example.label} · Example</span>
            <pre>{example.code}</pre>
        </div>
    );
}

export default function Home() {
    return (
        <div className="lp">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
                }}
            />

            <section className="lp-hero" aria-labelledby="hero-heading">
                <SignalTraces />
                <div className="lp-container lp-hero-inner">
                    <HeroPill
                        stats={`${available} ready · ${total} in the catalog · ${categories.length} categories`}
                    />
                    <h1 id="hero-heading" className="lp-hero-heading">
                        One toolbox
                        <br />
                        for the whole internet.
                    </h1>
                    <p className="lp-hero-sub">
                        Free open beta. Format data, test APIs, catch webhooks, and share files.
                        Free allowances, no ads, and no account needed to start.
                    </p>
                    <CommandBar total={total} />
                    <div className="lp-hero-action">
                        <PrimaryAction />
                    </div>
                </div>
            </section>

            <section className="lp-section lp-container" aria-labelledby="board-heading">
                <Reveal className="lp-section-head">
                    <span className="lp-eyebrow">The board</span>
                    <h2 id="board-heading">{total} tools, one panel</h2>
                    <p>Every socket is a tool. Pick a category to see what lives there.</p>
                </Reveal>
                <Reveal>
                    <SocketBoard glyphs={glyphs} />
                </Reveal>
            </section>

            <section className="lp-section lp-container" aria-label="What socket.help is for">
                <TaglineReveal
                    lines={[
                        'Format some data, mock an API,',
                        'hand your agent a sandbox.',
                        'Same place. Same simplicity.',
                    ]}
                />
            </section>

            <section className="lp-section lp-container" aria-labelledby="audience-heading">
                <Reveal className="lp-section-head">
                    <h2 id="audience-heading">
                        Simple enough for anyone, deep enough for engineers
                    </h2>
                </Reveal>
                <div className="lp-audiences">
                    {audiences.map((audience, index) => (
                        <Reveal
                            key={audience.label}
                            className="lp-card lp-audience"
                            delay={index * 120}
                        >
                            <AudienceVisual index={index} />
                            <span className="lp-label">
                                <Icon name={audience.icon} size={14} /> {audience.label}
                            </span>
                            <h3>{audience.title}</h3>
                            <p>{audience.body}</p>
                        </Reveal>
                    ))}
                </div>
            </section>

            <section className="lp-section lp-container" aria-labelledby="workspace-heading">
                <Reveal className="lp-workflow">
                    <div>
                        <h2 id="workspace-heading">Temporary tools. A workspace that remembers.</h2>
                        <p>
                            Create resources, see their expiry, rotate access, and clean up from one
                            place. A free account keeps your resources and API keys together.
                        </p>
                        <Link className="lp-button" href="/account/">
                            Open your workspace <Icon name="arrow" size={16} />
                        </Link>
                    </div>
                    <ol>
                        <li>
                            <span aria-hidden="true">
                                <Icon name="plus" size={18} />
                            </span>
                            <div>
                                <strong>Create what you need</strong>
                                <p>A webhook inbox, mock API, MCP server, or file share.</p>
                            </div>
                        </li>
                        <li>
                            <span aria-hidden="true">
                                <Icon name="shield" size={18} />
                            </span>
                            <div>
                                <strong>Choose who can use it</strong>
                                <p>Private access by default. Public sharing when you choose.</p>
                            </div>
                        </li>
                        <li>
                            <span aria-hidden="true">
                                <Icon name="timer" size={18} />
                            </span>
                            <div>
                                <strong>Keep track of the lifetime</strong>
                                <p>Inspect, renew within plan limits, or delete when finished.</p>
                            </div>
                        </li>
                    </ol>
                </Reveal>
            </section>

            <section className="lp-interface-section" aria-labelledby="interfaces-heading">
                <div className="lp-container lp-section">
                    <Reveal className="lp-section-head">
                        <h2 id="interfaces-heading">
                            Click it, curl it, script it, or ask an agent
                        </h2>
                        <p>
                            Try JSON in the browser, then use the same toolbox from your code,
                            terminal, or agent.
                        </p>
                    </Reveal>
                    <Reveal>
                        <Interfaces />
                    </Reveal>
                </div>
            </section>

            <section className="lp-section lp-container" aria-labelledby="promises-heading">
                <Reveal className="lp-section-head">
                    <h2 id="promises-heading">Useful first. Everything else second.</h2>
                </Reveal>
                <div className="lp-promises">
                    {promises.map((promise, index) => (
                        <Reveal key={promise.title} className="lp-promise" delay={index * 100}>
                            <span className="lp-icon">
                                <Icon name={promise.icon} size={20} />
                            </span>
                            <h3>{promise.title}</h3>
                            <p>{promise.body}</p>
                        </Reveal>
                    ))}
                </div>
            </section>

            <section className="lp-section lp-container" aria-labelledby="learn-heading">
                <Reveal className="lp-learning">
                    <h2 id="learn-heading">A little context goes a long way.</h2>
                    <div>
                        <Link href="/blog/">
                            <strong>Practical guides</strong>
                            <span>Webhooks, file access, and better API tests.</span>
                            <Icon name="arrow" size={18} />
                        </Link>
                        <Link href="/compare/">
                            <strong>Compare your options</strong>
                            <span>Where socket.help fits alongside other tools.</span>
                            <Icon name="arrow" size={18} />
                        </Link>
                        <Link href="/docs/">
                            <strong>Build with the API</strong>
                            <span>Authentication, examples, and endpoint schemas.</span>
                            <Icon name="arrow" size={18} />
                        </Link>
                    </div>
                </Reveal>
            </section>

            <section className="lp-section lp-container" aria-labelledby="faq-heading">
                <Reveal className="lp-section-head">
                    <h2 id="faq-heading">Questions, answered plainly</h2>
                </Reveal>
                <div className="lp-faq">
                    {faqs.map((faq) => (
                        <Reveal key={faq.question}>
                            <details className="lp-faq-item">
                                <summary>
                                    {faq.question}
                                    <Icon name="caret-down" size={18} />
                                </summary>
                                <p>{faq.answer}</p>
                            </details>
                        </Reveal>
                    ))}
                </div>
            </section>

            <section className="lp-section lp-container" aria-labelledby="final-heading">
                <Reveal className="lp-final">
                    <div className="lp-final-sockets" aria-hidden="true">
                        {categories.map((category) => (
                            <span key={category.id}>
                                <Icon name={category.icon} size={18} />
                            </span>
                        ))}
                    </div>
                    <h2 id="final-heading">
                        Whatever the job,
                        <br />
                        there is a socket for it.
                    </h2>
                    <p>Free to start, nothing to install, and nothing to cancel.</p>
                    <PrimaryAction />
                </Reveal>
            </section>
        </div>
    );
}
