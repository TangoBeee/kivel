import type { Article } from './articles';
import type { DocPage } from './docs';
import type { ToolDetail } from './tool-details';
const configuration = JSON.stringify(
    {
        name: 'Tasks API',
        routes: [],
        crud: {
            path: '/tasks',
            seed: [{ id: 'task_1', name: 'Review the checkout', status: 'todo' }],
        },
    },
    null,
    2,
);
export const crudDetails: ToolDetail[] = [
    {
        title: 'A mock that remembers changes',
        paragraphs: [
            'Start a collection from a JSON seed, then use real GET, POST, PUT, PATCH and DELETE requests. New records appear in subsequent reads. The workbench shows live records in a searchable, sortable table with pagination; inspect a row to edit its formatted JSON. Nested fields remain structured JSON rather than being flattened into misleading text.',
            'The seed and live records are separate. Reset restores the seed after confirmation, while applying a new configuration replaces it and resets the collection. Export configuration keeps the seed; Export live records snapshots the current data. Neither export includes sharing credentials.',
        ],
    },
    {
        title: 'Sharing and lifecycle are part of the tool',
        paragraphs: [
            'New resources are private. Callers supply a separate X-Access-Token header or authorized workspace access; management tokens control configuration and reset. Public sharing permits anyone who knows the endpoint to read and change records. Use synthetic test data. Each resource has its own records, expiry and storage allowance, and deletion removes its live state.',
            'Writes are serialized and checked against storage limits. Responses expose X-Mock-Revision; send X-Mock-If-Revision to reject a write based on an outdated collection with HTTP 409. The workbench uses this check and refreshes after conflicts instead of silently overwriting another caller’s changes.',
        ],
    },
    {
        title: 'Test a complete integration',
        paragraphs: [
            'Use in API scenarios prepares five requests: create a test record, read it, update its status, delete it, and verify the missing record. The draft contains a secret placeholder for private sharing; enter the access token separately. Opening a draft never runs it. Review the requests before sending them.',
            'This is one bounded collection per resource: 200 live records, 4 KiB per record and 128 KiB of live JSON. It is a temporary test API, with no relational queries, custom server code or production database guarantees. Hosted scenario execution requires a publicly reachable origin; local Docker endpoints can be tested directly with curl, SDK, CLI, SSH or MCP.',
        ],
    },
];
export const crudArticle: Article = {
    slug: 'stateful-crud-mocks-for-frontend-testing',
    publishedAt: '2026-10-27',
    icon: 'code',
    category: 'API testing',
    title: 'Test complete frontend flows with a stateful CRUD mock API',
    description:
        'Create realistic test records, exercise create and edit flows, restore seed data, and share a temporary CRUD API with clear access and lifecycle controls.',
    sections: [
        {
            id: 'state',
            title: 'Why a fixed JSON response is sometimes not enough',
            paragraphs: [
                'A static mock works well when you need to render a list or check an error message. It becomes less useful when the interface lets someone add a task, change its status and delete it. Returning the same list after every request hides bugs: the UI may appear to save successfully even though its next read loses the change.',
                'A stateful CRUD mock keeps a small collection behind an HTTP endpoint. Creating an item changes later reads, updating changes that item, and deleting makes it unavailable. That gives a frontend team a more realistic integration target before the application backend is ready. Keep static mocks for fixed response shapes, latency and failure cases; use a mutable collection when the interaction depends on earlier requests.',
            ],
        },
        {
            id: 'seed',
            title: 'Begin with a deliberate, repeatable seed',
            paragraphs: [
                'Choose a short collection path such as /tasks and a JSON array of synthetic records. Include the field types your interface actually renders: a string title, a numeric priority, a boolean flag or a nested display object. Give records stable string IDs when you need recognizable routes; missing seed IDs receive deterministic values. Do not paste customer records into a shared testing service.',
                'A useful seed contains a few distinct cases rather than hundreds of identical rows. A long name can expose layout problems; an empty optional value can exercise a fallback; different statuses can test filters in your application. The workbench validates seed structure before creation and shows the live records in a table after the endpoint is ready.',
            ],
            code: { title: 'A minimal collection configuration', value: configuration },
        },
        {
            id: 'requests',
            title: 'Exercise the same requests your application will send',
            paragraphs: [
                'GET on the collection returns data, total, limit, offset and revision. Request an item by appending its ID. POST adds a record and returns HTTP 201 with the created object, including a generated string ID when you omit one. PUT replaces the item’s fields, while PATCH merges top-level fields; nested objects are replaced as values rather than recursively merged. DELETE returns 204, and a later read returns 404.',
                'Collection reads accept limit and offset, a case-insensitive q search across serialized record content, and a top-level sort field with order=asc or desc. This deliberately small contract is easy to use from a web application. It does not infer database filters, resolve relationships or execute a query language. Inspect the actual list response instead of assuming the API returns a bare array.',
            ],
        },
        {
            id: 'sharing',
            title: 'Choose private or public access consciously',
            paragraphs: [
                'A newly created API is private. Its caller credential belongs in X-Access-Token, supplied separately from the endpoint URL. Your management credential controls configuration, lifecycle and reset; it is not a replacement caller credential. Workspace owners can also use authorized workspace access. A public endpoint allows anyone who knows its address to mutate records, not just read the list.',
                'A resource’s records are isolated from other mock resources. The endpoint still expires according to its lifecycle, and its stored data counts toward applicable resource and storage allowances. This makes it suitable for temporary demos and integration checks. It is not a durable database for an application that users depend on. Keep the configuration export in your own project when you need to recreate the environment.',
            ],
        },
        {
            id: 'conflicts',
            title: 'Make concurrent edits visible',
            paragraphs: [
                'Two developers can read the same record and then submit different edits. Without a guard, a later replacement can silently discard the earlier change. Each collection has a revision that advances after successful mutations and resets. Send the revision you read in X-Mock-If-Revision when writing; if another request has changed the collection, the server returns 409 and the current revision.',
                'The workbench uses this guard for record writes. A conflict keeps your draft available while refreshing the collection, allowing you to inspect the current record before trying again. The guard applies to the whole collection, so even an edit to a different item can trigger a refresh. That conservative behavior keeps the model understandable for a small temporary sandbox.',
            ],
        },
        {
            id: 'repeat',
            title: 'Turn a manual check into a reusable lifecycle test',
            paragraphs: [
                'The scenario action builds a five-step test that creates a temporary record, captures its generated ID, reads it, changes its status, deletes it and expects a 404 afterward. The configuration contains a declared-secret placeholder for private access, never the access token itself. Loading the draft does not send requests. Supply the caller credential separately and review the sequence before running it.',
                'The normal successful sequence cleans up its own record. If a request fails and execution stops, the test record may remain; inspect the table and delete it or restore the seed. Reset intentionally discards all live changes, so coordinate with anyone sharing the endpoint. Hosted scenario runners require a public network destination and cannot target localhost Docker addresses; direct HTTP clients and the platform MCP caller can exercise local deployments.',
            ],
        },
    ],
    related: [
        { title: 'Open the stateful CRUD tool', href: '/tools/stateful-crud-api/' },
        { title: 'CRUD API reference', href: '/docs/stateful-crud-mocks/' },
        { title: 'Reusable API scenarios', href: '/blog/reusable-api-test-scenarios/' },
    ],
};
export const crudDoc: DocPage = {
    slug: 'stateful-crud-mocks',
    title: 'Stateful CRUD mock API',
    navTitle: 'Stateful CRUD mocks',
    group: 'Resources',
    updatedAt: '2026-10-27',
    description:
        'Create a seeded collection, call its record endpoints, manage revisions and sharing, and reset live data through HTTP, SDK, CLI, SSH or MCP.',
    sections: [
        {
            id: 'create',
            title: 'Create and inspect a collection',
            paragraphs: [
                'POST /api/mocks with name, routes and crud. crud contains a single collection path and a seed array. routes may be empty, or contain non-overlapping static routes. Save the returned managementToken, accessToken, resource ID and expiry. Private is the default. GET /api/mocks/{id}, authenticated for management, returns configuration and crudState containing live records and revision.',
                'Collection paths use one segment starting with a letter, followed by letters, digits, underscores or hyphens, with at most 40 characters excluding the slash. IDs use 1–80 letters, digits, underscores or hyphens. Omitted seed IDs become seed_1, seed_2 and so on; omitted POST IDs receive a generated rec_ identifier. Duplicate IDs return 409.',
            ],
            code: { title: 'Configuration JSON', value: configuration },
        },
        {
            id: 'operations',
            title: 'Record operations',
            paragraphs: [
                'The base record URL is /mock/{id}{crud.path}. Use Content-Type: application/json for writes. Private callers send X-Access-Token, or use workspace authorization with resources:read for reads and resources:write for mutations. Management tokens alone cannot call private record endpoints.',
            ],
            table: {
                caption: 'Collection and record requests',
                headers: ['Method and suffix', 'Result'],
                rows: [
                    ['GET collection', '{data,total,limit,offset,revision}'],
                    ['GET /{recordId}', '200 record, or 404'],
                    ['POST collection', '201 created record'],
                    ['PUT /{recordId}', '200 replacement, ID remains unchanged'],
                    ['PATCH /{recordId}', '200 top-level merge; null remains a value'],
                    ['DELETE /{recordId}', '204; unknown ID returns 404'],
                    ['HEAD', 'GET status and revision, without a body'],
                ],
            },
            note: 'Public sharing permits reads and mutations by anyone who knows the endpoint.',
        },
        {
            id: 'query',
            title: 'Pagination, search and revision guards',
            paragraphs: [
                'Collection GET accepts limit=1..100 (default 50), offset=0..200, q up to 200 characters, sort as a top-level field name, and order=asc|desc. Search is case-insensitive across the record JSON. Numeric values sort numerically; other values sort as strings. Missing or null sort fields appear last.',
                'CRUD responses expose X-Mock-Revision. Send X-Mock-If-Revision with a nonnegative integer on writes to require an exact collection revision. A mismatch returns 409 without changing records. Successful mutations advance the revision; validation failures do not. CORS supports browser requests with explicit caller headers and exposes the revision header.',
            ],
        },
        {
            id: 'clients',
            title: 'SDK, CLI, SSH and MCP',
            paragraphs: [
                'SDK request accepts a relative /mock/ path and uses its fourth argument as the caller access token. The CLI api command follows the same rule for --token; /api/ management requests continue to use the management token. The SSH command gateway accepts the same CLI command. Do not put credentials in URLs.',
                'MCP create_mock_api accepts the same CRUD configuration. call_mock_api takes id, method, path, optional accessToken, optional object body and optional numeric revision. Its result includes status, body and the available revision. For management, resource_request supports inspect, update, reset, sharing, renew and delete. reset requires kind=mocks and management access. These operations use the HTTP handlers and their access and storage checks.',
            ],
            code: {
                title: 'SDK and CLI record requests',
                value: 'const record = await kivel.request("POST", `/mock/${id}/tasks`,\n  { name: "Check the receipt", status: "todo" }, accessToken);\n\n// CLI / SSH: provide a caller token separately\n// kivel api GET /mock/<id>/tasks --token <access-token>',
            },
        },
        {
            id: 'lifecycle',
            title: 'Reset, replace and expire',
            paragraphs: [
                'POST /api/mocks/{id}/reset restores the saved seed, advances the collection revision and returns {reset,records,revision}. PUT /api/mocks/{id} replaces the configuration and resets live data to its new seed. Replacing an existing CRUD configuration advances its revision as well. Neither operation extends expiry.',
                'Renewal, persistent-resource eligibility, deletion, sharing and storage follow the existing resource lifecycle and plan limits. A reset discards live changes but leaves the endpoint and sharing configuration in place. Export configuration and live records separately when you need both. PostgreSQL deployments retain live records across application restarts until expiry or deletion.',
            ],
        },
        {
            id: 'limits',
            title: 'Validation and limits',
            paragraphs: [
                'A record must be a JSON object with at most 40 top-level fields, 4 KiB of JSON and eight levels of nesting. Reserved prototype keys and unsafe numeric integers are rejected; keep large identifiers as strings. Seed data fits in 64 KiB, the complete mock configuration in 80 KiB, and live records in 128 KiB. Both seed and live collections allow at most 200 records.',
                'The mock endpoint permits up to 120 requests per minute per API. Existing global and account resource storage limits also apply; a rejected allocation does not partially commit a write. Validation errors return 400, stale revisions or duplicate IDs 409, unsupported media types 415, and missing, expired or unauthorized resources 404. A malformed record never changes the collection.',
            ],
        },
    ],
    related: [
        { title: 'Open CRUD workbench', href: '/tools/stateful-crud-api/' },
        {
            title: 'Practical CRUD testing guide',
            href: '/blog/stateful-crud-mocks-for-frontend-testing/',
        },
        { title: 'Lifecycle and limits', href: '/docs/limits-and-errors/' },
    ],
};
