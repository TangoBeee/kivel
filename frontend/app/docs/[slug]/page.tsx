import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StructuredData } from '../../../components/content-layout';
import {
    DocSectionBody,
    FaqSection,
    PageSequence,
    absolute,
    faqSchema,
    formatDate,
} from '../../../components/content-blocks';
import { DocsNav } from '../../../components/docs-nav';
import { docPages } from '../../../lib/docs';
import { breadcrumbs, pageMetadata } from '../../../lib/seo';

export const dynamicParams = false;
export function generateStaticParams() {
    return docPages.map((page) => ({ slug: page.slug }));
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const page = docPages.find((item) => item.slug === slug);
    if (!page) return {};
    const metadata = pageMetadata(`${page.title} · Docs`, page.description, `/docs/${slug}/`);
    return {
        ...metadata,
        openGraph: { ...metadata.openGraph, type: 'article', modifiedTime: page.updatedAt },
    };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const index = docPages.findIndex((item) => item.slug === slug);
    const page = docPages[index];
    if (!page) notFound();
    const previous = docPages[index - 1];
    const next = docPages[index + 1];
    const path = `/docs/${slug}/`;
    return (
        <div className="docs-shell">
            <StructuredData
                value={breadcrumbs([
                    { name: 'Documentation', path: '/docs/' },
                    { name: page.title, path },
                ])}
            />
            <StructuredData
                value={{
                    '@context': 'https://schema.org',
                    '@type': 'TechArticle',
                    headline: page.title,
                    description: page.description,
                    dateModified: page.updatedAt,
                    mainEntityOfPage: absolute(path),
                    author: { '@type': 'Organization', name: 'socket.help', url: absolute('/') },
                    publisher: { '@type': 'Organization', name: 'socket.help', url: absolute('/') },
                    proficiencyLevel: page.group === 'Get started' ? 'Beginner' : 'Expert',
                }}
            />
            {page.faqs?.length ? <StructuredData value={faqSchema(page.faqs)} /> : null}
            <DocsNav current={slug} />
            <article className="docs-article">
                <nav className="breadcrumb docs-breadcrumb" aria-label="Breadcrumb">
                    <Link href="/docs/">Docs</Link>
                    <span aria-hidden="true">/</span>
                    <span>{page.group}</span>
                </nav>
                <header className="docs-article-head">
                    <h1>{page.title}</h1>
                    <p>{page.description}</p>
                    <span className="docs-updated">Updated {formatDate(page.updatedAt)}</span>
                </header>
                <div className="reading-body">
                    {page.sections.map((section) => (
                        <DocSectionBody key={section.id} section={section} />
                    ))}
                    {page.faqs?.length ? <FaqSection faqs={page.faqs} /> : null}
                    {page.related?.length ? (
                        <nav className="content-related" aria-label="Related pages">
                            <h2>Related</h2>
                            {page.related.map((link) => (
                                <Link key={link.href} href={link.href}>
                                    {link.title} <span aria-hidden="true">→</span>
                                </Link>
                            ))}
                        </nav>
                    ) : null}
                    <PageSequence
                        previous={
                            previous && { title: previous.title, href: `/docs/${previous.slug}/` }
                        }
                        next={next && { title: next.title, href: `/docs/${next.slug}/` }}
                    />
                </div>
            </article>
            <nav className="docs-toc" aria-label="On this page">
                <span>On this page</span>
                {page.sections.map((section) => (
                    <a key={section.id} href={`#${section.id}`}>
                        {section.title}
                    </a>
                ))}
                {page.faqs?.length ? <a href="#faq">Questions</a> : null}
            </nav>
        </div>
    );
}
