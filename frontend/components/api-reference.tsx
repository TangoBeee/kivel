'use client';
import dynamic from 'next/dynamic';
const Reference = dynamic(() => import('./scalar-reference'), {
    ssr: false,
    loading: () => (
        <p className="api-reference-loading" role="status">
            Loading API reference…
        </p>
    ),
});
export function ApiReference() {
    return <Reference />;
}
