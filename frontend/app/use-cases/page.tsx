import Link from 'next/link';
import { PageIntro, StructuredData } from '../../components/content-layout';
import { pageMetadata, breadcrumbs } from '../../lib/seo';
import { siteOrigin } from '../../lib/site';
import { useCases } from '../../lib/use-cases';
export const metadata = pageMetadata(
    'AI coding agent use cases: webhooks, email and approvals',
    'Practical workflows for coding agents: receive webhook callbacks, verify signup emails, test mock APIs and ask a human before a risky action. Examples and limits.',
    '/use-cases/',
);
export default function UseCasesPage() {
    return (
        <div className="content-page">
            <StructuredData
                value={breadcrumbs([{ name: 'Agent use cases', path: '/use-cases/' }])}
            />
            <StructuredData
                value={{
                    '@context': 'https://schema.org',
                    '@type': 'CollectionPage',
                    name: 'AI coding agent use cases',
                    url: `${siteOrigin}/use-cases/`,
                    mainEntity: {
                        '@type': 'ItemList',
                        itemListElement: useCases.map((page, index) => ({
                            '@type': 'ListItem',
                            position: index + 1,
                            name: page.title,
                            url: `${siteOrigin}/use-cases/${page.slug}/`,
                        })),
                    },
                }}
            />
            <PageIntro
                title="What your coding agent can do with Kivel"
                description="Give it an inbox, a callback URL, a test service and a way to ask you. Start with a real workflow, then use the same capabilities through MCP, HTTP, SDK or CLI."
            />
            <div className="reading-body">
                {useCases.map((page) => (
                    <section key={page.slug}>
                        <h2>
                            <Link href={`/use-cases/${page.slug}/`}>{page.title}</Link>
                        </h2>
                        <p>{page.description}</p>
                    </section>
                ))}
                <section>
                    <h2>One connection, shared permissions</h2>
                    <p>
                        Agents join a workspace through a browser approval step. Resources use the
                        same access rules and plan allowances across interfaces; switching clients
                        does not create a fresh quota. Public and private sharing are explicit
                        choices.
                    </p>
                    <p>
                        <Link href="/connect/">Connect an agent</Link> ·{' '}
                        <Link href="/docs/agent-workflows/">Read the implementation guide</Link> ·{' '}
                        <Link href="/pricing/">See every plan limit</Link>
                    </p>
                </section>
            </div>
        </div>
    );
}
