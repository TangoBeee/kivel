import { shareImage } from '../lib/seo';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
    ArrowRight,
    Check,
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

// The three main products, each shown on a landscape with a piece of the real product.
const showcase = [
    {
        eyebrow: 'Email',
        title: 'An inbox your agent can read.',
        body: 'Sign up to anything, wait for the email and carry on. No copying codes by hand.',
        points: [
            'Addresses on socketspace.xyz',
            'Codes and links pulled out for you',
            'Replies can wait for your approval',
        ],
        link: 'Read the agent email guide',
        href: '/use-cases/email-for-ai-agents/',
        scene: 'meadow',
        snippet: 'email',
    },
    {
        eyebrow: 'Webhooks',
        title: 'A public URL in one call.',
        body: 'Point Stripe, GitHub or your own app at it and let your agent wait for the next request.',
        points: [
            'Every header and body captured',
            'Signatures checked for Stripe, GitHub, Shopify and Slack',
            'Custom responses and delays',
        ],
        link: 'Try the webhook tester',
        href: '/tools/webhook-inbox/',
        scene: 'lake',
        snippet: 'webhook',
    },
    {
        eyebrow: 'Mock APIs',
        title: 'The API that isn\u2019t built yet.',
        body: 'Mock REST, GraphQL and OAuth endpoints so your agent can build against them today.',
        points: [
            'Routes, responses, delays and errors',
            'Stateful collections with seeded data',
            'Every call recorded for review',
        ],
        link: 'Explore mock APIs',
        href: '/catalog/mock-apis/',
        scene: 'dunes',
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

            <section className="home-sky" aria-labelledby="hero-heading">
                <img
                    className="home-sky-scene"
                    src="/art/hills-1600.webp"
                    srcSet="/art/hills-1600.webp 1600w, /art/hills-1672.webp 1672w"
                    sizes="100vw"
                    alt=""
                    width={1600}
                    height={900}
                    fetchPriority="high"
                />
                <div className="home-sky-copy">
                    <h1 id="hero-heading">Email, webhooks and mock APIs for your coding agent.</h1>
                    <p>Real inboxes, webhook URLs and API endpoints over one MCP connection.</p>
                    <div className="home-sky-actions">
                        <CopyPrompt prompt={setupPrompt} className="sky-cta" />
                        <Link href="/docs/" className="sky-ghost">
                            Read the docs
                        </Link>
                    </div>
                </div>
            </section>

            <section className="home-wrap mid-steps" aria-labelledby="steps-heading">
                <p className="mid-eyebrow">How it works</p>
                <h2 id="steps-heading">Set up in one minute.</h2>
                <ol>
                    <li>
                        <span>1</span>
                        <strong>Paste the prompt</strong>
                        <p>Into Claude Code, Cursor, Codex or any MCP client.</p>
                    </li>
                    <li>
                        <span>2</span>
                        <strong>Approve it</strong>
                        <p>Your agent asks to join your workspace. You say yes in the browser.</p>
                    </li>
                    <li>
                        <span>3</span>
                        <strong>Ask your agent</strong>
                        <p>It finds the right tool for the job by itself.</p>
                    </li>
                </ol>
            </section>

            <section className="home-wrap mid-products" aria-label="Products">
                {showcase.map((item, index) => (
                    <article
                        key={item.title}
                        className={`mid-row ${index % 2 ? 'is-flipped' : ''}`}
                    >
                        <div className="mid-copy">
                            <p className="mid-eyebrow">{item.eyebrow}</p>
                            <h2>{item.title}</h2>
                            <p>{item.body}</p>
                            <ul>
                                {item.points.map((point) => (
                                    <li key={point}>
                                        <Check size={16} weight="bold" aria-hidden="true" />
                                        {point}
                                    </li>
                                ))}
                            </ul>
                            <Link href={item.href} className="mid-link">
                                {item.link}
                                <ArrowRight size={16} aria-hidden="true" />
                            </Link>
                        </div>
                        <div className={`mid-scene is-${item.scene}`}>
                            <Snippet kind={item.snippet} />
                        </div>
                    </article>
                ))}
            </section>

            <section className="home-wrap mid-more" aria-labelledby="more-heading">
                <p className="mid-eyebrow">And everything else</p>
                <h2 id="more-heading">{toolTotal} tools, one connection.</h2>
                <ul>
                    {more.map(({ title, body, href, Icon }) => (
                        <li key={title}>
                            <Link href={href}>
                                <span className="mid-icon">
                                    <Icon size={22} aria-hidden="true" />
                                </span>
                                <strong>{title}</strong>
                                <small>{body}</small>
                            </Link>
                        </li>
                    ))}
                </ul>
                <nav className="mid-categories" aria-label="Explore tool categories">
                    {categories.map((category) => (
                        <Link key={category.id} href={categoryHref(category.id)}>
                            {category.name}
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

            <section className="mid-try" aria-labelledby="try-heading">
                <div className="mid-try-copy">
                    <p className="mid-eyebrow">Try it now</p>
                    <h2 id="try-heading">A real webhook URL, right here.</h2>
                    <p>The same inbox your agent gets. Create one and send it a request.</p>
                </div>
                <LiveWebhook />
            </section>

            <section className="home-wrap mid-pricing" aria-labelledby="pricing-heading">
                <p className="mid-eyebrow">Pricing</p>
                <h2 id="pricing-heading">Start free. Grow when you need to.</h2>
                {paidPlansEnabled && pricing.early && <p className="mid-note">{earlyPriceNote}</p>}
                {!paidPlansEnabled && (
                    <p className="mid-note">The paid plans below are a preview.</p>
                )}
                <div className="mid-plans">
                    {plans.map((plan) => (
                        <div key={plan.name} className={plan.name === 'Pro' ? 'is-featured' : ''}>
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
                <Link href="/pricing/" className="mid-link">
                    See every limit
                    <ArrowRight size={16} aria-hidden="true" />
                </Link>
            </section>

            <section className="home-wrap mid-faq" aria-labelledby="faq-heading">
                <p className="mid-eyebrow">Questions</p>
                <h2 id="faq-heading">Good to know.</h2>
                <div>
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
            <CookieJar />
        </div>
    );
}
