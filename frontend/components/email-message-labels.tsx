'use client';

import { useRef, useState } from 'react';
import { Button, Popover, TextField } from '@radix-ui/themes';
import { Icon } from './icons';

export function EmailMessageLabels({
    labels,
    canEdit,
    busy,
    update,
}: {
    labels: string[];
    canEdit: boolean;
    busy: boolean;
    update: (labels: string[]) => Promise<boolean>;
}) {
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState('');
    const add = useRef<HTMLButtonElement>(null);
    const label = input.trim();
    if (!canEdit && !labels.length) return null;

    return (
        <div className="email-labels" role="group" aria-label="Message labels">
            {labels.map((value) => (
                <span key={value} className="email-tag">
                    <span>{value}</span>
                    {canEdit && (
                        <button
                            type="button"
                            aria-label={`Remove label ${value}`}
                            disabled={busy}
                            onClick={async () => {
                                const button = add.current;
                                if (await update(labels.filter((item) => item !== value)))
                                    button?.focus();
                            }}
                        >
                            <Icon name="close" size={12} />
                        </button>
                    )}
                </span>
            ))}
            {canEdit && (
                <Popover.Root
                    open={open}
                    onOpenChange={(value) => {
                        setOpen(value);
                        if (!value) setInput('');
                    }}
                >
                    <Popover.Trigger>
                        <Button
                            type="button"
                            ref={add}
                            size="1"
                            variant="ghost"
                            color="gray"
                            disabled={busy || labels.length >= 10}
                        >
                            <Icon name="plus" size={14} /> Add label
                        </Button>
                    </Popover.Trigger>
                    <Popover.Content side="bottom" align="start">
                        <form
                            className="email-label-form"
                            onSubmit={async (event) => {
                                event.preventDefault();
                                if (
                                    !label ||
                                    labels.includes(label) ||
                                    !(await update([...labels, label]))
                                )
                                    return;
                                setOpen(false);
                                setInput('');
                            }}
                        >
                            <TextField.Root
                                aria-label="Label name"
                                autoFocus
                                placeholder="Label name"
                                maxLength={32}
                                value={input}
                                onChange={(event) => setInput(event.target.value)}
                            />
                            <Button
                                type="submit"
                                disabled={busy || !label || labels.includes(label)}
                            >
                                Add
                            </Button>
                        </form>
                    </Popover.Content>
                </Popover.Root>
            )}
        </div>
    );
}
