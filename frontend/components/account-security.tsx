'use client';
import { Button, TextField } from '@radix-ui/themes';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { clearPrivateSession } from '../lib/private-session';

async function send(path: string, body: unknown) {
    const result = await api(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return result.status === 204 ? undefined : result.json();
}
export function PasswordRecovery({ onBack }: { onBack: () => void }) {
    const [email, setEmail] = useState(''),
        [sent, setSent] = useState(false),
        [done, setDone] = useState(false),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(''),
        [notice, setNotice] = useState('');
    return (
        <section className="account-card account-auth-card">
            <button className="text-link account-back" onClick={onBack}>
                ← Back to sign in
            </button>
            <h2>
                {done ? 'Password updated' : sent ? 'Check your email' : 'Forgot your password?'}
            </h2>
            <p>
                {done
                    ? 'Your old sessions and API keys have been revoked. Sign in with your new password.'
                    : sent
                      ? 'Enter the eight-digit code from your email and choose a new password. Codes expire after 15 minutes.'
                      : 'Enter your verified recovery email to receive a reset code.'}
            </p>
            {error && (
                <p className="account-message error" role="alert">
                    {error}
                </p>
            )}
            {notice && (
                <p className="account-message" role="status">
                    {notice}
                </p>
            )}
            {done ? (
                <button className="button button-primary" onClick={onBack}>
                    Sign in
                </button>
            ) : (
                <form
                    className="account-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const form = event.currentTarget,
                            data = new FormData(form);
                        setBusy(true);
                        setError('');
                        setNotice('');
                        void (async () => {
                            if (sent) {
                                if (data.get('password') !== data.get('confirmation'))
                                    throw new Error('Passwords do not match.');
                                await send('/api/auth/password/reset', {
                                    email,
                                    code: data.get('code'),
                                    password: data.get('password'),
                                });
                                clearPrivateSession();
                                form.reset();
                                setDone(true);
                            } else {
                                const result = await send('/api/auth/password/forgot', { email });
                                setSent(true);
                                setNotice(result.message);
                            }
                        })()
                            .catch((failure) =>
                                setError(
                                    failure instanceof Error
                                        ? failure.message
                                        : 'Unable to reset your password.',
                                ),
                            )
                            .finally(() => setBusy(false));
                    }}
                >
                    <label>
                        Recovery email
                        <TextField.Root
                            size="3"
                            type="email"
                            name="email"
                            autoComplete="email"
                            maxLength={254}
                            required
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            readOnly={sent}
                        />
                    </label>
                    {sent && (
                        <>
                            <label>
                                Email code
                                <TextField.Root
                                    size="3"
                                    name="code"
                                    autoComplete="one-time-code"
                                    inputMode="numeric"
                                    pattern="[0-9]{8}"
                                    maxLength={8}
                                    required
                                />
                            </label>
                            <label>
                                New password
                                <TextField.Root
                                    size="3"
                                    type="password"
                                    name="password"
                                    autoComplete="new-password"
                                    minLength={12}
                                    maxLength={256}
                                    required
                                />
                            </label>
                            <label>
                                Confirm password
                                <TextField.Root
                                    size="3"
                                    type="password"
                                    name="confirmation"
                                    autoComplete="new-password"
                                    minLength={12}
                                    maxLength={256}
                                    required
                                />
                            </label>
                            <p className="account-form-note">
                                Use at least 12 characters. Resetting signs out every session and
                                revokes your API keys.
                            </p>
                        </>
                    )}
                    <button className="button button-primary" disabled={busy}>
                        {busy ? 'One moment…' : sent ? 'Reset password' : 'Send reset code'}
                    </button>
                    {sent && (
                        <button
                            type="button"
                            className="text-link"
                            disabled={busy}
                            onClick={() => {
                                setSent(false);
                                setNotice('');
                                setError('');
                            }}
                        >
                            Use another email or request a new code
                        </button>
                    )}
                </form>
            )}
        </section>
    );
}
type Recovery = {
    email: string | null;
    pendingEmail: string | null;
    verifiedAt: string | null;
    enabled: boolean;
};
export function AccountSecurity({ onVerified }: { onVerified: () => Promise<void> }) {
    const [editingEmail, setEditingEmail] = useState(false);
    const [status, setStatus] = useState<Recovery>(),
        [error, setError] = useState(''),
        [notice, setNotice] = useState(''),
        [busy, setBusy] = useState(false);
    const refresh = async () => setStatus(await (await api('/api/account/recovery')).json());
    useEffect(() => {
        void refresh().catch(() => setError('Unable to load recovery settings.'));
    }, []);
    return (
        <section className="account-card" aria-labelledby="account-security-title">
            <div className="account-section-heading">
                <div>
                    <h2 id="account-security-title">Recovery email</h2>
                    <p>A verified email helps you recover your account.</p>
                </div>
            </div>
            {error && (
                <p className="account-message error" role="alert">
                    {error}
                </p>
            )}
            {notice && (
                <p className="account-message" role="status">
                    {notice}
                </p>
            )}
            {!status ? (
                <p role="status">Loading recovery settings…</p>
            ) : (
                <>
                    {status.email && (
                        <p className="account-verified">
                            <strong>{status.email}</strong>
                            <span className={`badge ${status.verifiedAt ? 'badge-green' : ''}`}>
                                {status.verifiedAt ? 'Verified' : 'Not verified'}
                            </span>
                        </p>
                    )}
                    {!status.enabled ? (
                        <p>Email delivery setup is pending for this installation.</p>
                    ) : (
                        <>
                            {status.pendingEmail && (
                                <form
                                    className="account-inline-form"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        const data = new FormData(event.currentTarget);
                                        setBusy(true);
                                        setError('');
                                        setNotice('');
                                        void send('/api/account/email/verify', {
                                            code: data.get('code'),
                                        })
                                            .then(async () => {
                                                await refresh();
                                                await onVerified();
                                                setNotice('Recovery email verified.');
                                            })
                                            .catch((failure) =>
                                                setError(
                                                    failure instanceof Error
                                                        ? failure.message
                                                        : 'Unable to verify email.',
                                                ),
                                            )
                                            .finally(() => setBusy(false));
                                    }}
                                >
                                    <label>
                                        Code sent to {status.pendingEmail}
                                        <TextField.Root
                                            size="3"
                                            name="code"
                                            autoComplete="one-time-code"
                                            inputMode="numeric"
                                            pattern="[0-9]{8}"
                                            maxLength={8}
                                            required
                                        />
                                    </label>
                                    <button className="button button-primary" disabled={busy}>
                                        Verify email
                                    </button>
                                </form>
                            )}
                            <div className="account-email-editor">
                                {(status.pendingEmail || status.verifiedAt) && (
                                    <Button
                                        variant="soft"
                                        onClick={() => setEditingEmail((value) => !value)}
                                    >
                                        {status.pendingEmail
                                            ? 'Request another code or change email'
                                            : 'Change recovery email'}
                                    </Button>
                                )}
                                {(editingEmail || (!status.pendingEmail && !status.verifiedAt)) && (
                                    <form
                                        className="account-inline-form"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            const form = event.currentTarget,
                                                data = new FormData(form);
                                            setBusy(true);
                                            setError('');
                                            setNotice('');
                                            void send('/api/account/email', {
                                                email: data.get('email'),
                                                password: data.get('password'),
                                            })
                                                .then(async (result) => {
                                                    form.reset();
                                                    await refresh();
                                                    setNotice(result.message);
                                                })
                                                .catch((failure) =>
                                                    setError(
                                                        failure instanceof Error
                                                            ? failure.message
                                                            : 'Unable to update recovery email.',
                                                    ),
                                                )
                                                .finally(() => setBusy(false));
                                        }}
                                    >
                                        <label>
                                            Recovery email
                                            <TextField.Root
                                                size="3"
                                                type="email"
                                                name="email"
                                                defaultValue={status.email ?? ''}
                                                autoComplete="email"
                                                maxLength={254}
                                                required
                                            />
                                        </label>
                                        <label>
                                            Current password
                                            <TextField.Root
                                                size="3"
                                                type="password"
                                                name="password"
                                                autoComplete="current-password"
                                                minLength={12}
                                                maxLength={256}
                                                required
                                            />
                                        </label>
                                        <button className="button button-primary" disabled={busy}>
                                            {busy ? 'Sending…' : 'Send verification code'}
                                        </button>
                                    </form>
                                )}
                            </div>
                        </>
                    )}
                </>
            )}
        </section>
    );
}
