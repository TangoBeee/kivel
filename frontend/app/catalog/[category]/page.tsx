import { pageMetadata } from '../../../lib/seo';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { toolGlyphs } from '../../../components/tool-glyphs';
import { CatalogBrowser } from '../../../components/catalog-browser';
import { categories, catalog } from '../../../lib/catalog';

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
    const metadata = pageMetadata(
        `${category.name} tools`,
        `${category.description} Browse available tools, see examples and limits, or connect your coding agent through MCP. Planned tools are labelled coming soon.`,
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
