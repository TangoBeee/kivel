import { shareImage } from '../lib/seo';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from '@phosphor-icons/react/dist/ssr';
import { CookieJar } from '../components/home/cookie-jar';
import { CopyPrompt } from '../components/home/copy-prompt';
import { LiveWebhook } from '../components/home/live-webhook';
import { catalog, categories, categoryHref } from '../lib/catalog';
import { plans as limits } from '@kivel.io/tools/plans';
import { money, paidPlansEnabled, pricing } from '../lib/pricing';
import { setupPrompt } from '../lib/setup-prompt';
import { siteOrigin } from '../lib/site';
import './home.css';

// Brand first, so a search for "kivel" matches the page title and Google learns the name.
const toolTotal = catalog.filter((tool) => tool.status === 'available').length;
const title = `Kivel: email, webhooks and ${toolTotal} tools for AI agents`;
const description = `Kivel gives AI coding agents email inboxes, webhook URLs, mock APIs, OAuth, monitors, memory, 2FA codes and ${toolTotal} tools over one MCP connection. Free to start.`;

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
        title: 'Email inboxes',
        body: 'Real addresses that send and receive. Codes and verification links are pulled out for you.',
        href: '/catalog/email/',
    },
    {
        title: 'Webhook inboxes',
        body: 'A URL for GitHub, Shopify, Slack, Twilio, Stripe or your own app. Inspect, replay, forward.',
        href: '/webhooks/',
    },
    {
        title: 'Mock APIs and MCP servers',
        body: 'Services with real routes, data and failures, ready before the real one is.',
        href: '/catalog/mock-apis/',
    },
    {
        title: 'Test payments',
        body: 'Wallets, paywalls and checkouts with spending limits. Test units, no real money.',
        href: '/tools/test-wallet/',
    },
    {
        title: 'Monitors and status pages',
        body: 'Uptime, certificate and cron checks that email you, and a public view of health.',
        href: '/catalog/monitoring/',
    },
    {
        title: 'Ask you first',
        body: 'Risky steps wait until you answer in your browser.',
        href: '/catalog/agents/',
    },
    {
        title: 'Passwords and sign-in codes',
        body: 'An encrypted vault and authenticators for accounts you authorized.',
        href: '/catalog/agents/',
    },
    {
        title: 'Files and memory',
        body: 'Share files by link and remember results between sessions.',
        href: '/catalog/files/',
    },
    {
        title: 'Data and utilities',
        body: 'Fixtures, media, JSON, DNS and network checks.',
        href: '/catalog/developer/',
    },
];

const days = (seconds: number) => Math.round(seconds / 86400);
const plans = [
    {
        name: 'Free',
        price: '$0',
        note: `${limits.free.agents} agents and ${days(limits.free.maxRetentionSeconds)} days of history. No card.`,
    },
    {
        name: 'Pro',
        price: money(pricing.pro.monthly),
        note: `${limits.pro.agents} agents, ${days(limits.pro.maxRetentionSeconds)} days, ${limits.pro.emailInboxes} email inboxes.`,
    },
    {
        name: 'Team',
        price: money(pricing.team.monthly),
        note: `${limits.team.agents} agents in one shared workspace, ${days(limits.team.maxRetentionSeconds)} days.`,
    },
];

const faqs = [
    {
        question: 'What does my agent need to get started?',
        answer: 'Only the MCP address. Paste the setup prompt into Claude Code, Cursor or any MCP client and the agent adds the server, asks to join your workspace and waits for you to approve it.',
    },
    {
        question: 'Can I use it in production?',
        answer: 'Yes. Kivel runs in development, CI and production. Inboxes, webhook URLs, mocks and monitors are real, and paid plans keep data longer. Only test payments are simulated, with test units and no real money.',
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
            'https://www.npmjs.com/package/@kivel.io/sdk',
            'https://www.npmjs.com/package/@kivel.io/cli',
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
                    <h1 id="hero-heading">Email, webhooks and mock APIs for your coding agent.</h1>
                    <div className="home-hero-side">
                        <p>
                            Real inboxes, webhook URLs and API endpoints for Claude Code, Cursor and
                            Codex, over one MCP connection. Use them in development, CI and
                            production. Kivel asks you before risky steps.
                        </p>
                        <div className="home-actions">
                            <CopyPrompt prompt={setupPrompt} />
                            <Link href="/docs/" className="home-link">
                                Read the docs
                            </Link>
                        </div>
                        <p className="home-hero-facts">
                            {paidPlansEnabled ? 'Free to start' : 'Free during the beta'} · Pro{' '}
                            {money(pricing.pro.monthly)} a month · {toolTotal} tools
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
                    <Link key={feature.title} href={feature.href}>
                        <h2>{feature.title}</h2>
                        <p>{feature.body}</p>
                    </Link>
                ))}
            </section>
            <p className="home-wrap home-more">
                {toolTotal} tools across {categories.length} categories. Your agent discovers the
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
