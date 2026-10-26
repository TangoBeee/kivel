'use client';

import { BookmarkSimple } from '@phosphor-icons/react';
import { useSavedTools } from '../lib/saved-tools';

export function SaveToolButton({
    toolId,
    name,
    compact = false,
}: {
    toolId: string;
    name: string;
    compact?: boolean;
}) {
    const { ids, toggle, error } = useSavedTools();
    const saved = ids.includes(toolId);
    return (
        <span className="save-tool-control">
            <button
                type="button"
                className={`save-tool-button ${compact ? 'is-compact' : ''}`}
                aria-label={`${saved ? 'Unsave' : 'Save'} ${name}`}
                aria-pressed={saved}
                title={saved ? 'Remove from saved tools' : 'Save in this browser'}
                onClick={() => toggle(toolId)}
            >
                <BookmarkSimple size={17} weight={saved ? 'fill' : 'regular'} aria-hidden="true" />
                {!compact && (saved ? 'Saved' : 'Save tool')}
            </button>
            {error && (
                <span className="save-tool-error" role="alert">
                    {error}
                </span>
            )}
        </span>
    );
}
