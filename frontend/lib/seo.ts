import type { Metadata } from 'next';
import { siteOrigin } from './site';

export function pageMetadata(title: string, description: string, path: string): Metadata {
    return {
        title,
        description,
        alternates: { canonical: path },
        openGraph: { title, description, url: path, type: 'website', siteName: 'socket.help' },
        twitter: { card: 'summary_large_image', title, description },
    };
}

export function breadcrumbs(items: { name: string; path: string }[]) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [{ name: 'Home', path: '/' }, ...items].map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.name,
            item: `${siteOrigin}${item.path}`,
        })),
    };
}
