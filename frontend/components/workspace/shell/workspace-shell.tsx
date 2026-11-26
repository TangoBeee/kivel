'use client';
import type { ReactNode } from 'react';
import { panelInfo, type DashboardPanel } from '../../dashboard-shell';
import { PageHeader } from './page-header';
import { sectionOf, tabLabels, tabsFor } from './sections';
import { TopBar, type TopBarProps } from './top-bar';
import styles from './workspace-shell.module.css';

type Props = Omit<TopBarProps, 'onNavigate'> & {
    onPanelChange: (panel: DashboardPanel) => void;
    /** Pages that draw their own header (Getting started, Catalog, Activity) set this. */
    bare?: boolean;
    title?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
};

/** The workspace frame: top bar, then the page header and tabs, then the page. */
export function WorkspaceShell({ onPanelChange, bare, title, actions, children, ...bar }: Props) {
    const { panel } = bar;
    const info = panelInfo(panel);
    const tabs = tabsFor(panel);
    const section = sectionOf(panel);
    return (
        <div className={`kv ${styles.shell}`}>
            <TopBar {...bar} onNavigate={onPanelChange} />
            <main className={styles.main} id="workspace-main">
                {!bare && (
                    <PageHeader
                        eyebrow={
                            section === 'catalog' && panel !== 'catalog' ? (
                                <>
                                    <button type="button" onClick={() => onPanelChange('catalog')}>
                                        Catalog
                                    </button>
                                    <span aria-hidden="true">/</span>
                                </>
                            ) : undefined
                        }
                        title={title ?? (section === 'team' ? 'Team' : info.label)}
                        description={
                            section === 'team'
                                ? 'Members, agents, keys, billing and security for this workspace.'
                                : info.description
                        }
                        actions={actions}
                    />
                )}
                {tabs.length > 0 && (
                    <nav className={styles.tabs} aria-label={`${title ?? 'Section'} pages`}>
                        {tabs.map((id) => (
                            <button
                                key={id}
                                type="button"
                                aria-current={id === panel ? 'page' : undefined}
                                onClick={() => onPanelChange(id)}
                            >
                                {tabLabels[id] ?? panelInfo(id).label}
                            </button>
                        ))}
                    </nav>
                )}
                <div key={panel} data-stagger>
                    {children}
                </div>
            </main>
        </div>
    );
}
