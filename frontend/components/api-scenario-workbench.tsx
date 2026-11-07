'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Tabs, TextArea, TextField } from '@radix-ui/themes';
import {
    scenarioMethods,
    sampleScenario,
    validateScenario,
    sensitiveName,
} from '@kivel.io/tools/api-scenarios';
import type { ApiScenario, ScenarioRequest, ScenarioReport } from '@kivel.io/tools/api-scenarios';
import { ToolHeader } from './tool-header';
import { AppSelect, SelectOption } from './app-select';
import { Icon } from './icons';
import { ResultPreview, downloadBlob } from './result-preview';
import { CodeExample } from './code-example';
import { api } from '../lib/api';
import { takeScenarioDraft } from '../lib/scenario-handoff';
import { parseJsonSafely } from '@kivel.io/tools/engine';

const STORAGE = 'kivel:api-scenarios:v1';
const clientExample = [
    "jq -Rs '{input: .}' api-scenario.json |",
    "  curl https://kivel.io/api/tools/mock-apis-api-test-scenarios/run -H 'Content-Type: application/json' --data-binary @-",
    '',
    '# For a scenario without secret inputs:',
    'kivel run mock-apis-api-test-scenarios < api-scenario.json',
    '',
    '# SDK: kivel.run("mock-apis-api-test-scenarios", JSON.stringify(scenario))',
    '# MCP: run_tool with the same toolId and input',
    '# Supply declared secrets separately in options.secret as a JSON string.',
].join('\n');
const freshRequest = (): ScenarioRequest => ({
    name: 'New request',
    method: 'GET',
    path: '/',
    headers: { accept: 'application/json' },
    body: '',
    expect: { status: 200 },
});
export function ApiScenarioWorkbench() {
    const [scenario, setScenario] = useState<ApiScenario>(() => structuredClone(sampleScenario));
    const [selected, setSelected] = useState(0);
    const [secrets, setSecrets] = useState<Record<string, string>>({});
    const [saved, setSaved] = useState<ApiScenario[]>([]);
    const [savedIndex, setSavedIndex] = useState('none');
    const [newName, setNewName] = useState('');
    const [importText, setImportText] = useState('');
    const [report, setReport] = useState<ScenarioReport | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const pending = useRef<AbortController | null>(null);
    const reportSection = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (report)
            reportSection.current?.scrollIntoView({
                behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? 'instant'
                    : 'smooth',
                block: 'start',
            });
    }, [report]);
    useEffect(() => {
        if (new URLSearchParams(location.search).get('draft') === '1') {
            try {
                const draft = takeScenarioDraft();
                if (draft) {
                    setScenario(draft);
                    setNotice(
                        'CRUD lifecycle draft loaded. Review its requests and supply any access token separately. Nothing has been sent.',
                    );
                }
            } catch {
                setError('Unable to load the draft. Import its scenario JSON instead.');
            }
        }
        try {
            const values: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? '[]');
            if (Array.isArray(values))
                setSaved(
                    values.slice(0, 12).flatMap((item) => {
                        try {
                            return [validateScenario(item)];
                        } catch {
                            return [];
                        }
                    }),
                );
        } catch {}
        return () => pending.current?.abort();
    }, []);
    function cancel() {
        pending.current?.abort();
        pending.current = null;
        setBusy(false);
    }
    function edit(update: (value: ApiScenario) => void) {
        cancel();
        setReport(null);
        setError('');
        setNotice('');
        setScenario((current) => {
            const next = structuredClone(current);
            update(next);
            return next;
        });
    }
    function editStep(update: (step: ScenarioRequest) => void) {
        edit((value) => update(value.requests[selected]!));
    }
    function load(value: ApiScenario) {
        cancel();
        setScenario(structuredClone(value));
        setSelected(0);
        setSecrets({});
        setReport(null);
        setError('');
        setNotice('');
    }
    function persist(next: ApiScenario[]) {
        localStorage.setItem(STORAGE, JSON.stringify(next));
        setSaved(next);
    }
    function save() {
        try {
            const clean = validateScenario(scenario),
                index = saved.findIndex((value) => value.name === clean.name);
            const next = [...saved];
            if (index < 0) {
                if (next.length >= 12)
                    throw new Error(
                        'This browser can keep twelve scenarios. Remove one before saving another.',
                    );
                next.push(clean);
            } else next[index] = clean;
            persist(next);
            setSavedIndex(String(index < 0 ? next.length - 1 : index));
            setNotice('Scenario saved in this browser. Secret values and reports were excluded.');
            setError('');
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : 'Unable to save. Check browser storage permissions.',
            );
        }
    }
    function addVariable(secret: boolean) {
        const key = newName.trim();
        if (!secret && sensitiveName(key)) {
            setError('Use Add secret for a token, password or API key.');
            return;
        }
        if (
            !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) ||
            ['constructor', 'prototype', '__proto__'].includes(key) ||
            Object.hasOwn(scenario.variables, key) ||
            scenario.secretNames.includes(key)
        ) {
            setError(
                'Choose a new variable name using letters, numbers and underscores, starting with a letter.',
            );
            return;
        }
        if (
            (secret && scenario.secretNames.length >= 10) ||
            (!secret && Object.keys(scenario.variables).length >= 20)
        ) {
            setError('The variable limit has been reached.');
            return;
        }
        edit((value) => {
            if (secret) value.secretNames.push(key);
            else value.variables[key] = '';
        });
        setNewName('');
    }
    async function run() {
        cancel();
        setError('');
        setNotice('');
        setReport(null);
        let clean: ApiScenario;
        try {
            clean = validateScenario(scenario);
            if (clean.secretNames.some((key) => !secrets[key]))
                throw new Error('Fill every declared secret before running.');
            if (
                JSON.stringify(
                    Object.fromEntries(clean.secretNames.map((key) => [key, secrets[key]])),
                ).length > 4096
            )
                throw new Error('Combined secret values must fit within 4,096 JSON characters.');
        } catch (failure) {
            setError(
                failure instanceof Error ? failure.message : 'Check the scenario configuration.',
            );
            return;
        }
        const controller = new AbortController();
        pending.current = controller;
        setBusy(true);
        try {
            const response = await api(
                '/api/tools/mock-apis-api-test-scenarios/run',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify({
                        input: JSON.stringify(clean),
                        options: {
                            secret: JSON.stringify(
                                Object.fromEntries(
                                    clean.secretNames.map((key) => [key, secrets[key]]),
                                ),
                            ),
                        },
                    }),
                },
                25000,
            );
            const value = await response.json();
            if (!controller.signal.aborted) setReport(JSON.parse(value.output));
        } catch (failure) {
            if (!controller.signal.aborted)
                setError(
                    failure instanceof Error ? failure.message : 'Unable to run the scenario.',
                );
        } finally {
            if (pending.current === controller) {
                pending.current = null;
                setBusy(false);
            }
        }
    }
    const step = scenario.requests[selected]!;
    return (
        <div className="page-width work-page scenario-workbench">
            <ToolHeader toolId="mock-apis-api-test-scenarios">
                <Button size="3" disabled={busy} onClick={() => void run()}>
                    <Icon name="play" size={17} />
                    {busy ? 'Running…' : 'Run scenario'}
                </Button>
            </ToolHeader>
            <p className="scenario-intro">
                One repeatable check, from the first request to the last. Keep the setup, inspect
                every response, and share the scenario when it works.
            </p>
            <div className="scenario-library">
                <AppSelect
                    aria-label="Saved scenarios"
                    value={savedIndex}
                    onChange={(event) => {
                        setSavedIndex(event.target.value);
                        if (event.target.value !== 'none') load(saved[Number(event.target.value)]!);
                    }}
                >
                    <SelectOption value="none">Saved in this browser</SelectOption>
                    {saved.map((value, index) => (
                        <SelectOption key={index} value={String(index)}>
                            {value.name}
                        </SelectOption>
                    ))}
                </AppSelect>
                <Button variant="surface" color="gray" onClick={save}>
                    <Icon name="check" size={15} />
                    Save scenario
                </Button>
                <Button
                    variant="surface"
                    color="gray"
                    disabled={savedIndex === 'none'}
                    onClick={() => {
                        try {
                            persist(saved.filter((_, index) => index !== Number(savedIndex)));
                            setSavedIndex('none');
                            setNotice('Saved copy removed. The editor is unchanged.');
                        } catch {
                            setError('Unable to update browser storage.');
                        }
                    }}
                >
                    Remove saved copy
                </Button>
            </div>
            <p className="tool-notice">
                Saving keeps request bodies and ordinary variables in this browser. Secret input
                values and run reports are never saved.
            </p>
            {error && (
                <div className="alert" role="alert">
                    {error}
                </div>
            )}
            {notice && (
                <p className="scenario-notice" role="status">
                    {notice}
                </p>
            )}
            <section className="scenario-config" aria-label="Scenario settings">
                <label>
                    Scenario name
                    <TextField.Root
                        aria-label="Scenario name"
                        value={scenario.name}
                        maxLength={80}
                        onChange={(event) =>
                            edit((value) => {
                                value.name = event.target.value;
                            })
                        }
                    />
                </label>
                <label>
                    Base origin
                    <TextField.Root
                        aria-label="Base origin"
                        placeholder="https://api.example.com"
                        value={scenario.baseUrl}
                        maxLength={500}
                        onChange={(event) =>
                            edit((value) => {
                                value.baseUrl = event.target.value;
                            })
                        }
                    />
                </label>
                <label className="scenario-check">
                    <Checkbox
                        checked={scenario.stopOnFailure}
                        onCheckedChange={(value) =>
                            edit((next) => {
                                next.stopOnFailure = value === true;
                            })
                        }
                    />{' '}
                    Stop after a failed request or check
                </label>
            </section>
            <div className="scenario-layout">
                <aside className="scenario-requests" aria-label="Scenario requests">
                    <div className="scenario-section-head">
                        <h2>Requests</h2>
                        <span>{scenario.requests.length} / 6</span>
                    </div>
                    <div className="scenario-request-list">
                        {scenario.requests.map((value, index) => (
                            <button
                                className={`scenario-request ${selected === index ? 'is-selected' : ''}`}
                                key={index}
                                aria-pressed={selected === index}
                                onClick={() => setSelected(index)}
                            >
                                <span className="scenario-order">
                                    {String(index + 1).padStart(2, '0')}
                                </span>
                                <span>
                                    <strong>{value.name || 'Untitled request'}</strong>
                                    <small>
                                        <b>{value.method}</b> {value.path || '/'}
                                    </small>
                                </span>
                            </button>
                        ))}
                    </div>
                    <Button
                        variant="soft"
                        color="gray"
                        disabled={scenario.requests.length >= 6}
                        onClick={() => {
                            const index = scenario.requests.length;
                            edit((value) => {
                                value.requests.push(freshRequest());
                            });
                            setSelected(index);
                        }}
                    >
                        <Icon name="plus" size={15} />
                        Add request
                    </Button>
                </aside>
                <section className="scenario-editor" aria-label="Request editor">
                    <div className="scenario-section-head">
                        <h2>Request {selected + 1}</h2>
                        <div className="button-row">
                            <button
                                className="button button-small"
                                disabled={selected === 0}
                                aria-label="Move request earlier"
                                onClick={() => {
                                    edit((value) => {
                                        [value.requests[selected - 1], value.requests[selected]] = [
                                            value.requests[selected]!,
                                            value.requests[selected - 1]!,
                                        ];
                                    });
                                    setSelected(selected - 1);
                                }}
                            >
                                Move up
                            </button>
                            <button
                                className="button button-small"
                                disabled={selected === scenario.requests.length - 1}
                                aria-label="Move request later"
                                onClick={() => {
                                    edit((value) => {
                                        [value.requests[selected + 1], value.requests[selected]] = [
                                            value.requests[selected]!,
                                            value.requests[selected + 1]!,
                                        ];
                                    });
                                    setSelected(selected + 1);
                                }}
                            >
                                Move down
                            </button>
                            <button
                                className="button button-small"
                                disabled={scenario.requests.length === 1}
                                aria-label="Remove request"
                                onClick={() => {
                                    edit((value) => {
                                        value.requests.splice(selected, 1);
                                    });
                                    setSelected(Math.max(0, selected - 1));
                                }}
                            >
                                <Icon name="trash" size={15} />
                            </button>
                        </div>
                    </div>
                    <label>
                        Request name
                        <TextField.Root
                            aria-label="Request name"
                            value={step.name}
                            maxLength={80}
                            onChange={(event) =>
                                editStep((value) => {
                                    value.name = event.target.value;
                                })
                            }
                        />
                    </label>
                    <div className="scenario-address">
                        <AppSelect
                            aria-label="Request method"
                            value={step.method}
                            onChange={(event) =>
                                editStep((value) => {
                                    value.method = event.target.value as ScenarioRequest['method'];
                                    if (['GET', 'HEAD'].includes(value.method)) value.body = '';
                                })
                            }
                        >
                            {scenarioMethods.map((method) => (
                                <SelectOption key={method} value={method}>
                                    {method}
                                </SelectOption>
                            ))}
                        </AppSelect>
                        <TextField.Root
                            aria-label="Request path"
                            value={step.path}
                            maxLength={1500}
                            placeholder="/items/{{itemId}}"
                            onChange={(event) =>
                                editStep((value) => {
                                    value.path = event.target.value;
                                })
                            }
                        />
                    </div>
                    <Tabs.Root defaultValue="request" key={selected}>
                        <Tabs.List aria-label="Request configuration">
                            <Tabs.Trigger value="request">Request</Tabs.Trigger>
                            <Tabs.Trigger value="checks">Checks</Tabs.Trigger>
                            <Tabs.Trigger value="capture">Capture value</Tabs.Trigger>
                        </Tabs.List>
                        <Tabs.Content value="request">
                            <label>
                                Headers
                                <span className="tool-notice">
                                    One Name: value per line. Use {'{{secretName}}'} placeholders
                                    for credentials.
                                </span>
                                <ScenarioHeaders
                                    value={step.headers}
                                    onChange={(headers) =>
                                        editStep((value) => {
                                            value.headers = headers;
                                        })
                                    }
                                />
                            </label>
                            <label>
                                Body
                                <span className="tool-notice">
                                    JSON placeholders belong inside quoted strings. GET and HEAD
                                    requests have no body.
                                </span>
                                <TextArea
                                    aria-label="Request body"
                                    rows={7}
                                    disabled={['GET', 'HEAD'].includes(step.method)}
                                    maxLength={8192}
                                    value={step.body}
                                    onChange={(event) =>
                                        editStep((value) => {
                                            value.body = event.target.value;
                                        })
                                    }
                                />
                            </label>
                        </Tabs.Content>
                        <Tabs.Content value="checks">
                            <div className="scenario-fields">
                                <label>
                                    Expected HTTP status
                                    <TextField.Root
                                        aria-label="Expected HTTP status"
                                        type="number"
                                        min="100"
                                        max="599"
                                        value={String(step.expect.status)}
                                        onChange={(event) =>
                                            editStep((value) => {
                                                value.expect.status = Number(event.target.value);
                                            })
                                        }
                                    />
                                </label>
                                <label>
                                    Body contains (optional)
                                    <TextField.Root
                                        aria-label="Body contains"
                                        maxLength={500}
                                        value={step.expect.contains ?? ''}
                                        onChange={(event) =>
                                            editStep((value) => {
                                                value.expect.contains = event.target.value;
                                            })
                                        }
                                    />
                                </label>
                            </div>
                            <label>
                                JSON field path (optional)
                                <TextField.Root
                                    aria-label="JSON check field path"
                                    placeholder="data.id or items.0.name"
                                    maxLength={160}
                                    value={step.expect.json?.path ?? ''}
                                    onChange={(event) =>
                                        editStep((value) => {
                                            if (!event.target.value) delete value.expect.json;
                                            else
                                                value.expect.json = {
                                                    path: event.target.value,
                                                    equals: value.expect.json?.equals ?? '',
                                                };
                                        })
                                    }
                                />
                            </label>
                            {step.expect.json && (
                                <JsonExpected
                                    value={step.expect.json.equals}
                                    onChange={(equals) =>
                                        editStep((value) => {
                                            value.expect.json!.equals = equals;
                                        })
                                    }
                                />
                            )}
                            <p className="tool-notice">
                                Checks compare the actual response with your expectations. A failed
                                check appears in the report and does not mean the runner itself
                                failed.
                            </p>
                        </Tabs.Content>
                        <Tabs.Content value="capture">
                            <p className="tool-notice">
                                Capture a non-secret JSON value for later request paths, headers or
                                bodies. Example: read items.0.id as itemId, then use {'{{itemId}}'}{' '}
                                in the next request. Tokens and credentials belong in the separate
                                secret inputs.
                            </p>
                            <label>
                                New variable name
                                <TextField.Root
                                    aria-label="Captured variable name"
                                    value={step.extract?.name ?? ''}
                                    maxLength={40}
                                    placeholder="itemId"
                                    onChange={(event) =>
                                        editStep((value) => {
                                            if (!event.target.value) delete value.extract;
                                            else
                                                value.extract = {
                                                    name: event.target.value,
                                                    path: value.extract?.path ?? '',
                                                };
                                        })
                                    }
                                />
                            </label>
                            {step.extract && (
                                <label>
                                    JSON field to capture
                                    <TextField.Root
                                        aria-label="Captured JSON field path"
                                        value={step.extract.path}
                                        maxLength={160}
                                        placeholder="items.0.id"
                                        onChange={(event) =>
                                            editStep((value) => {
                                                value.extract!.path = event.target.value;
                                            })
                                        }
                                    />
                                </label>
                            )}
                        </Tabs.Content>
                    </Tabs.Root>
                </section>
            </div>
            <section className="scenario-environment" aria-label="Environment and secrets">
                <div className="scenario-section-head">
                    <h2>Environment & secrets</h2>
                    <span>Reusable setup, separate credentials</span>
                </div>
                {Object.entries(scenario.variables).map(([key, value]) => (
                    <div className="scenario-variable" key={key}>
                        <code>{key}</code>
                        <TextField.Root
                            aria-label={`Variable ${key}`}
                            value={value}
                            maxLength={1024}
                            onChange={(event) =>
                                edit((next) => {
                                    next.variables[key] = event.target.value;
                                })
                            }
                        />
                        <button
                            className="button button-small"
                            aria-label={`Remove variable ${key}`}
                            onClick={() =>
                                edit((next) => {
                                    delete next.variables[key];
                                })
                            }
                        >
                            <Icon name="trash" size={15} />
                        </button>
                    </div>
                ))}
                {scenario.secretNames.map((key) => (
                    <div className="scenario-variable" key={key}>
                        <code>
                            {key} <small>secret</small>
                        </code>
                        <TextField.Root
                            type="password"
                            autoComplete="off"
                            aria-label={`Secret ${key}`}
                            value={secrets[key] ?? ''}
                            maxLength={2000}
                            placeholder="Only sent when you run"
                            onChange={(event) => {
                                cancel();
                                setReport(null);
                                setSecrets((current) => ({
                                    ...current,
                                    [key]: event.target.value,
                                }));
                            }}
                        />
                        <button
                            className="button button-small"
                            aria-label={`Remove secret ${key}`}
                            onClick={() => {
                                edit((next) => {
                                    next.secretNames = next.secretNames.filter(
                                        (name) => name !== key,
                                    );
                                });
                                setSecrets((current) => {
                                    const next = { ...current };
                                    delete next[key];
                                    return next;
                                });
                            }}
                        >
                            <Icon name="trash" size={15} />
                        </button>
                    </div>
                ))}
                <div className="scenario-new-variable">
                    <TextField.Root
                        aria-label="New variable name"
                        placeholder="Variable name"
                        value={newName}
                        maxLength={40}
                        onChange={(event) => setNewName(event.target.value)}
                    />
                    <Button variant="surface" color="gray" onClick={() => addVariable(false)}>
                        Add variable
                    </Button>
                    <Button variant="surface" color="gray" onClick={() => addVariable(true)}>
                        Add secret
                    </Button>
                </div>
                <p className="tool-notice">
                    Secret values are sent only to this scenario’s base origin, through headers.
                    They are excluded from saved scenarios and exports, and known values are
                    redacted from the report.
                </p>
            </section>
            <div className="scenario-run-bar">
                <div>
                    <strong>{scenario.requests.length} sequential requests</strong>
                    <span>{scenario.baseUrl || 'Set a base origin before running'}</span>
                </div>
                <div className="button-row">
                    {busy ? (
                        <Button
                            variant="surface"
                            color="gray"
                            onClick={() => {
                                cancel();
                                setNotice(
                                    'Run cancelled. Requests already sent may have reached the destination.',
                                );
                            }}
                        >
                            Cancel run
                        </Button>
                    ) : (
                        <Button size="3" onClick={() => void run()}>
                            <Icon name="play" size={17} />
                            Run configured requests
                        </Button>
                    )}
                </div>
            </div>
            <p className="tool-notice">
                Sends real HTTP requests from Kivel. Use a test endpoint you control or are
                authorized to test. Nothing runs on page load. A completed report uses one hosted
                run, including failed checks.
            </p>
            {busy && (
                <div className="scenario-running" role="status">
                    <span className="status-dot" />
                    Running requests in order. Each request has a three-second deadline.
                </div>
            )}
            <div ref={reportSection} className="scenario-report-anchor">
                {report && <ScenarioResults report={report} />}
            </div>
            <details className="scenario-portability">
                <summary>Import, export & API access</summary>
                <div className="button-row">
                    <Button
                        variant="surface"
                        color="gray"
                        onClick={() => {
                            try {
                                const clean = validateScenario(scenario);
                                downloadBlob(
                                    new Blob([JSON.stringify(clean, null, 2)], {
                                        type: 'application/json',
                                    }),
                                    'api-scenario.json',
                                );
                            } catch (failure) {
                                setError(
                                    failure instanceof Error
                                        ? failure.message
                                        : 'Check the scenario.',
                                );
                            }
                        }}
                    >
                        Export scenario JSON
                    </Button>
                </div>
                <label>
                    Import Kivel scenario JSON
                    <TextArea
                        aria-label="Import scenario JSON"
                        value={importText}
                        rows={6}
                        maxLength={32768}
                        onChange={(event) => setImportText(event.target.value)}
                    />
                </label>
                <Button
                    variant="surface"
                    color="gray"
                    onClick={() => {
                        try {
                            let value;
                            try {
                                value = parseJsonSafely(importText);
                            } catch {
                                throw new Error('Paste a valid JSON scenario.');
                            }
                            load(validateScenario(value));
                            setSavedIndex('none');
                            setImportText('');
                            setNotice('Scenario imported. Supply secret values separately.');
                        } catch (failure) {
                            setError(
                                failure instanceof Error
                                    ? failure.message
                                    : 'Unable to import scenario.',
                            );
                        }
                    }}
                >
                    Load scenario
                </Button>
                <p className="tool-notice">
                    Imports configure the editor; they never run automatically. This version uses
                    the Kivel scenario format rather than importing executable Postman scripts.
                </p>
                <CodeExample title="Use the scenario from curl" code={clientExample} />
            </details>
        </div>
    );
}
function ScenarioHeaders({
    value,
    onChange,
}: {
    value: Record<string, string>;
    onChange: (value: Record<string, string>) => void;
}) {
    const serialize = (headers: Record<string, string>) =>
        Object.entries(headers)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
    const [text, setText] = useState(() => serialize(value));
    const focused = useRef(false);
    useEffect(() => {
        if (!focused.current && !Object.hasOwn(value, 'invalid header')) setText(serialize(value));
    }, [value]);
    return (
        <TextArea
            aria-label="Request headers"
            rows={4}
            value={text}
            maxLength={8192}
            onFocus={() => {
                focused.current = true;
            }}
            onBlur={() => {
                focused.current = false;
            }}
            onChange={(event) => {
                setText(event.target.value);
                const headers: Record<string, string> = {};
                let invalid = false;
                for (const line of event.target.value.split('\n').filter((line) => line.trim())) {
                    const colon = line.indexOf(':'),
                        key = line.slice(0, colon).trim().toLowerCase();
                    if (colon < 1 || Object.hasOwn(headers, key)) {
                        invalid = true;
                        break;
                    }
                    headers[key] = line.slice(colon + 1).trim();
                }
                onChange(invalid ? { 'invalid header': 'Use unique Name: value lines.' } : headers);
            }}
        />
    );
}
function JsonExpected({
    value,
    onChange,
}: {
    value: string | number | boolean | null;
    onChange: (value: string | number | boolean | null) => void;
}) {
    const kind = value === null ? 'null' : typeof value;
    return (
        <div className="scenario-fields">
            <label>
                Value type
                <AppSelect
                    aria-label="Expected JSON value type"
                    value={kind}
                    onChange={(event) =>
                        onChange(
                            event.target.value === 'null'
                                ? null
                                : event.target.value === 'boolean'
                                  ? true
                                  : event.target.value === 'number'
                                    ? 0
                                    : '',
                        )
                    }
                >
                    {['string', 'number', 'boolean', 'null'].map((type) => (
                        <SelectOption key={type} value={type}>
                            {type}
                        </SelectOption>
                    ))}
                </AppSelect>
            </label>
            {kind === 'boolean' ? (
                <label>
                    Expected value
                    <AppSelect
                        aria-label="Expected JSON value"
                        value={String(value)}
                        onChange={(event) => onChange(event.target.value === 'true')}
                    >
                        <SelectOption value="true">true</SelectOption>
                        <SelectOption value="false">false</SelectOption>
                    </AppSelect>
                </label>
            ) : (
                kind !== 'null' && (
                    <label>
                        Expected value
                        <TextField.Root
                            aria-label="Expected JSON value"
                            type={kind === 'number' ? 'number' : 'text'}
                            value={String(value)}
                            maxLength={500}
                            onChange={(event) =>
                                onChange(
                                    kind === 'number'
                                        ? Number(event.target.value)
                                        : event.target.value,
                                )
                            }
                        />
                    </label>
                )
            )}
        </div>
    );
}
export function ScenarioResults({ report }: { report: ScenarioReport }) {
    const passed = report.results.filter((result) => result.outcome === 'passed').length;
    return (
        <section className="scenario-report" aria-label="Scenario run report">
            <div className="scenario-report-head">
                <div>
                    <span className={`result-chip ${report.passed ? 'is-good' : 'is-attention'}`}>
                        {report.passed ? 'All checks passed' : 'Needs attention'}
                    </span>
                    <h2>{report.name}</h2>
                    <p>{report.origin}</p>
                </div>
                <dl>
                    <div>
                        <dt>Passed</dt>
                        <dd>
                            {passed} / {report.total}
                        </dd>
                    </div>
                    <div>
                        <dt>Completed</dt>
                        <dd>{report.completed}</dd>
                    </div>
                    <div>
                        <dt>Total time</dt>
                        <dd>{report.durationMs} ms</dd>
                    </div>
                </dl>
            </div>
            {report.results.map((result, index) => (
                <details
                    className={`scenario-result is-${result.outcome}`}
                    key={index}
                    open={result.outcome === 'failed' || index === 0}
                >
                    <summary>
                        <span className="scenario-order">{index + 1}</span>
                        <span>
                            <strong>{result.name}</strong>
                            <small>
                                {result.method} {result.path}
                            </small>
                        </span>
                        <span className="scenario-outcome">{result.outcome}</span>
                        <span>
                            {result.status ?? '—'} · {result.durationMs ?? 0} ms
                        </span>
                    </summary>
                    <div className="scenario-result-body">
                        {result.error && <p className="alert">{result.error}</p>}
                        {result.outcome === 'skipped' && (
                            <p className="tool-notice">
                                Skipped because an earlier request or check failed.
                            </p>
                        )}
                        {result.checks.length > 0 && (
                            <div
                                className="scenario-check-table"
                                role="region"
                                aria-label={`Checks for ${result.name}`}
                                tabIndex={0}
                            >
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Check</th>
                                            <th>Result</th>
                                            <th>Expected</th>
                                            <th>Actual</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.checks.map((check, i) => (
                                            <tr key={i}>
                                                <th scope="row">{check.label}</th>
                                                <td>
                                                    <span
                                                        className={`result-chip ${check.passed ? 'is-good' : 'is-attention'}`}
                                                    >
                                                        {check.passed ? 'Passed' : 'Failed'}
                                                    </span>
                                                </td>
                                                <td data-label="Expected">
                                                    {check.expected === undefined
                                                        ? '—'
                                                        : JSON.stringify(check.expected)}
                                                </td>
                                                <td data-label="Actual">
                                                    {check.actual === undefined
                                                        ? '—'
                                                        : JSON.stringify(check.actual)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {result.captured && (
                            <p className="tool-notice">
                                Captured variable: <code>{result.captured}</code>
                            </p>
                        )}
                        {result.body !== undefined && (
                            <ResultPreview
                                text={result.body}
                                title={`${result.name} response`}
                                filename={`response-${index + 1}.txt`}
                            />
                        )}
                        {result.headers && (
                            <details className="scenario-response-headers">
                                <summary>
                                    Response headers · {result.bytes ?? 0} bytes
                                    {result.truncated ? ' · truncated' : ''}
                                </summary>
                                <dl>
                                    {Object.entries(result.headers).map(([key, value]) => (
                                        <div key={key}>
                                            <dt>{key}</dt>
                                            <dd>
                                                {Array.isArray(value)
                                                    ? value.join(', ')
                                                    : String(value ?? '')}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </details>
                        )}
                    </div>
                </details>
            ))}
            <Button
                variant="surface"
                color="gray"
                onClick={() =>
                    downloadBlob(
                        new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
                        'scenario-report.json',
                    )
                }
            >
                <Icon name="download" size={15} />
                Download report
            </Button>
        </section>
    );
}
