import Link from 'next/link';
import { CodeExample } from '../../components/code-example';
import { PageIntro, StructuredData } from '../../components/content-layout';
import { FaqSection, faqSchema } from '../../components/content-blocks';
import { docGroups, docPages } from '../../lib/docs';
import { pageMetadata, breadcrumbs } from '../../lib/seo';

export const metadata = pageMetadata(
    'Developer docs & API quickstart',
    'socket.help developer docs: run utilities over HTTP, create webhook inboxes, mock APIs and file shares, use API keys, and connect the CLI, SDK, SSH, or MCP.',
    '/docs/',
);
const quickstart = `curl https://socket.help/api/tools/json/run \\
  -H 'Content-Type: application/json' \\
  -d '{"input":"{\\"hello\\":true}","options":{"action":"format"}}'`;

const faqs = [
    {
        question: 'Do I need an account to use the socket.help API?',
        answer: 'No. Browser utilities and anonymous temporary resources work without an account. An account adds a workspace, longer retention within plan limits, and scoped API keys.',
    },
    {
        question: 'Where is the OpenAPI specification?',
        answer: 'The full OpenAPI document is served at `/api/openapi.json`, and the interactive reference is at /docs/reference/.',
    },
    {
        question: 'Can AI agents use socket.help?',
        answer: 'Yes. Agents can call the HTTP API like any script, or connect to the socket.help MCP endpoint to discover and run tools and manage resources.',
    },
    {
        question: 'Is there a CLI or SDK?',
        answer: 'Yes. A TypeScript SDK and a command line tool wrap the same HTTP API, permissions, and allowances. See the Interfaces pages for setup.',
    },
];

export default function Docs() {
    return (
        <div className="content-page docs-home">
            <StructuredData value={breadcrumbs([{ name: 'Documentation', path: '/docs/' }])} />
            <StructuredData value={faqSchema(faqs)} />
            <PageIntro
                title="From a quick test to your workflow."
                description="Run a utility, create a temporary endpoint, or connect an agent. Start with one HTTP request, no account needed."
            >
                <Link className="button button-primary" href="/docs/reference/">
                    Explore the API reference →
                </Link>
                <Link className="button button-secondary" href="/integrations/">
                    SDK, CLI & integrations
                </Link>
            </PageIntro>
            <div className="docs-start">
                <div>
                    <h2>Your first request</h2>
                    <p>
                        Format JSON without an account. The response contains the tool ID and a text
                        result. Invalid input returns a structured error with a request ID.
                    </p>
                    <Link
                        className="text-link"
                        href={docPages[0] ? `/docs/${docPages[0].slug}/` : '/docs/reference/'}
                    >
                        Read the quickstart →
                    </Link>
                </div>
                <CodeExample title="cURL · format JSON" code={quickstart} />
            </div>
            {docGroups.map((group) => {
                const pages = docPages.filter((page) => page.group === group);
                if (!pages.length) return null;
                return (
                    <section key={group} className="docs-group" aria-labelledby={`docs-${group}`}>
                        <h2 id={`docs-${group}`}>{group}</h2>
                        <div className="docs-cards">
                            {pages.map((page) => (
                                <Link
                                    key={page.slug}
                                    href={`/docs/${page.slug}/`}
                                    className="docs-card"
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
                <div className="docs-cards">
                    <Link href="/docs/reference/" className="docs-card">
                        <strong>HTTP API reference</strong>
                        <span>
                            Every endpoint with parameters, request bodies, responses, and runnable
                            examples.
                        </span>
                    </Link>
                    <a href="/api/openapi.json" className="docs-card">
                        <strong>OpenAPI JSON</strong>
                        <span>
                            The machine readable specification, for code generators, clients, and
                            agents.
                        </span>
                    </a>
                </div>
            </section>
            <FaqSection faqs={faqs} />
        </div>
    );
}
