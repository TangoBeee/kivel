import { useCases } from './use-cases';
// Plain text views of the site for AI assistants (llmstxt.org) and feed readers, built from the same data as the pages.
import { articles } from './articles';
import type { Article } from './articles';
import { catalog, categories, toolPageHref } from './catalog';
import { comparisons } from './comparisons';
import type { Comparison } from './comparisons';
import { docGroups, docPages } from './docs';
import type { DocPage } from './docs';
import { siteOrigin } from './site';
import { paidPlansEnabled, pricing } from './pricing';

const url = (path: string) => `${siteOrigin}${path}`;
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
const available = catalog.filter((tool) => tool.status === 'available');

const SUMMARY = `Kivel gives coding agents ${available.length} tools across ${categories.length} categories: HTTP and webhooks, email, mock APIs and OAuth, files, monitors, memory, authenticators, scheduled jobs and status pages, test data and media, developer utilities, DNS and network. Use search_tools for the complete catalog, describe_tool for inputs and run_tool for utilities. Resources have dedicated MCP tools and lifecycle routes. Connect over MCP, HTTP, @kivel/sdk@beta, @kivel/cli@beta or an operator-enabled SSH gateway. Browser utilities run locally for free. Workspace email, memory, authenticators, monitors and human questions require an account; use start_login/finish_login for human approval. Use authenticators only for accounts the human authorized. Keep credentials private. Check /api/capabilities and /plans/ for availability, retention and allowances. ${paidPlansEnabled ? 'Paid checkout is enabled.' : 'Paid checkout is disabled during this installation’s free beta.'} Pro is $${pricing.pro.monthly}/month and Team $${pricing.team.monthly}/month when enabled. Setup: ${url('/connect/')}.`;

export function llmsIndex() {
    const lines = [`# Kivel`, '', `> ${SUMMARY}`, ''];
    lines.push('## Documentation', '');
    for (const group of docGroups)
        for (const page of docPages.filter((item) => item.group === group))
            lines.push(
                `- [${page.title}](${url(`/docs/${page.slug}/`)}): ${clean(page.description)}`,
            );
    lines.push(
        ...useCases.map(
            (page) => `- [${page.title}](${url(`/use-cases/${page.slug}/`)}): ${page.description}`,
        ),
    );
    lines.push(
        `- [HTTP API reference](${url('/docs/reference/')}): every endpoint with schemas and examples`,
        `- [Agent skill](${url('/SKILL.md')}): device login, resource waits and human approval`,
        `- [OpenAPI specification](${url('/api/openapi.json')}): machine readable API description`,
        '',
        '## Tools',
        '',
    );
    for (const category of categories) {
        const tools = available.filter((tool) => tool.categoryId === category.id);
        if (!tools.length) continue;
        lines.push(`### ${category.name}`, '');
        for (const tool of tools)
            lines.push(`- [${tool.name}](${url(toolPageHref(tool))}): ${clean(tool.description)}`);
        lines.push('');
    }
    lines.push('## Guides', '');
    for (const article of articles)
        lines.push(
            `- [${article.title}](${url(`/blog/${article.slug}/`)}): ${clean(article.description)}`,
        );
    lines.push('', '## Comparisons', '');
    for (const item of comparisons)
        lines.push(
            `- [Kivel vs ${item.name}](${url(`/compare/${item.slug}/`)}): ${clean(item.summary)}`,
        );
    lines.push(
        '',
        '## Optional',
        '',
        `- [Plans and allowances](${url('/plans/')}): free and paid limits`,
        `- [Privacy and limits](${url('/privacy/')}): what is stored, for how long, and why`,
        `- [Terms of use](${url('/terms/')})`,
        `- [Full text for language models](${url('/llms-full.txt')}): all documentation, guides, and comparisons`,
        '',
    );
    return lines.join('\n');
}

function docMarkdown(page: DocPage) {
    const out = [
        `## ${page.title}`,
        '',
        `Source: ${url(`/docs/${page.slug}/`)}`,
        '',
        clean(page.description),
        '',
    ];
    for (const section of page.sections) {
        out.push(
            `### ${section.title}`,
            '',
            ...section.paragraphs.map(clean).flatMap((p) => [p, '']),
        );
        if (section.list) out.push(...section.list.map((item) => `- ${clean(item)}`), '');
        if (section.table)
            out.push(
                `| ${section.table.headers.join(' | ')} |`,
                `| ${section.table.headers.map(() => '---').join(' | ')} |`,
                ...section.table.rows.map(
                    (row) => `| ${row.map((cell) => cell.replaceAll('|', '\\|')).join(' | ')} |`,
                ),
                '',
            );
        if (section.code) out.push('```', section.code.value, '```', '');
        if (section.note) out.push(`Note: ${clean(section.note)}`, '');
    }
    for (const faq of page.faqs ?? [])
        out.push(`Q: ${faq.question}`, `A: ${clean(faq.answer)}`, '');
    return out.join('\n');
}

function articleMarkdown(article: Article) {
    const out = [
        `## ${article.title}`,
        '',
        `Source: ${url(`/blog/${article.slug}/`)}`,
        '',
        clean(article.description),
        '',
    ];
    for (const section of article.sections) {
        out.push(
            `### ${section.title}`,
            '',
            ...section.paragraphs.map(clean).flatMap((p) => [p, '']),
        );
        if (section.steps)
            out.push(...section.steps.map((step, i) => `${i + 1}. ${clean(step)}`), '');
        if (section.code) out.push('```', section.code.value, '```', '');
    }
    for (const faq of article.faqs ?? [])
        out.push(`Q: ${faq.question}`, `A: ${clean(faq.answer)}`, '');
    return out.join('\n');
}

function comparisonMarkdown(item: Comparison) {
    return [
        `## Kivel vs ${item.name}`,
        '',
        `Source: ${url(`/compare/${item.slug}/`)} (reviewed ${item.reviewedAt})`,
        '',
        clean(item.summary),
        '',
        `Choose Kivel: ${clean(item.kivelFit)}`,
        '',
        `Choose ${item.name}: ${clean(item.otherFit)}`,
        '',
        ...item.rows.map(
            (row) => `- ${row.topic}: Kivel: ${clean(row.kivel)} ${item.name}: ${clean(row.other)}`,
        ),
        '',
        `Limitations: ${clean(item.limitations)}`,
        '',
        ...item.faqs.flatMap((faq) => [`Q: ${faq.question}`, `A: ${clean(faq.answer)}`, '']),
    ].join('\n');
}

export function llmsFull() {
    return [
        '# Kivel',
        '',
        `> ${SUMMARY}`,
        '',
        '# Agent use cases',
        ...useCases.map((page) =>
            docMarkdown({
                ...page,
                navTitle: page.title,
                group: 'Get started',
                updatedAt: '2026-10-30',
            }).replace(`/docs/${page.slug}/`, `/use-cases/${page.slug}/`),
        ),
        '# Documentation',
        '',
        ...docPages.map(docMarkdown),
        '# Guides',
        '',
        ...articles.map(articleMarkdown),
        '# Comparisons',
        '',
        ...comparisons.map(comparisonMarkdown),
    ].join('\n');
}

const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function blogFeed() {
    const sorted = [...articles].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const items = sorted
        .map(
            (article) => `    <item>
      <title>${escape(article.title)}</title>
      <link>${url(`/blog/${article.slug}/`)}</link>
      <guid isPermaLink="true">${url(`/blog/${article.slug}/`)}</guid>
      <category>${escape(article.category)}</category>
      <pubDate>${new Date(`${article.publishedAt}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escape(article.description)}</description>
    </item>`,
        )
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Kivel guides</title>
    <link>${url('/blog/')}</link>
    <description>Practical guides for testing webhooks, mocking APIs, sharing files, and everyday developer tasks.</description>
    <language>en</language>
    <atom:link href="${url('/blog/rss.xml')}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}
