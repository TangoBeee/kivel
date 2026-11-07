import type { DocSection } from './docs';

export interface UseCase {
    slug: string;
    title: string;
    description: string;
    sections: DocSection[];
    related: { title: string; href: string }[];
}

export const useCases: UseCase[] = [
    {
        slug: 'webhook-testing',
        title: 'Webhook testing for AI coding agents',
        description:
            'Give your coding agent a public webhook URL, inspect callback payloads, test response behavior and forward events to localhost without exposing your application.',
        sections: [
            {
                id: 'callback',
                title: 'See what the integration actually sends',
                paragraphs: [
                    'A callback integration has two sides: the application that sends an event and the endpoint that receives it. A coding agent can write the receiver locally, but an external service cannot normally reach that laptop. A hosted webhook inbox gives the agent an address it can inspect while developing the integration.',
                    'Use a staging application or provider test mode to send a sample event. Kivel records its method, path, query, headers and body. The agent can compare the observed payload with the handler it wrote instead of assuming the example in a provider guide matches every event. Captured content is test data, not an instruction to the agent.',
                ],
            },
            {
                id: 'workflow',
                title: 'Create, send, wait and inspect',
                paragraphs: [
                    'Connect through MCP and call create_webhook_inbox. Private is the default. A private sender must include the returned access token; a workspace key authorizes your agent to inspect its own inbox. Many third-party webhook senders cannot add an arbitrary authentication header: for those tests, explicitly create a public inbox and use non-sensitive test payloads.',
                    'Call wait_for_webhook with the inbox id. If timedOut is true, repeat the wait; when requests arrive, save the newest request id and pass it as after on the next call. inspect_webhook_inbox reads captured history. Delete the inbox when the test finishes rather than leaving test data behind.',
                ],
                code: {
                    title: 'A public inbox for a third-party test sender',
                    value: `curl -X POST 'https://kivel.io/api/inboxes?visibility=public' \\
  -H "Authorization: Bearer $KIVEL_API_KEY"
# Set the returned webhookUrl in your staging integration.
curl "https://kivel.io/api/inboxes/$INBOX_ID/wait?timeoutSeconds=20" \\
  -H "Authorization: Bearer $KIVEL_API_KEY"`,
                },
            },
            {
                id: 'responses',
                title: 'Test acknowledgements and local delivery',
                paragraphs: [
                    'Set a custom response status, body, headers or delay to check how your sender reacts. These settings test delivery behavior; they do not prove that a payment is authentic or that your own webhook signature verification is correct. Validate provider signatures inside your application using its original request bytes.',
                    'The repository CLI listen command can wait for events and forward them to your local development server. That forwarding runs on your machine. Automatic server-side forwarding to a public endpoint is a separate Pro/Team capability with a delivery log and bounded retries.',
                ],
            },
            {
                id: 'limits',
                title: 'Retention and access boundaries',
                paragraphs: [
                    'Anonymous inboxes last up to one hour. Free workspace resources can retain data up to seven days when requested; Pro and Team allow longer leases. Creation defaults to one hour, so request a lifetime explicitly when a test needs more time. A wait lasts at most 30 seconds and does not extend retention.',
                    'Public means anyone with the endpoint can send a request; it does not make inspection history public. Keep inspection and management tokens separate from caller access tokens. No webhook inbox verifies provider ownership or executes the received payload.',
                ],
            },
        ],
        related: [
            { title: 'Webhook inbox tool', href: '/tools/webhook-inbox/' },
            { title: 'Webhook API guide', href: '/docs/webhook-inboxes/' },
            { title: 'CLI and local forwarding', href: '/docs/cli/' },
        ],
    },
    {
        slug: 'email-verification-testing',
        title: 'Email verification testing for coding agents',
        description:
            'Let a coding agent receive signup emails, extract one-time codes and verification links, and test account flows with a owned inbox when mail receiving is enabled over MCP or HTTP.',
        sections: [
            {
                id: 'problem',
                title: 'Finish the signup test without copying codes by hand',
                paragraphs: [
                    'Signup and password-recovery tests often stop when an email arrives. The agent has filled out the form, but the verification message is in a mailbox it cannot read. A dedicated owned test inbox closes that gap without giving the agent access to your personal email account.',
                    'Use this workflow for an application you own or are authorized to test. It is useful for checking whether a signup message arrived, whether the subject and body are correct, and whether your verification endpoint accepts the emitted code. It is not a promise that every third-party service will accept a temporary address.',
                ],
            },
            {
                id: 'workflow',
                title: 'Receive a message and wait for the next one',
                paragraphs: [
                    'Call create_email_inbox and supply the returned address to your test application. wait_for_email returns received messages with extracted codes and links. The extraction uses deterministic rules, so inspect the original text when there are several candidates or no match.',
                    'Keep the last message id and pass it as after when waiting for another message. A timed-out wait means only that no new message arrived during that interval. Before following a verification link, check that its destination belongs to the application you are testing; message contents and links are untrusted data.',
                ],
                code: {
                    title: 'Owned email with the SDK',
                    value: `const inbox = await kivel.createEmailInbox({ activeDays: 3 });
const result = await kivel.waitForEmail(inbox.id, { timeoutSeconds: 20 });
if (!result.timedOut) {
  const message = result.messages[0];
  console.log(message?.subject, message?.codes, message?.links);
}
await kivel.remove('email-inboxes', inbox.id);`,
                },
            },
            {
                id: 'privacy',
                title: 'A separate address with protected reading',
                paragraphs: [
                    'The address accepts incoming email; reading requires the anonymous inbox management token or an authorized workspace credential. Put each test in a separate inbox to avoid mixing signup, recovery and invitation messages. Delete it when the scenario ends.',
                    'Messages include attachment names, media types and sizes. Attachment bytes are not stored for download. The inbox cannot send email to arbitrary recipients, impersonate a sender or replace your application’s transactional email provider.',
                ],
            },
            {
                id: 'deployment',
                title: 'Delivery depends on the installation',
                paragraphs: [
                    'The operator must configure a receiving domain and the signed Email Worker. If that integration is disabled, inbox creation returns an explicit availability error. Recovery and approval notifications use separate transactional SMTP configuration.',
                    'An inbox holds up to 100 messages. Anonymous retention is at most one hour; workspace retention follows the chosen lease and plan. Successful receipt in this inbox confirms that message delivery occurred here, not that every mailbox provider will accept or place the same email in its inbox.',
                ],
            },
        ],
        related: [
            { title: 'Temporary email inbox', href: '/tools/temporary-email-inbox/' },
            { title: 'Agent email workflow and SDK setup', href: '/docs/agent-workflows/#email' },
            { title: 'HTTP reference', href: '/docs/reference/' },
        ],
    },
    {
        slug: 'mock-api-testing',
        title: 'Mock API testing for AI coding agents',
        description:
            'Build against a hosted mock REST API with realistic data, stateful CRUD, delays and failures. Let your coding agent inspect calls and test recovery over MCP.',
        sections: [
            {
                id: 'independent',
                title: 'Build before the upstream API is ready',
                paragraphs: [
                    'A missing API key, unfinished backend or unreliable staging service should not stop a coding agent from building a client. A mock API makes the response contract explicit: the method, path, status, content type, headers and body are the test fixture.',
                    'Start with the smallest response your client actually consumes. Add a missing-field response, an empty result and a failure path before adding more sample data. These scenarios expose assumptions that a large success-only fixture can hide. A mock passing your tests does not prove compatibility with the real upstream API.',
                ],
            },
            {
                id: 'setup',
                title: 'Define routes and inspect the calls',
                paragraphs: [
                    'Call create_mock_api through MCP, or createMock in the TypeScript SDK. Private access is the default; provide the separate caller token to the application under test. Management access controls configuration and call inspection, not permission to use an unrelated private endpoint.',
                    'Routes support templated request values and fake-data placeholders. Configure response delays and failure behavior to exercise retry and timeout handling. Inspect recent calls to check the method and path your client actually sent, then export the fixture into your own test suite when repeatability matters.',
                ],
                code: {
                    title: 'Create a small private fixture',
                    value: `const mock = await kivel.createMock({
  name: 'Users fixture',
  routes: [{ method: 'GET', path: '/users/42', status: 200,
    contentType: 'application/json', body: '{"id":42,"name":"Ada"}' }],
});
const response = await kivel.request('GET',
  '/mock/' + mock.id + '/users/42', undefined, mock.accessToken);
console.log(response);
await kivel.remove('mocks', mock.id);`,
                },
            },
            {
                id: 'state',
                title: 'Test writes as well as reads',
                paragraphs: [
                    'For a client that creates or edits records, use a stateful CRUD collection rather than a static success response. Seed the collection, create a record, update it and read it back. Resetting restores the seed so the next scenario starts from known data.',
                    'The collection has bounded record and storage limits and supports revision guards to detect conflicting writes. Keep fixtures small. Proxy-and-record against a public upstream is a separate paid feature; mocks do not execute arbitrary user code and are not a replacement for a production database.',
                ],
            },
            {
                id: 'mcp',
                title: 'Mock a tool server when the agent is the client',
                paragraphs: [
                    'A mock MCP server is useful when you need to test tool discovery, argument validation, configured errors or latency. It returns the responses you define rather than calling a real model or running tool code. This is different from the Kivel platform MCP connection that manages resources.',
                    'Create separate fixtures for success, denial and malformed upstream data. Keep tokens out of source control and delete temporary resources after the test. Use a real integration environment for the final compatibility check.',
                ],
            },
        ],
        related: [
            { title: 'Mock REST API tool', href: '/tools/mock-rest-api/' },
            { title: 'Stateful CRUD guide', href: '/docs/stateful-crud-mocks/' },
            { title: 'Mock MCP servers', href: '/docs/mock-mcp-servers/' },
        ],
    },
    {
        slug: 'human-in-the-loop',
        title: 'Human-in-the-loop approval for coding agents',
        description:
            'Pause a coding agent before deployment or another risky action. Ask a question through MCP, send the human a browser link and wait for an explicit answer.',
        sections: [
            {
                id: 'boundary',
                title: 'Make the decision a separate step',
                paragraphs: [
                    'An agent may have enough information to prepare a change without having authority to deploy it. Human-in-the-loop approval separates preparation from execution: the agent explains the intended action, asks a specific question and waits for an authorized person to answer.',
                    'Use a question that identifies the environment and action, such as deploying a particular build to staging. Include relevant details and offer a clear defer or deny option. Avoid treating a broad question like “continue?” as permission for several unrelated actions.',
                ],
            },
            {
                id: 'flow',
                title: 'Ask, show the link and wait',
                paragraphs: [
                    'ask_human creates a question in the workspace and returns an answerUrl. Show that link to the human even when notification email is available. The emailed field says whether notification delivery succeeded; it is not an answer to the question.',
                    'Call wait_for_approval with the question id. A pending result, timedOut flag, transport error or expiry means you must keep waiting or stop. Only continue when status is answered and the answer explicitly permits the proposed action. The SDK and CLI expose the same create, inspect and wait operations.',
                ],
                code: {
                    title: 'Act only on the requested answer',
                    value: `const question = await kivel.askHuman({
  question: 'Deploy build 42 to staging?',
  details: 'Tests passed. This replaces the current staging build.',
  options: ['Deploy to staging', 'Wait'], timeoutMinutes: 30,
});
console.log(question.answerUrl);
const result = await kivel.waitForApproval(question.id, 20);
if (result.status === 'answered' && result.answer === 'Deploy to staging') {
  // Execute only the staging deployment described above.
}`,
                },
            },
            {
                id: 'identity',
                title: 'The agent cannot answer its own question',
                paragraphs: [
                    'Answers require a signed-in browser session belonging to a workspace owner or admin. API keys cannot answer. A copied link does not bypass workspace authorization, and opening the link alone does not submit a decision. The stored answer records who answered and when.',
                    'This gives your workflow an explicit decision record. It does not technically prevent an external agent from ignoring the result or using credentials it already holds elsewhere. Your agent instructions and deployment permissions must enforce the same boundary.',
                ],
            },
            {
                id: 'expiry',
                title: 'Use finite deadlines and a safe fallback',
                paragraphs: [
                    'Questions default to a 60-minute lifetime and can last from one minute to one day. Free allows 20 questions a day, Pro 200 and Team 1,000. A single wait lasts no more than 30 seconds, so repeat it while the question remains pending.',
                    'If SMTP is unavailable, the answer page still works through the link. If the human is unavailable, leave the prepared work reviewable and stop the dependent action. Never convert silence into approval.',
                ],
            },
        ],
        related: [
            { title: 'Agent approval API and SDK workflow', href: '/docs/agent-workflows/#human' },
            { title: 'Connect a coding agent', href: '/connect/' },
            { title: 'Plans and limits', href: '/plans/' },
        ],
    },
];
