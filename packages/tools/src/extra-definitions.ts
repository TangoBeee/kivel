import { imageDesignOperations } from './image-definitions.js';
import { audioOperations } from './audio-definitions.js';
import { dataOperations } from './data-definitions.js';
import type { OperationOptions } from './definitions.js';
export interface UtilityField {
    key: keyof OperationOptions;
    label: string;
    type?: 'number' | 'textarea' | 'text' | 'password';
    defaultValue: string;
    choices?: readonly (readonly [string, string])[];
    min?: number;
    max?: number;
    when?: readonly [keyof OperationOptions, string];
}
export interface ExtraDefinition {
    action: string;
    input: boolean;
    inputLabel?: string;
    placeholder?: string;
    fields?: readonly UtilityField[];
    preview?: 'file' | 'html';
    file?: boolean;
    multiple?: boolean;
    intro: string;
    steps: readonly string[];
    limits: string;
    useCase: string;
    example: string;
}
const count = (max = 1000, value = '10'): UtilityField => ({
    key: 'count',
    label: 'Count',
    type: 'number',
    defaultValue: value,
    min: 1,
    max,
});
const comparison: UtilityField = {
    key: 'comparison',
    label: 'Updated text',
    type: 'textarea',
    defaultValue: '',
};
const methods: UtilityField = {
    key: 'method',
    label: 'Method',
    defaultValue: 'GET',
    choices: [
        ['GET', 'GET'],
        ['POST', 'POST'],
        ['PUT', 'PUT'],
        ['PATCH', 'PATCH'],
        ['DELETE', 'DELETE'],
        ['HEAD', 'HEAD'],
        ['OPTIONS', 'OPTIONS'],
    ],
};
const requestFields: readonly UtilityField[] = [
    methods,
    {
        key: 'headers',
        label: 'Headers (one Name: value per line)',
        type: 'textarea',
        defaultValue: '',
    },
    { key: 'body', label: 'Request body', type: 'textarea', defaultValue: '' },
];
export const conversionUnits = [
    ['m', 'Metres (m)'],
    ['km', 'Kilometres (km)'],
    ['cm', 'Centimetres (cm)'],
    ['mm', 'Millimetres (mm)'],
    ['in', 'Inches (in)'],
    ['ft', 'Feet (ft)'],
    ['yd', 'Yards (yd)'],
    ['mi', 'Miles (mi)'],
    ['kg', 'Kilograms (kg)'],
    ['g', 'Grams (g)'],
    ['mg', 'Milligrams (mg)'],
    ['lb', 'Pounds (lb)'],
    ['oz', 'Ounces (oz)'],
    ['L', 'Litres (L)'],
    ['mL', 'Millilitres (mL)'],
    ['m3', 'Cubic metres (m³)'],
    ['gal', 'US gallons'],
    ['floz', 'US fluid ounces'],
    ['s', 'Seconds'],
    ['min', 'Minutes'],
    ['h', 'Hours'],
    ['d', 'Days'],
    ['week', 'Weeks'],
    ['m/s', 'Metres / second'],
    ['km/h', 'Kilometres / hour'],
    ['mph', 'Miles / hour'],
    ['kn', 'Knots'],
    ['C', 'Celsius (°C)'],
    ['F', 'Fahrenheit (°F)'],
    ['K', 'Kelvin (K)'],
] as const;
const emailLimits =
    'Paste up to 64 KiB or inspect an EML file up to 1 MiB in your browser. Hosted pasted text uses plan input limits; EML files remain capped at 1 MiB. Up to 100 MIME parts, 16 nesting levels and 64 KiB of headers. Nothing is delivered, executed, fetched remotely or retained. Header claims and attachment MIME labels are untrusted; this is not signature verification or malware scanning.';
const htmlLimits =
    'Up to 64 KiB. Preview runs in an isolated frame with scripts, forms, popups and remote images disabled. Rendering is a browser approximation, not an email-client compatibility test. HTML output is untrusted and is not sanitized for insertion into another application.';
export const extraOperations = {
    ...dataOperations,
    'email-email-verification-tester': {
        action: 'Inspect verification email',
        input: true,
        file: true,
        inputLabel: 'Raw verification email (EML)',
        placeholder:
            'From: app@example.test\nSubject: Verify your account\nContent-Type: text/plain; charset=utf-8\n\nYour verification code is 123456. Open https://example.test/verify?code=example',
        intro: 'Inspect a verification email for candidate codes and links without sending mail or opening its links.',
        steps: [
            'Paste a raw email or choose an EML file.',
            'Inspect extracted links, candidate codes and message details.',
            'Compare the result with the expected verification flow in your application.',
        ],
        limits:
            emailLimits +
            ' Candidate codes are heuristic matches, not verified credentials. Links are displayed as text and are never fetched. This does not test delivery or complete a signup flow.',
        useCase:
            'Check the code and link included in a test verification email before testing the full signup flow.',
        example: 'A test message containing a six-digit code and a verification URL.',
    },
    'email-email-inspector': {
        action: 'Inspect email',
        input: true,
        inputLabel: 'Raw email (EML)',
        placeholder:
            'From: sender@example.test\nTo: recipient@example.test\nSubject: Example\n\nHello.',
        file: true,
        intro: 'Parse a pasted or uploaded EML message into headers, addresses, text, HTML and attachment metadata.',
        steps: [
            'Paste a raw email or choose an EML file.',
            'Inspect the decoded message and headers.',
        ],
        limits: emailLimits,
        useCase: 'Debug a saved email without sending it to a mailbox.',
        example: 'Subject: Example\nContent-Type: text/plain\n\nHello.',
    },
    'email-attachment-inspector': {
        action: 'Inspect attachments',
        input: true,
        inputLabel: 'Raw email (EML)',
        file: true,
        intro: 'Inspect attachment names, MIME labels, exact byte sizes and SHA-256 hashes from a saved EML message.',
        steps: [
            'Paste a raw email or choose an EML file.',
            'Review attachment metadata and hashes.',
        ],
        limits: emailLimits,
        useCase: 'Check attachment encoding in a saved MIME message.',
        example: 'EML message → attachment names, sizes and SHA-256 hashes',
    },
    'email-email-html-preview': {
        action: 'Preview email HTML',
        input: true,
        inputLabel: 'Email HTML',
        placeholder: '<h1>Hello</h1><p>Your test email.</p>',
        preview: 'html',
        intro: 'Preview pasted email HTML in a frame that blocks scripts and remote resources.',
        steps: ['Paste the HTML body of an email.', 'Preview it and inspect or copy the source.'],
        limits: htmlLimits,
        useCase: 'Review a transactional email without loading tracking images.',
        example: '<h1>Hello</h1><p>Your test email.</p>',
    },
    'email-email-template-tester': {
        action: 'Render template',
        input: true,
        inputLabel: 'HTML template',
        placeholder: '<h1>Hello {{name}}</h1>',
        fields: [
            {
                key: 'values',
                label: 'Template values (JSON strings)',
                type: 'textarea',
                defaultValue: '{}',
            },
        ],
        preview: 'html',
        intro: 'Render a small HTML email template using escaped {{name}} string substitutions.',
        steps: [
            'Paste HTML with named placeholders.',
            'Provide named string values as JSON.',
            'Render the isolated preview and inspect the output.',
        ],
        limits:
            htmlLimits +
            ' Up to 100 values of 4,096 characters each, with rendered output limited to 256 KiB. Supports simple substitutions only; no loops, helpers or executable expressions. Unmatched placeholders remain visible.',
        useCase: 'Check email copy with sample recipient values.',
        example: 'Template: <h1>Hello {{name}}</h1>\nValues: {"name":"Ada"}',
    },
    'developer-xml-formatter': {
        action: 'Format XML',
        input: true,
        placeholder: '<order id="1"><status>ready</status></order>',
        intro: 'Validate XML and format it with consistent indentation while keeping element order and text values.',
        steps: ['Paste an XML document.', 'Format it and copy the result.'],
        limits: 'Up to 64 KiB and 64 nested elements. DTDs and entity declarations are rejected. Mixed text, CDATA and xml:space="preserve" documents are validated and returned unchanged to preserve spacing. This checks well-formed XML, not an XSD schema.',
        useCase: 'Read a small XML API response or configuration without changing numeric text.',
        example: '<order id="1">\n  <status>ready</status>\n</order>',
    },
    'developer-regex-tester': {
        action: 'Find matches',
        input: true,
        inputLabel: 'Test text',
        placeholder: 'Order 123, order 456',
        fields: [
            { key: 'pattern', label: 'Pattern (without / delimiters)', defaultValue: '[0-9]+' },
            {
                key: 'flags',
                label: 'Flags',
                defaultValue: '',
                choices: [
                    ['', 'None'],
                    ['i', 'Ignore case'],
                    ['m', 'Multiline'],
                    ['im', 'Ignore case + multiline'],
                    ['s', 'Dot matches newline'],
                    ['ims', 'All three'],
                ],
            },
        ],
        intro: 'Find matches and capture groups with a bounded, linear-time regular expression engine.',
        steps: [
            'Enter test text and a pattern.',
            'Choose flags and inspect match positions and groups.',
        ],
        limits: 'Uses RE2 syntax, not every JavaScript regex feature. Backreferences and lookaround are unsupported. Up to 32 KiB of text, 512 pattern characters, and 100 returned matches. Offsets use JavaScript UTF-16 indexes.',
        useCase: 'Check extraction patterns without catastrophic backtracking.',
        example: 'Text: Order 123\nPattern: [0-9]+\nMatch: 123',
    },
    'developer-ulid-generator': {
        action: 'Generate ULIDs',
        input: false,
        fields: [count(100, '1')],
        intro: 'Generate 26-character ULIDs with a 48-bit millisecond timestamp and 80 random bits.',
        steps: ['Choose up to 100 IDs.', 'Generate and copy one ULID per line.'],
        limits: 'IDs are monotonic within one generated batch. Separate calls in the same millisecond have no ordering guarantee. ULIDs reveal their creation time.',
        useCase: 'Create timestamp-sortable identifiers for test records.',
        example:
            'Format: 26 Crockford Base32 characters\nFirst 10 characters encode the timestamp.',
    },
    'developer-cron-expression-helper': {
        action: 'Inspect schedule',
        input: true,
        inputLabel: 'Cron expression',
        placeholder: '*/15 * * * *',
        fields: [
            { key: 'timezone', label: 'IANA timezone', defaultValue: 'UTC' },
            { key: 'start', label: 'Start date (ISO with timezone; optional)', defaultValue: '' },
            count(20, '5'),
        ],
        intro: 'Validate a cron expression and list upcoming run times in a chosen timezone.',
        steps: [
            'Enter a five- or six-field cron expression.',
            'Choose a timezone and inspect the next occurrences.',
        ],
        limits: 'This is a schedule inspector; it does not create a job. Dates require an explicit timezone. A maximum of 20 upcoming occurrences is returned.',
        useCase: 'Check a scheduled job before adding it to your application.',
        example:
            '*/15 * * * *\nRuns every 15 minutes; next occurrences are shown in UTC and your selected zone.',
    },
    'developer-http-request-builder': {
        action: 'Build request',
        input: true,
        inputLabel: 'HTTP URL',
        placeholder: 'https://example.com/api/orders',
        fields: requestFields,
        intro: 'Prepare an HTTP request and a shell-quoted cURL command without sending it.',
        steps: [
            'Enter an HTTP or HTTPS URL.',
            'Set the method, headers, and body.',
            'Copy the generated request or cURL command.',
        ],
        limits: 'No network request is made. URLs with embedded credentials are rejected. Header names and values are validated; duplicate headers are preserved.',
        useCase: 'Prepare a reproducible request for a test or bug report.',
        example: 'GET https://example.com/api/orders\nAccept: application/json',
    },
    'developer-curl-builder-parser': {
        action: 'Convert cURL',
        input: true,
        inputLabel: 'cURL command or URL',
        placeholder: "curl 'https://example.com/api' -H 'Accept: application/json'",
        fields: [
            {
                key: 'mode',
                label: 'Operation',
                defaultValue: 'parse',
                choices: [
                    ['parse', 'Inspect command'],
                    ['build', 'Build command from URL'],
                ],
            },
            ...requestFields.map((field) => ({ ...field, when: ['mode', 'build'] as const })),
        ],
        intro: 'Inspect common cURL command arguments or build a quoted command from request fields.',
        steps: [
            'Choose Inspect or Build.',
            'Paste a cURL command or enter a URL.',
            'Copy the structured result or generated command.',
        ],
        limits: 'Nothing is executed, expanded, or fetched. Supports common method, header, data, user, redirect, and URL options. Unsupported flags and shell command chaining are rejected. File references are described, never opened.',
        useCase: 'Understand a copied cURL request without running it.',
        example: "curl 'https://example.com/api' -X POST -d '{\"ready\":true}'",
    },
    'developer-code-diff-checker': {
        action: 'Compare code',
        input: true,
        inputLabel: 'Original code',
        fields: [{ ...comparison, label: 'Updated code' }],
        intro: 'Compare two code snippets and return line-level additions, removals, and unchanged sections.',
        steps: [
            'Paste the original and updated versions.',
            'Compare and inspect the line changes.',
        ],
        limits: 'Up to 32 KiB per side. Diff calculation has a 200 ms time budget and a bounded edit distance; very different large inputs may require smaller sections.',
        useCase: 'Review a small change before sharing it.',
        example: 'Original: const enabled = false;\nUpdated: const enabled = true;',
    },
    'developer-environment-variable-formatter': {
        action: 'Convert environment variables',
        input: true,
        fields: [
            {
                key: 'mode',
                label: 'Operation',
                defaultValue: 'format',
                choices: [
                    ['format', 'Format .env'],
                    ['json', 'Convert .env to JSON'],
                    ['env', 'Convert JSON strings to .env'],
                ],
            },
        ],
        intro: 'Format environment assignments or convert between .env and a JSON object of strings without evaluating values.',
        steps: [
            'Choose the source and target format.',
            'Paste assignments or JSON string values.',
            'Convert and copy the result.',
        ],
        limits: 'Up to 64 KiB and 256 variables. Variables are never interpolated or executed. Duplicate .env keys use the final value. Output is checked for lossless round-tripping; unsupported representations are rejected.',
        useCase: 'Prepare test environment settings without running a shell.',
        example: 'APP_NAME=demo\nENABLED=true\n\nJSON: {"APP_NAME":"demo","ENABLED":"true"}',
    },
    'developer-api-response-formatter': {
        action: 'Inspect response',
        input: true,
        placeholder: 'HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"ready":true}',
        intro: 'Separate a pasted HTTP response into status, headers, and body, with readable JSON when present.',
        steps: [
            'Paste a full HTTP response, or just JSON.',
            'Inspect the parsed headers and formatted body.',
        ],
        limits: 'Up to 64 KiB. No URL is fetched. Repeated headers remain separate entries. Invalid JSON bodies remain text; JSON-only input must be valid.',
        useCase: 'Read a response copied from a terminal or log.',
        example: 'HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"ready":true}',
    },
    'everyday-text-formatter': {
        action: 'Format text',
        input: true,
        fields: [
            {
                key: 'mode',
                label: 'Operation',
                defaultValue: 'normalize',
                choices: [
                    ['normalize', 'Normalize whitespace'],
                    ['sort', 'Sort lines'],
                    ['unique', 'Remove duplicate lines'],
                ],
            },
        ],
        intro: 'Normalize text layout, sort lines, or remove duplicate lines while preserving the first occurrence.',
        steps: ['Paste your text.', 'Choose a formatting operation.', 'Copy the result.'],
        limits: 'Normalizing converts line endings and removes trailing spaces while preserving indentation. Sorting is deterministic and case-sensitive. Duplicate removal compares complete lines.',
        useCase: 'Tidy lists or copied configuration text.',
        example: 'beta\nalpha\nbeta\n\nUnique lines: beta, alpha',
    },
    'everyday-text-comparison': {
        action: 'Compare text',
        input: true,
        inputLabel: 'Original text',
        fields: [comparison],
        intro: 'Compare two text versions and inspect line-level differences.',
        steps: ['Paste both versions.', 'Compare additions, deletions, and unchanged lines.'],
        limits: 'Up to 32 KiB per version, with a bounded 200 ms diff calculation. Line endings are compared as supplied.',
        useCase: 'Review edits to a short note or document extract.',
        example: 'Original: Hello world\nUpdated: Hello there',
    },
    'everyday-markdown-preview': {
        action: 'Preview Markdown',
        input: true,
        placeholder: '# Example\n\n- A useful list\n- **Bold text**',
        preview: 'html',
        intro: 'Render GitHub-flavored Markdown and inspect the generated HTML in an isolated preview.',
        steps: ['Paste Markdown.', 'Preview the result or copy the generated HTML.'],
        limits: 'Up to 64 KiB. The preview disables scripts, forms, popups, and remote images. Generated HTML is untrusted source, not sanitized HTML for insertion into another application.',
        useCase: 'Check a README section before publishing it.',
        example: '# Example\n\n**Bold** and `inline code`.',
    },
    'everyday-qr-code-generator': {
        action: 'Generate QR code',
        input: true,
        inputLabel: 'Text or URL',
        placeholder: 'https://example.com',
        preview: 'file',
        fields: [
            {
                key: 'level',
                label: 'Error correction',
                defaultValue: 'M',
                choices: [
                    ['L', 'Low (L)'],
                    ['M', 'Medium (M)'],
                    ['Q', 'Quartile (Q)'],
                    ['H', 'High (H)'],
                ],
            },
        ],
        intro: 'Create a downloadable SVG QR code for UTF-8 text or a URL.',
        steps: [
            'Enter text or a URL.',
            'Choose error correction and generate.',
            'Preview and download the SVG.',
        ],
        limits: 'Up to 1,000 UTF-8 bytes, subject to QR capacity at the selected correction level. The encoded URL is never visited. SVG includes a four-module quiet zone.',
        useCase: 'Create a scannable link for a test page or printed handout.',
        example: 'Input: https://example.com\nOutput: QR code SVG',
    },
    'everyday-unit-converter': {
        action: 'Convert units',
        input: true,
        inputLabel: 'Numeric value',
        placeholder: '1',
        fields: [
            { key: 'from', label: 'From', defaultValue: 'km', choices: conversionUnits },
            { key: 'to', label: 'To', defaultValue: 'mi', choices: conversionUnits },
        ],
        intro: 'Convert length, mass, volume, time, speed, and temperature using explicit units.',
        steps: [
            'Enter a numeric value.',
            'Choose compatible source and target units.',
            'Convert and inspect the result.',
        ],
        limits: 'Uses floating-point arithmetic. Volume units labeled US use US definitions. Temperature values below absolute zero are rejected. Incompatible dimensions cannot be converted.',
        useCase: 'Convert measurements without ambiguous unit names.',
        example: '1 kilometre ≈ 0.621371 miles',
    },
    'test-media-dummy-csv': {
        action: 'Generate CSV',
        input: false,
        fields: [
            count(),
            {
                key: 'columns',
                label: 'Column names (comma-separated)',
                defaultValue: 'id,name,email',
            },
        ],
        intro: 'Generate a small CSV test dataset with a header row and predictable sample records.',
        steps: ['Choose rows and column names.', 'Generate the CSV and download or copy it.'],
        limits: 'Up to 1,000 rows and 32 unique columns. Names use letters, digits, spaces, underscores, and hyphens, starting with a letter or underscore. Email values use example.test.',
        useCase: 'Exercise a CSV upload or import flow.',
        example: 'id,name,email\n1,Example 1,person1@example.test',
    },
    'test-media-json-fixtures': {
        action: 'Generate JSON fixtures',
        input: false,
        fields: [
            count(),
            {
                key: 'columns',
                label: 'Field names (comma-separated)',
                defaultValue: 'id,name,email,active',
            },
        ],
        intro: 'Generate JSON arrays of predictable test records with selected field names.',
        steps: ['Choose the record count and fields.', 'Generate and copy or download the array.'],
        limits: 'Up to 1,000 records and 32 fields. Known sample fields have useful types; other fields receive labeled string values. Data is synthetic.',
        useCase: 'Prepare a small API fixture or empty-to-populated UI test.',
        example: '[{"id":1,"name":"Example 1","email":"person1@example.test","active":true}]',
    },
    'test-media-xml-fixtures': {
        action: 'Generate XML fixtures',
        input: false,
        fields: [count()],
        intro: 'Generate a well-formed XML document containing predictable sample records.',
        steps: ['Choose up to 1,000 records.', 'Generate and copy the XML.'],
        limits: 'A fixed records/record schema is used. This produces a sample document, not an XSD schema or schema-specific data.',
        useCase: 'Test an XML upload or parser against a reproducible fixture.',
        example: '<records><record id="1"><name>Example 1</name></record></records>',
    },
    'test-media-binary-payload-generator': {
        action: 'Generate payload',
        input: false,
        preview: 'file',
        fields: [
            {
                key: 'size',
                label: 'Size in bytes',
                type: 'number',
                defaultValue: '1024',
                min: 1,
                max: 262144,
            },
            {
                key: 'mode',
                label: 'Contents',
                defaultValue: 'sequence',
                choices: [
                    ['sequence', 'Repeating byte sequence'],
                    ['zero', 'Zero bytes'],
                    ['random', 'Random bytes'],
                ],
            },
        ],
        intro: 'Create a binary file of an exact size for upload and byte-handling tests.',
        steps: ['Choose a byte count and content mode.', 'Generate and download the binary file.'],
        limits: 'From one byte to 256 KiB. Hosted output describes the file with Base64 data; the browser offers a binary download. No file is uploaded or stored.',
        useCase: 'Check upload limits and exact-byte preservation.',
        example: 'Size: 1024 bytes\nMode: sequence\nOutput: payload.bin',
    },
    'test-media-sample-pdf': {
        action: 'Generate PDF',
        input: true,
        inputLabel: 'Sample page text (optional)',
        preview: 'file',
        fields: [{ ...count(10, '1'), label: 'Pages' }],
        intro: 'Create a small, valid PDF fixture with selectable text and a chosen page count.',
        steps: [
            'Choose one to ten pages and optional sample text.',
            'Generate and download the PDF.',
        ],
        limits: 'ASCII text up to 1,000 characters is supported. Uses a standard PDF font and fixed page layout. No JavaScript, forms, links, or attachments are embedded.',
        useCase: 'Test a document upload or page-count workflow.',
        example: 'Pages: 2\nOutput: sample.pdf',
    },
    'test-media-zip-generator': {
        action: 'Generate ZIP',
        input: true,
        inputLabel: 'Files as JSON (optional)',
        placeholder: '[{"name":"hello.txt","text":"Hello"}]',
        preview: 'file',
        intro: 'Build a downloadable ZIP archive from named UTF-8 text entries.',
        steps: ['Enter a JSON array of file names and text.', 'Generate and download the ZIP.'],
        limits: 'Up to 20 entries and 256 KiB of total text. Stored entries are uncompressed. Absolute paths, traversal, duplicate names, and unsafe path characters are rejected.',
        useCase: 'Test a multi-file import without preparing files manually.',
        example: '[{"name":"hello.txt","text":"Hello"}]',
    },
    'test-media-corrupt-file-fixtures': {
        action: 'Generate malformed file',
        input: false,
        preview: 'file',
        fields: [
            {
                key: 'format',
                label: 'Format',
                defaultValue: 'pdf',
                choices: [
                    ['pdf', 'Truncated PDF'],
                    ['png', 'Truncated PNG'],
                    ['zip', 'Truncated ZIP'],
                ],
            },
        ],
        intro: 'Generate deliberately truncated file fixtures to test rejection and error handling.',
        steps: [
            'Choose PDF, PNG, or ZIP.',
            'Generate the file and use it in a controlled negative test.',
        ],
        limits: 'These files are intentionally malformed and are not valid documents or media. They contain only short static byte sequences, with no executable payload.',
        useCase: 'Verify that an upload flow handles malformed files clearly.',
        example: 'Format: PDF\nOutput: corrupt.pdf (intentionally invalid)',
    },
    'test-media-tone-generator': {
        action: 'Generate tone',
        input: false,
        preview: 'file',
        fields: [
            {
                key: 'frequency',
                label: 'Frequency (Hz)',
                type: 'number',
                defaultValue: '440',
                min: 20,
                max: 7500,
            },
            {
                key: 'duration',
                label: 'Duration (seconds)',
                type: 'number',
                defaultValue: '1',
                min: 0.1,
                max: 5,
            },
        ],
        intro: 'Generate a mono PCM WAV sine tone for audio handling tests.',
        steps: [
            'Choose frequency and duration.',
            'Generate, preview at a comfortable volume, or download the WAV.',
        ],
        limits: '20–7,500 Hz, 0.1–5 seconds, 16 kHz sample rate, 16-bit mono PCM. Audio never plays automatically.',
        useCase: 'Check playback, waveform, and audio-upload workflows.',
        example: '440 Hz · 1 second · WAV',
    },
    'everyday-barcode-generator': {
        action: 'Generate barcode',
        input: true,
        inputLabel: 'Barcode value',
        placeholder: 'EXAMPLE-001',
        preview: 'file',
        fields: [
            {
                key: 'format',
                label: 'Format',
                defaultValue: 'code128',
                choices: [
                    ['code128', 'Code 128'],
                    ['ean13', 'EAN-13'],
                    ['code39', 'Code 39'],
                ],
            },
        ],
        intro: 'Generate a downloadable SVG barcode using Code 128, EAN-13, or Code 39.',
        steps: [
            'Choose a symbology and enter its supported value.',
            'Generate, preview, and download the SVG.',
        ],
        limits: 'Up to 80 characters. Each symbology enforces its own character set and check-digit rules. Barcode generation does not register a product identifier.',
        useCase: 'Test product-label and barcode-scanning interfaces.',
        example: 'EXAMPLE-001 → Code 128 SVG',
    },
    'files-file-metadata-inspector': {
        action: 'Inspect file',
        input: false,
        file: true,
        intro: 'Inspect a file’s name, exact size, extension, signature hint, and initial bytes without storing it.',
        steps: ['Choose a local file.', 'Inspect the basic metadata and signature hint.'],
        limits: 'Browser files up to 25 MiB. Hosted Base64 files accept up to 10 MiB. Signature hints are not malware scanning or full format validation. Files are not stored.',
        useCase: 'Check an upload fixture before using it in a test.',
        example: 'name: sample.pdf\nsize: 1024 bytes\nsignatureHint: PDF',
    },
    'mock-apis-mock-configuration-import': {
        action: 'Validate configuration',
        input: true,
        intro: 'Validate and normalize an existing socket.help mock API configuration for import or export.',
        steps: [
            'Paste a JSON configuration with name and routes.',
            'Validate and copy the normalized JSON.',
            'Paste it into the Mock REST API editor’s Import configuration section.',
        ],
        limits: 'Uses the same validation as the hosted mock API: one to 20 routes, 80 KiB total configuration, two-second maximum delay, and restricted response headers. Validation alone creates no endpoint.',
        useCase: 'Reuse a known mock definition across test sessions.',
        example:
            '{"name":"Example","routes":[{"method":"GET","path":"/hello","status":200,"body":"Hello"}]}',
    },
    'mock-apis-openapi-to-mock': {
        action: 'Build mock configuration',
        input: true,
        intro: 'Convert an OpenAPI 3.x JSON document into a validated static socket.help mock configuration.',
        steps: [
            'Paste an OpenAPI 3.x JSON specification.',
            'Generate response examples and inspect the routes.',
            'Copy the configuration into the Mock REST API editor and create the endpoint.',
        ],
        limits: 'Static JSON and text responses only. Up to 20 routes and 64 KiB input. Supports local response/schema references, explicit examples, and basic object, array, enum, and scalar schemas. No remote references, inference, live requests, or stateful behavior.',
        useCase: 'Start a small mock from an existing API contract.',
        example: 'OpenAPI paths /users/{id} become mock routes /users/:id.',
    },
    ...audioOperations,
    ...imageDesignOperations,
} as const satisfies Record<string, ExtraDefinition>;
export type ExtraOperationId = keyof typeof extraOperations;
