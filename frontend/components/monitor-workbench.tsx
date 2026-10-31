'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ToolHeader } from './tool-header';
import { MonitorsPanel } from './monitors-panel';
import { useViewer } from '../lib/viewer';
import { api } from '../lib/api';
export function MonitorWorkbench({ toolId }: { toolId: string }) {
    const viewer = useViewer();
    const [verified, setVerified] = useState(false);
    useEffect(() => {
        if (viewer.status !== 'user') return;
        let live = true;
        void api('/api/account/recovery')
            .then((response) => response.json())
            .then((value) => {
                if (live) setVerified(Boolean(value.verifiedAt));
            })
            .catch(() => {});
        return () => {
            live = false;
        };
    }, [viewer.status]);
    return (
        <div className="page-width work-page">
            <ToolHeader toolId={toolId} />
            {viewer.status === 'guest' ? (
                <div className="dashboard-empty">
                    <h2>Keep an eye on your services.</h2>
                    <p>
                        Free includes 20 monitors with checks every five minutes or slower. Alerts
                        use the owner’s verified email or a configured webhook.
                    </p>
                    <Link className="button" href="/account/#register">
                        Create a free account
                    </Link>
                </div>
            ) : viewer.status === 'loading' ? (
                <p role="status">Loading your workspace…</p>
            ) : (
                <MonitorsPanel
                    verifiedEmail={verified}
                    initialKind={
                        toolId.includes('certificate')
                            ? 'ssl'
                            : toolId.includes('dns-monitor')
                              ? 'dns'
                              : 'http'
                    }
                />
            )}
        </div>
    );
}
