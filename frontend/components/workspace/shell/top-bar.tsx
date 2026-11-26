'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { UsageItem } from '@kivel.io/tools/plans';
import { LiveLogo } from '../../live-logo';
import type { DashboardPanel } from '../../dashboard-shell';
import { AccountMenu } from './account-menu';
import { sectionOf, sections } from './sections';
import { UsageMenu } from './usage-menu';
import { WorkspaceSwitcher } from './workspace-switcher';
import styles from './top-bar.module.css';

export interface TopBarProps {
    panel: DashboardPanel;
    onNavigate: (panel: DashboardPanel) => void;
    workspace: { id: string; name: string };
    workspaces: { id: string; name: string }[];
    onSwitchWorkspace: (id: string) => void;
    username: string;
    plan: string;
    role: string;
    busy: boolean;
    runs?: UsageItem;
    search: ReactNode;
    onSignOut: () => void;
}

export function TopBar(props: TopBarProps) {
    const current = sectionOf(props.panel);
    const go = props.onNavigate;
    return (
        <header className={styles.bar}>
            <Link href="/" className={styles.brand} aria-label="Kivel, getting started">
                <LiveLogo size={20} />
                <span>Kivel</span>
            </Link>
            <WorkspaceSwitcher
                workspace={props.workspace}
                workspaces={props.workspaces}
                role={props.role}
                busy={props.busy}
                onSwitch={props.onSwitchWorkspace}
                onSettings={() => go('workspace')}
            />
            <span className={styles.divider} aria-hidden="true" />
            <nav className={styles.tabs} aria-label="Workspace">
                {sections.map((section) => (
                    <button
                        key={section.id}
                        type="button"
                        className={styles.tab}
                        aria-current={current === section.id ? 'page' : undefined}
                        onClick={() => go(section.home)}
                    >
                        {section.label}
                    </button>
                ))}
            </nav>
            <div className={styles.end}>
                {props.search}
                <UsageMenu
                    plan={props.plan}
                    runs={props.runs}
                    onOpenUsage={() => go('usage')}
                    onUpgrade={props.plan === 'free' ? () => go('billing') : undefined}
                />
                <AccountMenu
                    username={props.username}
                    busy={props.busy}
                    onSecurity={() => go('security')}
                    onSignOut={props.onSignOut}
                />
            </div>
        </header>
    );
}
