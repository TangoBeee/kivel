import Link from 'next/link';
import { ArticleCover, coverFor } from '../../../components/article-cover';
import { notFound } from 'next/navigation';
import { ReadingLayout, StructuredData } from '../../../components/content-layout';
import { CodeExample } from '../../../components/code-example';
import { articles } from '../../../lib/articles';
import { pageMetadata } from '../../../lib/seo';
import { siteOrigin } from '../../../lib/site';
import { FaqSection, faqSchema, formatDate } from '../../../components/content-blocks';
import type { Article } from '../../../lib/articles';

const words = (article: Article) =>
    article.sections
        .flatMap((section) => [...section.paragraphs, ...(section.steps ?? [])])
        .join(' ')
        .split(/\s+/).length;
const readingMinutes = (article: Article) => Math.max(2, Math.round(words(article) / 220));
export const dynamicParams = false;
export function generateStaticParams() {
    return articles.map((article) => ({ slug: article.slug }));
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const article = articles.find((item) => item.slug === slug);
    if (!article) return {};
    const metadata = pageMetadata(article.title, article.description, `/blog/${slug}/`);
    return {
        ...metadata,
        twitter: {
            card: 'summary_large_image',
            title: article.title,
            description: article.description,
            images: [`${siteOrigin}${coverFor(slug)}`],
        },
        openGraph: {
            ...metadata.openGraph,
            type: 'article',
            publishedTime: article.publishedAt,
            modifiedTime: article.updatedAt ?? article.publishedAt,
            images: [
                {
                    url: `${siteOrigin}${coverFor(slug)}`,
                    width: 1200,
                    height: 700,
                    alt: article.title,
                },
            ],
        },
    };
}
export default async function BlogArticle({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const article = articles.find((item) => item.slug === slug);
    if (!article) notFound();
    const updated = article.updatedAt ?? article.publishedAt;
    const more = [
        ...articles.filter((item) => item.slug !== slug && item.category === article.category),
        ...articles.filter((item) => item.slug !== slug && item.category !== article.category),
    ].slice(0, 3);
    const tocSections = [
        ...article.sections,
        ...(article.faqs?.length ? [{ id: 'faq', title: 'Questions' }] : []),
        ...(article.sources ? [{ id: 'sources', title: 'Sources' }] : []),
    ];
    return (
        <ReadingLayout
            meta={`${article.category} · ${updated !== article.publishedAt ? `Updated ${formatDate(updated)}` : formatDate(article.publishedAt)} · ${readingMinutes(article)} min read`}
            title={article.title}
            description={article.description}
            path={`/blog/${slug}/`}
            sections={tocSections}
            parent={{ name: 'Blog', path: '/blog/' }}
        >
            <StructuredData
                value={{
                    '@context': 'https://schema.org',
                    '@type': 'BlogPosting',
                    headline: article.title,
                    description: article.description,
                    datePublished: article.publishedAt,
                    dateModified: updated,
                    articleSection: article.category,
                    wordCount: words(article),
                    image: `${siteOrigin}${coverFor(slug)}`,
                    author: { '@type': 'Organization', name: 'Kivel', url: siteOrigin },
                    publisher: { '@type': 'Organization', name: 'Kivel', url: siteOrigin },
                    mainEntityOfPage: `${siteOrigin}/blog/${slug}/`,
                }}
            />
            <ArticleCover slug={slug} large />
            {article.sections.map((section) => (
                <section id={section.id} key={section.id}>
                    <h2>{section.title}</h2>
                    {section.paragraphs.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                    ))}
                    {section.steps && (
                        <ul>
                            {section.steps.map((step) => (
                                <li key={step}>{step}</li>
                            ))}
                        </ul>
                    )}
                    {section.code && (
                        <CodeExample title={section.code.title} code={section.code.value} />
                    )}
                </section>
            ))}
            {article.faqs?.length ? (
                <>
                    <StructuredData value={faqSchema(article.faqs)} />
                    <FaqSection faqs={article.faqs} title="Questions people ask" />
                </>
            ) : null}
            {article.sources && (
                <section id="sources">
                    <h2>Sources</h2>
                    <ul className="source-list">
                        {article.sources.map((source) => (
                            <li key={source.url}>
                                <a href={source.url} target="_blank" rel="noreferrer">
                                    {source.title} ↗
                                </a>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            <nav className="content-related" aria-label="Related tools and guides">
                <h2>Put it to work.</h2>
                {article.related.map((link) => (
                    <Link key={link.href} href={link.href}>
                        {link.title} <span aria-hidden="true">→</span>
                    </Link>
                ))}
            </nav>
            <nav className="more-guides" aria-label="More guides">
                <h2>More guides</h2>
                <div>
                    {more.map((item) => (
                        <Link key={item.slug} href={`/blog/${item.slug}/`}>
                            <small>{item.category}</small>
                            <strong>{item.title}</strong>
                        </Link>
                    ))}
                </div>
            </nav>
        </ReadingLayout>
    );
}
