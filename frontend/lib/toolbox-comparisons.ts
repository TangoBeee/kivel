import type { Comparison } from './comparisons';

export const toolboxComparisons: Comparison[] = [
    {
        slug: 'it-tools',
        name: 'IT Tools',
        focus: 'Developer utilities',
        description:
            'Compare IT Tools and Kivel for everyday developer utilities, self-hosting and hosted resources, with official sources and practical limits.',
        summary:
            'IT Tools is a focused collection of developer utilities. Kivel combines utilities with webhook inboxes, mock APIs, file shares and MCP access. Choose by the job you need to finish.',
        kivelFit:
            'Choose Kivel when formatting or generating data is part of an integration test. You can inspect a callback, create a mock API, generate fixtures and use the shared API, CLI or MCP interface without assembling several services. Available tools are distinguished from the roadmap.',
        otherFit:
            'Choose IT Tools when you want a dedicated developer toolbox and its established open-source application. Its repository documents local development and Docker deployment, so it is a practical option when a focused, self-hostable utility collection is the whole job.',
        rows: [
            {
                topic: 'Primary job',
                kivel: 'Utilities plus hosted resources for integration workflows.',
                other: 'A collection of small developer utilities in one application.',
            },
            {
                topic: 'Working with callbacks',
                kivel: 'Create an expiring inbox and inspect captured requests with separate management access.',
                other: 'Use a separate receiver when your workflow needs an externally reachable webhook inbox.',
            },
            {
                topic: 'Repeat visits',
                kivel: 'Save available tools in this browser and return through the catalog or dashboard. Saved entries contain tool IDs only.',
                other: 'A focused toolbox is useful as a regular destination for developer tasks.',
            },
            {
                topic: 'Running your own copy',
                kivel: 'Portable Docker setup for the application and PostgreSQL; deployment still requires operator configuration.',
                other: 'The official repository includes Docker deployment instructions and the open-source application.',
            },
        ],
        limitations:
            'Kivel is still being built. Some catalog entries are Coming soon; hosted operations have file, execution and daily usage limits. It is not a promise of every IT Tools utility or identical behavior. Browser-local tools keep their processing local, while hosted operations send their input to the Kivel server. Check the individual tool page before choosing a workflow.',
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
            kivel: [
                'You need an endpoint as well as a utility',
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
                question: 'Does Kivel replace every IT Tools utility?',
                answer: 'No. The catalogs and behavior differ. Search for your task and check that the Kivel entry is available; Coming soon entries do not run.',
            },
            {
                question: 'Do I need an account to save tools?',
                answer: 'No. Saved tools store only their IDs in your current browser. They do not sync across devices or retain your inputs.',
            },
            {
                question: 'Are all Kivel tools processed locally?',
                answer: 'No. The page identifies local and hosted processing. Network lookups, shared resources and hosted conversions require a server; local formatters and generators can process in your browser.',
            },
        ],
    },
    {
        slug: 'hoppscotch',
        name: 'Hoppscotch',
        focus: 'API workflows',
        description:
            'Compare Hoppscotch and Kivel for API workflows: reusable collections, import/export, webhook receivers, mocks, client interfaces and current limits.',
        summary:
            'Hoppscotch organizes reusable API requests into collections. Kivel supplies webhook inboxes, mock APIs and utilities. They can work together: send a request from Hoppscotch to a Kivel mock or receiver.',
        kivelFit:
            'Choose Kivel when you need a destination for a callback, a mock response, a test file or an operation an agent can discover. Resources expose explicit lifetimes and public/private access. The same hosted operations are reachable through ordinary HTTP, the SDK, CLI and MCP.',
        otherFit:
            'Choose Hoppscotch when the main job is maintaining and reusing an API request collection. Its documentation covers nested collections, sharing, and import/export with Hoppscotch, OpenAPI and Postman formats. That is a different job from creating a webhook receiver.',
        rows: [
            {
                topic: 'Starting point',
                kivel: 'Create a resource, run a utility or repeat a small API scenario.',
                other: 'Organize and reuse requests in collections and sub-collections.',
            },
            {
                topic: 'Running checks',
                kivel: 'Up to six sequential requests on one public origin, with variables, secret headers, JSON captures and response checks. Browser saves and JSON exports exclude secret values.',
                other: 'A collection runner with configurable delays, iterations and environment variables.',
            },
            {
                topic: 'Portability',
                kivel: 'Export and import supported mock configurations as JSON; use the published API contract and client examples.',
                other: 'Collection import/export includes Hoppscotch, OpenAPI and Postman formats.',
            },
            {
                topic: 'Receiving callbacks',
                kivel: 'A webhook inbox captures method, path, headers, query and body, with searchable history.',
                other: 'Use your API client to send requests to a receiver such as a Kivel inbox.',
            },
            {
                topic: 'Using them together',
                kivel: 'Create a mock or inbox; copy its endpoint and provide a separate access header when private.',
                other: 'Keep the request in a collection and reuse it while changing the destination or test body.',
            },
        ],
        limitations:
            'Kivel has a bounded scenario runner for up to six sequential requests on one origin, with variables, checks and non-secret JSON captures. It does not import Postman collections, run scripts or provide a full collaborative collection platform. Its scenario JSON and mock configuration exports are separate formats. Hosted runs and mock APIs use plan allowances. Check the plan for retention and persistent URLs.',
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
            kivel: [
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
                question: 'Can I use Hoppscotch with Kivel?',
                answer: 'Yes. Create an available mock or inbox in Kivel, then use its endpoint in Hoppscotch. Private endpoints require the separate sender access header; do not put access tokens in the URL.',
            },
            {
                question: 'Can Kivel import a Postman collection?',
                answer: 'Not currently. Supported mock JSON configuration import is a different format. Hoppscotch documents collection import/export for Postman and OpenAPI.',
            },
            {
                question: 'Is a request client the same as a webhook receiver?',
                answer: 'No. A request client sends an outgoing HTTP request. A receiver provides an endpoint another system can call, then stores the captured request for inspection.',
            },
        ],
    },
];
