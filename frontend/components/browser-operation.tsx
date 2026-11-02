'use client';
import { toolInputs } from '../lib/tool-inputs';
import { renderToolResult } from './tool-result';
import { api } from '../lib/api';
import { mediaOperations } from '@socket-help/tools/media-definitions';
import type { MediaOperationId } from '@socket-help/tools/media-definitions';
import { networkOperations } from '@socket-help/tools/network-definitions';
import type { NetworkOperationId } from '@socket-help/tools/network-definitions';
import { extraOperations } from '@socket-help/tools/extra-definitions';
import type { ExtraDefinition } from '@socket-help/tools/extra-definitions';
import { GeneratedFilePreview, MarkdownPreview } from './generated-preview';
import {
    paymentGeneratorFunding,
    testCardFixtures,
    cardBrandNames,
    testCardSource,
} from '@socket-help/tools/payment-cards';
import { PaymentCardPreview, CardValidationPreview } from './payment-card-preview';
import { AppSelect, SelectOption } from './app-select';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MultipleFilePicker } from './multiple-file-picker';
import { BlobPreview } from './file-preview';
import { FilePicker } from './file-picker';
import { ResultPreview } from './result-preview';
import { Button } from '@radix-ui/themes';
import { ToolHeader } from './tool-header';
import { CopyButton } from './copy-button';
import { Icon } from './icons';
import { runBrowserOperation } from '../lib/browser-operations';
import { browserOperations } from '../lib/browser-tool-definitions';
import type { BrowserOperationId, OperationOptions } from '../lib/browser-tool-definitions';

export function BrowserOperation({
    toolId,
}: {
    toolId: BrowserOperationId | NetworkOperationId | MediaOperationId;
}) {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [options, setOptions] = useState<OperationOptions>({});
    const [file, setFile] = useState<File>();
    const [files, setFiles] = useState<File[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const operation = useRef(0);
    const pending = useRef<AbortController | null>(null);
    useEffect(() => () => pending.current?.abort(), []);
    const remote = (
        { ...networkOperations, ...mediaOperations } as Partial<Record<string, ExtraDefinition>>
    )[toolId];
    const definition = remote ?? browserOperations[toolId as BrowserOperationId];
    const extra = remote ?? (extraOperations as Partial<Record<string, ExtraDefinition>>)[toolId];
    const hosted =
        Object.hasOwn(networkOperations, toolId) ||
        Object.hasOwn(mediaOperations, toolId) ||
        extra?.server === true;
    const funding = paymentGeneratorFunding[toolId as keyof typeof paymentGeneratorFunding];
    const brands = [
        ...new Set(
            testCardFixtures.filter((card) => card.funding === funding).map((card) => card.brand),
        ),
    ];
    const structured = useMemo(
        () =>
            output && !funding && !extra?.preview && toolId !== 'developer-card-number-validator'
                ? renderToolResult(toolId, output, input)
                : null,
        [toolId, output, input, funding, extra?.preview],
    );
    const inputGuide = toolInputs[toolId];
    const singleLine =
        (hosted && !extra?.file && !extra?.multiline) ||
        extra?.multiline === false ||
        inputGuide?.single ||
        [
            'test-media-placeholder-images',
            'test-media-sample-avatars',
            'databases-seed-data-generator',
            'developer-http-request-builder',
            'developer-cron-expression-helper',
            'everyday-qr-code-generator',
            'everyday-barcode-generator',
        ].includes(toolId);
    const sample = extra?.placeholder ?? inputGuide?.sample;
    function changeInput(value: string) {
        pending.current?.abort();
        operation.current++;
        setBusy(false);
        setError('');
        setInput(value);
        setOutput('');
    }
    function option(key: keyof OperationOptions, value: string) {
        pending.current?.abort();
        operation.current++;
        setBusy(false);
        setOptions((current) => ({ ...current, [key]: value }));
        setOutput('');
        setError('');
    }
    async function run() {
        pending.current?.abort();
        const request = new AbortController();
        pending.current = request;
        const version = ++operation.current;
        setBusy(true);
        setError('');
        try {
            const result = hosted
                ? ((
                      await (
                          await api(
                              `/api/tools/${toolId}/run`,
                              {
                                  method: 'POST',
                                  signal: request.signal,
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                      input,
                                      options,
                                      ...(extra?.multiple
                                          ? {
                                                file: await Promise.all(
                                                    files.map(async (item) => ({
                                                        name: item.name,
                                                        base64: await fileBase64(item),
                                                    })),
                                                ),
                                            }
                                          : file
                                            ? {
                                                  file: {
                                                      name: file.name,
                                                      base64: await fileBase64(file),
                                                  },
                                              }
                                            : {}),
                                  }),
                              },
                              25000,
                          )
                      ).json()
                  ).output as string)
                : await runBrowserOperation(toolId as BrowserOperationId, input, options, file);
            if (version === operation.current) setOutput(result);
        } catch (error) {
            if (request.signal.aborted) return;
            if (version === operation.current) {
                setOutput('');
                setError(error instanceof Error ? error.message : 'Unable to process this input.');
            }
        } finally {
            if (version === operation.current) setBusy(false);
        }
    }
    return (
        <div className="page-width work-page">
            <ToolHeader toolId={toolId}>
                <span className="badge badge-green">
                    <Icon name={hosted ? 'globe' : 'shield'} size={13} />{' '}
                    {hosted ? 'Runs on the server' : 'Runs in your browser'}
                </span>
            </ToolHeader>
            <div className="utility-panel">
                {error && (
                    <div className="alert" role="alert">
                        {error}
                    </div>
                )}
                {toolId === 'developer-jwt-inspector' && (
                    <p className="tool-notice">
                        Decoded claims are untrusted. This tool does not verify signatures or
                        authenticate tokens.
                    </p>
                )}
                {funding && (
                    <aside className="payment-sandbox-note">
                        <Icon name="info" size={20} />
                        <div>
                            <strong>Sandbox fixtures, ready to copy.</strong>
                            <p>
                                Published Stripe test numbers with sample expiry and CVC values. No
                                real account is created.{' '}
                                <a href={testCardSource} target="_blank" rel="noreferrer">
                                    Provider documentation ↗
                                </a>
                            </p>
                        </div>
                    </aside>
                )}
                {toolId === 'developer-card-number-validator' && (
                    <p className="tool-notice">
                        Use test data. This checks the Luhn checksum; it does not verify an active
                        card, ownership, funds, or payment acceptance.
                    </p>
                )}
                {definition.input && (
                    <div className="editor-panel">
                        <div className="editor-heading">
                            <label htmlFor="operation-input">
                                {toolId === 'developer-card-number-validator'
                                    ? 'Test card number'
                                    : (extra?.inputLabel ?? inputGuide?.label ?? 'Input')}
                            </label>
                            {sample && (
                                <button className="text-link" onClick={() => changeInput(sample)}>
                                    Try example
                                </button>
                            )}
                            <button
                                className="text-link"
                                onClick={() => {
                                    pending.current?.abort();
                                    operation.current++;
                                    setInput('');
                                    setOutput('');
                                    setError('');
                                    setBusy(false);
                                }}
                            >
                                Clear
                            </button>
                        </div>
                        {singleLine ? (
                            <input
                                id="operation-input"
                                className="tool-single-input"
                                type="text"
                                value={input}
                                maxLength={4096}
                                autoComplete="off"
                                spellCheck={false}
                                onChange={(event) => changeInput(event.target.value)}
                                placeholder={sample ?? 'Enter a value…'}
                            />
                        ) : (
                            <textarea
                                id="operation-input"
                                value={input}
                                maxLength={hosted ? 4096 : 262144}
                                spellCheck={false}
                                onChange={(event) => changeInput(event.target.value)}
                                placeholder={sample ?? 'Type or paste your input…'}
                            />
                        )}
                        {inputGuide?.hint && <p className="tool-input-hint">{inputGuide.hint}</p>}
                    </div>
                )}
                <div
                    className={`resource-form-fields${toolId === 'developer-timezone-converter' ? ' timezone-fields' : ''}`}
                >
                    {extra?.fields
                        ?.filter(
                            (field) =>
                                field.key !== 'quality' ||
                                (options.format ??
                                    extra.fields?.find((item) => item.key === 'format')
                                        ?.defaultValue) !== 'png',
                        )
                        .filter(
                            (field) =>
                                !field.when ||
                                (options[field.when[0]] ??
                                    extra.fields?.find((item) => item.key === field.when![0])
                                        ?.defaultValue) === field.when[1],
                        )
                        .map((field) => (
                            <label
                                key={field.key}
                                className={
                                    field.type === 'textarea' ? 'utility-wide-field' : undefined
                                }
                            >
                                {field.label}
                                {field.choices ? (
                                    <AppSelect
                                        value={options[field.key] ?? field.defaultValue}
                                        onChange={(event) => option(field.key, event.target.value)}
                                    >
                                        {field.choices.map(([value, label]) => (
                                            <SelectOption key={value} value={value}>
                                                {label}
                                            </SelectOption>
                                        ))}
                                    </AppSelect>
                                ) : field.type === 'textarea' ? (
                                    <textarea
                                        rows={5}
                                        maxLength={65536}
                                        value={options[field.key] ?? field.defaultValue}
                                        onChange={(event) => option(field.key, event.target.value)}
                                        spellCheck={false}
                                    />
                                ) : (
                                    <input
                                        type={field.type ?? 'text'}
                                        min={field.min}
                                        max={field.max}
                                        step={field.key === 'duration' ? '0.1' : '1'}
                                        maxLength={4096}
                                        value={options[field.key] ?? field.defaultValue}
                                        onChange={(event) => option(field.key, event.target.value)}
                                    />
                                )}
                            </label>
                        ))}
                    {funding && (
                        <>
                            {brands.length > 1 ? (
                                <label>
                                    Card brand
                                    <AppSelect
                                        value={options.brand ?? 'all'}
                                        onChange={(event) => option('brand', event.target.value)}
                                    >
                                        <SelectOption value="all">
                                            All supported brands
                                        </SelectOption>
                                        {brands.map((brand) => (
                                            <SelectOption key={brand} value={brand}>
                                                {cardBrandNames[brand]}
                                            </SelectOption>
                                        ))}
                                    </AppSelect>
                                </label>
                            ) : (
                                <div className="payment-fixed-brand">
                                    <span>Card brand</span>
                                    <strong>Mastercard</strong>
                                </div>
                            )}
                            <label>
                                Number of fixtures
                                <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    step="1"
                                    value={options.count ?? '1'}
                                    onChange={(event) => option('count', event.target.value)}
                                />
                            </label>
                        </>
                    )}
                    {toolId === 'developer-hmac-generator' && (
                        <label>
                            Secret key
                            <input
                                type="password"
                                autoComplete="off"
                                value={options.secret ?? ''}
                                maxLength={4096}
                                onChange={(event) => option('secret', event.target.value)}
                            />
                        </label>
                    )}
                    {(toolId === 'developer-hmac-generator' ||
                        toolId === 'everyday-file-checksums') && (
                        <label>
                            Algorithm
                            <AppSelect
                                value={options.algorithm ?? 'SHA-256'}
                                onChange={(event) => option('algorithm', event.target.value)}
                            >
                                {['SHA-256', 'SHA-384', 'SHA-512'].map((value) => (
                                    <SelectOption key={value}>{value}</SelectOption>
                                ))}
                            </AppSelect>
                        </label>
                    )}
                    {toolId.includes('timestamp-converter') && (
                        <label>
                            Input format
                            <AppSelect
                                value={options.unit ?? 'seconds'}
                                onChange={(event) => option('unit', event.target.value)}
                            >
                                <SelectOption value="seconds">Unix seconds</SelectOption>
                                <SelectOption value="milliseconds">Unix milliseconds</SelectOption>
                                <SelectOption value="date">ISO date</SelectOption>
                            </AppSelect>
                        </label>
                    )}
                    {toolId === 'everyday-case-converter' && (
                        <label>
                            Letter case
                            <AppSelect
                                value={options.mode ?? 'upper'}
                                onChange={(event) => option('mode', event.target.value)}
                            >
                                {Object.entries({
                                    upper: 'UPPERCASE',
                                    lower: 'lowercase',
                                    title: 'Title Case',
                                    camel: 'camelCase',
                                    snake: 'snake_case',
                                    kebab: 'kebab-case',
                                }).map(([value, label]) => (
                                    <SelectOption key={value} value={value}>
                                        {label}
                                    </SelectOption>
                                ))}
                            </AppSelect>
                        </label>
                    )}
                    {toolId === 'everyday-data-format-converter' && (
                        <label>
                            Conversion
                            <AppSelect
                                value={options.mode ?? 'yaml-json'}
                                onChange={(event) => option('mode', event.target.value)}
                            >
                                <SelectOption value="yaml-json">YAML to JSON</SelectOption>
                                <SelectOption value="json-yaml">JSON to YAML</SelectOption>
                            </AppSelect>
                        </label>
                    )}
                    {toolId === 'everyday-password-generator' && (
                        <label>
                            Password length
                            <input
                                type="number"
                                min="8"
                                max="128"
                                value={options.length ?? '20'}
                                onChange={(event) => option('length', event.target.value)}
                            />
                        </label>
                    )}
                    {toolId === 'everyday-random-generator' && (
                        <>
                            {(['min', 'max'] as const).map((key) => (
                                <label key={key}>
                                    {key === 'min' ? 'Minimum' : 'Maximum'}
                                    <input
                                        type="number"
                                        step="1"
                                        value={options[key] ?? (key === 'min' ? '1' : '100')}
                                        onChange={(event) => option(key, event.target.value)}
                                    />
                                </label>
                            ))}
                        </>
                    )}
                    {extra?.multiple ? (
                        <MultipleFilePicker
                            files={files}
                            accept={
                                toolId === 'everyday-merge-pdfs'
                                    ? '.pdf'
                                    : 'image/jpeg,image/png,image/webp,image/gif,image/avif,image/tiff'
                            }
                            onChange={(value) => {
                                pending.current?.abort();
                                operation.current++;
                                setBusy(false);
                                setFiles(value);
                                setOutput('');
                                setError('');
                            }}
                        />
                    ) : (
                        (toolId === 'everyday-file-checksums' || extra?.file) && (
                            <FilePicker
                                file={file}
                                maxBytes={
                                    toolId.startsWith('email-')
                                        ? 1048576
                                        : hosted
                                          ? 10 * 1048576
                                          : 25 * 1048576
                                }
                                allowEmpty
                                onChange={(value) => {
                                    operation.current++;
                                    setBusy(false);
                                    pending.current?.abort();
                                    setFile(value);
                                    setOutput('');
                                    setError('');
                                }}
                            />
                        )
                    )}
                </div>
                {hosted && file && <BlobPreview blob={file} name={file.name} />}
                {hosted && extra?.file && (
                    <p className="tool-notice">
                        Files: up to 10 MiB combined. Hosted daily allowances apply. Uploads and
                        results are processed without saving them.
                    </p>
                )}
                <div className="utility-actions">
                    <Button size="3" disabled={busy} onClick={() => void run()}>
                        {busy ? 'Working…' : definition.action} <Icon name="arrow" size={16} />
                    </Button>
                    {hosted && busy && (
                        <Button
                            variant="soft"
                            color="gray"
                            onClick={() => {
                                pending.current?.abort();
                                operation.current++;
                                setBusy(false);
                            }}
                        >
                            Cancel
                        </Button>
                    )}
                </div>
                {extra?.preview === 'file' && output && (
                    <GeneratedFilePreview key={output.slice(0, 150)} text={output} />
                )}
                {extra?.preview === 'html' && output && (
                    <MarkdownPreview
                        html={output}
                        title={
                            toolId === 'everyday-markdown-preview'
                                ? 'Markdown preview'
                                : 'Email HTML preview'
                        }
                    />
                )}
                {funding && output && <PaymentCardPreview text={output} />}
                {toolId === 'developer-card-number-validator' && output && (
                    <CardValidationPreview text={output} />
                )}
                {funding && !output && !error && (
                    <div className="payment-empty">
                        <Icon name="receipt" size={28} />
                        <strong>Your test fixtures will appear here.</strong>
                        <p>
                            Choose a brand and generate up to 20 records. Copy individual numbers or
                            download the JSON.
                        </p>
                    </div>
                )}
                {structured}
                {output &&
                (extra?.preview ||
                    structured ||
                    funding ||
                    toolId === 'developer-card-number-validator') ? (
                    <details className="artifact-response">
                        <summary>
                            {extra?.preview === 'file' ? 'API response' : 'Raw output'}
                        </summary>
                        <ResultPreview
                            text={output}
                            title={extra?.preview === 'file' ? 'Artifact JSON' : 'Raw output'}
                            filename={`${toolId}.${output.trim().startsWith('{') || output.trim().startsWith('[') ? 'json' : extra?.preview === 'html' ? 'html' : 'txt'}`}
                        />
                    </details>
                ) : (
                    (!funding || output) && (
                        <ResultPreview
                            text={output}
                            title={funding ? 'Fixture JSON' : 'Output'}
                            filename={`${toolId}-result.${funding || toolId === 'developer-card-number-validator' ? 'json' : 'txt'}`}
                        />
                    )
                )}
                <p className="tool-notice">
                    <Icon name="shield" size={14} />{' '}
                    {hosted
                        ? 'This check runs on the server. Input and results are not saved as execution history; hosted allowances apply.'
                        : 'Your input stays on this device. Nothing is uploaded or saved.'}
                </p>
            </div>
        </div>
    );
}

async function fileBase64(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
}
