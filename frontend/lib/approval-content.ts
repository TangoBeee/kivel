import type { DocPage } from './docs';

export const approvalDoc: DocPage = {
    slug: 'approvals',
    title: 'Human approvals for agent actions',
    navTitle: 'Human approvals',
    group: 'Resources',
    description:
        'Request human review for agent actions, retry safely with an idempotency key, inspect decision history, and configure signed reminders and escalation.',
    updatedAt: '2026-11-17',
    sections: [
        {
            id: 'request',
            title: 'Request a decision',
            paragraphs: [
                'An agent requests approval with POST /api/approvals, the MCP ask_human tool, the SDK askHuman method, or kivel approval ask. Add an action with a type, a human-readable target, and an optional summary. Keep credentials, raw arguments and other secrets out of the question and review context.',
                'Reuse an idempotencyKey when retrying the same request. HTTP also accepts the Idempotency-Key header. A matching retry returns the existing approval and its current state. Reusing the key with different input returns 409. The key is scoped to the caller and workspace.',
            ],
            code: {
                title: 'Request review before a production deploy',
                value: `{
  "question": "Deploy release 1.4 to production?",
  "action": {
    "type": "deploy.release",
    "target": "production",
    "summary": "Release 1.4 contains the new checkout."
  },
  "idempotencyKey": "deploy-release-1.4-production",
  "timeoutMinutes": 30
}`,
            },
        },
        {
            id: 'review',
            title: 'Review and audit',
            paragraphs: [
                'Open the answer link in a browser and sign in as a workspace owner or admin. Review the action, then select your answer. The first valid answer wins. Requests expire after the deadline, which defaults to 60 minutes and can range from 1 to 1440 minutes.',
                'List approvals with GET /api/approvals, SDK approvals, or kivel approval list. Filter by status, exact agent name or exact outcome. Pass nextCursor as cursor to read the next page. Read the timeline and notification attempts with the events and deliveries endpoints. MCP resource_request supports kind approvals with list, inspect, events, deliveries or policy.',
                'After proposing an action, wait with wait_for_approval, GET /api/approvals/{id}/wait, or kivel approval wait. Proceed only after an explicit affirmative answer for that action.',
            ],
        },
        {
            id: 'notifications',
            title: 'Configure signed notifications',
            paragraphs: [
                'In the Approvals dashboard, an owner or admin can set a public HTTPS notification URL, a reminder delay, and an escalation delay with an optional separate destination. Set escalation after the reminder. Both delays apply only while the request is pending and before its deadline. New requests use the schedule saved when they were created.',
                'The webhook sends an event ID, type, approval ID, review link, current status and deadline. It omits the question, notes, and action details. The signing secret is shown on setup or rotation. Check the HMAC SHA-256 over the exact request body prefixed with the timestamp and a dot. Read t and v1 from X-Kivel-Approval-Signature, use a constant-time comparison, and reject stale timestamps. Deduplicate using X-Kivel-Event-Id.',
                'A delivery can retry after network failures, 429 or server errors. The dashboard and GET /api/approvals/{id}/deliveries show the latest state, number of attempts and last HTTP status.',
            ],
        },
    ],
};
