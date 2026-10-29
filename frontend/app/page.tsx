import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '../components/icons';
import type { IconName } from '../components/icons';
import { Reveal } from '../components/landing/reveal';
import { HeroPill } from '../components/landing/hero-pill';
import { AgentTerminal } from '../components/landing/agent-terminal';
import { TaglineReveal } from '../components/landing/tagline-reveal';
import { siteOrigin } from '../lib/site';
import { catalog } from '../lib/catalog';
import './landing.css';

const available = catalog.filter((tool) => tool.status === 'available').length;
// Rounded down so the copy reads "130+" rather than an exact count that changes every release.
const roundedAvailable = Math.floor(available / 10) * 10;
const description = `Give your AI agent a webhook inbox, an email address, mock APIs, monitors, memory and ${roundedAvailable}+ tools over one MCP connection. Free to start; Pro is $2 a month.`;

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

// Only what works today. Planned features live on the roadmap, not on the homepage.
const benefits: { icon: IconName; title: string; body: string; href: string }[] = [
    {
        icon: 'webhook',
        title: 'Webhook inboxes',
        body: 'A private URL that catches Stripe, GitHub or any callback, and waits for it so your agent can check the result.',
        href: '/webhooks/',
    },
    {
        icon: 'mail',
        title: 'Email inboxes',
        body: 'A real address for signup tests. Codes and magic links come back already pulled out.',
        href: '/tools/temporary-email-inbox/',
    },
    {
        icon: 'cube',
        title: 'Mock APIs',
        body: 'Fake any endpoint in seconds, with realistic data, random failures and a log of every call.',
        href: '/tools/mock-rest-api/',
    },
    {
        icon: 'pulse',
        title: 'Monitors',
        body: 'Uptime, SSL expiry and cron job checks that email you when something breaks.',
        href: '/account/#monitors',
    },
    {
        icon: 'database',
        title: 'Memory',
        body: 'Your agent saves notes and results, and finds them again in its next session.',
        href: '/connect/',
    },
    {
        icon: 'grid',
        title: `${roundedAvailable}+ tools`,
        body: 'JSON, JWT, DNS, SSL, PDFs and images. Your agent finds the right one by searching.',
        href: '/catalog/',
    },
];

const steps = [
    {
        title: 'Create a free account',
        body: 'Get an API key in your dashboard. No card needed.',
    },
    {
        title: 'Add one line to your agent',
        body: 'Claude Code, Cursor, Codex, ChatGPT or any MCP client.',
    },
    {
        title: 'Ask for what you need',
        body: '“Test my signup flow” or “Watch my site and tell me if it goes down.”',
    },
];

// Competitor figures come from their public pricing pages as of October 2026.
const comparison: { need: string; others: string; ours: string }[] = [
    {
        need: 'Webhook inbox',
        others: 'webhook.site, from $7.50 a month',
        ours: 'Included, with forwarding on Pro',
    },
    {
        need: 'Mock API',
        others: 'Beeceptor, 50 free requests a day',
        ours: '120 requests a minute, free',
    },
    {
        need: 'Email inbox for tests',
        others: 'MailSlurp, about $20 a month',
        ours: 'Included',
    },
    {
        need: 'Cron and uptime monitors',
        others: 'Healthchecks.io, about $20 a month',
        ours: '20 free, 100 on Pro',
    },
];

const faqs: { question: string; answer: string }[] = [
    {
        question: 'What does socket.help do?',
        answer: 'It gives AI agents the things they cannot do from a laptop: receive webhooks and email, host a mock API, watch a site around the clock and remember results between sessions. You can use every tool in the browser too.',
    },
    {
        question: 'Is it free?',
        answer: 'Yes. The free plan needs no card and includes webhook and email inboxes, mock APIs, 20 monitors and 5 MiB of agent memory. Pro is $2 a month for longer retention, forwarding, proxy mocks and higher limits.',
    },
    {
        question: 'Which agents work with it?',
        answer: 'Any client that speaks MCP over HTTP, including Claude Code, Cursor, Codex, ChatGPT and VS Code. There is also a plain HTTP API, a CLI and a TypeScript SDK.',
    },
    {
        question: 'Is my data private?',
        answer: 'Yes. Inboxes, mocks and files are private by default, with separate tokens to use and to manage them. Agent activity logs keep only the tool name and result, never your data.',
    },
    {
        question: 'Can my agent send email from it?',
        answer: 'No. Email inboxes are receive only, so they cannot be used for spam. Alerts from monitors go only to your own verified address.',
    },
    {
        question: 'Can I cancel anytime?',
        answer: 'Yes. Pro is monthly and you can cancel from your dashboard. Your account drops back to the free plan.',
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
            Connect your agent free
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
                <div className="lp-container lp-hero-inner">
                    <HeroPill stats="Works with Claude Code, Cursor, Codex and ChatGPT" />
                    <h1 id="hero-heading" className="lp-hero-heading">
                        Everything your AI agent
                        <br />
                        needs from the internet.
                    </h1>
                    <p className="lp-hero-sub">
                        Webhooks, email, mock APIs, monitors and memory for your agent, through one
                        MCP connection.
                    </p>
                    <div className="lp-hero-action">
                        <PrimaryAction />
                    </div>
                    <p className="lp-hero-proof">
                        Free plan, no card. Or <Link href="/webhooks/">try a webhook inbox</Link>{' '}
                        right now.
                    </p>
                    <AgentTerminal />
                </div>
            </section>

            <section className="lp-section lp-container" aria-label="Why socket.help">
                <TaglineReveal
                    lines={[
                        'Your agent can write the code.',
                        'It cannot receive a webhook,',
                        'read an email or stay online.',
                        'That part is us.',
                    ]}
                />
            </section>

            <section className="lp-section lp-container" aria-labelledby="kit-heading">
                <Reveal className="lp-section-head">
                    <h2 id="kit-heading">What your agent gets</h2>
                    <p>Six things that work today. You can use each one in the browser too.</p>
                </Reveal>
                <div className="lp-kit">
                    {benefits.map((item, index) => (
                        <Reveal key={item.title} delay={(index % 3) * 80}>
                            <Link href={item.href} className="lp-kit-card">
                                <span className="lp-icon">
                                    <Icon name={item.icon} size={20} />
                                </span>
                                <h3>{item.title}</h3>
                                <p>{item.body}</p>
                            </Link>
                        </Reveal>
                    ))}
                </div>
            </section>

            <section className="lp-section lp-container" aria-labelledby="steps-heading">
                <Reveal className="lp-section-head">
                    <h2 id="steps-heading">Ready in one minute</h2>
                </Reveal>
                <ol className="lp-steps">
                    {steps.map((step, index) => (
                        <Reveal key={step.title} delay={index * 100}>
                            <li>
                                <span className="lp-step-number">{index + 1}</span>
                                <h3>{step.title}</h3>
                                <p>{step.body}</p>
                            </li>
                        </Reveal>
                    ))}
                </ol>
            </section>

            <section className="lp-section lp-container" aria-labelledby="compare-heading">
                <Reveal className="lp-section-head">
                    <h2 id="compare-heading">One account instead of four tools</h2>
                    <p>Pro is $2 a month. Prices of other tools as listed in October 2026.</p>
                </Reveal>
                <Reveal className="lp-compare">
                    <table>
                        <thead>
                            <tr>
                                <th scope="col">You need</th>
                                <th scope="col">Usually</th>
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
                </Reveal>
            </section>

            <section className="lp-section lp-container" aria-labelledby="faq-heading">
                <Reveal className="lp-section-head">
                    <h2 id="faq-heading">Questions</h2>
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
                    <h2 id="final-heading">Give your agent the internet.</h2>
                    <p>Free plan, no card, cancel anytime.</p>
                    <PrimaryAction />
                </Reveal>
            </section>
        </div>
    );
}
