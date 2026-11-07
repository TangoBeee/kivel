import type { Article } from './articles';
export const mediaArticles: Article[] = [
    {
        slug: 'compose-custom-audio-without-samples',
        publishedAt: '2026-10-26',
        category: 'Audio & music',
        icon: 'music',
        title: 'Make a custom instrumental loop with melody, bass and drums',
        description:
            'Build an editable arrangement, balance its instruments, understand the export format and reproduce the result through the Kivel API.',
        sections: [
            {
                id: 'arrangement',
                title: 'Start with an arrangement you can change',
                paragraphs: [
                    'A useful audio generator should give you something to work with: a melody, a bass part, percussion and enough control to change the result. A single oscillator is useful for testing an audio pipeline, but it is not a substitute for a musical arrangement. The audio composer treats those as separate jobs. The tone generator remains available for signal tests; the composer builds layered instrumentals.',
                    'Choose one of the six starting arrangements to hear how the parts fit together. Each preset has a tempo, a tonal center, a lead sound and a different balance between the four tracks. The presets are recipes rather than opaque recordings. You can edit their notes, remove their drums or make a quieter version for a background loop.',
                ],
            },
            {
                id: 'notes',
                title: 'Write a melody and bass pattern',
                paragraphs: [
                    'Each pattern has sixteen steps representing one bar in four-four time. A step contains a MIDI note or a rest. Change a melody step to hear a different pitch on the next render; choose Rest when you want space between notes. The bass has its own sixteen-step lane, so it does not have to copy the melody.',
                    'Tempo changes how quickly the steps are played. Changing the key moves the existing melody and bass notes by the same interval. The harmony setting changes the scale used by the accompanying pad. It does not silently rewrite every manually chosen note. The pad follows a four-chord progression across the arrangement, while the melody and bass patterns repeat.',
                ],
                steps: [
                    'Choose a starting arrangement and render it once.',
                    'Replace a few melody notes or add rests rather than changing everything at once.',
                    'Edit the bass lane to leave room around the kick drum.',
                    'Choose one, two, four or eight bars and render the updated arrangement.',
                ],
            },
            {
                id: 'rhythm',
                title: 'Make the rhythm and mix serve the idea',
                paragraphs: [
                    'The rhythm editor has separate kick, snare and hi-hat rows. Each button switches one step on or off. Strong beats are marked to help you keep your place, but the pattern is yours to change. A sparse rhythm can work better under narration than a busy one. Muting the drum track leaves the tonal parts intact.',
                    'The mix controls balance melody, bass, drums and pad. Use them before adding effects: an overly loud pad will still be overly loud with reverb. Swing moves alternating steps slightly later to loosen the timing. Delay adds repeating echoes; reverb adds a short diffuse tail. Both are bounded so a recipe cannot create an unstable feedback loop.',
                ],
            },
            {
                id: 'export',
                title: 'Know what is in the download',
                paragraphs: [
                    'The composer exports 44.1 kHz, 16-bit stereo PCM in a WAV container. This is an uncompressed, widely supported editing format. The current export limit is twenty-nine seconds and five MiB. The interface disables an eight-bar arrangement when its tempo would exceed that limit. Shorter arrangements are useful for repeated loops and small prototypes.',
                    'Rendering happens in a background browser worker. It does not upload your composition or request a remote AI model. The waveform preview is calculated from the actual PCM samples, and playback begins only after you press Play. The exported recipe contains the notes, instrument settings and deterministic percussion seed needed to reproduce the composition.',
                ],
            },
            {
                id: 'api',
                title: 'Reproduce the same arrangement from a client',
                paragraphs: [
                    'Export the recipe as JSON when you want to keep editing later or check it into a test project. To render through the hosted API, put the serialized recipe in the input field of the run request. Hosted runs use the same validator and synthesis engine as the browser and consume the normal successful-run allowance.',
                    'The HTTP response contains a file artifact with its filename, MIME type, byte count and Base64 contents. Decode the Base64 data to recover the WAV. SDK, CLI, SSH and MCP execution use the same tool ID. This is procedural synthesis, so it does not create singing, understand a text prompt or imitate a named artist.',
                ],
                code: {
                    title: 'Render with the CLI',
                    value: 'kivel run test-media-audio-composer < audio-recipe.json\n\n# HTTP body:\n# {"input":"<serialized audio recipe>"}',
                },
            },
            {
                id: 'rights',
                title: 'Keep track of what you brought into the composition',
                paragraphs: [
                    'The built-in library compositions and their synthesized recordings are offered under CC0. You can customize those starting arrangements without importing a third-party recording. The synthesizer itself uses oscillators and generated percussion rather than sampled commercial instruments.',
                    'A custom recipe can still contain a melody supplied by its author. The tool does not check whether that melody was copied from another composition, and exporting a WAV does not clear third-party rights. Keep the original recipe and the library license information alongside the audio when you need a record of its source.',
                ],
            },
        ],
        related: [
            { title: 'Open the audio composer', href: '/tools/audio-composer/' },
            { title: 'Browse original CC0 tracks', href: '/tools/music-library/' },
            { title: 'Generate a test tone', href: '/tools/tone-generator/' },
        ],
    },
    {
        slug: 'free-music-streaming-cc0-explained',
        publishedAt: '2026-10-26',
        category: 'Audio & music',
        icon: 'music',
        title: 'Free music for prototypes: what the library includes and how CC0 works',
        description:
            'Stream original instrumentals, download editable WAV loops, use byte-range playback and understand the scope of the built-in tracks’ CC0 terms.',
        sources: [
            {
                title: 'Creative Commons CC0 1.0 deed',
                url: 'https://creativecommons.org/publicdomain/zero/1.0/',
            },
        ],
        sections: [
            {
                id: 'source',
                title: 'Know the source of a free track',
                paragraphs: [
                    'Free to listen does not necessarily mean free to put in a video or redistribute in an application. A streaming service can give a listener access to recordings without granting the rights needed for a game soundtrack, product demo or downloadable template. A label such as royalty-free also needs its actual license terms beside it.',
                    'The Kivel library takes a narrow, transparent approach. Its six built-in tracks are original procedural compositions rendered with synthesized instruments. They do not contain third-party music recordings or sampled vocals. Each track lists its title, style, mood, tempo and source, and the library links to its CC0 terms.',
                ],
            },
            {
                id: 'license',
                title: 'What CC0 covers here',
                paragraphs: [
                    'CC0 is a public-domain dedication: the person applying it waives copyright and related rights to the extent permitted by law. The Creative Commons deed describes permission to copy, modify, distribute and perform the work, including for commercial purposes, without asking permission. Attribution is not a condition of using these built-in recordings.',
                    'The dedication applies to the built-in compositions and recordings identified in the library. It does not turn every file uploaded to Kivel into public-domain material. It also does not grant patent, trademark, privacy or publicity rights, and Creative Commons does not verify the ownership of works carrying a CC0 label. Keep the source and license details when redistributing an asset.',
                ],
            },
            {
                id: 'listen',
                title: 'Choose a track by what the project needs',
                paragraphs: [
                    'Use the mood and search controls to narrow the collection. Calm tracks have more space and lighter percussion. Focused tracks use restrained repeating patterns. Bright tracks have a more energetic pulse. The full MP3 arrangements last about one-and-a-half to three minutes and have intro, verse, chorus, bridge and outro sections. Short editable WAV loops are also available.',
                    'Playback is manual. You can seek within a track, change the volume, repeat the current loop or opt into playing the next track automatically. Download MP3 saves the full arrangement; Download WAV loop saves an uncompressed base pattern. Customize opens that loop in the composer, where notes, drum steps, instruments and effects can be changed.',
                ],
                steps: [
                    'Choose a mood and audition a track at a comfortable volume.',
                    'Test the loop under the actual narration, animation or game scene.',
                    'Download the full MP3 for listening, or use its WAV loop and composer for editing.',
                    'Keep a copy of the source track name and CC0 link with the asset.',
                ],
            },
            {
                id: 'stream',
                title: 'Use a real audio endpoint for player tests',
                paragraphs: [
                    'The library is also useful for testing an audio player. Track metadata is available from GET /api/music. Each entry includes its audio URL and download URL, so a client does not need to scrape the website to build a playlist. No account or provider credential is required for the built-in tracks.',
                    'Audio endpoints support HTTP byte ranges, which let a browser request the part of a WAV needed after seeking. A valid range receives a 206 response with Content-Range. Unsatisfiable or malformed ranges receive 416. ETag and conditional requests let clients reuse unchanged audio. Full MP3 recordings ship with the application, and the server renders WAV loops on first use. It caches only a bounded number of recordings in memory.',
                ],
                code: {
                    title: 'Inspect the catalog and request a byte range',
                    value: 'curl https://kivel.io/api/music\n\ncurl -H "Range: bytes=0-65535" \\\n  https://kivel.io/api/music/paper-lanterns/audio.wav \\\n  -o first-chunk.wav\n\n# A byte range is a partial file; download the full URL for an editable WAV.',
                },
            },
            {
                id: 'limits',
                title: 'Understand the collection’s limits',
                paragraphs: [
                    'This library is not connected to Spotify, YouTube or another commercial catalog. It does not search the web for tracks or promise that unrelated music is cleared for reuse. Its size is deliberately explicit: six original multisection arrangements, with editable base-loop recipes available through the composer.',
                    'The library contains full MP3 arrangements plus editable PCM WAV loops. They are useful for prototypes, simple backgrounds and media-player testing, but they do not replace professionally recorded performances when a project needs those. The value here is a clear source, editable arrangements and reliable access without an external media provider.',
                ],
            },
        ],
        related: [
            { title: 'Stream the music library', href: '/tools/music-library/' },
            { title: 'Create your own arrangement', href: '/tools/audio-composer/' },
            { title: 'Inspect audio metadata', href: '/tools/media-metadata/' },
        ],
    },
    {
        slug: 'generate-images-and-avatars-for-real-layouts',
        publishedAt: '2026-10-27',
        category: 'Images & design',
        icon: 'media',
        title: 'Generate useful images and avatars for a real interface',
        description:
            'Choose dimensions, styles, palettes and deterministic variations, then export editable SVG or raster PNG for your layout and test data.',
        sections: [
            {
                id: 'canvas',
                title: 'Start with the space the image needs to fill',
                paragraphs: [
                    'A placeholder becomes more useful when it resembles the shape and visual weight of the final asset. A wide hero image, a square profile picture and a small attachment thumbnail need different proportions. Set the destination width and height first, then choose a style that will still read clearly at that size.',
                    'The image generator offers landscape illustrations, gradients, geometric compositions, grids and solid backgrounds. These are original generated graphics, not photographs or remotely sourced stock images. You can build a social preview with a caption, a quiet background for a card or a predictable test image without leaving the tool.',
                ],
            },
            {
                id: 'palette',
                title: 'Use a coordinated palette before adjusting individual colors',
                paragraphs: [
                    'A preset palette supplies a background, foreground and accent that belong together. Sage, clay, ocean, lavender, ink and sunrise offer different visual directions while keeping the interface simple. A variation seed changes the composition without replacing the palette or dimensions.',
                    'Custom color controls accept six-digit hex values when you need to match an existing project. Switching back to palette mode restores the preset colors. Review captions against the actual background, particularly when you choose a low-contrast accent or plan to display the image smaller than its original dimensions.',
                ],
            },
            {
                id: 'caption',
                title: 'Make the label fit the purpose',
                paragraphs: [
                    'A title and subtitle are optional. They can identify an upload fixture, make a social preview readable or show which variation of an image is being reviewed. Text size adapts to its length and the canvas dimensions. Short captions work better for small cards; an image only thirty-two pixels wide cannot hold a readable paragraph.',
                    'The generated artwork does not fetch web fonts or remote images. SVG text uses a system font, and rasterized PNG captions can vary slightly between a browser and the hosted runtime. If a brand requires exact typography, export an editable SVG and apply the final font in your design workflow.',
                ],
            },
            {
                id: 'formats',
                title: 'Choose between editable SVG and ready-to-use PNG',
                paragraphs: [
                    'SVG stores the shapes, gradients and text as vector instructions. It stays editable and can scale to different display sizes without raster pixelation. PNG turns the composition into a fixed grid of pixels at the dimensions you requested. It is useful for profile-image uploads, social-image pipelines and applications that accept only raster files.',
                    'Both exports use the same composition settings. The browser renders PNG locally, while the hosted API uses the server renderer. Outputs are bounded to five MiB and sixteen million pixels. Large dimensions or complex artwork can reach those limits before a download is produced; reducing the canvas size is usually the simplest adjustment.',
                ],
            },
            {
                id: 'avatars',
                title: 'Use stable avatars for synthetic users',
                paragraphs: [
                    'Profile fixtures should not require borrowing someone’s actual photograph. The avatar generator offers initials, symmetric identicons, orbital marks and a simple geometric robot. The name and seed determine the variation, and circle, rounded-square and square clipping make the result fit different interfaces.',
                    'Keep the same name, seed, style and palette when you want the avatar to stay stable across test runs. Change the seed for a different visual without changing the identity label. Identicons are decorative here: they do not authenticate a person, verify a key or replace an account’s security checks.',
                ],
            },
            {
                id: 'automation',
                title: 'Make image generation reproducible from a client',
                paragraphs: [
                    'The same generator is available through the web, HTTP API, SDK, CLI, SSH and MCP. Pass a title or name as input, then supply options such as style, theme, seed, width, height and format. The per-tool descriptor includes option names, choices and defaults, so an integration does not have to infer them from a screenshot.',
                    'For a development dataset, save the generation settings with each fixture. This makes a visual regression easier to reproduce and avoids a dependency on a changing remote image URL. The SVG is deterministic for a fixed recipe. PNG rasterization can differ in font details across environments, so compare the intended renderer when pixel-for-pixel screenshots are important.',
                ],
                code: {
                    title: 'Generate a PNG from the CLI',
                    value: 'kivel describe test-media-placeholder-images\nkivel run test-media-placeholder-images \\\n  --options \'{"style":"landscape","theme":"ocean","width":"1200","height":"630","format":"png","seed":"41"}\' \\\n  < title.txt\n\n# Decode the returned file artifact\u2019s base64 field to save the PNG.',
                },
            },
        ],
        related: [
            { title: 'Create an illustration', href: '/tools/placeholder-images/' },
            { title: 'Make consistent avatars', href: '/tools/sample-avatars/' },
            { title: 'Resize an existing image', href: '/tools/image-resizer/' },
        ],
    },
];
