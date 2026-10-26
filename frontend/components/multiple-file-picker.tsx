'use client';
import { useRef, useState } from 'react';
import { Icon } from './icons';
export function MultipleFilePicker({
    files,
    onChange,
    accept,
}: {
    files: File[];
    onChange(files: File[]): void;
    accept?: string;
}) {
    const input = useRef<HTMLInputElement>(null);
    const [error, setError] = useState(''),
        [dragging, setDragging] = useState(false);
    function add(items: File[]) {
        const next = [...files, ...items];
        if (
            next.length > 20 ||
            next.some((file) => !file.size) ||
            next.reduce((n, file) => n + file.size, 0) > 10 * 1048576
        ) {
            setError(
                'Choose up to 20 nonempty files, at most 10 MiB combined. Hosted daily allowances apply.',
            );
            return;
        }
        setError('');
        onChange(next);
    }
    function move(index: number, direction: number) {
        const next = [...files];
        [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
        onChange(next);
    }
    return (
        <div className="file-picker">
            <div
                className="file-dropzone"
                data-dragging={dragging}
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    add(Array.from(event.dataTransfer.files));
                }}
            >
                <Icon name="files" size={28} />
                <strong>
                    {files.length ? `${files.length} files selected` : 'Drop files here'}
                </strong>
                <span>Up to 20 files · 10 MiB combined maximum</span>
                <button
                    type="button"
                    className="button"
                    onClick={() => {
                        if (input.current) {
                            input.current.value = '';
                            input.current.click();
                        }
                    }}
                >
                    {files.length ? 'Add files' : 'Choose files'}
                </button>
                <input
                    hidden
                    ref={input}
                    type="file"
                    multiple
                    accept={accept}
                    aria-label="Select files"
                    onChange={(event) => add(Array.from(event.target.files ?? []))}
                />
            </div>
            {!!files.length && (
                <ol className="selected-file-list">
                    {files.map((file, index) => (
                        <li key={`${file.name}-${index}`}>
                            <span>
                                <strong>{file.name}</strong>
                                <small>{file.size.toLocaleString()} bytes</small>
                            </span>
                            <button
                                type="button"
                                className="button button-small"
                                disabled={index === 0}
                                aria-label={`Move ${file.name} up`}
                                onClick={() => move(index, -1)}
                            >
                                ↑
                            </button>
                            <button
                                type="button"
                                className="button button-small"
                                disabled={index === files.length - 1}
                                aria-label={`Move ${file.name} down`}
                                onClick={() => move(index, 1)}
                            >
                                ↓
                            </button>
                            <button
                                type="button"
                                className="button button-small"
                                aria-label={`Remove ${file.name}`}
                                onClick={() => onChange(files.filter((_, i) => i !== index))}
                            >
                                Remove
                            </button>
                        </li>
                    ))}
                </ol>
            )}
            {error && (
                <p className="file-picker-error" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
