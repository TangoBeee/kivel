'use client';
import { useEffect, useState } from 'react';
import { api } from './api';
import type { UsageItem, UsageKey, UsageResponse } from '@kivel.io/tools/plans';

/** Everything the dashboard shows next to a limit. Each part may be missing if its request fails. */
export interface WorkspaceUsage {
    plan?: UsageResponse['plan'];
    runsToday?: number;
    items?: UsageItem[];
    error?: string;
    limits?: {
        runsPerDay: number;
        memoryBytes: number;
        emailInboxes: number;
        authenticators: number;
        credentials: number;
        oauthProviders: number;
        requestsPerMinute: number;
    };
    agents?: { used: number; limit: number };
    monitors?: { used: number; limit: number };
    authenticators?: { used: number; limit: number };
    vault?: { used: number; limit: number };
    email?: { day: number; month: number; perDay: number; perMonth: number };
    memory?: { used: number; limit: number };
}

export function useWorkspaceUsage(
    workspaceId: string | undefined,
    refreshKey: unknown,
    revision: number,
) {
    const [snapshot, setSnapshot] = useState<{ workspaceId: string; usage: WorkspaceUsage }>();
    useEffect(() => {
        if (!workspaceId) return;
        const controller = new AbortController();
        void api('/api/usage', { signal: controller.signal })
            .then((response) => response.json() as Promise<UsageResponse>)
            .then((response) => {
                if (controller.signal.aborted) return;
                const items = new Map(response.items.map((item) => [item.key, item]));
                const meter = (key: UsageKey) => {
                    const item = items.get(key);
                    return item && { used: item.used, limit: item.max };
                };
                const day = items.get('email.sent_today');
                const month = items.get('email.sent_month');
                setSnapshot({
                    workspaceId,
                    usage: {
                        plan: response.plan,
                        runsToday: response.runsToday,
                        limits: response.limits,
                        items: response.items,
                        agents: meter('agents.connected'),
                        monitors: meter('monitors.active'),
                        authenticators: meter('authenticators.entries'),
                        vault: meter('vault.entries'),
                        email: day &&
                            month && {
                                day: day.used,
                                month: month.used,
                                perDay: day.max,
                                perMonth: month.max,
                            },
                        memory: meter('memory.bytes'),
                    },
                });
            })
            .catch(() => {
                if (!controller.signal.aborted)
                    setSnapshot({
                        workspaceId,
                        usage: { error: 'Usage is unavailable. Refresh to try again.' },
                    });
            });
        return () => controller.abort();
    }, [workspaceId, refreshKey, revision]);
    return snapshot?.workspaceId === workspaceId ? (snapshot?.usage ?? {}) : {};
}

export const formatBytes = (value: number) =>
    value < 1024 * 1024
        ? `${Math.ceil(value / 1024)} KB`
        : value < 1024 * 1024 * 1024
          ? `${Math.round((value / 1048576) * 10) / 10} MB`
          : `${Math.round((value / 1073741824) * 10) / 10} GB`;
