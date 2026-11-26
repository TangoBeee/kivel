'use client';
import Link from 'next/link';
import { DropdownMenu } from '@radix-ui/themes';
import { BookOpen, House, ShieldCheck, SignOut } from '@phosphor-icons/react';
import { siteOrigin } from '../../../lib/site';
import styles from './top-bar.module.css';

export function AccountMenu({
    username,
    busy,
    onSecurity,
    onSignOut,
}: {
    username: string;
    busy: boolean;
    onSecurity: () => void;
    onSignOut: () => void;
}) {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger>
                <button type="button" className={styles.avatar} aria-label="Account menu">
                    {username.slice(0, 2).toUpperCase()}
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
                <DropdownMenu.Label>{username}</DropdownMenu.Label>
                <DropdownMenu.Item onSelect={onSecurity}>
                    <ShieldCheck size={16} />
                    Security
                </DropdownMenu.Item>
                <DropdownMenu.Item asChild>
                    <Link href={`${siteOrigin}/docs/`}>
                        <BookOpen size={16} />
                        Documentation
                    </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item asChild>
                    <Link href={siteOrigin}>
                        <House size={16} />
                        Back to the site
                    </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item color="red" disabled={busy} onSelect={onSignOut}>
                    <SignOut size={16} />
                    Sign out
                </DropdownMenu.Item>
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
}
