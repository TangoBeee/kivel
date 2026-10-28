'use client';
import { SegmentedControl } from '@radix-ui/themes';
import { ShieldCheck, Globe } from '@phosphor-icons/react';
export type Visibility = 'public' | 'private';
// One compact line: privacy matters, but it shouldn't be the first big decision on a tool page.
export function SharingControl({
    value,
    onChange,
    disabled = false,
}: {
    value: Visibility;
    onChange(value: Visibility): void;
    disabled?: boolean;
}) {
    return (
        <fieldset className="sharing-control" disabled={disabled}>
            <legend className="sr-only">Sharing</legend>
            <span className="sharing-label" aria-hidden="true">
                Access
            </span>
            <SegmentedControl.Root
                aria-label="Sharing"
                size="1"
                value={value}
                onValueChange={(next) => onChange(next as Visibility)}
                disabled={disabled}
            >
                <SegmentedControl.Item value="private">
                    <span className="sharing-option">
                        <ShieldCheck size={14} /> Private
                    </span>
                </SegmentedControl.Item>
                <SegmentedControl.Item value="public">
                    <span className="sharing-option">
                        <Globe size={14} /> Public
                    </span>
                </SegmentedControl.Item>
            </SegmentedControl.Root>
            <small>
                {value === 'private'
                    ? 'Callers need the access token, or your workspace.'
                    : 'Anyone with the URL can use it.'}
            </small>
        </fieldset>
    );
}
