import type { ExtraDefinition, UtilityField } from './extra-definitions.js';
const duration: UtilityField = {
    key: 'duration',
    label: 'Duration (seconds)',
    type: 'number',
    defaultValue: '10',
    min: 0.1,
    max: 120,
};
const start: UtilityField = {
    key: 'start',
    label: 'Start at (seconds)',
    type: 'number',
    defaultValue: '0',
    min: 0,
    max: 120,
};
const videoFormat: UtilityField = {
    key: 'format',
    label: 'Output format',
    defaultValue: 'mp4',
    choices: [
        ['mp4', 'MP4 · H.264'],
        ['webm', 'WebM · VP9'],
    ],
};
const audioFormat: UtilityField = {
    key: 'format',
    label: 'Output format',
    defaultValue: 'mp3',
    choices: [
        ['mp3', 'MP3'],
        ['wav', 'WAV · PCM'],
        ['ogg', 'Ogg · Opus'],
    ],
};
const width: UtilityField = {
    key: 'width',
    label: 'Maximum width (px)',
    type: 'number',
    defaultValue: '640',
    min: 64,
    max: 1280,
};
function define(
    action: string,
    intro: string,
    fields: readonly UtilityField[],
    file = true,
    preview: 'file' | null = 'file',
): ExtraDefinition {
    return {
        action,
        intro,
        input: false,
        file,
        fields,
        preview: preview ?? undefined,
        steps: [
            file ? 'Choose an audio or video file.' : 'Choose the fixture settings.',
            'Set output options and run the tool.',
            preview
                ? 'Play the preview and download the result.'
                : 'Inspect the container and stream details.',
        ],
        limits: 'Server processing with no retained uploads or results. Up to 10 MiB input, 120 seconds, 1920 × 1080 source video, and 5 MiB output. Video output is at most 1280 × 720. One media job runs at a time with a 20-second deadline. MP4/MOV, WebM/MKV, AVI, MP3, WAV, FLAC, Ogg, AAC and GIF inputs. Encrypted media, playlists and remote references are unsupported. Metadata is omitted from converted output. Large or complex media may exceed processing limits.',
        useCase: intro,
        example: file
            ? 'Upload a short clip → choose a format → preview and download'
            : 'Create a 3-second, 640-pixel test clip',
    };
}
export const avOperations = {
    'everyday-video-compressor': define(
        'Compress video',
        'Reduce a short video to a smaller H.264 MP4, with source and output previews.',
        [
            width,
            {
                key: 'quality',
                label: 'Compression',
                defaultValue: '28',
                choices: [
                    ['23', 'Higher quality'],
                    ['28', 'Balanced'],
                    ['33', 'Smaller file'],
                ],
            },
        ],
    ),
    'everyday-video-converter': define(
        'Convert video',
        'Convert a short video to MP4 or WebM for playback and upload testing.',
        [videoFormat, width],
    ),
    'everyday-audio-extractor': define(
        'Extract audio',
        'Download the audio track from a video as MP3, WAV or Ogg.',
        [audioFormat],
    ),
    'everyday-audio-converter': define(
        'Convert audio',
        'Convert an audio file to MP3, PCM WAV or Ogg Opus.',
        [audioFormat],
    ),
    'everyday-video-trimmer': define(
        'Trim video',
        'Select a start time and duration, then export a precise MP4 clip.',
        [start, duration, width],
    ),
    'everyday-audio-trimmer': define(
        'Trim audio',
        'Cut a precise section of an audio track and export it in your chosen format.',
        [start, duration, audioFormat],
    ),
    'everyday-gif-maker': define(
        'Create GIF',
        'Turn a short section of a video into a looping GIF.',
        [
            start,
            { ...duration, defaultValue: '3', max: 10 },
            { ...width, defaultValue: '320', max: 640 },
        ],
    ),
    'everyday-media-metadata': define(
        'Inspect media',
        'Inspect duration, container, video dimensions, audio channels and codecs without converting the file.',
        [],
        true,
        null,
    ),
    'test-media-sample-video': define(
        'Generate video',
        'Create a moving test-pattern video with an optional reference tone.',
        [
            { ...duration, defaultValue: '3', max: 10 },
            width,
            {
                key: 'mode',
                label: 'Audio track',
                defaultValue: 'tone',
                choices: [
                    ['tone', 'Reference tone'],
                    ['silent', 'No audio'],
                ],
            },
        ],
        false,
    ),
    'test-media-silent-video': define(
        'Generate silent video',
        'Create a moving MP4 test pattern with no audio track.',
        [{ ...duration, defaultValue: '3', max: 10 }, width],
        false,
    ),
    'test-media-media-stream-fixtures': define(
        'Generate stream fixture',
        'Create a fragmented MP4 fixture for testing progressive media playback. This generates a file; it does not host a live stream.',
        [{ ...duration, defaultValue: '3', max: 10 }, width],
        false,
    ),
} satisfies Record<string, ExtraDefinition>;
export type AvOperationId = keyof typeof avOperations;
