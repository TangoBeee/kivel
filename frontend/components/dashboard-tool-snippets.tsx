import { siteOrigin } from '../lib/site';
import { CopyButton } from './copy-button';
import type { ToolPanel } from './tool-page';
import type { Resource } from './dashboard-resources';

const examples = {
    email: ['email-inboxes', 'list_emails', 'email messages', '/messages'],
    webhooks: ['inboxes', 'inspect_webhook_inbox', 'inbox requests', '/requests'],
    mocks: ['mocks', 'inspect_mock_api', 'mock inspect', ''],
    files: ['files', 'inspect_temporary_file', 'file inspect', ''],
    monitors: ['monitors', 'list_monitors', 'monitor list', ''],
    memory: ['memory/project', 'memory_list', 'memory list project', ''],
    payments: ['test-wallets', 'resource_request', 'test-wallet list', ''],
    vault: ['credentials', 'list_credentials', 'credential list', ''],
    authenticators: ['authenticators', 'list_authenticators', 'authenticator list', ''],
    automation: ['scheduled-jobs', 'resource_request', 'job list', ''],
    status: ['status-pages', 'resource_request', 'resources', ''],
} as const satisfies Record<ToolPanel, readonly [string, string, string, string]>;

export function DashboardToolSnippets({
    panel,
    resource,
}: {
    panel: ToolPanel;
    resource?: Resource;
}) {
    const [kind, tool, command, suffix] =
        resource?.kind === 'mcp'
            ? ['mcp-servers', 'resource_request', 'mcp-server inspect', '']
            : resource?.toolId === 'email-mock-smtp'
              ? ['smtp-inboxes', 'resource_request', 'smtp inspect', '']
              : examples[panel];
    const id = resource?.id ?? 'RESOURCE_ID';
    const usesId = ['email', 'webhooks', 'mocks', 'files'].includes(panel);
    const path = usesId
        ? `/api/${kind}/${id}${suffix}`
        : panel === 'status'
          ? resource
              ? `/api/status-pages/${id}`
              : '/api/account/resources'
          : `/api/${kind}`;
    const args = usesId
        ? tool === 'resource_request'
            ? { kind, action: 'inspect', id }
            : { id }
        : panel === 'memory'
          ? { namespace: 'project' }
          : tool === 'resource_request'
            ? { kind, action: 'list' }
            : {};
    const mcp = JSON.stringify({ name: tool, arguments: args }, null, 2);
    const sdk = `import { Kivel } from '@kivel.io/sdk';\n\nconst kivel = new Kivel({ baseUrl: '${siteOrigin}', apiKey: process.env.KIVEL_API_KEY });\nconst result = await kivel.request('GET', '${path}');`;
    const http = `curl '${siteOrigin}${path}' -H "Authorization: Bearer $KIVEL_API_KEY"`;
    return (
        <details className="dashboard-tool-snippets">
            <summary>Use from your agent or code</summary>
            {[
                ['MCP', mcp],
                ['HTTP', http],
                ['TypeScript SDK', sdk],
                ['CLI', `KIVEL_URL='${siteOrigin}' kivel ${command}${usesId ? ` ${id}` : ''}`],
            ].map(([label, code]) => (
                <section key={label}>
                    <div>
                        <h3>{label}</h3>
                        <CopyButton text={code!} label={`Copy ${label} example`} />
                    </div>
                    <pre>
                        <code>{code}</code>
                    </pre>
                </section>
            ))}
        </details>
    );
}
