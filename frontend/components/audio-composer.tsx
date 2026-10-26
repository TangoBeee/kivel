'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Switch } from '@radix-ui/themes';
import { defaultRecipe, musicTracks, noteName, validateRecipe } from '@socket-help/tools/audio';
import type { AudioRecipe } from '@socket-help/tools/audio';
import { AppSelect, SelectOption } from './app-select';
import { AppSlider as Slider } from './app-slider';
import { ToolHeader } from './tool-header';
import { GeneratedFilePreview } from './generated-preview';
import { CodeExample } from './code-example';
import { downloadBlob } from './result-preview';
import { Icon } from './icons';
const parts = ['melody', 'bass', 'drums', 'pad'] as const;
export function AudioComposer({ toolId }: { toolId: string }) {
    const [recipe, setRecipe] = useState<AudioRecipe>(() => defaultRecipe()),
        [preset, setPreset] = useState(musicTracks[0].id as string),
        [output, setOutput] = useState(''),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(''),
        [importText, setImportText] = useState('');
    const worker = useRef<Worker | null>(null),
        timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    function cancel() {
        worker.current?.terminate();
        worker.current = null;
        if (timer.current) clearTimeout(timer.current);
        setBusy(false);
    }
    useEffect(
        () => () => {
            worker.current?.terminate();
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );
    useEffect(() => {
        const track = new URLSearchParams(location.search).get('track');
        if (track && musicTracks.some((t) => t.id === track)) {
            setPreset(track);
            setRecipe(defaultRecipe(track));
        }
    }, []);
    function change(next: AudioRecipe) {
        cancel();
        setRecipe(next);
        setOutput('');
        setError('');
    }
    function render() {
        cancel();
        setError('');
        try {
            const value = validateRecipe(recipe),
                next = new Worker(new URL('../lib/audio-worker.ts', import.meta.url), {
                    type: 'module',
                });
            worker.current = next;
            setBusy(true);
            timer.current = setTimeout(() => {
                cancel();
                setError('Rendering took too long. Try fewer bars.');
            }, 10000);
            next.onmessage = (event) => {
                cancel();
                if (event.data.error) setError(event.data.error);
                else setOutput(event.data.output);
            };
            next.onerror = () => {
                cancel();
                setError('Unable to render the audio. Try again with fewer bars.');
            };
            next.postMessage(value);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Invalid arrangement.');
        }
    }
    const duration = (recipe.bars * 240) / recipe.bpm;
    return (
        <div className="page-width work-page audio-studio">
            <ToolHeader toolId={toolId}>
                <span className="badge badge-green">Local audio studio</span>
            </ToolHeader>
            <p className="studio-intro">
                Start with a musical idea. Shape the notes, build a rhythm, and make the mix your
                own.
            </p>
            {error && (
                <div className="alert" role="alert">
                    {error}
                </div>
            )}
            <section className="studio-settings" aria-label="Composition settings">
                <label>
                    Starting arrangement
                    <AppSelect
                        value={preset}
                        onChange={(e) => {
                            setPreset(e.target.value);
                            change(defaultRecipe(e.target.value));
                        }}
                    >
                        {musicTracks.map((t) => (
                            <SelectOption key={t.id} value={t.id}>
                                {t.title}
                            </SelectOption>
                        ))}
                    </AppSelect>
                </label>
                <label>
                    Tempo <span>{recipe.bpm} BPM</span>
                    <Slider
                        aria-label="Tempo"
                        min={55}
                        max={180}
                        value={[recipe.bpm]}
                        onValueChange={([bpm]) =>
                            change({
                                ...recipe,
                                bpm: bpm!,
                                bars: (recipe.bars * 240) / bpm! > 29 ? 4 : recipe.bars,
                            })
                        }
                    />
                </label>
                <label>
                    Key
                    <AppSelect
                        value={String(recipe.root)}
                        onChange={(e) => {
                            const root = Number(e.target.value),
                                delta = root - recipe.root;
                            change({
                                ...recipe,
                                root,
                                melody: recipe.melody.map((n) =>
                                    n === null ? null : Math.max(24, Math.min(96, n + delta)),
                                ),
                                bass: recipe.bass.map((n) =>
                                    n === null ? null : Math.max(24, Math.min(96, n + delta)),
                                ),
                            });
                        }}
                    >
                        {Array.from({ length: 25 }, (_, i) => (
                            <SelectOption key={i} value={String(48 + i)}>
                                {noteName(48 + i)}
                            </SelectOption>
                        ))}
                    </AppSelect>
                </label>
                <label>
                    Harmony
                    <AppSelect
                        value={recipe.scale}
                        onChange={(e) =>
                            change({ ...recipe, scale: e.target.value as AudioRecipe['scale'] })
                        }
                    >
                        <SelectOption value="major">Major</SelectOption>
                        <SelectOption value="minor">Minor</SelectOption>
                        <SelectOption value="pentatonic">Pentatonic</SelectOption>
                    </AppSelect>
                </label>
                <label>
                    Lead instrument
                    <AppSelect
                        value={recipe.voice}
                        onChange={(e) =>
                            change({ ...recipe, voice: e.target.value as AudioRecipe['voice'] })
                        }
                    >
                        <SelectOption value="keys">Warm keys</SelectOption>
                        <SelectOption value="pluck">Plucked strings</SelectOption>
                        <SelectOption value="bell">Glass bells</SelectOption>
                        <SelectOption value="synth">Soft synth</SelectOption>
                    </AppSelect>
                </label>
                <label>
                    Length
                    <AppSelect
                        value={String(recipe.bars)}
                        onChange={(e) => change({ ...recipe, bars: Number(e.target.value) })}
                    >
                        {[1, 2, 4, 8].map((b) => (
                            <SelectOption
                                key={b}
                                value={String(b)}
                                disabled={(b * 240) / recipe.bpm > 29}
                            >
                                {b} bars
                            </SelectOption>
                        ))}
                    </AppSelect>
                </label>
            </section>
            {(['melody', 'bass'] as const).map((part) => (
                <section key={part} className="studio-track" aria-label={`${part} sequencer`}>
                    <div className="studio-track-heading">
                        <div>
                            <h2>{part === 'melody' ? 'Melody' : 'Bass'}</h2>
                            <p>One bar, sixteen steps. Choose a note or leave a rest.</p>
                        </div>
                        {part === 'melody' && <span>{duration.toFixed(1)} sec · stereo WAV</span>}
                    </div>
                    <div className="melody-steps">
                        {recipe[part].map((note, index) => (
                            <label key={index} className={note === null ? 'is-rest' : ''}>
                                <span>{String(index + 1).padStart(2, '0')}</span>
                                <AppSelect
                                    aria-label={`${part} step ${index + 1}`}
                                    value={note === null ? 'rest' : String(note)}
                                    onChange={(e) =>
                                        change({
                                            ...recipe,
                                            [part]: recipe[part].map((n, i) =>
                                                i === index
                                                    ? e.target.value === 'rest'
                                                        ? null
                                                        : Number(e.target.value)
                                                    : n,
                                            ),
                                        })
                                    }
                                >
                                    <SelectOption value="rest">Rest</SelectOption>
                                    {Array.from({ length: 73 }, (_, i) => 24 + i).map((n) => (
                                        <SelectOption key={n} value={String(n)}>
                                            {noteName(n)}
                                        </SelectOption>
                                    ))}
                                </AppSelect>
                            </label>
                        ))}
                    </div>
                </section>
            ))}
            <section className="studio-track" aria-label="Drum sequencer">
                <div className="studio-track-heading">
                    <div>
                        <h2>Rhythm</h2>
                        <p>Toggle the steps to build your own beat.</p>
                    </div>
                </div>
                <div className="drum-scroll" tabIndex={0} aria-label="Sixteen-step drum pattern">
                    <div className="drum-grid">
                        <span />{' '}
                        {Array.from({ length: 16 }, (_, i) => (
                            <span key={i} className="step-number">
                                {i + 1}
                            </span>
                        ))}
                        {(['kick', 'snare', 'hat'] as const).map((part) => (
                            <div className="drum-row" key={part}>
                                <strong>
                                    {part === 'hat' ? 'Hi-hat' : part === 'kick' ? 'Kick' : 'Snare'}
                                </strong>
                                {recipe[part].map((on, i) => (
                                    <button
                                        type="button"
                                        key={i}
                                        aria-label={`${part} step ${i + 1}`}
                                        aria-pressed={on}
                                        data-beat={i % 4 === 0}
                                        onClick={() =>
                                            change({
                                                ...recipe,
                                                [part]: recipe[part].map((v, j) =>
                                                    j === i ? !v : v,
                                                ),
                                            })
                                        }
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </section>
            <section className="studio-mix" aria-label="Mix and effects">
                <div>
                    <h2>Mix</h2>
                    {parts.map((part) => (
                        <label key={part}>
                            <span>
                                {part}{' '}
                                <Switch
                                    aria-label={`Enable ${part}`}
                                    checked={recipe.levels[part] > 0}
                                    onCheckedChange={(on) =>
                                        change({
                                            ...recipe,
                                            levels: { ...recipe.levels, [part]: on ? 0.55 : 0 },
                                        })
                                    }
                                />
                            </span>
                            <Slider
                                aria-label={`${part} level`}
                                min={0}
                                max={100}
                                value={[Math.round(recipe.levels[part] * 100)]}
                                onValueChange={([v]) =>
                                    change({
                                        ...recipe,
                                        levels: { ...recipe.levels, [part]: v! / 100 },
                                    })
                                }
                            />
                        </label>
                    ))}
                </div>
                <div>
                    <h2>Space & groove</h2>
                    {(['swing', 'reverb', 'delay'] as const).map((effect) => (
                        <label key={effect}>
                            <span>
                                {effect} <small>{Math.round(recipe[effect] * 100)}%</small>
                            </span>
                            <Slider
                                aria-label={effect}
                                min={0}
                                max={effect === 'swing' ? 40 : effect === 'delay' ? 45 : 50}
                                value={[Math.round(recipe[effect] * 100)]}
                                onValueChange={([v]) => change({ ...recipe, [effect]: v! / 100 })}
                            />
                        </label>
                    ))}
                    <p>
                        Melody and bass repeat across the arrangement. The pad follows a four-chord
                        progression.
                    </p>
                </div>
            </section>
            <div className="utility-actions studio-actions">
                <Button size="3" disabled={busy} onClick={render}>
                    {busy ? 'Rendering…' : 'Render composition'}
                    <Icon name="arrow" size={16} />
                </Button>
                {busy && (
                    <Button variant="soft" onClick={cancel}>
                        Cancel
                    </Button>
                )}
                <Button
                    variant="soft"
                    onClick={() =>
                        downloadBlob(
                            new Blob([JSON.stringify(recipe, null, 2)], {
                                type: 'application/json',
                            }),
                            'audio-recipe.json',
                        )
                    }
                >
                    Export recipe
                </Button>
            </div>
            {output && <GeneratedFilePreview text={output} />}
            <details className="studio-advanced">
                <summary>Recipe import & API example</summary>
                <label>
                    Audio recipe JSON
                    <textarea
                        aria-label="Audio recipe JSON"
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                        placeholder="Paste an exported audio recipe"
                        maxLength={65536}
                    />
                </label>
                <Button
                    onClick={() => {
                        try {
                            change(validateRecipe(JSON.parse(importText)));
                        } catch (e) {
                            setError(e instanceof Error ? e.message : 'Invalid recipe.');
                        }
                    }}
                >
                    Import recipe
                </Button>
                <CodeExample
                    title="Run the same composition over HTTP"
                    code={`curl -X POST https://socket.help/api/tools/test-media-audio-composer/run \\\n  -H 'Content-Type: application/json' \\\n  --data-binary @request.json\n\nrequest.json:\n${JSON.stringify({ input: JSON.stringify(recipe) }, null, 2)}`}
                />
            </details>
            <p className="tool-notice">
                Synthesized on your device in a background worker. No recording is uploaded. The
                library presets use original sounds; this composer does not generate speech or
                imitate artists.
            </p>
        </div>
    );
}
