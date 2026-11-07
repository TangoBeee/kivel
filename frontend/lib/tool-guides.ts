import { monitorToolIds, memoryToolIds, scheduledToolIds } from './catalog';
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
    'agents-agent-authenticator': {
        intro: 'Store a TOTP authenticator for an account your human asked your agent to create or operate. Import the service setup URI, Base32 key or QR image, then request a code when the service asks for it.',
        steps: [
            'Sign in to your workspace and give the authenticator a recognizable name.',
            'Import one setup URI, Base32 secret or PNG/JPEG QR image from the service.',
            'Ask for a code at sign-in. Keep the human’s service recovery codes separate. Rename or delete authenticators in the account dashboard.',
        ],
        limits: 'Free allows 2 authenticators, Pro 25 and Team 100. SHA1, SHA256 and SHA512; 6–8 digits; 30 or 60 seconds. QR images are limited to 1 MiB and one million pixels. Secrets are encrypted and never returned, including after creation. Codes are limited to 30 requests per workspace per minute and every generation is logged. If fewer than five seconds remain, the API includes the next code. Authenticators stay until deleted; downgrading does not destroy your account access. Delete unused authenticators before adding beyond your current plan limit. This stores authenticator keys, not passwords or service recovery codes.',
    },
    'mock-apis-mock-oauth-provider': {
        intro: 'Test OAuth 2.0 and OpenID Connect sign in without registering a real identity account. Each workspace provider has its own issuer, discovery document, RS256 signing key and synthetic users.',
        steps: [
            'Choose generic, Google-style, GitHub-style, Okta-style or Auth0-style claims, then register exact callback URLs and synthetic users. These presets never impersonate a real identity service.',
            'Create the provider and save its client secret. Configure your client with the discovery URL and S256 PKCE.',
            'Approve or deny on the hosted test page. Headless prompt=none with login_hint redirects immediately only to loopback callbacks; public destinations require Continue.',
            'Switch failure scenarios, inspect requests and delete the provider when testing is complete.',
        ],
        limits: 'Free allows 1 active provider, Pro 10 and Team 50. Mock retention and workspace storage limits apply. Codes last 60 seconds, access and ID tokens 5 minutes, refresh tokens 1 hour. Refresh tokens rotate on use. Each provider accepts 120 requests per minute and keeps its last 100 calls with sensitive parameters redacted. Use synthetic data only. This is a test service, never a source of real account identity.',
    },
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
        intro: 'Generate unique fake credit card details for forms and fixtures, with seven brands, Luhn-valid numbers, diverse names, future expiry and correctly sized CVVs. Payment sandbox mode offers documented provider numbers instead.',
        steps: [
            'Choose generated data or payment sandbox numbers, then a brand.',
            'Generate one to 50 unique records, with optional sample billing addresses.',
            'Copy individual fields or export all cards as JSON or CSV.',
        ],
        limits: 'Fake test data, not usable payment cards. Funding labels and addresses in generated mode are synthetic. Expiry years are one to five calendar years ahead. Sandbox mode identifies Stripe, Adyen, Braintree or PayPal and is limited to the distinct documented numbers in your selection; follow that provider’s expiry and CVV requirements. Browser generation stays local; hosted calls use normal quotas.',
    },
    'developer-debit-card-generator': {
        intro: 'Generate unique fake debit card details for forms and fixtures, with seven brands, Luhn-valid numbers, diverse names, future expiry and correctly sized CVVs. Payment sandbox mode offers documented provider numbers instead.',
        steps: [
            'Choose generated data or payment sandbox numbers, then a brand.',
            'Generate one to 50 unique records, with optional sample billing addresses.',
            'Copy individual fields or export all cards as JSON or CSV.',
        ],
        limits: 'Fake test data, not usable payment cards. Funding labels and addresses in generated mode are synthetic. Expiry years are one to five calendar years ahead. Sandbox mode identifies Stripe, Adyen, Braintree or PayPal and is limited to the distinct documented numbers in your selection; follow that provider’s expiry and CVV requirements. Browser generation stays local; hosted calls use normal quotas.',
    },
    'developer-prepaid-card-generator': {
        intro: 'Generate unique fake prepaid card details for forms and fixtures, with seven brands, Luhn-valid numbers, diverse names, future expiry and correctly sized CVVs. Payment sandbox mode offers documented provider numbers instead.',
        steps: [
            'Choose generated data or payment sandbox numbers, then a brand.',
            'Generate one to 50 unique records, with optional sample billing addresses.',
            'Copy individual fields or export all cards as JSON or CSV.',
        ],
        limits: 'Fake test data, not usable payment cards. Funding labels and addresses in generated mode are synthetic. Expiry years are one to five calendar years ahead. Sandbox mode identifies Stripe, Adyen, Braintree or PayPal and is limited to the distinct documented numbers in your selection; follow that provider’s expiry and CVV requirements. Browser generation stays local; hosted calls use normal quotas.',
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
        intro: 'Capture callbacks from GitHub, Shopify, Slack, Twilio, Stripe or any application. Inspect JSON, form fields, multipart file metadata, XML, text and binary payloads, including nested paths and exact query strings.',
        steps: [
            'Create an inbox and copy its endpoint.',
            'Send a request from your application or terminal.',
            'Select a request to inspect its parsed body or original bytes. Use Signature to verify a provider signature locally; your secret is never sent or saved. Open Response to set status, headers, body and delay.',
        ],
        limits: 'Anonymous inboxes last one hour and hold up to 100 requests. Accounts receive the limits shown on the plans page. Each body is limited to 100 KiB. Choose public or private receiver access. Private senders use the X-Access-Token header; inspection uses a separate credential. Sensitive headers are redacted. Signature presets cover Stripe, GitHub, Shopify, Slack, Twilio, Svix, Paddle, Dodo Payments, Linear and custom HMAC. Timestamp checks use receipt time. Custom HMAC signs raw bytes and optionally checks a Unix-seconds header. CONNECT tunneling is not supported; ordinary and extended HTTP methods are captured.',
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
    if (
        [
            'agents-mock-llm-endpoint',
            'agents-mock-agents-llms',
            'agents-llm-streaming-simulator',
        ].includes(tool.id)
    )
        return {
            intro: 'Create a scripted text-only stand-in using OpenAI Chat Completions or Anthropic Messages HTTP shapes. Preview ordinary JSON, paced SSE or a stream that ends before completion. Responses come from your configuration; token usage is estimated.',
            steps: [
                'Select the provider format and model label, then write the response text.',
                'Create a private or public endpoint and test its response in the preview.',
                'Point your SDK at the displayed base URL, send credentials in headers, and inspect calls.',
            ],
            limits: 'Up to 8,192 characters, 128 text chunks, five seconds per stream and 16 concurrent streams. Does not execute models, tools, images, audio or reasoning. A mock resource starts with a one-hour lifetime and follows normal account quotas and lifecycle rules. Private credentials are separate from URLs. Use synthetic prompts because calls are captured for inspection.',
        };
    if (tool.id === 'monitoring-public-status-page')
        return {
            intro: 'Publish the current state of selected workspace monitors in a minimal status page. Show service names, status changes and recent check counts without exposing target URLs, alert destinations or private errors.',
            steps: [
                'Create monitors in your workspace and select up to twenty.',
                'Name the page and explicitly choose public access if other people should see it.',
                'Share its ID-only URL, or keep it private to workspace access; manage expiry, sharing and deletion from your resources.',
            ],
            limits: 'An account is required. Free pages can last up to seven days; paid pages can use a persistent lease. Pages follow normal resource quotas. Check samples are the latest fifty probes, not a time-weighted uptime guarantee. The page must be refreshed for new results and is excluded from search indexing.',
        };
    if (scheduledToolIds.includes(tool.id))
        return {
            intro: 'Send a JSON webhook after a delay or on a bounded repeating interval. Scheduled jobs belong to your workspace, survive restarts and retain recent delivery results.',
            steps: [
                'Sign in and choose a public callback URL without URL credentials.',
                'Enter a JSON payload, delay and optional repeating interval with a run count.',
                'Review delivery attempts or wait for job events from your agent. Delete the job when finished.',
            ],
            limits: 'Payloads are at most 16 KiB. Start 5 seconds to 7 days ahead, repeat every 5 minutes or slower, and run at most 100 times within the resource lifetime. Two retries follow network errors, HTTP 429 or 5xx. Redirects are not followed. Timing is best effort. Delivery is at least once: deduplicate X-Socket-Delivery-Id at the receiver. Destination URL and DNS checks are repeated before every delivery. Jobs never run shell commands or arbitrary code.',
        };
    if (tool.id === 'email-mock-smtp')
        return {
            intro: 'Point your application at a private SMTP capture instead of sending test messages to real users. Each capture has its own credentials and shares the inbox message reader, code extraction and event waits.',
            steps: [
                'Create a workspace capture and save the SMTP host, port, username and password separately.',
                'Configure your mail client to use TLS and SMTP authentication, then send a test email.',
                'Inspect the captured subject, text and codes. Download expected attachments as untrusted files. Delete the capture to revoke credentials.',
            ],
            limits: 'The operator must enable the TLS SMTP listener first. Captures last one day in the browser and accept at most 100 messages of 128 KiB each. Attachment content counts against workspace storage and is removed with messages or the capture. Downloads use private links valid for two minutes. Password rotation revokes old SMTP credentials; API access still requires the workspace key. The server never forwards SMTP recipients or delivers mail externally. No real receiving-domain configuration is needed for SMTP capture.',
        };
    if (monitorToolIds.includes(tool.id))
        return {
            intro: `${tool.description} Create and manage workspace HTTP, certificate, DNS and heartbeat monitors with owner email or webhook alerts.`,
            steps: [
                'Sign in and create a monitor for your public endpoint or domain.',
                'Choose a check interval and optional alert webhook; verify the owner email for email alerts.',
                'Review current status and recent check times. For DNS, review changed records before accepting a new baseline.',
            ],
            limits: 'Free permits twenty monitors at intervals of five minutes or slower; Pro one hundred and Team five hundred, every minute or slower. Active failures are confirmed before alerting. The latest fifty check timings and fifty status changes are retained. DNS uses a public resolver and ignores TTL changes; it does not identify the domain hosting provider. Changes remain flagged until the workspace accepts new records. Targets and alert destinations are private to the workspace.',
        };
    if (memoryToolIds.includes(tool.id))
        return {
            intro: 'Store structured JSON state in a workspace namespace and reopen it from a browser, agent or script. Optional expiry makes keys useful for short-lived state, while keys without expiry stay until deletion.',
            steps: [
                'Sign in and choose a project namespace and key.',
                'Save a JSON value with optional expiry, or select an existing key to read it.',
                'Use the same namespace and key from SDK, CLI or MCP; delete state when it is no longer needed.',
            ],
            limits: 'Free includes five MiB, Pro one hundred MiB and Team one GiB of workspace memory. The service caps each value at 256 KiB; the HTTPS gateway caps whole JSON requests at 100 KiB, so browser edits stay within 90 KiB. Expiry ranges from one second to one year. All workspace credentials with the relevant scope can access its namespaces; namespaces organize data and do not create a separate security boundary.',
        };
    if (tool.id === 'network-request-forwarding')
        return {
            intro: 'Capture a webhook in your workspace and relay it to a public HTTP endpoint. Pro and Team only.',
            steps: [
                'Create a webhook inbox while signed in.',
                'Configure its forwarding URL through the inbox API or CLI.',
                'Inspect delivery attempts and captured payloads.',
            ],
            limits: 'Requires an active Pro or Team subscription and an owned inbox. Targets must be public HTTP(S), with redirects and private networks blocked. Forwarding pauses immediately when the subscription lapses. Binary bodies are not forwarded; see the webhook forwarding API for retry limits.',
        };
    if (['email-temporary-email-inbox', 'email-email-webhook-forwarding'].includes(tool.id))
        return {
            intro: 'Create an owned address for your agent on socketspace.xyz. Use it to sign up to the app you are testing, then read the message here or let your AI agent wait for it. One-time codes and verification links are extracted automatically.',
            steps: [
                'Sign in and choose a 1–7 day lifetime on Free, or an optional custom name on Pro or Team.',
                'Use the address to sign up, reset a password or receive any test email.',
                'Copy the extracted code or open the verification link, or call wait_for_email from your agent.',
                'Use Drafts to request human review. Owners and admins can require approval for every send in Inbox rules.',
            ],
            limits: 'An account is required. Free includes one random address for 1–7 days, default 3. Pro includes 10 and Team 50 addresses that remain active while subscribed. Upgrade before Free expiry to keep the same address. Lapsed paid inboxes pause immediately and are deleted after 30 days; explicit downgrades keep the newest inbox for 7 days. Retired addresses are never reused. Each inbox keeps up to 100 messages; text and HTML are stored up to 64 KiB each and owned inboxes store attachment contents, with a 5 MiB message limit and 25 MiB of attachments per inbox. Download links expire after two minutes. Attachment bytes count against workspace storage and are removed with messages or inbox expiry; files are always untrusted downloads. Outbound email is available only when the operator enables a separate mail relay, with verified Free ownership and per-plan sending caps. Address rules match exactly and case-insensitively, with no subdomain or plus-address folding. Inbound blocklists check both header From and envelope sender. An inbound allowlist requires the envelope sender to match, and the header From must also match when present. Redeploy the email worker to include envelope senders before enabling an inbound allowlist. Draft approvals last up to 24 hours, capped at the scheduled send time or draft expiry when sooner. Owners and admins can request a new review for expired or rejected drafts. Workspace access is required for new inboxes. Forwarding to a public webhook requires Pro or Team, stops when the paid plan lapses, and makes one best-effort delivery attempt per received message.',
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
            'Funding: credit\nBrand: Visa\nNumber: 4242 4242 4242 4242\nPaymentMethod: pm_card_visa\nMode: Payment sandbox numbers\nProvider: Stripe',
    },
    'developer-debit-card-generator': {
        useCase:
            'Exercise a debit-specific display with unique synthetic records or a documented sandbox fixture.',
        example:
            'Funding: debit\nBrand: Visa\nNumber: 4000 0566 5566 5556\nPaymentMethod: pm_card_visa_debit\nMode: Payment sandbox numbers\nProvider: Stripe',
    },
    'developer-prepaid-card-generator': {
        useCase:
            'Test a prepaid funding label without inventing an issuer, account, or stored balance.',
        example:
            'Funding: prepaid\nBrand: Mastercard\nNumber: 5105 1051 0510 5100\nPaymentMethod: pm_card_mastercard_prepaid\nMode: Payment sandbox numbers\nProvider: Stripe',
    },
    'developer-card-number-validator': {
        useCase: 'Catch a mistyped test number before a sandbox form is submitted.',
        example:
            'Input: 4242 4242 4242 4242\nchecksumValid: true\nrecognizedTestCard: Visa credit sandbox fixture\n\nA passing checksum is not payment authorization.',
    },
    webhooks: {
        useCase:
            'Inspect callbacks from GitHub, Shopify, Slack, Twilio, Stripe or your own app, including form submissions and file uploads.',
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
    ...Object.fromEntries(
        [
            'agents-mock-llm-endpoint',
            'agents-mock-agents-llms',
            'agents-llm-streaming-simulator',
        ].map((id) => [
            id,
            {
                useCase:
                    'Test model-client parsing, loading states and incomplete streams using a configured assistant response.',
                example:
                    'POST /api/mocks\n{"name":"Scripted assistant","routes":[],"llm":{"provider":"openai","model":"socket-mock","text":"The test passed.","intervalMs":20}}\n\nPOST /mock/{id}/v1/chat/completions\n{"model":"socket-mock","messages":[{"role":"user","content":"Hello"}],"stream":true}',
            },
        ]),
    ),
    ...Object.fromEntries(
        scheduledToolIds.map((id) => [
            id,
            {
                useCase:
                    'Deliver a callback after a delay, then inspect the attempt without keeping a script running.',
                example:
                    'POST /api/scheduled-jobs?ttlSeconds=3600\n{ "name": "Ready event", "url": "https://example.com/hook", "body": { "event": "test.ready" }, "delaySeconds": 60 }\n\nGET /api/scheduled-jobs/{id} → schedule and delivery events\nReceiver: deduplicate X-Socket-Delivery-Id.',
            },
        ]),
    ),
    'email-mock-smtp': {
        useCase: 'Check a signup email without delivering it to a real user.',
        example:
            'POST /api/smtp-inboxes?ttlSeconds=86400\n\nConfigure your SMTP client with the returned host, TLS port, username and password.\nSend a test message, then GET /api/email-inboxes/{id}/messages with your workspace key.\nThe original recipient never receives the capture.',
    },
    ...Object.fromEntries(
        monitorToolIds.map((id) => [
            id,
            {
                useCase:
                    'Track your own endpoint, certificate, DNS records or scheduled job and inspect actual check results.',
                example: id.includes('dns-monitor')
                    ? 'POST /api/monitors\n{ "kind": "dns", "name": "API DNS", "target": "api.example.com", "dnsRecordType": "A", "intervalSeconds": 300 }\n\nGET /api/monitors/{id} → dnsBaseline, lastDnsAnswers and recentChecks\nPOST /api/monitors/{id}/accept-dns → accept the reviewed records'
                    : 'POST /api/monitors\n{ "kind": "http", "name": "My API", "target": "https://api.example.com/health", "intervalSeconds": 300 }\n\nGET /api/monitors/{id} → status, lastDurationMs and recentChecks',
            },
        ]),
    ),
    ...Object.fromEntries(
        memoryToolIds.map((id) => [
            id,
            {
                useCase:
                    'Resume an agent task from a saved JSON state without passing it through chat.',
                example:
                    'PUT /api/memory/project/build/latest\n{ "value": { "ready": true, "step": "build" }, "ttlSeconds": 86400 }\n\nGET /api/memory/project/build/latest → stored JSON and expiry',
            },
        ]),
    ),
    'monitoring-public-status-page': {
        useCase:
            'Share the health of selected services while keeping probe URLs and alert configuration private.',
        example:
            'POST /api/status-pages?visibility=public\n{ "name": "Application status", "monitorIds": ["<owned-monitor-uuid>"] }\n\nShare the returned /status/{id} page URL.',
    },
    'email-email-webhook-forwarding': {
        useCase: 'Let your own application react when an owned agent inbox receives a message.',
        example:
            'PUT /api/email-inboxes/{id}/forwarding\n{ "url": "https://your-app.example/hooks/email" }\n\nYour endpoint receives email.received with the structured message; inspect inbox metadata for the latest delivery result.',
    },
    'network-request-forwarding': {
        useCase:
            'Inspect a webhook while your own public development endpoint receives the same request. Pro and Team only.',
        example:
            'Create an owned webhook inbox, then:\nPUT /api/inboxes/{id}/forward\n{"url":"https://your-app.example/hook"}\n\nInspect /api/inboxes/{id}/deliveries for attempts and status.',
    },
    'email-temporary-email-inbox': {
        useCase:
            'Test a signup, verification or reply flow with an owned address. Read the conversation as a thread, save a draft for approval, or set rules for who can send and receive mail.',
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
    if (id === 'agents-agent-authenticator')
        return {
            useCase: 'Complete a sign-in for an account your human asked your agent to operate.',
            example:
                'POST /api/authenticators with a name and otpauth URI → GET /api/authenticators/{id}/code → code and secondsRemaining',
        };
    if (id === 'mock-apis-mock-oauth-provider')
        return {
            useCase:
                'Test your sign in callback, PKCE validation and expired token handling without an external identity account.',
            example:
                'POST /api/oauth-providers\n{"name":"Test app","redirectUris":["http://localhost:3000/auth/callback"],"users":[{"sub":"test-user","email":"alex@example.test","name":"Alex"}]}\n\nGET {issuer}/.well-known/openid-configuration',
        };
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
