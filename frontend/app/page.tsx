import { shareImage } from '../lib/seo';
import type { Metadata } from 'next';
import { CookieJar } from '../components/home/cookie-jar';
import { CopyPrompt } from '../components/home/copy-prompt';
import { DashboardMock } from '../components/landing/dashboard-mock';
import { FeatureCards } from '../components/landing/feature-cards';
import { FeatureSplits } from '../components/landing/feature-splits';
import { LandingHero } from '../components/landing/landing-hero';
import { PromptCards } from '../components/landing/prompt-cards';
import { Reveal } from '../components/landing/reveal';
import { SmoothScroll } from '../components/landing/smooth-scroll';
import { ToolSlider } from '../components/landing/tool-slider';
import { catalog, categories, categoryHref } from '../lib/catalog';
import { setupPrompt } from '../lib/setup-prompt';
import { siteOrigin } from '../lib/site';
import './home.css';
import './landing.css';

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

const sliderItems = categories
    .map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        count: catalog.filter(
            (tool) => tool.status === 'available' && tool.categoryId === category.id,
        ).length,
        href: categoryHref(category.id),
    }))
    .filter((item) => item.count > 0);

export default function Home() {
    return (
        <div className="kv-landing">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
                }}
            />
            <SmoothScroll />
            <LandingHero toolTotal={toolTotal} />
            <FeatureCards />
            <FeatureSplits />
            <ToolSlider items={sliderItems} />
            <PromptCards />

            <section className="kv-container kv-cta" aria-labelledby="cta-heading">
                <div className="kv-cta-card">
                    <Reveal className="kv-cta-content">
                        <h2 id="cta-heading" className="kv-cta-title">
                            Stop testing by hand.
                            <br />
                            Start shipping.
                        </h2>
                        <div className="kv-cta-form">
                            <code className="kv-field">{`${siteOrigin}/mcp`}</code>
                            <CopyPrompt prompt={setupPrompt} className="kv-button is-outline" />
                        </div>
                    </Reveal>
                    <div className="kv-cta-dash">
                        <div className="kv-blue-blur is-cta" />
                        <div className="kv-hero-dash">
                            <DashboardMock />
                        </div>
                    </div>
                </div>
            </section>
            <CookieJar />
        </div>
    );
}
