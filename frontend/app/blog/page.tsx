import Link from 'next/link';
import { ArticleCover } from '../../components/article-cover';
import { PageIntro, StructuredData } from '../../components/content-layout';
import { BlogBrowser } from '../../components/blog-browser';
import { absolute, formatDate } from '../../components/content-blocks';
import { Icon } from '../../components/icons';
import { articles } from '../../lib/articles';
import type { Article } from '../../lib/articles';
import { pageMetadata } from '../../lib/seo';

export const metadata = {
    ...pageMetadata(
        'Blog: practical guides for testing & sharing',
        'Practical socket.help guides to webhooks, mock APIs, MCP servers, JSON, file sharing, payment fixtures, and media tools, with working examples you can run.',
        '/blog/',
    ),
    alternates: {
        canonical: '/blog/',
        types: { 'application/rss+xml': [{ url: '/blog/rss.xml', title: 'socket.help guides' }] },
    },
};

const minutes = (article: Article) =>
    Math.max(
        2,
        Math.round(
            article.sections
                .flatMap((section) => [...section.paragraphs, ...(section.steps ?? [])])
                .join(' ')
                .split(/\s+/).length / 220,
        ),
    );

export default function Blog() {
    const sorted = [...articles].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const [featured, ...rest] = sorted;
    const categories = [...new Set(rest.map((article) => article.category))];
    return (
        <div className="content-page blog-index">
            <StructuredData
                value={{
                    '@context': 'https://schema.org',
                    '@type': 'Blog',
                    name: 'socket.help guides',
                    url: absolute('/blog/'),
                    blogPost: sorted.map((article) => ({
                        '@type': 'BlogPosting',
                        headline: article.title,
                        url: absolute(`/blog/${article.slug}/`),
                        datePublished: article.publishedAt,
                        dateModified: article.updatedAt ?? article.publishedAt,
                    })),
                }}
            />
            <PageIntro
                title="Less setup. Better understanding."
                description="Practical guides for the small tasks between an idea and a working integration, each with examples you can run."
            >
                <a className="button button-secondary" href="/blog/rss.xml">
                    <Icon name="pulse" size={15} /> RSS feed
                </a>
            </PageIntro>
            <Link className="featured-article" href={`/blog/${featured!.slug}/`}>
                <ArticleCover slug={featured!.slug} large />
                <div className="featured-article-body">
                    <span className="content-label">Latest · {featured!.category}</span>
                    <h2>{featured!.title}</h2>
                    <p>{featured!.description}</p>
                    <span className="article-meta">
                        {formatDate(featured!.publishedAt)} · {minutes(featured!)} min read
                    </span>
                    <span className="text-link">Read the guide →</span>
                </div>
            </Link>
            <section className="content-section">
                <h2>More practical guides.</h2>
                <BlogBrowser
                    categories={categories}
                    cards={rest.map((article) => ({
                        slug: article.slug,
                        title: article.title,
                        description: article.description,
                        category: article.category,
                        icon: article.icon,
                        date: formatDate(article.publishedAt),
                        minutes: minutes(article),
                    }))}
                />
            </section>
            <div className="content-end">
                <div>
                    <h2>Choosing between tools?</h2>
                    <p>See where socket.help fits alongside established alternatives.</p>
                </div>
                <Link className="button button-secondary" href="/compare/">
                    Explore comparisons →
                </Link>
            </div>
        </div>
    );
}
