import Link from 'next/link';
import { PageIntro, StructuredData } from '../../components/content-layout';
import { FaqSection, absolute, faqSchema, formatDate } from '../../components/content-blocks';
import { comparisons } from '../../lib/comparisons';
import { pageMetadata } from '../../lib/seo';

export const metadata = pageMetadata(
    'Alternatives to Webhook.site, Mailtrap, AgentMail and more',
    'Looking for a Webhook.site, Mailtrap, Mailinator, AgentMail, RequestBin or Beeceptor alternative? See how Kivel compares, with sourced differences and free tools to try.',
    '/compare/',
);

const faqs = [
    {
        question: 'How are these comparisons written?',
        answer: 'Each page compares overlapping workflows, not every feature. Facts about other products come from their official documentation, which is linked on every page with the date it was last checked.',
    },
    {
        question: 'Do the comparisons include pricing?',
        answer: 'No. Prices change often and depend on plans, so each page links to the official source instead. Kivel allowances are listed on the plans page.',
    },
    {
        question: 'Does Kivel always win?',
        answer: 'No. Every comparison says when the other tool is the better choice and where Kivel stops, for example features it does not offer yet.',
    },
];

export default function Compare() {
    const latest = comparisons
        .map((item) => item.reviewedAt)
        .sort()
        .at(-1)!;
    return (
        <div className="content-page compare-index">
            <StructuredData
                value={{
                    '@context': 'https://schema.org',
                    '@type': 'ItemList',
                    name: 'Kivel comparisons',
                    itemListElement: comparisons.map((item, index) => ({
                        '@type': 'ListItem',
                        position: index + 1,
                        name: `Kivel vs ${item.name}`,
                        url: absolute(`/compare/${item.slug}/`),
                    })),
                }}
            />
            <StructuredData value={faqSchema(faqs)} />
            <PageIntro
                meta={`Last reviewed ${formatDate(latest)}`}
                title="Pick the right tool for the job."
                description="Honest, sourced comparisons with tools you may already use. Each one says when Kivel fits, and when another option suits you better."
            />
            <div className="compare-grid">
                {comparisons.map((item) => (
                    <Link key={item.slug} href={`/compare/${item.slug}/`} className="compare-card">
                        <span className="content-label">{item.focus}</span>
                        <h2>
                            Kivel <span>vs</span> {item.name}
                        </h2>
                        <p>{item.summary}</p>
                        <span className="compare-card-meta">
                            Reviewed {formatDate(item.reviewedAt)} · {item.sources.length}{' '}
                            {item.sources.length === 1 ? 'source' : 'sources'}
                        </span>
                        <span className="text-link">Compare workflows →</span>
                    </Link>
                ))}
            </div>
            <section className="content-section" aria-labelledby="glance-title">
                <h2 id="glance-title">At a glance.</h2>
                <p>
                    The short version of every comparison. Open a page for the details and sources.
                </p>
                <div className="content-table-wrap">
                    <table className="content-table">
                        <caption>When to choose Kivel or the alternative</caption>
                        <thead>
                            <tr>
                                <th scope="col">Alternative</th>
                                <th scope="col">Area</th>
                                <th scope="col">Choose Kivel when</th>
                                <th scope="col">Choose the alternative when</th>
                            </tr>
                        </thead>
                        <tbody>
                            {comparisons.map((item) => (
                                <tr key={item.slug}>
                                    <th scope="row">
                                        <Link href={`/compare/${item.slug}/`}>{item.name}</Link>
                                    </th>
                                    <td>{item.focus}</td>
                                    <td>{item.bestFor.socket[0]}</td>
                                    <td>{item.bestFor.other[0]}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
            <FaqSection faqs={faqs} title="How we compare" />
            <div className="content-end">
                <div>
                    <h2>See what is available today.</h2>
                    <p>Every comparison links to the Kivel tools it covers.</p>
                </div>
                <Link href="/catalog/" className="button button-primary">
                    Explore the tools →
                </Link>
            </div>
        </div>
    );
}
