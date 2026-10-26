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

export function PageIntro({
    label,
    title,
    description,
    children,
}: {
    label: string;
    title: string;
    description: string;
    children?: ReactNode;
}) {
    return (
        <header className="content-intro">
            <span className="content-label">{label}</span>
            <h1>{title}</h1>
            <p>{description}</p>
            {children && <div className="content-actions">{children}</div>}
        </header>
    );
}

export function ReadingLayout({
    label,
    title,
    description,
    path,
    sections,
    children,
    parent,
}: {
    label: string;
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
            {parent && (
                <Link className="content-back" href={parent.path}>
                    ← {parent.name}
                </Link>
            )}
            <PageIntro label={label} title={title} description={description} />
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
