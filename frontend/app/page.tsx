import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '../components/icons';
import type { IconName } from '../components/icons';
import { Interfaces } from '../components/landing/interfaces';
import { Reveal } from '../components/landing/reveal';
import { SignalTraces } from '../components/landing/signal-traces';
import { HeroPill } from '../components/landing/hero-pill';
import { AgentTerminal } from '../components/landing/agent-terminal';
import { toolGlyphs } from '../components/tool-glyphs';
import { siteOrigin } from '../lib/site';
import { catalog, toolPageHref } from '../lib/catalog';
import './landing.css';

const total = catalog.length;
const available = catalog.filter((tool) => tool.status === 'available').length;
// Rounded down so the copy reads "130+" rather than an exact count that changes every release.
const roundedAvailable = Math.floor(available / 10) * 10;
const glyphs = toolGlyphs();
const description = `Webhook inboxes, mock APIs, MCP servers, file drops and ${roundedAvailable}+ utilities for you and your AI agent, over one MCP connection. Free to start; Pro is $2 a month.`;

export const metadata: Metadata = {
    metadataBase: new URL(siteOrigin),
    title: { absolute: 'socket.help | Everything your AI agent needs from the internet' },
    description,
    alternates: { canonical: '/' },
    openGraph: {
        type: 'website',
        url: '/',
        siteName: 'socket.help',
        title: 'Everything your AI agent needs from the internet',
        description,
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Everything your AI agent needs from the internet',
        description,
    },
};

type Capability = { icon: IconName; title: string; body: string; href?: string };

// Live capabilities link to their tool; the rest are on the agent kit roadmap and say so.
const capabilities: Capability[] = [
    {
        icon: 'webhook',
        title: 'Webhook inboxes',
        body: 'A private URL in one second. Inspect every request, or let your agent wait for one.',
        href: '/webhooks/',
    },
    {
        icon: 'cube',
        title: 'Mock APIs',
        body: 'REST, CRUD, GraphQL and OpenAPI mocks with realistic responses, errors and delays.',
        href: '/tools/mock-rest-api/',
    },
    {
        icon: 'robot',
        title: 'Mock MCP servers',
        body: 'Spin up a fake MCP server, or inspect a real one, without installing anything.',
        href: '/tools/mock-mcp-server/',
    },
    {
        icon: 'files',
        title: 'File drops',
        body: 'Upload from a browser, script or agent and share a private, expiring link.',
        href: '/tools/private-file-sharing/',
    },
    {
        icon: 'grid',
        title: '130+ utilities',
        body: 'JSON, JWT, DNS, SSL, PDFs, images and more, in the browser or through the API.',
        href: '/catalog/',
    },
    {
        icon: 'timer',
        title: 'Wait for events',
        body: 'Agents block until a webhook arrives, so tests and flows finish on their own.',
        href: '/tools/socket-help-mcp/',
    },
    {
        icon: 'mail',
        title: 'Email inboxes',
        body: 'An address your agent can read: sign-up codes and magic links, extracted.',
        href: '/tools/temporary-email-inbox/',
    },
    {
        icon: 'pulse',
        title: 'Monitors and schedules',
        body: 'Heartbeats, uptime and SSL checks, and scheduled calls that wake your agent.',
    },
    {
        icon: 'database',
        title: 'Memory',
        body: 'A small key-value store so agents remember things between sessions.',
    },
    {
        icon: 'terminal',
        title: 'Code sandbox',
        body: 'Run short JavaScript and Python snippets in isolation, with hard limits.',
    },
    {
        icon: 'click',
        title: 'Ask a human',
        body: 'Your agent asks before risky steps, and you approve from one email link.',
    },
    {
        icon: 'receipt',
        title: 'Agent wallet',
        body: 'A prepaid balance with per-agent spending limits for metered extras.',
    },
];

// Competitor figures come from their public pricing pages and FAQs as of October 2026.
const comparison: { need: string; others: string; ours: string }[] = [
    {
        need: 'Webhook inbox lifetime',
        others: 'webhook.site free URLs: about 7 days',
        ours: '7 days with a free account',
    },
    {
        need: 'Mock API requests',
        others: 'Beeceptor free plan: 50 a day',
        ours: '120 a minute, free',
    },
    {
        need: 'MCP server testing',
        others: 'MCP Inspector, MCPJam: install and run locally',
        ours: 'Hosted. Nothing to install.',
    },
    {
        need: 'Use from an AI agent',
        others: 'A separate product and account for each job',
        ours: 'One MCP connection for everything',
    },
    {
        need: 'Paid plan',
        others: 'webhook.site from $7.50, Beeceptor from $10 a month',
        ours: 'Pro is $2 a month',
    },
];

const popular = [
    'webhooks',
    'mock-apis-mock-rest-api',
    'agents-mcp-server-inspector',
    'files-private-file-sharing',
    'json',
    'developer-jwt-inspector',
    'network-dns-lookup',
    'network-ssl-tls-inspector',
    'everyday-merge-pdfs',
    'everyday-image-compressor',
    'everyday-qr-code-generator',
    'everyday-password-generator',
].flatMap((id) => catalog.filter((tool) => tool.id === id));

const promises: { icon: IconName; title: string; body: string }[] = [
    {
        icon: 'coffee',
        title: 'A real free plan',
        body: 'Free allowances that match or beat other tools’ free tiers. No card, no trial clock.',
    },
    {
        icon: 'shield',
        title: 'Private by default',
        body: 'Every inbox, mock and file starts private, with separate access and management tokens.',
    },
    {
        icon: 'eye-off',
        title: 'No ads, ever',
        body: 'No banners, popups, sponsored results, or tracking analytics.',
    },
    {
        icon: 'receipt',
        title: 'Limits in plain sight',
        body: 'Quotas, retention and expiry are written down before you click, not discovered afterwards.',
    },
];

const faqs: { question: string; answer: string }[] = [
    {
        question: 'Is socket.help free?',
        answer: 'Yes. Every available tool has a free allowance and most need no account. A free account keeps resources for 7 days and adds API keys for your agents. Pro is $2 a month for longer retention and much higher limits.',
    },
    {
        question: 'Do I need an account?',
        answer: 'No. All currently available tools work without an account. Resources default to private, with separate access and management credentials. Public sharing is an explicit choice.',
    },
    {
        question: 'What happens to my files and data?',
        answer: 'Browser-local tools keep input on your device. Hosted resources are private by default and expire on schedule: 1 hour without an account, up to 7 days on Free, 30 on Pro and 90 on Team. Each tool explains what it stores and how to delete it.',
    },
    {
        question: 'What does a workspace include?',
        answer: 'A free account gives you a personal workspace for resources, API keys, usage, and recovery settings. Team plans support shared membership when billing is configured. Grouped Socket Spaces remain on the roadmap.',
    },
    {
        question: 'Can AI agents use socket.help?',
        answer: 'That is what it is built for. Connect Claude Code, Cursor, Codex, ChatGPT or any MCP client to one endpoint, and your agent can create inboxes, wait for webhooks, mock APIs, share files and run any utility, with the same resources you see in the browser.',
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
        <Link href="/connect/" className="lp-button">
            Connect your agent
            <Icon name="arrow" size={16} />
        </Link>
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
                    <HeroPill stats="Open beta · Works with Claude Code, Cursor, Codex and ChatGPT" />
                    <h1 id="hero-heading" className="lp-hero-heading">
                        Everything your AI agent needs from the internet.
                    </h1>
                    <p className="lp-hero-sub">
                        Webhook inboxes, mock APIs, MCP servers, file drops and {roundedAvailable}+
                        tools. Use them in your browser, or give your agent all of them through one
                        MCP connection. Free to start. Pro is $2 a month.
                    </p>
                    <div className="lp-hero-action">
                        <PrimaryAction />
                        <Link href="/webhooks/" className="lp-button lp-button-ghost">
                            Try a webhook inbox
                        </Link>
                    </div>
                    <p className="lp-hero-proof">
                        No card · Private by default · No ads · API, SDK, CLI and MCP
                    </p>
                    <AgentTerminal />
                </div>
            </section>

            <section className="lp-section lp-container" aria-labelledby="kit-heading">
                <Reveal className="lp-section-head">
                    <span className="lp-eyebrow">The agent kit</span>
                    <h2 id="kit-heading">One connection. Everything an agent can’t do alone.</h2>
                    <p>
                        Agents can write code, but they can’t receive a webhook, keep a URL online
                        or remember yesterday. socket.help does that part for them.
                    </p>
                </Reveal>
                <div className="lp-kit">
                    {capabilities.map((item, index) => {
                        const body = (
                            <>
                                <span className="lp-icon">
                                    <Icon name={item.icon} size={20} />
                                </span>
                                <h3>
                                    {item.title}
                                    {!item.href && <em className="lp-soon">Coming soon</em>}
                                </h3>
                                <p>{item.body}</p>
                            </>
                        );
                        return (
                            <Reveal key={item.title} delay={(index % 4) * 80}>
                                {item.href ? (
                                    <Link href={item.href} className="lp-kit-card">
                                        {body}
                                    </Link>
                                ) : (
                                    <div className="lp-kit-card is-soon">{body}</div>
                                )}
                            </Reveal>
                        );
                    })}
                </div>
            </section>

            <section className="lp-section lp-container" aria-labelledby="compare-heading">
                <Reveal className="lp-section-head">
                    <span className="lp-eyebrow">Worth it?</span>
                    <h2 id="compare-heading">More free than the free tools. Pro for $2.</h2>
                    <p>
                        The jobs people use separate tools for, side by side. Their figures come
                        from their public pricing pages as of October 2026.
                    </p>
                </Reveal>
                <Reveal className="lp-compare">
                    <table>
                        <thead>
                            <tr>
                                <th scope="col">What you need</th>
                                <th scope="col">Elsewhere</th>
                                <th scope="col">socket.help</th>
                            </tr>
                        </thead>
                        <tbody>
                            {comparison.map((row) => (
                                <tr key={row.need}>
                                    <th scope="row">{row.need}</th>
                                    <td>{row.others}</td>
                                    <td>
                                        <Icon name="check" size={15} /> {row.ours}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <Link href="/compare/" className="text-link">
                        See detailed comparisons <Icon name="arrow" size={14} />
                    </Link>
                </Reveal>
            </section>

            <section className="lp-interface-section" aria-labelledby="interfaces-heading">
                <div className="lp-container lp-section">
                    <Reveal className="lp-section-head">
                        <h2 id="interfaces-heading">
                            Click it, curl it, script it, or ask an agent
                        </h2>
                        <p>
                            Every tool works in the browser and from your code, terminal or agent,
                            with the same limits and the same data.
                        </p>
                    </Reveal>
                    <Reveal>
                        <Interfaces />
                    </Reveal>
                </div>
            </section>

            <section className="lp-section lp-container" aria-labelledby="popular-heading">
                <Reveal className="lp-section-head">
                    <span className="lp-eyebrow">For people too</span>
                    <h2 id="popular-heading">Popular tools, ready in the browser</h2>
                    <p>
                        No sign-up for most of them. Your files stay on your device where possible.
                    </p>
                </Reveal>
                <div className="lp-popular">
                    {popular.map((tool, index) => (
                        <Reveal key={tool.id} delay={(index % 4) * 60}>
                            <Link href={toolPageHref(tool)} className="lp-popular-item">
                                <span className="lp-popular-glyph">{glyphs[tool.id]}</span>
                                <span>
                                    <strong>{tool.name}</strong>
                                    <small>{tool.description}</small>
                                </span>
                            </Link>
                        </Reveal>
                    ))}
                </div>
                <div className="lp-center">
                    <Link href="/catalog/" className="lp-button lp-button-ghost">
                        Browse all {total} tools <Icon name="arrow" size={16} />
                    </Link>
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
                        <Link href="/connect/">
                            <strong>Connect your agent</strong>
                            <span>Claude Code, Cursor, Codex, ChatGPT and VS Code setup.</span>
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
                    <h2 id="final-heading">Give your agent the internet in one minute.</h2>
                    <p>Free to start, nothing to install, and nothing to cancel.</p>
                    <div className="lp-hero-action">
                        <PrimaryAction />
                        <Link href="/catalog/" className="lp-button lp-button-ghost">
                            Browse tools
                        </Link>
                    </div>
                </Reveal>
            </section>
        </div>
    );
}
