import type { Article } from './articles';
import type { DocPage } from './docs';
import type { ToolDetail } from './tool-details';
export const echoDetails: ToolDetail[] = [
    {
        title: 'Inspect what actually arrives',
        paragraphs: [
            'Create a temporary endpoint and call it from your application or this request lab. The response separates method, relative path, query parameters, headers and request body. Repeated query parameters remain visible as arrays. JSON bodies are parsed for inspection, plain text stays text, and binary data returns its byte count without reflecting its contents.',
            'The workbench lets you choose a method, relative path, query, custom headers and JSON or text body. Send is explicit; opening the page never sends a request. The preview shows the observed fields, request byte count and the browser-measured round trip. That timing is one request measurement, not uptime monitoring.',
        ],
    },
    {
        title: 'Private access and short-lived resources',
        paragraphs: [
            'New endpoints are private. Supply the separate caller token in X-Access-Token or use authorized workspace access. A management token controls configuration and lifecycle; it does not grant private caller access. Public sharing lets anyone who knows the endpoint use it. Header, query and JSON fields whose names resemble credentials are redacted, as are known supplied authorization values.',
            'Use synthetic test data. A field-name rule cannot recognize every secret hidden in a free-form message. Requests pass through this deployment but are not saved as history. The resource stores its configuration and usage count, with the same expiry, ownership, renewal and deletion as mock APIs. This endpoint does not forward requests elsewhere or expose a client-IP field.',
        ],
    },
    {
        title: 'A useful companion to API integration tests',
        paragraphs: [
            'Use the echoed result to check whether your HTTP client sent the intended content type, body and custom headers. For example, send the same JSON from curl and your application, then compare the observed fields. Private CORS access uses an explicit token header; cookies are not required for shared callers.',
            'The endpoint works through HTTP, the SDK request method, the CLI api command, the SSH command gateway and MCP call_mock_api. Caller tokens stay separate from endpoint URLs. Use a webhook inbox when you need retained capture history, and an API test scenario when you want assertions across a sequence of requests.',
        ],
    },
];
export const echoArticle: Article = {
    slug: 'debug-http-clients-with-an-echo-endpoint',
    publishedAt: '2026-10-27',
    icon: 'code',
    category: 'HTTP debugging',
    title: 'Debug an HTTP client with a temporary echo endpoint',
    description:
        'See the method, query, headers and body your HTTP client actually sends, with a private temporary echo URL and a readable request preview.',
    sections: [
        {
            id: 'observed',
            title: 'Compare the request you intended with the request received',
            paragraphs: [
                'An HTTP client can look correct in application code while sending something different on the wire. A missing content type may turn a JSON object into plain text. A wrapper may omit a custom header. Query parameters may be encoded twice, or a request body may disappear because the selected method does not support it. A temporary echo endpoint makes those differences visible without writing and deploying a debugging server.',
                'An echo endpoint answers with a description of the request it received. It does not call your real API, look up a database record or validate your application’s business rules. Its job is narrower: give you evidence of the method, path, query, headers and body that reached this service. That makes it a useful first stop when a client and a real backend disagree about a request.',
            ],
        },
        {
            id: 'setup',
            title: 'Start with private access and a small payload',
            paragraphs: [
                'Create an HTTP echo endpoint and keep the returned resource ID and management credential. The default is private sharing. A caller uses the separate access token in an X-Access-Token header, or authorized workspace access. The base URL contains the resource ID only, so copying it does not also copy a private credential into browser history or a chat preview.',
                'Begin with a tiny synthetic event: an event name, a test ID and a boolean flag. Add the fields you are trying to debug one at a time. An echo service receives the request body even though it does not retain request history, so it should not be used as a destination for real customer records or production authentication secrets.',
            ],
        },
        {
            id: 'lab',
            title: 'Read a structured result instead of scanning a wall of JSON',
            paragraphs: [
                'The request lab has a method selector, a relative path and query field, custom headers, and a JSON or plain-text body editor. Press Send request to make one real HTTP request. Nothing runs on page load. The result places the observed method, byte count and round-trip measurement first, then separates query parameters, headers and the body into readable sections.',
                'A POST with JSON should show a JSON body and the expected content type. A GET should not carry the draft body still present in the editor. Repeated query keys are returned as arrays so you can check whether your client preserves all values. The relative observed path excludes the platform’s /mock/{id} prefix; it represents the route you appended to the endpoint.',
            ],
        },
        {
            id: 'headers',
            title: 'Understand header and credential handling',
            paragraphs: [
                'The service reflects the headers visible to its HTTP server. Browsers and proxies can add or normalize headers, and CORS can prevent a browser from sending headers that curl permits. Compare actual observations rather than assuming a browser has the same permissions as a command-line client. Cross-origin private access requires an explicit caller header and a successful preflight.',
                'Credential-like header, query and JSON field names are replaced with a redaction marker. Known supplied authorization values are also removed from reflected text. This reduces accidental exposure in a copied result, but cannot identify every secret hidden in arbitrary text or an encoded binary payload. The workbench limits custom headers to Accept and non-credential X-* names and attaches the caller token separately.',
            ],
        },
        {
            id: 'bodies',
            title: 'Check the body format without pretending every payload is JSON',
            paragraphs: [
                'Valid JSON is parsed for inspection with protections against unsafe numeric conversion. If a body claims to be JSON but cannot be safely parsed, the endpoint returns text with a notice instead of silently changing its meaning. Plain-text content remains a string. Invalid UTF-8 binary data is described by its byte count and content type; raw bytes are not reflected.',
                'The endpoint accepts request bodies up to the platform’s 100 KiB limit, while the browser editor is bounded to 64 KiB. The resource has the standard mock request-rate limit and expires according to its lease. These bounds keep the tool suitable for debugging a small integration payload. Large file transport and persistent application storage belong to different tools.',
            ],
        },
        {
            id: 'repeat',
            title: 'Reproduce the result in a script',
            paragraphs: [
                'The same endpoint can be called directly with curl, through the TypeScript SDK request method, with kivel api in the CLI or SSH gateway, or using MCP call_mock_api. For a private endpoint, provide the caller token separately. Management operations continue to use the /api/mocks/{id} lifecycle with management authority.',
                'Once the basic request looks right, move the real integration test to an endpoint you control. Use API test scenarios for a repeatable sequence with explicit checks and separate secret inputs. Use a webhook inbox if the sender is asynchronous and you need to inspect retained deliveries later. An echo response describes one request; it does not establish that an external system delivered a callback or that a business operation succeeded.',
            ],
        },
    ],
    related: [
        { title: 'Open HTTP echo', href: '/tools/http-echo/' },
        { title: 'Echo API reference', href: '/docs/http-echo/' },
        { title: 'API test scenarios', href: '/tools/api-test-scenarios/' },
    ],
};
export const echoDoc: DocPage = {
    slug: 'http-echo',
    title: 'HTTP echo endpoints',
    navTitle: 'HTTP echo',
    group: 'Resources',
    updatedAt: '2026-10-27',
    description:
        'Create a private temporary HTTP echo endpoint and inspect request metadata and bodies through curl, SDK, CLI, SSH and MCP with no retained request history.',
    sections: [
        {
            id: 'create',
            title: 'Create an echo resource',
            paragraphs: [
                'POST /api/mocks with {name, routes: [], echo: true}. Echo mode cannot be combined with static routes or a CRUD collection. Private sharing is the default. The response contains the resource ID, endpointUrl, expiry, managementToken and separate accessToken. Save credentials securely; tokens are never added to endpoint URLs.',
            ],
            code: {
                title: 'Configuration JSON',
                value: '{\n  "name": "Client request check",\n  "routes": [],\n  "echo": true\n}',
            },
        },
        {
            id: 'call',
            title: 'Call and inspect the endpoint',
            paragraphs: [
                'Call /mock/{id} or append a relative path. GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS are supported. The response is HTTP 200 JSON; HEAD omits its body. A browser CORS preflight returns 204. Private callers supply X-Access-Token or workspace authorization. Management tokens cannot call private endpoints.',
                'The JSON response contains method, path, query, headers, contentType, body, receivedAt and notice. path is the relative path after /mock/{id}. Query values can be strings or arrays. body contains kind (empty, json, text or binary), bytes, optional value and optional notice. receivedAt is the server observation time. The UI round trip is measured by the browser.',
            ],
            code: {
                title: 'SDK request',
                value: 'const observed = await socket.request(\n  "POST", `/mock/${id}/check?source=sdk`,\n  { event: "demo.created", data: { id: "demo_1" } }, accessToken\n);\nconsole.log(observed.body.value);',
            },
        },
        {
            id: 'privacy',
            title: 'Redaction and retention',
            paragraphs: [
                'Credential-like field names are redacted recursively in headers, query and parsed JSON. Supplied authorization values of at least eight characters are removed from reflected text. Nested values beyond eight levels are omitted. Unparseable JSON is shown as text; arbitrary text does not receive field-name redaction. Invalid UTF-8 binary contents are not reflected.',
                'Requests are processed by the server but not retained in resource history. The resource stores configuration and a use count. Public sharing allows anyone with the endpoint to use it. Do not send real credentials or customer data; these redaction rules cannot recognize all sensitive values.',
            ],
        },
        {
            id: 'clients',
            title: 'Lifecycle, clients and limits',
            paragraphs: [
                'Use GET, PUT and DELETE /api/mocks/{id} for management. Sharing and renewal use the existing /sharing and /renew routes. There is no echo-history API, and reset is only for CRUD collections. Expired, deleted and unauthorized private resources return 404.',
                'The SDK request method and CLI api command accept /mock/ paths, using the separate caller token. SSH uses the same CLI commands. MCP create_mock_api accepts echo: true and empty routes; call_mock_api invokes the endpoint with method, path, optional JSON object body and optional accessToken.',
                'Bodies are limited to 100 KiB by the platform; the web editor allows 64 KiB. Endpoints use the existing 120-request-per-minute mock limit and resource storage/lifecycle quotas. This tool does not forward traffic, execute arbitrary code, retain capture history or expose a client IP field.',
            ],
        },
    ],
    related: [
        { title: 'Open echo workbench', href: '/tools/http-echo/' },
        { title: 'HTTP debugging guide', href: '/blog/debug-http-clients-with-an-echo-endpoint/' },
        { title: 'Webhook inbox', href: '/tools/webhook-inbox/' },
    ],
};
