import { catalog, categories } from '../../lib/catalog';
import Link from 'next/link';
import { DocsNav } from '../../components/docs-nav';
import { CodeExample } from '../../components/code-example';
import { PageIntro, StructuredData } from '../../components/content-layout';
import { FaqSection, faqSchema } from '../../components/content-blocks';
import { docGroups, docPages } from '../../lib/docs';
import { pageMetadata, breadcrumbs } from '../../lib/seo';

export const metadata = pageMetadata(
    'Developer docs & API quickstart',
    'Use the complete Kivel toolkit over MCP, HTTP, SDK, CLI or SSH: network checks, email, mocks, files, memory, authenticators, jobs, test data and media.',
    '/docs/',
);
const quickstart = `curl https://kivel.io/api/tools/json/run \\
  -H 'Content-Type: application/json' \\
  -d '{"input":"{\\"hello\\":true}","options":{"action":"format"}}'`;

const mcpSetup = `claude mcp add --transport http kivel https://kivel.io/mcp`;

const faqs = [
    {
        question: 'Do I need an account to use the Kivel API?',
        answer: 'No. Browser utilities and anonymous temporary resources work without an account. An account adds a workspace, longer retention within plan limits, and scoped API keys.',
    },
    {
        question: 'Where is the OpenAPI specification?',
        answer: 'The full OpenAPI document is served at `/api/openapi.json`, and the interactive reference is at /docs/reference/.',
    },
    {
        question: 'Can AI agents use Kivel?',
        answer: 'Yes. Agents can call the HTTP API like any script, or connect to the Kivel MCP endpoint to discover and run tools and manage resources.',
    },
    {
        question: 'Is there a CLI or SDK?',
        answer: 'Yes. A TypeScript SDK and a command line tool wrap the same HTTP API, permissions, and allowances. See the Interfaces pages for setup.',
    },
];

export default function Docs() {
    return (
        <div className="docs-shell docs-shell-index">
            <StructuredData value={breadcrumbs([{ name: 'Documentation', path: '/docs/' }])} />
            <StructuredData value={faqSchema(faqs)} />
            <DocsNav />
            <div className="docs-home">
                <PageIntro
                    title="Documentation"
                    description="Connect your coding agent over MCP, or call the same tools over HTTP. Every page has examples you can run."
                />
                <div className="docs-start">
                    <div>
                        <h2>Connect your agent</h2>
                        <p>
                            {catalog.filter((tool) => tool.status === 'available').length} tools in{' '}
                            {categories.length} categories: HTTP and webhooks, email, mocks and
                            OAuth, files, monitors, memory, authenticators, jobs and status pages,
                            test data and media, developer utilities, DNS and network. Start with
                            search_tools to discover them.
                        </p>
                        <Link className="text-link" href="/connect/">
                            Open the setup guide →
                        </Link>
                    </div>
                    <CodeExample title="Claude Code" code={mcpSetup} />
                </div>
                <div className="docs-start">
                    <div>
                        <h2>Or call the HTTP API</h2>
                        <p>
                            Format JSON without an account. The response contains the tool ID and a
                            text result. Invalid input returns a structured error with a request ID.
                        </p>
                        <Link className="text-link" href="/docs/quickstart/">
                            Read the quickstart →
                        </Link>
                    </div>
                    <CodeExample title="cURL · format JSON" code={quickstart} />
                </div>
                {docGroups.map((group) => {
                    const pages = docPages.filter((page) => page.group === group);
                    if (!pages.length) return null;
                    return (
                        <section
                            key={group}
                            className="docs-group"
                            aria-labelledby={`docs-${group}`}
                        >
                            <h2 id={`docs-${group}`}>{group}</h2>
                            <div className="docs-rows">
                                {pages.map((page) => (
                                    <Link
                                        key={page.slug}
                                        href={`/docs/${page.slug}/`}
                                        className="docs-row"
                                    >
                                        <strong>{page.title}</strong>
                                        <span>{page.description}</span>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    );
                })}
                <section className="docs-group" aria-labelledby="docs-reference">
                    <h2 id="docs-reference">Reference</h2>
                    <div className="docs-rows">
                        <Link href="/docs/reference/" className="docs-row">
                            <strong>HTTP API reference</strong>
                            <span>
                                Every endpoint with parameters, request bodies, responses, and
                                runnable examples.
                            </span>
                        </Link>
                        <a href="/api/openapi.json" className="docs-row">
                            <strong>OpenAPI JSON</strong>
                            <span>
                                The machine readable specification, for code generators, clients,
                                and agents.
                            </span>
                        </a>
                    </div>
                </section>
                <FaqSection faqs={faqs} />
            </div>
        </div>
    );
}
