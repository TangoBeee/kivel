'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { RemoteFilePreview } from './file-preview';
export function SharedFile() {
    const [id, setId] = useState(''),
        [token, setToken] = useState(''),
        [submitted, setSubmitted] = useState(''),
        [info, setInfo] = useState<{
            name: string;
            size: number;
            visibility: string;
            expiresAt: string;
        } | null>(null),
        [error, setError] = useState(''),
        [busy, setBusy] = useState(true);
    const currentId = useRef('');
    useEffect(() => {
        const readLocation = () => {
            const url = new URL(location.href),
                resourceId = url.searchParams.get('id') ?? '';
            if (currentId.current !== resourceId) {
                currentId.current = resourceId;
                setId(resourceId);
                setToken('');
                setSubmitted('');
            }
            if (url.hash) history.replaceState(null, '', `${location.pathname}${location.search}`);
        };
        readLocation();
        addEventListener('hashchange', readLocation);
        addEventListener('popstate', readLocation);
        return () => {
            removeEventListener('hashchange', readLocation);
            removeEventListener('popstate', readLocation);
        };
    }, []);
    useEffect(() => {
        if (!id) {
            setBusy(false);
            return;
        }
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
            setError('This file link is invalid.');
            setBusy(false);
            return;
        }
        const controller = new AbortController();
        setBusy(true);
        setInfo(null);
        setError('');
        void api(`/files/${id}/info`, {
            signal: controller.signal,
            headers: submitted ? { 'X-Access-Token': submitted } : {},
        })
            .then((response) => response.json())
            .then((value) => {
                if (!controller.signal.aborted) setInfo(value);
            })
            .catch(() => {
                if (!controller.signal.aborted && submitted)
                    setError(
                        'This file requires a valid access token, has expired, or is unavailable.',
                    );
            })
            .finally(() => {
                if (!controller.signal.aborted) setBusy(false);
            });
        return () => controller.abort();
    }, [id, submitted]);
    return (
        <div className="page-width work-page">
            <header className="account-heading">
                <div>
                    <span className="eyebrow">File sharing</span>
                    <h1>{info?.name ?? 'A file, shared with you.'}</h1>
                    <p>
                        {info
                            ? `${info.visibility === 'private' ? 'Private sharing' : 'Public sharing'} · ${info.size.toLocaleString()} bytes · Expires ${new Date(info.expiresAt).toLocaleString()}`
                            : 'Ask the owner for the access token separately. The file link alone does not grant private access.'}
                    </p>
                </div>
            </header>
            {busy && <p role="status">Checking access…</p>}
            {error && (
                <p role="alert" className="alert">
                    {error}
                </p>
            )}
            {!busy && !info && (
                <form
                    className="share-access"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setSubmitted(token.trim());
                    }}
                >
                    <label htmlFor="share-access-token">Access token</label>
                    <input
                        id="share-access-token"
                        type="password"
                        autoComplete="off"
                        value={token}
                        onChange={(event) => setToken(event.target.value)}
                        maxLength={43}
                        required
                    />
                    <button className="button button-primary">Open private file</button>
                </form>
            )}
            {info && (
                <RemoteFilePreview id={id} name={info.name} accessToken={submitted || undefined} />
            )}
        </div>
    );
}
