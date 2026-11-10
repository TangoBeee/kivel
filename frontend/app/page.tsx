import { shareImage } from '../lib/seo';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
    ArrowRight,
    Code,
    Folder,
    HandPalm,
    Key,
    Plus,
    Pulse,
    Wallet,
} from '@phosphor-icons/react/dist/ssr';
import { CookieJar } from '../components/home/cookie-jar';
import { CopyPrompt } from '../components/home/copy-prompt';
import { LiveWebhook } from '../components/home/live-webhook';
import { catalog, categories, categoryHref } from '../lib/catalog';
import { plans as limits } from '@kivel.io/tools/plans';
import { earlyPriceNote, money, paidPlansEnabled, pricing } from '../lib/pricing';
import { setupPrompt } from '../lib/setup-prompt';
import { siteOrigin } from '../lib/site';
import './home.css';

const toolTotal = catalog.filter((tool) => tool.status === 'available').length;
const title = 'Kivel: email, webhooks and mock APIs for AI agents';
const description =
    'Give Claude Code, Cursor and Codex email inboxes, webhook URLs and mock APIs over MCP. Use Kivel in development, CI and production.';

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

// The three main products, each shown on a painting with a piece of the real product.
const showcase = [
    {
        title: 'Email inboxes',
        body: 'Send and receive email on socketspace.xyz. Extract one-time codes and verification links automatically.',
        href: '/catalog/email/',
        art: '/art/klee-castle-and-sun.webp',
        credit: 'Paul Klee, Castle and Sun, 1928',
        snippet: 'email',
    },
    {
        title: 'Webhook inboxes',
        body: 'Capture webhooks from Stripe, GitHub, Slack or your own app. Inspect, replay and forward requests.',
        href: '/webhooks/',
        art: '/art/kandinsky-several-circles.webp',
        credit: 'Wassily Kandinsky, Several Circles, 1926',
        snippet: 'webhook',
    },
    {
        title: 'Mock APIs',
        body: 'Mock REST, GraphQL and OAuth endpoints. Set routes, responses, delays and errors.',
        href: '/catalog/mock-apis/',
        art: '/art/malevich-suprematist.webp',
        credit: 'Kazimir Malevich, Suprematist Composition, 1916',
        snippet: 'mock',
    },
] as const;

const more = [
    {
        title: 'Test payments',
        body: 'Test units, no real money',
        href: '/tools/test-wallet/',
        Icon: Wallet,
    },
    {
        title: 'Monitors',
        body: 'Uptime, SSL and cron checks',
        href: '/catalog/monitoring/',
        Icon: Pulse,
    },
    {
        title: 'Ask you first',
        body: 'Risky steps wait for you',
        href: '/catalog/agents/',
        Icon: HandPalm,
    },
    {
        title: 'Password vault',
        body: 'Encrypted, with 2FA codes',
        href: '/catalog/agents/',
        Icon: Key,
    },
    {
        title: 'Files and memory',
        body: 'Share and remember',
        href: '/catalog/files/',
        Icon: Folder,
    },
    {
        title: 'Data and utilities',
        body: 'Fixtures, JSON, DNS',
        href: '/catalog/developer/',
        Icon: Code,
    },
];

function Snippet({ kind }: { kind: (typeof showcase)[number]['snippet'] }) {
    if (kind === 'email')
        return (
            <div className="home-snip">
                <div className="home-snip-head">
                    <span>agent-7f2k@socketspace.xyz</span>
                </div>
                <div className="home-snip-row">
                    <div>
                        <strong>Your verification code</strong>
                        <small>Northwind · 09:41</small>
                    </div>
                    <code className="home-snip-code">482 901</code>
                </div>
            </div>
        );
    if (kind === 'webhook')
        return (
            <div className="home-snip">
                <div className="home-snip-head">
                    <span>
                        <b>POST</b> /hooks/9xk2f
                    </span>
                    <span>200</span>
                </div>
                <pre>{'{\n  "type": "payment.succeeded",\n  "amount": 2400\n}'}</pre>
            </div>
        );
    return (
        <div className="home-snip">
            <div className="home-snip-head">
                <span>
                    <b>GET</b> /v1/users/42
                </span>
                <span>200</span>
            </div>
            <pre>{'{\n  "id": 42,\n  "name": "Sam Rivera"\n}'}</pre>
        </div>
    );
}

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
                            Free to start
                            {paidPlansEnabled && ` · Pro ${money(pricing.pro.monthly)}/mo`}
                            {` · ${toolTotal} tools`}
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

            <section className="home-wrap home-products" aria-labelledby="products-heading">
                <h2 id="products-heading">Everything your agent can&apos;t do alone.</h2>
                <div className="home-showcase">
                    {showcase.map((item) => (
                        <Link key={item.title} href={item.href} className="home-show">
                            <div className="home-show-art">
                                <img src={item.art} alt="" loading="lazy" />
                                <Snippet kind={item.snippet} />
                                <small>{item.credit}</small>
                            </div>
                            <h3>
                                {item.title}
                                <ArrowRight size={18} aria-hidden="true" />
                            </h3>
                            <p>{item.body}</p>
                        </Link>
                    ))}
                </div>
                <ul className="home-more-list">
                    {more.map(({ title, body, href, Icon }) => (
                        <li key={title}>
                            <Link href={href}>
                                <Icon size={22} aria-hidden="true" />
                                <span>
                                    <strong>{title}</strong>
                                    <small>{body}</small>
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
                <nav className="home-categories" aria-label="Explore tool categories">
                    <span>{toolTotal} tools in all:</span>
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
            </section>

            <section className="home-wrap home-split" aria-labelledby="try-heading">
                <div>
                    <h2 id="try-heading">Try it now.</h2>
                    <p>
                        This is a real webhook inbox, the same one your agent gets. Send it a
                        request.
                    </p>
                    <p className="home-credit">Robert Delaunay, Homage to Blériot, 1914</p>
                </div>
                <div className="home-try-art">
                    <img src="/art/delaunay-bleriot.webp" alt="" loading="lazy" />
                    <LiveWebhook />
                </div>
            </section>

            <section className="home-wrap home-split" aria-labelledby="pricing-heading">
                <div>
                    <h2 id="pricing-heading">Pricing</h2>
                    <p>
                        {paidPlansEnabled
                            ? 'Start free. Upgrade when you need more agents.'
                            : 'Start free. The paid plans below are a preview.'}{' '}
                        <Link href="/pricing/" className="home-link">
                            See every limit
                        </Link>
                    </p>
                    {paidPlansEnabled && pricing.early && <p>{earlyPriceNote}</p>}
                </div>
                <div className="home-plans">
                    {plans.map((plan) => (
                        <div key={plan.name}>
                            <span>
                                {plan.name}
                                {plan.name === 'Pro' &&
                                    paidPlansEnabled &&
                                    pricing.early &&
                                    ' · Early pricing'}
                            </span>
                            <strong>
                                {plan.name === 'Pro' && pricing.early && (
                                    <del>{money(pricing.pro.listMonthly)}</del>
                                )}
                                {plan.price}
                                {plan.name !== 'Free' && <small>/mo</small>}
                            </strong>
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
