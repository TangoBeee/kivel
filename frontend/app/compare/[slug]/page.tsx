import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReadingLayout } from '../../../components/content-layout';
import { comparisons } from '../../../lib/comparisons';
import { pageMetadata } from '../../../lib/seo';
import { StructuredData } from '../../../components/content-layout';
import { FaqSection, faqSchema, formatDate } from '../../../components/content-blocks';
export const dynamicParams = false;
export function generateStaticParams() {
    return comparisons.map((item) => ({ slug: item.slug }));
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const comparison = comparisons.find((item) => item.slug === slug);
    return comparison
        ? pageMetadata(
              `socket.help vs ${comparison.name}: ${comparison.focus.toLowerCase()} compared`,
              comparison.description,
              `/compare/${slug}/`,
          )
        : {};
}
export default async function Comparison({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const item = comparisons.find((entry) => entry.slug === slug);
    if (!item) notFound();
    const sections = [
        { id: 'fit', title: 'Which one fits?' },
        { id: 'differences', title: 'Key differences' },
        { id: 'limits', title: 'Where socket.help stops' },
        { id: 'faq', title: 'Questions' },
        { id: 'sources', title: 'Sources & review date' },
    ];
    const others = comparisons.filter((entry) => entry.slug !== slug);
    return (
        <ReadingLayout
            label={`${item.focus} · Reviewed ${formatDate(item.reviewedAt)}`}
            title={`socket.help vs ${item.name}`}
            description={item.summary}
            path={`/compare/${slug}/`}
            sections={sections}
            parent={{ name: 'All comparisons', path: '/compare/' }}
        >
            <section id="fit">
                <h2>Choose by your workflow.</h2>
                <div className="comparison-fit">
                    <div>
                        <span className="content-label">socket.help</span>
                        <p>{item.socketFit}</p>
                        <ul className="fit-list">
                            {item.bestFor.socket.map((point) => (
                                <li key={point}>{point}</li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <span className="content-label">{item.name}</span>
                        <p>{item.otherFit}</p>
                        <ul className="fit-list">
                            {item.bestFor.other.map((point) => (
                                <li key={point}>{point}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>
            <section id="differences">
                <h2>The differences that matter.</h2>
                <div className="content-table-wrap">
                    <table className="content-table comparison-table">
                        <caption>{`Workflow comparison: socket.help and ${item.name}`}</caption>
                        <thead>
                            <tr>
                                <th scope="col">Area</th>
                                <th scope="col">socket.help</th>
                                <th scope="col">{item.name}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {item.rows.map((row) => (
                                <tr key={row.topic}>
                                    <th scope="row">{row.topic}</th>
                                    <td>{row.socket}</td>
                                    <td>{row.other}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
            <section id="limits">
                <h2>Where socket.help stops.</h2>
                <p>{item.limitations}</p>
                <p>
                    The catalog includes planned tools, clearly marked Coming soon. Those tools
                    cannot be used yet. Check the <Link href="/plans/">published allowances</Link>{' '}
                    for storage, rate limits, and retention before choosing a workflow.
                </p>
            </section>
            <StructuredData value={faqSchema(item.faqs)} />
            <FaqSection faqs={item.faqs} />
            <section id="sources">
                <h2>Check the sources.</h2>
                <p>
                    Reviewed on{' '}
                    <time dateTime={item.reviewedAt}>{formatDate(item.reviewedAt)}</time> against
                    official documentation. Features can change. This page is written by socket.help
                    and is not an endorsement by {item.name}.
                </p>
                <ul className="source-list">
                    {item.sources.map((source) => (
                        <li key={source.url}>
                            <a href={source.url} target="_blank" rel="noreferrer">
                                {source.title} ↗
                            </a>
                        </li>
                    ))}
                </ul>
            </section>
            <nav className="content-related" aria-label="Try the workflow">
                <h2>Try a focused workflow.</h2>
                {item.tools.map((tool) => (
                    <Link key={tool.href} href={tool.href}>
                        {tool.title} <span aria-hidden="true">→</span>
                    </Link>
                ))}
            </nav>
            <nav className="more-guides" aria-label="Other comparisons">
                <h2>Other comparisons</h2>
                <div>
                    {others.map((entry) => (
                        <Link key={entry.slug} href={`/compare/${entry.slug}/`}>
                            <small>{entry.focus}</small>
                            <strong>socket.help vs {entry.name}</strong>
                        </Link>
                    ))}
                </div>
            </nav>
        </ReadingLayout>
    );
}
