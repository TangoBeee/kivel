'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Switch } from '@radix-ui/themes';
import { musicTracks } from '@kivel/tools/audio';
import { AppSelect, SelectOption } from './app-select';
import { AppSlider as Slider } from './app-slider';
import { ToolHeader } from './tool-header';
import { Icon } from './icons';
const time = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export function MusicLibrary() {
    const [selected, setSelected] = useState<string>(musicTracks[0].id),
        [playing, setPlaying] = useState(false),
        [position, setPosition] = useState(0),
        [duration, setDuration] = useState(0),
        [volume, setVolume] = useState(70),
        [repeat, setRepeat] = useState(false),
        [autoNext, setAutoNext] = useState(false),
        [mood, setMood] = useState('all'),
        [query, setQuery] = useState(''),
        [error, setError] = useState('');
    const audio = useRef<HTMLAudioElement>(null),
        current = musicTracks.find((t) => t.id === selected)!,
        filtered = musicTracks.filter(
            (t) =>
                (mood === 'all' || t.mood === mood) &&
                `${t.title} ${t.genre} ${t.description}`
                    .toLowerCase()
                    .includes(query.toLowerCase().trim()),
        );
    useEffect(() => {
        const element = audio.current;
        return () => element?.pause();
    }, []);
    const url = (id: string) => `/api/music/${id}/audio.mp3`;
    // Keep source changes imperative so React cannot interrupt play() during a track change.
    async function play(id = selected) {
        if (!audio.current) return;
        setError('');
        if (id !== selected) {
            setSelected(id);
            setPosition(0);
            setDuration(0);
            audio.current.src = url(id);
        }
        audio.current.volume = volume / 100;
        try {
            await audio.current.play();
        } catch {
            setError('Playback could not start. Try Play again or download the track.');
        }
    }
    function next(direction: number) {
        const playlist = filtered.length ? filtered : musicTracks;
        const index = playlist.findIndex((t) => t.id === selected);
        void play(
            playlist[
                index < 0
                    ? direction > 0
                        ? 0
                        : playlist.length - 1
                    : (index + direction + playlist.length) % playlist.length
            ]!.id,
        );
    }
    return (
        <div className="page-width work-page music-library">
            <ToolHeader toolId="test-media-music-library">
                <span className="badge badge-green">Original tracks · CC0</span>
            </ToolHeader>
            <div className="music-intro">
                <h2>A little music for what you’re making.</h2>
                <p>
                    Original instrumentals for prototypes, videos and games. Stream a track,
                    download the MP3, or open its base loop and make it your own.
                </p>
            </div>
            {error && (
                <div className="alert" role="alert">
                    {error}
                </div>
            )}
            <section
                className="music-player"
                aria-label="Music player"
                style={
                    {
                        '--cover-light': current.colors[0],
                        '--cover-dark': current.colors[1],
                    } as React.CSSProperties
                }
            >
                <div className="music-cover" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <Icon name="music" size={34} />
                </div>
                <div className="music-player-main">
                    <span className="content-label">Now selected · {current.genre}</span>
                    <h2>{current.title}</h2>
                    <p>{current.description}</p>
                    <audio
                        ref={audio}
                        src={url(musicTracks[0].id)}
                        preload="none"
                        loop={repeat}
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                        onLoadedMetadata={() =>
                            setDuration(
                                Number.isFinite(audio.current?.duration)
                                    ? audio.current!.duration
                                    : 0,
                            )
                        }
                        onTimeUpdate={() => setPosition(audio.current?.currentTime ?? 0)}
                        onEnded={() => {
                            setPlaying(false);
                            if (autoNext) next(1);
                        }}
                        onError={() =>
                            setError(
                                'This track could not load. Try again or use its download link.',
                            )
                        }
                    />
                    <div className="music-transport">
                        <button
                            className="button"
                            aria-label="Previous track"
                            onClick={() => next(-1)}
                        >
                            ‹
                        </button>
                        <Button
                            size="3"
                            aria-label={playing ? 'Pause music' : 'Play music'}
                            onClick={() => (playing ? audio.current?.pause() : void play())}
                        >
                            <Icon name={playing ? 'pause' : 'play'} size={20} />
                            {playing ? 'Pause' : 'Play'}
                        </Button>
                        <button className="button" aria-label="Next track" onClick={() => next(1)}>
                            ›
                        </button>
                        <span>
                            {time(position)} / {time(duration || (48 * 240) / current.bpm)}
                        </span>
                        <Slider
                            aria-label="Music playback position"
                            min={0}
                            max={duration || (48 * 240) / current.bpm}
                            step={0.1}
                            value={[position]}
                            onValueChange={([v]) => {
                                if (audio.current && duration) {
                                    audio.current.currentTime = v!;
                                    setPosition(v!);
                                }
                            }}
                        />
                    </div>
                    <div className="music-player-options">
                        <label>
                            Repeat{' '}
                            <Switch
                                checked={repeat}
                                onCheckedChange={setRepeat}
                                aria-label="Repeat current track"
                            />
                        </label>
                        <label>
                            Play next{' '}
                            <Switch
                                checked={autoNext}
                                onCheckedChange={setAutoNext}
                                aria-label="Play the next track automatically"
                            />
                        </label>
                        <label className="music-volume">
                            Volume{' '}
                            <Slider
                                aria-label="Music volume"
                                min={0}
                                max={100}
                                value={[volume]}
                                onValueChange={([v]) => {
                                    setVolume(v!);
                                    if (audio.current) audio.current.volume = v! / 100;
                                }}
                            />
                        </label>
                    </div>
                    <div className="music-track-actions">
                        <a
                            className="button button-primary"
                            href={`${url(selected)}?download=1`}
                            download
                        >
                            Download MP3
                        </a>
                        <Link
                            className="text-link"
                            href={`/tools/audio-composer/?track=${selected}`}
                        >
                            Customize its loop →
                        </Link>
                        <a
                            className="text-link"
                            href={`/api/music/${selected}/audio.wav?download=1`}
                            download
                        >
                            Download WAV loop
                        </a>
                    </div>
                </div>
            </section>
            <div className="music-filters">
                <label>
                    Find a track
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search titles, styles, sounds…"
                    />
                </label>
                <label>
                    Mood
                    <AppSelect value={mood} onChange={(e) => setMood(e.target.value)}>
                        <SelectOption value="all">All moods</SelectOption>
                        {['Calm', 'Focused', 'Bright'].map((v) => (
                            <SelectOption key={v}>{v}</SelectOption>
                        ))}
                    </AppSelect>
                </label>
                <span>{filtered.length} tracks</span>
            </div>
            <div className="music-track-list" aria-label="Available tracks">
                {filtered.map((t) => (
                    <article key={t.id} className={selected === t.id ? 'is-selected' : ''}>
                        <button
                            className="music-track-play"
                            aria-label={`Play ${t.title}`}
                            onClick={() =>
                                selected === t.id && playing
                                    ? audio.current?.pause()
                                    : void play(t.id)
                            }
                            style={{ background: t.colors[0], color: t.colors[1] }}
                        >
                            <Icon
                                name={playing && selected === t.id ? 'pause' : 'play'}
                                size={20}
                            />
                        </button>
                        <div>
                            <h3>{t.title}</h3>
                            <p>
                                {t.genre} · {t.mood}
                            </p>
                        </div>
                        <span>{t.bpm} BPM</span>
                        <span>{time((48 * 240) / t.bpm)}</span>
                        <span className="result-chip">CC0</span>
                        <a
                            className="text-link"
                            href={`${url(t.id)}?download=1`}
                            download
                            aria-label={`Download ${t.title}`}
                        >
                            Download
                        </a>
                    </article>
                ))}
                {!filtered.length && (
                    <p className="result-empty">No tracks match. Try another mood or search.</p>
                )}
            </div>
            <section className="music-license">
                <h2>Clear permission to use the built-in tracks.</h2>
                <p>
                    The six built-in compositions and synthesized recordings are dedicated to the
                    public domain under{' '}
                    <a
                        href="https://creativecommons.org/publicdomain/zero/1.0/"
                        target="_blank"
                        rel="noreferrer"
                    >
                        CC0 1.0
                    </a>
                    . You can use, edit and redistribute them, including in commercial projects.
                    Attribution is optional. No third-party recordings, vocals or artist likenesses
                    are used.
                </p>
                <p>
                    The full arrangements have original intro, verse, chorus, bridge and outro
                    sections. The composer opens the editable base loop. Custom arrangements use the
                    notes you supply; importing a recipe does not clear rights to someone else’s
                    melody.
                </p>
                <a href="/music/LICENSE.txt" download className="text-link">
                    Download license note →
                </a>
                <a href="/api/music" className="text-link">
                    Track metadata and streaming API →
                </a>
            </section>
        </div>
    );
}
