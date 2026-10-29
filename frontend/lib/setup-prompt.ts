import { siteOrigin } from './site';

/** What a human pastes into their agent so it connects itself to socket.help. */
export const setupPrompt = `Set up socket.help for me (${siteOrigin}).
1. Add the MCP server ${siteOrigin}/mcp to this client. In Claude Code: claude mcp add --transport http socket-help ${siteOrigin}/mcp
2. Call the start_login tool with a name for this machine, then show me the link and code so I can approve you in my browser.
3. Call finish_login until I approve, and save the key it returns in the client config.
Never ask me to paste an API key into the chat. The free plan allows 3 agents and keeps data for up to 7 days. Setup guide: ${siteOrigin}/connect/`;
