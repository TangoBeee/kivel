'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { appLink, workspaceHref, type WorkspacePanel } from '../lib/app-routes';

export function OpenWorkspaceTool({ panel, tool }: { panel: WorkspacePanel; tool: string }) {
    const resource = useSearchParams().get('resource') ?? undefined;
    return (
        <Link
            className="button button-primary"
            href={appLink(workspaceHref(panel, { resource, tool }))}
        >
            Open in Kivel
        </Link>
    );
}
