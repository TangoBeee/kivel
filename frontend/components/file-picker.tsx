'use client';
import { useId, useRef, useState } from 'react';
import { Icon } from './icons';
export function FilePicker({
    file,
    onChange,
    disabled = false,
    maxBytes = 10 * 1048576,
    allowEmpty = false,
}: {
    file?: File | undefined;
    onChange(file: File | undefined): void;
    disabled?: boolean;
    maxBytes?: number;
    allowEmpty?: boolean;
}) {
    const input = useRef<HTMLInputElement>(null),
        hint = useId();
    const [dragging, setDragging] = useState(false),
        [error, setError] = useState('');
    function select(next?: File) {
        if (next && ((!allowEmpty && !next.size) || next.size > maxBytes)) {
            setError(
                `Choose ${allowEmpty ? 'a' : 'a nonempty'} file up to ${maxBytes / 1048576} MiB.`,
            );
            return;
        }
        setError('');
        onChange(next);
    }
    return (
        <div className="file-picker">
            <div
                className="file-dropzone"
                data-dragging={dragging}
                onDragOver={(event) => {
                    event.preventDefault();
                    if (!disabled) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    if (!disabled) {
                        if (event.dataTransfer.files.length > 1)
                            setError('Choose one file at a time.');
                        else select(event.dataTransfer.files[0]);
                    }
                }}
            >
                <Icon name="files" size={28} />
                <strong>{file ? file.name : 'Drop a file here'}</strong>
                <span id={hint}>
                    {file
                        ? `${file.size.toLocaleString()} bytes · ready to use`
                        : `Any file up to ${maxBytes / 1048576} MiB`}
                </span>
                <div>
                    <button
                        type="button"
                        className="button"
                        disabled={disabled}
                        aria-describedby={hint}
                        onClick={() => {
                            if (input.current) {
                                input.current.value = '';
                                input.current.click();
                            }
                        }}
                    >
                        {file ? 'Choose another file' : 'Choose file'}
                    </button>
                    {file && (
                        <button
                            type="button"
                            className="button button-plain"
                            disabled={disabled}
                            onClick={() => {
                                select();
                                if (input.current) input.current.value = '';
                            }}
                        >
                            Remove
                        </button>
                    )}
                </div>
                <input
                    ref={input}
                    hidden
                    tabIndex={-1}
                    aria-label="Select a file"
                    type="file"
                    disabled={disabled}
                    onChange={(event) => select(event.target.files?.[0])}
                />
            </div>
            {error && (
                <p className="file-picker-error" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
