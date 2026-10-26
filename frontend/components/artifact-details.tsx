'use client';
import { useEffect, useRef, useState } from 'react';
import { AppSlider as Slider } from './app-slider';
import { Icon } from './icons';
export function BinaryArtifactPreview({
    blob,
    archive = false,
}: {
    blob: Blob;
    archive?: boolean;
}) {
    const [entries, setEntries] = useState<{ name: string; bytes: number; compressed: number }[]>(
            [],
        ),
        [hex, setHex] = useState('');
    useEffect(() => {
        let live = true;
        setEntries([]);
        setHex('');
        void (async () => {
            const data = new Uint8Array(await blob.arrayBuffer());
            if (!live) return;
            const rows = [];
            for (let offset = 0; offset < Math.min(data.length, 128); offset += 16)
                rows.push(
                    `${offset.toString(16).padStart(4, '0')}  ${Array.from(data.slice(offset, offset + 16), (byte) => byte.toString(16).padStart(2, '0')).join(' ')}`,
                );
            setHex(rows.join('\n'));
            if (archive) {
                try {
                    const view = new DataView(data.buffer);
                    let end = data.length - 22;
                    for (; end >= Math.max(0, data.length - 65557); end--)
                        if (view.getUint32(end, true) === 0x06054b50) break;
                    if (end < Math.max(0, data.length - 65557)) return;
                    const count = view.getUint16(end + 10, true);
                    let offset = view.getUint32(end + 16, true);
                    const items = [];
                    for (let i = 0; i < Math.min(count, 100); i++) {
                        if (view.getUint32(offset, true) !== 0x02014b50) return;
                        const nameLength = view.getUint16(offset + 28, true),
                            extra = view.getUint16(offset + 30, true),
                            comment = view.getUint16(offset + 32, true);
                        items.push({
                            name: new TextDecoder().decode(
                                data.slice(offset + 46, offset + 46 + nameLength),
                            ),
                            bytes: view.getUint32(offset + 24, true),
                            compressed: view.getUint32(offset + 20, true),
                        });
                        offset += 46 + nameLength + extra + comment;
                    }
                    if (live) setEntries(items);
                } catch {}
            }
        })();
        return () => {
            live = false;
        };
    }, [blob, archive]);
    return entries.length ? (
        <div className="archive-preview">
            <div className="result-group-heading">
                <h3>Archive contents</h3>
                <span className="result-count">{entries.length} entries</span>
            </div>
            <ul>
                {entries.map((entry, index) => (
                    <li key={index}>
                        <Icon name="files" size={17} />
                        <strong>{entry.name}</strong>
                        <span>{entry.bytes.toLocaleString()} bytes</span>
                    </li>
                ))}
            </ul>
            <p className="tool-notice">Contents are listed without extracting or running files.</p>
        </div>
    ) : (
        <div className="artifact-hex">
            <div className="result-group-heading">
                <h3>{archive ? 'Archive signature' : 'Binary preview'}</h3>
                <span className="result-count">First 128 bytes</span>
            </div>
            <pre>{hex}</pre>
        </div>
    );
}
const time = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export function AudioArtifactPreview({ blob, url }: { blob: Blob; url: string }) {
    const audio = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false),
        [duration, setDuration] = useState(0),
        [position, setPosition] = useState(0),
        [bars, setBars] = useState<number[]>([]),
        [error, setError] = useState('');
    useEffect(() => {
        let live = true;
        setPlaying(false);
        setPosition(0);
        setDuration(0);
        setBars([]);
        setError('');
        void (async () => {
            const bytes = await blob.arrayBuffer(),
                view = new DataView(bytes);
            if (
                bytes.byteLength < 44 ||
                view.getUint32(0) !== 0x52494646 ||
                view.getUint32(8) !== 0x57415645
            )
                return;
            let offset = 12,
                bits = 0,
                channels = 0,
                pcm = false;
            while (offset + 8 <= bytes.byteLength) {
                const type = view.getUint32(offset),
                    length = view.getUint32(offset + 4, true),
                    start = offset + 8;
                if (start + length > bytes.byteLength) return;
                if (type === 0x666d7420 && length >= 16) {
                    pcm = view.getUint16(start, true) === 1;
                    channels = view.getUint16(start + 2, true);
                    bits = view.getUint16(start + 14, true);
                }
                if (
                    type === 0x64617461 &&
                    pcm &&
                    (channels === 1 || channels === 2) &&
                    bits === 16
                ) {
                    const samples = Math.floor(length / (2 * channels)),
                        values = [];
                    for (let bar = 0; bar < 72; bar++) {
                        const first = Math.floor((bar * samples) / 72),
                            last = Math.floor(((bar + 1) * samples) / 72);
                        let sum = 0;
                        for (let i = first; i < last; i++) {
                            const n = view.getInt16(start + i * 2 * channels, true) / 32768;
                            sum += n * n;
                        }
                        values.push(Math.sqrt(sum / Math.max(1, last - first)));
                    }
                    const peak = Math.max(...values);
                    if (live)
                        setBars(
                            values.map((value) =>
                                peak ? Math.max(0.035, (value / peak) * 0.85) : 0.035,
                            ),
                        );
                    return;
                }
                offset = start + length + (length % 2);
            }
        })();
        return () => {
            live = false;
        };
    }, [blob]);
    async function toggle() {
        if (!audio.current) return;
        try {
            if (playing) audio.current.pause();
            else await audio.current.play();
        } catch {
            setError('Audio playback is unavailable. Download the WAV file to listen.');
        }
    }
    return (
        <div className="audio-artifact">
            <audio
                ref={audio}
                src={url}
                preload="metadata"
                onLoadedMetadata={() =>
                    setDuration(
                        Number.isFinite(audio.current?.duration) ? audio.current!.duration : 0,
                    )
                }
                onTimeUpdate={() => setPosition(audio.current?.currentTime ?? 0)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onError={() =>
                    setError(
                        'A playback preview is unavailable. Download the audio file to listen.',
                    )
                }
            />
            {bars.length > 0 && (
                <div className="audio-waveform" aria-label="Waveform of the generated PCM audio">
                    {bars.map((amplitude, index) => (
                        <span
                            key={index}
                            style={{ height: `${Math.max(5, amplitude * 100)}%` }}
                            data-played={duration > 0 && index / bars.length <= position / duration}
                        />
                    ))}
                </div>
            )}
            <div className="audio-controls">
                <button
                    type="button"
                    className="button"
                    onClick={() => void toggle()}
                    aria-label={playing ? 'Pause audio' : 'Play audio'}
                >
                    <Icon name={playing ? 'pause' : 'play'} size={18} />
                </button>
                <span>{time(position)}</span>
                <Slider
                    aria-label="Audio position"
                    min={0}
                    max={duration || 1}
                    step={0.01}
                    value={[position]}
                    disabled={!duration}
                    onValueChange={(value) => {
                        if (audio.current) audio.current.currentTime = value[0]!;
                        setPosition(value[0]!);
                    }}
                />
                <span>{time(duration)}</span>
            </div>
            {error && (
                <p className="tool-notice" role="status">
                    {error}
                </p>
            )}
        </div>
    );
}
