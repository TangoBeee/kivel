'use client';

import { useEffect, useState } from 'react';
import { Button, Switch, TextArea } from '@radix-ui/themes';
import { api } from '../lib/api';

const fields = {
    inboundAllow: 'Inbound allowlist',
    inboundBlock: 'Inbound blocklist',
    outboundAllow: 'Outbound allowlist',
    outboundBlock: 'Outbound blocklist',
};
const names = Object.keys(fields) as (keyof typeof fields)[];

export function EmailInboxRules({
    id,
    canEdit,
    onApprovalChange,
}: {
    id: string;
    canEdit: boolean;
    onApprovalChange: (required: boolean) => void;
}) {
    const [values, setValues] = useState<Record<string, string>>({});
    const [requireApproval, setRequireApproval] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const url = `/api/email-inboxes/${id}/rules`;
    useEffect(() => {
        const controller = new AbortController();
        void api(url, { signal: controller.signal })
            .then((response) => response.json())
            .then(({ rules }) => {
                if (controller.signal.aborted) return;
                setValues(Object.fromEntries(names.map((name) => [name, rules[name].join('\n')])));
                setRequireApproval(rules.requireApproval === true);
                onApprovalChange(rules.requireApproval === true);
                setLoaded(true);
            })
            .catch((failure: Error) => {
                if (!controller.signal.aborted) setError(failure.message);
            });
        return () => controller.abort();
    }, [url, onApprovalChange]);

    async function save() {
        setBusy(true);
        setNotice('');
        setError('');
        try {
            await api(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requireApproval,
                    ...Object.fromEntries(
                        names.map((name) => [
                            name,
                            values[name]
                                ?.split(/\r?\n/)
                                .map((item) => item.trim())
                                .filter(Boolean) ?? [],
                        ]),
                    ),
                }),
            });
            onApprovalChange(requireApproval);
            setNotice('Inbox rules saved.');
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to save rules.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <details className="connection-details">
            <summary>Inbox rules</summary>
            <form
                className="email-create-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                }}
            >
                <p className="muted">
                    Enter one email address or exact domain per line. Blocklists take priority. An
                    empty allowlist allows any address that isn’t blocked.
                </p>
                <label>
                    Require human approval
                    <Switch
                        checked={requireApproval}
                        disabled={!canEdit || !loaded}
                        onCheckedChange={setRequireApproval}
                        aria-label="Require human approval"
                    />
                    <small>Send only drafts an owner or admin has approved.</small>
                </label>
                {names.map((name) => (
                    <label key={name}>
                        {fields[name]}
                        <TextArea
                            rows={2}
                            value={values[name] ?? ''}
                            readOnly={!canEdit}
                            disabled={!loaded}
                            placeholder="example.com"
                            onChange={(event) =>
                                setValues({ ...values, [name]: event.target.value })
                            }
                        />
                    </label>
                ))}
                {canEdit && (
                    <Button type="submit" disabled={busy || !loaded}>
                        Save inbox rules
                    </Button>
                )}
                {notice && <p role="status">{notice}</p>}
                {error && <p role="alert">{error}</p>}
            </form>
        </details>
    );
}
