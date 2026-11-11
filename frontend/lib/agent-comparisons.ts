import type { Comparison } from './comparisons';

// Email and agent-infrastructure comparisons. Competitor facts come from the linked official pages.
export const agentComparisons: Comparison[] = [
    {
        slug: 'agentmail',
        name: 'AgentMail',
        focus: 'Email for AI agents',
        description:
            'An AgentMail alternative: Kivel gives your agent an email inbox with codes and links extracted, plus webhooks, mocks, 2FA codes and approvals in one MCP server.',
        summary:
            'Both give AI agents real email inboxes over an API and a hosted MCP server. Kivel puts that inbox next to everything else an agent needs to finish a sign-up or an integration test: webhook URLs, mock APIs and OAuth, 2FA codes, monitors, memory and human approval, with workspace plan limits.',
        kivelFit:
            'Pick Kivel when email is one step in a bigger job: sign up, read the code, pass 2FA, catch the webhook that follows and ask you before anything risky, all through one MCP connection.',
        otherFit:
            'AgentMail suits teams that only need email at high volume or on their own domains today.',
        rows: [
            {
                topic: 'What you get',
                kivel: 'Email inboxes plus webhook URLs, mock APIs and OAuth, 2FA authenticators, monitors, memory, human approval and developer utilities.',
                other: 'Email inboxes, threads, drafts and a calendar API.',
            },
            {
                topic: 'Codes and links',
                kivel: 'Every message comes back with one-time codes and verification links already extracted, verification links first.',
                other: 'Reply and attachment extraction; no dedicated one-time-code extraction is documented.',
            },
            {
                topic: '2FA after sign-up',
                kivel: 'Built-in TOTP authenticators, so the agent can pass two-factor prompts on accounts you authorized.',
                other: 'Not offered.',
            },
            {
                topic: 'Price of the first paid plan',
                kivel: 'Pro raises inbox and sending limits. See Kivel pricing for the monthly rate.',
                other: 'Developer is $20 a month: 10 inboxes and 10,000 emails a month.',
            },
            {
                topic: 'Free plan',
                kivel: '1 inbox and 30 sends a month, plus webhooks, mocks and utilities that need no sign-up.',
                other: '3 inboxes and 3,000 emails a month, no card required.',
            },
        ],
        limitations:
            'Kivel addresses use a shared Kivel domain; custom domains are planned. The Free plan has smaller email allowances. Pro raises inbox and sending limits.',
        sources: [
            { title: 'AgentMail pricing', url: 'https://www.agentmail.to/pricing' },
            { title: 'AgentMail documentation', url: 'https://docs.agentmail.to/' },
            {
                title: 'AgentMail MCP server',
                url: 'https://agentmail.to/docs/integrations/mcp.md',
            },
            {
                title: 'AgentMail reply extraction',
                url: 'https://agentmail.to/docs/reply-extraction.md',
            },
        ],
        tools: [
            { title: 'Agent email inbox', href: '/tools/temporary-email-inbox/' },
            { title: 'Agent authenticator', href: '/tools/agent-authenticator/' },
            { title: 'Webhook inbox', href: '/tools/webhook-inbox/' },
            { title: 'Connect your agent', href: '/connect/' },
        ],
        reviewedAt: '2026-11-05',
        bestFor: {
            kivel: [
                'Your agent signs up for services and needs the code, the 2FA and the webhook',
                'You want one MCP server instead of one per capability',
                'You want approval before risky steps, built in',
                'You want to start with a free workspace',
            ],
            other: ['You send thousands of emails a month', 'You need your own domain today'],
        },
        faqs: [
            {
                question: 'What is an alternative to AgentMail for coding agents?',
                answer: 'Kivel gives AI agents email inboxes with extracted codes and links. Its workspace tools include webhook URLs, mock APIs, 2FA codes and approvals.',
            },
            {
                question: 'Is AgentMail free?',
                answer: 'Yes. AgentMail lists a free plan with 3 inboxes and 3,000 emails a month and no credit card. Paid plans start at $20 a month.',
            },
            {
                question: 'Does Kivel have an MCP server like AgentMail?',
                answer: 'Yes. Kivel is a hosted MCP server at kivel.io/mcp. One connection covers email, webhooks, mocks, files, monitors, memory, authenticators and approvals.',
            },
            {
                question: 'Can my agent get verification codes from email with Kivel?',
                answer: 'Yes. wait_for_email blocks until mail arrives and returns one-time codes and verification links already extracted, so the agent does not have to parse the message.',
            },
            {
                question: 'Can Kivel send email?',
                answer: 'Yes. Agents can send and reply from their inbox, with threading, daily and monthly limits, and an unsubscribe footer. Free accounts send after verifying the owner email.',
            },
        ],
    },
    {
        slug: 'mailtrap',
        name: 'Mailtrap',
        focus: 'Email testing',
        description:
            'A Mailtrap alternative for AI agents: Kivel inboxes receive real email from any service, extract codes and links, and come with webhooks, mocks and 2FA.',
        summary:
            'Mailtrap Email Sandbox catches the email your own app sends from staging. Kivel gives you and your agents real inboxes that receive email from any service, which is what an end-to-end sign-up test or an agent that registers for tools actually needs.',
        kivelFit:
            'Pick Kivel when the email comes from somewhere else, such as a third-party sign-up, a password reset or a vendor notification, or when an AI agent needs to read it and act.',
        otherFit:
            'Mailtrap fits when you only need to catch and preview the emails your own application sends.',
        rows: [
            {
                topic: 'Receiving email',
                kivel: 'Real inboxes that receive email from any sender on the internet.',
                other: 'A sandbox that catches mail your own app sends to it over SMTP or API.',
            },
            {
                topic: 'Built for agents',
                kivel: 'Hosted MCP server; wait_for_email returns codes and links already extracted.',
                other: 'A local MCP server for sending and reading sandbox messages; no code extraction documented.',
            },
            {
                topic: 'Beyond email',
                kivel: 'Webhook URLs, mock APIs and OAuth, 2FA authenticators, monitors, memory and approvals.',
                other: 'Email sending and the email sandbox.',
            },
            {
                topic: 'Price of the first paid plan',
                kivel: 'Pro raises email allowances. See Kivel pricing for the monthly rate.',
                other: 'Sandbox Basic is $17 a month for 500 test emails and 1 sandbox.',
            },
            {
                topic: 'Free plan',
                kivel: '1 inbox plus no-sign-up webhooks, mocks and 170 tools.',
                other: 'Sandbox Free: 50 test emails a month, 10 kept per sandbox.',
            },
        ],
        limitations:
            'Kivel does not render client previews or spam scores for emails your app sends; use it for real inbound email and agent workflows.',
        sources: [
            { title: 'Mailtrap pricing', url: 'https://mailtrap.io/pricing/' },
            { title: 'Mailtrap Email Sandbox', url: 'https://mailtrap.io/email-sandbox/' },
            {
                title: 'Mailtrap MCP server',
                url: 'https://docs.mailtrap.io/for-ai-agents/tools/mcp-server',
            },
        ],
        tools: [
            { title: 'Agent email inbox', href: '/tools/temporary-email-inbox/' },
            { title: 'Email verification tester', href: '/tools/email-verification-tester/' },
            { title: 'Mock SMTP', href: '/tools/mock-smtp/' },
        ],
        reviewedAt: '2026-11-05',
        bestFor: {
            kivel: [
                'You test sign-up or reset flows that send from a real service',
                'An AI agent needs to read the email and continue',
                'You also need webhooks, mocks or 2FA in the same test',
                'You want a paid plan for $2, not $17',
            ],
            other: ['You only preview the emails your own app sends'],
        },
        faqs: [
            {
                question: 'What is a Mailtrap alternative for AI agents?',
                answer: 'Kivel gives agents real inboxes over a hosted MCP server, with one-time codes and links extracted from each message. Mailtrap Sandbox only catches mail your own application sends.',
            },
            {
                question: 'Is Mailtrap free?',
                answer: 'Mailtrap lists a free Sandbox plan with 50 test emails a month. Sandbox Basic starts at $17 a month.',
            },
            {
                question: 'Can Mailtrap receive email from other websites?',
                answer: 'Mailtrap Sandbox catches messages your app sends to it. To receive email from third-party services, use a real inbox such as a Kivel email inbox.',
            },
            {
                question: 'Does Kivel catch the emails my app sends?',
                answer: 'Yes. Mock SMTP captures mail your app sends without delivering it, and agent email inboxes receive real mail from anywhere.',
            },
        ],
    },
    {
        slug: 'mailinator',
        name: 'Mailinator',
        focus: 'Disposable email',
        description:
            'A private Mailinator alternative: Kivel inboxes are private to your workspace, can send and reply, extract codes and links, and include webhooks and mocks.',
        summary:
            'Mailinator public inboxes are free and need no sign-up, but anyone can read them and they cannot send. Kivel inboxes are private to your workspace, send and reply, extract codes for your agent, and sit next to webhooks, mocks and approvals.',
        kivelFit:
            'Pick Kivel when the email holds something you would not post publicly, such as a login code or reset link, or when your agent must reply.',
        otherFit: 'Mailinator public inboxes fit throwaway checks where privacy does not matter.',
        rows: [
            {
                topic: 'Privacy',
                kivel: 'Inboxes are private to your workspace. Attachments download through signed links.',
                other: 'Public inboxes are readable and deletable by anyone; private domains need a plan.',
            },
            {
                topic: 'Sending',
                kivel: 'Send and reply from the inbox, with threading.',
                other: 'Receive-only; it cannot send email.',
            },
            {
                topic: 'Built for agents',
                kivel: 'Hosted MCP server with codes and links extracted for every message.',
                other: 'A local CLI-based MCP server with list and read tools.',
            },
            {
                topic: 'Beyond email',
                kivel: 'Webhook URLs, mock APIs and OAuth, monitors, memory, approvals and 170 tools.',
                other: 'TOTP authenticator, email webhooks and SMS testing.',
            },
            {
                topic: 'Price of the first paid plan',
                kivel: 'Free to start. See Kivel pricing for paid plans.',
                other: 'Business is $79 a month, billed yearly.',
            },
        ],
        limitations:
            'Kivel inboxes need a free account, while Mailinator public inboxes need none. Webhook URLs, mocks and utilities on Kivel work without an account.',
        sources: [
            { title: 'Mailinator pricing', url: 'https://www.mailinator.com/pricing/' },
            { title: 'Mailinator FAQ', url: 'https://www.mailinator.com/mailinator-faqs/' },
            {
                title: 'Mailinator public mailboxes',
                url: 'https://mailinator.com/documentation/docs/core/publicmailbox/',
            },
            {
                title: 'Mailinator MCP server',
                url: 'https://mailinator.com/documentation/docs/ai-agents/mailinator-mcp/',
            },
        ],
        tools: [
            { title: 'Agent email inbox', href: '/tools/temporary-email-inbox/' },
            { title: 'Agent authenticator', href: '/tools/agent-authenticator/' },
            { title: 'Webhook inbox', href: '/tools/webhook-inbox/' },
        ],
        reviewedAt: '2026-11-05',
        bestFor: {
            kivel: [
                'The email contains a login code or reset link',
                'Your agent needs to reply or send',
                'You want codes and links extracted automatically',
                'You want a paid plan for $2, not $79',
            ],
            other: ['A public, throwaway check where anyone may read the mail'],
        },
        faqs: [
            {
                question: 'Are Mailinator inboxes private?',
                answer: 'Not the public ones. Mailinator says public inboxes are readable and deletable by anyone and auto-delete after a few hours. Private domains require a plan.',
            },
            {
                question: 'What is a private alternative to Mailinator?',
                answer: 'Kivel email inboxes are private to your workspace, send and reply, and return extracted codes and links.',
            },
            {
                question: 'Can Mailinator send email?',
                answer: 'No. Mailinator describes itself as receive-only. Kivel inboxes can send and reply.',
            },
            {
                question: 'Is there a Mailinator alternative with an MCP server for agents?',
                answer: 'Yes. Kivel is a hosted MCP server: no local install, and the same connection gives agents webhooks, mocks, 2FA codes and approvals.',
            },
        ],
    },
    {
        slug: 'requestbin',
        name: 'RequestBin',
        focus: 'Webhook inspection',
        description:
            'Looking for a RequestBin alternative? Kivel gives you a private webhook URL in one click, no sign-up, with custom responses, replay, signature checks and an MCP server for agents.',
        summary:
            'RequestBin.com now redirects to Pipedream, which says its Workflows product no longer accepts sign-ups and shuts down on March 31, 2027. Kivel gives you a webhook inbox in one click with no account: private by default, with custom responses, replay, signature verification and forwarding.',
        kivelFit:
            'Pick Kivel when you want to catch a webhook right now, keep the payloads private, check its signature and replay it, or let an AI agent wait for it.',
        otherFit: 'Existing Pipedream users can keep using their bins until Workflows shuts down.',
        rows: [
            {
                topic: 'Getting started',
                kivel: 'One click, no account. A free account keeps inboxes for up to seven days.',
                other: 'requestbin.com redirects to Pipedream, which is not accepting new Workflows sign-ups.',
            },
            {
                topic: 'Privacy',
                kivel: 'Private by default: senders need a token and reading history needs a separate credential.',
                other: 'HTTP triggers are public by default unless you add authorization.',
            },
            {
                topic: 'Working with requests',
                kivel: 'Any method and sub-path, parsed JSON, form, multipart and XML, custom responses, replay and signature checks for Stripe, GitHub, Shopify, Slack and more.',
                other: 'An HTTP trigger with an event inspector inside a workflow.',
            },
            {
                topic: 'Built for agents',
                kivel: 'wait_for_webhook over a hosted MCP server, next to email, mocks and approvals.',
                other: 'No MCP tool for inspecting requests.',
            },
            {
                topic: 'Future',
                kivel: 'Actively developed, free to start,',
                other: 'Pipedream Workflows shuts down on March 31, 2027.',
            },
        ],
        limitations:
            'Kivel bodies are capped at 100 KiB per request, and inboxes keep up to 100 requests anonymously or 1,000 on a free account.',
        sources: [
            {
                title: 'Pipedream Workflows shutdown notice',
                url: 'https://pipedream.com/docs/workflows',
            },
            {
                title: 'Pipedream HTTP triggers',
                url: 'https://pipedream.com/docs/workflows/building-workflows/triggers',
            },
            { title: 'Pipedream pricing', url: 'https://pipedream.com/pricing' },
        ],
        tools: [
            { title: 'Webhook inbox', href: '/tools/webhook-inbox/' },
            { title: 'Request replay', href: '/tools/request-replay/' },
            { title: 'HTTP echo', href: '/tools/http-echo/' },
        ],
        reviewedAt: '2026-11-05',
        bestFor: {
            kivel: [
                'You need a webhook URL now, without an account',
                'Payloads should stay private',
                'You want to verify signatures and replay requests',
                'An AI agent should wait for the webhook',
            ],
            other: ['You already run workflows on Pipedream'],
        },
        faqs: [
            {
                question: 'Is RequestBin shut down?',
                answer: 'requestbin.com now redirects to Pipedream. Pipedream says Workflows no longer accepts sign-ups or subscriptions and will shut down on March 31, 2027.',
            },
            {
                question: 'What is the best RequestBin alternative?',
                answer: 'Kivel creates a private webhook inbox in one click with no sign-up, with custom responses, replay, signature verification and an MCP server for AI agents.',
            },
            {
                question: 'Are RequestBin URLs private?',
                answer: 'Pipedream HTTP triggers are public by default unless you add authorization. Kivel inboxes are private by default.',
            },
            {
                question: 'How long does Kivel keep webhook requests?',
                answer: 'Anonymous inboxes start with one hour and 100 requests. A free account keeps them for up to seven days with up to 1,000 requests per inbox.',
            },
        ],
    },
    {
        slug: 'mailosaur',
        name: 'Mailosaur',
        focus: 'Email testing',
        description:
            'A free Mailosaur alternative: Kivel gives you and your AI agents real inboxes with codes and links extracted, a hosted MCP server, webhooks and mocks. Free to start,',
        summary:
            'Mailosaur is a paid email and SMS testing service with a 14-day trial. Kivel is free to start and gives AI agents real inboxes over a hosted MCP server, with one-time codes and links extracted, plus webhook URLs, mock APIs, 2FA codes and approvals.',
        kivelFit:
            'Pick Kivel when you want to start free, connect an AI agent over MCP, or test email together with webhooks and mock APIs.',
        otherFit:
            'Mailosaur fits QA teams that need real-device email previews or SMS testing today.',
        rows: [
            {
                topic: 'Getting started',
                kivel: 'Free plan; webhooks, mocks and utilities need no account.',
                other: '14-day trial, then a paid plan.',
            },
            {
                topic: 'Price',
                kivel: 'Free to start. See Kivel pricing for paid plans.',
                other: 'Personal is from $20 a month and Core from $50 a month, billed annually.',
            },
            {
                topic: 'Built for agents',
                kivel: 'Hosted MCP server with codes and links extracted for every message.',
                other: 'No official MCP server.',
            },
            {
                topic: 'Beyond email',
                kivel: 'Webhook URLs, mock APIs and OAuth, monitors, memory and approvals.',
                other: 'SMS testing as an add-on, and a TOTP authenticator on Core and above.',
            },
            {
                topic: '2FA codes',
                kivel: 'TOTP authenticators on every plan, including Free.',
                other: 'Virtual authenticator on Core and above.',
            },
        ],
        limitations: 'Kivel does not offer device previews or SMS yet; phone numbers are planned.',
        sources: [
            { title: 'Mailosaur pricing', url: 'https://mailosaur.com/pricing' },
            { title: 'Mailosaur', url: 'https://mailosaur.com/' },
            { title: 'Mailosaur authenticator', url: 'https://mailosaur.com/docs/authenticator' },
        ],
        tools: [
            { title: 'Agent email inbox', href: '/tools/temporary-email-inbox/' },
            { title: 'Agent authenticator', href: '/tools/agent-authenticator/' },
            { title: 'Email verification tester', href: '/tools/email-verification-tester/' },
        ],
        reviewedAt: '2026-11-05',
        bestFor: {
            kivel: [
                'You want to start free, not with a trial',
                'An AI agent reads the email over MCP',
                'You need 2FA codes on a free plan',
                'Webhooks and mock APIs are part of the same test',
            ],
            other: ['You need real-device previews', 'You need SMS testing today'],
        },
        faqs: [
            {
                question: 'Is Mailosaur free?',
                answer: 'No. Mailosaur offers a 14-day trial, then plans from $20 a month billed annually. Kivel has a free plan, and',
            },
            {
                question: 'Does Mailosaur have an MCP server?',
                answer: 'Mailosaur does not list an official MCP server. Kivel is a hosted MCP server for email, webhooks, mocks, 2FA codes and approvals.',
            },
            {
                question: 'What is a cheaper alternative to Mailosaur?',
                answer: 'Kivel gives you real email inboxes with extracted codes and links, TOTP authenticators and webhook inboxes, with a free plan to get started.',
            },
        ],
    },
    {
        slug: 'smee-io',
        name: 'Smee.io',
        focus: 'Webhook delivery to localhost',
        description:
            'A private Smee.io alternative: Kivel webhook inboxes keep history, require credentials to read, send custom responses and forward to your server, with an MCP server for agents.',
        summary:
            'Smee.io relays webhooks to your local app over Server-Sent Events, without storing them, and anyone with the channel ID can see the payloads. Kivel keeps a private, searchable history you can replay, answer with custom responses and forward to your server.',
        kivelFit:
            'Pick Kivel when you need to see a webhook after the fact, keep it private, verify its signature or replay it.',
        otherFit:
            'Smee.io fits a quick, open-source relay from GitHub to a laptop while it is connected.',
        rows: [
            {
                topic: 'History',
                kivel: 'Requests are stored and searchable, so you can inspect and replay them later.',
                other: 'Payloads are not stored on the server; they reach only clients connected at that moment.',
            },
            {
                topic: 'Privacy',
                kivel: 'Private by default with separate send and read credentials.',
                other: 'Channels are not authenticated; anyone with the channel ID can see the payloads.',
            },
            {
                topic: 'Responses',
                kivel: 'Custom status, headers, body and delay.',
                other: 'No custom responses.',
            },
            {
                topic: 'Built for agents',
                kivel: 'wait_for_webhook over a hosted MCP server.',
                other: 'No MCP server.',
            },
        ],
        limitations:
            'Kivel forwards captured requests to a public URL on Pro; to reach localhost, forward to a tunnel or replay from the inbox.',
        sources: [
            { title: 'Smee.io', url: 'https://smee.io/' },
            { title: 'Smee.io on GitHub', url: 'https://github.com/probot/smee.io' },
        ],
        tools: [
            { title: 'Webhook inbox', href: '/tools/webhook-inbox/' },
            { title: 'Request forwarding', href: '/tools/request-forwarding/' },
            { title: 'Request replay', href: '/tools/request-replay/' },
        ],
        reviewedAt: '2026-11-05',
        bestFor: {
            kivel: [
                'Payloads must stay private',
                'You need to look at a webhook after it arrived',
                'You want to verify signatures and replay',
                'An AI agent should wait for the webhook',
            ],
            other: ['A quick open-source relay to your laptop'],
        },
        faqs: [
            {
                question: 'Is Smee.io secure?',
                answer: 'Smee.io channels are not authenticated, so anyone with the channel ID can see the payloads, according to its README. Kivel inboxes are private by default.',
            },
            {
                question: 'Does Smee.io store webhooks?',
                answer: 'No. Payloads are not stored on the server and reach only clients connected at that moment. Kivel keeps a private history you can search and replay.',
            },
            {
                question: 'What is a Smee.io alternative with history?',
                answer: 'Kivel webhook inboxes store every request privately, with custom responses, replay, signature verification and forwarding on Pro.',
            },
        ],
    },
];
