import type { Metadata } from 'next';
import { siteOrigin } from './site';

export const shareImage = {
    url: `${siteOrigin}/opengraph-image`,
    width: 1200,
    height: 630,
    alt: 'Kivel, the internet toolkit for coding agents',
};

export function pageMetadata(title: string, description: string, path: string): Metadata {
    return {
        title,
        description,
        alternates: { canonical: path },
        openGraph: {
            title,
            description,
            url: path,
            type: 'website',
            siteName: 'Kivel',
            images: [shareImage],
        },
        twitter: { card: 'summary_large_image', title, description, images: [shareImage.url] },
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
