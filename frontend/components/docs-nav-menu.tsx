'use client';

import { CaretDown } from '@phosphor-icons/react';
import { useId, useState, type ReactNode } from 'react';

export function DocsNavMenu({ children }: { children: ReactNode }) {
    const id = useId();
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                className="button docs-nav-toggle"
                aria-controls={id}
                aria-expanded={open}
                onClick={() => setOpen(!open)}
            >
                Browse documentation <CaretDown aria-hidden="true" size={16} />
            </button>
            <nav id={id} className="docs-nav" data-open={open} aria-label="Documentation">
                {children}
            </nav>
        </>
    );
}
