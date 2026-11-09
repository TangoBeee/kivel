import Link from 'next/link';
import { docGroups, docPages } from '../lib/docs';
import { DocsNavMenu } from './docs-nav-menu';

/** The documentation sidebar, grouped, with the API reference at the end. */
export function DocsNav({ current }: { current?: string }) {
    return (
        <DocsNavMenu key={current ?? 'home'}>
            <Link href="/docs/" className={`docs-nav-home ${current ? '' : 'is-current'}`}>
                Documentation home
            </Link>
            <Link href="/connect/" className="docs-nav-home">
                Connect an agent
            </Link>
            {docGroups.map((group) => {
                const pages = docPages.filter((page) => page.group === group);
                if (!pages.length && group !== 'Reference') return null;
                return (
                    <div key={group} className="docs-nav-group">
                        <span>{group}</span>
                        {pages.map((page) => (
                            <Link
                                key={page.slug}
                                href={`/docs/${page.slug}/`}
                                aria-current={page.slug === current ? 'page' : undefined}
                            >
                                {page.navTitle}
                            </Link>
                        ))}
                        {group === 'Reference' && (
                            <>
                                <Link href="/docs/reference/">HTTP API reference</Link>
                                <a href="/api/openapi.json">OpenAPI JSON ↗</a>
                            </>
                        )}
                    </div>
                );
            })}
        </DocsNavMenu>
    );
}
