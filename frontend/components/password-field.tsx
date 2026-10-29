'use client';

import { useState } from 'react';
import type { ComponentProps } from 'react';
import { TextField } from '@radix-ui/themes';
import { Eye, EyeSlash } from '@phosphor-icons/react';

/** A password input with a show/hide button. The logo keeps its eyes shut either way. */
export function PasswordField(props: Omit<ComponentProps<typeof TextField.Root>, 'type'>) {
    const [visible, setVisible] = useState(false);
    return (
        <TextField.Root {...props} type={visible ? 'text' : 'password'} data-password="">
            <TextField.Slot side="right">
                <button
                    type="button"
                    className="password-toggle"
                    aria-label={visible ? 'Hide password' : 'Show password'}
                    aria-pressed={visible}
                    onClick={() => setVisible((value) => !value)}
                >
                    {visible ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
            </TextField.Slot>
        </TextField.Root>
    );
}
