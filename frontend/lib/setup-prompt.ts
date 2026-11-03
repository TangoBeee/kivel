import { catalog, categories } from './catalog';
import { siteOrigin } from './site';

/** What a human pastes into their agent so it connects itself to socket.help. */
// Login runs over HTTP so it works in the current session: clients such as Claude Code only load
// an MCP server added mid-session after a restart, so its start_login tool is not callable yet.
export const setupPrompt = `Set up socket.help for me (${siteOrigin}).
1. Start a login: POST ${siteOrigin}/api/agents/login with JSON {"name":"<a name for this machine>","client":"<your client>"}. Show me only the verificationUrl and userCode so I can approve you in my browser.
2. Every few seconds, POST ${siteOrigin}/api/agents/token with JSON {"deviceCode":"<deviceCode>"}. It returns status "pending" until I approve, then "approved" with apiKey.
3. Add the MCP server ${siteOrigin}/mcp with the header "Authorization: Bearer <apiKey>". In Claude Code: claude mcp add --transport http socket-help ${siteOrigin}/mcp --header "Authorization: Bearer <apiKey>". If the tools only appear after a restart, tell me.
4. Read the agent workflow instructions at ${siteOrigin}/SKILL.md. Use create → wait → inspect for resources, and ask_human before risky actions. Search the whole catalog with search_tools: ${catalog.filter((tool) => tool.status === 'available').length} tools across ${categories.length} categories, covering HTTP and webhooks, email, mocks and OAuth, files, monitors, memory, authenticators, scheduled jobs and status pages, test data and media, developer utilities, DNS and network. Use describe_tool for inputs and run_tool for utilities. Use authenticators only for accounts I authorize.
Never print the key or ask me to paste an API key into the chat. If you can't make HTTP requests, add the MCP server without a key and use its start_login and finish_login tools instead; they are MCP tools, not CLI commands. The free plan allows 3 agents and keeps data for up to 7 days. Setup guide: ${siteOrigin}/connect/`;
