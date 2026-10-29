import { pageMetadata } from '../../lib/seo';
import type { Metadata } from 'next';
import { toolGlyphs } from '../../components/tool-glyphs';
import { CatalogBrowser } from '../../components/catalog-browser';

export const metadata: Metadata = pageMetadata(
    'Free online developer tools and agent utilities',
    'Browse JSON, DNS, image, PDF and API testing tools by category. Run browser utilities locally or connect a coding agent through MCP. Planned tools are clearly marked.',
    '/catalog/',
);
export default function CatalogPage() {
    return <CatalogBrowser glyphs={toolGlyphs(20)} />;
}
