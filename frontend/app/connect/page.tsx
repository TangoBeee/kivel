import Link from 'next/link';
import { catalog } from '../../lib/catalog';
const utilityCount = catalog.filter((tool) => tool.status === 'available').length;
import { PageIntro, StructuredData } from '../../components/content-layout';
import { ClientTabs } from '../../components/client-tabs';
import { CopyPrompt } from '../../components/home/copy-prompt';
import { Icon } from '../../components/icons';
import { pageMetadata } from '../../lib/seo';
import { setupPrompt } from '../../lib/setup-prompt';
import { siteOrigin } from '../../lib/site';

export const metadata = pageMetadata(
    'Connect your AI agent',
    `Connect socket.help to your MCP client. Give agents webhook inboxes, mocks, files and ${utilityCount} tools, with scoped workspace keys and browser approval.`,
    '/connect/',
);

const endpoint = `${siteOrigin}/mcp`;

const clients: { id: string; name: string; where: string; code: string; note?: string }[] = [
    {
        id: 'claude-code',
        name: 'Claude Code',
        where: 'Run in your terminal',
        code: `claude mcp add --transport http socket-help ${endpoint} \\
  --header "Authorization: Bearer $SOCKET_HELP_API_KEY"`,
        note: 'Leave out the --header line to try it without an account; anonymous limits apply.',
    },
    {
        id: 'cursor',
        name: 'Cursor',
        where: '~/.cursor/mcp.json',
        code: `{
  "mcpServers": {
    "socket-help": {
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer sh_your_api_key" }
    }
  }
}`,
    },
    {
        id: 'codex',
        name: 'Codex',
        where: '~/.codex/config.toml',
        code: `[mcp_servers.socket-help]
url = "${endpoint}"
bearer_token_env_var = "SOCKET_HELP_API_KEY"`,
    },
    {
        id: 'vscode',
        name: 'VS Code',
        where: '.vscode/mcp.json',
        code: `{
  "servers": {
    "socket-help": {
      "type": "http",
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer \${input:socket-help-key}" }
    }
  },
  "inputs": [
    {
      "id": "socket-help-key",
      "type": "promptString",
      "description": "socket.help API key",
      "password": true
    }
  ]
}`,
    },
    {
        id: 'chatgpt',
        name: 'ChatGPT',
        where: 'Settings › Apps & Connectors › Developer mode',
        code: `Name:            socket.help
MCP server URL:  ${endpoint}
Authentication:  None (anonymous limits)`,
        note: 'Custom connectors need developer mode. Without a key, resources last one hour.',
    },
    {
        id: 'any',
        name: 'Any MCP client',
        where: 'Streamable HTTP',
        code: `URL:     ${endpoint}
Header:  Authorization: Bearer sh_your_api_key
Accept:  application/json, text/event-stream`,
    },
];

const tools: { name: string; does: string }[] = [
    { name: 'create_webhook_inbox', does: 'A private URL that captures any HTTP request.' },
    { name: 'wait_for_webhook', does: 'Block until the inbox receives a request.' },
    { name: 'inspect_webhook_inbox', does: 'Read captured requests: method, headers, body.' },
    {
        name: 'create_email_inbox',
        does: 'An owned address for sign-up and reset tests; account required.',
    },
    { name: 'wait_for_email', does: 'Block until mail arrives; codes and links come extracted.' },
    { name: 'wait_for_event', does: 'Wait for any webhook, email or human answer in one call.' },
    { name: 'create_mock_api', does: 'Routes, templates, CRUD records and failure modes.' },
    { name: 'call_mock_api', does: 'Call a mock or change its CRUD data.' },
    { name: 'upload_temporary_file', does: 'Share a file through a private, expiring link.' },
    { name: 'memory_set / memory_get', does: 'Remember JSON between sessions (needs an API key).' },
    { name: 'ask_human', does: 'Ask you before a risky step; you answer from a link.' },
    { name: 'wait_for_approval', does: 'Block until you answer, then act on it.' },
    { name: 'create_monitor', does: 'Watch a URL, a certificate or a cron job, with alerts.' },
    {
        name: 'search_tools',
        does: 'Find an executable utility by keyword; hosted services use their resource tools.',
    },
    { name: 'run_tool', does: 'Run a utility: JSON, JWT, DNS, SSL, PDF, images and more.' },
    { name: 'resource_request', does: 'List, renew, share or delete what your agent created.' },
];

const prompts = [
    'Create a socket.help webhook inbox, wait for the first request, and explain what it contains.',
    'Create a socket.help email inbox, sign up at my staging site with it, and finish verification.',
    'Before you deploy, use socket.help ask_human to get my approval and wait for my answer.',
    'Mock GET /users/:id with three realistic users, then call it to check the response.',
    'Look up the DNS records and SSL certificate for example.com and summarize any problems.',
];

export default function Connect() {
    return (
        <div className="content-page connect-page">
            <StructuredData
                value={{
                    '@context': 'https://schema.org',
                    '@type': 'HowTo',
                    name: 'Connect an AI agent to socket.help',
                    step: [
                        { '@type': 'HowToStep', name: 'Paste the setup prompt into your agent' },
                        { '@type': 'HowToStep', name: 'Approve the agent in your browser' },
                        { '@type': 'HowToStep', name: 'Ask your agent to use socket.help' },
                    ],
                }}
            />
            <PageIntro
                title="Give your agent the internet in one minute."
                description="Paste one prompt into Claude Code, Cursor, Codex or any MCP client. Your agent adds the server, asks to join your workspace and waits for you to approve it."
            >
                <CopyPrompt prompt={setupPrompt} className="button button-primary" />
                <Link className="button button-secondary" href="#clients">
                    Set up by hand
                </Link>
            </PageIntro>

            <ol className="connect-steps">
                <li>
                    <div>
                        <strong>Paste the prompt</strong>
                        <p>
                            Your agent adds the MCP server and calls <code>start_login</code>. No
                            API key goes through the chat.
                        </p>
                    </div>
                </li>
                <li>
                    <div>
                        <strong>Approve it</strong>
                        <p>
                            Open the link it shows you and check the code. The free plan includes 3
                            agents.
                        </p>
                    </div>
                </li>
                <li>
                    <div>
                        <strong>Ask your agent</strong>
                        <p>It discovers the tools by itself. Try a prompt from the list below.</p>
                    </div>
                </li>
            </ol>

            <section id="clients" className="content-section">
                <h2>Or set it up by hand</h2>
                <ClientTabs clients={clients} />
                <p className="connect-packages">
                    Prefer a terminal or code? The same tools ship as{' '}
                    <code>npm install --global @socket-help/cli@beta</code> and{' '}
                    <code>npm install @socket-help/sdk@beta</code>. See the{' '}
                    <Link href="/docs/cli/">CLI</Link> and <Link href="/docs/sdk/">SDK</Link> docs.
                </p>
            </section>

            <section className="content-section">
                <h2>Try one of these prompts</h2>
                <ul className="connect-prompts">
                    {prompts.map((prompt) => (
                        <li key={prompt}>
                            <Icon name="robot" size={16} />
                            {prompt}
                        </li>
                    ))}
                </ul>
            </section>

            <section className="content-section">
                <h2>What your agent can do</h2>
                <p>
                    Tools appear automatically after you connect. Utilities stay behind{' '}
                    <code>search_tools</code> so your agent’s tool list stays short.
                </p>
                <div className="content-table-wrap">
                    <table className="content-table">
                        <caption>socket.help MCP tools</caption>
                        <thead>
                            <tr>
                                <th scope="col">Tool</th>
                                <th scope="col">What it does</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tools.map((tool) => (
                                <tr key={tool.name}>
                                    <th scope="row">
                                        <code>{tool.name}</code>
                                    </th>
                                    <td>{tool.does}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="content-section">
                <h2>Limits and safety</h2>
                <div className="explanation-grid">
                    <div>
                        <h3>Private by default</h3>
                        <p>
                            Everything your agent creates is private, with separate tokens to use
                            and to manage it. Review destructive tool calls in your client.
                        </p>
                    </div>
                    <div>
                        <h3>Same limits everywhere</h3>
                        <p>
                            MCP, the API, the CLI and the browser share your plan’s allowances. See{' '}
                            <Link href="/plans/">Plans</Link> for the numbers.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}
