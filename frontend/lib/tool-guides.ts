import { resourceOperations } from '@socket-help/tools/resource-definitions';
import { mediaOperations } from '@socket-help/tools/media-definitions';
import { networkOperations } from '@socket-help/tools/network-definitions';
import { extraOperations } from '@socket-help/tools/extra-definitions';
import type { ExtraDefinition } from '@socket-help/tools/extra-definitions';
import type { CatalogTool } from './catalog';
interface Guide {
    intro: string;
    steps: string[];
    limits: string;
}
const guides: Record<string, Guide> = {
    'files-temporary-json-storage': {
        intro: 'Store a small JSON document as an expiring private or public resource, with exact-byte downloads and a safe JSON preview.',
        steps: [
            'Paste valid JSON and choose a file name.',
            'Choose private or public access and create the share.',
            'Use the download URL from a browser, HTTP client, or SDK.',
        ],
        limits: 'The text editor accepts up to 256 KiB; binary uploads accept up to 10 MiB. Resources start with one hour and use the same file storage, download allowances, sharing controls, and lifecycle as temporary file transfer. Private links contain only the ID; send the access token separately. Text is previewed without execution.',
    },
    'files-temporary-binary-storage': {
        intro: 'Store nonempty binary data in an expiring resource and retrieve the original bytes through HTTP or the shared clients.',
        steps: [
            'Select a file up to 10 MiB.',
            'Choose access and a download allowance.',
            'Upload and save the returned URL and credentials.',
        ],
        limits: 'The text editor accepts up to 256 KiB; binary uploads accept up to 10 MiB. Resources start with one hour and use the same file storage, download allowances, sharing controls, and lifecycle as temporary file transfer. Private links contain only the ID; send the access token separately. Text is previewed without execution.',
    },
    'files-text-code-sharing': {
        intro: 'Share an expiring text note or code snippet with explicit public or private access.',
        steps: [
            'Paste text or code and choose a file name.',
            'Choose access and create the share.',
            'Send the link and private access token separately.',
        ],
        limits: 'The text editor accepts up to 256 KiB; binary uploads accept up to 10 MiB. Resources start with one hour and use the same file storage, download allowances, sharing controls, and lifecycle as temporary file transfer. Private links contain only the ID; send the access token separately. Text is previewed without execution.',
    },
    'everyday-temporary-notes': {
        intro: 'Create a short-lived note that can be read through a safe text preview or downloaded unchanged.',
        steps: [
            'Write a note and choose a file name.',
            'Create a private or public share.',
            'Delete the note when finished or let it expire.',
        ],
        limits: 'The text editor accepts up to 256 KiB; binary uploads accept up to 10 MiB. Resources start with one hour and use the same file storage, download allowances, sharing controls, and lifecycle as temporary file transfer. Private links contain only the ID; send the access token separately. Text is previewed without execution.',
    },
    'developer-code-paste-sharing': {
        intro: 'Share a source snippet as an expiring text resource without executing its contents.',
        steps: [
            'Paste source code and choose a file name.',
            'Choose who can access the share.',
            'Copy the link and send any private token separately.',
        ],
        limits: 'The text editor accepts up to 256 KiB; binary uploads accept up to 10 MiB. Resources start with one hour and use the same file storage, download allowances, sharing controls, and lifecycle as temporary file transfer. Private links contain only the ID; send the access token separately. Text is previewed without execution.',
    },
    'domains-temporary-callback-url': {
        intro: 'Create a temporary HTTP callback address and inspect incoming test requests without deploying a receiver.',
        steps: [
            'Create an inbox with private or public receiver access.',
            'Send a test callback to its endpoint.',
            'Inspect and delete captured data when finished.',
        ],
        limits: 'Uses the existing webhook inbox API and its retention, body-size, history, and request-rate limits. New receivers are private. Use X-Access-Token for private callers; inspection uses a separate credential or workspace access.',
    },

    'developer-credit-card-generator': {
        intro: 'Build credit-card fixtures for checkout development using published Stripe sandbox numbers. Choose Visa, Mastercard, American Express, or Discover and receive a future expiry, sample CVC, and matching test PaymentMethod identifier.',
        steps: [
            'Choose all supported brands or one brand.',
            'Set a count from one to 20 and generate the fixtures.',
            'Copy an individual field or download the JSON for your sandbox tests.',
        ],
        limits: 'These are reusable provider test numbers, not newly issued cards or live payment credentials. Numbers can repeat. Use Stripe’s test environment; compatibility with other providers is not guaranteed. Browser generation stays local. Hosted calls use normal tool quotas.',
    },
    'developer-debit-card-generator': {
        intro: 'Create debit-card test records with the published Visa debit and Mastercard debit sandbox fixtures. Funding labels come from the documented fixtures, rather than guesses about a live account.',
        steps: [
            'Choose Visa, Mastercard, or all supported debit brands.',
            'Generate between one and 20 test records.',
            'Use the preview for form tests or copy the PaymentMethod identifier for Stripe API tests.',
        ],
        limits: 'This tool creates no bank account or spendable funds. The fixed sandbox numbers repeat across records. Sample expiry and CVC values accompany each number. Browser execution stays local; hosted execution shares your plan allowance.',
    },
    'developer-prepaid-card-generator': {
        intro: 'Create prepaid-card fixtures for a payment form or funding-aware interface. The current generator uses the published Stripe Mastercard prepaid example and includes its test PaymentMethod identifier.',
        steps: [
            'Choose the number of fixtures, from one to 20.',
            'Generate the Mastercard prepaid records.',
            'Copy fields from the preview or download the fixture JSON.',
        ],
        limits: 'Only the documented Mastercard prepaid fixture is supported. This does not issue prepaid cards, simulate balances, or generate gift-card codes. Numbers repeat, and sample values do not select new payment outcomes. Browser generation is local; hosted calls use normal quotas.',
    },
    'developer-card-number-validator': {
        intro: 'Check the Luhn checksum of a test card number without contacting a payment service. The result shows the normalized length, last four digits, and whether it exactly matches a bundled sandbox fixture.',
        steps: [
            'Paste a test number with 13 to 19 digits; spaces and hyphens are allowed.',
            'Choose Check card number.',
            'Read checksumValid independently from recognizedTestCard.',
        ],
        limits: 'A passing checksum does not verify issuance, ownership, funds, or payment acceptance. Brand and funding labels are provided only for exact known test fixtures. Browser checks run locally. Use synthetic data; hosted checks send the input to the server for processing.',
    },
    webhooks: {
        intro: 'A webhook inbox gives callbacks a temporary destination while you build an integration. Inspect the original body, headers, query parameters, and arrival time without maintaining a receiver.',
        steps: [
            'Create an inbox and copy its endpoint.',
            'Send a request from your application or terminal.',
            'Select the request to inspect or export its contents.',
        ],
        limits: 'Anonymous inboxes last one hour and hold up to 100 requests. Accounts receive the limits shown on the plans page. Each body is limited to 100 KiB. Choose public or private receiver access. Private senders use the X-Access-Token header; inspection uses a separate credential. Sensitive headers are redacted.',
    },
    json: {
        intro: 'Make JSON easier to read, check its syntax, or remove unnecessary whitespace before using it in a request or configuration file.',
        steps: [
            'Paste your JSON document.',
            'Choose Format JSON or Minify.',
            'Copy the result or correct the reported syntax error.',
        ],
        limits: 'Processing stays in your browser. Standard JSON syntax is required; comments and trailing commas are not supported.',
    },
    base64: {
        intro: 'Convert UTF-8 text to Base64 or recover text from an encoded string. This is useful when inspecting payloads and preparing test data.',
        steps: ['Paste text or a Base64 value.', 'Choose Encode or Decode.', 'Copy the result.'],
        limits: 'Base64 is an encoding, not encryption. This tool decodes text; it is not a binary file decoder. Nothing is uploaded.',
    },
    url: {
        intro: 'Encode a query parameter or decode a percent-encoded value without changing the rest of a URL.',
        steps: [
            'Paste the value you want to convert.',
            'Choose Encode or Decode.',
            'Use the result as a URL component.',
        ],
        limits: 'This uses component encoding, so separators such as / and ? are escaped. Do not encode an entire URL when you only need one parameter. Processing stays on your device.',
    },
    uuid: {
        intro: 'Generate version 4 UUIDs for test records, request identifiers, and application development using your browser’s cryptographic random source.',
        steps: [
            'Choose how many identifiers you need.',
            'Select Generate IDs.',
            'Copy one UUID per line.',
        ],
        limits: 'Generate up to 100 UUIDs at a time. No account or server request is needed.',
    },
    hash: {
        intro: 'Calculate a SHA-256, SHA-384, or SHA-512 digest of UTF-8 text to compare values or prepare test fixtures.',
        steps: [
            'Paste the original text.',
            'Choose a SHA algorithm.',
            'Generate and copy the hexadecimal digest.',
        ],
        limits: 'Digests are computed locally. A plain hash does not authenticate a message and is not suitable for password storage.',
    },
    'developer-yaml-formatter': {
        intro: 'Format YAML with consistent indentation while checking for syntax problems, duplicate keys, and unsupported tags.',
        steps: ['Paste a YAML document.', 'Choose Format YAML.', 'Copy the formatted result.'],
        limits: 'Input is limited to 256 KiB. Aliases are bounded; values that would lose numeric precision are rejected. Processing stays in your browser.',
    },
    'developer-jwt-inspector': {
        intro: 'Decode the header and claims of a JSON Web Token when debugging authentication integrations.',
        steps: [
            'Paste a three-part JWT.',
            'Choose Inspect token.',
            'Read the decoded JSON header and claims.',
        ],
        limits: 'Signatures, expiry, issuer, and audience are not verified. Decoded claims are untrusted. The token remains on your device.',
    },
    'developer-url-parser': {
        intro: 'Break a URL into its protocol, host, path, query parameters, and fragment. Repeated query parameters remain visible as separate entries.',
        steps: [
            'Paste an absolute URL.',
            'Choose Parse URL.',
            'Inspect or copy the structured result.',
        ],
        limits: 'The URL is parsed locally and is never visited. Credentials inside a URL will appear in the output, so handle copied results carefully.',
    },
    'developer-hmac-generator': {
        intro: 'Create a keyed SHA message authentication code for webhook signing tests and other integration work.',
        steps: [
            'Enter your message and secret key.',
            'Choose SHA-256, SHA-384, or SHA-512.',
            'Generate the hexadecimal HMAC.',
        ],
        limits: 'The key is treated as UTF-8 text and stays in memory in this browser. Keys are not uploaded or saved.',
    },
    'everyday-case-converter': {
        intro: 'Change text into uppercase, lowercase, title case, camelCase, snake_case, or kebab-case.',
        steps: ['Paste your text.', 'Choose a letter-case format.', 'Convert and copy the result.'],
        limits: 'Supports Unicode letters and numbers. Identifier formats split on punctuation and spaces. Input stays on your device.',
    },
    'everyday-text-cleaner': {
        intro: 'Tidy copied text by removing repeated horizontal whitespace, trimming lines, and reducing excessive blank lines.',
        steps: [
            'Paste the text you want to clean.',
            'Choose Clean text.',
            'Copy the cleaned version.',
        ],
        limits: 'Line breaks are preserved, with at most one blank line between paragraphs. The original text is never uploaded.',
    },
    'everyday-csv-to-json': {
        intro: 'Convert comma-separated records into a JSON array while preserving quoted fields, embedded commas, and line breaks.',
        steps: ['Paste CSV with a header row.', 'Choose Convert to JSON.', 'Copy the JSON array.'],
        limits: 'Use unique headers, up to 5,000 rows, 256 columns, and 256 KiB of input. Values remain strings, preserving leading zeroes.',
    },
    'everyday-json-to-csv': {
        intro: 'Turn a JSON array of objects into CSV with a combined set of column headers.',
        steps: [
            'Paste an array of JSON objects.',
            'Choose Convert to CSV.',
            'Copy the CSV into a file or spreadsheet.',
        ],
        limits: 'Up to 5,000 rows and 256 columns are supported. Quote highly precise numeric values to preserve them. Nested objects become JSON text. Formula-like strings are escaped for safer spreadsheet use.',
    },
    'everyday-data-format-converter': {
        intro: 'Convert between JSON and YAML when working with application configuration or sample data.',
        steps: [
            'Choose YAML to JSON or JSON to YAML.',
            'Paste your source data.',
            'Convert and copy the output.',
        ],
        limits: 'XML conversion is not included yet. Input is limited to 256 KiB; unsupported YAML tags, duplicate keys, and excessive aliases are rejected.',
    },
    'everyday-password-generator': {
        intro: 'Generate a random password using your browser’s cryptographic random source. Characters are sampled without modulo bias.',
        steps: [
            'Choose a length from 8 to 128 characters.',
            'Choose Generate password.',
            'Copy the password into a password manager.',
        ],
        limits: 'Passwords are generated locally and are not saved. This is a generator, not a password manager; keep your saved copy secure.',
    },
    'everyday-random-generator': {
        intro: 'Pick a cryptographically random integer within an inclusive range for drawings, testing, or sample data.',
        steps: [
            'Enter the minimum and maximum.',
            'Choose Generate number.',
            'Copy the selected integer.',
        ],
        limits: 'Both bounds must be safe JavaScript integers. The range includes both endpoints and is sampled without modulo bias.',
    },
    'everyday-file-checksums': {
        intro: 'Calculate a SHA checksum for a local file without uploading its contents.',
        steps: [
            'Choose a file and SHA algorithm.',
            'Choose Calculate checksum.',
            'Compare or copy the hexadecimal digest.',
        ],
        limits: 'Files up to 25 MiB are supported. A checksum detects differences; it does not prove who created a file or whether the file is safe.',
    },
};
const timestamp: Guide = {
    intro: 'Convert Unix timestamps or ISO dates into UTC, ISO 8601, Unix seconds, and Unix milliseconds.',
    steps: [
        'Choose seconds, milliseconds, or ISO date input.',
        'Paste a timestamp or ISO date.',
        'Convert and copy the result.',
    ],
    limits: 'Dates without a time use UTC midnight. Date-time inputs require an explicit timezone. Conversion is local and preserves millisecond precision.',
};
const mock: Guide = {
    intro: 'Create an expiring API endpoint with custom routes, status codes, response bodies, and delays. Test your client without waiting for an upstream service.',
    steps: [
        'Set an API name and configure your routes.',
        'Create the endpoint and copy its base URL.',
        'Append a route path and send requests from your application.',
    ],
    limits: 'Mock APIs start with a one-hour lifetime; renewal stays within plan limits. Configure up to 20 routes within 80 KiB, delays up to 2 seconds, and 120 requests per minute. Anonymous management requires the private management token; account-owned APIs use workspace access.',
};
export function toolGuide(tool: CatalogTool): Guide {
    const extra = (
        {
            ...extraOperations,
            ...networkOperations,
            ...mediaOperations,
            ...resourceOperations,
        } as Partial<Record<string, ExtraDefinition>>
    )[tool.id];
    if (extra) return { intro: extra.intro, steps: [...extra.steps], limits: extra.limits };
    if (tool.id === 'agents-mock-mcp-server')
        return {
            intro: 'Give an agent a predictable MCP server for integration testing. Configure tool names, primitive argument schemas, static responses, and simulated failures.',
            steps: [
                'Name your server and edit the example tool definitions.',
                'Create the server and copy its Streamable HTTP endpoint.',
                'Connect an MCP client, list tools, and send test calls.',
            ],
            limits: 'Servers start with a one-hour lifetime; renewal stays within plan limits. Up to 10 tools, 80 KiB total configuration, and 120 requests per minute are supported. No custom code or outbound requests are executed. Choose public or private access. Private clients need an access token; management uses a separate credential. Account-owned resources require workspace access to manage.',
        };
    if (tool.id === 'email-temporary-email-inbox')
        return {
            intro: 'Get a real, receive-only email address in one second. Use it to sign up to the app you are testing, then read the message here or let your AI agent wait for it. One-time codes and verification links are extracted automatically.',
            steps: [
                'Open the page: an address is created for you.',
                'Use the address to sign up, reset a password or receive any test email.',
                'Copy the extracted code or open the verification link, or call wait_for_email from your agent.',
            ],
            limits: 'Addresses last one hour without an account, up to 7 days on Free, 30 on Pro and 90 on Team. Each inbox keeps up to 100 messages; text and HTML are stored up to 64 KiB each and attachments are listed but not stored. Receive-only: nothing can be sent from these addresses. Reading messages always needs the private token or your workspace.',
        };
    if (tool.id === 'agents-socket-help-mcp')
        return {
            intro: 'Use socket.help from an MCP-compatible agent to run utility tools and create, inspect, renew, and delete temporary webhook inboxes, mock APIs, and file shares.',
            steps: [
                'Copy the MCP endpoint into a Streamable HTTP client.',
                'Initialize the connection and discover tools with tools/list.',
                'Keep returned anonymous credentials, or use your account’s scoped API key, to inspect and clean up resources.',
            ],
            limits: 'No account is required. Resource expiry, storage quotas, and creation limits match the HTTP API. MCP file uploads are limited to 64 KiB. Use HTTPS for public deployments and review destructive calls in your agent client.',
        };
    if (guides[tool.id]) return guides[tool.id]!;
    if (tool.id.includes('timestamp-converter')) return timestamp;
    if (
        [
            'files-temporary-file-transfer',
            'files-one-time-download-links',
            'files-private-file-sharing',
        ].includes(tool.id)
    )
        return {
            intro:
                tool.id === 'files-one-time-download-links'
                    ? 'Share a file through a link that accepts one download request. Choose private access to require a sharing token, or public access for a link without a credential.'
                    : 'Share a file between machines through a short-lived public or private download link. No account or storage setup is required.',
            steps: [
                'Choose a file up to 10 MiB.',
                'Upload it and copy the download link.',
                'Share the link and, for private files, send the access token separately.',
            ],
            limits: 'Files start with a one-hour lifetime and a chosen download limit. The final allowed download removes stored contents; metadata remains until expiry or deletion. Choose public or private sharing. Private downloads require a sharing token or workspace access. The management token controls sharing and deletion. Files are not scanned for malware and always download as attachments. Keep confidential files elsewhere.',
        };
    const mockIntros: Record<string, string> = {
        'network-response-builder':
            'Build a temporary HTTP response with a chosen method, path, status, content type, and body. Check that your client reads successful responses and displays errors correctly.',
        'network-http-status-simulator':
            'Return a chosen HTTP status from a temporary endpoint. Exercise success, validation, authorization, and server-error handling with predictable fixtures.',
        'network-delay-timeout-simulator':
            'Add a deliberate response delay to a temporary mock route. Check loading states and client timeouts without waiting for an unpredictable upstream service.',
    };
    if (mockIntros[tool.id]) return { ...mock, intro: mockIntros[tool.id]! };
    if (tool.status === 'available' && !tool.local) return mock;
    return {
        intro: tool.description,
        steps: [],
        limits: 'This tool is on the roadmap and is not available yet. No input is accepted and no resource is created from this page.',
    };
}

const examples: Record<string, { useCase: string; example: string }> = {
    'domains-temporary-callback-url': {
        useCase:
            'Create a temporary HTTP callback address and inspect incoming test requests without deploying a receiver.',
        example:
            'POST /api/inboxes\nSend a callback to the returned webhookUrl.\nInspect captured requests with the inspection credential.',
    },
    'developer-code-paste-sharing': {
        useCase:
            'Share a source snippet as an expiring text resource without executing its contents.',
        example:
            'Use the shared file upload API or SDK upload method.\nDownload the exact original bytes with the returned access credential.\nDelete or renew through the resource lifecycle API.',
    },
    'everyday-temporary-notes': {
        useCase:
            'Create a short-lived note that can be read through a safe text preview or downloaded unchanged.',
        example:
            'Use the shared file upload API or SDK upload method.\nDownload the exact original bytes with the returned access credential.\nDelete or renew through the resource lifecycle API.',
    },
    'files-text-code-sharing': {
        useCase:
            'Share an expiring text note or code snippet with explicit public or private access.',
        example:
            'Use the shared file upload API or SDK upload method.\nDownload the exact original bytes with the returned access credential.\nDelete or renew through the resource lifecycle API.',
    },
    'files-temporary-binary-storage': {
        useCase:
            'Store nonempty binary data in an expiring resource and retrieve the original bytes through HTTP or the shared clients.',
        example:
            'Use the shared file upload API or SDK upload method.\nDownload the exact original bytes with the returned access credential.\nDelete or renew through the resource lifecycle API.',
    },
    'files-temporary-json-storage': {
        useCase:
            'Store a small JSON document as an expiring private or public resource, with exact-byte downloads and a safe JSON preview.',
        example:
            'Use the shared file upload API or SDK upload method.\nDownload the exact original bytes with the returned access credential.\nDelete or renew through the resource lifecycle API.',
    },
    'developer-credit-card-generator': {
        useCase:
            'Check card-entry layouts, American Express CVC length, or saved-payment summaries using a labeled credit fixture.',
        example:
            'Funding: credit\nBrand: Visa\nNumber: 4242 4242 4242 4242\nPaymentMethod: pm_card_visa\nEnvironment: Stripe sandbox only',
    },
    'developer-debit-card-generator': {
        useCase:
            'Exercise a debit-specific display or application branch with a provider-labeled fixture.',
        example:
            'Funding: debit\nBrand: Visa\nNumber: 4000 0566 5566 5556\nPaymentMethod: pm_card_visa_debit\nEnvironment: Stripe sandbox only',
    },
    'developer-prepaid-card-generator': {
        useCase:
            'Test a prepaid funding label without inventing an issuer, account, or stored balance.',
        example:
            'Funding: prepaid\nBrand: Mastercard\nNumber: 5105 1051 0510 5100\nPaymentMethod: pm_card_mastercard_prepaid\nEnvironment: Stripe sandbox only',
    },
    'developer-card-number-validator': {
        useCase: 'Catch a mistyped test number before a sandbox form is submitted.',
        example:
            'Input: 4242 4242 4242 4242\nchecksumValid: true\nrecognizedTestCard: Visa credit sandbox fixture\n\nA passing checksum is not payment authorization.',
    },
    webhooks: {
        useCase:
            'Inspect a sandbox payment callback or check what a form sends before building a receiver.',
        example:
            'POST your inbox endpoint\nContent-Type: application/json\n\n{"event":"order.created","id":"test-001"}',
    },
    json: {
        useCase:
            'Read an API response, validate a configuration file, or minify a JSON request body.',
        example: 'Input:  {"ready":true,"count":2}\nOutput:\n{\n  "ready": true,\n  "count": 2\n}',
    },
    base64: {
        useCase: 'Read a text field encoded in a payload or prepare a small encoded test fixture.',
        example: 'UTF-8 text: Hello\nBase64:     SGVsbG8=',
    },
    url: {
        useCase: 'Prepare one query value containing spaces, ampersands, or other URL separators.',
        example: 'Value:   a&b=c d\nEncoded: a%26b%3Dc%20d',
    },
    uuid: {
        useCase: 'Create independent IDs for request traces, fixtures, or sample database records.',
        example: 'Example UUID v4 format:\n550e8400-e29b-41d4-a716-446655440000',
    },
    hash: {
        useCase:
            'Check whether two text values have the same bytes or create an expected digest for a test.',
        example:
            'UTF-8 input: hello\nSHA-256:\n2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    },
    'developer-yaml-formatter': {
        useCase:
            'Check YAML configuration before a deployment or tidy a copied configuration snippet.',
        example: 'Input:  {name: demo, enabled: true}\nOutput:\nname: demo\nenabled: true',
    },
    'developer-jwt-inspector': {
        useCase:
            'Inspect issuer, subject, and expiry claims while debugging a test authentication flow.',
        example:
            'JWT structure:\nbase64url(header).base64url(claims).signature\n\nDecoded claims are untrusted until verified.',
    },
    'developer-url-parser': {
        useCase:
            'Check a callback address or separate repeated query values without making a network request.',
        example:
            'URL: https://example.com/orders?tag=a&tag=b#details\nHost: example.com\nPath: /orders\nQuery entries: tag=a, tag=b\nFragment: #details',
    },
    'developer-hmac-generator': {
        useCase: 'Produce a test signature for a webhook message with an explicit secret key.',
        example:
            'Message: {"event":"test"}\nKey: your-test-secret\nAlgorithm: SHA-256\nResult: hexadecimal HMAC',
    },
    'everyday-case-converter': {
        useCase: 'Convert labels into consistent identifiers for a configuration or dataset.',
        example:
            'Text:     Order status\nsnake_case: order_status\nkebab-case: order-status\ncamelCase:  orderStatus',
    },
    'everyday-text-cleaner': {
        useCase:
            'Tidy text copied from a document or webpage while keeping meaningful line breaks.',
        example: 'Before: "  hello    world  "\nAfter:  "hello world"',
    },
    'everyday-csv-to-json': {
        useCase: 'Turn spreadsheet exports into string-preserving API fixtures.',
        example: 'CSV:\ncode,name\n001,Demo\n\nJSON:\n[{"code":"001","name":"Demo"}]',
    },
    'everyday-json-to-csv': {
        useCase: 'Turn a small array of API records into rows for a spreadsheet.',
        example: 'JSON: [{"name":"Demo","count":2}]\n\nCSV:\nname,count\nDemo,2',
    },
    'everyday-data-format-converter': {
        useCase: 'Move sample data between a JSON payload and YAML configuration.',
        example: 'JSON: {"enabled":true,"retries":3}\n\nYAML:\nenabled: true\nretries: 3',
    },
    'everyday-password-generator': {
        useCase: 'Generate a new random password and save it directly into a password manager.',
        example:
            'Choose 8 to 128 characters.\nGenerate a fresh value for each account.\nSave it before closing the page.',
    },
    'everyday-random-generator': {
        useCase: 'Pick an unbiased integer for test cases or a small random selection.',
        example: 'Minimum: 1\nMaximum: 6\nPossible results: 1, 2, 3, 4, 5, 6',
    },
    'everyday-file-checksums': {
        useCase: 'Compare a local file with an expected checksum without uploading its contents.',
        example:
            'Choose a file → SHA-256 → Calculate checksum\n\nCompare the entire hexadecimal digest with a trusted reference.',
    },
    'everyday-timestamp-converter': {
        useCase: 'Translate a numeric timestamp from a log into a UTC date you can read.',
        example: 'Unix seconds: 0\nUnix milliseconds: 0\nISO 8601: 1970-01-01T00:00:00.000Z',
    },
    'developer-unix-timestamp-converter': {
        useCase: 'Check whether an API timestamp is expressed in seconds or milliseconds.',
        example: 'Unix seconds: 0\nUnix milliseconds: 0\nISO 8601: 1970-01-01T00:00:00.000Z',
    },
    'mock-apis-mock-rest-api': {
        useCase:
            'Build a frontend against a predictable test response while its upstream API is unavailable.',
        example:
            'Route: GET /orders\nStatus: 200\nBody: [{"id":"test-001","status":"created"}]\nDelay: 0 ms',
    },
    'network-response-builder': {
        useCase:
            'Check how a client handles an explicit response body, content type, and HTTP status.',
        example:
            'Route: POST /validate\nStatus: 422\nContent-Type: application/json\nBody: {"error":"Missing email"}',
    },
    'network-http-status-simulator': {
        useCase:
            'Verify that error messages and retry controls appear for unsuccessful API responses.',
        example: 'Route: GET /unavailable\nStatus: 503\nBody: {"error":"Try again later"}',
    },
    'network-delay-timeout-simulator': {
        useCase:
            'Make loading states visible and test a client timeout shorter than the configured delay.',
        example: 'Route: GET /slow\nStatus: 200\nDelay: 1500 ms\nBody: {"ready":true}',
    },
    'agents-mock-mcp-server': {
        useCase:
            'Test tool discovery and predictable success or failure responses in an MCP client.',
        example:
            'Create a tool named get_order.\nDefine a primitive string argument: id.\nReturn a static sample order.\nConnect your client and call tools/list.',
    },
    'email-temporary-email-inbox': {
        useCase:
            'Test a sign-up or password-reset flow end to end, by hand or with an AI agent, without a real mailbox.',
        example:
            'Address: k5zfrjb4ird2tgvpaox42dnr3e@socketspace.xyz\nSubject: Confirm your email\nCode: 700412\nVerification link: https://app.example/verify?token=…',
    },
    'agents-socket-help-mcp': {
        useCase:
            'Let an agent run a formatter, inspect webhook history, or clean up temporary test resources.',
        example:
            'Endpoint: /mcp\nTransport: Streamable HTTP\n\nInitialize → tools/list → tools/call\nUtility discovery: list_tools\nUtility execution: run_tool',
    },
    'files-temporary-file-transfer': {
        useCase:
            'Move a small test file between machines without setting up permanent object storage.',
        example:
            'Upload a file up to 10 MiB.\nCopy the ID-only sharing link.\nSend the private access token separately.\nDelete the share after the transfer.',
    },
    'files-one-time-download-links': {
        useCase:
            'Share a disposable fixture with one recipient and remove stored contents after the first download.',
        example:
            'Download limit: 1\nAccess: private by default\n\nA preview consumes the download.\nAn already downloaded copy cannot be revoked.',
    },
    'files-private-file-sharing': {
        useCase: 'Require a separate credential when a temporary file link might be forwarded.',
        example:
            'Link: /share/?id=FILE_ID\nToken: sent separately\n\nScript access: X-Access-Token header\nNever put a token in the URL.',
    },
};

export function toolExample(id: string) {
    const extra = (
        {
            ...extraOperations,
            ...networkOperations,
            ...mediaOperations,
            ...resourceOperations,
        } as Partial<Record<string, ExtraDefinition>>
    )[id];
    return extra ? { useCase: extra.useCase, example: extra.example } : examples[id];
}

export function toolArticle(id: string) {
    const paths: Record<string, string> = {
        'network-http-echo': 'debug-http-clients-with-an-echo-endpoint',
        'mock-apis-stateful-crud-api': 'stateful-crud-mocks-for-frontend-testing',
        'mock-apis-api-test-scenarios': 'reusable-api-test-scenarios',
        'test-media-placeholder-images': 'generate-images-and-avatars-for-real-layouts',
        'test-media-sample-avatars': 'generate-images-and-avatars-for-real-layouts',
        'test-media-audio-composer': 'compose-custom-audio-without-samples',
        'test-media-sample-audio': 'compose-custom-audio-without-samples',
        'test-media-music-library': 'free-music-streaming-cc0-explained',
        'developer-credit-card-generator': 'credit-card-generator-for-testing',
        'developer-debit-card-generator': 'debit-card-generator-for-checkout-tests',
        'developer-prepaid-card-generator': 'prepaid-card-test-fixtures',
        'developer-card-number-validator': 'card-number-validation-luhn',
    };
    return paths[id] ? `/blog/${paths[id]}/` : undefined;
}
