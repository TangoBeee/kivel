'use client';
import { useEffect, useState } from 'react';
import { Button, Checkbox, Select, TextArea, TextField } from '@radix-ui/themes';
import { oauthScenarios, validateOAuth, oauthClaimPresets } from '@kivel/tools/oauth';
import type { OAuthConfig, OAuthScenario } from '@kivel/tools/oauth';
import { useViewer } from '../lib/viewer';
import { api } from '../lib/api';
import { ToolHeader } from './tool-header';
import { CopyButton } from './copy-button';
import { CodeExample } from './code-example';
import { MockCalls } from './mock-calls';

const initialUsers = [
    { sub: 'test-user', email: 'alex@example.test', name: 'Alex', claims: { role: 'tester' } },
];
type Provider = {
    id: string;
    issuer: string;
    discoveryUrl: string;
    client_id: string;
    client_secret?: string;
    expiresAt: string;
    oauth: OAuthConfig;
};
export function OAuthWorkbench({ toolId }: { toolId: string }) {
    const viewer = useViewer();
    const [name, setName] = useState('My test provider');
    const [redirects, setRedirects] = useState('http://localhost:3000/auth/callback');
    const [users, setUsers] = useState(JSON.stringify(initialUsers, null, 2));
    const [claims, setClaims] = useState('{}');
    const [headless, setHeadless] = useState(false);
    const [scenario, setScenario] = useState<OAuthScenario>('none');
    const [provider, setProvider] = useState<Provider | null>(null);
    const [busy, setBusy] = useState(false),
        [error, setError] = useState('');
    useEffect(() => {
        setProvider(null);
        if (viewer.status !== 'user') return;
        const id = new URLSearchParams(location.search).get('resource');
        if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return;
        let live = true;
        void api(`/api/oauth-providers/${id}`)
            .then((r) => r.json())
            .then((value: Provider) => {
                if (!live) return;
                setProvider(value);
                setName(value.oauth.name);
                setRedirects(value.oauth.redirectUris.join('\n'));
                setUsers(JSON.stringify(value.oauth.users, null, 2));
                setClaims(JSON.stringify(value.oauth.claims, null, 2));
                setHeadless(value.oauth.headless);
                setScenario(value.oauth.scenario);
            })
            .catch((e) => {
                if (live) setError(e.message);
            });
        return () => {
            live = false;
        };
    }, [viewer.status, viewer.status === 'user' ? viewer.workspace : '']);
    async function save() {
        setBusy(true);
        setError('');
        try {
            const config = validateOAuth({
                name,
                redirectUris: redirects
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                users: JSON.parse(users),
                claims: JSON.parse(claims),
                headless,
                scenario,
            });
            const response = await api(`/api/oauth-providers${provider ? `/${provider.id}` : ''}`, {
                method: provider ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
            if (provider) setProvider({ ...provider, oauth: config });
            else setProvider(await response.json());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to save this provider.');
        } finally {
            setBusy(false);
        }
    }
    async function remove() {
        if (!provider) return;
        setBusy(true);
        setError('');
        try {
            await api(`/api/oauth-providers/${provider.id}`, { method: 'DELETE' });
            setProvider(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to delete this provider.');
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="page-width work-page">
            <ToolHeader
                toolId={toolId}
                description="Test sign in with synthetic users, real protocol responses and controlled failures. No external identity account needed."
            />
            {error && (
                <p className="alert" role="alert">
                    {error}
                </p>
            )}
            <div className="llm-workspace oauth-workspace">
                <form
                    className="email-create-form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                    }}
                >
                    <label className="field-label">
                        Claim preset
                        <Select.Root
                            defaultValue="generic"
                            onValueChange={(value) => {
                                const preset =
                                    oauthClaimPresets[value as keyof typeof oauthClaimPresets];
                                setUsers(
                                    JSON.stringify(
                                        [{ ...initialUsers[0], claims: preset.claims }],
                                        null,
                                        2,
                                    ),
                                );
                            }}
                        >
                            <Select.Trigger aria-label="Claim preset" />
                            <Select.Content>
                                {Object.entries(oauthClaimPresets).map(([value, preset]) => (
                                    <Select.Item key={value} value={value}>
                                        {preset.label}
                                    </Select.Item>
                                ))}
                            </Select.Content>
                        </Select.Root>
                        <span className="field-help">
                            Generic test claims only. Every choice uses the same Kivel test page,
                            without real brand logos or identity accounts.
                        </span>
                    </label>
                    <label className="field-label">
                        Provider name
                        <TextField.Root
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={80}
                            required
                        />
                    </label>
                    <label className="field-label">
                        Allowed redirect URLs
                        <TextArea
                            value={redirects}
                            onChange={(e) => setRedirects(e.target.value)}
                            rows={3}
                            required
                        />
                        <span className="field-help">
                            One exact URL per line. HTTPS, or HTTP on localhost.
                        </span>
                    </label>
                    <label className="field-label">
                        Test users
                        <TextArea
                            value={users}
                            onChange={(e) => setUsers(e.target.value)}
                            rows={10}
                            required
                            spellCheck={false}
                        />
                        <span className="field-help">
                            JSON users with sub, email, name and optional claims. Use synthetic
                            data.
                        </span>
                    </label>
                    <label className="field-label">
                        Shared custom claims
                        <TextArea
                            value={claims}
                            onChange={(e) => setClaims(e.target.value)}
                            rows={3}
                            spellCheck={false}
                        />
                        <span className="field-help">
                            A JSON object. Protocol and identity fields cannot be overridden.
                        </span>
                    </label>
                    <label className="field-label">
                        Failure scenario
                        <Select.Root
                            value={scenario}
                            onValueChange={(v) => setScenario(v as OAuthScenario)}
                        >
                            <Select.Trigger aria-label="Failure scenario" />
                            <Select.Content>
                                {oauthScenarios.map((s) => (
                                    <Select.Item key={s} value={s}>
                                        {s === 'none' ? 'Normal behavior' : s.split('_').join(' ')}
                                    </Select.Item>
                                ))}
                            </Select.Content>
                        </Select.Root>
                    </label>
                    <label className="llm-option">
                        <Checkbox
                            checked={headless}
                            onCheckedChange={(v) => setHeadless(v === true)}
                        />
                        Allow headless test approval with login_hint
                    </label>
                    <p className="field-help">
                        Public test endpoints. Configuration and request logs stay in your
                        workspace. Free includes 1 provider, Pro 10 and Team 50. Starts with one
                        hour of retention.
                    </p>
                    {viewer.status !== 'user' && (
                        <p className="tool-notice">
                            Sign in to create a provider in your workspace.
                        </p>
                    )}
                    <div className="work-actions">
                        <Button type="submit" disabled={busy || viewer.status !== 'user'}>
                            {busy
                                ? 'Saving…'
                                : provider
                                  ? 'Save configuration'
                                  : 'Create test provider'}
                        </Button>
                        {provider && (
                            <Button
                                type="button"
                                variant="soft"
                                color="red"
                                disabled={busy}
                                onClick={() => void remove()}
                            >
                                Delete provider
                            </Button>
                        )}
                    </div>
                </form>
                <section aria-label="Provider connection" className="llm-preview">
                    {provider ? (
                        <>
                            <h2>Connect your app</h2>
                            <p className="field-help">
                                Expires {new Date(provider.expiresAt).toLocaleString()}. Renew from
                                your dashboard or the mock lifecycle API.
                            </p>
                            {[
                                ['Issuer', provider.issuer],
                                ['Discovery URL', provider.discoveryUrl],
                                ['Client ID', provider.client_id],
                                ...(provider.client_secret
                                    ? [['Client secret', provider.client_secret]]
                                    : []),
                            ].map(([label, value]) => (
                                <div key={label} className="field-label">
                                    <span>{label}</span>
                                    <code style={{ overflowWrap: 'anywhere' }}>{value}</code>
                                    <CopyButton
                                        text={value!}
                                        label={`Copy ${label!.toLowerCase()}`}
                                    />
                                </div>
                            ))}
                            <p className="tool-notice">
                                {provider.client_secret
                                    ? 'Save the client secret now. It is only returned at creation.'
                                    : 'The client secret is not shown again. Create a new provider if it was lost.'}
                            </p>
                            <CodeExample
                                title="Client configuration"
                                code={JSON.stringify(
                                    {
                                        issuer: provider.issuer,
                                        client_id: provider.client_id,
                                        scope: 'openid email profile offline_access',
                                        response_type: 'code',
                                        code_challenge_method: 'S256',
                                    },
                                    null,
                                    2,
                                )}
                            />
                            <p className="field-help">
                                Use S256 PKCE. For headless testing enable it, then send prompt=none
                                and login_hint matching a configured email or subject. Immediate
                                redirects are limited to loopback callbacks. Public destinations
                                require Continue on the hosted page. Never use this issuer for real
                                authentication.
                            </p>
                            {scenario === 'rotated_signing_key' && (
                                <p className="tool-notice">
                                    Signing keys rotate at most once per minute. Previous keys stay
                                    published until their tokens expire. Refresh your client’s JWKS
                                    cache when a new key appears.
                                </p>
                            )}
                            <MockCalls id={provider.id} token="" />
                        </>
                    ) : (
                        <>
                            <h2>A test identity service</h2>
                            <p>
                                Set your callback URL and test users, then create the provider to
                                get an issuer and client credentials.
                            </p>
                            <p className="field-help">
                                Supports authorization code with S256 PKCE, client credentials and
                                rotating refresh tokens. The hosted approval page always identifies
                                itself as a Kivel test provider.
                            </p>
                            <a className="text-link" href="/docs/mock-oauth/">
                                Read the OAuth testing guide
                            </a>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}
