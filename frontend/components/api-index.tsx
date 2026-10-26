import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Operation = { summary?: string; description?: string; tags?: string[]; security?: unknown[] };
type Spec = {
    info: { title: string; version: string; description?: string };
    tags?: { name: string; description?: string }[];
    paths: Record<string, Record<string, Operation>>;
};
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function loadSpec(): Spec | null {
    try {
        return JSON.parse(readFileSync(join(process.cwd(), 'lib/generated/openapi.json'), 'utf8'));
    } catch {
        return null;
    }
}

/** Every endpoint as server rendered HTML, grouped by tag: readable by crawlers and AI engines, no JavaScript needed. */
export function ApiIndex() {
    const spec = loadSpec();
    if (!spec) return null;
    const groups = new Map<string, { method: string; path: string; op: Operation }[]>();
    for (const [path, item] of Object.entries(spec.paths))
        for (const method of METHODS) {
            const op = item[method];
            if (!op) continue;
            const tag = op.tags?.[0] ?? 'Other';
            groups.set(tag, [...(groups.get(tag) ?? []), { method, path, op }]);
        }
    const order = (spec.tags ?? []).map((tag) => tag.name);
    const tags = [...groups.keys()].sort(
        (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99),
    );
    const total = [...groups.values()].reduce((sum, list) => sum + list.length, 0);
    return (
        <section className="api-index" aria-labelledby="api-index-title">
            <div className="api-index-head">
                <h2 id="api-index-title">All endpoints</h2>
                <p>
                    {total} operations in {tags.length} groups. {spec.info.title} version{' '}
                    {spec.info.version}. Open a group for its endpoints, or use the interactive
                    reference below to try them.
                </p>
            </div>
            <div className="api-index-groups">
                {tags.map((tag) => {
                    const list = groups.get(tag)!;
                    const description = spec.tags?.find((item) => item.name === tag)?.description;
                    return (
                        <details key={tag} className="api-index-group">
                            <summary>
                                <strong>{tag}</strong>
                                <span>{list.length}</span>
                            </summary>
                            {description && <p className="api-index-description">{description}</p>}
                            <ul>
                                {list.map(({ method, path, op }) => (
                                    <li key={`${method} ${path}`}>
                                        <span className={`api-method api-method-${method}`}>
                                            {method.toUpperCase()}
                                        </span>
                                        <code>{path}</code>
                                        {op.summary && (
                                            <span className="api-summary">{op.summary}</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    );
                })}
            </div>
        </section>
    );
}
