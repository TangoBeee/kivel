'use client';
import { useId } from 'react';
import { RadioCards } from '@radix-ui/themes';
import { ShieldCheck, Globe } from '@phosphor-icons/react';
export type Visibility = 'public' | 'private';
export function SharingControl({
    value,
    onChange,
    disabled = false,
}: {
    value: Visibility;
    onChange(value: Visibility): void;
    disabled?: boolean;
}) {
    const id = useId();
    return (
        <fieldset className="sharing-control" disabled={disabled}>
            <legend>Sharing</legend>
            <RadioCards.Root
                aria-label="Sharing"
                name={id}
                value={value}
                onValueChange={(next) => onChange(next as Visibility)}
                disabled={disabled}
                columns="2"
            >
                {(['private', 'public'] as const).map((mode) => (
                    <RadioCards.Item className="sharing-option" key={mode} value={mode}>
                        {mode === 'private' ? <ShieldCheck size={19} /> : <Globe size={19} />}
                        <span>
                            <strong>{mode === 'private' ? 'Private' : 'Public'}</strong>
                            <small>
                                {mode === 'private'
                                    ? 'Requires an access token or workspace access.'
                                    : 'Anyone with the endpoint or link can use it.'}
                            </small>
                        </span>
                    </RadioCards.Item>
                ))}
            </RadioCards.Root>
        </fieldset>
    );
}
