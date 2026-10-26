import Link from 'next/link';
import { Fragment } from 'react';
import { CodeExample } from './code-example';
import type { DocSection } from '../lib/docs';
import { siteOrigin } from '../lib/site';

/** Turns `backtick` spans into <code>, so content data can mention headers and paths naturally. */
export function Inline({ text }: { text: string }) {
    const parts = text.split(/`([^`]+)`/g);
    return (
        <>
            {parts.map((part, index) =>
                index % 2 ? (
                    <code key={index}>{part}</code>
                ) : (
                    <Fragment key={index}>{part}</Fragment>
                ),
            )}
        </>
    );
}

export type Faq = { question: string; answer: string };

export const faqSchema = (faqs: Faq[]) => ({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer.replace(/`/g, '') },
    })),
});

/** Questions and answers as native disclosure elements: readable without JavaScript and by crawlers. */
export function FaqSection({
    faqs,
    id = 'faq',
    title = 'Frequently asked questions',
}: {
    faqs: Faq[];
    id?: string;
    title?: string;
}) {
    return (
        <section id={id} className="faq-section">
            <h2>{title}</h2>
            <div className="faq-list">
                {faqs.map((faq) => (
                    <details key={faq.question}>
                        <summary>{faq.question}</summary>
                        <p>
                            <Inline text={faq.answer} />
                        </p>
                    </details>
                ))}
            </div>
        </section>
    );
}

export function DocSectionBody({ section }: { section: DocSection }) {
    return (
        <section id={section.id}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>
                    <Inline text={paragraph} />
                </p>
            ))}
            {section.list && (
                <ul>
                    {section.list.map((item) => (
                        <li key={item}>
                            <Inline text={item} />
                        </li>
                    ))}
                </ul>
            )}
            {section.table && (
                <div className="content-table-wrap">
                    <table className="content-table">
                        <caption>{section.table.caption}</caption>
                        <thead>
                            <tr>
                                {section.table.headers.map((header) => (
                                    <th key={header} scope="col">
                                        {header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {section.table.rows.map((row, index) => (
                                <tr key={index}>
                                    {row.map((cell, cellIndex) => (
                                        <td key={cellIndex}>
                                            <Inline text={cell} />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {section.code && <CodeExample title={section.code.title} code={section.code.value} />}
            {section.note && (
                <aside className="content-note">
                    <p>
                        <Inline text={section.note} />
                    </p>
                </aside>
            )}
        </section>
    );
}

/** Next and previous links at the end of a sequence of pages. */
export function PageSequence({
    previous,
    next,
}: {
    previous?: { title: string; href: string };
    next?: { title: string; href: string };
}) {
    if (!previous && !next) return null;
    return (
        <nav className="page-sequence" aria-label="More pages">
            {previous ? (
                <Link href={previous.href}>
                    <small>Previous</small>
                    <span>← {previous.title}</span>
                </Link>
            ) : (
                <span />
            )}
            {next && (
                <Link href={next.href} className="is-next">
                    <small>Next</small>
                    <span>{next.title} →</span>
                </Link>
            )}
        </nav>
    );
}

export const absolute = (path: string) => `${siteOrigin}${path}`;

export const formatDate = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    });
