import { XMLValidator } from 'fast-xml-parser';
import { load } from 'cheerio';
import TurndownService from 'turndown';
import robotsParser from 'robots-parser';
import { followPublic, publicUrl } from './public-network.js';
import { ToolExecutionError } from '@socket-help/tools/node';

export function readablePage(html: string, url: string) {
    const $ = load(html);
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
        'script, style, noscript, nav, footer, header, aside, form, input, button, iframe, object, embed, svg, canvas, template',
    ).remove();
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
export async function pageToMarkdown(input: string, signal: AbortSignal) {
    const response = await followPublic(input, signal, { body: true });
    if (response.status < 200 || response.status >= 300 || response.truncated)
        throw new ToolExecutionError('The page must return successful HTML within 256 KiB.');
    if (!/text\/html|application\/xhtml\+xml/i.test(String(response.headers['content-type'] ?? '')))
        throw new ToolExecutionError('The URL did not return an HTML page.');
    return readablePage(response.body.toString('utf8'), response.url);
}
type MailRecord = { name: string; type: string; values: string[]; status: number };
export function emailAuthenticationReport(domain: string, records: MailRecord[], selector: string) {
    records = records.map((record) =>
        record.type === 'SPF'
            ? { ...record, values: record.values.filter((value) => /^v=spf1(?:\s|$)/i.test(value)) }
            : record,
    );
    const findings: { check: string; status: string; message: string }[] = [];
    const values = (type: string) => records.find((record) => record.type === type)?.values ?? [];
    const spf = values('SPF').filter((value) => /^v=spf1(?:\s|$)/i.test(value));
    if (!spf.length)
        findings.push({ check: 'SPF', status: 'problem', message: 'No SPF record was found.' });
    else if (spf.length > 1)
        findings.push({
            check: 'SPF',
            status: 'problem',
            message: 'Multiple SPF records cause SPF evaluation errors. Publish one record.',
        });
    else {
        findings.push({
            check: 'SPF',
            status: 'info',
            message: 'One SPF record is published. Includes are not evaluated recursively.',
        });
        const mechanisms = spf[0]!.split(/\s+/);
        if (mechanisms.some((value) => /^\+?all$/i.test(value)))
            findings.push({
                check: 'SPF',
                status: 'problem',
                message: '+all or unqualified all authorizes any sender. Review this policy.',
            });
        if (
            mechanisms.filter((value) =>
                /^[+~?-]?(?:include:|redirect=|(?:a|mx|ptr)(?::|\/|$)|exists:)/i.test(value),
            ).length > 10
        )
            findings.push({
                check: 'SPF',
                status: 'problem',
                message:
                    'More than ten DNS lookup mechanisms are visible before expanding includes.',
            });
    }
    const dmarc = values('DMARC').filter((value) => /^v=DMARC1(?:;|$)/i.test(value));
    if (!dmarc.length)
        findings.push({
            check: 'DMARC',
            status: 'problem',
            message:
                'No DMARC policy was found at this exact domain. Parent policies are not checked.',
        });
    else if (dmarc.length > 1)
        findings.push({
            check: 'DMARC',
            status: 'problem',
            message: 'Multiple DMARC records are invalid.',
        });
    else {
        const policy = /(?:^|;)\s*p\s*=\s*(none|quarantine|reject)\s*(?:;|$)/i
            .exec(dmarc[0]!)?.[1]
            ?.toLowerCase();
        findings.push({
            check: 'DMARC',
            status: !policy ? 'problem' : policy === 'none' ? 'warning' : 'info',
            message: !policy
                ? 'DMARC needs a valid p=none, quarantine or reject policy.'
                : policy === 'none'
                  ? 'p=none monitors mail without requesting enforcement.'
                  : `DMARC requests ${policy}.`,
        });
    }
    if (!selector)
        findings.push({
            check: 'DKIM',
            status: 'info',
            message: 'Supply your mail provider’s DKIM selector to check its record.',
        });
    else {
        const dkim = values('DKIM').filter((value) => /(?:^|;)\s*p\s*=/i.test(value));
        const key =
            dkim.length === 1
                ? /(?:^|;)\s*p\s*=\s*([^;]*)/i.exec(dkim[0]!)?.[1]?.trim()
                : undefined;
        const usable = !!key && /^[A-Za-z0-9+/]+={0,2}$/.test(key.replace(/\s/g, ''));
        findings.push({
            check: 'DKIM',
            status: usable ? 'info' : 'problem',
            message: usable
                ? 'A DKIM public key is published. Message signatures were not verified.'
                : dkim.length > 1
                  ? 'Multiple DKIM key records were found for this selector.'
                  : 'No usable DKIM public key was found. An empty p= value revokes a key.',
        });
    }
    const mx = values('MX');
    findings.push({
        check: 'MX',
        status: !mx.length || mx.some((value) => /^0\s+\.$/.test(value)) ? 'warning' : 'info',
        message: !mx.length
            ? 'No MX record was found; SMTP may fall back to address records.'
            : mx.some((value) => /^0\s+\.$/.test(value))
              ? 'A null MX record explicitly declines incoming email.'
              : `${mx.length} mail exchange record${mx.length === 1 ? '' : 's'} published.`,
    });
    findings.push({
        check: 'BIMI',
        status: 'info',
        message: values('BIMI').some((value) => /^v=BIMI1;/i.test(value))
            ? 'A BIMI record is published. Logo and certificate validity were not checked.'
            : 'No BIMI record found. BIMI is optional.',
    });
    for (const record of records)
        if (![0, 3].includes(record.status))
            findings.push({
                check: record.type,
                status: 'warning',
                message: `The DNS query returned resolver status ${record.status}; this is not proof the record is absent.`,
            });
    return {
        domain,
        selector: selector || null,
        records,
        findings,
        notice: 'Published DNS checks only, not a deliverability or message authentication test.',
    };
}
export function sitemapContents(xml: string, url: string) {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
        throw new ToolExecutionError('Sitemaps with XML DTDs or entities are unsupported.');
    if (XMLValidator.validate(xml) !== true)
        throw new ToolExecutionError('Sitemap is not well formed XML.');
    const $ = load(xml, { xml: true });
    let tooDeep = false;
    const elements = $('*');
    if (elements.length > 20000) throw new ToolExecutionError('Sitemap has too many XML elements.');
    elements.each((_, element) => {
        let depth = 0,
            node: any = element;
        while (node.parent && depth <= 64) {
            depth++;
            node = node.parent;
        }
        if (depth > 64) tooDeep = true;
    });
    if (tooDeep) throw new ToolExecutionError('Sitemap exceeds 64 nesting levels.');
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
export async function checkRobots(input: string, userAgent: string, signal: AbortSignal) {
    if (!userAgent.trim() || userAgent.length > 128 || /[\r\n]/.test(userAgent))
        throw new ToolExecutionError('Use a crawler name of 1 to 128 characters.');
    const target = publicUrl(input),
        robotsUrl = new URL('/robots.txt', target).href;
    const response = await followPublic(robotsUrl, signal, { body: true });
    if (response.truncated) throw new ToolExecutionError('robots.txt exceeds 256 KiB.');
    const text =
        response.status >= 200 && response.status < 300 ? response.body.toString('utf8') : '';
    const robots = (
        robotsParser as unknown as (
            url: string,
            text: string,
        ) => {
            isAllowed(url: string, agent: string): boolean | undefined;
            getMatchingLineNumber(url: string, agent: string): number;
            getSitemaps(): string[];
            getCrawlDelay(agent: string): number | undefined;
        }
    )(robotsUrl, text);
    const unavailable = response.status >= 500 || response.status === 429;
    const allowed = unavailable ? null : robots.isAllowed(target.href, userAgent) !== false;
    const matchingLine = robots.getMatchingLineNumber(target.href, userAgent);
    const declared = robots.getSitemaps();
    const candidates = [
        ...new Set(declared.length ? declared : [new URL('/sitemap.xml', target).href]),
    ].slice(0, 2);
    const sitemaps = [];
    for (const candidate of candidates) {
        try {
            const result = await followPublic(candidate, signal, { body: true });
            if (result.status < 200 || result.status >= 300) {
                sitemaps.push({
                    url: candidate,
                    status: result.status,
                    problems: ['Sitemap did not return a successful response.'],
                    entries: [],
                });
                continue;
            }
            if (result.truncated) throw new ToolExecutionError('Sitemap exceeds 256 KiB.');
            sitemaps.push({
                ...sitemapContents(result.body.toString('utf8'), result.url),
                status: result.status,
            });
        } catch (error) {
            if (signal.aborted) throw error;
            sitemaps.push({
                url: candidate,
                status: null,
                entries: [],
                problems: [
                    error instanceof ToolExecutionError
                        ? error.message
                        : 'Unable to read this public sitemap.',
                ],
            });
        }
    }
    return {
        url: target.href,
        userAgent,
        robotsUrl,
        robotsStatus: response.status,
        allowed,
        matchingLine: matchingLine > 0 ? matchingLine : null,
        matchingRule: matchingLine > 0 ? text.split(/\r?\n/)[matchingLine - 1] : null,
        crawlDelay: robots.getCrawlDelay(userAgent) ?? null,
        declaredSitemaps: declared.slice(0, 100),
        sitemaps,
        notice: unavailable
            ? 'The robots response is temporarily unavailable. A crawler should defer requests.'
            : response.status >= 400
              ? 'robots.txt is unavailable with a 4xx response; no rules were applied.'
              : 'Crawl rules are advisory. A sitemap does not guarantee indexing.',
    };
}
