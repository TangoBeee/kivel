'use client';
import { useMemo } from 'react';
import { ApiReferenceReact } from '@scalar/api-reference-react';
import type { AnyApiReferenceConfiguration } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
export default function ScalarReference() {
    const configuration = useMemo<AnyApiReferenceConfiguration>(
        () => ({
            url: '/api/openapi.json',
            agent: { disabled: true },
            servers: [{ url: window.location.origin, description: 'This instance' }],
            theme: 'default',
            layout: 'modern',
            darkMode: true,
            hideDarkModeToggle: true,
            withDefaultFonts: false,
            hideClientButton: true,
            showDeveloperTools: 'never',
            persistAuth: false,
            telemetry: false,
            proxyUrl: '',
            searchHotKey: 'j',
            customCss:
                '.scalar-app { --scalar-font: var(--font-sans), sans-serif; --scalar-font-code: var(--font-geist-mono), monospace; --scalar-color-accent: var(--info); --scalar-background-1: var(--bg); --scalar-background-2: var(--surface-1); --scalar-background-3: var(--surface-2); --scalar-color-1: var(--text); --scalar-color-2: var(--text-2); --scalar-color-3: var(--text-3); --scalar-custom-header-height: 96px; }',
        }),
        [],
    );
    return <ApiReferenceReact configuration={configuration} />;
}
