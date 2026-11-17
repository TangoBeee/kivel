'use client';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import type { createApiReference } from '@scalar/api-reference';

declare global {
    interface Window {
        Scalar?: { createApiReference: typeof createApiReference };
    }
}

export function ApiReference() {
    const container = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

    useEffect(() => {
        if (status !== 'ready' || !container.current || !window.Scalar) return;
        const reference = window.Scalar.createApiReference(container.current, {
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
                '.scalar-app { --scalar-font: var(--font-sans), sans-serif; --scalar-font-code: var(--font-geist-mono), monospace; --scalar-color-accent: #141414; --scalar-custom-header-height: 96px; }',
        });
        return () => reference.destroy();
    }, [status]);

    return (
        <>
            <Script
                src="/generated/scalar-reference.js"
                onReady={() => setStatus(window.Scalar ? 'ready' : 'error')}
                onError={() => setStatus('error')}
            />
            {status !== 'ready' && (
                <p className="api-reference-loading" role="status">
                    {status === 'loading' ? (
                        'Loading API reference…'
                    ) : (
                        <>
                            The interactive reference could not load.{' '}
                            <a href="/api/openapi.json">Open the OpenAPI document</a>.
                        </>
                    )}
                </p>
            )}
            <div ref={container} />
        </>
    );
}
