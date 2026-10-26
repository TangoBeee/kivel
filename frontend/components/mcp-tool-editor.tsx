'use client';
import { useState } from 'react';
import { Button, Checkbox } from '@radix-ui/themes';
import { AppSelect, SelectOption } from './app-select';
import { CopyButton } from './copy-button';
type Tool = {
    name: string;
    description: string;
    response: string;
    isError?: boolean;
    delayMs?: number;
    inputSchema: {
        type: string;
        properties: Record<string, { type: string; description?: string }>;
        required?: string[];
    };
};
export function McpToolEditor({
    value,
    onChange,
    disabled,
}: {
    value: string;
    onChange(value: string): void;
    disabled: boolean;
}) {
    const [raw, setRaw] = useState(false);
    const [nameError, setNameError] = useState('');
    let tools: Tool[] | undefined;
    try {
        const parsed = JSON.parse(value);
        if (
            Array.isArray(parsed) &&
            parsed.every(
                (item) =>
                    item &&
                    typeof item.name === 'string' &&
                    typeof item.description === 'string' &&
                    typeof item.response === 'string' &&
                    item.inputSchema &&
                    item.inputSchema.properties &&
                    typeof item.inputSchema.properties === 'object' &&
                    Object.values(item.inputSchema.properties).every(
                        (field) =>
                            field &&
                            typeof field === 'object' &&
                            'type' in field &&
                            typeof field.type === 'string',
                    ) &&
                    Array.isArray(item.inputSchema.required ?? []) &&
                    (item.inputSchema.required ?? []).every(
                        (name: unknown) => typeof name === 'string',
                    ) &&
                    !Array.isArray(item.inputSchema.properties),
            )
        )
            tools = parsed;
    } catch {}
    const write = (next: Tool[]) => onChange(JSON.stringify(next, null, 2));
    const update = (index: number, patch: Partial<Tool>) =>
        write(tools!.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    return (
        <div className="mcp-tool-editor">
            {nameError && (
                <p className="alert" role="alert">
                    {nameError}
                </p>
            )}
            <div className="result-group-heading">
                <div>
                    <h3>Tools your client can call</h3>
                    <p className="tool-notice">
                        Define arguments, a response, and optional failure behavior.
                    </p>
                </div>
                <button type="button" className="text-link" onClick={() => setRaw(!raw)}>
                    {raw ? 'Use form' : 'Advanced JSON'}
                </button>
            </div>
            {raw || !tools ? (
                <label className="mcp-raw-label">
                    Tool configuration (JSON)
                    <textarea
                        value={value}
                        maxLength={81920}
                        rows={16}
                        disabled={disabled}
                        spellCheck={false}
                        onChange={(event) => {
                            setRaw(true);
                            onChange(event.target.value);
                        }}
                    />
                </label>
            ) : (
                tools.map((tool, index) => (
                    <article className="mcp-tool-card" key={index}>
                        <div className="result-group-heading">
                            <h3>Tool {index + 1}</h3>
                            {tools!.length > 1 && (
                                <button
                                    type="button"
                                    className="text-link"
                                    disabled={disabled}
                                    onClick={() => write(tools!.filter((_, i) => i !== index))}
                                >
                                    Remove tool
                                </button>
                            )}
                        </div>
                        <div className="resource-form-fields">
                            <label>
                                Tool name
                                <input
                                    value={tool.name}
                                    maxLength={64}
                                    disabled={disabled}
                                    onChange={(event) =>
                                        update(index, { name: event.target.value })
                                    }
                                />
                            </label>
                            <label>
                                Description
                                <input
                                    value={tool.description}
                                    maxLength={300}
                                    disabled={disabled}
                                    onChange={(event) =>
                                        update(index, { description: event.target.value })
                                    }
                                />
                            </label>
                        </div>
                        <section className="mcp-arguments">
                            <div className="result-group-heading">
                                <h3>Arguments</h3>
                                <button
                                    type="button"
                                    className="text-link"
                                    disabled={
                                        disabled ||
                                        Object.keys(tool.inputSchema.properties).length >= 20
                                    }
                                    onClick={() => {
                                        const properties = { ...tool.inputSchema.properties };
                                        let n = 1;
                                        while (Object.hasOwn(properties, `argument_${n}`)) n++;
                                        properties[`argument_${n}`] = { type: 'string' };
                                        update(index, {
                                            inputSchema: { ...tool.inputSchema, properties },
                                        });
                                    }}
                                >
                                    Add argument
                                </button>
                            </div>
                            {!Object.keys(tool.inputSchema.properties).length && (
                                <p className="tool-notice">No arguments required.</p>
                            )}
                            {Object.entries(tool.inputSchema.properties).map(
                                ([name, field], position) => (
                                    <div className="mcp-argument-row" key={position}>
                                        <label>
                                            Name
                                            <input
                                                value={name}
                                                disabled={disabled}
                                                maxLength={64}
                                                onChange={(event) => {
                                                    if (
                                                        event.target.value !== name &&
                                                        Object.hasOwn(
                                                            tool.inputSchema.properties,
                                                            event.target.value,
                                                        )
                                                    ) {
                                                        setNameError(
                                                            'That argument name is already in use. The original argument was kept.',
                                                        );
                                                        return;
                                                    }
                                                    setNameError('');
                                                    const properties = Object.fromEntries(
                                                        Object.entries(
                                                            tool.inputSchema.properties,
                                                        ).map(([key, item]) => [
                                                            key === name ? event.target.value : key,
                                                            item,
                                                        ]),
                                                    );
                                                    const required = (
                                                        tool.inputSchema.required ?? []
                                                    ).map((key) =>
                                                        key === name ? event.target.value : key,
                                                    );
                                                    update(index, {
                                                        inputSchema: {
                                                            ...tool.inputSchema,
                                                            properties,
                                                            required,
                                                        },
                                                    });
                                                }}
                                            />
                                        </label>
                                        <label>
                                            Type
                                            <AppSelect
                                                value={field.type}
                                                disabled={disabled}
                                                onChange={(event) =>
                                                    update(index, {
                                                        inputSchema: {
                                                            ...tool.inputSchema,
                                                            properties: {
                                                                ...tool.inputSchema.properties,
                                                                [name]: {
                                                                    ...field,
                                                                    type: event.target.value,
                                                                },
                                                            },
                                                        },
                                                    })
                                                }
                                            >
                                                {['string', 'number', 'integer', 'boolean'].map(
                                                    (type) => (
                                                        <SelectOption key={type} value={type}>
                                                            {type}
                                                        </SelectOption>
                                                    ),
                                                )}
                                            </AppSelect>
                                        </label>
                                        <label className="mcp-checkbox">
                                            <Checkbox
                                                checked={(tool.inputSchema.required ?? []).includes(
                                                    name,
                                                )}
                                                disabled={disabled}
                                                onCheckedChange={(checked) => {
                                                    const required = (
                                                        tool.inputSchema.required ?? []
                                                    ).filter((key) => key !== name);
                                                    if (checked) required.push(name);
                                                    update(index, {
                                                        inputSchema: {
                                                            ...tool.inputSchema,
                                                            required,
                                                        },
                                                    });
                                                }}
                                            />
                                            Required
                                        </label>
                                        <button
                                            type="button"
                                            className="button button-small"
                                            disabled={disabled}
                                            aria-label={`Remove argument ${name}`}
                                            onClick={() =>
                                                update(index, {
                                                    inputSchema: {
                                                        ...tool.inputSchema,
                                                        properties: Object.fromEntries(
                                                            Object.entries(
                                                                tool.inputSchema.properties,
                                                            ).filter(([key]) => key !== name),
                                                        ),
                                                        required: (
                                                            tool.inputSchema.required ?? []
                                                        ).filter((key) => key !== name),
                                                    },
                                                })
                                            }
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ),
                            )}
                        </section>
                        <label className="mcp-response-label">
                            Response text
                            <textarea
                                value={tool.response}
                                maxLength={10000}
                                rows={4}
                                disabled={disabled}
                                spellCheck={false}
                                onChange={(event) =>
                                    update(index, { response: event.target.value })
                                }
                            />
                        </label>
                        <div className="resource-form-fields">
                            <label>
                                Latency (ms)
                                <input
                                    type="number"
                                    min="0"
                                    max="2000"
                                    value={tool.delayMs ?? 0}
                                    disabled={disabled}
                                    onChange={(event) =>
                                        update(index, { delayMs: Number(event.target.value) })
                                    }
                                />
                            </label>
                            <label className="mcp-checkbox">
                                <Checkbox
                                    checked={tool.isError === true}
                                    disabled={disabled}
                                    onCheckedChange={(checked) =>
                                        update(index, { isError: checked === true })
                                    }
                                />
                                Return a tool failure
                            </label>
                        </div>
                    </article>
                ))
            )}
            {tools && !raw && tools.length < 10 && (
                <Button
                    variant="soft"
                    color="gray"
                    disabled={disabled}
                    onClick={() =>
                        write([
                            ...tools!,
                            {
                                name: `tool_${tools!.length + 1}`,
                                description: 'A configurable test tool.',
                                response: 'Example response',
                                isError: false,
                                delayMs: 0,
                                inputSchema: { type: 'object', properties: {}, required: [] },
                            },
                        ])
                    }
                >
                    Add tool
                </Button>
            )}
            <CopyButton text={value} label="Copy tool configuration" />
        </div>
    );
}
