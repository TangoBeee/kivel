import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReadingLayout, StructuredData } from '../../../components/content-layout';
import { DocSectionBody } from '../../../components/content-blocks';
import { useCases } from '../../../lib/use-cases';
import { pageMetadata } from '../../../lib/seo';
import { siteOrigin } from '../../../lib/site';

export const dynamicParams = false;
export function generateStaticParams() {
    return useCases.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const page = useCases.find((page) => page.slug === slug);
    return page ? pageMetadata(page.title, page.description, `/use-cases/${slug}/`) : {};
}
export default async function UseCasePage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const page = useCases.find((page) => page.slug === slug);
    if (!page) notFound();
    return (
        <ReadingLayout
            title={page.title}
            description={page.description}
            path={`/use-cases/${slug}/`}
            parent={{ name: 'Agent use cases', path: '/use-cases/' }}
            sections={page.sections}
        >
            <StructuredData
                value={{
                    '@context': 'https://schema.org',
                    '@type': 'TechArticle',
                    headline: page.title,
                    description: page.description,
                    mainEntityOfPage: `${siteOrigin}/use-cases/${slug}/`,
                    author: { '@type': 'Organization', name: 'Kivel', url: siteOrigin },
                }}
            />
            <p>
                The SDK examples use an authenticated Kivel client.{' '}
                <Link href="/docs/sdk/#setup">Set up the SDK</Link> or{' '}
                <Link href="/connect/">connect your agent over MCP</Link>.
            </p>
            {page.sections.map((section) => (
                <DocSectionBody key={section.id} section={section} />
            ))}
            <nav className="content-related" aria-label="Tools and implementation guides">
                <h2>Put it to work</h2>
                {page.related.map((link) => (
                    <Link key={link.href} href={link.href}>
                        {link.title} →
                    </Link>
                ))}
            </nav>
            <nav className="content-related" aria-label="More agent workflows">
                <h2>Other agent workflows</h2>
                {useCases
                    .filter((item) => item.slug !== slug)
                    .map((item) => (
                        <Link key={item.slug} href={`/use-cases/${item.slug}/`}>
                            {item.title} →
                        </Link>
                    ))}
            </nav>
        </ReadingLayout>
    );
}
