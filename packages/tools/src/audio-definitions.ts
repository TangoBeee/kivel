import type { ExtraDefinition } from './extra-definitions.js';
import { defaultRecipe, musicTracks } from './audio.js';
const composer: ExtraDefinition = {
    action: 'Render composition',
    input: true,
    inputLabel: 'Audio recipe (JSON)',
    placeholder: JSON.stringify(defaultRecipe(), null, 2),
    preview: 'file',
    intro: 'Compose a layered instrumental with editable melody, bass, drums and pads. Adjust tempo, key, instrument, swing, delay and reverb, then export a stereo WAV.',
    steps: [
        'Start from a preset or import an audio recipe.',
        'Edit the notes and drum steps, then balance the four tracks.',
        'Render the arrangement, listen to the waveform preview and export the WAV and recipe.',
    ],
    limits: 'Original procedural synthesis, with no uploaded recordings, speech generation or remote AI model. 55–180 BPM, one to eight bars, at most 29 seconds. 44.1 kHz, 16-bit stereo PCM WAV. Audio plays only when you choose Play. Browser rendering stays on your device; hosted rendering uses your daily allowance. Library recordings have CC0 terms; custom melodies are supplied by you.',
    useCase:
        'Make a custom instrumental loop for a prototype, video, game or audio-player test instead of repeating a single test tone.',
    example:
        'Choose Paper Lanterns → change the melody and percussion → render and export your arrangement.',
};
export const audioOperations = {
    'test-media-audio-composer': composer,
    'test-media-sample-audio': {
        ...composer,
        intro: 'Create a complete, editable instrumental audio sample with melody, bass, drums and pads. Start from six musical presets or build your own pattern.',
    },
    'test-media-music-library': {
        action: 'Export track',
        input: false,
        preview: 'file',
        fields: [
            {
                key: 'format',
                label: 'Export version',
                defaultValue: 'wav',
                choices: [
                    ['wav', 'WAV · editable loop'],
                    ['mp3', 'MP3 · full arrangement'],
                ],
            },
            {
                key: 'mode',
                label: 'Track',
                defaultValue: musicTracks[0].id,
                choices: musicTracks.map((t) => [t.id, t.title]),
            },
        ],
        intro: 'Stream and download six original instrumental arrangements in ambient, downtempo and electronic styles. Each built-in recording is offered under CC0, with no third-party samples.',
        steps: [
            'Filter the library by mood or search for a track.',
            'Play, seek, repeat or move between tracks.',
            'Download the full MP3, its WAV loop or open the base loop in the composer to make your own arrangement.',
        ],
        limits: 'Full MP3 arrangements are approximately 1½–3 minutes; editable WAV loops are 16–29 seconds. These are original procedurally synthesized instrumentals, not a catalog of commercial recordings or a connection to Spotify or another streaming service. CC0 applies to the built-in compositions and generated recordings. Attribution is optional. Tracks are available directly from this deployment, with byte-range playback and downloads. Audio never starts before you press Play.',
        useCase:
            'Find a reusable instrumental for a prototype, video or game without bringing in a third-party recording.',
        example: 'Filter Calm → play Paper Lanterns → download the MP3 or customize its base loop.',
    },
} satisfies Record<string, ExtraDefinition>;
