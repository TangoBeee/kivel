import Link from 'next/link';
import type { ReactNode } from 'react';
import { breadcrumbs } from '../lib/seo';

export function StructuredData({ value }: { value: unknown }) {
    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, '\\u003c') }}
        />
    );
}

/**
 * Inner pages open high above the homepage hill: open blue sky, a centered headline, and soft
 * clouds that dissolve into the white page. The header floats over it, as on the homepage.
 */
export function PageIntro({
    meta,
    title,
    description,
    children,
    back,
}: {
    meta?: string;
    title: string;
    description: string;
    children?: ReactNode;
    back?: { name: string; path: string };
}) {
    return (
        <header className="content-intro page-sky">
            <img
                className="page-sky-scene"
                src="/art/clouds-1672.webp"
                srcSet="/art/clouds-960.webp 960w, /art/clouds-1672.webp 1672w"
                sizes="100vw"
                alt=""
                width={1672}
                height={658}
                fetchPriority="high"
            />
            {back && (
                <Link className="page-sky-back" href={back.path}>
                    ← {back.name}
                </Link>
            )}
            <h1>{title}</h1>
            <p>{description}</p>
            {meta && <p className="content-meta">{meta}</p>}
            {children && <div className="content-actions">{children}</div>}
        </header>
    );
}

export function ReadingLayout({
    meta,
    title,
    description,
    path,
    sections,
    children,
    parent,
}: {
    meta?: string;
    title: string;
    description: string;
    path: string;
    sections: { id: string; title: string }[];
    children: ReactNode;
    parent?: { name: string; path: string };
}) {
    return (
        <article className="content-page reading-page">
            <StructuredData
                value={breadcrumbs([...(parent ? [parent] : []), { name: title, path }])}
            />
            <PageIntro meta={meta} title={title} description={description} back={parent} />
            <div className="reading-layout">
                <nav className="content-toc" aria-label="On this page">
                    <span>On this page</span>
                    {sections.map((section) => (
                        <a key={section.id} href={`#${section.id}`}>
                            {section.title}
                        </a>
                    ))}
                </nav>
                <div className="reading-body">{children}</div>
            </div>
        </article>
    );
}
