import { toolboxComparisons } from './toolbox-comparisons';

export interface Comparison {
    slug: string;
    name: string;
    focus: string;
    description: string;
    summary: string;
    socketFit: string;
    otherFit: string;
    rows: { topic: string; socket: string; other: string }[];
    limitations: string;
    sources: { title: string; url: string }[];
    tools: { title: string; href: string }[];
    /** ISO date the competitor facts were last checked against official sources. */
    reviewedAt: string;
    /** Short "choose this when" bullets, 3 to 5 each. */
    bestFor: { socket: string[]; other: string[] };
    /** 3 to 6 plain questions people search for, answered in 1 to 3 sentences. */
    faqs: { question: string; answer: string }[];
}
export const comparisons: Comparison[] = [
    ...toolboxComparisons,
    {
        slug: 'webhook-site',
        name: 'Webhook.site',
        focus: 'Webhook testing',
        description:
            'socket.help gives private, short-lived webhook inboxes next to other dev tools; Webhook.site adds email, custom responses, forwarding, and automation.',
        summary:
            'Both give a callback a temporary destination. socket.help inboxes are private by default and sit next to mocks, files, utilities, and MCP. Webhook.site adds email addresses, custom responses, and a larger automation platform.',
        socketFit:
            'Choose socket.help when a disposable inbox is one part of a development workflow: capture a callback, format its JSON, test a mock response, or let an MCP agent inspect the result.',
        otherFit:
            'Choose Webhook.site when you need a longer-lived URL, an email address, a custom response, or webhook forwarding, custom actions, and schedules. Its documentation covers automation beyond request inspection.',
        rows: [
            {
                topic: 'Main workflow',
                socket: 'Temporary testing resources and browser utilities in one toolbox.',
                other: 'Webhook and email inspection plus workflow automation and custom actions.',
            },
            {
                topic: 'Receiver and history access',
                socket: 'Private receiver by default; separate caller and inspection credentials. Public reception is an explicit choice.',
                other: 'Free history is accessible to people who know the URL ID. Paid account URLs are protected by login.',
            },
            {
                topic: 'Anonymous history',
                socket: 'One-hour starting lifetime; up to 100 requests or 1 MiB per inbox, 100 KiB per body.',
                other: 'Free URLs expire after seven days and accept up to 100 requests or emails, according to its FAQ.',
            },
            {
                topic: 'Response to the sender',
                socket: 'A fixed 200 response with a request ID. Use a separate mock API for custom responses.',
                other: 'The default response can be edited on free URLs.',
            },
            {
                topic: 'Related work',
                socket: 'Mock APIs, mock MCP servers, temporary file shares, local utilities, and platform MCP.',
                other: 'Forwarding, schedules, CSV export, and email workflows on paid plans.',
            },
        ],
        limitations:
            'socket.help does not currently forward requests, receive email, customize the inbox response, or run scheduled actions. Its one-hour anonymous lifetime (up to seven days with a free account) covers a test session and most delayed callbacks.',
        sources: [
            {
                title: 'Webhook.site FAQ: features, privacy, and retention',
                url: 'https://docs.webhook.site/',
            },
        ],
        tools: [
            { title: 'Webhook inbox', href: '/tools/webhook-inbox/' },
            { title: 'HMAC generator', href: '/tools/hmac-generator/' },
            { title: 'Webhook testing guide', href: '/blog/test-webhooks-without-a-server/' },
        ],
        reviewedAt: '2026-10-27',
        bestFor: {
            socket: [
                'You want captured payloads private unless you choose public access',
                'The test fits within an hour, or a day with a free account',
                'You also need a mock API, file share, or JSON formatter in the same session',
                'An MCP agent should create and read the inbox',
            ],
            other: [
                'A callback may arrive days later',
                'You need a temporary email address as well as a URL',
                'The sender expects a specific custom response',
                'You want forwarding, custom actions, or schedules',
            ],
        },
        faqs: [
            {
                question: 'Is Webhook.site free?',
                answer: 'Yes, Webhook.site has free URLs, which its FAQ says expire after seven days and accept up to 100 requests or emails. Forwarding, custom actions, and schedules are listed as subscription features.',
            },
            {
                question: 'Are Webhook.site requests private?',
                answer: 'Not on free URLs. Its FAQ says free URL data is accessible to anyone who knows the URL ID, while URLs on a paid subscription are protected with login.',
            },
            {
                question: 'What is a private alternative to Webhook.site for testing webhooks?',
                answer: 'socket.help creates inboxes that are private by default. Senders need an access token and reading history needs a separate inspection credential, so knowing the URL alone is not enough.',
            },
            {
                question: 'How long does a socket.help webhook inbox last?',
                answer: 'Anonymous inboxes start with a one-hour lifetime and hold up to 100 requests or 1 MiB. Free accounts can keep resources for up to seven days, with up to 1,000 requests or 10 MiB per inbox.',
            },
            {
                question: 'Can socket.help forward webhooks to localhost?',
                answer: 'No. socket.help captures requests for inspection; it does not forward them to another URL or to your machine.',
            },
        ],
    },
    {
        slug: 'mockoon',
        name: 'Mockoon',
        focus: 'API mocking',
        description:
            'socket.help hosts small, expiring mock APIs from the browser; Mockoon is a desktop and CLI mocking tool with templating, proxying, recording, and CRUD.',
        summary:
            'socket.help creates a small hosted mock API that expires. Mockoon is a dedicated, open source mocking environment that runs as a desktop application or headless through its CLI and Docker image.',
        socketFit:
            'Choose socket.help for a small disposable endpoint with predictable bodies, status codes, and delays that other people or CI can reach without installing anything, especially when you also need webhook inspection or file sharing.',
        otherFit:
            'Choose Mockoon for richer mock design and reusable environments, including Faker.js templating, response rules, CRUD routes, recording, proxying, and running mocks locally or through its CLI.',
        rows: [
            {
                topic: 'Authoring',
                socket: 'Browser editor for routes, methods, statuses, bodies, headers, and delays.',
                other: 'Desktop mock editor; the CLI runs the same mock definitions headless.',
            },
            {
                topic: 'Response behavior',
                socket: 'Up to 20 static routes with simple templates and conditions, plus one seeded CRUD collection with record editing and reset.',
                other: 'Templating helpers with Faker.js data, multiple responses with rules, CRUD routes, data buckets, and callbacks.',
            },
            {
                topic: 'OpenAPI',
                socket: 'Converts an OpenAPI 3.x JSON document into a static mock of up to 20 routes.',
                other: 'Imports and exports OpenAPI specifications.',
            },
            {
                topic: 'Where it runs',
                socket: 'Hosted on the socket.help installation with a public URL and private access by default.',
                other: 'Locally in the desktop app, or self-hosted with the CLI and Docker. Cloud deployments are a Pro feature.',
            },
            {
                topic: 'Reuse',
                socket: 'Resources start at one hour; configurations can be exported and imported as JSON.',
                other: 'Mock data files can be stored in a repository and reused with the CLI.',
            },
        ],
        limitations:
            'socket.help mocks do not proxy upstream requests, record traffic, generate Faker data, or support WebSockets. OpenAPI import accepts JSON only, with local references and up to 20 routes.',
        sources: [
            {
                title: 'Mockoon documentation and application scope',
                url: 'https://mockoon.com/docs/latest/about/',
            },
            { title: 'Mockoon download and features', url: 'https://mockoon.com/download/' },
            {
                title: 'Self-hosting with the Mockoon CLI',
                url: 'https://mockoon.com/tutorials/self-host-mock-api-server-cli/',
            },
            {
                title: 'Mockoon data files',
                url: 'https://mockoon.com/docs/latest/mockoon-data-files/data-files-location/',
            },
        ],
        tools: [
            { title: 'Mock REST API', href: '/tools/mock-rest-api/' },
            { title: 'OpenAPI to mock', href: '/tools/openapi-to-mock/' },
            { title: 'Mock response templates', href: '/tools/mock-response-templates/' },
            { title: 'Testing error responses', href: '/blog/mock-api-error-responses/' },
        ],
        reviewedAt: '2026-10-27',
        bestFor: {
            socket: [
                'You need a reachable mock URL without installing anything',
                'A teammate or CI job must call the mock from another machine',
                'The mock has a few static routes and should expire on its own',
                'You also want a webhook inbox or file share in the same session',
            ],
            other: [
                'You want mocks that run locally on your machine',
                'Responses need Faker data, proxying, or reusable local environments',
                'You need proxying, recording, or WebSockets',
                'Mock definitions should live in your repository and run in CI',
            ],
        },
        faqs: [
            {
                question: 'Is Mockoon free?',
                answer: 'Yes, Mockoon describes its desktop application as free and open source, with no account required. Cloud features such as a web version and team collaboration are part of Mockoon Pro.',
            },
            {
                question: 'Does Mockoon need a server or account?',
                answer: 'No. Mockoon’s desktop app runs mocks locally without an account, and the CLI or Docker image can self-host them.',
            },
            {
                question: 'What is an online alternative to Mockoon?',
                answer: 'socket.help creates a hosted mock API in the browser with a public HTTPS URL, private by default. It suits small, static, short-lived mocks rather than full mock environments.',
            },
            {
                question: 'Can socket.help import an OpenAPI file?',
                answer: 'Yes, its OpenAPI to mock tool converts an OpenAPI 3.x JSON document into a static mock configuration of up to 20 routes. YAML input, remote references, and stateful behavior are not supported.',
            },
        ],
    },
    {
        slug: 'cyberchef',
        name: 'CyberChef',
        focus: 'Data utilities',
        description:
            'socket.help offers single-purpose browser utilities also callable by API, CLI, and MCP; CyberChef chains hundreds of operations into reusable recipes.',
        summary:
            'Both offer browser data operations. socket.help favors one task per page, with the same utilities available through its API, CLI, SDK, SSH, and MCP. CyberChef combines hundreds of operations into repeatable recipes.',
        socketFit:
            'Choose socket.help when you want a focused formatter, encoder, generator, or checksum tool, or want to call supported utilities through HTTP, CLI, SDK, SSH, or MCP.',
        otherFit:
            'Choose CyberChef for multi-step decoding or analysis, exploring unfamiliar encodings, and building recipes from a much larger set of operations.',
        rows: [
            {
                topic: 'Interaction',
                socket: 'Separate task pages with input, explicit actions, and output.',
                other: 'Operations composed into a recipe, with input and output panels.',
            },
            {
                topic: 'Processing location',
                socket: 'Browser utilities run locally. Hosted interfaces send input to the socket.help server.',
                other: 'Runs entirely in the browser; three operations call external services.',
            },
            {
                topic: 'Analysis depth',
                socket: 'Focused JSON, YAML, CSV, encoding, hashing, generation, and timestamp utilities.',
                other: 'Hundreds of operations, recipe composition, Fork, and Magic detection.',
            },
            {
                topic: 'Running your own copy',
                socket: 'Portable Docker platform with PostgreSQL for hosted resources.',
                other: 'Standalone ZIP of the web app that runs locally or on any web server.',
            },
        ],
        limitations:
            'socket.help does not offer recipe chaining, automatic encoding detection, binary reverse engineering, or CyberChef’s breadth of operations. Its JWT inspector decodes claims; it does not verify a signature.',
        sources: [
            {
                title: 'CyberChef: operations, recipes, local processing, and download',
                url: 'https://gchq.github.io/CyberChef/',
            },
        ],
        tools: [
            { title: 'JSON formatter', href: '/tools/json-formatter/' },
            { title: 'Base64 encoder', href: '/tools/base64-encoder/' },
            { title: 'Hash generator', href: '/tools/hash-generator/' },
            { title: 'Developer utilities', href: '/catalog/developer/' },
        ],
        reviewedAt: '2026-10-27',
        bestFor: {
            socket: [
                'You need one quick task, such as formatting JSON or generating a UUID',
                'A script or agent should run the same utility through HTTP, CLI, or MCP',
                'You want test fixtures, mocks, or webhook inboxes next to the utilities',
            ],
            other: [
                'Decoding takes several steps in sequence',
                'You do not know which encoding the data uses',
                'You want to save and share a reusable recipe',
                'You need an offline copy with no server at all',
            ],
        },
        faqs: [
            {
                question: 'Is CyberChef safe to use with sensitive data?',
                answer: 'CyberChef says it runs entirely in your browser and does not send input or recipes anywhere. Three operations (Show on map, DNS over HTTPS, and HTTP request) contact external services.',
            },
            {
                question: 'Can I run CyberChef offline?',
                answer: 'Yes. CyberChef offers a ZIP of the whole web app that runs locally or on a web server with no configuration, though that copy does not update itself.',
            },
            {
                question: 'What is a simpler alternative to CyberChef for Base64 or JSON?',
                answer: 'socket.help has single-purpose pages for Base64, JSON, URL encoding, hashes, and UUIDs that run in your browser. They are easier for one task but cannot be chained into recipes.',
            },
            {
                question: 'Does socket.help verify JWT signatures?',
                answer: 'No. The socket.help JWT inspector decodes the header and claims for reading; it does not verify a signature.',
            },
        ],
    },
    {
        slug: 'beeceptor',
        name: 'Beeceptor',
        focus: 'API mocking',
        description:
            'socket.help keeps mock APIs and webhook inboxes private by default with short lifetimes; Beeceptor adds proxying, tunnels, stateful CRUD, gRPC, and SOAP.',
        summary:
            'Both give you a hosted endpoint you can inspect and mock without writing a server. socket.help endpoints are private by default and expire on their own. Beeceptor endpoints are public by default and cover more protocols and behaviors.',
        socketFit:
            'Choose socket.help for a short test with a few static routes or a temporary callback receiver, where you want the endpoint and its history private unless you share them.',
        otherFit:
            'Choose Beeceptor when a mock needs to proxy a real API, expose a local service, use advanced CRUD filters, or speak GraphQL, gRPC, or SOAP from a contract.',
        rows: [
            {
                topic: 'Default access',
                socket: 'Private by default; callers need an access token and management uses a separate credential.',
                other: 'Endpoints are public by default, and anyone with the dashboard URL can view requests. A private dashboard is an upgrade.',
            },
            {
                topic: 'Mocking',
                socket: 'Up to 20 static routes with simple templates and conditions, plus one CRUD collection with seed reset and revision guards.',
                other: 'Matching rules, template operators, and stateful CRUD routes.',
            },
            {
                topic: 'Contracts and protocols',
                socket: 'OpenAPI 3.x JSON to a static REST mock; GraphQL responses selected by operation name.',
                other: 'OpenAPI import, GraphQL mocks, gRPC mocks from .proto files, and SOAP mocks from WSDL.',
            },
            {
                topic: 'Traffic',
                socket: 'Webhook inbox and mock API are separate tools. No proxy or tunnel.',
                other: 'Request inspection on the mock endpoint, forward proxy to a real API, and local tunneling.',
            },
            {
                topic: 'Lifetime',
                socket: 'Resources start at one hour, up to seven days on a free account.',
                other: 'Not stated in the pages we reviewed.',
            },
        ],
        limitations:
            'socket.help supports one bounded CRUD collection per mock resource, with seed reset and revision guards. It has no proxy mode, local tunnel, gRPC, or SOAP mocks. Its mocks are capped at 20 routes, 50 KiB per response body, and two-second delays, and they expire, so they are not a long-term shared sandbox.',
        sources: [
            { title: 'Beeceptor documentation', url: 'https://beeceptor.com/docs/' },
            {
                title: 'Beeceptor: create an endpoint (public by default)',
                url: 'https://beeceptor.com/docs/create-endpoint/',
            },
            {
                title: 'Beeceptor: mock server from an OpenAPI file',
                url: 'https://beeceptor.com/docs/oas-json-file-create-mock-server/',
            },
            { title: 'Beeceptor: CRUD APIs', url: 'https://beeceptor.com/docs/crud-api/' },
            {
                title: 'Beeceptor: local tunneling',
                url: 'https://beeceptor.com/docs/local-tunneling-by-exposing-service-port/',
            },
        ],
        tools: [
            { title: 'Mock REST API', href: '/tools/mock-rest-api/' },
            { title: 'OpenAPI to mock', href: '/tools/openapi-to-mock/' },
            { title: 'GraphQL mock', href: '/tools/graphql-mock/' },
            { title: 'Webhook inbox', href: '/tools/webhook-inbox/' },
        ],
        reviewedAt: '2026-10-27',
        bestFor: {
            socket: [
                'Mock responses or captured payloads should not be public',
                'The endpoint should clean itself up after the test',
                'A few static routes or error statuses are enough',
                'An MCP agent should create and call the mock',
            ],
            other: [
                'You need to proxy a real API or tunnel to localhost',
                'The mock needs advanced CRUD rules or proxying beyond a bounded collection',
                'Your contract is gRPC or SOAP',
                'The same endpoint should both mock and log traffic',
            ],
        },
        faqs: [
            {
                question: 'Are Beeceptor endpoints public?',
                answer: 'Yes, by default. Beeceptor’s documentation says anyone with the dashboard URL can view incoming requests and responses, and recommends a hard-to-guess endpoint name or a private dashboard upgrade.',
            },
            {
                question: 'What is a private alternative to Beeceptor for mock APIs?',
                answer: 'socket.help creates mock APIs that are private by default. Callers need an access token, and management uses a separate credential.',
            },
            {
                question: 'Can Beeceptor mock gRPC or SOAP?',
                answer: 'Yes. Beeceptor documents gRPC mock servers built from .proto files and SOAP mocks generated from WSDL. socket.help does not support either.',
            },
            {
                question: 'Can socket.help mock an API from an OpenAPI spec?',
                answer: 'Yes, for OpenAPI 3.x JSON documents. The result is a static mock of up to 20 routes built from examples and basic schemas.',
            },
        ],
    },
    {
        slug: 'postman-mock-servers',
        name: 'Postman mock servers',
        focus: 'API mocking',
        description:
            'socket.help makes standalone, expiring mock APIs in the browser; Postman mock servers run in Postman Cloud from collection examples in your workspace.',
        summary:
            'socket.help creates a standalone mock that expires, with no collection or workspace needed. Postman mock servers live in Postman Cloud and return saved examples from a collection, matched to each request.',
        socketFit:
            'Choose socket.help for a quick endpoint you configure route by route, share with a token, and let expire, without setting up a collection.',
        otherFit:
            'Choose Postman mock servers when your API is already described in a Postman collection and the team designs and tests it in a shared workspace.',
        rows: [
            {
                topic: 'Source of responses',
                socket: 'Routes you define in the editor, or converted from OpenAPI 3.x JSON.',
                other: 'Saved examples in a collection, matched to each request by Postman’s algorithm.',
            },
            {
                topic: 'Dynamic behavior',
                socket: 'Simple path, query, and body placeholders and one-field conditions.',
                other: 'Variables and templates in collection mocks; mocks can also use JavaScript request handlers.',
            },
            {
                topic: 'Access',
                socket: 'Private by default with a separate access token; public is an explicit choice.',
                other: 'Private mock servers require a Postman API key in the x-api-key header.',
            },
            {
                topic: 'Hosting and lifetime',
                socket: 'Hosted on socket.help; starts at one hour, up to seven days on a free account.',
                other: 'Deployed to Postman Cloud and always available; mocks can also run locally.',
            },
            {
                topic: 'Delays',
                socket: 'Up to two seconds per route.',
                other: 'A fixed network delay setting.',
            },
        ],
        limitations:
            'socket.help mocks are not tied to an API design workflow, collections, or team workspaces in the way Postman’s are. They do not run custom JavaScript, are capped at 20 routes, and expire, so they do not replace a long-lived mock shared across a team.',
        sources: [
            {
                title: 'Postman: mock APIs overview',
                url: 'https://learning.postman.com/docs/design-apis/mock-apis/overview/',
            },
            {
                title: 'Postman: set up mock servers',
                url: 'https://learning.postman.com/docs/design-apis/mock-apis/set-up-mock-servers/',
            },
            {
                title: 'Postman: mock server matching algorithm',
                url: 'https://learning.postman.com/docs/design-apis/mock-apis/matching-algorithm/',
            },
        ],
        tools: [
            { title: 'Mock REST API', href: '/tools/mock-rest-api/' },
            { title: 'OpenAPI to mock', href: '/tools/openapi-to-mock/' },
            { title: 'Delay & timeout simulator', href: '/tools/delay-timeout-simulator/' },
            { title: 'Testing error responses', href: '/blog/mock-api-error-responses/' },
        ],
        reviewedAt: '2026-10-27',
        bestFor: {
            socket: [
                'You need a mock in minutes without building a collection',
                'The mock is for one test session and should expire',
                'You want to test a specific error status or slow response',
                'An agent or script should create mocks through MCP, CLI, or HTTP',
            ],
            other: [
                'Your API is already modeled in a Postman collection',
                'The team designs and reviews APIs in a shared workspace',
                'The mock should stay available long term',
                'Responses need JavaScript logic',
            ],
        },
        faqs: [
            {
                question: 'How do Postman mock servers choose a response?',
                answer: 'Postman matches each request to a saved example in your collection using its matching algorithm. Matching can also consider the request body or headers when those options are enabled.',
            },
            {
                question: 'Can Postman mock servers be private?',
                answer: 'Yes. Private Postman mock servers require a Postman API key in the x-api-key request header.',
            },
            {
                question: 'What is a quick alternative to Postman mock servers?',
                answer: 'socket.help creates a mock REST API in the browser from routes you type or an OpenAPI 3.x JSON file. It needs no collection or account and expires after one hour by default.',
            },
            {
                question: 'Can I add a delay to a socket.help mock?',
                answer: 'Yes, each route can wait up to two seconds before responding. That is enough to test loading states and short client timeouts.',
            },
        ],
    },
    {
        slug: 'hookdeck-inspect',
        name: 'Hookdeck Inspect',
        focus: 'Webhook testing',
        description:
            'socket.help webhook inboxes are private by default and last one hour; Hookdeck Inspect keeps requests 3 days and forwards to localhost with its CLI.',
        summary:
            'Both give you a test webhook URL without an account. socket.help keeps the receiver and history private by default with a short lifetime. Hookdeck Inspect keeps requests for three days and adds retries, sample webhooks, and forwarding to localhost.',
        socketFit:
            'Choose socket.help when a callback is part of a short test session and you want the receiver private, with mocks, files, utilities, and MCP in the same place.',
        otherFit:
            'Choose Hookdeck Inspect when you want to forward webhooks to a handler on localhost, resend a captured request while you iterate, or trigger sample events from common providers.',
        rows: [
            {
                topic: 'Account',
                socket: 'Not required. A free account extends resources to seven days.',
                other: 'Not required. Saving data creates a free Hookdeck account.',
            },
            {
                topic: 'Retention',
                socket: 'One-hour anonymous lifetime; up to 100 requests or 1 MiB per inbox.',
                other: 'Source URLs last with the browser session (90 days); captured requests are kept for three days.',
            },
            {
                topic: 'Access',
                socket: 'Private sender and inspection credentials by default.',
                other: 'Share a Source URL so colleagues see the same requests.',
            },
            {
                topic: 'Local development',
                socket: 'No localhost forwarding. Request replay sends a request you write to a public URL.',
                other: 'Forwards requests to localhost through the Hookdeck CLI and retries captured requests.',
            },
            {
                topic: 'Automation',
                socket: 'HTTP API, CLI, SDK, SSH, and MCP create and read inboxes.',
                other: 'Inspect API creates Source URLs and waits for the next request, with no API key.',
            },
        ],
        limitations:
            'socket.help cannot forward captured webhooks to localhost, resend a captured request to your handler, or send sample provider events. Its one-hour anonymous lifetime is much shorter than Hookdeck Inspect’s three-day request retention.',
        sources: [
            {
                title: 'Hookdeck Inspect documentation',
                url: 'https://hookdeck.com/docs/inspect',
            },
        ],
        tools: [
            { title: 'Webhook inbox', href: '/tools/webhook-inbox/' },
            { title: 'Request replay', href: '/tools/request-replay/' },
            { title: 'HMAC generator', href: '/tools/hmac-generator/' },
            { title: 'Webhook testing guide', href: '/blog/test-webhooks-without-a-server/' },
        ],
        reviewedAt: '2026-10-27',
        bestFor: {
            socket: [
                'Senders and viewers should need a token, not just the URL',
                'The test is short and the data should disappear soon after',
                'An MCP agent or script should create and read the inbox',
                'You also need mock APIs or utilities in the same workflow',
            ],
            other: [
                'Your handler runs on localhost',
                'You want to resend a captured webhook while you fix code',
                'You want sample events instead of triggering real ones',
                'Requests should stay readable for a few days',
            ],
        },
        faqs: [
            {
                question: 'Is Hookdeck Inspect free?',
                answer: 'Hookdeck Inspect needs no account to create a test webhook URL. Choosing Save Data creates a free Hookdeck account.',
            },
            {
                question: 'Is Hookdeck Console the same as Hookdeck Inspect?',
                answer: 'Hookdeck’s Console documentation URL now redirects to the Inspect page, which describes the no-account test webhook URL.',
            },
            {
                question: 'How long does Hookdeck Inspect keep requests?',
                answer: 'Without an account, captured requests are kept for three days and Source URLs last with your browser session, which is 90 days.',
            },
            {
                question: 'Can socket.help forward webhooks to my local server?',
                answer: 'No. socket.help captures and stores requests for inspection. To test a local handler with live events, use a forwarding tool such as the Hookdeck CLI.',
            },
        ],
    },
    {
        slug: 'mcp-inspector',
        name: 'MCP Inspector',
        focus: 'MCP testing',
        description:
            'socket.help hosts mock MCP servers and checks public ones from the browser; MCP Inspector is the local reference client for calling and debugging any server.',
        summary:
            'They solve opposite sides of MCP testing. socket.help gives you hosted mock MCP servers plus a browser check of a public server’s tools. MCP Inspector is the official local client for connecting to, calling, and debugging a server.',
        socketFit:
            'Choose socket.help when your MCP client or agent needs a predictable server to call, or when you want a quick look at a public server’s tools without installing anything.',
        otherFit:
            'Choose MCP Inspector when you are building an MCP server and need to call tools, read resources, render prompts, and watch the JSON-RPC traffic, including for local stdio servers.',
        rows: [
            {
                topic: 'Role',
                socket: 'Hosted mock MCP servers with configurable tools, plus a read-only inspector for public servers.',
                other: 'A client that connects to your server, with web, CLI, and terminal interfaces.',
            },
            {
                topic: 'Where it runs',
                socket: 'In the browser, with no installation.',
                other: 'Locally through npx; requires Node 22.19.0 or newer.',
            },
            {
                topic: 'Transports',
                socket: 'Public Streamable HTTP endpoints only.',
                other: 'Local stdio servers and remote HTTP or SSE servers.',
            },
            {
                topic: 'Inspection depth',
                socket: 'Lists tools, resources, or prompts and their schemas. Does not call tools or read resources.',
                other: 'Calls tools, reads and subscribes to resources, renders prompts, and shows protocol and network traffic.',
            },
            {
                topic: 'Authorization',
                socket: 'Bearer token or X-* headers. No OAuth login.',
                other: 'Full OAuth flow, plus custom headers.',
            },
        ],
        limitations:
            'The socket.help MCP server inspector does not invoke tools, read resource contents, sign in with OAuth, or connect to local stdio servers, and it supports protocol versions up to 2025-11-25. Mock MCP servers return static responses for up to 10 tools.',
        sources: [
            {
                title: 'MCP Inspector overview',
                url: 'https://modelcontextprotocol.io/docs/tools/inspector',
            },
            {
                title: 'MCP Inspector web client',
                url: 'https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/web.md',
            },
            {
                title: 'MCP Inspector source code',
                url: 'https://github.com/modelcontextprotocol/inspector',
            },
        ],
        tools: [
            { title: 'Mock MCP server', href: '/tools/mock-mcp-server/' },
            { title: 'MCP server inspector', href: '/tools/mcp-server-inspector/' },
            { title: 'MCP tool-call inspector', href: '/tools/mcp-tool-call-inspector/' },
            { title: 'Tool failure simulator', href: '/tools/tool-failure-simulator/' },
        ],
        reviewedAt: '2026-10-27',
        bestFor: {
            socket: [
                'Your MCP client needs a predictable server to call',
                'You want to test how an agent handles tool errors and latency',
                'You want to check a public server’s tools without installing anything',
                'You need to read a saved MCP trace offline',
            ],
            other: [
                'You are building an MCP server and need to call its tools',
                'The server runs locally over stdio',
                'You need OAuth, resource subscriptions, or prompt rendering',
                'You want the raw JSON-RPC and HTTP traffic',
            ],
        },
        faqs: [
            {
                question: 'How do I run the MCP Inspector?',
                answer: 'Run npx @modelcontextprotocol/inspector with Node 22.19.0 or newer. It opens a web interface; --cli and --tui flags start the command-line and terminal clients.',
            },
            {
                question: 'Can I test an MCP server online without installing anything?',
                answer: 'Yes, for public Streamable HTTP servers. socket.help’s MCP server inspector lists a server’s tools, resources, or prompts and schemas in the browser, but it does not call tools.',
            },
            {
                question: 'How can I test an MCP client without a real server?',
                answer: 'Create a socket.help mock MCP server with up to 10 tools and static responses, then connect your client to its Streamable HTTP endpoint. The tool failure simulator returns controlled errors and delays.',
            },
            {
                question: 'Is the MCP Inspector open source?',
                answer: 'Yes. MCP Inspector is published as @modelcontextprotocol/inspector, and its source is on GitHub under the modelcontextprotocol organization.',
            },
        ],
    },
    {
        slug: 'ilovepdf',
        name: 'iLovePDF',
        focus: 'PDF tools',
        description:
            'socket.help covers core PDF tasks (merge, split, reorder, render, extract text) via browser and API; iLovePDF adds OCR, Office conversion, signing, and more.',
        summary:
            'Both handle everyday PDF tasks online. socket.help covers the core page operations and makes them callable from its API, CLI, and MCP. iLovePDF offers a much wider set of tools, including OCR, Office conversion, editing, and signing, plus desktop and mobile apps.',
        socketFit:
            'Choose socket.help to merge, split, reorder, or render a PDF without an account, or to run the same operation from a script or agent.',
        otherFit:
            'Choose iLovePDF when you need to convert to or from Word, Excel, or PowerPoint, run OCR, sign, protect, or edit a PDF, or work offline in a desktop app.',
        rows: [
            {
                topic: 'Tool range',
                socket: 'Merge, split, reorder pages, optimize, PDF to image, image to PDF, and text extraction.',
                other: 'Organize, optimize, OCR, Office and image conversion, editing, forms, signing, redaction, and comparison.',
            },
            {
                topic: 'File handling',
                socket: 'Processed on the server and not retained after the result is returned.',
                other: 'Files are kept for up to two hours for download, then removed, according to its FAQ.',
            },
            {
                topic: 'Limits',
                socket: 'Up to 10 MiB input, 200 pages, and 5 MiB output. Encrypted PDFs are unsupported.',
                other: 'Not stated in the pages we reviewed.',
            },
            {
                topic: 'Other ways to use it',
                socket: 'HTTP API, CLI, SDK, SSH, and MCP with the same limits.',
                other: 'Desktop app for Mac and Windows, mobile apps, and a developer API.',
            },
        ],
        limitations:
            'socket.help does not run OCR, convert PDFs to or from Office formats, sign, protect, unlock, or edit PDF content. Its compressor optimizes document structure and does not downsample images, so it may not make a file smaller.',
        sources: [
            { title: 'iLovePDF tools', url: 'https://www.ilovepdf.com/' },
            { title: 'iLovePDF FAQ', url: 'https://www.ilovepdf.com/help/faq' },
        ],
        tools: [
            { title: 'Merge PDFs', href: '/tools/merge-pdfs/' },
            { title: 'Split PDF', href: '/tools/split-pdf/' },
            { title: 'Compress PDF', href: '/tools/compress-pdf/' },
            { title: 'Extract PDF text', href: '/tools/extract-pdf-text/' },
            { title: 'Everyday tools', href: '/catalog/everyday/' },
        ],
        reviewedAt: '2026-10-27',
        bestFor: {
            socket: [
                'You need to merge, split, or reorder pages quickly',
                'Uploads and results should not be kept after processing',
                'A script or agent should run the same PDF operation',
            ],
            other: [
                'You need to convert a PDF to or from Word, Excel, or PowerPoint',
                'A scanned PDF needs OCR',
                'You need to sign, protect, edit, or redact a PDF',
                'You want a desktop or mobile app',
            ],
        },
        faqs: [
            {
                question: 'How long does iLovePDF keep my files?',
                answer: 'iLovePDF’s FAQ says it keeps files for a maximum of two hours so you can download them, then removes them. You can also delete a file yourself after processing.',
            },
            {
                question: 'Does socket.help store my PDFs?',
                answer: 'No. socket.help processes PDF tools on its server and does not retain uploads or results after returning the file.',
            },
            {
                question: 'Can socket.help compress a PDF?',
                answer: 'It can optimize a PDF’s structure and returns the original if the result is larger. It does not downsample images, so heavy image PDFs may not shrink much.',
            },
            {
                question: 'What is an alternative to iLovePDF for merging PDFs?',
                answer: 'socket.help merges up to 20 PDFs, 200 pages and 10 MiB combined, from the web page or through its API and CLI. It does not need an account.',
            },
        ],
    },
];
