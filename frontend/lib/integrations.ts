import type { IconName } from '../components/icons';
export const integrations: {
    id: string;
    title: string;
    icon: IconName;
    description: string;
    code: string;
    note: string;
    availability: string;
}[] = [
    {
        id: 'http',
        title: 'HTTP & cURL',
        icon: 'code',
        description:
            'Call the API from any language, shell, or CI job. No client library required.',
        availability: 'Available',
        code: `curl https://socket.help/api/tools/json/run \\
  -H "Authorization: Bearer $SOCKET_HELP_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{"input":"{\\"hello\\":true}","options":{"action":"format"}}'`,
        note: 'Omit the Authorization header for anonymous use. Discover tool IDs with GET /api/tools. Hosted calls send your input to the server.',
    },
    {
        id: 'sdk',
        title: 'TypeScript SDK',
        icon: 'braces',
        description: 'Typed methods for utilities, resource creation, inspection, and cleanup.',
        availability: 'Repository package',
        code: `import { SocketHelp } from '@socket-help/sdk';

const socket = new SocketHelp({
  apiKey: process.env.SOCKET_HELP_API_KEY,
});
const result = await socket.run('json', '{"hello":true}');
const inbox = await socket.createInbox({ visibility: 'private' });`,
        note: 'The SDK is a workspace package, not a published npm install. From the repository, run pnpm build:packages, then pnpm --filter @socket-help/sdk pack to create an installable tarball.',
    },
    {
        id: 'cli',
        title: 'Command line',
        icon: 'terminal',
        description: 'Pipe input in, get JSON out, and use exit codes in automation.',
        availability: 'Repository package',
        code: `export SOCKET_HELP_API_KEY='your-key'
printf '{"hello":true}' | socket-help run json
socket-help inbox create
socket-help resources
socket-help api GET /api/account/resources`,
        note: 'Build repository packages with pnpm build:packages and use pnpm cli --help locally. Package the CLI with pnpm --filter @socket-help/cli pack. Set SOCKET_HELP_URL for your installation. Errors go to stderr with a nonzero exit code.',
    },
    {
        id: 'ssh',
        title: 'SSH gateway',
        icon: 'shield',
        description: 'Run toolbox commands over an authenticated SSH connection.',
        availability: 'Optional on self-hosted installs',
        code: `# Use your API key as the SSH password.
# Verify the host fingerprint before connecting.
printf '{"hello":true}' | ssh -T -p 2222 socket@your-host socket-help run json
ssh -T -n -p 2222 socket@your-host socket-help resources`,
        note: 'The optional Docker gateway binds to localhost:2222 by default. Its startup log shows the host fingerprint. Exposing it is an operator decision. It supports tool commands, with no interactive shell, forwarding, SCP, or SFTP.',
    },
    {
        id: 'mcp',
        title: 'MCP for agents',
        icon: 'robot',
        description: 'Let a compatible agent discover utilities and manage temporary resources.',
        availability: 'Streamable HTTP',
        code: `POST /mcp
Authorization: Bearer your-api-key
Accept: application/json, text/event-stream
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
  "name":"run_tool",
  "arguments":{"toolId":"json","input":"{\\"hello\\":true}"}
}}`,
        note: 'Connect a Streamable HTTP client and initialize before making tool calls. Use tools/list for MCP discovery, list_tools for utility IDs, and run_tool for execution. Resource-specific tools handle creation and cleanup.',
    },
];
