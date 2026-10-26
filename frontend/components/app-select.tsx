'use client';
import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { Select } from '@radix-ui/themes';

type OptionProps = { value?: string; children: ReactNode; disabled?: boolean };
export function SelectOption({ value, children, disabled }: OptionProps) {
    return (
        <Select.Item value={value ?? String(children)} disabled={disabled}>
            {children}
        </Select.Item>
    );
}
export function AppSelect({
    children,
    value,
    defaultValue,
    onChange,
    name,
    disabled,
    id,
    'aria-label': label,
}: {
    children: ReactNode;
    value?: string;
    defaultValue?: string;
    name?: string;
    disabled?: boolean;
    id?: string;
    'aria-label'?: string;
    onChange?: (event: { target: { value: string } }) => void;
}) {
    const first = Children.toArray(children).find(
        (child) =>
            isValidElement<OptionProps>(child) &&
            child.type === SelectOption &&
            !child.props.disabled,
    );
    const initial =
        defaultValue ??
        (isValidElement<OptionProps>(first)
            ? (first.props.value ?? String(first.props.children))
            : undefined);
    return (
        <Select.Root
            name={name}
            value={value}
            defaultValue={initial}
            disabled={disabled}
            onValueChange={(next) => onChange?.({ target: { value: next } })}
        >
            <Select.Trigger
                id={id}
                aria-label={label}
                className="app-select"
                variant="surface"
                radius="medium"
            />
            <Select.Content position="popper" sideOffset={5}>
                {children}
            </Select.Content>
        </Select.Root>
    );
}
