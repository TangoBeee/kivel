import Link from 'next/link';
import { ApiReference } from '../../../components/api-reference';
import { ApiIndex } from '../../../components/api-index';
import { StructuredData } from '../../../components/content-layout';
import { absolute } from '../../../components/content-blocks';
import { breadcrumbs, pageMetadata } from '../../../lib/seo';
export const metadata = pageMetadata(
    'HTTP API reference',
    'socket.help HTTP API reference: every endpoint for utilities, webhook inboxes, mock APIs, files, MCP, accounts, sharing, and lifecycle, with schemas and examples.',
    '/docs/reference/',
);
export default function Reference() {
    return (
        <div className="api-reference-page reference-page">
            <StructuredData
                value={breadcrumbs([
                    { name: 'Documentation', path: '/docs/' },
                    { name: 'HTTP API reference', path: '/docs/reference/' },
                ])}
            />
            <StructuredData
                value={{
                    '@context': 'https://schema.org',
                    '@type': 'WebAPI',
                    name: 'socket.help API',
                    description:
                        'HTTP API for browser utilities, webhook inboxes, mock REST APIs, temporary file sharing, mock MCP servers, and workspace management.',
                    documentation: absolute('/docs/'),
                    url: absolute('/docs/reference/'),
                    provider: { '@type': 'Organization', name: 'socket.help', url: absolute('/') },
                    termsOfService: absolute('/terms/'),
                    potentialAction: {
                        '@type': 'ReadAction',
                        target: absolute('/api/openapi.json'),
                    },
                }}
            />
            <header className="reference-heading">
                <div>
                    <Link className="content-back" href="/docs/">
                        ← Documentation
                    </Link>
                    <h1>HTTP API reference</h1>
                    <p>
                        Every endpoint with its parameters, request body, responses, and runnable
                        examples. Anonymous calls need no key; account calls send an API key from
                        your workspace as <code>Authorization: Bearer</code>.
                    </p>
                </div>
                <a className="button button-secondary" href="/api/openapi.json">
                    OpenAPI JSON ↗
                </a>
            </header>
            <ApiIndex />
            <ApiReference />
        </div>
    );
}
