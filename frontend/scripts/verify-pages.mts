import { useCases } from '../lib/use-cases';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { catalog, categories, toolPageHref } from '@kivel.io/tools/catalog';
import { articles } from '../lib/articles';
import { comparisons } from '../lib/comparisons';
import { docPages } from '../lib/docs';
import { toolExample } from '../lib/tool-guides';
import { siteOrigin } from '../lib/site';
import { earlyPriceNote, money, paidPlansEnabled, pricing } from '../lib/pricing';
const providerSource = await readFile('components/toolbox-provider.tsx', 'utf8');
const providerBody = /<Context\.Provider\b[^>]*>([\s\S]*?)<\/Context\.Provider>/.exec(
    providerSource,
)?.[1];
assert.ok(providerBody, 'Toolbox context wraps the application');
assert.ok(providerBody.includes('{children}'), 'Application shares the toolbox context');
assert.equal(
    [...providerBody.matchAll(/<Dialog\.Root\b/g)].length,
    2,
    'Search and preview dialogs must share the application context',
);

const escape = (value: string) =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
const sitemap = await readFile('out/sitemap.xml', 'utf8');
for (const tool of catalog) {
    const path = toolPageHref(tool);
    const html = await readFile(join('out', path, 'index.html'), 'utf8');
    assert.ok(
        html.includes(`<link rel="canonical" href="${siteOrigin}${path}"`),
        `${path}: canonical`,
    );
    assert.ok(html.includes('<h1'), `${path}: primary heading`);
    assert.ok(html.includes(escape(tool.name)), `${path}: tool name`);
    assert.ok(html.includes('name="description"'), `${path}: description`);
    assert.ok(
        html.includes('Limits &amp; privacy') || html.includes('Availability'),
        `${path}: concise tool guide`,
    );
    if (tool.status === 'available') {
        assert.ok(toolExample(tool.id), `${path}: useful example`);
        assert.ok(sitemap.includes(`${siteOrigin}${path}`), `${path}: sitemap`);
        assert.ok(!html.includes('content="noindex, follow"'), `${path}: indexable`);
    } else {
        assert.ok(html.includes('content="noindex, follow"'), `${path}: planned tools are noindex`);
        assert.ok(
            !sitemap.includes(`${siteOrigin}${path}`),
            `${path}: planned tools excluded from sitemap`,
        );
    }
    for (const match of html.matchAll(/<a\b[^>]*href="([^"#]+)"/g)) {
        if (!match[1]!.startsWith('/') || /^\/(api|hooks|files|mock|mcp)(\/|$)/.test(match[1]!))
            continue;
        const pathname = new URL(match[1]!.replaceAll('&amp;', '&'), siteOrigin).pathname;
        const target = join('out', pathname, pathname.endsWith('/') ? 'index.html' : '');
        await assert.doesNotReject(stat(target), `${path}: broken internal link ${pathname}`);
    }
}
for (const category of categories) {
    const available = catalog.some(
        (tool) => tool.categoryId === category.id && tool.status === 'available',
    );
    assert.equal(
        sitemap.includes(`${siteOrigin}/catalog/${category.id}/</loc>`),
        available,
        `${category.id}: sitemap requires available tools`,
    );
    if (!available)
        assert.match(
            await readFile(join('out', 'catalog', category.id, 'index.html'), 'utf8'),
            /<meta name="robots" content="noindex/,
            `${category.id}: planned-only category noindex`,
        );
}
console.log(
    `Verified ${catalog.length} tool pages: canonicals, descriptions, headings, guides, indexability, sitemap, and internal links.`,
);

const contentPaths = [
    '/',
    '/use-cases/',
    ...useCases.map((page) => `/use-cases/${page.slug}/`),
    '/catalog/',
    ...categories
        .filter((category) =>
            catalog.some((tool) => tool.categoryId === category.id && tool.status === 'available'),
        )
        .map((category) => `/catalog/${category.id}/`),
    '/docs/',
    '/docs/reference/',
    ...docPages.map((page) => `/docs/${page.slug}/`),
    '/pricing/',
    '/webhooks/',
    '/integrations/',
    '/connect/',
    '/privacy/',
    '/refunds/',
    '/contact/',
    '/beta/',
    '/terms/',
    '/blog/',
    '/compare/',
    ...articles.map((article) => `/blog/${article.slug}/`),
    ...comparisons.map((item) => `/compare/${item.slug}/`),
];
const titles = new Set<string>();
const descriptions = new Set<string>();
for (const path of contentPaths) {
    const html = await readFile(join('out', path, 'index.html'), 'utf8');
    assert.equal([...html.matchAll(/<h1[\s>]/g)].length, 1, `${path}: one primary heading`);
    assert.ok(
        html.includes(`<link rel="canonical" href="${siteOrigin}${path}"`),
        `${path}: canonical`,
    );
    const title = /<title>(.*?)<\/title>/.exec(html)?.[1];
    const description = /<meta name="description" content="([^"]+)"/.exec(html)?.[1];
    assert.ok(title && !titles.has(title), `${path}: unique title`);
    assert.ok(description && !descriptions.has(description), `${path}: unique description`);
    titles.add(title!);
    descriptions.add(description!);
    assert.ok(sitemap.includes(`${siteOrigin}${path}</loc>`), `${path}: in sitemap`);
    assert.ok(!html.includes('content="noindex'), `${path}: indexable`);
    assert.ok(html.includes('property="og:description"'), `${path}: share metadata`);
    for (const script of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs))
        JSON.parse(script[1]!);
    for (const match of html.matchAll(/<a\b[^>]*href="([^"#]+)"/g)) {
        const href = match[1]!.replaceAll('&amp;', '&');
        if (!href.startsWith('/') || /^\/(api|hooks|files|mock|mcp)(\/|$)/.test(href)) continue;
        const url = new URL(href, siteOrigin);
        const target = join('out', url.pathname, url.pathname.endsWith('/') ? 'index.html' : '');
        await assert.doesNotReject(stat(target), `${path}: broken link ${href}`);
        if (url.hash) {
            const destination = await readFile(target, 'utf8');
            assert.ok(
                destination.includes(`id="${url.hash.slice(1)}"`),
                `${path}: broken anchor ${href}`,
            );
        }
    }
}
console.log(
    `Verified ${contentPaths.length} public content pages: unique metadata, semantic headings, structured data, canonicals, sitemap, and links.`,
);

const llms = await readFile('out/llms.txt', 'utf8');
const llmsFull = await readFile('out/llms-full.txt', 'utf8');
const feed = await readFile('out/blog/rss.xml', 'utf8');
assert.ok(llms.startsWith('# Kivel'), 'llms.txt: title');
for (const page of docPages)
    assert.ok(llms.includes(`/docs/${page.slug}/`), `llms.txt: ${page.slug}`);
for (const article of articles) {
    assert.ok(llms.includes(`/blog/${article.slug}/`), `llms.txt: ${article.slug}`);
    assert.ok(feed.includes(`/blog/${article.slug}/`), `rss: ${article.slug}`);
}
for (const item of comparisons)
    assert.ok(llmsFull.includes(`Kivel vs ${item.name}`), `llms-full: ${item.slug}`);
console.log(`Verified llms.txt, llms-full.txt, and the RSS feed (${articles.length} guides).`);

const plansHtml = await readFile('out/pricing/index.html', 'utf8');
assert.equal(
    [...plansHtml.matchAll(/<span class="content-tag">Start here<\/span>/g)].length,
    1,
    'Only the Free card shows the introductory badge',
);
assert.ok(
    !plansHtml.includes('cycle-yearly'),
    'Annual billing must not be advertised without checkout support',
);
if (!paidPlansEnabled) {
    assert.ok(plansHtml.includes('Not available during beta'));
    assert.ok(!plansHtml.includes('Upgrade to Pro'));
}
const offers = [
    ...plansHtml.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs),
].flatMap((match) => JSON.parse(match[1]!).offers ?? []);
assert.deepEqual(
    offers.map((offer: { price: number }) => offer.price),
    paidPlansEnabled ? [0, pricing.pro.monthly, pricing.team.monthly] : [0],
    'Only enabled prices appear in structured offers',
);
assert.equal(plansHtml.includes(earlyPriceNote), paidPlansEnabled && pricing.early);
for (const plan of ['pro', 'team'] as const)
    assert.ok(plansHtml.includes(`<strong>${money(pricing[plan].monthly)}</strong>`));
for (const path of ['contact', 'refunds', 'terms', 'privacy', 'beta']) {
    const html = await readFile(`out/${path}/index.html`, 'utf8');
    assert.ok(html.includes('mailto:support@kivel.io'), `${path}: public support route`);
}
console.log('Verified beta checkout messaging and public contact/refund policies.');

const robotsText = await readFile('out/robots.txt', 'utf8');
assert.ok(
    robotsText.includes('Disallow: /oauth/'),
    'OAuth test endpoints are excluded from crawling',
);
for (const path of ['/account/', '/link/', '/approve/', '/share/', '/tools/']) {
    const html = await readFile(join('out', path, 'index.html'), 'utf8');
    assert.match(
        html,
        /<meta name="robots" content="noindex/,
        `${path}: private/legacy shell noindex`,
    );
    assert.ok(!sitemap.includes(`${siteOrigin}${path}</loc>`), `${path}: excluded from sitemap`);
    assert.ok(!robotsText.includes(`Disallow: ${path}`), `${path}: crawlers can read noindex`);
}
for (const page of useCases) {
    const html = await readFile(join('out', 'use-cases', page.slug, 'index.html'), 'utf8');
    for (const section of page.sections)
        assert.ok(
            html.includes(`id="${section.id}"`),
            `${page.slug}: server-rendered workflow content`,
        );
    assert.ok(html.includes('property="og:image"'), `${page.slug}: social image`);
}
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]!);
assert.equal(new Set(urls).size, urls.length, 'Sitemap URLs must be unique');
console.log(
    'Verified agent workflow content, category canonicals, private-page noindex and unique sitemap URLs.',
);

const availableCount = catalog.filter((tool) => tool.status === 'available').length;
for (const path of ['/', '/connect/', '/pricing/', '/docs/']) {
    const html = await readFile(join('out', path, 'index.html'), 'utf8');
    const text = html.replace(/<[^>]*>/g, '').replaceAll('&amp;', '&');
    assert.ok(text.includes(`${availableCount} tools`), `${path}: catalog-derived tool count`);
    for (const term of ['authenticators', 'status pages', 'test data', 'DNS'])
        assert.ok(text.toLowerCase().includes(term.toLowerCase()), `${path}: ${term}`);
}
const home = await readFile('out/index.html', 'utf8');
assert.ok(home.includes('/art/klint-youth.webp'), 'Home preserves the Gallery hero');
assert.ok(home.includes('href="/pricing/"'), 'Home links to the current pricing URL');
assert.ok(home.includes('mailto:support@kivel.io'), 'Home preserves the support contact');
for (const category of categories)
    assert.ok(home.includes(`/catalog/${category.id}/`), `Home links to ${category.name}`);
console.log('Verified full product coverage and catalog-derived counts.');
