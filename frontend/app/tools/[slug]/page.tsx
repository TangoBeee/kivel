import { toolDetails } from '../../../lib/tool-details';
import { ApiScenarioWorkbench } from '../../../components/api-scenario-workbench';
import { AudioComposer } from '../../../components/audio-composer';
import { MusicLibrary } from '../../../components/music-library';
import { mediaOperations } from '@socket-help/tools/media-definitions';
import type { MediaOperationId } from '@socket-help/tools/media-definitions';
import { networkOperations } from '@socket-help/tools/network-definitions';
import type { NetworkOperationId } from '@socket-help/tools/network-definitions';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { catalog, categories, toolSlug, toolPageHref, fileToolIds } from '../../../lib/catalog';
import { browserOperations } from '../../../lib/browser-tool-definitions';
import type { BrowserOperationId } from '../../../lib/browser-tool-definitions';
import { toolGuide, toolExample, toolArticle } from '../../../lib/tool-guides';
import { BrowserWorkbench } from '../../../components/browser-workbench';
import { BrowserOperation } from '../../../components/browser-operation';
import { ResourceWorkbench } from '../../../components/resource-workbench';
import WebhookWorkbench from '../../../components/webhook-workbench';
import { McpConnect } from '../../../components/mcp-connect';
import { EmailInboxWorkbench } from '../../../components/email-inbox-workbench';
import { CodeExample } from '../../../components/code-example';
import { StructuredData } from '../../../components/content-layout';
import { breadcrumbs } from '../../../lib/seo';
import { ToolHeader } from '../../../components/tool-header';

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
    const title = `${tool.name}${available ? '' : ' · Coming soon'}`;
    const description = `${tool.description} ${available ? (tool.local ? 'Free, private, and processed in your browser.' : 'Free temporary tools for testing and sharing.') : 'Planned for socket.help; not available yet.'}`;
    return {
        title,
        description,
        alternates: { canonical: toolPageHref(tool) },
        robots: { index: available, follow: true },
        openGraph: { title, description, url: toolPageHref(tool), type: 'website' },
        twitter: { card: 'summary_large_image', title, description },
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
            {tool.status === 'coming-soon' ? (
                <div className="page-width work-page">
                    <ToolHeader toolId={tool.id}>
                        <span className="badge">Coming soon</span>
                    </ToolHeader>
                    <p className="tool-notice">This tool is planned. It is not available yet.</p>
                    <Link className="text-link" href={`/catalog/${tool.categoryId}/`}>
                        Explore{' '}
                        {categories.find((category) => category.id === tool.categoryId)?.name}
                    </Link>
                </div>
            ) : tool.id === 'mock-apis-api-test-scenarios' ? (
                <ApiScenarioWorkbench />
            ) : ['test-media-audio-composer', 'test-media-sample-audio'].includes(tool.id) ? (
                <AudioComposer toolId={tool.id} />
            ) : tool.id === 'test-media-music-library' ? (
                <MusicLibrary />
            ) : tool.id === 'email-temporary-email-inbox' ? (
                <EmailInboxWorkbench toolId={tool.id} />
            ) : tool.id === 'agents-socket-help-mcp' ? (
                <McpConnect />
            ) : tool.id === 'webhooks' || tool.id === 'domains-temporary-callback-url' ? (
                <WebhookWorkbench toolId={tool.id} />
            ) : Object.hasOwn(networkOperations, tool.id) ||
              Object.hasOwn(mediaOperations, tool.id) ? (
                <BrowserOperation
                    key={tool.id}
                    toolId={tool.id as NetworkOperationId | MediaOperationId}
                />
            ) : Object.hasOwn(browserOperations, tool.id) ? (
                <BrowserOperation key={tool.id} toolId={tool.id as BrowserOperationId} />
            ) : tool.local ? (
                <BrowserWorkbench toolId={tool.id} />
            ) : (
                <ResourceWorkbench
                    key={tool.id}
                    toolId={tool.id}
                    kind={
                        fileToolIds.includes(tool.id)
                            ? 'file'
                            : ['agents-mock-mcp-server', 'agents-tool-failure-simulator'].includes(
                                    tool.id,
                                )
                              ? 'mcp'
                              : 'mock'
                    }
                />
            )}
            {tool.status === 'available' && (
                <div className="page-width">
                    <aside className="tool-agent" aria-label="Use it from an agent">
                        <p>
                            <strong>Your coding agent can do this too.</strong> Connect socket.help
                            once and Claude Code, Cursor or any MCP client finds this tool with{' '}
                            <code>search_tools</code> and runs it for you.
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
                        <Link className="text-link" href="/docs/">
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
