import Link from 'next/link';
import type { Metadata } from 'next';
import { plans } from '@kivel.io/tools/plans';
import { CookieJar } from '../components/home/cookie-jar';
import { Icon } from '../components/icons';
import { CopyButton } from '../components/copy-button';
import { InboxPreview, MockPreview, WebhookPreview } from '../components/landing/product-previews';
import { productLinks } from '../components/landing/product-links';
import { Quickstart } from '../components/landing/quickstart';
import { Reveal } from '../components/landing/reveal';
import { catalog, categories, categoryHref } from '../lib/catalog';
import { previewPricing } from '../lib/pricing';
import { shareImage } from '../lib/seo';
import { siteOrigin } from '../lib/site';
import './landing.css';
import './cookie-jar.css';

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
];

const products = [
    {
        ...productLinks.email,
        heading: 'Inboxes your agents own.',
        copy: 'Send and receive email, extract one-time codes and verification links automatically, and choose a custom address on socketspace.xyz on a paid plan.',
        Preview: InboxPreview,
    },
    {
        ...productLinks.webhooks,
        heading: 'Catch and inspect every webhook.',
        copy: 'Get a unique URL. Watch requests arrive, inspect headers and bodies, then replay a request or forward it to your server.',
        Preview: WebhookPreview,
    },
    {
        ...productLinks.mocks,
        heading: 'Mock any API in seconds.',
        copy: 'Define routes, return JSON, and add delays or errors. Give your agent an endpoint it can call while you build the real integration.',
        Preview: MockPreview,
    },
] as const;

const steps = [
    {
        title: 'Create an API key',
        copy: 'Sign in to your workspace and create a scoped key for your agent.',
    },
    {
        title: 'Connect over MCP',
        copy: 'Run this command in Claude Code or use the MCP config above in your client.',
    },
    {
        title: 'Give your agent a task',
        copy: 'Ask it to create an inbox, open a webhook URL, or set up a mock endpoint.',
    },
];

const connect = `claude mcp add --transport http kivel ${siteOrigin}/mcp --header "Authorization: Bearer $KIVEL_API_KEY"`;
const number = new Intl.NumberFormat('en-US');
const questions = [
    [
        'Can I use Kivel in production?',
        'Yes. Use Kivel in development, CI and production. Choose a plan with the capacity and retention your workflow needs.',
    ],
    [
        'Which agents work with Kivel?',
        'Claude Code, Cursor, Codex, Windsurf, VS Code and other clients that support remote MCP can connect to Kivel.',
    ],
    [
        'Is there an API or SDK?',
        'Yes. Use the HTTP API directly or call it from the TypeScript SDK or CLI. The docs cover authentication, endpoints and examples.',
    ],
    [
        'What does the free plan include?',
        `A Free workspace supports ${number.format(plans.free.agents)} connected agents, ${number.format(plans.free.maxResources)} active resources and ${number.format(plans.free.runsPerDay)} hosted tool runs a day. Browser utilities run locally.`,
    ],
    [
        'Are test payments real money?',
        'No. Test wallets, paywalls and checkouts use test units, no real money.',
    ],
    [
        'Can I cancel anytime?',
        'Yes. You can cancel a paid subscription from the billing portal and keep access through the paid period.',
    ],
] as const;

function StartLinks() {
    return (
        <div className="landing-actions">
            <Link href="/account/#register" className="marketing-button is-primary">
                Get started free
            </Link>
            <Link href="/docs/" className="marketing-button">
                Read the docs
            </Link>
        </div>
    );
}

export default function Home() {
    return (
        <div className="kivel-landing">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
                }}
            />
            <section className="marketing-width landing-hero" aria-labelledby="landing-heading">
                <div className="landing-hero-copy">
                    <h1 id="landing-heading">Email, webhooks and mock APIs for AI agents</h1>
                    <p>
                        Give Claude Code, Cursor and Codex real inboxes, webhook URLs and API
                        endpoints through one MCP connection. Use them in development, CI and
                        production.
                    </p>
                    <StartLinks />
                    <small>Free plan · No credit card</small>
                </div>
                <Quickstart origin={siteOrigin} />
            </section>

            <section className="landing-integrations" aria-label="Works with">
                <div className="marketing-width">
                    <h2>Works with</h2>
                    <ul>
                        {['Claude Code', 'Cursor', 'Codex', 'Windsurf', 'VS Code', 'MCP'].map(
                            (name) => (
                                <li key={name}>{name}</li>
                            ),
                        )}
                    </ul>
                </div>
            </section>

            {products.map(({ name, href, icon, heading, copy, Preview }, index) => (
                <section
                    key={name}
                    className={index % 2 ? 'landing-section is-subtle' : 'landing-section'}
                >
                    <Reveal>
                        <div
                            className={`marketing-width landing-product ${index % 2 ? 'is-reversed' : ''}`}
                        >
                            <div className="landing-product-copy">
                                <span className="landing-product-label">
                                    <Icon name={icon} size={19} />
                                    {name}
                                </span>
                                <h2>{heading}</h2>
                                <p>{copy}</p>
                                <Link className="landing-link" href={href}>
                                    Explore {name}
                                    <Icon name="arrow" size={16} />
                                </Link>
                            </div>
                            <Preview />
                        </div>
                    </Reveal>
                </section>
            ))}

            <section className="landing-section is-subtle" aria-labelledby="landing-tools-heading">
                <div className="marketing-width">
                    <h2 id="landing-tools-heading">And {toolTotal - products.length} more tools</h2>
                    <p className="landing-section-lede">
                        Browse {toolTotal} tools across {categories.length} categories, from DNS
                        checks and test data to authenticators and status pages.
                    </p>
                    <ul className="landing-tool-grid">
                        {categories.map((category) => {
                            const count = catalog.filter(
                                (tool) =>
                                    tool.status === 'available' && tool.categoryId === category.id,
                            ).length;
                            return (
                                <li key={category.id}>
                                    <Link href={categoryHref(category.id)}>
                                        <div className="landing-category-top">
                                            <Icon name={category.icon} size={21} />
                                            <small>
                                                {count} {count === 1 ? 'tool' : 'tools'}
                                            </small>
                                        </div>
                                        <h3>{category.name}</h3>
                                        <p>{category.description}</p>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </section>

            <section className="landing-section" aria-labelledby="landing-steps-heading">
                <div className="marketing-width">
                    <h2 id="landing-steps-heading">How it works</h2>
                    <ol className="landing-steps">
                        {steps.map(({ title, copy }, index) => (
                            <li key={title}>
                                <span className="landing-step-number" aria-hidden="true">
                                    {index + 1}
                                </span>
                                <h3>{title}</h3>
                                <p>{copy}</p>
                                {index === 1 && (
                                    <div className="landing-command">
                                        <code>{connect}</code>
                                        <CopyButton
                                            text={connect}
                                            label="Copy MCP command"
                                            compact
                                        />
                                    </div>
                                )}
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            <section
                className="landing-section is-subtle"
                aria-labelledby="landing-pricing-heading"
            >
                <div className="marketing-width">
                    <h2 id="landing-pricing-heading">Start free. Upgrade when you need more.</h2>
                    <p className="landing-section-lede">
                        Free is available now. Pro and Team show upcoming prices.
                    </p>
                    <div className="landing-prices">
                        {(['free', 'pro', 'team'] as const).map((id) => (
                            <article
                                className={`landing-plan ${id === 'pro' ? 'is-pro' : ''}`}
                                key={id}
                            >
                                <div className="landing-plan-heading">
                                    <h3>{id === 'free' ? 'Free' : plans[id].name}</h3>
                                    {id === 'pro' && (
                                        <span className="landing-chip">Early pricing</span>
                                    )}
                                </div>
                                <p className="landing-price">
                                    {id === 'pro' && <del>${previewPricing.pro.listMonthly}</del>}
                                    <strong>
                                        ${id === 'free' ? 0 : previewPricing[id].monthly}
                                    </strong>
                                    <span>/mo</span>
                                </p>
                                <ul>
                                    <li>{number.format(plans[id].agents)} connected agents</li>
                                    <li>
                                        {number.format(plans[id].maxResources)} active resources
                                    </li>
                                    <li>
                                        {number.format(plans[id].runsPerDay)} hosted tool runs per
                                        day
                                    </li>
                                </ul>
                            </article>
                        ))}
                    </div>
                    <Link className="landing-link" href="/pricing/">
                        Compare plans
                        <Icon name="arrow" size={16} />
                    </Link>
                </div>
            </section>

            <section className="landing-section" aria-labelledby="landing-faq-heading">
                <div className="marketing-width landing-faq">
                    <h2 id="landing-faq-heading">Frequently asked questions</h2>
                    <div>
                        {questions.map(([question, answer]) => (
                            <details key={question}>
                                <summary>
                                    {question}
                                    <Icon name="caret-down" size={18} />
                                </summary>
                                <p>{answer}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            <section className="landing-section landing-cta is-subtle">
                <div className="marketing-width">
                    <h2>Give your agent an inbox in under a minute.</h2>
                    <StartLinks />
                </div>
            </section>
            <CookieJar />
        </div>
    );
}
