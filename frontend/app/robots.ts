import type { MetadataRoute } from 'next';
import { siteOrigin } from '../lib/site';
export const dynamic = 'force-static';
export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: [
                '/api/',
                '/hooks/',
                '/mock/',
                '/mcp',
                '/files/',
                '/webhooks/',
                '/account/',
                '/share/',
                '/billing/',
            ],
        },
        sitemap: `${siteOrigin}/sitemap.xml`,
    };
}
