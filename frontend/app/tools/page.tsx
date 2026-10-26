'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { BrowserWorkbench } from '../../components/browser-workbench';
import { tools } from '../../lib/tools';
function LegacyWorkbench() {
    const requested = useSearchParams().get('tool');
    return (
        <BrowserWorkbench
            toolId={tools.some((tool) => tool.local && tool.id === requested) ? requested! : 'json'}
        />
    );
}
export default function UtilitiesPage() {
    return (
        <Suspense
            fallback={
                <div className="page-width work-page" role="status">
                    Loading browser tools…
                </div>
            }
        >
            <LegacyWorkbench />
        </Suspense>
    );
}
