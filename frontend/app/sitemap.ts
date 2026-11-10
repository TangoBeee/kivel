import { useCases } from '../lib/use-cases';
import type { MetadataRoute } from 'next';
import { catalog, categories, toolPageHref, categoryHref } from '../lib/catalog';
import { articles } from '../lib/articles';
import { comparisons } from '../lib/comparisons';
import { docPages } from '../lib/docs';
import { siteOrigin } from '../lib/site';
export const dynamic = 'force-static';
export default function sitemap(): MetadataRoute.Sitemap {
    const pages: { path: string; modified?: string }[] = [
        { path: '/' },
        { path: '/use-cases/' },
        ...useCases.map((page) => ({ path: `/use-cases/${page.slug}/` })),
        { path: '/catalog/' },
        { path: '/docs/' },
        ...docPages.map((page) => ({ path: `/docs/${page.slug}/`, modified: page.updatedAt })),
        { path: '/docs/reference/' },
        { path: '/blog/' },
        ...articles.map((article) => ({
            path: `/blog/${article.slug}/`,
            modified: article.updatedAt ?? article.publishedAt,
        })),
        { path: '/compare/' },
        ...comparisons.map((item) => ({
            path: `/compare/${item.slug}/`,
            modified: item.reviewedAt,
        })),
        { path: '/pricing/' },
        { path: '/integrations/' },
        { path: '/connect/' },
        { path: '/privacy/' },
        { path: '/terms/' },
        { path: '/refunds/' },
        { path: '/contact/' },
        { path: '/beta/' },
        ...categories
            .filter((category) =>
                catalog.some(
                    (tool) => tool.categoryId === category.id && tool.status === 'available',
                ),
            )
            .map((category) => ({ path: categoryHref(category.id) })),
        ...catalog
            .filter((tool) => tool.status === 'available')
            .map((tool) => ({ path: toolPageHref(tool) })),
    ];
    return pages.map(({ path, modified }) => ({
        url: `${siteOrigin}${path}`,
        ...(modified ? { lastModified: modified } : {}),
    }));
}
