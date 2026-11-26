'use client';
import { useState } from 'react';
import { activityLabel, timeAgo } from '../../../lib/activity-labels';
import { PageHeader } from '../shell/page-header';
import { Chip, ChipRow, ListEmpty } from '../ui';
import { usePoll } from '../use-poll';
import styles from './activity-page.module.css';

interface Entry {
    at: string;
    tool: string;
    ok: boolean;
    durationMs: number;
    keyId?: string;
}

const pickActivity = (body: unknown) =>
    ((body as { activity?: Entry[] }).activity ?? []) as Entry[];

function duration(ms: number) {
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/** Every call agents made in this workspace, newest first, refreshed every few seconds. */
export function ActivityPage({ keys }: { keys: { id: string; name: string }[] }) {
    const [failedOnly, setFailedOnly] = useState(false);
    const { data, error } = usePoll('/api/account/activity', 5000, pickActivity);
    const entries = (data ?? []).filter((entry) => entry.tool !== 'workspace_status');
    const failed = entries.filter((entry) => !entry.ok).length;
    const shown = failedOnly ? entries.filter((entry) => !entry.ok) : entries;
    const keyName = (id?: string) => keys.find((key) => key.id === id)?.name ?? 'Workspace key';
    return (
        <>
            <PageHeader
                title="Activity"
                description="Every call your agents made, newest first."
                actions={
                    <ChipRow label="Filter activity">
                        <Chip
                            pressed={!failedOnly}
                            count={entries.length}
                            onClick={() => setFailedOnly(false)}
                        >
                            All
                        </Chip>
                        <Chip
                            pressed={failedOnly}
                            count={failed}
                            onClick={() => setFailedOnly(true)}
                        >
                            Failed
                        </Chip>
                    </ChipRow>
                }
            />
            <div className={styles.table} role="table" aria-label="Agent calls">
                <div className={styles.head} role="row">
                    <span role="columnheader">When</span>
                    <span role="columnheader">Agent</span>
                    <span role="columnheader">What it did</span>
                    <span role="columnheader">Status</span>
                    <span role="columnheader" className={styles.num}>
                        Time
                    </span>
                </div>
                {data === null && !error && <ListEmpty>Loading activity…</ListEmpty>}
                {error && data === null && (
                    <ListEmpty>Activity could not be loaded. It retries by itself.</ListEmpty>
                )}
                {data !== null && shown.length === 0 && (
                    <ListEmpty>
                        {failedOnly
                            ? 'No failed calls. Nice.'
                            : 'No calls yet. They show up here as your agents work.'}
                    </ListEmpty>
                )}
                {shown.map((entry, index) => (
                    <div key={`${entry.at}-${index}`} className={styles.row} role="row">
                        <span role="cell" className={styles.when}>
                            {timeAgo(entry.at)}
                        </span>
                        <span role="cell" className={styles.agent}>
                            {keyName(entry.keyId)}
                        </span>
                        <span role="cell" className={styles.what}>
                            {activityLabel(entry.tool)}
                            <code>{entry.tool}</code>
                        </span>
                        <span role="cell" className={entry.ok ? styles.ok : styles.bad}>
                            <i aria-hidden="true" />
                            {entry.ok ? 'Succeeded' : 'Failed'}
                        </span>
                        <span role="cell" className={styles.num}>
                            {duration(entry.durationMs)}
                        </span>
                    </div>
                ))}
            </div>
        </>
    );
}
