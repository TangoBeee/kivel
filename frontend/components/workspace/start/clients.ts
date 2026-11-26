import { siteOrigin } from '../../../lib/site';

const endpoint = `${siteOrigin}/mcp`;

export type ClientId = 'claude-code' | 'cursor' | 'codex' | 'other';

/** What each agent needs if the person would rather add Kivel by hand. */
export const clients: { id: ClientId; label: string; where: string; manual: string }[] = [
    {
        id: 'claude-code',
        label: 'Claude Code',
        where: 'Or run this in your terminal',
        manual: `claude mcp add --transport http kivel ${endpoint}`,
    },
    {
        id: 'cursor',
        label: 'Cursor',
        where: 'Or add this to ~/.cursor/mcp.json',
        manual: `{ "mcpServers": { "kivel": { "url": "${endpoint}" } } }`,
    },
    {
        id: 'codex',
        label: 'Codex',
        where: 'Or add this to ~/.codex/config.toml',
        manual: `[mcp_servers.kivel]\nurl = "${endpoint}"`,
    },
    {
        id: 'other',
        label: 'Other',
        where: 'Or add this remote MCP server',
        manual: endpoint,
    },
];

/** Prompts a new person can send to see Kivel work end to end. */
export const examples = [
    {
        id: 'signup',
        title: 'Sign up and read the code',
        detail: 'Inbox, wait for the email, use the code',
        prompt: 'Create a Kivel email inbox, sign up on our staging site with it, wait for the verification email and use the code to finish signing up.',
    },
    {
        id: 'webhook',
        title: 'Catch a webhook',
        detail: 'Webhook URL, inspect, check the signature',
        prompt: 'Make a Kivel webhook URL, point our Stripe test endpoint at it, trigger a checkout and show me the payload and whether the signature is valid.',
    },
    {
        id: 'mock',
        title: 'Build against a mock API',
        detail: 'Mock from a spec, with a failing case',
        prompt: 'Create a Kivel mock REST API from our openapi.yaml with a slow and a failing scenario, then build the client against it and test both cases.',
    },
    {
        id: 'totp',
        title: 'Log in with 2FA',
        detail: 'Store the authenticator, read the code',
        prompt: 'Add the authenticator for our staging admin account to Kivel, then log in and use the current 2FA code.',
    },
];
