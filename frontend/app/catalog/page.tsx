import type { Metadata } from 'next';
import { toolGlyphs } from '../../components/tool-glyphs';
import { CatalogBrowser } from '../../components/catalog-browser';

export const metadata: Metadata = { title: 'Explore tools' };
export default function CatalogPage() {
    return <CatalogBrowser glyphs={toolGlyphs(20)} />;
}
