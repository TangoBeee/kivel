'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertDialog, Button, TextArea, TextField } from '@radix-ui/themes';
import { validateCrud, validateRecord, crudScenario } from '@kivel.io/tools/mock-crud';
import { saveScenarioDraft } from '../lib/scenario-handoff';
import type { CrudState } from '@kivel.io/tools/mock-crud';
import { parseJsonSafely } from '@kivel.io/tools/engine';
import { validateMock } from '@kivel.io/tools/mock-config';
import type { MockRoute } from '@kivel.io/tools/mock-config';
import { api, resourceHeaders } from '../lib/api';
import { Icon } from './icons';
import { downloadBlob } from './result-preview';
import { CodeExample } from './code-example';

export const defaultCrudSeed = JSON.stringify(
    [
        { id: 'item_1', name: 'Design the signup flow', status: 'in-progress', priority: 1 },
        { id: 'item_2', name: 'Test the webhook handler', status: 'todo', priority: 2 },
        { id: 'item_3', name: 'Review the API response', status: 'done', priority: 3 },
    ],
    null,
    2,
);
export function CrudConfiguration({
    name,
    path,
    seed,
    routes,
    onRoutes,
    busy,
    existing,
    onName,
    onPath,
    onSeed,
    onSubmit,
    onError,
}: {
    name: string;
    path: string;
    seed: string;
    routes: MockRoute[];
    onRoutes: (value: MockRoute[]) => void;
    busy: boolean;
    existing: boolean;
    onName: (value: string) => void;
    onPath: (value: string) => void;
    onSeed: (value: string) => void;
    onSubmit: () => void;
    onError: (value: string) => void;
}) {
    const [confirm, setConfirm] = useState(false),
        [source, setSource] = useState('');
    function configuration() {
        if (!name.trim()) throw new Error('Enter an API name.');
        return { name, routes, crud: validateCrud({ path, seed: parseJsonSafely(seed) }) };
    }
    function apply() {
        try {
            configuration();
            if (existing) setConfirm(true);
            else onSubmit();
        } catch (error) {
            onError(error instanceof Error ? error.message : 'Check the configuration.');
        }
    }
    return (
        <section className="resource-editor crud-configuration" aria-label="CRUD configuration">
            <div className="crud-heading">
                <div>
                    <h2>{existing ? 'Seed & configuration' : 'Start with useful test data'}</h2>
                    <p>
                        Records become a real API. Keep the seed to restore a known starting point.
                    </p>
                </div>
            </div>
            <div className="resource-form-fields">
                <label>
                    API name
                    <TextField.Root
                        aria-label="CRUD API name"
                        value={name}
                        maxLength={80}
                        disabled={busy}
                        onChange={(event) => onName(event.target.value)}
                    />
                </label>
                <label>
                    Collection path
                    <TextField.Root
                        aria-label="Collection path"
                        value={path}
                        maxLength={41}
                        disabled={busy}
                        placeholder="/items"
                        onChange={(event) => onPath(event.target.value)}
                    />
                </label>
            </div>
            <label>
                Seed records (JSON array)
                <TextArea
                    aria-label="Seed records"
                    rows={12}
                    maxLength={65536}
                    value={seed}
                    disabled={busy}
                    onChange={(event) => onSeed(event.target.value)}
                />
            </label>
            <p className="tool-notice">
                Up to 200 records and 64 KiB of seed JSON. Each record can contain 40 fields and 4
                KiB. IDs are strings; omitted seed IDs are assigned deterministically. Live changes
                are isolated to this API and expire with it.
            </p>
            <div className="button-row">
                <Button size="3" disabled={busy} onClick={apply}>
                    {busy ? 'Saving…' : existing ? 'Apply seed & reset records' : 'Create CRUD API'}
                    <Icon name="arrow" size={16} />
                </Button>
                <Button
                    variant="surface"
                    color="gray"
                    disabled={busy}
                    onClick={() => {
                        try {
                            downloadBlob(
                                new Blob([JSON.stringify(configuration(), null, 2)], {
                                    type: 'application/json',
                                }),
                                'crud-mock-config.json',
                            );
                        } catch (error) {
                            onError((error as Error).message);
                        }
                    }}
                >
                    Export configuration
                </Button>
            </div>
            <details className="crud-import">
                <summary>Import a CRUD configuration</summary>
                <TextArea
                    aria-label="Import CRUD configuration"
                    rows={6}
                    maxLength={81920}
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                />
                <Button
                    variant="surface"
                    color="gray"
                    onClick={() => {
                        try {
                            const value = validateMock(parseJsonSafely(source));
                            if (
                                typeof value?.name !== 'string' ||
                                !value.name.trim() ||
                                value.name.length > 80
                            )
                                throw new Error('Provide an API name up to 80 characters.');
                            const crud = validateCrud(value.crud);
                            onRoutes(value.routes);
                            onName(value.name);
                            onPath(crud.path);
                            onSeed(JSON.stringify(crud.seed, null, 2));
                            setSource('');
                        } catch (error) {
                            onError((error as Error).message);
                        }
                    }}
                >
                    Load configuration
                </Button>
                <p className="tool-notice">
                    Import updates this editor only. Apply it explicitly to create an endpoint or
                    replace its live records. Exports contain seed data, not credentials or the
                    current live collection.
                </p>
            </details>
            <AlertDialog.Root open={confirm} onOpenChange={setConfirm}>
                <AlertDialog.Content maxWidth="450px">
                    <AlertDialog.Title>Replace live records?</AlertDialog.Title>
                    <AlertDialog.Description>
                        The current collection will be replaced by this seed. Existing record
                        changes will be removed. The endpoint and expiry stay the same.
                    </AlertDialog.Description>
                    <div className="button-row" style={{ marginTop: 20 }}>
                        <AlertDialog.Cancel>
                            <Button variant="soft" color="gray">
                                Cancel
                            </Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action>
                            <Button onClick={onSubmit}>Apply seed & reset</Button>
                        </AlertDialog.Action>
                    </div>
                </AlertDialog.Content>
            </AlertDialog.Root>
        </section>
    );
}
type Credential = {
    id: string;
    managementToken: string;
    accessToken?: string | undefined;
    accessVersion?: string | undefined;
    visibility?: string | undefined;
};
export function CrudRecords({ resource, version }: { resource: Credential; version: number }) {
    const [state, setState] = useState<CrudState>({ records: [], revision: 0 }),
        [path, setPath] = useState('/items'),
        [query, setQuery] = useState(''),
        [page, setPage] = useState(0),
        [sort, setSort] = useState('id'),
        [descending, setDescending] = useState(false),
        [editor, setEditor] = useState(''),
        [editing, setEditing] = useState<string | null>(null),
        [error, setError] = useState(''),
        [notice, setNotice] = useState(''),
        [busy, setBusy] = useState(false),
        [loaded, setLoaded] = useState(false),
        [confirmation, setConfirmation] = useState<
            { kind: 'delete'; id: string } | { kind: 'reset' } | null
        >(null);
    const pending = useRef<AbortController | null>(null),
        editorSection = useRef<HTMLElement | null>(null);
    async function read(signal: AbortSignal) {
        const value = await (
            await api(`/api/mocks/${resource.id}`, {
                headers: resourceHeaders(resource.managementToken),
                signal,
            })
        ).json();
        if (!value.crud)
            throw new Error(
                'This resource no longer has a CRUD collection. Refresh its configuration.',
            );
        if (!signal.aborted) {
            setPath(value.crud.path);
            setState(value.crudState ?? { records: value.crud.seed, revision: 0 });
            setLoaded(true);
        }
    }
    async function refresh() {
        pending.current?.abort();
        const controller = new AbortController();
        pending.current = controller;
        setBusy(true);
        setError('');
        try {
            await read(controller.signal);
        } catch (error) {
            if (!controller.signal.aborted) setError((error as Error).message);
        } finally {
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    useEffect(() => {
        setLoaded(false);
        setState({ records: [], revision: 0 });
        setEditor('');
        setEditing(null);
        void refresh();
        return () => pending.current?.abort();
    }, [resource.id, resource.accessVersion, resource.managementToken, version]);
    const filtered = useMemo(
        () =>
            state.records
                .filter((record) =>
                    JSON.stringify(record).toLowerCase().includes(query.toLowerCase()),
                )
                .sort((a, b) => {
                    const x = a[sort],
                        y = b[sort];
                    if (x === undefined || x === null) return y === undefined || y === null ? 0 : 1;
                    if (y === undefined || y === null) return -1;
                    const result =
                        typeof x === 'number' && typeof y === 'number'
                            ? x - y
                            : String(x ?? '').localeCompare(String(y ?? ''));
                    return descending ? -result : result;
                }),
        [state, query, sort, descending],
    );
    const maxPage = Math.max(0, Math.ceil(filtered.length / 20) - 1),
        currentPage = Math.min(page, maxPage),
        shown = filtered.slice(currentPage * 20, currentPage * 20 + 20),
        columns = [...new Set(state.records.flatMap((record) => Object.keys(record)))].slice(0, 7);
    function open(record?: Record<string, unknown>) {
        setEditing(record ? String(record.id) : null);
        setEditor(
            JSON.stringify(record ?? { name: 'New task', status: 'todo', priority: 2 }, null, 2),
        );
        setError('');
        setNotice('');
        requestAnimationFrame(() =>
            editorSection.current?.scrollIntoView({
                behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? 'auto'
                    : 'smooth',
                block: 'center',
            }),
        );
    }
    async function write(method: string, id?: string, reset = false) {
        let body: string | undefined;
        if (!reset && method !== 'DELETE') {
            try {
                body = JSON.stringify(validateRecord(parseJsonSafely(editor)));
            } catch {
                setError('Enter a valid JSON record. Large numeric IDs must be strings.');
                return;
            }
        }
        pending.current?.abort();
        const controller = new AbortController();
        pending.current = controller;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const target = reset
                ? `/api/mocks/${resource.id}/reset`
                : `/mock/${resource.id}${path}${id ? `/${encodeURIComponent(id)}` : ''}`;
            const response = await api(target, {
                method,
                signal: controller.signal,
                headers: reset
                    ? resourceHeaders(resource.managementToken)
                    : {
                          'Content-Type': 'application/json',
                          'X-Mock-If-Revision': String(state.revision),
                          ...(resource.accessToken
                              ? { 'X-Access-Token': resource.accessToken }
                              : {}),
                      },
                ...(body ? { body } : {}),
            });
            const status = response.status;
            await read(controller.signal);
            if (!controller.signal.aborted) {
                setEditor('');
                setEditing(null);
                setNotice(
                    reset
                        ? 'Seed restored. The revision was advanced.'
                        : `${method === 'DELETE' ? 'Record deleted' : method === 'POST' ? 'Record created' : 'Record updated'} · HTTP ${status}`,
                );
            }
        } catch (error) {
            if (!controller.signal.aborted) {
                setError((error as Error).message);
                try {
                    await read(controller.signal);
                } catch {}
            }
        } finally {
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    const text = (value: unknown) =>
        value === null
            ? 'null'
            : Array.isArray(value)
              ? `${value.length} items`
              : value && typeof value === 'object'
                ? `${Object.keys(value).length} fields`
                : String(value ?? '—');
    return (
        <section className="crud-live" aria-label="Live CRUD records">
            <div className="crud-heading">
                <div>
                    <span className="content-label">Live collection</span>
                    <h2>{path}</h2>
                    <p>
                        {state.records.length} records · Revision {state.revision}
                    </p>
                </div>
                <div className="button-row">
                    <Button
                        variant="surface"
                        color="gray"
                        disabled={busy}
                        onClick={() => void refresh()}
                    >
                        <Icon name="refresh" size={15} />
                        Refresh records
                    </Button>
                    <Button
                        disabled={busy || !loaded || state.records.length >= 200}
                        onClick={() => open()}
                    >
                        <Icon name="plus" size={15} />
                        Add record
                    </Button>
                </div>
            </div>
            {resource.visibility === 'public' && (
                <p className="tool-notice">
                    Public collection: anyone with the endpoint can read and change its records.
                    Management and seed reset still require separate authorization.
                </p>
            )}
            {error && (
                <div className="alert" role="alert">
                    {error}
                </div>
            )}
            {notice && (
                <p className="resource-notice" role="status">
                    {notice}
                </p>
            )}
            {!loaded && (
                <p role="status">
                    {error ? 'Records unavailable. Try refreshing.' : 'Loading records…'}
                </p>
            )}
            <TextField.Root
                aria-label="Search live records"
                placeholder="Search record values…"
                value={query}
                onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                }}
            >
                <TextField.Slot>
                    <Icon name="search" size={16} />
                </TextField.Slot>
            </TextField.Root>
            <div className="crud-table-scroll" role="region" aria-label="Record table" tabIndex={0}>
                <table className="crud-table">
                    <thead>
                        <tr>
                            {columns.map((column) => (
                                <th
                                    key={column}
                                    aria-sort={
                                        sort === column
                                            ? descending
                                                ? 'descending'
                                                : 'ascending'
                                            : 'none'
                                    }
                                >
                                    <button
                                        onClick={() => {
                                            if (sort === column) setDescending((value) => !value);
                                            else {
                                                setSort(column);
                                                setDescending(false);
                                            }
                                        }}
                                    >
                                        {column}
                                        {sort === column ? (descending ? ' ↓' : ' ↑') : ''}
                                    </button>
                                </th>
                            ))}
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((record) => (
                            <tr key={String(record.id)}>
                                {columns.map((column) => (
                                    <td key={column}>
                                        {typeof record[column] === 'boolean' ? (
                                            <span className="result-chip">
                                                {String(record[column])}
                                            </span>
                                        ) : (
                                            <span title={text(record[column])}>
                                                {text(record[column])}
                                            </span>
                                        )}
                                    </td>
                                ))}
                                <td>
                                    <div className="button-row">
                                        <button
                                            className="button button-small"
                                            disabled={busy}
                                            aria-label={`Inspect or edit ${record.id}`}
                                            onClick={() => open(record)}
                                        >
                                            Inspect / edit
                                        </button>
                                        <button
                                            className="button button-small"
                                            disabled={busy}
                                            aria-label={`Delete record ${record.id}`}
                                            onClick={() =>
                                                setConfirmation({
                                                    kind: 'delete',
                                                    id: String(record.id),
                                                })
                                            }
                                        >
                                            <Icon name="trash" size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {loaded && !shown.length && (
                <p className="crud-empty">
                    {query
                        ? 'No records match this search.'
                        : 'The collection is empty. Add a record or restore its seed.'}
                </p>
            )}
            <div className="crud-pagination">
                <span>
                    {filtered.length} matching records · Page {currentPage + 1} of {maxPage + 1}
                </span>
                <div className="button-row">
                    <Button
                        variant="surface"
                        color="gray"
                        disabled={!currentPage}
                        onClick={() => setPage(currentPage - 1)}
                    >
                        Previous
                    </Button>
                    <Button
                        variant="surface"
                        color="gray"
                        disabled={currentPage >= maxPage}
                        onClick={() => setPage(currentPage + 1)}
                    >
                        Next
                    </Button>
                </div>
            </div>
            <div className="button-row">
                <Button
                    variant="surface"
                    color="gray"
                    disabled={!loaded || busy}
                    onClick={() =>
                        downloadBlob(
                            new Blob([JSON.stringify(state.records, null, 2)], {
                                type: 'application/json',
                            }),
                            'live-records.json',
                        )
                    }
                >
                    <Icon name="download" size={15} />
                    Export live records
                </Button>
                <Button
                    variant="surface"
                    color="gray"
                    disabled={busy || !loaded}
                    onClick={() => {
                        try {
                            saveScenarioDraft(
                                crudScenario(
                                    resource.id,
                                    path,
                                    location.origin,
                                    resource.visibility === 'private',
                                ),
                            );
                            location.assign('/tools/api-test-scenarios/?draft=1');
                        } catch {
                            setError(
                                'Unable to pass the draft to the scenario editor. Allow session storage or export a scenario JSON file.',
                            );
                        }
                    }}
                >
                    Use in API scenarios
                </Button>
                <Button
                    variant="surface"
                    color="gray"
                    disabled={busy || !loaded}
                    onClick={() =>
                        downloadBlob(
                            new Blob(
                                [
                                    JSON.stringify(
                                        crudScenario(
                                            resource.id,
                                            path,
                                            location.origin,
                                            resource.visibility === 'private',
                                        ),
                                        null,
                                        2,
                                    ),
                                ],
                                { type: 'application/json' },
                            ),
                            'crud-lifecycle-scenario.json',
                        )
                    }
                >
                    Export test scenario
                </Button>
                <Button
                    variant="surface"
                    color="gray"
                    disabled={busy || !loaded}
                    onClick={() => setConfirmation({ kind: 'reset' })}
                >
                    Restore seed
                </Button>
            </div>
            {editor && (
                <section
                    ref={editorSection}
                    className="crud-record-editor"
                    aria-label="Record editor"
                >
                    <div className="crud-heading">
                        <h3>{editing ? `Edit ${editing}` : 'Add a record'}</h3>
                        <button
                            className="button button-small"
                            onClick={() => {
                                setEditor('');
                                setEditing(null);
                            }}
                        >
                            Close editor
                        </button>
                    </div>
                    <TextArea
                        aria-label="Record JSON"
                        value={editor}
                        rows={10}
                        maxLength={4096}
                        disabled={busy}
                        onChange={(event) => setEditor(event.target.value)}
                    />
                    <p className="tool-notice">
                        {editing
                            ? 'PATCH merges top-level fields. A null value stays null, and the ID cannot change.'
                            : 'Use a JSON object. Omit id to generate one, or supply a unique string ID.'}{' '}
                        Writes use the displayed revision to detect changes from another client.
                    </p>
                    <Button
                        disabled={busy}
                        onClick={() => void write(editing ? 'PATCH' : 'POST', editing ?? undefined)}
                    >
                        {busy ? 'Saving…' : editing ? 'Save record' : 'Create record'}
                    </Button>
                </section>
            )}
            <details className="crud-api-example">
                <summary>Use this API from your client</summary>
                <CodeExample
                    title="CRUD request examples"
                    code={[
                        `GET /mock/${resource.id}${path}?limit=20&offset=0&sort=priority&order=asc`,
                        `POST /mock/${resource.id}${path}  {"name":"New item"}`,
                        `PATCH /mock/${resource.id}${path}/item_1  {"status":"done"}`,
                        `DELETE /mock/${resource.id}${path}/item_1`,
                        '',
                        '# Private callers: X-Access-Token: <separate access token>',
                        '# Optional write guard: X-Mock-If-Revision: <latest revision>',
                        '# Read X-Mock-Revision from responses; stale guarded writes return 409.',
                    ].join('\n')}
                />
                <p className="tool-notice">
                    List results use {'{data,total,limit,offset,revision}'}. Item reads return the
                    record object. GET and HEAD read; POST creates, PUT replaces, PATCH merges, and
                    DELETE removes. Requests are limited to 120 per minute for this API.
                </p>
            </details>
            <AlertDialog.Root
                open={confirmation !== null}
                onOpenChange={(open) => {
                    if (!open) setConfirmation(null);
                }}
            >
                <AlertDialog.Content maxWidth="460px">
                    <AlertDialog.Title>
                        {confirmation?.kind === 'reset'
                            ? 'Restore the seed records?'
                            : 'Delete this record?'}
                    </AlertDialog.Title>
                    <AlertDialog.Description>
                        {confirmation?.kind === 'reset'
                            ? 'All live changes in this API will be replaced by its configured seed. Other APIs are unaffected.'
                            : `Record ${confirmation?.kind === 'delete' ? confirmation.id : ''} will be removed from this collection.`}
                    </AlertDialog.Description>
                    <div className="button-row" style={{ marginTop: 20 }}>
                        <AlertDialog.Cancel>
                            <Button variant="soft" color="gray">
                                Cancel
                            </Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action>
                            <Button
                                onClick={() => {
                                    const value = confirmation;
                                    if (value?.kind === 'reset')
                                        void write('POST', undefined, true);
                                    else if (value) void write('DELETE', value.id);
                                }}
                            >
                                {confirmation?.kind === 'reset' ? 'Restore seed' : 'Delete record'}
                            </Button>
                        </AlertDialog.Action>
                    </div>
                </AlertDialog.Content>
            </AlertDialog.Root>
        </section>
    );
}
