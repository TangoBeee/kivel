import { toolDetails } from '../../../lib/tool-details';
import Link from 'next/link';
import { ToolWorkbench } from '../../../components/tool-workbench';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { catalog, toolSlug, toolPageHref } from '../../../lib/catalog';
import { toolGuide, toolExample, toolArticle } from '../../../lib/tool-guides';
import { CodeExample } from '../../../components/code-example';
import { StructuredData } from '../../../components/content-layout';
import { breadcrumbs, pageMetadata } from '../../../lib/seo';

export const dynamicParams = false;
export function generateStaticParams() {
    return catalog.map((tool) => ({ slug: toolSlug(tool) }));
}
export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const tool = catalog.find((tool) => toolSlug(tool) === slug);
    if (!tool) return {};
    const available = tool.status === 'available';
    // What people type into search: the tool name plus "free online".
    const title = available ? `${tool.name}: free online tool` : `${tool.name} · Coming soon`;
    const description = available
        ? (toolExample(tool.id)?.useCase ?? tool.description)
        : `${tool.description} Planned for Kivel; not available yet.`;
    return {
        ...pageMetadata(title, description, toolPageHref(tool)),
        robots: { index: available, follow: true },
    };
}
export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const tool = catalog.find((tool) => toolSlug(tool) === slug);
    if (!tool) notFound();
    const guide = toolGuide(tool);
    const example = toolExample(tool.id);
    const article = toolArticle(tool.id);
    const related = catalog
        .filter(
            (entry) =>
                entry.categoryId === tool.categoryId &&
                entry.id !== tool.id &&
                entry.status === 'available',
        )
        .sort((left, right) =>
            article
                ? Number(Boolean(toolArticle(right.id))) - Number(Boolean(toolArticle(left.id)))
                : 0,
        )
        .slice(0, 4);
    return (
        <>
            <StructuredData
                value={breadcrumbs([
                    { name: 'Tools', path: '/catalog/' },
                    { name: tool.name, path: toolPageHref(tool) },
                ])}
            />
            <ToolWorkbench toolId={tool.id} />
            {tool.status === 'available' && (
                <div className="page-width">
                    <aside className="tool-agent" aria-label="Use it from an agent">
                        <p>
                            <strong>Your agent can use this too.</strong> Discover the full catalog
                            with <code>search_tools</code>, read inputs with{' '}
                            <code>describe_tool</code>, then use <code>run_tool</code> for utilities
                            or dedicated tools for resources.
                        </p>
                        <Link className="button" href="/connect/">
                            Set up your agent
                        </Link>
                    </aside>
                </div>
            )}
            <section className="page-width tool-guide" aria-label={`About ${tool.name}`}>
                <header className="tool-guide-intro">
                    <h2>About {tool.name}</h2>
                    <p>{guide.intro}</p>
                </header>
                {example && (
                    <div className="tool-guide-example">
                        <div>
                            <h3>When to use it</h3>
                            <p>{example.useCase}</p>
                        </div>
                        <CodeExample title={`${tool.name} example`} code={example.example} />
                    </div>
                )}
                {guide.steps.length > 0 && (
                    <>
                        <h3>How to use it</h3>
                        <ol>
                            {guide.steps.map((step) => (
                                <li key={step}>{step}</li>
                            ))}
                        </ol>
                    </>
                )}
                {toolDetails(tool.id).map((section) => (
                    <section className="tool-guide-detail" key={section.title}>
                        <h3>{section.title}</h3>
                        {section.paragraphs.map((paragraph) => (
                            <p key={paragraph}>{paragraph}</p>
                        ))}
                    </section>
                ))}
                <h3>{tool.status === 'available' ? 'Limits & privacy' : 'Availability'}</h3>
                <p>{guide.limits}</p>
                {tool.status === 'available' && (
                    <p>
                        Use this tool from the{' '}
                        <Link className="text-link" href="/docs/reference/">
                            API reference
                        </Link>{' '}
                        or connect through the{' '}
                        <Link className="text-link" href="/integrations/">
                            SDK, CLI, SSH, or MCP
                        </Link>
                        . Hosted calls share your{' '}
                        <Link className="text-link" href="/plans/">
                            plan allowances
                        </Link>
                        .
                    </p>
                )}
                {article && (
                    <p>
                        <Link className="text-link" href={article}>
                            Read the full guide →
                        </Link>
                    </p>
                )}
                {related.length > 0 && (
                    <nav className="related-tools" aria-label="Related tools">
                        <h3>Related tools</h3>
                        {related.map((entry) => (
                            <Link key={entry.id} href={toolPageHref(entry)}>
                                {entry.name}
                            </Link>
                        ))}
                    </nav>
                )}
            </section>
        </>
    );
}
