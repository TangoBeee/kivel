'use client';

import { useEffect } from 'react';
import { appLink, legacyWorkspaceLink } from '../lib/app-routes';

export function LegacyWorkspaceBridge() {
    useEffect(() => {
        location.replace(legacyWorkspaceLink(location.search, location.hash));
    }, []);
    return (
        <div className="page-width not-found">
            <h1>Your workspace has moved</h1>
            <a className="button button-primary" href={appLink()}>
                Open app
            </a>
        </div>
    );
}
