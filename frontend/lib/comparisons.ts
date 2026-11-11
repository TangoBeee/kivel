import { agentComparisons } from './agent-comparisons';
import { toolboxComparisons } from './toolbox-comparisons';

export interface Comparison {
    slug: string;
    name: string;
    focus: string;
    description: string;
    summary: string;
    kivelFit: string;
    otherFit: string;
    rows: { topic: string; kivel: string; other: string }[];
    limitations: string;
    sources: { title: string; url: string }[];
    tools: { title: string; href: string }[];
    /** ISO date the competitor facts were last checked against official sources. */
    reviewedAt: string;
    /** Short "choose this when" bullets, 3 to 5 each. */
    bestFor: { kivel: string[]; other: string[] };
    /** 3 to 6 plain questions people search for, answered in 1 to 3 sentences. */
    faqs: { question: string; answer: string }[];
}
export const comparisons: Comparison[] = [
    ...agentComparisons,
    ...toolboxComparisons,
    {
        slug: 'webhook-site',
        name: 'Webhook.site',
        focus: 'Webhook testing',
        description:
            'Kivel gives private webhook inboxes with custom responses, forwarding, email inboxes and MCP for agents; Webhook.site adds workflows, schedules and custom domains.',
        summary:
            'Both give callbacks a destination with a custom response. Kivel inboxes are private by default, forward to your server on Pro, and sit next to email inboxes, mocks, files, utilities and MCP for agents. Webhook.site adds a larger automation platform with workflows and schedules.',
        kivelFit:
            'Choose Kivel when a webhook inbox is one part of a development workflow: capture a callback, format its JSON, test a mock response, or let an MCP agent inspect the result.',
        otherFit:
            'Choose Webhook.site when you need custom actions, workflows, schedules or custom domains. Its documentation covers automation well beyond request inspection.',
        rows: [
            {
                topic: 'Main workflow',
                kivel: 'Hosted resources and browser utilities in one toolbox.',
                other: 'Webhook and email inspection plus workflow automation and custom actions.',
            },
            {
                topic: 'Receiver and history access',
                kivel: 'Private receiver by default; separate caller and inspection credentials. Public reception is an explicit choice.',
                other: 'Free history is accessible to people who know the URL ID. Paid account URLs are protected by login.',
            },
            {
                topic: 'Anonymous history',
                kivel: 'One-hour starting lifetime; up to 100 requests or 1 MiB per inbox, 100 KiB per body.',
                other: 'Free URLs expire after seven days and accept up to 100 requests or emails, according to its FAQ.',
            },
            {
                topic: 'Response to the sender',
                kivel: 'Any status from 200 to 599, a JSON, text or XML body, X- headers and a delay of up to 5 seconds.',
                other: 'The default response can be edited on free URLs.',
            },
            {
                topic: 'Related work',
                kivel: 'Owned email inboxes when configured, forwarding with retries on Pro, replay, mock APIs, file shares, utilities and MCP tools such as wait_for_webhook.',
                other: 'Forwarding, schedules, CSV export, and email workflows on paid plans.',
            },
        ],
        limitations:
            'Kivel does not run workflows, custom actions or schedules, and forwarding to a public URL is a Pro feature that skips binary bodies. Its one-hour anonymous lifetime (up to seven days with a free account) covers a test session and most delayed callbacks.',
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
        reviewedAt: '2026-10-29',
        bestFor: {
            kivel: [
                'You want captured payloads private unless you choose public access',
                'The test fits within an hour, or seven days with a free account',
                'You also need a mock API, file share, or JSON formatter in the same session',
                'An MCP agent should create and read the inbox',
            ],
            other: [
                'A callback may arrive weeks later on a free URL',
                'You want custom actions or workflows on each request',
                'You need schedules or a custom domain',
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
                answer: 'Kivel creates inboxes that are private by default. Senders need an access token and reading history needs a separate inspection credential, so knowing the URL alone is not enough.',
            },
            {
                question: 'How long does a Kivel webhook inbox last?',
                answer: 'Anonymous inboxes start with a one-hour lifetime and hold up to 100 requests or 1 MiB. Free accounts can keep resources for up to seven days, with up to 1,000 requests or 10 MiB per inbox.',
            },
            {
                question: 'Can Kivel forward webhooks to my server?',
                answer: 'Yes. On Pro and Team, an inbox can forward every captured request to a public URL, with retries after server errors and a delivery log. Any captured request can also be replayed to a URL from the inbox page.',
            },
        ],
    },
    {
        slug: 'mockoon',
        name: 'Mockoon',
        focus: 'API mocking',
        description:
            'Kivel hosts small, expiring mock APIs from the browser; Mockoon is a desktop and CLI mocking tool with templating, proxying, recording, and CRUD.',
        summary:
            'Kivel creates a small hosted mock API that expires. Mockoon is a dedicated, open source mocking environment that runs as a desktop application or headless through its CLI and Docker image.',
        kivelFit:
            'Choose Kivel for a mock endpoint with predictable bodies, status codes, and delays that other people or CI can reach without installing anything, especially when you also need webhook inspection or file sharing.',
        otherFit:
            'Choose Mockoon for richer mock design and reusable environments, including Faker.js templating, response rules, CRUD routes, recording, proxying, and running mocks locally or through its CLI.',
        rows: [
            {
                topic: 'Authoring',
                kivel: 'Browser editor for routes, methods, statuses, bodies, headers, and delays.',
                other: 'Desktop mock editor; the CLI runs the same mock definitions headless.',
            },
            {
                topic: 'Response behavior',
                kivel: 'Up to 20 routes with request-value and fake-data templates, conditions, random failure rates and a live call log, plus one seeded CRUD collection with record editing and reset.',
                other: 'Templating helpers with Faker.js data, multiple responses with rules, CRUD routes, data buckets, and callbacks.',
            },
            {
                topic: 'OpenAPI',
                kivel: 'Converts an OpenAPI 3.x JSON document into a static mock of up to 20 routes.',
                other: 'Imports and exports OpenAPI specifications.',
            },
            {
                topic: 'Where it runs',
                kivel: 'Hosted on the Kivel installation with a public URL and private access by default.',
                other: 'Locally in the desktop app, or self-hosted with the CLI and Docker. Cloud deployments are a Pro feature.',
            },
            {
                topic: 'Reuse',
                kivel: 'Resources start at one hour; configurations can be exported and imported as JSON.',
                other: 'Mock data files can be stored in a repository and reused with the CLI.',
            },
        ],
        limitations:
            'Kivel fake data covers about twenty common fields rather than the full Faker.js library, proxy and record is a Pro feature limited to 20 recorded routes. WebSocket mocks support echo and scripted replies. OpenAPI import accepts JSON only, with local references and up to 20 routes.',
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
        reviewedAt: '2026-10-29',
        bestFor: {
            kivel: [
                'You need a reachable mock URL without installing anything',
                'A teammate or CI job must call the mock from another machine',
                'The mock has a few static routes and should expire on its own',
                'You also want a webhook inbox or file share in the same session',
            ],
            other: [
                'You want mocks that run locally on your machine',
                'Responses need the full Faker.js library or reusable local environments',
                'You need mocks that run offline',
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
                answer: 'Kivel creates a hosted mock API in the browser with a public HTTPS URL, private by default. It suits small, static, short-lived mocks rather than full mock environments.',
            },
            {
                question: 'Can Kivel import an OpenAPI file?',
                answer: 'Yes, its OpenAPI to mock tool converts an OpenAPI 3.x JSON document into a static mock configuration of up to 20 routes. YAML input, remote references, and stateful behavior are not supported.',
            },
        ],
    },
    {
        slug: 'cyberchef',
        name: 'CyberChef',
        focus: 'Data utilities',
        description:
            'Kivel offers single-purpose browser utilities also callable by API, CLI, and MCP; CyberChef chains hundreds of operations into reusable recipes.',
        summary:
            'Both offer browser data operations. Kivel favors one task per page, with the same utilities available through its API, CLI, SDK, SSH, and MCP. CyberChef combines hundreds of operations into repeatable recipes.',
        kivelFit:
            'Choose Kivel when you want a focused formatter, encoder, generator, or checksum tool, or want to call supported utilities through HTTP, CLI, SDK, SSH, or MCP.',
        otherFit:
            'Choose CyberChef for multi-step decoding or analysis, exploring unfamiliar encodings, and building recipes from a much larger set of operations.',
        rows: [
            {
                topic: 'Interaction',
                kivel: 'Separate task pages with input, explicit actions, and output.',
                other: 'Operations composed into a recipe, with input and output panels.',
            },
            {
                topic: 'Processing location',
                kivel: 'Browser utilities run locally. Hosted interfaces send input to the Kivel server.',
                other: 'Runs entirely in the browser; three operations call external services.',
            },
            {
                topic: 'Analysis depth',
                kivel: 'Focused JSON, YAML, CSV, encoding, hashing, generation, and timestamp utilities.',
                other: 'Hundreds of operations, recipe composition, Fork, and Magic detection.',
            },
            {
                topic: 'Running your own copy',
                kivel: 'Portable Docker platform with PostgreSQL for hosted resources.',
                other: 'Standalone ZIP of the web app that runs locally or on any web server.',
            },
        ],
        limitations:
            'Kivel does not offer recipe chaining, automatic encoding detection, binary reverse engineering, or CyberChef’s breadth of operations. Its JWT inspector decodes claims; it does not verify a signature.',
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
            kivel: [
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
                answer: 'Kivel has single-purpose pages for Base64, JSON, URL encoding, hashes, and UUIDs that run in your browser. They are easier for one task but cannot be chained into recipes.',
            },
            {
                question: 'Does Kivel verify JWT signatures?',
                answer: 'No. The Kivel JWT inspector decodes the header and claims for reading; it does not verify a signature.',
            },
        ],
    },
    {
        slug: 'beeceptor',
        name: 'Beeceptor',
        focus: 'API mocking',
        description:
            'Kivel mock APIs are private by default, log every call, generate fake data and proxy real APIs on Pro. Beeceptor adds tunnels, gRPC and SOAP.',
        summary:
            'Both give you a hosted endpoint you can inspect and mock without writing a server. Kivel endpoints are private by default and expire on their own. Beeceptor endpoints are public by default and cover more protocols and behaviors.',
        kivelFit:
            'Choose Kivel when you want mocks private by default, a live log of every call, fake data, random failures and proxy-and-record on Pro, all usable by an AI agent over MCP.',
        otherFit:
            'Choose Beeceptor when a mock needs to expose a local service, use advanced CRUD filters, or speak gRPC or SOAP from a contract.',
        rows: [
            {
                topic: 'Default access',
                kivel: 'Private by default; callers need an access token and management uses a separate credential.',
                other: 'Endpoints are public by default, and anyone with the dashboard URL can view requests. A private dashboard is an upgrade.',
            },
            {
                topic: 'Mocking',
                kivel: 'Up to 20 routes with request-value and fake-data templates, conditions and random failure rates, plus one CRUD collection with seed reset and revision guards.',
                other: 'Matching rules, template operators, and stateful CRUD routes.',
            },
            {
                topic: 'Contracts and protocols',
                kivel: 'OpenAPI 3.x JSON to a static REST mock; GraphQL responses selected by operation name.',
                other: 'OpenAPI import, GraphQL mocks, gRPC mocks from .proto files, and SOAP mocks from WSDL.',
            },
            {
                topic: 'Traffic',
                kivel: 'A live log of the last 100 calls on every mock. Proxy and record a real API on Pro. No local tunnel.',
                other: 'Request inspection on the mock endpoint, forward proxy to a real API, and local tunneling.',
            },
            {
                topic: 'Lifetime',
                kivel: 'Resources start at one hour, up to seven days on a free account.',
                other: 'Free endpoints last 30 days from creation, or 90 days from creation once claimed with a free account.',
            },
        ],
        limitations:
            'Kivel supports one bounded CRUD collection per mock resource. Proxy and record needs Pro and saves up to 20 routes. It has no local tunnel, gRPC, or SOAP mocks. Its mocks are capped at 20 routes, 50 KiB per response body, and two-second delays, and they expire, so they are not a long-term shared sandbox.',
        sources: [
            { title: 'Beeceptor documentation', url: 'https://beeceptor.com/docs/' },
            {
                title: 'Beeceptor pricing and Free plan retention',
                url: 'https://beeceptor.com/pricing/',
            },
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
        reviewedAt: '2026-10-30',
        bestFor: {
            kivel: [
                'Mock responses or captured payloads should not be public',
                'The endpoint should clean itself up after the test',
                'You want every call logged and fake data in responses',
                'An MCP agent should create and call the mock',
            ],
            other: [
                'You need to tunnel to localhost',
                'The mock needs advanced CRUD rules beyond a bounded collection',
                'Your contract is gRPC or SOAP',
            ],
        },
        faqs: [
            {
                question: 'Are Beeceptor endpoints public?',
                answer: 'Yes, by default. Beeceptor’s documentation says anyone with the dashboard URL can view incoming requests and responses, and recommends a hard-to-guess endpoint name or a private dashboard upgrade.',
            },
            {
                question: 'What is a private alternative to Beeceptor for mock APIs?',
                answer: 'Kivel creates mock APIs that are private by default. Callers need an access token, and management uses a separate credential.',
            },
            {
                question: 'Can Beeceptor mock gRPC or SOAP?',
                answer: 'Yes. Beeceptor documents gRPC mock servers built from .proto files and SOAP mocks generated from WSDL. Kivel does not support either.',
            },
            {
                question: 'Can Kivel mock an API from an OpenAPI spec?',
                answer: 'Yes, for OpenAPI 3.x JSON documents. The result is a static mock of up to 20 routes built from examples and basic schemas.',
            },
        ],
    },
    {
        slug: 'postman-mock-servers',
        name: 'Postman mock servers',
        focus: 'API mocking',
        description:
            'Kivel makes standalone, expiring mock APIs in the browser; Postman mock servers run in Postman Cloud from collection examples in your workspace.',
        summary:
            'Kivel creates a standalone mock that expires, with no collection or workspace needed. Postman mock servers live in Postman Cloud and return saved examples from a collection, matched to each request.',
        kivelFit:
            'Choose Kivel for a quick endpoint you configure route by route, share with a token, and let expire, without setting up a collection.',
        otherFit:
            'Choose Postman mock servers when your API is already described in a Postman collection and the team designs and tests it in a shared workspace.',
        rows: [
            {
                topic: 'Source of responses',
                kivel: 'Routes you define in the editor, or converted from OpenAPI 3.x JSON.',
                other: 'Saved examples in a collection, matched to each request by Postman’s algorithm.',
            },
            {
                topic: 'Dynamic behavior',
                kivel: 'Simple path, query, and body placeholders and one-field conditions.',
                other: 'Variables and templates in collection mocks; mocks can also use JavaScript request handlers.',
            },
            {
                topic: 'Access',
                kivel: 'Private by default with a separate access token; public is an explicit choice.',
                other: 'Private mock servers require a Postman API key in the x-api-key header.',
            },
            {
                topic: 'Hosting and lifetime',
                kivel: 'Hosted on Kivel; starts at one hour, up to seven days on a free account.',
                other: 'Deployed to Postman Cloud and always available; mocks can also run locally.',
            },
            {
                topic: 'Delays',
                kivel: 'Up to two seconds per route.',
                other: 'A fixed network delay setting.',
            },
        ],
        limitations:
            'Kivel mocks are not tied to an API design workflow, collections, or team workspaces in the way Postman’s are. They do not run custom JavaScript, are capped at 20 routes, and expire, so they do not replace a long-lived mock shared across a team.',
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
            kivel: [
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
                answer: 'Kivel creates a mock REST API in the browser from routes you type or an OpenAPI 3.x JSON file. It needs no collection or account and expires after one hour by default.',
            },
            {
                question: 'Can I add a delay to a Kivel mock?',
                answer: 'Yes, each route can wait up to two seconds before responding. That is enough to test loading states and short client timeouts.',
            },
        ],
    },
    {
        slug: 'hookdeck-inspect',
        name: 'Hookdeck Inspect',
        focus: 'Webhook testing',
        description:
            'Kivel webhook inboxes are private, answer with custom responses and forward to your server on Pro; Hookdeck Inspect keeps requests 3 days and forwards to localhost.',
        summary:
            'Both give you a test webhook URL without an account. Kivel keeps the receiver and history private by default with a short lifetime. Hookdeck Inspect keeps requests for three days and adds retries, sample webhooks, and forwarding to localhost.',
        kivelFit:
            'Choose Kivel when you want the receiver private, a custom response, replay to a public URL, forwarding to your server on Pro, and mocks, email inboxes, utilities and MCP in the same place.',
        otherFit:
            'Choose Hookdeck Inspect when you want to forward webhooks to a handler on localhost or trigger sample events from common providers.',
        rows: [
            {
                topic: 'Account',
                kivel: 'Not required. A free account extends resources to seven days.',
                other: 'Not required. Saving data creates a free Hookdeck account.',
            },
            {
                topic: 'Retention',
                kivel: 'One-hour anonymous lifetime; up to 100 requests or 1 MiB per inbox.',
                other: 'Source URLs last with the browser session (90 days); captured requests are kept for three days.',
            },
            {
                topic: 'Access',
                kivel: 'Private sender and inspection credentials by default.',
                other: 'Share a Source URL so colleagues see the same requests.',
            },
            {
                topic: 'Local development',
                kivel: 'No localhost forwarding yet. Replay any captured request to a public URL; Pro forwards every request to your server with retries.',
                other: 'Forwards requests to localhost through the Hookdeck CLI and retries captured requests.',
            },
            {
                topic: 'Automation',
                kivel: 'HTTP API, CLI, SDK, SSH, and MCP create and read inboxes; wait_for_webhook blocks until a request arrives.',
                other: 'Inspect API creates Source URLs and waits for the next request, with no API key.',
            },
        ],
        limitations:
            'Kivel cannot yet forward captured webhooks to localhost or send sample provider events, and binary bodies are not forwarded or replayed. Its one-hour anonymous lifetime is much shorter than Hookdeck Inspect’s three-day request retention; a free account keeps inboxes for seven days.',
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
        reviewedAt: '2026-10-29',
        bestFor: {
            kivel: [
                'Senders and viewers should need a token, not just the URL',
                'The test is short and the data should disappear soon after',
                'An MCP agent or script should create and read the inbox',
                'You also need mock APIs or utilities in the same workflow',
            ],
            other: [
                'Your handler runs on localhost',
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
                question: 'Can Kivel forward webhooks to my local server?',
                answer: 'Not to localhost yet. You can replay any captured request to a public URL, and on Pro an inbox forwards every request to your server with retries. For a handler on localhost, use a tunnel or the Hookdeck CLI for now.',
            },
        ],
    },
    {
        slug: 'mcp-inspector',
        name: 'MCP Inspector',
        focus: 'MCP testing',
        description:
            'Kivel hosts mock MCP servers and checks public ones from the browser; MCP Inspector is the local reference client for calling and debugging any server.',
        summary:
            'They solve opposite sides of MCP testing. Kivel gives you hosted mock MCP servers plus a browser check of a public server’s tools. MCP Inspector is the official local client for connecting to, calling, and debugging a server.',
        kivelFit:
            'Choose Kivel when your MCP client or agent needs a predictable server to call, or when you want a quick look at a public server’s tools without installing anything.',
        otherFit:
            'Choose MCP Inspector when you are building an MCP server and need to call tools, read resources, render prompts, and watch the JSON-RPC traffic, including for local stdio servers.',
        rows: [
            {
                topic: 'Role',
                kivel: 'Hosted mock MCP servers with configurable tools, plus a read-only inspector for public servers.',
                other: 'A client that connects to your server, with web, CLI, and terminal interfaces.',
            },
            {
                topic: 'Where it runs',
                kivel: 'In the browser, with no installation.',
                other: 'Locally through npx; requires Node 22.19.0 or newer.',
            },
            {
                topic: 'Transports',
                kivel: 'Public Streamable HTTP endpoints only.',
                other: 'Local stdio servers and remote HTTP or SSE servers.',
            },
            {
                topic: 'Inspection depth',
                kivel: 'Lists tools, resources, or prompts and their schemas. Does not call tools or read resources.',
                other: 'Calls tools, reads and subscribes to resources, renders prompts, and shows protocol and network traffic.',
            },
            {
                topic: 'Authorization',
                kivel: 'Bearer token or X-* headers. No OAuth login.',
                other: 'Full OAuth flow, plus custom headers.',
            },
        ],
        limitations:
            'The Kivel MCP server inspector does not invoke tools, read resource contents, sign in with OAuth, or connect to local stdio servers, and it supports protocol versions up to 2025-11-25. Mock MCP servers return static responses for up to 10 tools.',
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
            kivel: [
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
                answer: 'Yes, for public Streamable HTTP servers. Kivel’s MCP server inspector lists a server’s tools, resources, or prompts and schemas in the browser, but it does not call tools.',
            },
            {
                question: 'How can I test an MCP client without a real server?',
                answer: 'Create a Kivel mock MCP server with up to 10 tools and static responses, then connect your client to its Streamable HTTP endpoint. The tool failure simulator returns controlled errors and delays.',
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
            'Kivel covers core PDF tasks (merge, split, reorder, render, extract text) via browser and API; iLovePDF adds OCR, Office conversion, signing, and more.',
        summary:
            'Both handle everyday PDF tasks online. Kivel covers the core page operations and makes them callable from its API, CLI, and MCP. iLovePDF offers a much wider set of tools, including OCR, Office conversion, editing, and signing, plus desktop and mobile apps.',
        kivelFit:
            'Choose Kivel to merge, split, reorder, or render a PDF without an account, or to run the same operation from a script or agent.',
        otherFit:
            'Choose iLovePDF when you need to convert to or from Word, Excel, or PowerPoint, run OCR, sign, protect, or edit a PDF, or work offline in a desktop app.',
        rows: [
            {
                topic: 'Tool range',
                kivel: 'Merge, split, reorder pages, optimize, PDF to image, image to PDF, and text extraction.',
                other: 'Organize, optimize, OCR, Office and image conversion, editing, forms, signing, redaction, and comparison.',
            },
            {
                topic: 'File handling',
                kivel: 'Processed on the server and not retained after the result is returned.',
                other: 'Files are kept for up to two hours for download, then removed, according to its FAQ.',
            },
            {
                topic: 'Limits',
                kivel: 'Up to 10 MiB input, 200 pages, and 5 MiB output. Encrypted PDFs are unsupported.',
                other: 'Not stated in the pages we reviewed.',
            },
            {
                topic: 'Other ways to use it',
                kivel: 'HTTP API, CLI, SDK, SSH, and MCP with the same limits.',
                other: 'Desktop app for Mac and Windows, mobile apps, and a developer API.',
            },
        ],
        limitations:
            'Kivel does not run OCR, convert PDFs to or from Office formats, sign, protect, unlock, or edit PDF content. Its compressor optimizes document structure and does not downsample images, so it may not make a file smaller.',
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
            kivel: [
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
                question: 'Does Kivel store my PDFs?',
                answer: 'No. Kivel processes PDF tools on its server and does not retain uploads or results after returning the file.',
            },
            {
                question: 'Can Kivel compress a PDF?',
                answer: 'It can optimize a PDF’s structure and returns the original if the result is larger. It does not downsample images, so heavy image PDFs may not shrink much.',
            },
            {
                question: 'What is an alternative to iLovePDF for merging PDFs?',
                answer: 'Kivel merges up to 20 PDFs, 200 pages and 10 MiB combined, from the web page or through its API and CLI. It does not need an account.',
            },
        ],
    },
];
