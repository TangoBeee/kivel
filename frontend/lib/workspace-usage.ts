'use client';
import { useEffect, useState } from 'react';
import { api } from './api';

/** Everything the dashboard shows next to a limit. Each part may be missing if its request fails. */
export interface WorkspaceUsage {
    runsToday?: number;
    limits?: {
        runsPerDay: number;
        maxResources: number;
        storageBytes: number;
        memoryBytes: number;
        emailInboxes: number;
        authenticators: number;
        oauthProviders: number;
        requestsPerMinute: number;
    };
    agents?: { used: number; limit: number };
    monitors?: { used: number; limit: number };
    authenticators?: { used: number; limit: number };
    email?: { day: number; month: number; perDay: number; perMonth: number };
    memory?: { used: number; limit: number };
}

const get = (path: string) =>
    api(path)
        .then((response) => response.json())
        .catch(() => undefined);

export function useWorkspaceUsage(refreshKey: unknown) {
    const [usage, setUsage] = useState<WorkspaceUsage>({});
    useEffect(() => {
        let live = true;
        void Promise.all([
            get('/api/usage'),
            get('/api/agents'),
            get('/api/monitors'),
            get('/api/authenticators'),
            get('/api/email-sending/usage'),
            get('/api/memory/default'),
        ]).then(([plan, agents, monitors, authenticators, email, memory]) => {
            if (!live) return;
            setUsage({
                runsToday: plan?.runsToday,
                limits: plan?.limits,
                agents: agents && { used: agents.agents.length, limit: agents.limit },
                monitors: monitors && { used: monitors.monitors.length, limit: monitors.limit },
                authenticators: authenticators && {
                    used: authenticators.authenticators.length,
                    limit: authenticators.limit,
                },
                email: email?.perMonth !== undefined ? email : undefined,
                memory: memory && { used: memory.usedBytes, limit: memory.limitBytes },
            });
        });
        return () => {
            live = false;
        };
    }, [refreshKey]);
    return usage;
}

export const formatBytes = (value: number) =>
    value < 1024 * 1024
        ? `${Math.ceil(value / 1024)} KB`
        : value < 1024 * 1024 * 1024
          ? `${Math.round((value / 1048576) * 10) / 10} MB`
          : `${Math.round((value / 1073741824) * 10) / 10} GB`;
