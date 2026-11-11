import { pageMetadata } from '../../../lib/seo';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { toolGlyphs } from '../../../components/tool-glyphs';
import { CatalogBrowser } from '../../../components/catalog-browser';
import { categories, catalog } from '../../../lib/catalog';

const productMetadata = {
    email: {
        title: 'Email inboxes and verification codes for AI agents',
        description:
            'Create an email address for your agent, send and receive messages, and extract one-time codes and verification links over MCP or the API.',
    },
    'mock-apis': {
        title: 'Mock API servers for REST, OAuth and WebSockets',
        description:
            'Create a hosted mock API with custom routes, responses, delays and errors. Use REST, OAuth and WebSocket mocks through the API or MCP.',
    },
} as const;

export const dynamicParams = false;
export function generateStaticParams() {
    return categories.map((category) => ({ category: category.id }));
}
export async function generateMetadata({
    params,
}: {
    params: Promise<{ category: string }>;
}): Promise<Metadata> {
    const { category: id } = await params;
    const category = categories.find((item) => item.id === id);
    if (!category) return {};
    const product = id === 'email' || id === 'mock-apis' ? productMetadata[id] : undefined;
    const metadata = pageMetadata(
        product?.title ?? `${category.name} tools`,
        product?.description ??
            `${category.description} Browse tools, examples and limits, or connect your coding agent through MCP.`,
        `/catalog/${category.id}/`,
    );
    return {
        ...metadata,
        robots: {
            index: catalog.some(
                (tool) => tool.categoryId === category.id && tool.status === 'available',
            ),
            follow: true,
        },
    };
}
export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
    const { category } = await params;
    if (!categories.some((item) => item.id === category)) notFound();
    return <CatalogBrowser categoryId={category} glyphs={toolGlyphs(20)} />;
}
