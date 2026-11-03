import { XMLValidator } from 'fast-xml-parser';
import { Parser } from 'htmlparser2';
import { load } from 'cheerio';
import TurndownService from 'turndown';
import { ToolExecutionError } from './node-runner.js';
export type NetworkParseId = 'parse-web-page' | 'parse-sitemap' | 'parse-link-preview';
function boundedDocument(input: string, xml = false) {
    const complex = () =>
        new ToolExecutionError(
            'Document is too complex. Use at most 5,000 elements and 64 nesting levels.',
        );
    if (Buffer.byteLength(input) > 262144)
        throw new ToolExecutionError('Document exceeds 256 KiB.');
    let count = 0,
        depth = 0;
    const parser = new Parser(
        {
            onopentag() {
                if (++count > 5000 || ++depth > 64) throw complex();
            },
            onclosetag() {
                depth = Math.max(0, depth - 1);
            },
        },
        { xmlMode: xml },
    );
    parser.end(input);
    const $ = load(input, xml ? { xml: true } : undefined);
    const pending: { node: any; depth: number }[] = [{ node: $.root().get(0), depth: 0 }];
    count = 0;
    while (pending.length) {
        const { node, depth } = pending.pop()!;
        if (depth > 64) throw complex();
        if (['tag', 'script', 'style'].includes(node.type) && ++count > 5000) throw complex();
        for (const child of node.children ?? []) pending.push({ node: child, depth: depth + 1 });
    }
    return $;
}
export function readablePage(html: string, url: string) {
    const $ = boundedDocument(html);
    const title = $('title').first().text().trim();
    const description = $('meta[name="description"]').attr('content') ?? '';
    const canonical = $('link[rel="canonical"]').attr('href');
    const safe = (value: string) => {
        try {
            const resolved = new URL(value, url);
            return ['http:', 'https:'].includes(resolved.protocol) &&
                !resolved.username &&
                !resolved.password
                ? resolved.href
                : null;
        } catch {
            return null;
        }
    };
    $(
        'meta, base, link, script, style, noscript, nav, footer, header, aside, form, input, button, iframe, object, embed, svg, canvas, template',
    ).remove();
    $('*').each((_, element) => {
        if (!('attribs' in element)) return;
        for (const name of Object.keys(element.attribs))
            if (/^on/i.test(name) || name.toLowerCase() === 'style') $(element).removeAttr(name);
    });
    $('a').each((_, element) => {
        const link = $(element),
            href = safe(link.attr('href') ?? '');
        if (href) link.attr('href', href);
        else link.removeAttr('href');
    });
    $('img').remove();
    const main = $('main').first().length
        ? $('main').first()
        : $('article').first().length
          ? $('article').first()
          : $('body');
    const headings = main
        .find('h1,h2,h3,h4,h5,h6')
        .slice(0, 100)
        .map((_, element) => ({
            level: Number(element.tagName.slice(1)),
            text: $(element).text().trim(),
        }))
        .get();
    const links = [
        ...new Map(
            main
                .find('a[href]')
                .map((_, element) => ({
                    text: $(element).text().trim(),
                    url: $(element).attr('href')!,
                }))
                .get()
                .map((link) => [link.url, link]),
        ).values(),
    ].slice(0, 200);
    const converter = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
    });
    return {
        url,
        title,
        description,
        canonical: canonical ? safe(canonical) : null,
        html: main.html() ?? '',
        markdown: converter.turndown(main.html() ?? ''),
        text: main
            .clone()
            .find('p,li,h1,h2,h3,h4,h5,h6,pre,blockquote,br')
            .append('\n')
            .end()
            .text()
            .replace(/[ \t]+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim(),
        headings,
        links,
        notice: 'Static HTML extraction. Scripts and linked content were not fetched.',
    };
}
export function sitemapContents(xml: string, url: string) {
    if (/\.xml\.gz$/i.test(new URL(url).pathname) || xml.startsWith('\u001f\u008b'))
        throw new ToolExecutionError('Compressed sitemaps are not supported.');
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
        throw new ToolExecutionError('Sitemaps with XML DTDs or entities are unsupported.');
    const $ = boundedDocument(xml, true);
    if (XMLValidator.validate(xml) !== true)
        throw new ToolExecutionError('Sitemap is not well formed XML.');
    const kind = $('sitemapindex').length ? 'index' : $('urlset').length ? 'urlset' : 'unknown';
    const nodes = kind === 'index' ? $('sitemapindex > sitemap') : $('urlset > url');
    const problems: string[] = [];
    if (kind === 'unknown') problems.push('Expected a urlset or sitemapindex root.');
    const entries = nodes
        .slice(0, 1000)
        .map((_, element) => {
            const item = $(element);
            return {
                url: item.children('loc').text().trim(),
                lastModified: item.children('lastmod').text().trim() || null,
            };
        })
        .get();
    const bad = entries.filter((entry) => {
        try {
            return !/^https?:$/.test(new URL(entry.url).protocol);
        } catch {
            return true;
        }
    });
    if (bad.length)
        problems.push(`${bad.length} listed locations are not absolute HTTP or HTTPS URLs.`);
    const crossOrigin = entries.filter((entry) => {
        try {
            return new URL(entry.url).origin !== new URL(url).origin;
        } catch {
            return false;
        }
    }).length;
    if (crossOrigin)
        problems.push(
            `${crossOrigin} locations use a different origin. Review cross site sitemap ownership.`,
        );
    return {
        url,
        kind,
        totalEntries: nodes.length,
        truncated: nodes.length > 1000,
        entries,
        problems,
    };
}

export function linkPreview(html: string, url: string) {
    const $ = boundedDocument(html),
        metadata: Record<string, string> = {};
    $('meta')
        .slice(0, 200)
        .each((_index, element) => {
            const key = $(element).attr('property') ?? $(element).attr('name'),
                value = $(element).attr('content');
            if (
                key &&
                value &&
                (key.startsWith('og:') || key.startsWith('twitter:') || key === 'description')
            )
                metadata[key.slice(0, 100)] = value.slice(0, 4096);
        });
    const canonical = $('link[rel="canonical"]').first().attr('href');
    let canonicalUrl: string | null = null;
    if (canonical)
        try {
            canonicalUrl = new URL(canonical, url).href;
        } catch {}
    return {
        title: $('title').first().text().trim().slice(0, 500),
        description: metadata.description ?? null,
        canonical: canonicalUrl,
        metadata,
    };
}
export function runNetworkParse(id: NetworkParseId, input: string, url: string) {
    switch (id) {
        case 'parse-web-page':
            return readablePage(input, url);
        case 'parse-sitemap':
            return sitemapContents(input, url);
        case 'parse-link-preview':
            return linkPreview(input, url);
    }
}
