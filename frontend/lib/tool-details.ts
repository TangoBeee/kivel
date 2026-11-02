import { echoDetails } from './echo-content';
import { crudDetails } from './crud-content';
import { scenarioDetails } from './scenario-content';
export interface ToolDetail {
    title: string;
    paragraphs: string[];
}
const composer: ToolDetail[] = [
    {
        title: 'Build an arrangement, not a single sound',
        paragraphs: [
            'The composer has four independent parts: a lead melody, a bass line, a three-piece drum pattern and a harmonic pad. Melody and bass each have sixteen editable steps. Choose a MIDI note or a rest for each position, then repeat the pattern across one, two, four or eight bars. The pad supplies a four-chord progression underneath the arrangement.',
            'Changing the key transposes existing melody and bass notes together. Harmony changes the pad’s scale; it does not overwrite notes you have chosen manually. The lead can use warm keys, a plucked sound, glass-like bells or a soft synthesizer. These sounds are created mathematically rather than loaded from sampled recordings.',
        ],
    },
    {
        title: 'Shape the groove and the mix',
        paragraphs: [
            'Switch individual kick, snare and hi-hat steps on or off to create the rhythm. The mix controls set the level of each part, and a switch can mute a track without removing its pattern. Swing delays alternate steps slightly. Delay adds repeating echoes, while reverb adds a short spatial tail.',
            'A quieter pad and a sparse melody usually leave more room for narration. For a game loop, try a stronger rhythm and a shorter arrangement. Render after each meaningful change so you can hear its effect. Moving a control updates the recipe and clears the old render, preventing a stale audio preview from being mistaken for the current composition.',
        ],
    },
    {
        title: 'Export audio and keep an editable source',
        paragraphs: [
            'The WAV download contains 44.1 kHz, 16-bit stereo PCM. Arrangements are limited to twenty-nine seconds and five MiB, so long, slow arrangements need fewer bars. The waveform comes from the actual PCM samples. Playback is manual, with seeking and a downloadable file available after rendering.',
            'Export the JSON recipe when you want to reproduce the result, version it with a project or continue editing later. The same recipe can be passed to the hosted tool as a JSON string in input. Browser rendering runs in a background worker without uploading the composition. Hosted rendering uses the same engine and your normal successful-run allowance.',
        ],
    },
    {
        title: 'What this generator supports',
        paragraphs: [
            'This is an instrumental sequencer and synthesizer. It does not turn a text prompt into a song, generate speech, clone a voice or imitate a named artist. The built-in arrangements are original starting material. If you enter a melody from another composition, the export does not check or clear rights to that melody.',
        ],
    },
];
const developerDetails: Record<string, ToolDetail[]> = {
    'network-web-page-to-markdown': [
        {
            title: 'A readable source for agents',
            paragraphs: [
                'The extractor follows public redirects, then looks for a main or article element before falling back to the page body. It removes navigation, forms, scripts and images, keeps headings, lists and code blocks, and resolves page links to absolute URLs. Title, description and canonical metadata stay alongside the content rather than being mixed into the Markdown.',
                'Use the Markdown for an agent context or fixture and the isolated preview to check what was extracted. The plain text and link list are available separately. Pages that depend on JavaScript, authentication or a paywall may return little useful content. The extractor does not bypass those restrictions or download linked assets.',
            ],
        },
    ],
    'email-email-authentication-checker': [
        {
            title: 'Read the published mail configuration',
            paragraphs: [
                'SPF describes authorized sending infrastructure, DKIM publishes a selector specific signing key, and DMARC tells receivers how to handle alignment failures. MX describes incoming mail delivery. BIMI is an optional brand indicator. These records solve different problems; a missing BIMI record is not a mail authentication failure.',
                'Enter the exact domain you want to check and ask your mail provider for its DKIM selector. The report distinguishes missing records, resolver errors and policies that only monitor mail. It does not send a message, verify a signature, expand every SPF include or look up inherited DMARC policies. Confirm the findings with your provider before editing DNS.',
            ],
        },
    ],
    'network-robots-and-sitemap-checker': [
        {
            title: 'Check crawl access before publishing',
            paragraphs: [
                'Enter a page URL, rather than just the domain, so the robots decision applies to the path you care about. The report shows the matching rule, line and crawler name. A server error leaves the decision unknown because crawlers should defer while robots.txt is unavailable. An ordinary missing robots file applies no restrictions.',
                'The checker reads up to two declared sitemaps, or tries /sitemap.xml when none are declared. URL sets list page locations and sitemap indexes list child documents without crawling them. Review response errors, malformed XML and invalid locations. Allowing a page and publishing a sitemap help discovery but cannot guarantee indexing or ranking.',
            ],
        },
    ],
    'developer-fake-identity-generator': [
        {
            title: 'Keep personal data out of fixtures',
            paragraphs: [
                'Choose a locale to get a consistent country, address format and diverse names. Every record in a batch has a distinct name, email, phone and company. Emails use example.test, so a test suite cannot accidentally send messages to an actual customer at those addresses.',
                'These records are fictional form fixtures. They are not identity documents, verified contact details or proof of residence, and address or phone format does not guarantee a deliverable or unassigned destination. Never use them to contact people. Use an owned inbox for tests that need actual email delivery.',
            ],
        },
    ],
    'developer-test-bank-account-generator': [
        {
            title: 'Separate format testing from payment testing',
            paragraphs: [
                'An IBAN combines a country code, check digits and a country specific account string. These fixtures have the expected country length and a valid mod 97 checksum. US records have a nine digit routing number with an ABA checksum and a separate account number. Each account in one batch is distinct.',
                'Checksums detect common typing mistakes; they do not prove that a bank or account exists. These fixtures do not claim real issuers and are not official payment sandbox credentials. Use them for parsers, input masks and API fixtures. Use your payment provider\u2019s documented sandbox accounts when testing transfers or account verification.',
            ],
        },
    ],
    'developer-json-schema-validator': [
        {
            title: 'Validate without changing the payload',
            paragraphs: [
                'Paste the document in the main editor and its JSON Schema in the schema field. Select the draft through the schema\u2019s $schema value, or omit it for draft 7. Errors include the instance path, validation keyword and details such as the missing property. Empty error lists mean the supplied document matches that schema.',
                'The validator does not coerce values, remove properties or insert defaults. Common format checks are enabled. Local references are supported, while external references must be bundled first. Pattern validation uses RE2, which intentionally excludes backreferences and lookarounds. Hosted runs use the normal tool allowance and do not retain source documents.',
            ],
        },
    ],
    'developer-json-schema-from-sample': [
        {
            title: 'Start with evidence, then refine the contract',
            paragraphs: [
                'Inference combines every array item instead of assuming the first row is representative. Object keys become required only when present in every observed object of that shape. Mixed values become alternatives, and integer and decimal samples are combined into a number type. Empty arrays leave their item schema open.',
                'The resulting draft 2020-12 schema is a starting point. A sample cannot reveal a missing optional field, a business range or a future enum value. Review required properties and add those rules deliberately. Object keys remain open so an observed sample does not silently become a ban on every additional property.',
            ],
        },
    ],
    'developer-openapi-validator': [
        {
            title: 'Fix a contract at its source',
            paragraphs: [
                'Paste JSON or YAML for OpenAPI 3.0, 3.1 or 3.2. Structural validation checks the document and local references, while source locations point back to the original editor lines. Separate warnings identify missing summaries, missing operation IDs and repeated operation IDs that can make generated clients difficult to use.',
                'External references are never fetched from URLs or the filesystem. Bundle a multi file specification before relying on a complete validation result. The tool does not repair missing required fields or upgrade your document. Fix validation errors before importing the contract into OpenAPI to mock, then review warnings for a clearer client and documentation experience.',
            ],
        },
    ],
    'developer-secret-scanner': [
        {
            title: 'Review findings without exposing another copy',
            paragraphs: [
                'The scanner recognizes common cloud access keys, source control tokens, payment secrets, AI keys, Slack and SendGrid credentials, JWTs, private key headers and credential assignments. Findings include a masked value and source location. The full matching value is excluded from results, downloads and workspace activity.',
                'Web scans run locally in your browser. API, SDK, CLI and MCP calls use the same patterns on the server without retaining input. Pattern checks can miss unusual or split secrets and can flag fixtures that only look real. If a finding is a live credential, revoke it at its provider; deleting it from a file does not invalidate an exposed key.',
            ],
        },
    ],
    'developer-phone-number-validator': [
        {
            title: 'Normalize a number before using it',
            paragraphs: [
                'International input starts with a plus sign and calling code. A national number needs its default country, supplied as a two letter ISO code. The result separates whether a number is possible by length from whether it matches current numbering metadata, and shows E.164, national and international forms.',
                'Number type uses full metadata, although some plans share fixed line and mobile ranges. Extensions are preserved separately and in the telephone URI. This is a format check, not an SMS or call test. It cannot confirm that a number is assigned, reachable or owned by the person entering it.',
            ],
        },
    ],
    'developer-timezone-converter': [
        {
            title: 'Make daylight saving choices explicit',
            paragraphs: [
                'An offset timestamp identifies one instant. A local timestamp needs a source IANA timezone such as America/New_York, and the converter then shows the same instant in the destination zone and UTC. Unix seconds and milliseconds make the result usable in API payloads and schedulers.',
                'Daylight saving can make a local time occur twice or not occur at all. The default rejects both cases so an agent cannot silently choose the wrong instant. Select earlier or later only when you intend that interpretation. Timezone rules come from the runtime and may change when governments update their calendars.',
            ],
        },
    ],
    'developer-date-calculator': [
        {
            title: 'Use calendar arithmetic for calendar rules',
            paragraphs: [
                'Add ISO date durations such as P1M, P2W or -P10D to a Gregorian date. Month and year arithmetic constrains an invalid day to the last valid day of the destination month. For example, adding one month to January 31 can produce February 28 or 29 rather than overflowing into March.',
                'Difference mode reports whole days and a calendar duration between two dates, including negative results when the end precedes the start. Dates have no timezone or clock time here. Use the timezone converter for exact instants and daylight saving behavior; a calendar day is not always twenty four elapsed hours.',
            ],
        },
    ],
};
export function toolDetails(id: string): ToolDetail[] {
    if (developerDetails[id]) return developerDetails[id];
    if (id === 'network-http-echo') return echoDetails;
    if (id === 'mock-apis-stateful-crud-api') return crudDetails;
    if (id === 'mock-apis-api-test-scenarios') return scenarioDetails;
    if (['test-media-audio-composer', 'test-media-sample-audio'].includes(id)) return composer;
    if (id === 'test-media-music-library')
        return [
            {
                title: 'Choose a track for the job',
                paragraphs: [
                    'The collection contains six full instrumental arrangements across ambient, downtempo and electronic styles. Search by title or sound, or filter by mood. Track rows show tempo and duration so you can choose a rhythm that fits an animation, a product demo or a prototype. Each full MP3 lasts about one-and-a-half to three minutes, with intro, verse, chorus, bridge and outro sections. The recordings are synthesized locally from original compositions.',
                    'Press Play to start listening. You can seek, adjust volume, repeat a track or enable automatic playback of the next track. No sound begins when the page first loads. The player fetches the selected track directly from this deployment, and downloads do not depend on a third-party music account.',
                ],
            },
            {
                title: 'Download a recording or edit its arrangement',
                paragraphs: [
                    'Download MP3 saves the full arrangement. Download WAV loop saves its uncompressed stereo base loop for editing. Customize its loop opens that base pattern in the audio composer. There you can change the notes, percussion, instrument, tempo and mix, then export a new version and its JSON recipe.',
                    'The original tracks have deterministic recipes, so the same version of the renderer produces the same recording from the same settings. Keep the recipe if reproducibility matters to your test or project. Full arrangements use several sections and mix variations. The browser composer edits a shorter base loop, rather than providing a full multisection song editor.',
                ],
            },
            {
                title: 'Use the streaming API',
                paragraphs: [
                    'GET /api/music returns track names, moods, tempos, durations, licensing information and audio URLs. Each audio endpoint accepts a single HTTP byte range, supporting progressive playback and seeking. ETag, If-None-Match and If-Range are supported for caching. A malformed or unsatisfiable range returns 416 instead of silently producing a different section.',
                    'Full MP3 arrangements are included with the deployment; WAV loops are rendered on first use. Subsequent requests can use a bounded in-memory cache. Direct streaming and download URLs do not consume hosted renders. MCP run_tool returns audioUrl and downloadUrl for library tracks instead of inline Base64. HTTP tool runs still return artifacts. Requests to run_tool, including library requests and custom compositions, use the normal successful-run allowance.',
                ],
            },
            {
                title: 'License scope',
                paragraphs: [
                    'The six built-in compositions and synthesized recordings are dedicated under CC0 1.0. Attribution is optional, including for commercial projects. The collection contains no third-party recordings or vocals. The CC0 link below provides the complete terms.',
                    'This dedication applies to the named built-in tracks. It does not change the license of an uploaded file or clear someone else’s melody imported into the composer. A track’s source and license metadata should travel with an asset when you pass it to another team.',
                ],
            },
        ];
    if (id === 'agents-mcp-server-inspector')
        return [
            {
                title: 'Inspect the connection before an agent uses it',
                paragraphs: [
                    'The inspector opens a Streamable HTTP connection, sends initialize, checks the negotiated protocol version and acknowledges initialization. It then requests the selected discovery collection: tools, resource descriptors or prompt descriptors. It never invokes tools, expands prompts or reads resource contents.',
                    'The result shows server implementation information, capabilities and the returned descriptors. Tool input schemas are displayed as structured data so you can check required arguments and property types. Names and descriptions are untrusted server-provided text, not instructions to the inspector or permission to run an action.',
                ],
            },
            {
                title: 'Use explicit authentication and bounded discovery',
                paragraphs: [
                    'Put a bearer token in the masked token field or use an additional X-* authentication header if the server requires one. Credentials are sent only to the supplied public endpoint; redirects are not followed. Recognized credential parameters in the URL are rejected so a private token does not become part of a copied endpoint address.',
                    'Discovery is limited to five server pages, one hundred items, bounded responses and a ten-second overall deadline. Increase the item limit when a server returns more descriptors than the initial view. When a complete page supplies a next cursor, you can use that cursor to continue. A server that does not advertise a collection is reported explicitly.',
                ],
            },
            {
                title: 'Supported transport and lifecycle',
                paragraphs: [
                    'The inspector supports JSON and SSE response bodies over public HTTP or HTTPS endpoints. It negotiates the listed supported protocol versions and includes the negotiated version and session header on subsequent requests. When the server creates a session, the inspector attempts to close it after discovery.',
                    'Local stdio servers, private-network endpoints and interactive OAuth login are outside this hosted inspector’s scope. The public-network protections validate resolved addresses before each connection. A failed inspection does not consume a successful hosted run, and input credentials are not saved as execution history.',
                ],
            },
        ];
    if (id === 'test-media-placeholder-images')
        return [
            {
                title: 'Create a useful visual for the right canvas',
                paragraphs: [
                    'Start with the destination dimensions: a wide social preview, a hero banner, a square card or a small upload fixture. The generator offers landscape illustrations, soft gradients, geometric compositions, technical grids and solid backgrounds. The result is an original vector composition, not a photograph or a search result from a stock library.',
                    'Choose a palette for a coordinated background, foreground and accent. Use a variation seed to change the composition while keeping its general style. The same settings produce the same SVG, making the image useful for repeatable visual tests. A new seed changes the arrangement without requiring a different file from an external service.',
                ],
            },
            {
                title: 'Add captions and use your own colors',
                paragraphs: [
                    'An optional title and subtitle place readable text over the artwork. Caption size adapts to the dimensions and text length. Very small images still have limited space, so keep thumbnail labels short. Leave both fields empty when you want clean artwork to place behind a separate text layer in your application.',
                    'Custom color controls accept six-digit hex values for the background, foreground and accent. Switching back to palette mode uses the selected preset again. Review your chosen text and background together, particularly when the image will be shown at a smaller size than its export dimensions.',
                ],
            },
            {
                title: 'Choose SVG or PNG intentionally',
                paragraphs: [
                    'SVG keeps the image editable and scales without raster pixelation. It is suitable for design adjustments and applications that accept vector assets. PNG rasterizes the composition at the requested width and height, making it easier to use in upload forms, social-image pipelines and software that does not accept SVG.',
                    'The image uses built-in shapes and text rather than remote photographs or embedded web fonts. PNG text rendering can differ slightly between your browser and the hosted runtime because their font engines differ. Dimensions and the selected palette remain explicit. Up to sixteen million pixels and five MiB of output are supported.',
                ],
            },
            {
                title: 'Reuse the settings through an API',
                paragraphs: [
                    'The same tool ID is available through HTTP, SDK, CLI, SSH and MCP. Set style, theme, seed, width, height, subtitle and format in options; the optional title is input. To learn the exact option names and supported values, use the per-tool descriptor endpoint, the CLI describe command or MCP describe_tool.',
                    'SVG output is escaped and contains only generated shapes, gradients and text. No user-supplied SVG is executed by this generator, and no remote image request is made. Image conversion and upload inspection remain separate tools with their own file controls.',
                ],
            },
        ];
    if (id === 'test-media-sample-avatars')
        return [
            {
                title: 'Give synthetic identities a consistent visual',
                paragraphs: [
                    'Choose initials for recognizable names, a symmetric identicon for a compact abstract mark, an orbital style for a geometric badge or a simple robot for an application persona. The input name and variation seed determine the generated shape. Reusing both values keeps an avatar stable across development sessions.',
                    'These avatars are generated illustrations. They are not photographs of real people and do not verify an account’s identity. A decorative identicon should not be used as a security check or as proof that two keys, users or credentials are the same.',
                ],
            },
            {
                title: 'Match the shape and palette to your interface',
                paragraphs: [
                    'Circle, rounded-square and square options change the clipping shape. Palette presets coordinate the background and foreground, while optional hex controls let you match an existing brand. The PNG export preserves transparency outside a circular or rounded clipping boundary.',
                    'Choose the export size for the destination rather than enlarging a tiny raster file later. SVG remains scalable; PNG is useful for profile-image uploads and systems that expect a conventional bitmap. Long names use their first two initials in the initials style, while other styles derive their pattern from the input rather than printing the entire name.',
                ],
            },
            {
                title: 'Reproduce an avatar from code',
                paragraphs: [
                    'Send the name as input and choose style, theme, mode, width, seed and format in options. The browser keeps the name on your device. Hosted requests use the same settings and normal execution rules. The SVG is deterministic; rasterized text can vary with the font engine.',
                    'For a test directory, store the synthetic name and seed with each fixture record. This gives a repeatable avatar without fetching someone else’s profile picture or relying on a third-party avatar provider. Use a new seed when you want a different version while retaining the same label.',
                ],
            },
        ];
    return [];
}
