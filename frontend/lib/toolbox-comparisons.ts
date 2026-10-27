import type { Comparison } from './comparisons';

export const toolboxComparisons: Comparison[] = [
    {
        slug: 'it-tools',
        name: 'IT Tools',
        focus: 'Developer utilities',
        description:
            'Compare IT Tools and socket.help for everyday developer utilities, self-hosting and temporary test resources, with official sources and practical limits.',
        summary:
            'IT Tools is a focused collection of developer utilities. socket.help combines utilities with temporary webhook inboxes, mock APIs, file shares and MCP access. Choose by the job you need to finish.',
        socketFit:
            'Choose socket.help when formatting or generating data is part of an integration test. You can inspect a callback, create a temporary mock, generate fixtures and use the shared API, CLI or MCP interface without assembling several services. Available tools are distinguished from the roadmap.',
        otherFit:
            'Choose IT Tools when you want a dedicated developer toolbox and its established open-source application. Its repository documents local development and Docker deployment, so it is a practical option when a focused, self-hostable utility collection is the whole job.',
        rows: [
            {
                topic: 'Primary job',
                socket: 'Utilities plus disposable integration-testing resources.',
                other: 'A collection of small developer utilities in one application.',
            },
            {
                topic: 'Working with callbacks',
                socket: 'Create an expiring inbox and inspect captured requests with separate management access.',
                other: 'Use a separate receiver when your workflow needs an externally reachable webhook inbox.',
            },
            {
                topic: 'Repeat visits',
                socket: 'Save available tools in this browser and return through the catalog or dashboard. Saved entries contain tool IDs only.',
                other: 'A focused toolbox is useful as a regular destination for developer tasks.',
            },
            {
                topic: 'Running your own copy',
                socket: 'Portable Docker setup for the application and PostgreSQL; deployment still requires operator configuration.',
                other: 'The official repository includes Docker deployment instructions and the open-source application.',
            },
        ],
        limitations:
            'socket.help is still being built. Some catalog entries are Coming soon; hosted operations have file, execution and daily usage limits. It is not a promise of every IT Tools utility or identical behavior. Browser-local tools keep their processing local, while hosted operations send their input to the socket.help server. Check the individual tool page before choosing a workflow.',
        sources: [
            {
                title: 'IT Tools official repository and deployment instructions',
                url: 'https://github.com/CorentinTh/it-tools',
            },
        ],
        tools: [
            { title: 'Explore available tools', href: '/catalog/' },
            { title: 'JSON formatter', href: '/tools/json-formatter/' },
            { title: 'Webhook inbox', href: '/tools/webhook-inbox/' },
        ],
        reviewedAt: '2026-10-27',
        bestFor: {
            socket: [
                'You need a temporary endpoint as well as a utility',
                'You want the same hosted operation in scripts and an MCP client',
                'You want file and media previews next to integration tools',
            ],
            other: [
                'You want a dedicated developer utility application',
                'Its existing tool collection covers your task',
                'You want to deploy the documented open-source toolbox',
            ],
        },
        faqs: [
            {
                question: 'Does socket.help replace every IT Tools utility?',
                answer: 'No. The catalogs and behavior differ. Search for your task and check that the socket.help entry is available; Coming soon entries do not run.',
            },
            {
                question: 'Do I need an account to save tools?',
                answer: 'No. Saved tools store only their IDs in your current browser. They do not sync across devices or retain your inputs.',
            },
            {
                question: 'Are all socket.help tools processed locally?',
                answer: 'No. The page identifies local and hosted processing. Network lookups, shared resources and hosted conversions require a server; local formatters and generators can process in your browser.',
            },
        ],
    },
    {
        slug: 'hoppscotch',
        name: 'Hoppscotch',
        focus: 'API workflows',
        description:
            'Compare Hoppscotch and socket.help for API workflows: reusable collections, import/export, temporary receivers, mocks, client interfaces and current limits.',
        summary:
            'Hoppscotch organizes reusable API requests into collections. socket.help supplies disposable resources and utility operations for integration testing. They can work together: send a request from Hoppscotch to a socket.help mock or receiver.',
        socketFit:
            'Choose socket.help when you need a destination for a callback, a temporary mock response, a test file or an operation an agent can discover. Resources expose explicit lifetimes and public/private access. The same hosted operations are reachable through ordinary HTTP, the SDK, CLI and MCP.',
        otherFit:
            'Choose Hoppscotch when the main job is maintaining and reusing an API request collection. Its documentation covers nested collections, sharing, and import/export with Hoppscotch, OpenAPI and Postman formats. That is a different job from creating a temporary receiving endpoint.',
        rows: [
            {
                topic: 'Starting point',
                socket: 'Create a resource, run a utility or repeat a small API scenario.',
                other: 'Organize and reuse requests in collections and sub-collections.',
            },
            {
                topic: 'Running checks',
                socket: 'Up to six sequential requests on one public origin, with variables, secret headers, JSON captures and response checks. Browser saves and JSON exports exclude secret values.',
                other: 'A collection runner with configurable delays, iterations and environment variables.',
            },
            {
                topic: 'Portability',
                socket: 'Export and import supported mock configurations as JSON; use the published API contract and client examples.',
                other: 'Collection import/export includes Hoppscotch, OpenAPI and Postman formats.',
            },
            {
                topic: 'Receiving callbacks',
                socket: 'A webhook inbox captures method, path, headers, query and body, with searchable history.',
                other: 'Use your API client to send requests to a receiver such as a socket.help inbox.',
            },
            {
                topic: 'Using them together',
                socket: 'Create a mock or inbox; copy its endpoint and provide a separate access header when private.',
                other: 'Keep the request in a collection and reuse it while changing the destination or test body.',
            },
        ],
        limitations:
            'socket.help has a bounded scenario runner for up to six sequential requests on one origin, with variables, checks and non-secret JSON captures. It does not import Postman collections, run scripts or provide a full collaborative collection platform. Its scenario JSON and mock configuration exports are separate formats. Hosted runs and temporary resources use plan allowances, so a temporary mock is not a permanent production API.',
        sources: [
            {
                title: 'Hoppscotch collection runner',
                url: 'https://docs.hoppscotch.io/documentation/features/runner',
            },
            {
                title: 'Hoppscotch documentation: collections and portability',
                url: 'https://docs.hoppscotch.io/documentation/features/collections',
            },
        ],
        tools: [
            { title: 'API test scenarios', href: '/tools/api-test-scenarios/' },
            { title: 'Mock REST API', href: '/tools/mock-rest-api/' },
            { title: 'Webhook inbox', href: '/tools/webhook-inbox/' },
            { title: 'API documentation', href: '/docs/' },
        ],
        reviewedAt: '2026-10-27',
        bestFor: {
            socket: [
                'You need an externally reachable test receiver',
                'You need short-lived mocks or file shares',
                'You want utility results from the same API as your test resources',
            ],
            other: [
                'You repeatedly send a related set of requests',
                'You need collection organization and sharing',
                'Your workflow uses collection import and export',
            ],
        },
        faqs: [
            {
                question: 'Can I use Hoppscotch with socket.help?',
                answer: 'Yes. Create an available mock or inbox in socket.help, then use its endpoint in Hoppscotch. Private endpoints require the separate sender access header; do not put access tokens in the URL.',
            },
            {
                question: 'Can socket.help import a Postman collection?',
                answer: 'Not currently. Supported mock JSON configuration import is a different format. Hoppscotch documents collection import/export for Postman and OpenAPI.',
            },
            {
                question: 'Is a request client the same as a webhook receiver?',
                answer: 'No. A request client sends an outgoing HTTP request. A receiver provides an endpoint another system can call, then stores the captured request for inspection.',
            },
        ],
    },
];
