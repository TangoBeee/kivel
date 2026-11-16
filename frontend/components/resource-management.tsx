'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Button, DropdownMenu, IconButton } from '@radix-ui/themes';
import { ArrowsClockwise, Clock, DotsThree, Lightning } from '@phosphor-icons/react';
import { timeLeft } from '../lib/activity-labels';

export type ResourceDetailTab = 'manage' | 'response' | 'activity';

export function ResourceManagement({
    name,
    expiresAt,
    persistent,
    busy,
    onRenew,
    onTogglePersistent,
    onDetails,
    children,
}: {
    name: string;
    expiresAt?: string;
    persistent: boolean;
    busy: boolean;
    onRenew?: () => void;
    onTogglePersistent?: () => void;
    onDetails(tab: ResourceDetailTab): void;
    children?: ReactNode;
}) {
    const [now, setNow] = useState(0);
    const expiry = expiresAt ? Date.parse(expiresAt) : NaN;
    useEffect(() => {
        if (!Number.isFinite(expiry) || persistent) return;
        const update = () => setNow(Date.now());
        update();
        const timer = setInterval(update, 15_000);
        return () => clearInterval(timer);
    }, [expiry, persistent]);
    const expired = now > 0 && expiry <= now;
    const remaining = expiry - now;
    const countdown =
        remaining >= 86400_000 * 30
            ? `in ${Math.ceil(remaining / 86400_000)} days`
            : expiresAt && timeLeft(expiresAt, now);
    return (
        <section className="dashboard-resource-management" aria-label="Resource details">
            <div className="resource-management-row">
                <div className="resource-management-summary">
                    <strong>{name}</strong>
                    <span
                        className="resource-expiry-chip"
                        data-expired={expired}
                        title={
                            Number.isFinite(expiry) && !persistent
                                ? new Date(expiry).toLocaleString()
                                : undefined
                        }
                    >
                        <Clock size={14} aria-hidden />
                        {persistent
                            ? 'Kept active'
                            : !Number.isFinite(expiry)
                              ? 'Active'
                              : expired
                                ? 'Expired'
                                : now
                                  ? `Expires ${countdown}`
                                  : 'Expires soon'}
                    </span>
                </div>
                <div className="resource-management-actions">
                    {onRenew && (
                        <Button
                            type="button"
                            size="2"
                            variant="surface"
                            color="gray"
                            disabled={busy}
                            onClick={onRenew}
                        >
                            <ArrowsClockwise size={15} aria-hidden /> Renew
                        </Button>
                    )}
                    {onTogglePersistent && (
                        <Button
                            type="button"
                            size="2"
                            variant={persistent ? 'surface' : 'soft'}
                            disabled={busy}
                            aria-pressed={persistent}
                            onClick={onTogglePersistent}
                        >
                            <Lightning size={15} aria-hidden />{' '}
                            {persistent ? 'Use expiry' : 'Keep active'}
                        </Button>
                    )}
                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger>
                            <IconButton
                                type="button"
                                size="2"
                                variant="surface"
                                color="gray"
                                disabled={busy}
                                aria-label="Resource options"
                            >
                                <DotsThree size={20} weight="bold" aria-hidden />
                            </IconButton>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content align="end">
                            <DropdownMenu.Item onSelect={() => onDetails('manage')}>
                                Manage access
                            </DropdownMenu.Item>
                            <DropdownMenu.Item onSelect={() => onDetails('response')}>
                                Technical details
                            </DropdownMenu.Item>
                            <DropdownMenu.Item onSelect={() => onDetails('activity')}>
                                Activity
                            </DropdownMenu.Item>
                        </DropdownMenu.Content>
                    </DropdownMenu.Root>
                </div>
            </div>
            {children}
        </section>
    );
}
