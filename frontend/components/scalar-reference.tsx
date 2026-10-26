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
            darkMode: false,
            hideDarkModeToggle: true,
            withDefaultFonts: false,
            hideClientButton: true,
            showDeveloperTools: 'never',
            persistAuth: false,
            telemetry: false,
            proxyUrl: '',
            searchHotKey: 'j',
            customCss:
                '.scalar-app { --scalar-font: var(--font-geist-sans), sans-serif; --scalar-font-code: var(--font-geist-mono), monospace; --scalar-color-accent: #286747; --scalar-custom-header-height: 96px; }',
        }),
        [],
    );
    return <ApiReferenceReact configuration={configuration} />;
}
