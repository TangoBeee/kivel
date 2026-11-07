import { shareImage } from '../lib/seo';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from '@phosphor-icons/react/dist/ssr';
import { CookieJar } from '../components/home/cookie-jar';
import { CopyPrompt } from '../components/home/copy-prompt';
import { LiveWebhook } from '../components/home/live-webhook';
import { catalog, categories, categoryHref } from '../lib/catalog';
import { paidPlansEnabled } from '../lib/pricing';
import { setupPrompt } from '../lib/setup-prompt';
import { siteOrigin } from '../lib/site';
import './home.css';

// Brand first, so a search for "kivel" matches the page title and Google learns the name.
const toolTotal = catalog.filter((tool) => tool.status === 'available').length;
const title = `Kivel: email, webhooks and ${toolTotal} tools for AI agents`;
const description = `Kivel (formerly socket.help) gives AI coding agents email inboxes, webhook URLs, mock APIs, OAuth, monitors, memory, 2FA codes and ${toolTotal} tools over one MCP connection. Free to start.`;

export const metadata: Metadata = {
    metadataBase: new URL(siteOrigin),
    title: { absolute: title },
    description,
    alternates: { canonical: '/' },
    openGraph: {
        type: 'website',
        url: '/',
        siteName: 'Kivel',
        title,
        description,
        images: [shareImage],
    },
    twitter: { card: 'summary_large_image', title, description, images: [shareImage.url] },
};

const features = [
    {
        title: 'Webhook inboxes',
        body: 'A URL for GitHub, Shopify, Slack, Twilio, Stripe or your own app.',
    },
    { title: 'Email inboxes', body: 'Signup codes and verification links, extracted.' },
    { title: 'Ask you first', body: 'Risky steps wait until you answer.' },
    {
        title: 'Mock APIs and MCP servers',
        body: 'Fake services with real routes, data and failures.',
    },
    {
        title: 'Files and memory',
        body: 'Share files by link and remember results between sessions.',
    },
    { title: 'Monitors', body: 'Uptime, certificate and cron checks that email you.' },
    { title: 'Authenticators', body: 'Sign-in codes for accounts your human authorized.' },
    {
        title: 'Jobs and status pages',
        body: 'Timed callbacks and a shared view of service health.',
    },
    { title: 'Test data and utilities', body: 'Fixtures, media, JSON, DNS and network checks.' },
];
const available = catalog.filter((tool) => tool.status === 'available').length;

const plans = [
    { name: 'Free', price: '$0', note: '3 agents and 7 days of history. No card.' },
    { name: 'Pro', price: '$2', note: '25 agents, 30 days, forwarding.' },
    { name: 'Team', price: '$6', note: '100 agents in one shared workspace.' },
];

const faqs = [
    {
        question: 'What does my agent need to get started?',
        answer: 'Only the MCP address. Paste the setup prompt into Claude Code, Cursor or any MCP client and the agent adds the server, asks to join your workspace and waits for you to approve it.',
    },
    {
        question: 'Can an agent sign up without me?',
        answer: 'Yes, with a 72 hour trial key that has anonymous limits and a claim link for you. It joins your workspace, and counts against your plan, only after you approve it.',
    },
    {
        question: 'Can an agent approve its own request?',
        answer: 'No. Questions from ask_human can only be answered by a signed in owner or admin in a browser. API keys are refused, and opening the email link does not answer anything by itself.',
    },
    {
        question: 'What happens when I reach the free limit of 3 agents?',
        answer: 'The approval page lists your agents with when each was last active. Replace one, upgrade to Pro for 25 agents, or say no. Nothing is blocked or charged silently.',
    },
    {
        question: 'How long does data stay?',
        answer: 'Anonymous resources last one hour. Free workspaces keep data up to 7 days, Pro 30 days and Team 90 days. Every resource can be deleted early.',
    },
];

const jsonLd = [
    {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': `${siteOrigin}/#website`,
        name: 'Kivel',
        alternateName: ['Kivel.io', 'socket.help'],
        url: `${siteOrigin}/`,
        publisher: { '@id': `${siteOrigin}/#organization` },
    },
    {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        '@id': `${siteOrigin}/#organization`,
        name: 'Kivel',
        alternateName: ['Kivel.io', 'socket.help'],
        url: `${siteOrigin}/`,
        logo: `${siteOrigin}/icon.svg`,
        email: 'support@kivel.io',
        sameAs: [
            'https://www.npmjs.com/package/@kivel/sdk',
            'https://www.npmjs.com/package/@kivel/cli',
        ],
    },
    {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Kivel',
        url: `${siteOrigin}/`,
        applicationCategory: 'DeveloperApplication',
        description,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
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

export default function Home() {
    return (
        <div className="home">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
                }}
            />

            <div className="home-first">
                <section className="home-wrap home-hero" aria-labelledby="hero-heading">
                    <h1 id="hero-heading">The internet toolkit for your coding agent.</h1>
                    <div className="home-hero-side">
                        <p>
                            Your agent can&apos;t catch an incoming webhook or read a signup email
                            on its own. Kivel gives it both, and asks you before risky steps.
                        </p>
                        <div className="home-actions">
                            <CopyPrompt prompt={setupPrompt} />
                            <Link href="/docs/" className="home-link">
                                Read the docs
                            </Link>
                        </div>
                        <p className="home-hero-facts">
                            {paidPlansEnabled ? 'Free to start' : 'Free during the beta'} · Pro $2 a
                            month · Works with Claude Code, Cursor and Codex
                        </p>
                    </div>
                </section>

                <figure className="home-wrap home-art">
                    <img
                        src="/art/klint-youth.webp"
                        alt="Hilma af Klint, The Ten Largest, No. 3, Youth, 1907: spirals and circles in yellow, blue and pink on orange."
                        width={1600}
                        height={895}
                        fetchPriority="high"
                    />
                    <figcaption>Hilma af Klint, The Ten Largest, No. 3, 1907</figcaption>
                </figure>
            </div>

            <section className="home-wrap home-features" aria-label="What your agent gets">
                {features.map((feature) => (
                    <div key={feature.title}>
                        <h2>{feature.title}</h2>
                        <p>{feature.body}</p>
                    </div>
                ))}
            </section>
            <p className="home-wrap home-more">
                {available} tools across {categories.length} categories. Your agent discovers the
                whole catalog with <code>search_tools</code>. Utilities run through{' '}
                <code>run_tool</code>; resources have their own tools. Browser utilities stay free.{' '}
                <Link href="/catalog/" className="home-link">
                    Browse every tool
                </Link>
                {' · '}
                <Link href="/use-cases/" className="home-link">
                    Explore agent workflows
                </Link>
            </p>

            <nav className="home-wrap home-categories" aria-label="Explore tool categories">
                {categories.map((category) => (
                    <Link key={category.id} href={categoryHref(category.id)}>
                        {category.name}{' '}
                        <span>
                            {
                                catalog.filter(
                                    (tool) =>
                                        tool.status === 'available' &&
                                        tool.categoryId === category.id,
                                ).length
                            }
                        </span>
                    </Link>
                ))}
            </nav>

            <section className="home-wrap home-split" aria-labelledby="try-heading">
                <div>
                    <h2 id="try-heading">Try it now.</h2>
                    <p>
                        This is a real webhook inbox, the same one your agent gets. Send it a
                        request.
                    </p>
                </div>
                <LiveWebhook />
            </section>

            <section className="home-wrap home-split" aria-labelledby="pricing-heading">
                <div>
                    <h2 id="pricing-heading">Pricing</h2>
                    <p>
                        {paidPlansEnabled
                            ? 'Start free. Upgrade when you need more agents.'
                            : 'Free during the beta. Paid plans open after it.'}{' '}
                        <Link href="/plans/" className="home-link">
                            See every limit
                        </Link>
                    </p>
                </div>
                <div className="home-plans">
                    {plans.map((plan) => (
                        <div key={plan.name}>
                            <span>{plan.name}</span>
                            <strong>{plan.price}</strong>
                            <p>{plan.note}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="home-wrap home-split" aria-labelledby="faq-heading">
                <div>
                    <h2 id="faq-heading">Questions</h2>
                </div>
                <div className="home-faq">
                    {faqs.map((faq) => (
                        <details key={faq.question}>
                            <summary>
                                {faq.question}
                                <Plus size={16} aria-hidden="true" />
                            </summary>
                            <p>{faq.answer}</p>
                        </details>
                    ))}
                </div>
            </section>

            <section className="home-wrap home-close" aria-labelledby="close-heading">
                <h2 id="close-heading">Give your agent the internet.</h2>
                <CopyPrompt prompt={setupPrompt} />
            </section>
            <CookieJar />
        </div>
    );
}
