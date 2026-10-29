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
            forceDarkModeState: 'dark',
            hideDarkModeToggle: true,
            withDefaultFonts: false,
            hideClientButton: true,
            showDeveloperTools: 'never',
            persistAuth: false,
            telemetry: false,
            proxyUrl: '',
            searchHotKey: 'j',
            // Scalar's dark palette, matched to the site tokens in base.css.
            customCss: `.scalar-app { --scalar-font: var(--font-geist-sans), sans-serif; --scalar-font-code: var(--font-geist-mono), monospace; --scalar-custom-header-height: 96px; }
.dark-mode { --scalar-background-1: #0b0c0c; --scalar-background-2: #121414; --scalar-background-3: #181a1a; --scalar-background-accent: rgb(107 220 154 / 0.1); --scalar-color-1: #ecedeb; --scalar-color-2: #9a9e9b; --scalar-color-3: #7d817e; --scalar-color-accent: #6bdc9a; --scalar-border-color: rgb(255 255 255 / 0.08); }
.dark-mode .t-doc__sidebar { --scalar-sidebar-background-1: #0b0c0c; --scalar-sidebar-item-hover-background: #181a1a; --scalar-sidebar-item-active-background: rgb(107 220 154 / 0.1); --scalar-sidebar-color-active: #6bdc9a; --scalar-sidebar-border-color: rgb(255 255 255 / 0.08); }`,
        }),
        [],
    );
    return <ApiReferenceReact configuration={configuration} />;
}
