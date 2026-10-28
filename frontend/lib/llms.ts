// Plain text views of the site for AI assistants (llmstxt.org) and feed readers, built from the same data as the pages.
import { articles } from './articles';
import type { Article } from './articles';
import { catalog, categories, toolPageHref } from './catalog';
import { comparisons } from './comparisons';
import type { Comparison } from './comparisons';
import { docGroups, docPages } from './docs';
import type { DocPage } from './docs';
import { siteOrigin } from './site';

const url = (path: string) => `${siteOrigin}${path}`;
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
const available = catalog.filter((tool) => tool.status === 'available');

const SUMMARY =
    'socket.help gives AI agents and developers everything they need from the internet, over one MCP connection: private webhook inboxes (custom responses, wait_for_webhook, forwarding on Pro), receive-only email inboxes with extracted codes and links (wait_for_email), mock REST APIs (fake data, random failures, call logs, proxy and record on Pro), mock MCP servers, temporary file sharing, and 130+ browser utilities. Tools work without an account; a free account adds a workspace, 7-day retention and scoped API keys. Pro is $2 a month. Every tool is available from the browser, an HTTP API, a CLI, a TypeScript SDK, an SSH gateway, and MCP (setup: https://socket.help/connect/). There are no ads.';

export function llmsIndex() {
    const lines = [`# socket.help`, '', `> ${SUMMARY}`, ''];
    lines.push('## Documentation', '');
    for (const group of docGroups)
        for (const page of docPages.filter((item) => item.group === group))
            lines.push(
                `- [${page.title}](${url(`/docs/${page.slug}/`)}): ${clean(page.description)}`,
            );
    lines.push(
        `- [HTTP API reference](${url('/docs/reference/')}): every endpoint with schemas and examples`,
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
            `- [socket.help vs ${item.name}](${url(`/compare/${item.slug}/`)}): ${clean(item.summary)}`,
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
                ...section.table.rows.map((row) => `| ${row.join(' | ')} |`),
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
        `## socket.help vs ${item.name}`,
        '',
        `Source: ${url(`/compare/${item.slug}/`)} (reviewed ${item.reviewedAt})`,
        '',
        clean(item.summary),
        '',
        `Choose socket.help: ${clean(item.socketFit)}`,
        '',
        `Choose ${item.name}: ${clean(item.otherFit)}`,
        '',
        ...item.rows.map(
            (row) =>
                `- ${row.topic}: socket.help: ${clean(row.socket)} ${item.name}: ${clean(row.other)}`,
        ),
        '',
        `Limitations: ${clean(item.limitations)}`,
        '',
        ...item.faqs.flatMap((faq) => [`Q: ${faq.question}`, `A: ${clean(faq.answer)}`, '']),
    ].join('\n');
}

export function llmsFull() {
    return [
        '# socket.help',
        '',
        `> ${SUMMARY}`,
        '',
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
    <title>socket.help guides</title>
    <link>${url('/blog/')}</link>
    <description>Practical guides for testing webhooks, mocking APIs, sharing files, and everyday developer tasks.</description>
    <language>en</language>
    <atom:link href="${url('/blog/rss.xml')}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}
