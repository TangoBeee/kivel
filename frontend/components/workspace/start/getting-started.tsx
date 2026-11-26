'use client';
import { useState } from 'react';
import { BracketsCurly, Check, EnvelopeSimple, LockKey, WebhooksLogo } from '@phosphor-icons/react';
import { siteOrigin } from '../../../lib/site';
import { setupPrompt } from '../../../lib/setup-prompt';
import { Button, CopyButton, LiveDot, LogoTile, Segmented, cx } from '../ui';
import { usePoll } from '../use-poll';
import { clients, examples, type ClientId } from './clients';
import styles from './getting-started.module.css';

const exampleIcons = {
    signup: <EnvelopeSimple color="#d6336c" />,
    webhook: <WebhooksLogo color="#2f6bff" />,
    mock: <BracketsCurly color="#7c4ddb" />,
    totp: <LockKey color="#5b6472" />,
};

type Agent = { id: string; name: string };

/** First run: a three step checklist that ticks itself off from real workspace data. */
export interface Reminder {
    title: string;
    detail: string;
    action: string;
    onAction: () => void;
}

export function GettingStarted({
    name,
    workspace,
    reminder,
}: {
    name: string;
    workspace: string;
    /** Account housekeeping that should not wait, such as verifying the recovery email. */
    reminder?: Reminder;
}) {
    const [client, setClient] = useState<ClientId>('claude-code');
    const agents = usePoll(
        '/api/agents',
        4000,
        (body) => (body as { agents?: Agent[] }).agents ?? [],
    );
    const activity = usePoll(
        '/api/account/activity',
        8000,
        (body) => ((body as { activity?: unknown[] }).activity ?? []).length,
    );
    const connected = agents.data?.[0];
    const tried = (activity.data ?? 0) > 0;
    const done = 1 + (connected ? 1 : 0) + (tried ? 1 : 0);
    const current = clients.find((entry) => entry.id === client)!;
    return (
        <div className={styles.page}>
            <header className={styles.intro}>
                <h1>Welcome to Kivel, {name}</h1>
                <p>Connect an agent and it can use every tool in your catalog.</p>
                <div className={styles.progress} aria-label={`${done} of 3 steps done`}>
                    <span>
                        <i style={{ width: `${(done / 3) * 100}%` }} />
                    </span>
                    {done} of 3 done
                </div>
            </header>
            {reminder && (
                <div className={styles.reminder} role="note">
                    <span>
                        <b>{reminder.title}</b>
                        <small>{reminder.detail}</small>
                    </span>
                    <Button size="sm" onClick={reminder.onAction}>
                        {reminder.action}
                    </Button>
                </div>
            )}
            <ol className={styles.steps}>
                <Step done title="Create your workspace" detail={`${workspace} is ready.`} />
                <Step
                    done={Boolean(connected)}
                    title="Connect your agent"
                    detail="One prompt. Your agent asks to join and you approve it in the browser."
                    hint="2 min"
                >
                    <Segmented
                        label="Your agent"
                        options={clients.map(({ id, label }) => ({ value: id, label }))}
                        value={client}
                        onChange={setClient}
                    />
                    <div className={styles.code}>
                        <code>Set up Kivel for me ({siteOrigin})</code>
                        <CopyButton value={setupPrompt} label="Copy prompt" />
                    </div>
                    <p className={styles.small}>
                        Paste it into your agent’s chat. It copies the full setup prompt.
                    </p>
                    <div className={styles.manual}>
                        <span>{current.where}</span>
                        <div className={styles.code}>
                            <code>{current.manual}</code>
                            <CopyButton value={current.manual} />
                        </div>
                    </div>
                    <div className={cx(styles.wait, connected && styles.waitDone)} role="status">
                        <LiveDot done={Boolean(connected)} />
                        {connected
                            ? `${connected.name} is connected.`
                            : 'Waiting for your agent. This updates by itself.'}
                    </div>
                </Step>
                <Step
                    done={tried}
                    title="Try your first tool"
                    detail="Copy one of these and send it to your agent."
                    hint="1 min"
                >
                    <ul className={styles.examples}>
                        {examples.map((example) => (
                            <li key={example.id}>
                                <LogoTile>
                                    {exampleIcons[example.id as keyof typeof exampleIcons]}
                                </LogoTile>
                                <span>
                                    <b>{example.title}</b>
                                    <small>{example.detail}</small>
                                </span>
                                <CopyButton value={example.prompt} />
                            </li>
                        ))}
                    </ul>
                </Step>
            </ol>
        </div>
    );
}

function Step({
    done,
    title,
    detail,
    hint,
    children,
}: {
    done: boolean;
    title: string;
    detail: string;
    hint?: string;
    children?: React.ReactNode;
}) {
    return (
        <li className={styles.step} data-done={done || undefined}>
            <div className={styles.stepHead}>
                <span className={styles.check} aria-hidden="true">
                    {done && <Check size={11} weight="bold" />}
                </span>
                <span>
                    <b>
                        {title}
                        <span className="sr-only">{done ? ', done' : ', to do'}</span>
                    </b>
                    <small>{detail}</small>
                </span>
                <span className={styles.hint}>{done ? 'Done' : hint}</span>
            </div>
            {children && !done && <div className={styles.stepBody}>{children}</div>}
        </li>
    );
}
