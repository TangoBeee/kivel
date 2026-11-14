import { paymentTestingDoc } from './payment-testing-content';
import { catalog, categories } from './catalog';
import { websocketDoc } from './websocket-content';
import { oauthDoc } from './oauth-content';
import { agentDoc } from './agent-doc';
import { echoDoc } from './echo-content';
import { crudDoc } from './crud-content';
import { scenarioDoc } from './scenario-content';
// Documentation pages, rendered at /docs/<slug>/. Content must match the current backend behaviour.
export interface DocSection {
    id: string;
    title: string;
    paragraphs: string[];
    /** Bullet list shown after the paragraphs. */
    list?: string[];
    code?: { title: string; value: string };
    table?: { caption: string; headers: string[]; rows: string[][] };
    /** One short callout (a warning or tip) shown after the section body. */
    note?: string;
}
export interface DocPage {
    slug: string;
    /** Page heading and <title>. */
    title: string;
    /** Short label for the docs sidebar. */
    navTitle: string;
    group: 'Get started' | 'Resources' | 'Interfaces' | 'Reference';
    /** 140 to 160 characters, used as the meta description and intro. */
    description: string;
    updatedAt: string;
    sections: DocSection[];
    faqs?: { question: string; answer: string }[];
    related?: { title: string; href: string }[];
}
export const docGroups = ['Get started', 'Resources', 'Interfaces', 'Reference'] as const;

const updatedAt = '2026-10-27';

export const docPages: DocPage[] = [
    paymentTestingDoc,
    oauthDoc,
    websocketDoc,
    agentDoc,
    echoDoc,
    crudDoc,
    scenarioDoc,
    {
        slug: 'quickstart',
        title: 'Quickstart: your first Kivel API request',
        navTitle: 'Quickstart',
        group: 'Get started',
        description:
            'Make your first Kivel API call with curl and no account: format JSON, create a webhook inbox, send a test callback, then add a workspace API key.',
        updatedAt,
        sections: [
            {
                id: 'overview',
                title: 'What you can do in five minutes',
                paragraphs: [
                    `The catalog contains ${catalog.filter((tool) => tool.status === 'available').length} tools across ${categories.length} categories: HTTP and webhooks, email, mocks and OAuth, files, monitors, memory, authenticators, scheduled jobs and status pages, test data and media, developer utilities, DNS and network. Use MCP search_tools to discover them, or call the same tools over HTTP, SDK, CLI or SSH.`,
                    'Browser utilities are free. Anonymous HTTP calls use published allowances; workspace-only features require an account and a scoped key. Hosted resources use their own entry points and lifecycle controls.',
                    'This page walks through one utility run, one webhook inbox and the switch to an API key. Every example uses plain curl against https://kivel.io.',
                ],
            },
            {
                id: 'run-a-utility',
                title: 'Run a utility without an account',
                paragraphs: [
                    'Send text in input and string options in options. The JSON formatter has the tool ID json and an action option of format or minify.',
                    'The response contains the tool ID, the result as a string in output, and your daily hosted run usage. Invalid input returns a 400 response with an error message and a request ID.',
                ],
                code: {
                    title: 'Format JSON with curl',
                    value: `curl https://kivel.io/api/tools/json/run \\
  -H 'Content-Type: application/json' \\
  -d '{"input":"{\\"hello\\":true}","options":{"action":"format"}}'

# 200 OK
{
  "toolId": "json",
  "output": "{\\n  \\"hello\\": true\\n}",
  "usage": { "used": 1, "limit": 100, "resetsAt": "2026-10-28T00:00:00.000Z" }
}`,
                },
            },
            {
                id: 'create-an-inbox',
                title: 'Create a webhook inbox',
                paragraphs: [
                    'POST /api/inboxes creates an inbox that lasts one hour. Receiving is public by default: senders can POST to webhookUrl without credentials. inspectionToken lets you read and delete the inbox. This example explicitly chooses private receiving, so it also returns an accessToken for senders.',
                    'Both tokens are returned only once. Save them before you continue; anonymous tokens cannot be recovered.',
                ],
                code: {
                    title: 'Create a private inbox',
                    value: `curl -X POST https://kivel.io/api/inboxes

# 201 Created
{
  "id": "INBOX_ID",
  "inspectionToken": "INSPECTION_TOKEN",
  "expiresAt": "2026-10-27T13:00:00.000Z",
  "visibility": "private",
  "accessVersion": "ACCESS_VERSION",
  "accessToken": "ACCESS_TOKEN",
  "webhookUrl": "https://kivel.io/hooks/INBOX_ID"
}`,
                },
            },
            {
                id: 'send-and-inspect',
                title: 'Send a callback and read it back',
                paragraphs: [
                    'Send any request to the webhook URL with the access token in X-Access-Token. The inbox answers 200 with a capture ID. Then read the captured history with the inspection token as a Bearer token.',
                ],
                code: {
                    title: 'Send, inspect and delete',
                    value: `curl -X POST https://kivel.io/hooks/INBOX_ID \\
  -H "X-Access-Token: $ACCESS_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"event":"ping"}'
# {"received":true,"requestId":"CAPTURE_ID"}

curl https://kivel.io/api/inboxes/INBOX_ID/requests \\
  -H "Authorization: Bearer $INSPECTION_TOKEN"
# {"requests":[{"method":"POST","path":"/hooks/INBOX_ID","headers":{...},
#   "query":{},"body":"{\\"event\\":\\"ping\\"}","bodyEncoding":"utf8",
#   "bodySize":16,"id":"CAPTURE_ID","timestamp":"..."}]}

curl -X DELETE https://kivel.io/api/inboxes/INBOX_ID \\
  -H "Authorization: Bearer $INSPECTION_TOKEN"
# 204 No Content`,
                },
                note: 'If the sending service cannot add custom headers, create the inbox with ?visibility=public instead. Anyone who knows a public webhook URL can send to it.',
            },
            {
                id: 'add-an-api-key',
                title: 'Switch to an API key',
                paragraphs: [
                    'Create a free account at /account/, open your workspace’s API keys section and create a key. Keys start with kv_ and are shown once. Send the key as a Bearer token on any request.',
                    'With a key, resources belong to your workspace, usage counts against the workspace plan, and you can list everything you own with GET /api/account/resources. GET /api/usage shows the plan, its limits and today’s hosted runs for the caller.',
                ],
                code: {
                    title: 'Authenticated requests',
                    value: `export KIVEL_API_KEY='kv_...'

curl https://kivel.io/api/usage \\
  -H "Authorization: Bearer $KIVEL_API_KEY"

curl -X POST https://kivel.io/api/inboxes \\
  -H "Authorization: Bearer $KIVEL_API_KEY"`,
                },
            },
            {
                id: 'next-steps',
                title: 'Next steps',
                paragraphs: [
                    'Each resource type has its own page with the full request and response shapes. The interactive reference at /docs/reference/ lists every endpoint, and /api/openapi.json is the OpenAPI 3.1 document you can import into your own tooling or client generator.',
                ],
                list: [
                    'Authentication and API keys: which credential goes in which header.',
                    'Limits and errors: allowances, rate limits and how to handle 429 responses.',
                    'Webhook inboxes, mock REST APIs, file sharing and mock MCP servers.',
                    'The CLI, TypeScript SDK, SSH gateway and MCP endpoint for agents.',
                ],
            },
        ],
        faqs: [
            {
                question: 'Do I need an account to use the Kivel API?',
                answer: 'No. Utility runs and resource creation work anonymously with the smallest allowances: 5 active resources, one-hour lifetimes and 100 hosted runs per day. An account raises those limits and lets you manage resources from a workspace.',
            },
            {
                question: 'Why does my webhook return 404 right after I created the inbox?',
                answer: 'New inboxes accept senders without credentials by default. An inbox explicitly created with visibility=private requires X-Access-Token or a Bearer access token. Missing credentials return 404 and are not captured. Use visibility=public for providers that cannot add headers. Reading and waiting always require workspace credentials or the inspection token.',
            },
            {
                question: 'Is there an OpenAPI document?',
                answer: 'Yes. GET /api/openapi.json returns an OpenAPI 3.1 document, and /docs/reference/ renders it as an interactive reference.',
            },
            {
                question: 'Can I call the API from JavaScript on my own website?',
                answer: 'Not from another site’s browser code. API requests that carry an Origin header for a different site are rejected with 403. Call the API from a server, a script, CI or the SDK in Node.js.',
            },
        ],
        related: [
            { title: 'Authentication and API keys', href: '/docs/authentication/' },
            { title: 'Webhook inboxes', href: '/docs/webhook-inboxes/' },
            { title: 'API reference', href: '/docs/reference/' },
            { title: 'JSON formatter', href: '/tools/json-formatter/' },
            { title: 'Integrations', href: '/integrations/' },
        ],
    },
    {
        slug: 'authentication',
        title: 'Authentication, API keys and resource tokens',
        navTitle: 'Authentication',
        group: 'Get started',
        description:
            'How Kivel authenticates requests: anonymous use, scoped workspace API keys, browser sessions, and the separate inspection, management and access tokens.',
        updatedAt,
        sections: [
            {
                id: 'overview',
                title: 'Which credential do I need?',
                paragraphs: [
                    'Kivel has two kinds of credentials. Account credentials (an API key or a signed-in browser session) identify your workspace. Resource tokens are returned when a resource is created and control one resource: either managing it or calling it.',
                    'Most endpoints also work without any credential. Anonymous requests use the anonymous plan, and their usage is tracked by a hashed IP address, so people on the same connection share limits.',
                ],
                table: {
                    caption: 'Credentials and where to send them',
                    headers: ['Credential', 'Format', 'Header', 'What it allows'],
                    rows: [
                        [
                            'API key',
                            'kv_ followed by 43 characters',
                            'Authorization: Bearer',
                            'Workspace actions allowed by the key’s scopes',
                        ],
                        [
                            'Session cookie',
                            '__Host-kivel_session (HttpOnly)',
                            'Cookie, set by signing in',
                            'Browser use of the site and account administration',
                        ],
                        [
                            'Inspection token (inboxes)',
                            '43 characters',
                            'Authorization: Bearer or X-Resource-Token',
                            'Read history, change sharing, renew and delete one anonymous inbox',
                        ],
                        [
                            'Management token (mocks, files, MCP servers)',
                            '43 characters',
                            'Authorization: Bearer or X-Resource-Token',
                            'Read, update, change sharing, renew and delete one anonymous resource',
                        ],
                        [
                            'Access token',
                            '43 characters',
                            'X-Access-Token or Authorization: Bearer',
                            'Send to, call or download one private resource',
                        ],
                    ],
                },
            },
            {
                id: 'api-keys',
                title: 'API keys',
                paragraphs: [
                    'Create keys in your workspace’s API keys section at /account/. A key is shown once at creation; the server stores only a hash. Each key belongs to one user and one workspace, and requests made with it use that workspace’s plan and allowances.',
                    'Key creation, listing and revocation (GET, POST /api/account/keys and DELETE /api/account/keys/{id}) require a signed-in browser session, so a key cannot create or revoke keys. Keys also cannot change workspace membership or open billing sessions.',
                ],
                list: [
                    'Expiry: 1 to 365 days, 90 days by default.',
                    'Up to 20 active keys per user and workspace.',
                    'An invalid, expired or revoked key returns 401. The request does not fall back to anonymous access.',
                    'Resetting your password revokes all sessions and API keys. Workspace resources are kept.',
                ],
                code: {
                    title: 'Use a key',
                    value: `curl https://kivel.io/api/account \\
  -H "Authorization: Bearer $KIVEL_API_KEY"`,
                },
                note: 'Keep keys in environment variables or a secret manager, never in URLs or source control. Revoke a key from your workspace as soon as it is exposed.',
            },
            {
                id: 'scopes',
                title: 'Scopes',
                paragraphs: [
                    'A key can hold any of four scopes. By default a new key receives every scope your workspace role allows; you can choose fewer when you create it. A request outside the key’s scopes returns 403.',
                ],
                table: {
                    caption: 'API key scopes',
                    headers: ['Scope', 'Allows'],
                    rows: [
                        ['tools:run', 'POST /api/tools/{id}/run and the MCP run_tool tool'],
                        [
                            'resources:read',
                            'GET requests on inboxes, mocks, files and MCP servers, GET /api/account/resources, and downloading private workspace files',
                        ],
                        [
                            'resources:write',
                            'Creating, updating, deleting, renewing and changing sharing of resources, and sending to private workspace inboxes',
                        ],
                        [
                            'account:read',
                            'GET /api/account, /api/account/workspaces and /api/account/members',
                        ],
                    ],
                },
            },
            {
                id: 'workspaces',
                title: 'Workspaces and roles',
                paragraphs: [
                    'Every account has a personal workspace. Team workspaces can add members with the roles owner, admin, member or viewer. The role limits which scopes a key or session can use.',
                ],
                list: [
                    'Owner: every scope.',
                    'Admin and member in a Team workspace: every scope.',
                    'Viewer in a Team workspace: resources:read and account:read.',
                    'Any non-owner in a workspace that is not on the Team plan: account:read only.',
                ],
            },
            {
                id: 'resource-tokens',
                title: 'Resource tokens',
                paragraphs: [
                    'Anonymous resources are managed with the token returned at creation: inspectionToken for webhook inboxes and managementToken for mock APIs, files and mock MCP servers. Send it as Authorization: Bearer. If an API key already occupies the Authorization header, send the resource token in X-Resource-Token instead.',
                    'Resources created with an API key or session belong to the workspace. They are managed with current workspace access, so a leaked management token alone does not grant management of a workspace resource.',
                    'Private resources also return an accessToken. It is the only credential a webhook sender, mock API caller, MCP client or file recipient needs. It cannot read history or change the resource, and a management token cannot download a private file.',
                ],
                code: {
                    title: 'API key and resource token together',
                    value: `curl https://kivel.io/api/mocks/MOCK_ID \\
  -H "Authorization: Bearer $KIVEL_API_KEY" \\
  -H "X-Resource-Token: $MANAGEMENT_TOKEN"`,
                },
            },
            {
                id: 'sessions',
                title: 'Browser sessions',
                paragraphs: [
                    'Signing in sets a seven-day HttpOnly, SameSite=Strict session cookie. Requests that change data with a session must come from the site itself; a mismatched Origin returns 403 with a hint to use an API key for scripts.',
                    'Any /api/ request that carries an Origin header for another site is rejected with 403, so the API cannot be called from third-party web pages. Use an API key from a server, script or CI job.',
                ],
            },
        ],
        faqs: [
            {
                question: 'What is the difference between a management token and an access token?',
                answer: 'A management token (inspectionToken for inboxes) controls the resource: reading history, updating, renewing, changing sharing and deleting. An access token only lets a caller use a private resource, for example send a webhook or download a file. Keep the management token to yourself and share only the access token.',
            },
            {
                question: 'Can an API key create other API keys?',
                answer: 'No. Creating, listing and revoking keys require a signed-in browser session. Keys also cannot change workspace membership or open billing sessions.',
            },
            {
                question:
                    'How do I send an API key and an anonymous resource token in the same request?',
                answer: 'Put the API key in Authorization: Bearer and the resource token in X-Resource-Token. The SDK and CLI do this automatically when you pass a token.',
            },
            {
                question: 'Why does my viewer key get 403 when creating a resource?',
                answer: 'Viewers in a Team workspace have only resources:read and account:read. Creating resources needs resources:write, which owners, admins and members have.',
            },
        ],
        related: [
            { title: 'Sharing and access', href: '/docs/sharing-and-access/' },
            { title: 'Limits and errors', href: '/docs/limits-and-errors/' },
            { title: 'Plans and limits', href: '/pricing/' },
            { title: 'Privacy and data handling', href: '/privacy/' },
        ],
    },
    {
        slug: 'limits-and-errors',
        title: 'Limits, rate limits and error responses',
        navTitle: 'Limits and errors',
        group: 'Get started',
        description:
            'Kivel plan allowances, rate limits, request sizes and retention, plus the JSON error format, status codes and how to handle Retry-After on 429 and 503.',
        updatedAt,
        sections: [
            {
                id: 'overview',
                title: 'How limits work',
                paragraphs: [
                    'Every hosted request counts against the caller’s plan: anonymous, Free, Pro or Team. Account limits are shared by all API keys and members of a workspace. Anonymous limits are keyed to a hashed IP address. Browser-local tools on the website run on your device and use no hosted allowance.',
                    'Call GET /api/plans for all plan allowances and GET /api/usage for your current plan, its limits and today’s hosted runs. Daily run counters reset at 00:00 UTC.',
                ],
                table: {
                    caption: 'Plan allowances',
                    headers: ['Allowance', 'Without an account', 'Free', 'Pro', 'Team'],
                    rows: [
                        ['Active resources', '5', '20', '100', '500'],
                        ['Total storage', '32 MiB', '64 MiB', '512 MiB', '2 GiB'],
                        ['Maximum retention', '1 hour', '7 days', '30 days', '90 days'],
                        ['Hosted utility runs per day', '100', '1,000', '20,000', '100,000'],
                        ['Utility input per request', '64 KiB', '256 KiB', '1024 KiB', '1024 KiB'],
                        ['API requests per minute', '120', '240', '1,200', '3,000'],
                        ['Resource creations per minute', '10', '20', '60', '120'],
                        ['File size per upload', '10 MiB', '10 MiB', '10 MiB', '10 MiB'],
                        ['Persistent leases', 'No', 'No', 'Yes', 'Yes'],
                    ],
                },
                note: 'Pro and Team are not currently sold. Their allowances are listed so you can plan; see /pricing/ for availability.',
            },
            {
                id: 'fixed-limits',
                title: 'Request and resource limits',
                paragraphs: [
                    'These limits apply regardless of plan unless the table says otherwise. The installation can also reach total capacity, in which case creation returns 503.',
                ],
                table: {
                    caption: 'Fixed limits',
                    headers: ['Limit', 'Value'],
                    rows: [
                        ['JSON request body for most /api/ endpoints', '100 KiB'],
                        ['Utility run request body', '16 MiB, with files up to 10 MiB combined'],
                        ['Webhook request body', '100 KiB'],
                        [
                            'Webhook inbox history',
                            '100 requests or 1 MiB anonymously; 1,000 requests or 10 MiB with an account',
                        ],
                        ['File upload', '10 MiB, nonempty'],
                        [
                            'Downloads per file',
                            'Up to 100 anonymously, up to 1,000 with an account',
                        ],
                        ['Mock API configuration', '1 to 20 routes, 80 KiB total'],
                        ['Mock MCP server configuration', '1 to 10 tools, 80 KiB total'],
                        ['Platform MCP request body', '16 MiB; four concurrent requests'],
                        [
                            'Catalog GET/HEAD requests, including descriptors, capabilities and OpenAPI',
                            '600 per minute per IP, separate from API and run allowances',
                        ],
                        [
                            'Public endpoint rate (each webhook inbox, mock API and mock MCP server)',
                            '120 requests per minute',
                        ],
                        ['Sign-in and registration attempts', '10 per 15 minutes per IP address'],
                    ],
                },
            },
            {
                id: 'error-format',
                title: 'Error format',
                paragraphs: [
                    'Errors are JSON objects with an error message. Most API errors also include requestId. Every response carries an X-Request-Id header, so keep that value when you report a failed call. The platform MCP endpoint returns JSON-RPC errors instead.',
                ],
                code: {
                    title: 'Error body',
                    value: `HTTP/1.1 429 Too Many Requests
Retry-After: 37
X-Request-Id: 1e3e28f5-fb64-474f-845f-b06c17f52eef

{"error":"Request rate limit exceeded.","requestId":"1e3e28f5-fb64-474f-845f-b06c17f52eef"}`,
                },
            },
            {
                id: 'status-codes',
                title: 'Status codes',
                paragraphs: [
                    'Read each endpoint’s schema in /docs/reference/ for its exact responses. These are the codes you will meet most often.',
                ],
                table: {
                    caption: 'Common status codes',
                    headers: ['Status', 'Meaning', 'What to do'],
                    rows: [
                        ['200, 201, 204', 'Success, created, or done with no body', 'Continue.'],
                        [
                            '304',
                            'Inbox history unchanged since your ETag',
                            'Keep the cached history.',
                        ],
                        [
                            '400',
                            'Invalid body, option, visibility, ttlSeconds or maxDownloads',
                            'Fix the request using the error message.',
                        ],
                        [
                            '401',
                            'Missing, invalid, expired or revoked credential',
                            'Check the API key or sign in.',
                        ],
                        [
                            '403',
                            'Scope, role or Origin not allowed, or persistent requested without a paid plan',
                            'Use a key with the right scope; call from a server, not a third-party page.',
                        ],
                        [
                            '404',
                            'Unknown, expired or inaccessible resource, or a missing access token',
                            'Check the ID, the token and whether the resource expired.',
                        ],
                        ['408', 'A utility run timed out', 'Reduce the input or try again later.'],
                        [
                            '409',
                            'Renewal past the maximum lifetime, key or invitation limit reached',
                            'Create a new resource, or revoke unused keys.',
                        ],
                        ['413', 'Body or input exceeds the allowance', 'Send less data.'],
                        [
                            '429',
                            'Rate limit, daily run allowance, resource quota or full inbox',
                            'Wait for Retry-After when present; otherwise free capacity first.',
                        ],
                        [
                            '503',
                            'Processors, file transfers or capacity busy',
                            'Retry after the Retry-After seconds.',
                        ],
                    ],
                },
            },
            {
                id: 'retries',
                title: 'Handling 429 and 503',
                paragraphs: [
                    'Rate limits use one-minute windows. A 429 from a rate limit includes Retry-After in seconds until the window resets. The daily run limit returns 429 with Retry-After set to the seconds until 00:00 UTC.',
                    'Some 429 responses have no Retry-After because waiting will not help: a full webhook inbox, the active resource limit or the storage allowance. Delete resources or create a new inbox instead.',
                    'When hosted tool processors are busy the API returns 503 with Retry-After: 2. When file transfers are busy it returns 503 with Retry-After: 5.',
                ],
                list: [
                    'Retry GET requests and utility runs after Retry-After.',
                    'Do not blindly retry creation requests; check whether the first one succeeded.',
                    'The SDK exposes retryAfter on KivelError. The SDK and CLI never retry mutations themselves.',
                ],
            },
            {
                id: 'retention',
                title: 'Retention and cleanup',
                paragraphs: [
                    'Resources expire one hour after creation unless you set ttlSeconds or renew them within your plan’s maximum retention. Expired resources stop working immediately, and cleanup removes their data and releases quota at least once per minute. Expired data cannot be restored.',
                    'Utility runs keep no execution history: inputs and results are not stored.',
                ],
            },
        ],
        faqs: [
            {
                question: 'When do hosted run counters reset?',
                answer: 'Daily hosted run counters reset at 00:00 UTC. The usage object returned by each run includes resetsAt.',
            },
            {
                question: 'Do failed utility runs count against my daily allowance?',
                answer: 'Requests rejected during validation, for example an unknown option or oversized input, are rejected before a run is counted. A run that fails during processing is released from the count.',
            },
            {
                question: 'Are limits per API key or per workspace?',
                answer: 'Per workspace. All keys and members of a workspace share its allowances. Anonymous callers are grouped by a hashed IP address.',
            },
            {
                question: 'Why do I get 429 when my inbox is not receiving much traffic?',
                answer: 'An inbox stops capturing when its history is full: 100 requests or 1 MiB anonymously, 1,000 requests or 10 MiB with an account. Existing history stays readable. Create another inbox or delete this one.',
            },
        ],
        related: [
            { title: 'Plans and limits', href: '/pricing/' },
            { title: 'Lifetimes and renewal', href: '/docs/lifetimes-and-renewal/' },
            { title: 'Authentication and API keys', href: '/docs/authentication/' },
            { title: 'API reference', href: '/docs/reference/' },
        ],
    },
    {
        slug: 'email-search',
        title: 'Search and wait for email',
        navTitle: 'Email search',
        group: 'Resources',
        description:
            'Find a message by sender, subject or extraction results. Take an inbox checkpoint before triggering email, then wait for the matching message.',
        updatedAt,
        sections: [
            {
                id: 'filters',
                title: 'Find messages',
                paragraphs: [
                    'Use GET /api/email-inboxes/{id}/messages with from, mailFrom, subject, text, hasCode, hasLink or hasAttachment. All supplied filters must match. Sender filters match the whole mailbox without regard to case. Subject and text filters match literal text.',
                    'Filtered results are newest first. Pass nextCursor with the same filters to get the next page. The default page has 20 messages. With no query options, the endpoint still returns the original message list.',
                ],
            },
            {
                id: 'checkpoint',
                title: 'Take a checkpoint before sending',
                paragraphs: [
                    'Call the wait endpoint with checkpoint=true and the filters you will use after triggering the email. Pass its nextCursor back with the same filters. When a wait times out, use the returned cursor on the next call.',
                    'In MCP, use list_emails and wait_for_email with the same filter names. In the CLI, run kivel email wait INBOX_ID --checkpoint --subject Verify, then wait with --cursor and the same subject.',
                ],
                code: {
                    title: 'TypeScript',
                    value: "const filters = { subject: 'Verify', hasCode: true };\nconst start = await kivel.waitForEmail(inbox.id, { ...filters, checkpoint: true });\n// Trigger the verification email here.\nconst page = await kivel.waitForEmail(inbox.id, { ...filters, cursor: start.nextCursor });",
                },
            },
        ],
    },
    {
        slug: 'webhook-inboxes',
        title: 'Webhook inboxes: capture and inspect HTTP callbacks',
        navTitle: 'Webhook inboxes',
        group: 'Resources',
        description:
            'Create a temporary webhook URL with the Kivel API, receive callbacks from any service, and read captured methods, headers, query values and bodies.',
        updatedAt,
        sections: [
            {
                id: 'overview',
                title: 'What a webhook inbox does',
                paragraphs: [
                    'A webhook inbox is a temporary URL that records every request sent to it. Use it to see exactly what a payment provider, Git host, form service or your own code sends before you write a handler. The inbox answers each sender with 200 and stores the method, path, headers, query parameters and body for you to read.',
                ],
            },
            {
                id: 'create',
                title: 'Create an inbox',
                paragraphs: [
                    'POST /api/inboxes takes no body. Optional query parameters set visibility, ttlSeconds and persistent; see Lifetimes and renewal. Senders can POST to webhookUrl without credentials by default. Inspection remains private. The response includes webhookUrl, the inspectionToken for reading and deleting, and, for private inboxes, the accessToken that senders need.',
                ],
                code: {
                    title: 'Create a public inbox for 30 minutes',
                    value: `curl -X POST 'https://kivel.io/api/inboxes?visibility=public&ttlSeconds=1800'

# 201 Created
{
  "id": "INBOX_ID",
  "inspectionToken": "INSPECTION_TOKEN",
  "expiresAt": "2026-10-27T12:30:00.000Z",
  "visibility": "public",
  "accessVersion": "ACCESS_VERSION",
  "webhookUrl": "https://kivel.io/hooks/INBOX_ID"
}`,
                },
            },
            {
                id: 'send',
                title: 'Send requests to the webhook URL',
                paragraphs: [
                    'The webhook URL accepts GET, HEAD, POST, PUT, PATCH, DELETE and OPTIONS, with a body on any method up to 100 KiB. Query strings are captured; additional path segments after the inbox ID are not accepted.',
                    'A successful capture returns 200 with {"received":true,"requestId":"..."} and an X-Webhook-Request-Id header. HEAD returns 200 with no body. The response status and body are fixed; an inbox cannot be configured to answer differently. Use a mock API for that.',
                    'Private inboxes accept a request only with the access token in X-Access-Token or Authorization: Bearer. Without it the sender gets 404 and nothing is stored. Workspace credentials with resources:write can also send to their own private inboxes.',
                ],
                code: {
                    title: 'Send to a private inbox',
                    value: `curl -X POST 'https://kivel.io/hooks/INBOX_ID?source=test' \\
  -H "X-Access-Token: $ACCESS_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"type":"invoice.paid","id":"evt_test_1"}'

# 200 OK
# X-Webhook-Request-Id: CAPTURE_ID
{"received":true,"requestId":"CAPTURE_ID"}`,
                },
            },
            {
                id: 'inspect',
                title: 'Read captured requests',
                paragraphs: [
                    'GET /api/inboxes/{id}/requests returns captures in arrival order. Each record has id, method, path, headers, query, body, bodyEncoding, bodySize and timestamp. Bodies that are valid UTF-8 are stored as text; other bodies are stored as Base64 with bodyEncoding set to base64.',
                    'Header names that contain authorization, cookie, token, api key, secret or password are stored as [REDACTED]. Bodies and query values are kept as sent, so use test data.',
                    'For polling, the response has an ETag. Send it back in If-None-Match and you get 304 until a new request arrives. The response also carries X-Resource-Visibility, X-Access-Version and X-Resource-Expires-At headers.',
                ],
                code: {
                    title: 'Poll with an ETag',
                    value: `curl -i https://kivel.io/api/inboxes/INBOX_ID/requests \\
  -H "Authorization: Bearer $INSPECTION_TOKEN" \\
  -H 'If-None-Match: "ETAG_FROM_LAST_RESPONSE"'`,
                },
            },
            {
                id: 'manage',
                title: 'Inbox details and deletion',
                paragraphs: [
                    'GET /api/inboxes/{id} returns id, visibility, accessVersion, expiresAt, requestCount and storedBytes, plus createdAt, persistent, requestLimit and byteLimit. DELETE /api/inboxes/{id} removes the inbox and its history immediately and returns 204.',
                    'Use the inspection token for anonymous inboxes. Inboxes created with an API key are managed with workspace access; send the key instead.',
                ],
                table: {
                    caption: 'Inbox endpoints',
                    headers: ['Method and path', 'Purpose'],
                    rows: [
                        ['POST /api/inboxes', 'Create an inbox'],
                        ['ANY /hooks/{id}', 'Capture an incoming request'],
                        ['GET /api/inboxes/{id}/requests', 'Read captured requests'],
                        ['GET /api/inboxes/{id}', 'Read expiry and usage'],
                        [
                            'POST /api/inboxes/{id}/sharing',
                            'Change visibility or rotate the access token',
                        ],
                        ['POST /api/inboxes/{id}/renew', 'Extend the lifetime within your plan'],
                        ['DELETE /api/inboxes/{id}', 'Delete the inbox and its history'],
                    ],
                },
            },
            {
                id: 'limits',
                title: 'Limits',
                paragraphs: [
                    'Anonymous inboxes hold up to 100 requests or 1 MiB of captured data; account inboxes hold up to 1,000 requests or 10 MiB. When an inbox is full, new captures get 429 and existing history stays readable. Each inbox accepts up to 120 requests per minute.',
                ],
            },
        ],
        faqs: [
            {
                question: 'Can the inbox respond with a custom status code or body?',
                answer: 'No. A webhook inbox always answers a successful capture with 200 and {"received":true,"requestId":"..."}. To return a chosen status, body or delay, create a mock API.',
            },
            {
                question: 'My provider cannot send custom headers. How do I use a private inbox?',
                answer: 'You cannot: private inboxes require X-Access-Token or a Bearer access token. Create the inbox with ?visibility=public, or switch an existing inbox with POST /api/inboxes/{id}/sharing and {"visibility":"public"}.',
            },
            {
                question: 'Are signature headers from my provider captured?',
                answer: 'Yes, unless the header name contains authorization, cookie, token, api key, secret or password. Those headers are redacted before storage.',
            },
            {
                question: 'How long does an inbox last?',
                answer: 'One hour by default. You can set ttlSeconds at creation or renew up to your plan’s maximum retention: 1 hour anonymously, 7 days on Free, 30 days on Pro and 90 days on Team.',
            },
        ],
        related: [
            { title: 'Webhook inbox tool', href: '/tools/webhook-inbox/' },
            { title: 'Sharing and access', href: '/docs/sharing-and-access/' },
            { title: 'Lifetimes and renewal', href: '/docs/lifetimes-and-renewal/' },
            { title: 'Mock REST APIs', href: '/docs/mock-apis/' },
        ],
    },
    {
        slug: 'mock-apis',
        title: 'Mock REST APIs: configured routes with static or templated responses',
        navTitle: 'Mock REST APIs',
        group: 'Resources',
        description:
            'Create a temporary mock REST API on Kivel with up to 20 routes, path parameters, response templates, conditions, delays, rate limits and streaming.',
        updatedAt,
        sections: [
            {
                id: 'overview',
                title: 'What a mock API does',
                paragraphs: [
                    'A mock API is a temporary HTTP endpoint that returns responses you configure. Use it to develop a client before the real API exists, to reproduce an error status or a slow response, or to give a test suite a stable fake dependency. Responses are static text or simple templates; no user code runs.',
                ],
            },
            {
                id: 'create',
                title: 'Create a mock API',
                paragraphs: [
                    'POST /api/mocks with a JSON body containing a name and routes. Settings such as visibility and ttlSeconds go in the query string. The response includes endpointUrl and a managementToken, plus an accessToken when the mock is private.',
                ],
                code: {
                    title: 'Create a public mock with a templated route',
                    value: `curl -X POST 'https://kivel.io/api/mocks?visibility=public' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "name": "Users",
    "routes": [
      { "method": "GET", "path": "/users/:id", "status": 200,
        "body": "{\\"id\\":\\"{{path.id}}\\"}", "template": true },
      { "method": "POST", "path": "/users", "status": 503,
        "body": "{\\"error\\":\\"unavailable\\"}", "delayMs": 1500 }
    ]
  }'

# 201 Created
{
  "id": "MOCK_ID",
  "managementToken": "MANAGEMENT_TOKEN",
  "expiresAt": "2026-10-27T13:00:00.000Z",
  "visibility": "public",
  "accessVersion": "ACCESS_VERSION",
  "endpointUrl": "https://kivel.io/mock/MOCK_ID"
}

curl https://kivel.io/mock/MOCK_ID/users/42
# {"id":"42"}`,
                },
            },
            {
                id: 'routes',
                title: 'Route fields',
                paragraphs: [
                    'A configuration has a name of up to 80 characters and 1 to 20 routes. The whole configuration must fit in 80 KiB.',
                ],
                table: {
                    caption: 'Route configuration',
                    headers: ['Field', 'Required', 'Rules'],
                    rows: [
                        ['method', 'Yes', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD or ANY'],
                        [
                            'path',
                            'Yes',
                            'Starts with /, up to 200 characters; :name segments match any value',
                        ],
                        ['status', 'Yes', 'Integer from 200 to 599'],
                        ['body', 'Yes', 'String up to 50 KiB'],
                        [
                            'headers',
                            'No',
                            'Up to 10; only Content-Type and X-Mock-* names, values up to 200 printable ASCII characters',
                        ],
                        ['delayMs', 'No', '0 to 2000 milliseconds, default 0'],
                        [
                            'failureRate',
                            'No',
                            '0 to 100: share of calls answered with failureStatus (400 to 599, default 503) and X-Mock-Simulated-Failure: true',
                        ],
                        [
                            'template',
                            'No',
                            'true to insert request values into a JSON or plain text body',
                        ],
                        [
                            'condition',
                            'No',
                            '{source, key, value}: source is header, query or body; value up to 512 characters',
                        ],
                        [
                            'requestsPerMinute',
                            'No',
                            '1 to 120; extra requests get 429 with Retry-After',
                        ],
                        [
                            'stream',
                            'No',
                            '{mode, intervalMs}: mode sse or text, interval 10 to 1000 ms',
                        ],
                    ],
                },
            },
            {
                id: 'matching',
                title: 'How requests are matched',
                paragraphs: [
                    'Call routes under endpointUrl, for example https://kivel.io/mock/MOCK_ID/users/42. A route matches when the method is equal, the path has the same number of segments with equal literal segments, and the condition (if any) holds. Trailing slashes are ignored.',
                    'The first route in configuration order wins. If no route has the request method, HEAD falls back to a GET route, then any method falls back to an ANY route. No match returns 404 with {"error":"No matching mock route."}.',
                    'A condition compares one request header, query parameter or top-level JSON body field to an exact string. Use conditions to return different responses from the same path, for example a 401 route and a 200 route for the same path selected by an Authorization value.',
                ],
            },
            {
                id: 'responses',
                title: 'Response content',
                paragraphs: [
                    'Content-Type defaults to application/json. Allowed types are application/json, application/problem+json, application/xml, text/plain, text/csv and text/event-stream, optionally with ; charset=utf-8. Responses with status 204, 205 or 304 and HEAD requests send no body.',
                    'Templates replace {{path.name}}, {{query.name}} and {{body.name}} with the request value, and {{fake.name}} placeholders with fresh sample data on every call: firstName, lastName, name, email, username, phone, company, city, country, uuid, id, int, price, bool, word, sentence, url, date, datetime and now. In JSON templates, placeholders must sit inside strings and values are JSON-escaped. Missing values become empty strings. Each inserted value is limited to 4,096 characters and the rendered body to 64 KiB. Templates do not support XML or streaming.',
                    'Streaming routes must use GET or ANY with status 200. Each line of the body is sent as one chunk, or as one server-sent event with sequential id and event: message, at the configured interval. A stream allows up to 20 lines of 4 KiB and five seconds of delivery.',
                ],
            },
            {
                id: 'manage',
                title: 'Read, update and delete',
                paragraphs: [
                    'GET /api/mocks/{id} returns the configuration, visibility, accessVersion, expiresAt, uses (the number of requests received) and endpointUrl. PUT /api/mocks/{id} replaces the whole configuration with a new valid body and returns 204. DELETE /api/mocks/{id} removes it immediately.',
                ],
                code: {
                    title: 'Replace routes',
                    value: `curl -X PUT https://kivel.io/api/mocks/MOCK_ID \\
  -H "Authorization: Bearer $MANAGEMENT_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Users","routes":[{"method":"ANY","path":"/health","status":200,"body":"ok","headers":{"content-type":"text/plain"}}]}'
# 204 No Content`,
                },
                note: 'Private mocks need the access token on every call, in X-Access-Token or Authorization: Bearer. If your client already uses Authorization for the API it is testing, send X-Access-Token.',
            },
            {
                id: 'limits',
                title: 'Limits',
                paragraphs: [
                    'Each mock API accepts up to 120 requests per minute in total; per-route requestsPerMinute applies on top. When stream capacity is reached, new streams get 503 with Retry-After: 5.',
                ],
            },
        ],
        faqs: [
            {
                question: 'Can a mock API run custom code or call another service?',
                answer: 'No. Responses are static text or templates that insert path, query and top-level JSON body values. There are no expressions, scripts or outbound requests.',
            },
            {
                question: 'How do I return different responses from the same path?',
                answer: 'Add routes with the same method and path but different conditions, for example on a header, query parameter or body field. The first matching route in configuration order is used, so place the unconditional route last.',
            },
            {
                question: 'Which response headers can I set?',
                answer: 'Only Content-Type and headers that start with X-Mock-, up to 10 per route. Other headers are rejected when you create or update the mock.',
            },
            {
                question: 'Can I test retry and backoff behaviour?',
                answer: 'Yes. Set requestsPerMinute on a route. Requests beyond the quota get 429 with a Retry-After header, and the window starts with the first counted request.',
            },
        ],
        related: [
            { title: 'Mock REST API tool', href: '/tools/mock-rest-api/' },
            { title: 'Mock response templates', href: '/tools/mock-response-templates/' },
            { title: 'OpenAPI to mock', href: '/tools/openapi-to-mock/' },
            { title: 'SSE generator', href: '/tools/sse-generator/' },
            { title: 'Sharing and access', href: '/docs/sharing-and-access/' },
        ],
    },
    {
        slug: 'file-sharing',
        title: 'Temporary file sharing, private links and one-time downloads',
        navTitle: 'File sharing',
        group: 'Resources',
        description:
            'Upload a file up to 10 MiB with the Kivel API, share it privately or publicly, limit downloads with maxDownloads, and create one-time download links.',
        updatedAt,
        sections: [
            {
                id: 'overview',
                title: 'What file sharing does',
                paragraphs: [
                    'File sharing stores one file temporarily and gives you a download link. Use it to hand a build artifact, log or test fixture to a person or another system without setting up storage. Files are private by default, expire after one hour unless you choose otherwise, and can be limited to a number of downloads, including a single one.',
                ],
            },
            {
                id: 'upload',
                title: 'Upload a file',
                paragraphs: [
                    'POST /api/files with the raw bytes as the body and Content-Type: application/octet-stream. Put the URL-encoded filename (up to 150 characters, no directories) in X-File-Name. The file must be nonempty and at most 10 MiB.',
                ],
                table: {
                    caption: 'Upload query parameters',
                    headers: ['Parameter', 'Default', 'Rules'],
                    rows: [
                        ['visibility', 'private', 'public or private'],
                        [
                            'maxDownloads',
                            '100 anonymously, 1,000 with an account',
                            'Integer from 1 to that same maximum; 1 creates a one-time link',
                        ],
                        ['ttlSeconds', '3600', 'From 60 to your plan’s maximum retention'],
                        ['persistent', 'false', 'true requires an active paid plan'],
                    ],
                },
                code: {
                    title: 'Upload a private one-time file',
                    value: `curl -X POST 'https://kivel.io/api/files?maxDownloads=1' \\
  -H 'Content-Type: application/octet-stream' \\
  -H 'X-File-Name: report.txt' \\
  --data-binary @report.txt

# 201 Created
{
  "id": "FILE_ID",
  "managementToken": "MANAGEMENT_TOKEN",
  "expiresAt": "2026-10-27T13:00:00.000Z",
  "visibility": "private",
  "accessVersion": "ACCESS_VERSION",
  "accessToken": "ACCESS_TOKEN",
  "name": "report.txt",
  "size": 5,
  "downloadUrl": "https://kivel.io/files/FILE_ID",
  "remainingDownloads": 1
}`,
                },
            },
            {
                id: 'download',
                title: 'Download a file',
                paragraphs: [
                    'GET /files/{id} returns the file as an attachment (application/octet-stream with a Content-Disposition filename). Each successful GET uses one download. Private files need the access token in X-Access-Token or Authorization: Bearer; workspace credentials with resources:read can also download their own private files.',
                    'Two requests do not use a download: HEAD /files/{id}, which returns the size in Content-Length, and GET /files/{id}/info, which returns id, name, size, expiresAt, visibility and remainingDownloads. Requests with a missing or wrong access token also use no download.',
                ],
                code: {
                    title: 'Check, then download',
                    value: `curl https://kivel.io/files/FILE_ID/info \\
  -H "X-Access-Token: $ACCESS_TOKEN"

curl -o report.txt https://kivel.io/files/FILE_ID \\
  -H "X-Access-Token: $ACCESS_TOKEN"`,
                },
                note: 'Private download links contain only the file ID. Send the access token to the recipient separately and never put it in a URL or query string; URL fragments do not authorize downloads.',
            },
            {
                id: 'one-time',
                title: 'One-time and limited downloads',
                paragraphs: [
                    'When the final allowed download completes, the stored contents are deleted and their storage is released. Later downloads return 404 with "File unavailable, expired, or download limit reached." The file’s metadata stays readable with GET /api/files/{id} (remainingDownloads is 0) until you delete it or it expires.',
                ],
            },
            {
                id: 'manage',
                title: 'Manage a file',
                paragraphs: [
                    'GET /api/files/{id} returns name, size, visibility, accessVersion, expiresAt, uses, downloadUrl and remainingDownloads. DELETE /api/files/{id} removes the file immediately. A management token cannot download a private file; downloads always need the access token or workspace access.',
                ],
                list: [
                    'Downloads are always forced attachments with a sandboxing Content-Security-Policy.',
                    'Files are not scanned for malware. Share only files you trust.',
                    'When too many file transfers are in progress, the API returns 503 with Retry-After: 5.',
                    'Through MCP, upload_temporary_file and download_temporary_file handle files up to 64 KiB as Base64. Use HTTP for larger files.',
                ],
            },
        ],
        faqs: [
            {
                question: 'How do I create a one-time download link?',
                answer: 'Upload with ?maxDownloads=1. The first successful download removes the file contents; later requests get 404. HEAD requests and GET /files/{id}/info do not use the download.',
            },
            {
                question: 'What is the largest file I can share?',
                answer: '10 MiB per file on every plan, as long as it fits within your plan’s total storage: 32 MiB anonymously, 64 MiB on Free, 512 MiB on Pro and 2 GiB on Team.',
            },
            {
                question: 'Can the recipient open the file in the browser?',
                answer: 'Downloads are served as attachments. A private file needs its access token in a request header, so recipients use the receiver page on the website or a client such as curl rather than a bare link.',
            },
            {
                question: 'Does a failed download attempt use up the download limit?',
                answer: 'No. Requests without valid access are rejected before a download is counted.',
            },
        ],
        related: [
            { title: 'Temporary file transfer', href: '/tools/temporary-file-transfer/' },
            { title: 'One-time download links', href: '/tools/one-time-download-links/' },
            { title: 'Private file sharing', href: '/tools/private-file-sharing/' },
            { title: 'Sharing and access', href: '/docs/sharing-and-access/' },
            { title: 'Privacy and data handling', href: '/privacy/' },
        ],
    },
    {
        slug: 'mock-mcp-servers',
        title: 'Mock MCP servers for testing agents and MCP clients',
        navTitle: 'Mock MCP servers',
        group: 'Resources',
        description:
            'Create a temporary mock MCP server on Kivel with up to 10 tools, input schemas, static responses, errors and delays, served over Streamable HTTP.',
        updatedAt,
        sections: [
            {
                id: 'overview',
                title: 'What a mock MCP server does',
                paragraphs: [
                    'A mock MCP server is a temporary Model Context Protocol endpoint whose tools return text you configure. Use it to test how an agent or MCP client discovers tools, validates arguments, handles tool errors and copes with latency, without building a real server. Tools never execute code; each call returns its configured response.',
                ],
            },
            {
                id: 'create',
                title: 'Create a server',
                paragraphs: [
                    'POST /api/mcp-servers with a name (up to 80 characters) and 1 to 10 tools. Query parameters set visibility, ttlSeconds and persistent as for other resources. The response includes endpointUrl, a managementToken and, for private servers, an accessToken.',
                ],
                code: {
                    title: 'Create a private mock MCP server',
                    value: `curl -X POST https://kivel.io/api/mcp-servers \\
  -H 'Content-Type: application/json' \\
  -d '{
    "name": "Weather",
    "tools": [{
      "name": "get_forecast",
      "description": "Return a forecast for a city.",
      "inputSchema": {
        "type": "object",
        "properties": { "city": { "type": "string" } },
        "required": ["city"]
      },
      "response": "Sunny, 21 degrees",
      "delayMs": 500
    }]
  }'

# 201 Created
{
  "id": "SERVER_ID",
  "managementToken": "MANAGEMENT_TOKEN",
  "expiresAt": "2026-10-27T13:00:00.000Z",
  "visibility": "private",
  "accessVersion": "ACCESS_VERSION",
  "accessToken": "ACCESS_TOKEN",
  "endpointUrl": "https://kivel.io/mcp/mock/SERVER_ID"
}`,
                },
            },
            {
                id: 'tools',
                title: 'Tool fields',
                paragraphs: ['The whole configuration must fit in 80 KiB.'],
                table: {
                    caption: 'Mock tool configuration',
                    headers: ['Field', 'Rules'],
                    rows: [
                        ['name', 'Unique, 1 to 64 letters, digits, underscores or hyphens'],
                        ['description', 'Up to 500 characters'],
                        [
                            'inputSchema',
                            'type object with up to 20 properties of type string, number, integer or boolean; optional required list',
                        ],
                        ['response', 'Text returned by every call, up to 10,000 bytes'],
                        ['isError', 'Optional boolean; true marks the result as a tool error'],
                        ['delayMs', 'Optional, 0 to 2000 milliseconds'],
                    ],
                },
            },
            {
                id: 'connect',
                title: 'Connect a client',
                paragraphs: [
                    'The endpoint speaks Streamable HTTP over POST and returns JSON responses. Clients must send Accept: application/json, text/event-stream. GET returns 405: SSE streams and transport sessions are not provided. Supported protocol versions are 2025-11-25, 2025-06-18 and 2025-03-26.',
                    'Supported methods are initialize, ping, tools/list and tools/call. Calls are checked against the tool’s schema: missing required arguments, unknown arguments and wrong types return JSON-RPC error -32602. Notifications (requests without an id) get 202.',
                    'For a private server, send the access token in X-Access-Token or Authorization: Bearer on every request. Each server accepts up to 120 requests per minute.',
                ],
                code: {
                    title: 'Call a mock tool',
                    value: `curl https://kivel.io/mcp/mock/SERVER_ID \\
  -H "X-Access-Token: $ACCESS_TOKEN" \\
  -H 'Accept: application/json, text/event-stream' \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"get_forecast","arguments":{"city":"Paris"}}}'

{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Sunny, 21 degrees"}],"isError":false}}`,
                },
            },
            {
                id: 'manage',
                title: 'Read, update and delete',
                paragraphs: [
                    'GET /api/mcp-servers/{id} returns the configuration, visibility, accessVersion, expiresAt, uses and endpointUrl. PUT replaces the configuration and returns 204. DELETE removes the server immediately. Use the management token for anonymous servers and your API key for workspace servers.',
                ],
            },
        ],
        faqs: [
            {
                question: 'Can a mock MCP tool return different results for different arguments?',
                answer: 'No. Each tool returns the same configured response for every valid call. Arguments are validated against the schema but not used to build the result.',
            },
            {
                question: 'How do I simulate a failing tool?',
                answer: 'Set isError to true on the tool. The call succeeds at the protocol level and returns the configured text with isError: true. Add delayMs to simulate latency.',
            },
            {
                question: 'Does the mock server support resources or prompts?',
                answer: 'No. It implements initialize, ping, tools/list and tools/call. Other methods return JSON-RPC error -32601.',
            },
            {
                question: 'Can I use an MCP client that requires SSE?',
                answer: 'Use a client that supports Streamable HTTP with JSON responses. GET requests for an SSE stream return 405.',
            },
        ],
        related: [
            { title: 'Mock MCP server tool', href: '/tools/mock-mcp-server/' },
            { title: 'MCP server inspector', href: '/tools/mcp-server-inspector/' },
            { title: 'MCP for agents', href: '/docs/mcp/' },
            { title: 'Sharing and access', href: '/docs/sharing-and-access/' },
        ],
    },
    {
        slug: 'sharing-and-access',
        title: 'Sharing and access: public and private resources',
        navTitle: 'Sharing and access',
        group: 'Resources',
        description:
            'How Kivel visibility works: private resources require an X-Access-Token, public ones accept anyone with the URL, and access tokens can be rotated.',
        updatedAt,
        sections: [
            {
                id: 'overview',
                title: 'Public and private',
                paragraphs: [
                    'Every webhook inbox, mock API, file and mock MCP server is either public or private. Visibility controls who can use the resource’s public endpoint: send to the webhook URL, call the mock, connect to the MCP server or download the file. Management (reading history, updating, deleting) always needs the management token or workspace access, whatever the visibility.',
                    'All interfaces create private resources by default: the HTTP API, SDK, CLI, SSH gateway and MCP. Pass visibility=public explicitly when you want an endpoint that works without a credential.',
                ],
                table: {
                    caption: 'Who can use a resource endpoint',
                    headers: ['Visibility', 'Endpoint callers need', 'Management needs'],
                    rows: [
                        [
                            'private (default)',
                            'The access token, or workspace access for workspace resources',
                            'Management or inspection token, or workspace access',
                        ],
                        [
                            'public',
                            'Only the URL',
                            'Management or inspection token, or workspace access',
                        ],
                    ],
                },
            },
            {
                id: 'access-token',
                title: 'Sending the access token',
                paragraphs: [
                    'Send the access token in the X-Access-Token header, or as Authorization: Bearer when the caller has no other use for that header. Access tokens are 43-character strings returned once, at creation or rotation, and stored on the server only as hashes.',
                    'Requests with missing or wrong access get 404, so a private resource is indistinguishable from a missing one. Invalid access never captures a webhook request or uses a file download.',
                ],
                code: {
                    title: 'Call a private endpoint',
                    value: `curl https://kivel.io/mock/MOCK_ID/users/42 \\
  -H "X-Access-Token: $ACCESS_TOKEN"`,
                },
                note: 'Never put access tokens in URLs or query strings, and do not rely on URL fragments: they do not authorize access. Share the link and the token through separate channels.',
            },
            {
                id: 'change-visibility',
                title: 'Change visibility or rotate a token',
                paragraphs: [
                    'POST /api/{kind}/{id}/sharing with {"visibility":"public"} or {"visibility":"private"}, where kind is inboxes, mocks, files or mcp-servers. Authenticate with the management token (inspection token for inboxes) or workspace access.',
                    'Setting private always issues a new access token and immediately invalidates the previous one, so posting private to an already private resource rotates its token. Setting public removes the access token. Every change returns a new accessVersion.',
                ],
                code: {
                    title: 'Rotate the access token of an inbox',
                    value: `curl -X POST https://kivel.io/api/inboxes/INBOX_ID/sharing \\
  -H "Authorization: Bearer $INSPECTION_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"visibility":"private"}'

# 200 OK
{"visibility":"private","accessVersion":"NEW_ACCESS_VERSION","accessToken":"NEW_ACCESS_TOKEN"}`,
                },
            },
            {
                id: 'workspace-access',
                title: 'Workspace access',
                paragraphs: [
                    'Resources created with an API key or session belong to the workspace. Members with the right scope can use private workspace resources without the access token: resources:write to send to an inbox, resources:read to download a file or call a mock or mock MCP server. Browser sessions get this only for requests from the site itself.',
                ],
            },
        ],
        faqs: [
            {
                question: 'What is the default visibility?',
                answer: 'Private, on every interface. Request public visibility explicitly with ?visibility=public on HTTP, visibility: "public" in the SDK, --visibility public in the CLI or the visibility argument in MCP tools.',
            },
            {
                question: 'How do I revoke access I already shared?',
                answer: 'POST {"visibility":"private"} to /api/{kind}/{id}/sharing. The old access token stops working immediately and the response contains a new one. Deleting the resource also ends all access.',
            },
            {
                question: 'Does a management token let me download a private file?',
                answer: 'No. Management and access are separate. Download a private file with its access token or with workspace credentials that have resources:read.',
            },
            {
                question: 'Why does a private resource return 404 instead of 401?',
                answer: 'So that callers without access cannot tell whether the resource exists. Check that you are sending the current access token in X-Access-Token.',
            },
        ],
        related: [
            { title: 'Authentication and API keys', href: '/docs/authentication/' },
            { title: 'File sharing', href: '/docs/file-sharing/' },
            { title: 'Private file sharing', href: '/tools/private-file-sharing/' },
            { title: 'Privacy and data handling', href: '/privacy/' },
        ],
    },
    {
        slug: 'lifetimes-and-renewal',
        title: 'Resource lifetimes, renewal and persistent leases',
        navTitle: 'Lifetimes and renewal',
        group: 'Resources',
        description:
            'How long Kivel resources last: the one-hour default, ttlSeconds, renewal up to your plan’s maximum retention, persistent paid leases and cleanup.',
        updatedAt,
        sections: [
            {
                id: 'overview',
                title: 'How long resources last',
                paragraphs: [
                    'Every webhook inbox, mock API, file and mock MCP server has an expiry time, returned as expiresAt. Resources last one hour by default. You can choose a different lifetime at creation, renew a resource later within your plan’s maximum retention, or on a paid plan make it persistent for the subscription period.',
                    'When a resource expires it stops working immediately. Cleanup deletes its data and releases quota at least once per minute. Expired resources cannot be renewed or restored.',
                ],
                table: {
                    caption: 'Maximum retention from creation',
                    headers: ['Plan', 'Maximum retention'],
                    rows: [
                        ['Without an account', '1 hour'],
                        ['Free', '7 days'],
                        ['Pro', '30 days'],
                        ['Team', '90 days'],
                    ],
                },
            },
            {
                id: 'creation',
                title: 'Set a lifetime at creation',
                paragraphs: [
                    'Add ttlSeconds to the creation query string: an integer from 60 to your plan’s maximum retention in seconds. Values outside that range return 400 with the allowed range.',
                ],
                code: {
                    title: 'Create a mock for one day',
                    value: `curl -X POST 'https://kivel.io/api/mocks?ttlSeconds=86400' \\
  -H "Authorization: Bearer $KIVEL_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Status","routes":[{"method":"GET","path":"/status","status":200,"body":"{\\"ok\\":true}"}]}'`,
                },
            },
            {
                id: 'renew',
                title: 'Renew a resource',
                paragraphs: [
                    'POST /api/{kind}/{id}/renew, where kind is inboxes, mocks, files or mcp-servers. Renewal sets expiresAt to the creation time plus the caller’s maximum retention; it does not add a fixed amount from now. The response is {"id","expiresAt","persistent"}.',
                    'If that time has already passed, renewal returns 409: "This resource has reached its maximum lifetime. Create a new resource." It also returns 409 if the current expiry is later than the current plan allows, in which case the resource keeps its existing expiry.',
                ],
                code: {
                    title: 'Renew an inbox',
                    value: `curl -X POST https://kivel.io/api/inboxes/INBOX_ID/renew \\
  -H "Authorization: Bearer $KIVEL_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{"persistent":false}'

{"id":"INBOX_ID","expiresAt":"2026-10-28T12:00:00.000Z","persistent":false}`,
                },
            },
            {
                id: 'persistent',
                title: 'Persistent leases',
                paragraphs: [
                    'On an active paid plan, send persistent=true at creation or {"persistent":true} on renewal. A persistent resource expires 24 hours after the end of the current subscription period, and successful billing renewals extend live leases. Cancelling stops the extensions. Without an active paid plan, persistent returns 403.',
                ],
                note: 'Pro and Team, the plans that include persistent leases, are not currently sold. Check /pricing/ for availability.',
            },
            {
                id: 'delete',
                title: 'Delete early',
                paragraphs: [
                    'Delete resources you no longer need with DELETE /api/{kind}/{id}. Deletion is immediate and frees the resource slot and storage. Lifecycle events keep metadata (not payloads) for 30 days.',
                ],
            },
        ],
        faqs: [
            {
                question: 'Can I keep an anonymous resource longer than one hour?',
                answer: 'Not with anonymous credentials: the anonymous maximum is one hour from creation. Renewal uses the caller’s plan, so create resources with an account key when you need longer retention.',
            },
            {
                question: 'Why did renewal return 409?',
                answer: 'Either the resource has reached its maximum lifetime for your plan, or its current expiry is already later than your current plan allows. Create a new resource in the first case; in the second the resource keeps its existing expiry.',
            },
            {
                question: 'Can I recover an expired resource?',
                answer: 'No. Expired resources stop working immediately and their data is deleted during cleanup. Keep an independent copy of anything important.',
            },
            {
                question: 'What does persistent mean?',
                answer: 'A lease tied to a paid subscription. The resource lives through the current billing period plus 24 hours and is extended by successful renewals.',
            },
        ],
        related: [
            { title: 'Plans and limits', href: '/pricing/' },
            { title: 'Limits and errors', href: '/docs/limits-and-errors/' },
            { title: 'Privacy and data handling', href: '/privacy/' },
        ],
    },
    {
        slug: 'tools-api',
        title: 'Run browser utilities through the API',
        navTitle: 'Utilities API',
        group: 'Interfaces',
        description:
            'Run Kivel utilities over HTTP with POST /api/tools/{id}/run: find tool IDs with GET /api/tools, pass input, options and files, and read the output.',
        updatedAt,
        sections: [
            {
                id: 'overview',
                title: 'Hosted execution of the same utilities',
                paragraphs: [
                    'Most Kivel utilities (formatters, encoders, generators, converters, image and PDF operations, media processors, email inspectors and network checks) can run on the server through one endpoint: POST /api/tools/{id}/run. Use it from scripts, CI jobs and agents when you cannot open the browser tool.',
                    'On the website, browser-local tools process input on your device. Through the API, SDK, CLI, SSH or MCP, your input is sent to a bounded server worker. Inputs and results are not stored as execution history.',
                ],
            },
            {
                id: 'discover',
                title: 'Find tool IDs and options',
                paragraphs: [
                    'GET /api/tools lists every catalog tool, including planned ones. Each entry has id, name, description, categoryId, status, page and interfaces. execution is the run path for executable tools and null otherwise, and guide describes accepted input and options.',
                    'GET /api/tools/{id} returns one tool with its guide: whether it accepts text or files, option keys with labels, defaults, choices and bounds, an input example and any limits.',
                ],
                code: {
                    title: 'Describe the JSON tool',
                    value: `curl https://kivel.io/api/tools/json

{
  "id": "json",
  "name": "JSON formatter",
  "status": "available",
  "page": "/tools/json-formatter/",
  "execution": "/api/tools/json/run",
  "guide": {
    "action": "Format JSON",
    "acceptsText": true,
    "acceptsFile": false,
    "multipleFiles": false,
    "inputExample": "{\\"ready\\":true}",
    "options": [{ "key": "action", "label": "Action", "defaultValue": "format",
                  "choices": [["format", "Format"], ["minify", "Minify"]] }],
    ...
  },
  ...
}`,
                },
            },
            {
                id: 'run',
                title: 'Run a tool',
                paragraphs: [
                    'The body is a JSON object with up to three fields. Any other field returns 400.',
                ],
                table: {
                    caption: 'Run request body',
                    headers: ['Field', 'Type', 'Rules'],
                    rows: [
                        [
                            'input',
                            'string',
                            'Text input, within your plan’s input allowance (64 KiB anonymously)',
                        ],
                        [
                            'options',
                            'object of strings',
                            'Only option keys the tool supports; numbers are sent as strings, for example "2"',
                        ],
                        [
                            'file',
                            'object or array',
                            '{name, base64} with canonical Base64 for file tools; an array of 1 to 20 for everyday-merge-pdfs and everyday-image-to-pdf',
                        ],
                    ],
                },
                code: {
                    title: 'Text and file runs',
                    value: `curl https://kivel.io/api/tools/uuid/run \\
  -H "Authorization: Bearer $KIVEL_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{"options":{"count":"2"}}'

curl https://kivel.io/api/tools/everyday-file-checksums/run \\
  -H 'Content-Type: application/json' \\
  -d '{"file":{"name":"hello.txt","base64":"aGVsbG8="}}'

# 200 OK
{"toolId":"everyday-file-checksums","output":"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
 "usage":{"used":1,"limit":100,"resetsAt":"2026-10-28T00:00:00.000Z"}}`,
                },
            },
            {
                id: 'output',
                title: 'Read the output',
                paragraphs: [
                    'A successful run returns toolId, output and usage. output is always a string. Tools that produce a file return a JSON string with kind "file", filename, mediaType, bytes and base64. Generated files are limited to 5 MiB.',
                    'usage reports runs used today, the daily limit and resetsAt (00:00 UTC). Execution requires the tools:run scope when you use an API key.',
                ],
            },
            {
                id: 'limits',
                title: 'Execution limits',
                list: [
                    'Request body up to 16 MiB; files up to 10 MiB each and 10 MiB combined.',
                    'Daily hosted runs per plan: 100 anonymously, 1,000 on Free. The limit returns 429 with Retry-After until 00:00 UTC.',
                    'Busy processors return 503 with Retry-After: 2; a run that times out returns 408.',
                    'Audio and video tools accept files up to 10 MiB and 120 seconds, produce at most 5 MiB and stop after 20 seconds.',
                    'Network tools only contact public addresses. Ordinary checks stop after ten seconds. API scenarios allow up to six sequential requests, three seconds each and twenty seconds overall, with no redirects.',
                ],
                paragraphs: [],
            },
        ],
        faqs: [
            {
                question: 'How do I find the ID of a tool?',
                answer: 'Call GET /api/tools and use the id of an entry whose execution field is not null. The tool page URL is in page, and GET /api/tools/{id} returns the options it accepts.',
            },
            {
                question: 'Why does my options object return 400?',
                answer: 'Options must be an object of string values using keys the tool supports. Send numbers and booleans as strings, for example {"count":"2"}, and check the keys in the tool’s guide.',
            },
            {
                question: 'Is my input stored when I run a tool through the API?',
                answer: 'No execution history is kept. Input is sent to the server and processed in a bounded worker, and neither input nor result is retained.',
            },
            {
                question: 'Can I merge several PDFs in one request?',
                answer: 'Yes. Send file as an array of 1 to 20 {name, base64} objects to everyday-merge-pdfs or everyday-image-to-pdf. The order of the array is the order of the result.',
            },
        ],
        related: [
            { title: 'JSON formatter', href: '/tools/json-formatter/' },
            { title: 'Limits and errors', href: '/docs/limits-and-errors/' },
            { title: 'Command line', href: '/docs/cli/' },
            { title: 'TypeScript SDK', href: '/docs/sdk/' },
            { title: 'API reference', href: '/docs/reference/' },
        ],
    },
    {
        slug: 'cli',
        title: 'kivel command line interface',
        navTitle: 'CLI',
        group: 'Interfaces',
        description:
            'Use the kivel CLI to run utilities from a pipe, create webhook inboxes, upload and download files, and call any /api/ endpoint with JSON output.',
        updatedAt: '2026-10-30',
        sections: [
            {
                id: 'overview',
                title: 'What the CLI is for',
                paragraphs: [
                    'kivel is a small command line client for shell scripts and CI. It reads input from standard input, prints JSON to standard output, writes errors as JSON to standard error and exits with a nonzero code on failure. It is built on the TypeScript SDK.',
                    'The CLI is published as @kivel.io/cli. Install it with npm install --global @kivel.io/cli, or run npx --package=@kivel.io/cli kivel --help. It installs the matching SDK automatically. In the repository you can also use pnpm cli instead of kivel.',
                ],
            },
            {
                id: 'configure',
                title: 'Configure',
                paragraphs: [
                    'The CLI reads three environment variables. Without an API key it works anonymously.',
                ],
                table: {
                    caption: 'Environment variables',
                    headers: ['Variable', 'Purpose'],
                    rows: [
                        ['KIVEL_URL', 'API origin; defaults to https://kivel.io'],
                        ['KIVEL_API_KEY', 'Workspace API key sent as a Bearer token'],
                        [
                            'KIVEL_ACCESS_TOKEN',
                            'Access token used by download when --access-token is not given',
                        ],
                    ],
                },
            },
            {
                id: 'commands',
                title: 'Commands',
                paragraphs: [
                    'Webhook, mock and file creation accepts --ttl-seconds and --persistent. Email uses --active-days (1–7, default 3) and an optional paid --local-part. Webhooks, mocks, mock MCP servers and files default to private visibility. Email addresses accept incoming mail publicly; reading mail always requires management access. Agent login/trial commands use their own fixed expiry rules.',
                ],
                table: {
                    caption: 'kivel commands',
                    headers: ['Command', 'What it does'],
                    rows: [
                        ['kivel tools', 'List tools (GET /api/tools)'],
                        ['kivel describe <tool-id>', 'Show one tool and its options'],
                        ['kivel usage', 'Show your plan, limits and runs today'],
                        ['kivel resources', 'List workspace resources (needs an API key)'],
                        [
                            'kivel agent login <name> / agent token',
                            'Start device login, then pipe {"deviceCode":"…"} to agent token after browser approval; save the returned key privately',
                        ],
                        [
                            'kivel agent trial <name>',
                            'Start a 72-hour anonymous-limit trial; --human-email optionally notifies the human',
                        ],
                        [
                            'kivel credential save / list / inspect / reveal',
                            'Save from JSON stdin, read metadata, then reveal with an approved --approval-id',
                        ],
                        [
                            'kivel email create / messages <id> / wait <id>',
                            'Owned mail; email list reopens addresses and email forward reads a webhook URL from stdin; waits accept --after and --timeout-seconds',
                        ],
                        [
                            'kivel email threads / thread / draft-create / draft-submit',
                            'Read conversations, save a draft from JSON, then send or request approval with an optional sendAt',
                        ],
                        [
                            'kivel memory set|get|delete <namespace> <key>',
                            'Pipe a JSON value to set; memory list <namespace> accepts --prefix',
                        ],
                        [
                            'kivel monitor create|list|inspect|pause|resume|delete [id]',
                            'Pipe monitor settings as JSON to create',
                        ],
                        [
                            'kivel monitor ping|fail <ping-token>',
                            'Report job success or failure using the secret from pingUrl',
                        ],
                        [
                            'kivel approval ask|list|pending|inspect|wait [id]',
                            'Pipe question/options as JSON to ask; only the signed-in human can answer',
                        ],
                        [
                            'kivel inbox requests|wait|response|forward|deliveries <id>',
                            'Read requests, wait, pipe response/forward settings as JSON, or inspect delivery attempts',
                        ],
                        [
                            'kivel mock create|update|calls|reset [id]',
                            'Pipe mock configuration as JSON to create/update',
                        ],
                        ['kivel mcp-server create', 'Pipe a mock MCP configuration as JSON'],
                        [
                            'kivel inbox|email|mock|mcp-server|file inspect|delete|renew <id>',
                            'Shared lifecycle commands; --token for anonymous management, --persistent on renew for paid leases',
                        ],
                        [
                            'kivel run <tool-id> [--options JSON] [--file <name>]',
                            'Run a utility with standard input as text, or as file bytes with --file',
                        ],
                        [
                            'kivel inbox create [--visibility private|public]',
                            'Create a webhook inbox',
                        ],
                        [
                            'kivel upload <filename> [--visibility ...] [--max-downloads n]',
                            'Upload standard input as a file',
                        ],
                        [
                            'kivel download <file-id> [--access-token token]',
                            'Write file bytes to standard output',
                        ],
                        [
                            'kivel api <METHOD> /api/path [--token <resource-token>]',
                            'Call any /api/ endpoint with standard input as the JSON body',
                        ],
                    ],
                },
                code: {
                    title: 'Examples',
                    value: `export KIVEL_API_KEY='kv_...'

printf '{"hello":true}' | kivel run json --options '{"action":"minify"}'
kivel run everyday-file-checksums --file report.pdf < report.pdf

kivel inbox create
kivel upload report.txt --max-downloads 1 < report.txt
kivel download FILE_ID --access-token "$ACCESS_TOKEN" > report.txt

kivel api GET /api/inboxes/INBOX_ID/requests --token "$INSPECTION_TOKEN"
kivel api DELETE /api/mocks/MOCK_ID --token "$MANAGEMENT_TOKEN"`,
                },
            },
            {
                id: 'behaviour',
                title: 'Output and errors',
                list: [
                    'Results print as indented JSON; download prints raw bytes; help prints plain text.',
                    'Errors print {"error", "status", "requestId", "retryAfter"} to standard error and exit with code 1.',
                    'Standard input is limited to 10 MiB. Requests time out after 90 seconds.',
                    'Mutations are never retried automatically.',
                    'The api command accepts GET, HEAD, OPTIONS, POST, PUT, PATCH and DELETE. It sends --token in X-Resource-Token for /api/ paths, or X-Access-Token for /mock/ callers, alongside any workspace key.',
                ],
                paragraphs: [],
            },
        ],
        faqs: [
            {
                question: 'How do I install the kivel CLI?',
                answer: 'Install npm install --global @kivel.io/cli, or use npx --package=@kivel.io/cli kivel --help without a global installation. The CLI requires Node.js 22.13+. Use the scoped package name @kivel.io/cli; the executable is named kivel.',
            },
            {
                question: 'How do I run a multi-file tool such as PDF merging from the CLI?',
                answer: 'Use the api command: pipe a JSON body with a file array to kivel api POST /api/tools/everyday-merge-pdfs/run.',
            },
            {
                question: 'How do I point the CLI at a self-hosted installation?',
                answer: 'Set KIVEL_URL to its origin. Remote origins must use HTTPS; plain HTTP is allowed only for localhost.',
            },
        ],
        related: [
            { title: 'TypeScript SDK', href: '/docs/sdk/' },
            { title: 'SSH gateway', href: '/docs/ssh/' },
            { title: 'Utilities API', href: '/docs/tools-api/' },
            { title: 'Integrations', href: '/integrations/' },
        ],
    },
    {
        slug: 'sdk',
        title: 'TypeScript SDK for Kivel',
        navTitle: 'TypeScript SDK',
        group: 'Interfaces',
        description:
            'Use the @kivel.io/sdk TypeScript client to run utilities, create inboxes, mocks, files and mock MCP servers, change sharing, renew and handle typed errors.',
        updatedAt: '2026-10-30',
        sections: [
            {
                id: 'overview',
                title: 'What the SDK covers',
                paragraphs: [
                    '@kivel.io/sdk is a small, dependency-free TypeScript client for the Kivel HTTP API. It works in Node.js and any runtime with fetch. Use it when you want typed methods for utilities and resources instead of building requests by hand.',
                    'Install the SDK with npm install @kivel.io/sdk. The ESM package includes JavaScript and TypeScript declarations, requires Node.js 22.13+ and uses import rather than CommonJS require. Pin an exact version for reproducible builds.',
                ],
            },
            {
                id: 'setup',
                title: 'Create a client',
                paragraphs: [
                    'All options are optional. baseUrl defaults to https://kivel.io and must be an origin; remote origins must use HTTPS. timeoutMs defaults to 25000. You can pass your own fetch implementation.',
                ],
                code: {
                    title: 'Client setup and a first call',
                    value: `import { Kivel, KivelError } from '@kivel.io/sdk';

const kivel = new Kivel({
  apiKey: process.env.KIVEL_API_KEY,
});

const result = await kivel.run('json', '{"hello":true}', { action: 'format' });
console.log(result.output, result.usage.used);`,
                },
            },
            {
                id: 'methods',
                title: 'Methods',
                paragraphs: [
                    'Most resource creation methods default to private visibility. Webhook receivers are public by default, and OAuth test endpoints are always public while their management and logs stay private. Methods that take a token send it in X-Resource-Token, so they work alongside an API key.',
                ],
                table: {
                    caption: 'Kivel methods',
                    headers: ['Method', 'Request'],
                    rows: [
                        [
                            'createOAuthProvider(config, settings?)',
                            'Create an OAuth test issuer and receive its client secret once.',
                        ],
                        [
                            'oauthProvider(id), oauthProviders(), updateOAuthProvider(id, config), deleteOAuthProvider(id)',
                            'Inspect, list, configure and delete workspace test providers.',
                        ],
                        ['tools()', 'GET /api/tools'],
                        ['tool(id)', 'GET /api/tools/{id}'],
                        ['run(toolId, input?, options?, file?)', 'POST /api/tools/{id}/run'],
                        ['usage()', 'GET /api/usage'],
                        [
                            'plans() / activity() / agents()',
                            'Read plan limits, MCP activity and workspace agents',
                        ],
                        [
                            'startLogin(name, client?) / finishLogin(deviceCode)',
                            'Device login; approved keys are delivered once. Approval remains in the human browser',
                        ],
                        [
                            'startTrial(name, humanEmail?, client?)',
                            '72-hour trial with anonymous limits and a human claim link',
                        ],
                        [
                            'saveCredential(input) / credentials() / revealCredential(id, approvalId?)',
                            'Save credentials, read metadata and reveal once after human approval',
                        ],
                        [
                            'createEmailInbox(settings?) / emailInbox(id, token?) / emails(id, token?)',
                            'Owned email creation, metadata and messages',
                        ],
                        [
                            'emailThreads(id?, settings?) / emailThread(id, threadId)',
                            'List inbox or workspace conversations with cursor pagination and read a full thread',
                        ],
                        [
                            'createEmailDraft(id, content) / submitEmailDraft(id, settings?)',
                            'Save a draft and submit it directly or for human approval, with an optional sendAt',
                        ],
                        [
                            'waitForEmail(id, options)',
                            'Long-poll for messages, extracted codes and links',
                        ],
                        [
                            'memorySet(namespace, key, value, ttlSeconds?)',
                            'Save a JSON value within workspace memory limits',
                        ],
                        [
                            'memoryGet<T>(namespace, key) / memoryList(namespace, prefix?) / memoryDelete(namespace, key)',
                            'Read, list metadata and delete workspace memory',
                        ],
                        [
                            'createMonitor(settings) / monitors() / monitor(id)',
                            'Create and inspect HTTP, SSL or heartbeat monitors',
                        ],
                        [
                            'pingMonitor(token, failed?)',
                            'Report a job success or failure using the secret token from pingUrl',
                        ],
                        [
                            'pauseMonitor(id, paused?) / deleteMonitor(id)',
                            'Pause, resume or remove a monitor',
                        ],
                        [
                            'askHuman({question, options?, details?, timeoutMinutes?})',
                            'Ask the human; answerUrl is safe to show them',
                        ],
                        [
                            'approvals(pendingOnly?) / approval(id) / waitForApproval(id, timeoutSeconds?)',
                            'Read questions and wait; a timeout never means approval',
                        ],
                        [
                            'stream(topics, {token?, lastEventId?, signal?})',
                            'Read live change notices and resume using the previous cursor. Fetch full records separately.',
                        ],
                        [
                            'waitForRequests(id, {token?, after?, timeoutSeconds?})',
                            'Long-poll for webhook captures',
                        ],
                        [
                            'setInboxResponse(id, settingsOrNull, token?) / setInboxForward(id, urlOrNull, token?)',
                            'Configure responses or paid forwarding; null restores defaults',
                        ],
                        [
                            'inboxDeliveries(id, token?) / mockCalls(id, token?)',
                            'Read recent forwarding attempts and mock calls',
                        ],
                        [
                            'inspectResource(kind, id, token?) / updateMock(id, config, token?) / resetMock(id, token?)',
                            'Resource metadata, mock configuration and CRUD reset',
                        ],
                        ['resources()', 'GET /api/account/resources'],
                        ['createInbox(settings?)', 'POST /api/inboxes'],
                        ['inspectInbox(id, token?)', 'GET /api/inboxes/{id}/requests'],
                        ['createMock(config, settings?)', 'POST /api/mocks'],
                        ['createMcpServer(config, settings?)', 'POST /api/mcp-servers'],
                        ['upload(name, bytes, settings?)', 'POST /api/files'],
                        ['downloadFile(id, accessToken?)', 'GET /files/{id}, returns Uint8Array'],
                        ['sharing(kind, id, visibility, token?)', 'POST /api/{kind}/{id}/sharing'],
                        ['renew(kind, id, { persistent }?, token?)', 'POST /api/{kind}/{id}/renew'],
                        ['remove(kind, id, token?)', 'DELETE /api/{kind}/{id}'],
                        [
                            'request(method, path, body?, token?, headers?)',
                            'Relative /api/ or /mock/ paths; HEAD succeeds without a JSON body',
                        ],
                    ],
                },
            },
            {
                id: 'resources',
                title: 'Work with resources',
                paragraphs: [
                    'Webhook, mock, mock MCP and file settings accept ttlSeconds, persistent and visibility; upload also accepts maxDownloads. Email requires an account and accepts activeDays (1–7, default 3) on Free, or an optional paid localPart. Free allows one active inbox; Pro 10 and Team 50 addresses that stay active while subscribed. emailInboxes() lists owned addresses; emailForwarding(id, url) configures a public webhook. inspectResource reads metadata. Use request() for other /api/ operations and /mock/ caller requests; its token is a caller access token for /mock/ paths.',
                ],
                code: {
                    title: 'Inbox and file lifecycle',
                    value: `const inbox = await kivel.createInbox({ ttlSeconds: 1800 });
// inbox.webhookUrl, inbox.accessToken; manage with your API key

const history = await kivel.inspectInbox(inbox.id);

const file = await kivel.upload('report.txt', new TextEncoder().encode('hello'), {
  maxDownloads: 1,
});
const bytes = await kivel.downloadFile(file.id, file.accessToken);

const mock = await kivel.inspectResource('mocks', 'MOCK_ID');
await kivel.remove('inboxes', inbox.id);`,
                },
            },
            {
                id: 'errors',
                title: 'Errors',
                paragraphs: [
                    'Failed requests throw KivelError with message, status, requestId (from X-Request-Id) and retryAfter (from Retry-After, in seconds). The SDK does not retry requests itself and does not follow redirects.',
                ],
                code: {
                    title: 'Handle a rate limit',
                    value: `try {
  await kivel.run('json', input);
} catch (error) {
  if (error instanceof KivelError && error.status === 429 && error.retryAfter) {
    // wait error.retryAfter seconds, then try again
  }
  throw error;
}`,
                },
            },
        ],
        faqs: [
            {
                question: 'Is the SDK on npm?',
                answer: 'Yes. Install @kivel.io/sdk, or pin an exact version. It includes TypeScript declarations.',
            },
            {
                question: 'Does the SDK create public resources?',
                answer: 'Most resource creation and upload methods default to private visibility. Webhook receivers default to public and OAuth test endpoints stay public; inspection and management remain private.',
            },
            {
                question: 'How do I pass files to run()?',
                answer: 'Pass { name, base64 } as the fourth argument, or an array of them for everyday-merge-pdfs and everyday-image-to-pdf. The Base64 must be canonical.',
            },
        ],
        related: [
            { title: 'Command line', href: '/docs/cli/' },
            { title: 'Authentication and API keys', href: '/docs/authentication/' },
            { title: 'Limits and errors', href: '/docs/limits-and-errors/' },
            { title: 'Integrations', href: '/integrations/' },
        ],
    },
    {
        slug: 'ssh',
        title: 'SSH gateway for kivel commands',
        navTitle: 'SSH gateway',
        group: 'Interfaces',
        description:
            'Run kivel CLI commands over SSH with your API key as the password. No shell, forwarding, SCP or SFTP: one command per session with JSON output.',
        updatedAt: '2026-10-30',
        sections: [
            {
                id: 'overview',
                title: 'What the SSH gateway does',
                paragraphs: [
                    'The SSH gateway runs the same commands as the kivel CLI on the server, so you can use Kivel from any machine with an SSH client and no Node.js. It is an optional component that an operator enables; the Docker setup binds it to localhost:2222 by default and exposing it publicly is an operator decision.',
                    'Each connection runs one command. There is no interactive shell, no terminal, no port forwarding, no SCP and no SFTP.',
                ],
            },
            {
                id: 'connect',
                title: 'Connect',
                paragraphs: [
                    'Log in as user kivel with a workspace API key (kv_...) as the password. Commands must start with kivel. Pipe JSON to memory set, monitor create, approval ask, mock creation and other commands with a body; pipe bytes to upload or run --file. Use -n for read-only commands. The local CLI listen command is not offered over SSH.',
                ],
                code: {
                    title: 'Run commands over SSH',
                    value: `# Verify the host fingerprint before the first connection.
printf '{"hello":true}' | ssh -T -p 2222 kivel@your-host kivel run json
ssh -T -n -p 2222 kivel@your-host kivel resources
ssh -T -n -p 2222 kivel@your-host kivel inbox create --visibility public`,
                },
                note: 'The gateway logs its SHA256 host key fingerprint at startup. Compare it with the fingerprint your SSH client shows before you send your API key.',
            },
            {
                id: 'limits',
                title: 'Session limits',
                list: [
                    'Authentication: password only, user kivel, up to 4 attempts per connection and 10 per 15 minutes per IP address.',
                    'One command per session; send it within 10 seconds of opening the session.',
                    'Commands stop after 30 seconds; a connection closes after 120 seconds.',
                    'Standard input up to 10 MiB.',
                    'Up to 4 connections per IP address.',
                    'The API key is checked again for every request, so a revoked key stops working immediately.',
                ],
                paragraphs: [
                    'Output is compact JSON on standard output; errors are JSON on standard error with exit status 1. Plan allowances and scopes are the same as for HTTP.',
                ],
            },
        ],
        faqs: [
            {
                question: 'Can I open an interactive shell?',
                answer: 'No. The gateway rejects shell, terminal and subsystem requests, so SCP and SFTP do not work either. Each session runs one kivel command.',
            },
            {
                question: 'Which commands are available over SSH?',
                answer: 'The shared CLI commands cover utilities, email, webhooks, memory, monitors, human questions, mock APIs, mock MCP servers and file lifecycle. The continuous listen command runs locally in the CLI only. SSH requires a workspace key; human approvals and billing stay in the browser.',
            },
            {
                question: 'Is the SSH gateway available on every installation?',
                answer: 'Only where the operator has enabled and exposed it. Self-hosted Docker installs bind it to localhost:2222 by default, and setting SSH_PORT=0 disables it.',
            },
        ],
        related: [
            { title: 'Command line', href: '/docs/cli/' },
            { title: 'Authentication and API keys', href: '/docs/authentication/' },
            { title: 'Integrations', href: '/integrations/' },
        ],
    },
    {
        slug: 'mcp',
        title: 'MCP endpoint for AI agents',
        navTitle: 'MCP for agents',
        group: 'Interfaces',
        description:
            'Connect an AI agent to the Kivel MCP endpoint at /mcp to run utilities and manage webhook inboxes, mock APIs, files and mock MCP servers over HTTP.',
        updatedAt: '2026-10-30',
        sections: [
            {
                id: 'overview',
                title: 'What the platform MCP endpoint does',
                paragraphs: [
                    'https://kivel.io/mcp is a Model Context Protocol server that gives an agent the same capabilities as the HTTP API: run any executable utility, and create, inspect, renew, share and delete temporary resources. It shares permissions and quotas with HTTP, so an agent using your API key works within your workspace plan.',
                    'This endpoint is different from a mock MCP server. The platform endpoint exposes Kivel itself; a mock MCP server at /mcp/mock/{id} returns tools and responses you configure.',
                ],
            },
            {
                id: 'connect',
                title: 'Connect a client',
                paragraphs: [
                    'Configure your client for Streamable HTTP with the URL https://kivel.io/mcp. Add Authorization: Bearer with an API key to use your workspace; without it the agent works anonymously. Initialize before calling tools.',
                    'Requests are POST with Accept: application/json, text/event-stream. Responses are plain JSON. GET returns 405 because SSE streams and transport sessions are not provided. Supported protocol versions are 2025-11-25, 2025-06-18 and 2025-03-26. Platform request bodies can be up to 16 MiB, including Base64 file input, with four concurrent requests admitted before body parsing. Individual file limits still apply.',
                ],
                code: {
                    title: 'Call run_tool',
                    value: `curl https://kivel.io/mcp \\
  -H "Authorization: Bearer $KIVEL_API_KEY" \\
  -H 'Accept: application/json, text/event-stream' \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
    "name":"run_tool",
    "arguments":{"toolId":"json","input":"{\\"hello\\":true}"}
  }}'`,
                },
            },
            {
                id: 'tools',
                title: 'Available tools',
                paragraphs: [
                    'tools/list returns these tools with input schemas and annotations. Tool results are text content containing JSON.',
                ],
                table: {
                    caption: 'Platform MCP tools',
                    headers: ['Tool', 'Purpose'],
                    rows: [
                        [
                            'search_tools',
                            'Find executable utilities by keyword; preferred over listing the full catalog',
                        ],
                        ['list_tools', 'List executable utility IDs'],
                        ['describe_tool', 'Options, defaults, limits and examples for one tool ID'],
                        [
                            'run_tool',
                            'Run a utility with toolId, input, options and file or files (1 to 20)',
                        ],
                        ['create_webhook_inbox', 'Create an inbox; optional visibility'],
                        ['inspect_webhook_inbox', 'Read inbox details and captured requests'],
                        [
                            'wait_for_webhook',
                            'Wait for new requests; after is the last request ID seen',
                        ],
                        [
                            'set_webhook_response',
                            'Configure status, body, content type, headers and delay; reset restores defaults',
                        ],
                        ['delete_webhook_inbox', 'Delete an inbox and its history'],
                        [
                            'start_login / finish_login / start_trial',
                            'Connect through human approval, or start a capped trial',
                        ],
                        [
                            'save_credential / list_credentials / reveal_credential / generate_password',
                            'Encrypted account credentials with one human approval per reveal by default',
                        ],
                        [
                            'create_email_inbox / list_emails / wait_for_email',
                            'Receive email with extracted codes and links',
                        ],
                        [
                            'list_email_threads / get_email_thread',
                            'List conversations in one inbox or across the workspace and read a full thread',
                        ],
                        [
                            'email_draft / email_inbox_rules',
                            'Save drafts, submit for approval or schedule delivery, and read inbox address rules',
                        ],
                        [
                            'memory_set / memory_get / memory_list / memory_delete',
                            'Workspace-scoped JSON memory',
                        ],
                        [
                            'create_monitor / list_monitors / inspect_monitor / pause_monitor / ping_monitor / delete_monitor',
                            'Manage uptime, SSL and heartbeat checks',
                        ],
                        [
                            'ask_human / wait_for_approval',
                            'Ask and wait; answering stays in the human browser',
                        ],
                        [
                            'workspace_status',
                            'Read agents, activity, plan limits, usage or human questions',
                        ],
                        ['create_mock_api', 'Create a mock API from name and routes'],
                        [
                            'call_mock_api',
                            'Call a mock route or mutate CRUD data with caller access',
                        ],
                        ['inspect_mock_api', 'Read a mock configuration and usage'],
                        ['delete_mock_api', 'Delete a mock API'],
                        [
                            'upload_temporary_file',
                            'Upload a file up to 64 KiB as Base64; HTTP/SDK/CLI support larger files',
                        ],
                        ['inspect_temporary_file', 'Read file metadata and remaining downloads'],
                        [
                            'download_temporary_file',
                            'Download a file up to 64 KiB as Base64; uses one download',
                        ],
                        ['delete_temporary_file', 'Delete a file'],
                        [
                            'resource_request',
                            'Manage supported resource lifecycle operations; create webhooks, email inboxes, mocks and mock MCP servers; read calls/deliveries and configure webhook response/forwarding',
                        ],
                    ],
                },
            },
            {
                id: 'credentials',
                title: 'Credentials inside tool calls',
                paragraphs: [
                    'The inspect_*, delete_* and wait tools take a resource id. Anonymous resources also require the inspection or management token returned at creation. Resources owned by the authenticated workspace do not need a separate management token. download_temporary_file takes the private access token as accessToken, separate from the management token.',
                    'resource_request takes kind (inboxes, mocks, files, mcp-servers or email-inboxes), action (create, inspect, update, delete, renew, sharing, list, reset, calls, response, forward or deliveries), and optionally id, token, config, ttlSeconds, persistent and visibility. It calls the same HTTP endpoints, so its results match the HTTP responses. Email supports create (config.activeDays and paid config.localPart), inspect, delete, paid renew and forward (config.url or null). Free inboxes cannot be renewed. Messages require workspace access; existing anonymous inboxes can expire naturally. response and forward accept config; config.reset=true restores defaults. update, calls and reset apply to mocks; response, forward and deliveries apply to webhooks.',
                ],
                note: 'Tool results can contain new tokens. Agents should keep management and inspection tokens private and pass only access tokens to the systems that need them.',
            },
            {
                id: 'errors',
                title: 'Errors',
                paragraphs: [
                    'Invalid arguments return a JSON-RPC error with code -32602, and unknown methods return -32601. Quota, permission and resource failures return a tool result with isError: true and an error message. Some failures also include an HTTP status or request ID; clients must not require those fields on every error.',
                ],
            },
        ],
        faqs: [
            {
                question: 'What is the Kivel MCP server URL?',
                answer: 'https://kivel.io/mcp, using Streamable HTTP. Send Authorization: Bearer with an API key to use your workspace allowances.',
            },
            {
                question: 'Can an agent use Kivel MCP without an account?',
                answer: 'Yes. Without Authorization it works with anonymous allowances, and resources it creates are managed with the tokens returned in the tool results.',
            },
            {
                question: 'Why does my MCP client get 406 or 405?',
                answer: '406 means the Accept header does not include both application/json and text/event-stream. 405 means the client sent GET to open an SSE stream, which this endpoint does not provide.',
            },
            {
                question: 'How does an agent discover which utilities it can run?',
                answer: 'Use search_tools with query to find relevant utilities, then describe_tool for options, defaults and limits before run_tool. list_tools returns the full executable list when needed.',
            },
        ],
        related: [
            { title: 'Kivel MCP', href: '/tools/kivel-mcp/' },
            { title: 'Mock MCP servers', href: '/docs/mock-mcp-servers/' },
            { title: 'Utilities API', href: '/docs/tools-api/' },
            { title: 'Integrations', href: '/integrations/' },
        ],
    },
];
