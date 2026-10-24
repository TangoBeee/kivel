import { artifact } from './artifacts.js';
export interface AudioRecipe {
    version: 1;
    bpm: number;
    bars: number;
    root: number;
    scale: 'major' | 'minor' | 'pentatonic';
    voice: 'keys' | 'pluck' | 'bell' | 'synth';
    seed: number;
    swing: number;
    reverb: number;
    delay: number;
    melody: (number | null)[];
    bass: (number | null)[];
    kick: boolean[];
    snare: boolean[];
    hat: boolean[];
    levels: { melody: number; bass: number; drums: number; pad: number };
}
export const musicTracks = [
    {
        id: 'paper-lanterns',
        title: 'Paper Lanterns',
        mood: 'Calm',
        genre: 'Ambient',
        bpm: 78,
        root: 60,
        scale: 'major',
        voice: 'keys',
        seed: 917,
        colors: ['#e6dccc', '#88765a'],
        description: 'Soft keys, a slow bass line and brushed percussion.',
    },
    {
        id: 'night-train',
        title: 'Night Train',
        mood: 'Focused',
        genre: 'Downtempo',
        bpm: 94,
        root: 57,
        scale: 'minor',
        voice: 'pluck',
        seed: 203,
        colors: ['#d8ddeb', '#566482'],
        description: 'A muted pluck melody over a steady, understated groove.',
    },
    {
        id: 'small-victories',
        title: 'Small Victories',
        mood: 'Bright',
        genre: 'Electronic',
        bpm: 122,
        root: 62,
        scale: 'major',
        voice: 'synth',
        seed: 541,
        colors: ['#efdac9', '#9a6748'],
        description: 'An upbeat instrumental with a bright lead and syncopated bass.',
    },
    {
        id: 'glass-garden',
        title: 'Glass Garden',
        mood: 'Calm',
        genre: 'Ambient',
        bpm: 68,
        root: 65,
        scale: 'pentatonic',
        voice: 'bell',
        seed: 782,
        colors: ['#d8e8df', '#507b67'],
        description: 'Bell-like notes and spacious pads with light percussion.',
    },
    {
        id: 'after-hours',
        title: 'After Hours',
        mood: 'Focused',
        genre: 'Downtempo',
        bpm: 86,
        root: 55,
        scale: 'minor',
        voice: 'keys',
        seed: 315,
        colors: ['#dfd8e9', '#756087'],
        description: 'Warm keyboard chords, gentle drums and a rolling bass part.',
    },
    {
        id: 'open-window',
        title: 'Open Window',
        mood: 'Bright',
        genre: 'Electronic',
        bpm: 112,
        root: 60,
        scale: 'pentatonic',
        voice: 'pluck',
        seed: 630,
        colors: ['#d6e7eb', '#517984'],
        description: 'A light plucked motif, soft pads and an easy rhythmic pulse.',
    },
] as const;
export type MusicTrackId = (typeof musicTracks)[number]['id'];
export const scales = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    pentatonic: [0, 2, 4, 7, 9],
} as const;
export function defaultRecipe(trackId = 'paper-lanterns'): AudioRecipe {
    const t = musicTracks.find((t) => t.id === trackId) ?? musicTracks[0],
        notes = scales[t.scale];
    const motif = [0, null, 2, null, 4, 2, null, 1, 0, null, 3, null, 4, null, 2, null];
    return {
        version: 1,
        bpm: t.bpm,
        bars: 8,
        root: t.root,
        scale: t.scale,
        voice: t.voice,
        seed: t.seed,
        swing: t.genre === 'Downtempo' ? 0.15 : 0,
        reverb: t.genre === 'Ambient' ? 0.32 : 0.18,
        delay: 0.14,
        melody: motif.map((n) => (n === null ? null : t.root + notes[n % notes.length]!)),
        bass: [
            t.root - 24,
            null,
            null,
            t.root - 17,
            null,
            null,
            t.root - 24,
            null,
            null,
            null,
            t.root - 19,
            null,
            t.root - 17,
            null,
            null,
            null,
        ],
        kick: Array.from({ length: 16 }, (_, i) => [0, 8, 11].includes(i)),
        snare: Array.from({ length: 16 }, (_, i) => [4, 12].includes(i)),
        hat: Array.from({ length: 16 }, (_, i) => i % 2 === 0),
        levels: { melody: 0.7, bass: 0.55, drums: t.genre === 'Ambient' ? 0.3 : 0.6, pad: 0.28 },
    };
}
const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
export function validateRecipe(value: unknown): AudioRecipe {
    if (!object(value) || value.version !== 1)
        throw new Error('Use an audio recipe with version 1.');
    const number = (key: string, min: number, max: number, integer = false) => {
        const n = value[key];
        if (
            typeof n !== 'number' ||
            !Number.isFinite(n) ||
            n < min ||
            n > max ||
            (integer && !Number.isInteger(n))
        )
            throw new Error(
                `${key} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`,
            );
        return n;
    };
    if (
        !['major', 'minor', 'pentatonic'].includes(String(value.scale)) ||
        !['keys', 'pluck', 'bell', 'synth'].includes(String(value.voice))
    )
        throw new Error('Choose a supported scale and instrument.');
    const notes = (key: string) => {
        const a = value[key];
        if (
            !Array.isArray(a) ||
            a.length !== 16 ||
            a.some((n) => n !== null && (!Number.isInteger(n) || n < 24 || n > 96))
        )
            throw new Error(`${key} needs 16 MIDI notes (24–96) or null rests.`);
        return [...a] as (number | null)[];
    };
    const beats = (key: string) => {
        const a = value[key];
        if (!Array.isArray(a) || a.length !== 16 || a.some((n) => typeof n !== 'boolean'))
            throw new Error(`${key} needs 16 true/false steps.`);
        return [...a] as boolean[];
    };
    const levels = value.levels;
    if (
        !object(levels) ||
        Object.keys(levels).length !== 4 ||
        ['melody', 'bass', 'drums', 'pad'].some(
            (k) =>
                typeof levels[k] !== 'number' ||
                !Number.isFinite(levels[k]) ||
                Number(levels[k]) < 0 ||
                Number(levels[k]) > 1,
        )
    )
        throw new Error('Set melody, bass, drums and pad levels from 0 to 1.');
    const recipe = {
        version: 1 as const,
        bpm: number('bpm', 55, 180, true),
        bars: number('bars', 1, 8, true),
        root: number('root', 48, 72, true),
        scale: value.scale as AudioRecipe['scale'],
        voice: value.voice as AudioRecipe['voice'],
        seed: number('seed', 1, 2147483647, true),
        swing: number('swing', 0, 0.4),
        reverb: number('reverb', 0, 0.5),
        delay: number('delay', 0, 0.45),
        melody: notes('melody'),
        bass: notes('bass'),
        kick: beats('kick'),
        snare: beats('snare'),
        hat: beats('hat'),
        levels: { ...levels } as AudioRecipe['levels'],
    };
    if ((recipe.bars * 240) / recipe.bpm > 29)
        throw new Error('This arrangement exceeds 29 seconds. Use fewer bars or a faster tempo.');
    return recipe;
}
export function noteName(midi: number | null): string {
    return midi === null
        ? 'Rest'
        : `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][midi % 12]}${Math.floor(midi / 12) - 1}`;
}
export function renderAudio(value: unknown, filename = 'composition.wav'): string {
    const r = validateRecipe(value),
        rate = 44100,
        seconds = (r.bars * 240) / r.bpm,
        frames = Math.ceil(seconds * rate),
        l = new Float32Array(frames),
        rr = new Float32Array(frames),
        step = 60 / r.bpm / 4;
    let state = r.seed;
    const random = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return ((state >>> 0) / 4294967296) * 2 - 1;
    };
    const add = (
        start: number,
        length: number,
        midi: number,
        level: number,
        voice: string,
        pan: number,
    ) => {
        const f = 440 * 2 ** ((midi - 69) / 12),
            begin = Math.floor(start * rate),
            count = Math.min(Math.floor(length * rate), frames - begin),
            a = Math.sqrt((1 - pan) / 2),
            b = Math.sqrt((1 + pan) / 2);
        for (let i = 0; i < count; i++) {
            const t = i / rate,
                phase = 2 * Math.PI * f * t,
                attack = Math.min(1, t / (voice === 'pad' ? 0.18 : 0.009)),
                release = Math.min(1, (length - t) / 0.06),
                decay =
                    voice === 'pad'
                        ? 0.7
                        : Math.exp(-t * (voice === 'pluck' ? 7 : voice === 'bell' ? 3 : 2.4));
            const wave =
                voice === 'bell'
                    ? Math.sin(phase) * 0.65 +
                      Math.sin(phase * 2.756) * 0.22 +
                      Math.sin(phase * 5.404) * 0.1
                    : voice === 'synth'
                      ? (Math.sin(phase) + Math.sin(phase * 2) * 0.3 + Math.sin(phase * 3) * 0.16) *
                        0.6
                      : voice === 'bass'
                        ? Math.sin(phase) * 0.85 + Math.sin(phase * 2) * 0.12
                        : Math.sin(phase) * 0.7 +
                          Math.sin(phase * 2) * 0.15 +
                          Math.sin(phase * 3) * 0.06;
            const sample = wave * attack * release * decay * level;
            l[begin + i]! += sample * a;
            rr[begin + i]! += sample * b;
        }
    };
    const drum = (start: number, type: string, level: number) => {
        const begin = Math.floor(start * rate),
            count = Math.min(
                Math.floor((type === 'kick' ? 0.25 : type === 'snare' ? 0.16 : 0.065) * rate),
                frames - begin,
            );
        let phase = 0,
            prev = 0;
        for (let i = 0; i < count; i++) {
            const t = i / rate,
                n = random(),
                hp = n - prev;
            prev = n;
            phase += (2 * Math.PI * (45 + 105 * Math.exp(-t * 35))) / rate;
            const v =
                type === 'kick'
                    ? Math.sin(phase) * Math.exp(-t * 19)
                    : type === 'snare'
                      ? (hp * 0.34 + Math.sin(2 * Math.PI * 180 * t) * 0.14) * Math.exp(-t * 24)
                      : hp * 0.24 * Math.exp(-t * 65);
            const sample = v * level * Math.min(1, t / 0.001);
            l[begin + i]! += sample;
            rr[begin + i]! += sample;
        }
    };
    const progression = [0, 5, 3, 4],
        scale = scales[r.scale];
    for (let bar = 0; bar < r.bars; bar++) {
        const offset = scale[progression[bar % 4]! % scale.length]!;
        for (const interval of [0, r.scale === 'minor' ? 3 : 4, 7])
            add(
                bar * 16 * step,
                16 * step,
                r.root - 12 + offset + interval,
                r.levels.pad * 0.13,
                'pad',
                interval === 0 ? -0.45 : 0.45,
            );
        for (let s = 0; s < 16; s++) {
            const time = (bar * 16 + s + (s % 2 ? r.swing : 0)) * step;
            if (r.melody[s] !== null)
                add(
                    time,
                    step * 2.4,
                    r.melody[s]!,
                    r.levels.melody * 0.29,
                    r.voice,
                    s % 2 ? 0.3 : -0.2,
                );
            if (r.bass[s] !== null)
                add(time, step * 2.7, r.bass[s]!, r.levels.bass * 0.32, 'bass', 0);
            if (r.kick[s]) drum(time, 'kick', r.levels.drums * 0.65);
            if (r.snare[s]) drum(time, 'snare', r.levels.drums * 0.4);
            if (r.hat[s]) drum(time, 'hat', r.levels.drums * (s % 4 === 0 ? 0.25 : 0.17));
        }
    }
    const echo = Math.floor((60 / r.bpm) * 0.75 * rate),
        room = [Math.floor(rate * 0.079), Math.floor(rate * 0.131), Math.floor(rate * 0.197)];
    for (let i = 0; i < frames; i++) {
        if (i >= echo) {
            l[i]! += rr[i - echo]! * r.delay;
            rr[i]! += l[i - echo]! * r.delay;
        }
        for (const d of room)
            if (i >= d) {
                l[i]! += l[i - d]! * r.reverb * 0.12;
                rr[i]! += rr[i - d]! * r.reverb * 0.12;
            }
    }
    let peak = 0;
    for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(l[i]!), Math.abs(rr[i]!));
    const gain = peak ? Math.min(1.8, 0.88 / peak) : 1,
        bytes = new Uint8Array(44 + frames * 4),
        v = new DataView(bytes.buffer),
        str = (o: number, s: string) =>
            [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF');
    v.setUint32(4, bytes.length - 8, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 2, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 4, true);
    v.setUint16(32, 4, true);
    v.setUint16(34, 16, true);
    str(36, 'data');
    v.setUint32(40, frames * 4, true);
    for (let i = 0; i < frames; i++) {
        const fade = Math.min(1, i / (rate * 0.025), (frames - i) / (rate * 0.04));
        v.setInt16(
            44 + i * 4,
            Math.round(Math.max(-1, Math.min(1, l[i]! * gain * fade)) * 32767),
            true,
        );
        v.setInt16(
            46 + i * 4,
            Math.round(Math.max(-1, Math.min(1, rr[i]! * gain * fade)) * 32767),
            true,
        );
    }
    return JSON.stringify({
        ...JSON.parse(artifact(filename, 'audio/wav', bytes)),
        audio: {
            duration: seconds,
            bpm: r.bpm,
            sampleRate: rate,
            channels: 2,
            peak: Math.min(0.88, peak * gain),
        },
        recipe: r,
    });
}
