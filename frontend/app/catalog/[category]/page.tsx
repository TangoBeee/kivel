import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { toolGlyphs } from '../../../components/tool-glyphs';
import { CatalogBrowser } from '../../../components/catalog-browser';
import { categories } from '../../../lib/catalog';

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
    return { title: category?.name ?? 'Tool catalog', description: category?.description };
}
export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
    const { category } = await params;
    if (!categories.some((item) => item.id === category)) notFound();
    return <CatalogBrowser categoryId={category} glyphs={toolGlyphs(20)} />;
}
