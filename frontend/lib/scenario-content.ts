import type { Article } from './articles';
import type { DocPage } from './docs';
import type { ToolDetail } from './tool-details';

export const scenarioDetails: ToolDetail[] = [
    {
        title: 'A small request collection you can repeat',
        paragraphs: [
            'Create up to six ordered requests against one public base origin. Give every request a name, method and relative path, then add its headers and optional body. The request list lets you move a step earlier or later without rewriting the collection. Every request has an expected HTTP status, and can also check a piece of text or the exact value of a JSON field.',
            'The report separates passed, failed and skipped steps. Open a request to see its checks, response body, headers, byte count and measured duration. A server error can be the expected result: an intentional 404 passes when the expected status is 404. Disable Stop after a failed request or check when you want independent checks to continue.',
        ],
    },
    {
        title: 'Reuse variables without exporting credentials',
        paragraphs: [
            'Ordinary variables are named strings referenced as {{name}} in paths, headers and bodies. A request can capture a non-secret scalar JSON field, such as items.0.id, into a new variable for later steps. JSON paths use dotted object keys and array indexes; they do not evaluate JavaScript or a general query language. Put JSON body substitutions inside quoted strings so inserted characters can be escaped correctly.',
            'Declare secrets separately and enter their values in masked fields. Only headers can reference those secret variables. Known values and sensitive response fields are redacted in the report. Secret input values are excluded from saved collections and JSON exports. Saving is explicit and local to this browser; ordinary bodies and variables are included, so review them before sharing an export.',
        ],
    },
    {
        title: 'Know what a run does',
        paragraphs: [
            'Pressing Run sends real requests from the Kivel server. All requests stay on the configured public origin, private and reserved addresses are blocked, redirects are returned without following them, and cookies are not replayed. Use test endpoints you control or are authorized to test. Cancellation stops pending work but cannot undo a request that has already reached the destination.',
            'Each request has a three-second deadline and a 64 KiB response limit. A complete scenario has a twenty-second deadline and fits in 32 KiB. A completed report uses one hosted run, including failed assertions or request errors. Invalid configurations do not consume a run. The JSON scenario works through the HTTP API, SDK, CLI, SSH and platform MCP endpoint. This version does not run scripts, import Postman collections, schedule background tests or persist reports on the server.',
        ],
    },
];

export const scenarioArticle: Article = {
    slug: 'reusable-api-test-scenarios',
    publishedAt: '2026-10-27',
    icon: 'code',
    category: 'API testing',
    title: 'Build a reusable API test scenario with variables and checks',
    description:
        'Turn a few manual API requests into a repeatable scenario with response checks, captured IDs, separate secrets and a readable report you can export.',
    sections: [
        {
            id: 'repeat',
            title: 'Keep the test, not a pile of edited commands',
            paragraphs: [
                'A manual API check often starts with a single request. Then you need to inspect a list, copy an item ID, request its details, and verify an error case. Repeating that sequence by hand makes it easy to reuse yesterday’s ID or overlook a response that changed shape. A small request collection keeps the sequence and its expectations together.',
                'The API test scenarios workbench is built for that session-sized job. It runs up to six requests in order, against one public origin, and produces a report for each step. There is one iteration and no arbitrary scripting. You can inspect the request before sending it, change a check, and run the same collection again when the implementation changes.',
            ],
        },
        {
            id: 'setup',
            title: 'Start with an origin and meaningful request names',
            paragraphs: [
                'Set the base origin to the service you are testing, such as https://api.example.com. Keep it to the scheme and host, with an optional supported port. Each step uses a relative path such as /items or /items/42. This keeps the destination visible and prevents a later request from silently sending credentials to a different host.',
                'Name steps for the behavior you expect: List items, Read the first item, and Reject an unknown item are easier to scan than Request 1, Request 2 and Request 3. Select a step to edit its method, headers and body. Move up and Move down change the order; they do not send a request. The page also does not send anything simply because it has loaded an example.',
            ],
            steps: [
                'Set the origin of an authorized test service.',
                'Add a request with a relative path and the expected HTTP status.',
                'Add a second request only when it checks another behavior.',
                'Review the full sequence before pressing Run scenario.',
            ],
        },
        {
            id: 'checks',
            title: 'Make the result say whether the behavior is right',
            paragraphs: [
                'A successful network connection is not enough to establish that an integration works. The runner always compares the actual status with the expected status. A 500 response fails a normal 200 check, while a deliberate missing-record test can expect 404 and pass. Optional checks look for text in the body or compare a JSON field with an exact string, number, boolean or null value.',
                'Choose a value type deliberately. The JSON string "42" differs from the number 42, and a missing property differs from null. Use dotted field paths such as data.id or items.0.name. These paths traverse existing own properties; they do not execute expressions. Keep large numeric identifiers as strings in your API rather than relying on floating-point number equality.',
                'Stop after failure is useful when one request depends on another. The remaining steps appear as Skipped, which is different from failing a request that was actually sent. Turn that option off for independent checks when you want a full report even if the first endpoint fails.',
            ],
        },
        {
            id: 'variables',
            title: 'Pass an ID to the next request',
            paragraphs: [
                'Ordinary environment variables are named strings. Add a variable called label, then use {{label}} in a path, header or body. If the body is JSON, put the placeholder inside a quoted string: {"label":"{{label}}"}. The renderer escapes quotes and backslashes in the inserted value, keeping the JSON string intact. It does not create a typed object from a placeholder.',
                'To use a response value, open Capture value on the first request. Give the new variable a name such as itemId and select its JSON field, for example items.0.id. The next request can use /items/{{itemId}}. Capture accepts short scalar values, not whole documents or credentials. Define a variable before referencing it; a missing capture makes a dependent request fail visibly instead of sending an unresolved placeholder.',
            ],
        },
        {
            id: 'secrets',
            title: 'Separate credentials from the portable scenario',
            paragraphs: [
                'A useful test should be reusable without copying its password into every export. Add a declared secret, enter its value in the masked field and reference it in a header, such as Authorization: Bearer {{token}} or X-Access-Token: {{accessToken}}. Secret placeholders are restricted to headers. Credentials in the base URL or query string are rejected.',
                'The workbench excludes secret input values from saved scenarios and exported JSON. Known secret values and sensitive fields are redacted in the response report. This does not mean every unknown sensitive value can be recognized automatically: use synthetic data, review response bodies, and check ordinary variables before sharing an export. A secret sent to your test endpoint is still available to that endpoint.',
            ],
        },
        {
            id: 'portable',
            title: 'Save the setup and run it from another interface',
            paragraphs: [
                'Save scenario stores the validated configuration in the current browser. It includes ordinary request bodies and variables, but excludes secret input values and reports. A saved name is replaced when you explicitly save another configuration with that name. Export scenario JSON gives you a file you can review or version with a project. Import only loads the editor and never starts execution.',
                'The same scenario can be sent to the hosted execution API using tool ID mock-apis-api-test-scenarios. The CLI reads the scenario from standard input; the SDK accepts the serialized scenario as input. For secrets, provide a JSON object in the secret option separately from the collection. Avoid printing those values into logs or checking them into source control.',
            ],
            code: {
                title: 'Run a reviewed scenario with the CLI',
                value: 'socket-help describe mock-apis-api-test-scenarios\nsocket-help run mock-apis-api-test-scenarios < api-scenario.json\n\n# SDK\nconst result = await socket.run(\n  "mock-apis-api-test-scenarios",\n  JSON.stringify(scenario),\n  { secret: JSON.stringify(secretValues) }\n);\nconst report = JSON.parse(result.output);',
            },
        },
        {
            id: 'bounds',
            title: 'Read failures and limits honestly',
            paragraphs: [
                'Requests run sequentially with a three-second deadline each and a twenty-second overall bound. Each response is capped at 64 KiB. A truncated response is a failed completeness check, so a partial document cannot quietly pass as a complete response. The report preserves the status, measured time and available body for inspection. Redirects are not followed and cookies are not replayed.',
                'A completed report consumes one hosted run, including a report containing failed checks or request errors. An invalid configuration does not consume a run. Cancellation cannot roll back a POST, PATCH or DELETE that already reached the service, so inspect the destination before retrying a mutation. This tool is a bounded manual test runner; it does not provide continuous monitoring, background execution or a production availability guarantee.',
            ],
        },
    ],
    related: [
        { title: 'API test scenarios', href: '/tools/api-test-scenarios/' },
        { title: 'Scenario API documentation', href: '/docs/api-scenarios/' },
        { title: 'Request replay', href: '/tools/request-replay/' },
        { title: 'Mock REST API', href: '/tools/mock-rest-api/' },
    ],
    faqs: [
        {
            question: 'Can I import a Postman collection?',
            answer: 'Not in this version. The import accepts the Kivel version 1 scenario format and never runs scripts.',
        },
        {
            question: 'Does a saved scenario include my secret values?',
            answer: 'No. It includes declared secret names, ordinary variables, request bodies and checks. Masked secret values and reports are excluded.',
        },
        {
            question: 'Does the runner follow redirects?',
            answer: 'No. It returns the redirect response so you can inspect it. Every request must remain on the configured public origin.',
        },
    ],
};

export const scenarioDoc: DocPage = {
    slug: 'api-scenarios',
    title: 'API test scenarios: format, execution and reports',
    navTitle: 'API scenarios',
    group: 'Interfaces',
    updatedAt: '2026-10-27',
    description:
        'Run reusable API scenarios through HTTP, SDK, CLI, SSH or MCP. Configure requests, variables, checks and captures with separate secrets and bounded execution.',
    sections: [
        {
            id: 'format',
            title: 'A portable version 1 scenario',
            paragraphs: [
                'Send a serialized scenario in input to POST /api/tools/mock-apis-api-test-scenarios/run. The browser workbench exports the same format. Requests run in array order against baseUrl, which must be a public HTTP/HTTPS origin on port 80, 443, 8080 or 8443. Each request path starts with one slash; cross-origin destinations are rejected.',
                'The configuration has version, name, baseUrl, variables, secretNames, stopOnFailure and requests. There are one to six requests, named for the behavior they check. Each request needs method, path and expect.status. Headers and body are optional. GET and HEAD cannot carry a body.',
            ],
            code: {
                title: 'api-scenario.json',
                value: JSON.stringify(
                    {
                        version: 1,
                        name: 'Read an item',
                        baseUrl: 'https://api.example.com',
                        variables: {},
                        secretNames: ['accessToken'],
                        stopOnFailure: true,
                        requests: [
                            {
                                name: 'List items',
                                method: 'GET',
                                path: '/items',
                                headers: { 'x-access-token': '{{accessToken}}' },
                                body: '',
                                expect: { status: 200 },
                                extract: { name: 'itemId', path: 'items.0.id' },
                            },
                            {
                                name: 'Read first item',
                                method: 'GET',
                                path: '/items/{{itemId}}',
                                headers: { 'x-access-token': '{{accessToken}}' },
                                body: '',
                                expect: { status: 200, json: { path: 'active', equals: true } },
                            },
                        ],
                    },
                    null,
                    2,
                ),
            },
        },
        {
            id: 'variables',
            title: 'Variables, checks and captures',
            paragraphs: [
                'Ordinary variables are string values referenced with {{name}}. Define them before use. Up to twenty ordinary variables and ten declared secret names are allowed. Variables captured by earlier requests can be referenced by later requests. A capture is {name, path}, where path is a dotted JSON field path with at most eight segments. Captures accept non-secret strings, numbers or booleans up to 1,024 characters.',
                'Each expect object requires status (100–599), and may include contains (up to 500 characters) and json: {path, equals}. JSON equality is type-sensitive and supports a string, finite number, boolean or null. A missing property fails. Templates in JSON bodies belong inside quoted strings; substitutions are escaped as JSON string content. No scripts or expressions are executed.',
            ],
        },
        {
            id: 'secrets',
            title: 'Supply secrets outside the configuration',
            paragraphs: [
                'Declare secret names in secretNames. Supply their values as a serialized JSON object in options.secret. Every declared secret needs a value, and unknown secret keys are rejected. Secret placeholders can only appear in request headers. Authorization and other credential headers require a declared-secret placeholder rather than a literal value.',
                'Only Accept, Content-Type, Authorization and non-routing X-* request headers are accepted. Cookies, Host, proxy and hop-by-hop headers are not accepted. All steps stay on the same origin, and redirects are not followed. Known secret values and sensitive response fields are redacted in reports. The server retains no scenario or execution history.',
            ],
            code: {
                title: 'SDK execution',
                value: 'const result = await socket.run(\n  "mock-apis-api-test-scenarios",\n  JSON.stringify(scenario),\n  { secret: JSON.stringify({ accessToken }) }\n);\nconst report = JSON.parse(result.output);\nif (!report.passed) console.error("Scenario checks failed");',
            },
            note: 'Secret values are sent to the configured target when you run the scenario. Use test credentials and review any report before sharing it.',
        },
        {
            id: 'clients',
            title: 'HTTP, CLI, SSH and MCP',
            paragraphs: [
                'All interfaces use the same validation and network runner. The CLI reads the scenario JSON from stdin. For SSH, use the existing socket-help command gateway and the same run command. MCP uses run_tool with toolId mock-apis-api-test-scenarios, the serialized scenario in input, and optional string options.secret. describe_tool returns the input example and current limits.',
                'A successful HTTP execution returns output as a JSON string containing the report, plus normal hosted usage. HTTP 200 means a report was produced; inspect report.passed to decide whether its checks succeeded. A completed report uses one hosted run even when an assertion or a request fails. Configuration errors return 400 and do not consume a run.',
            ],
            code: {
                title: 'HTTP execution without secret inputs',
                value: "jq -Rs '{input: .}' api-scenario.json | \\\n  curl https://kivel.io/api/tools/mock-apis-api-test-scenarios/run \\\n    -H 'Content-Type: application/json' --data-binary @-\n\n# CLI\nsocket-help run mock-apis-api-test-scenarios < api-scenario.json",
            },
        },
        {
            id: 'reports',
            title: 'Report structure and execution bounds',
            paragraphs: [
                'A report contains name, origin, passed, total, completed, durationMs and results. Each result has its name, method, path, outcome and checks; completed requests also include available status, durationMs, response bytes, truncated, sanitized headers and body. Captured variable names appear in captured; their values are not separately returned.',
                'Outcomes are passed, failed or skipped. stopOnFailure defaults to true. Failed expectations, missing captures, response truncation and request errors fail that step. When stopping, later steps are marked skipped. With stopOnFailure false, independent requests continue. A dependent step with a missing variable fails before it is sent. Cancelling or an overall timeout can stop the request before a complete report is returned; requests already sent cannot be undone.',
            ],
            table: {
                caption: 'Scenario execution limits',
                headers: ['Limit', 'Value'],
                rows: [
                    ['Requests', '1–6, sequential, one iteration'],
                    ['Scenario JSON', '32 KiB'],
                    ['Per-request deadline', '3 seconds'],
                    ['Overall deadline', '20 seconds'],
                    ['Body template / expanded body', '8 KiB / 16 KiB'],
                    ['Response body', '64 KiB per request'],
                    ['Headers', '12 per request'],
                    ['Secret options JSON', '4,096 characters'],
                ],
            },
        },
    ],
    related: [
        { title: 'Open the scenario workbench', href: '/tools/api-test-scenarios/' },
        { title: 'Full scenario guide', href: '/blog/reusable-api-test-scenarios/' },
        { title: 'Tools API', href: '/docs/tools-api/' },
        { title: 'Limits and errors', href: '/docs/limits-and-errors/' },
    ],
};
