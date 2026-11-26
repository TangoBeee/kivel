'use client';
import { DropdownMenu } from '@radix-ui/themes';
import { CaretUpDown, Check, Plus, UsersThree } from '@phosphor-icons/react';
import styles from './top-bar.module.css';

export function WorkspaceSwitcher({
    workspace,
    workspaces,
    role,
    busy,
    onSwitch,
    onSettings,
}: {
    workspace: { id: string; name: string };
    workspaces: { id: string; name: string }[];
    role: string;
    busy: boolean;
    onSwitch: (id: string) => void;
    onSettings: () => void;
}) {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger>
                <button
                    type="button"
                    className={styles.workspace}
                    disabled={busy}
                    aria-label={`Workspace ${workspace.name}, switch workspace`}
                >
                    <span className={styles.workspaceName}>{workspace.name}</span>
                    <em>{role.charAt(0).toUpperCase() + role.slice(1)}</em>
                    <CaretUpDown size={12} weight="bold" />
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start">
                <DropdownMenu.Label>Workspaces</DropdownMenu.Label>
                {workspaces.map((space) => (
                    <DropdownMenu.Item
                        key={space.id}
                        onSelect={() => space.id !== workspace.id && onSwitch(space.id)}
                    >
                        {space.name}
                        {space.id === workspace.id && <Check size={14} />}
                    </DropdownMenu.Item>
                ))}
                <DropdownMenu.Separator />
                <DropdownMenu.Item onSelect={onSettings}>
                    <UsersThree size={16} />
                    Workspace settings
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={onSettings}>
                    <Plus size={16} />
                    Join with an invitation
                </DropdownMenu.Item>
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
}
