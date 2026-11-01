import Link from 'next/link';
import { ToolCapabilityNotice } from './toolbox-provider';
import { Icon } from './icons';
import { ReturnLink } from './return-link';
import { SaveToolButton } from './save-tool-button';
import { catalog, categories, categoryHref, categoryTints } from '../lib/catalog';

// The heading every tool page starts with: where you are, what this tool is, and its page actions.
export function ToolHeader({
    toolId,
    title,
    description,
    children,
}: {
    toolId: string;
    title?: string;
    description?: string;
    children?: React.ReactNode;
}) {
    const tool = catalog.find((entry) => entry.id === toolId)!;
    const category = categories.find((entry) => entry.id === tool.categoryId)!;
    return (
        <header className="tool-header">
            <ReturnLink toolId={toolId} />
            <nav className="breadcrumb" aria-label="Breadcrumb">
                <Link href="/catalog/">Explore tools</Link>
                <Icon name="chevron" size={12} />
                <Link href={categoryHref(category.id)}>{category.name}</Link>
                <Icon name="chevron" size={12} />
                <span aria-current="page">{tool.name}</span>
            </nav>
            <div className="tool-header-main">
                <span
                    className="tool-header-icon"
                    style={{ '--tint': categoryTints[category.id] } as React.CSSProperties}
                >
                    <Icon name={tool.icon} size={24} />
                </span>
                <div className="tool-header-copy">
                    <h1>
                        {title && title !== tool.name ? (
                            <>
                                <span className="tool-title-pitch">{title}</span>
                                <span className="tool-title-name">{tool.name}</span>
                            </>
                        ) : (
                            tool.name
                        )}
                    </h1>
                    <p>{description ?? tool.description}</p>
                </div>
                <div className="tool-header-actions">
                    {tool.minimumPlan && tool.minimumPlan !== 'free' && (
                        <Link className="text-link" href="/plans/">
                            {tool.minimumPlan === 'pro' ? 'Pro' : 'Team'} · View plans
                        </Link>
                    )}
                    {children}
                    {tool.status === 'available' && (
                        <SaveToolButton toolId={tool.id} name={tool.name} />
                    )}
                </div>
            </div>
            <ToolCapabilityNotice toolId={toolId} />
        </header>
    );
}
