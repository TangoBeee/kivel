import { echoArticle } from './echo-content';
import { crudArticle } from './crud-content';
import { mediaArticles } from './media-articles';
import { scenarioArticle } from './scenario-content';
import { paymentArticles } from './payment-articles';
import { guideArticles } from './guide-articles';
import type { IconName } from '../components/icons';
export interface ArticleSection {
    id: string;
    title: string;
    paragraphs: string[];
    steps?: string[];
    code?: { title: string; value: string };
}
export interface Article {
    slug: string;
    publishedAt: string;
    icon?: IconName;
    sources?: { title: string; url: string }[];
    title: string;
    description: string;
    category: string;
    sections: ArticleSection[];
    related: { title: string; href: string }[];
    /** ISO date of the last meaningful edit. Defaults to publishedAt. */
    updatedAt?: string;
    /** Plain questions and short answers, shown at the end and marked up as FAQPage. */
    faqs?: { question: string; answer: string }[];
}
export const articles: Article[] = [
    echoArticle,
    crudArticle,
    scenarioArticle,
    ...guideArticles,
    ...mediaArticles,
    ...paymentArticles,
    {
        slug: 'test-webhooks-without-a-server',
        publishedAt: '2026-10-25',
        icon: 'webhook',
        title: 'How to test webhooks without a server',
        category: 'Integration testing',
        description:
            'Capture a test callback, inspect its real payload, and debug delivery without deploying a receiver or exposing localhost.',
        sections: [
            {
                id: 'when',
                title: 'Start with the request, not a receiver',
                paragraphs: [
                    'A webhook is an HTTP request sent when something happens in another system. Before writing your handler, it helps to see the exact method, headers, query parameters, and body that the sender uses.',
                    'A temporary inbox gives that request a destination. Use a provider’s sandbox and synthetic data: an inbox stores the received body and query parameters, so a real customer payload can contain more information than you expect.',
                ],
            },
            {
                id: 'create',
                title: 'Create an inbox with the right access',
                paragraphs: [
                    'Open the Webhook inbox tool and create an inbox. New inboxes default to private. A private sender must supply the separate access token in the X-Access-Token header.',
                    'If a provider cannot add that header, explicitly choose public receiver access. Public means anyone who knows the endpoint can send a request. Viewing captured history still requires your management credential or workspace membership.',
                ],
                code: {
                    title: 'Create a public test receiver',
                    value: `curl -X POST 'https://socket.help/api/inboxes?visibility=public'`,
                },
            },
            {
                id: 'send',
                title: 'Send a small, recognizable event',
                paragraphs: [
                    'Save the returned webhookUrl, ID, expiry, and inspectionToken. Replace INBOX_ID below with the returned ID. A distinctive event ID makes retries and duplicates easy to spot.',
                ],
                code: {
                    title: 'Send a sample callback',
                    value: `curl -X POST https://socket.help/hooks/INBOX_ID \\
  -H 'Content-Type: application/json' \\
  -d '{"event":"order.created","id":"test-order-001"}'`,
                },
            },
            {
                id: 'inspect',
                title: 'Inspect what actually arrived',
                paragraphs: [
                    'Select the captured request in the browser or fetch history over HTTP. Compare the content type with the body, check repeated query parameters, and look for multiple deliveries of the same event.',
                    'Use the HTTP method filter to separate callback deliveries from probes. Search all fields to find an event ID, or choose Path, Text body, Headers or Query to narrow the match. Search is case-insensitive and runs on the history already loaded in your browser; binary bodies are not searched as if they were text. A matching count helps distinguish an empty inbox from a filter that hides its requests.',
                    'Sensitive header names are redacted before storage. If you need to test signature verification, use your own handler and test secret. An inbox inspection does not verify that a webhook signature is valid.',
                ],
                code: {
                    title: 'Read captured requests',
                    value: `curl https://socket.help/api/inboxes/INBOX_ID/requests \\
  -H "Authorization: Bearer $INBOX_INSPECTION_TOKEN"`,
                },
            },
            {
                id: 'debug',
                title: 'If the callback is missing',
                paragraphs: [
                    'Check the provider’s delivery log first. Confirm the full endpoint, receiver visibility, required access header, request size, and expiry. Anonymous inboxes accept up to 100 requests or 1 MiB of stored history; individual bodies are limited to 100 KiB.',
                    'Private access failures, full history, expired resources, and rate limits can all prevent capture. Do not repeatedly retry without checking the response status. Delete the inbox when the test is finished; otherwise its lifetime starts at one hour.',
                ],
            },
        ],
        related: [
            { title: 'Create a webhook inbox', href: '/tools/webhook-inbox/' },
            { title: 'API authentication and cleanup', href: '/docs/' },
            { title: 'Webhook.site comparison', href: '/compare/webhook-site/' },
        ],
    },
    {
        slug: 'public-vs-private-file-sharing',
        publishedAt: '2026-10-25',
        icon: 'files',
        title: 'Public or private file sharing: which should you use?',
        category: 'Files & access',
        description:
            'Choose the right access for a temporary file, keep tokens out of links, and understand one-time downloads, previews, and expiry.',
        sections: [
            {
                id: 'choice',
                title: 'Choose who should be able to download',
                paragraphs: [
                    'A public file share works for anyone who knows its link. It is convenient for disposable test fixtures or a file you are comfortable making accessible to link holders. Forwarding the link forwards access.',
                    'A private share needs the link and a separate access token, or current access to the owning workspace. Private is the default in socket.help. It is useful when the link itself might be forwarded or pasted into a place with a wider audience.',
                ],
            },
            {
                id: 'separate',
                title: 'Keep the link and token separate',
                paragraphs: [
                    'The browser sharing link contains only the file’s resource ID. The recipient opens it and enters the access token. Send that token through a separate trusted channel. Do not append it to the URL, query string, or fragment.',
                    'Scripts download from /files/FILE_ID using the X-Access-Token header. Keep credentials in your environment or secret manager rather than committing them to source control. A private token controls access; it is not end-to-end encryption.',
                ],
                code: {
                    title: 'Download a private file',
                    value: `curl --fail https://socket.help/files/FILE_ID \\
  -H "X-Access-Token: $FILE_ACCESS_TOKEN" \\
  --output received-file.txt`,
                },
            },
            {
                id: 'management',
                title: 'Sharing is different from management',
                paragraphs: [
                    'The access token lets a recipient download. An anonymous management token controls the resource’s sharing settings and deletion. It does not unlock a private download. Account-owned shares are managed through workspace permissions.',
                    'If a sharing token leaks, rotate it from the resource controls and send the replacement to authorized recipients. The old token stops working. Previously downloaded copies remain outside the service’s control.',
                ],
            },
            {
                id: 'one-time',
                title: 'Understand what one-time means',
                paragraphs: [
                    'A one-time share accepts one download request. Once the last permitted download is consumed, stored file contents are removed. Metadata remains until expiry or deletion.',
                    'Opening a preview consumes a download too. A recipient can save the already fetched bytes from the preview without another server download. Anyone who downloads a file can keep or copy it; one-time access cannot revoke that copy.',
                ],
            },
            {
                id: 'lifetime',
                title: 'Set expectations before sharing',
                paragraphs: [
                    'Files are limited to 10 MiB and start with a one-hour lifetime. Retention can be extended within the owning plan’s limits. Check the displayed expiry and remaining downloads before sending a link.',
                    'Previews are available for supported text, JSON, images, audio, and video. Other formats download as attachments. Files are not scanned for malware. Use trusted files, keep an original copy, and delete a share when it is no longer needed.',
                ],
            },
        ],
        related: [
            { title: 'Share a temporary file', href: '/tools/temporary-file-transfer/' },
            { title: 'One-time download links', href: '/tools/one-time-download-links/' },
            { title: 'Data handling and cleanup', href: '/privacy/' },
        ],
    },
    {
        slug: 'mock-api-error-responses',
        publishedAt: '2026-10-25',
        icon: 'cube',
        title: 'Test API errors before your users find them',
        category: 'API development',
        description:
            'Use predictable mock responses to test loading states, validation errors, server failures, and delays without depending on a live upstream API.',
        sections: [
            {
                id: 'why',
                title: 'A successful response is only one case',
                paragraphs: [
                    'A client can work perfectly against a 200 response and still break when a request is slow or fails. A small mock API makes those cases repeatable while your real backend is changing.',
                    'Start with the states your interface actually displays: loading, usable data, an empty result, a validation problem, and an unavailable service. Keep fixtures small enough that another developer can understand them at a glance.',
                ],
            },
            {
                id: 'routes',
                title: 'Create explicit routes for each state',
                paragraphs: [
                    'Open Mock REST API, name the resource, and configure a method, exact path, status, body, and optional delay for each route. The Response builder, HTTP status simulator, and Delay & timeout simulator use the same mock service with different starting points.',
                    'Use separate paths for deterministic test cases. This mock service returns static configured responses; it does not run application code, maintain a CRUD database, or change state automatically between calls.',
                ],
                steps: [
                    'GET /orders returns 200 with a small JSON array.',
                    'GET /empty returns 200 with an empty array.',
                    'POST /invalid returns 422 with a validation message.',
                    'GET /unavailable returns 503 with a safe error body.',
                ],
            },
            {
                id: 'assert',
                title: 'Assert the behavior, not just the status',
                paragraphs: [
                    'Point a test build at the returned mock base URL. Private mocks require X-Access-Token or authorized workspace access. Explicitly choose public access only when that is appropriate for your test.',
                    'For a validation error, check that the form keeps the entered values and shows the right message. For a server failure, check that loading ends and retry is possible. An empty array should show a helpful empty state rather than a spinner forever.',
                ],
            },
            {
                id: 'delay',
                title: 'Make loading and timeout behavior visible',
                paragraphs: [
                    'Add a delay to one route and verify that the loading state appears, repeated submissions are prevented where needed, and focus remains usable. socket.help supports configured delays up to two seconds.',
                    'A delay is a response-time simulation, not a complete network failure simulator. For a timeout test, your client timeout must be shorter than the configured delay. Test connection loss with a tool designed to control the network.',
                ],
            },
            {
                id: 'cleanup',
                title: 'Keep the mock disposable',
                paragraphs: [
                    'Mock APIs support up to 20 routes and 80 KiB of configuration. They start with a one-hour lifetime, and renewal stays within plan limits. Save important fixtures in your project before the resource expires.',
                    'Delete the mock when the test ends. If you need response templating, proxying, recording, or richer reusable mock environments, a dedicated platform such as Mockoon may be a better fit.',
                ],
            },
        ],
        related: [
            { title: 'Create a mock REST API', href: '/tools/mock-rest-api/' },
            { title: 'Simulate HTTP status codes', href: '/tools/http-status-simulator/' },
            { title: 'Mockoon comparison', href: '/compare/mockoon/' },
        ],
    },
];
