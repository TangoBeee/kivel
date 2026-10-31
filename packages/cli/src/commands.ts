import { VERSION } from './version.js';
import { agentCommand } from './agent-commands.js';
export { needsInput } from './agent-commands.js';
import type { SocketHelp } from '@socket-help/sdk';
export const help = `socket-help tools | usage | resources
socket-help --version
socket-help plans | activity
socket-help agent login <name> [--client <client>]
socket-help agent token < login.json
socket-help agent trial <name> [--human-email <email>] [--client <client>]
socket-help agent list
socket-help email create [--active-days <1-7>] [--local-part <paid-address>]
socket-help email list
socket-help email clear <id>
socket-help email forward <id> [--token <token>] < forwarding.json
socket-help email send <id> --idempotency-key <unique-key> < message.json
socket-help event wait [--timeout-seconds <1-30>] < sources.json
socket-help email messages|wait <id> [--token <token>] [--after <id>] [--timeout-seconds <n>]
socket-help memory set <namespace> <key> [--ttl-seconds <n>] < value.json
socket-help memory get|delete <namespace> <key>
socket-help memory list <namespace> [--prefix <prefix>]
socket-help monitor create < monitor.json
socket-help monitor list|inspect|pause|resume|delete [id]
socket-help monitor ping|fail <ping-token>
socket-help monitor accept-dns <id>
socket-help job create [--ttl-seconds <n>] < job.json
socket-help job list|inspect|cancel [id]
socket-help status-page create|update [id] < page.json
socket-help smtp create [--ttl-seconds <n>]
socket-help smtp rotate <id>
socket-help phone available [US-area-code]
socket-help phone create <E.164-number> --idempotency-key <unique-key>
socket-help phone list|release|messages|wait [id] [--after <id>] [--timeout-seconds <n>]
socket-help approval ask < question.json
socket-help approval list|pending|inspect|wait [id] [--timeout-seconds <n>]
socket-help inbox requests|wait|deliveries <id> [--token <token>]
socket-help inbox response|forward <id> [--token <token>] < settings.json
socket-help mock create|update [id] < config.json
socket-help mock calls|reset <id> [--token <token>]
socket-help mcp-server create < config.json
socket-help inbox|email|mock|mcp-server|file inspect|delete|renew <id> [--token <token>]
socket-help inbox|mock|mcp-server|file sharing <id> --visibility private|public [--token <token>]
socket-help describe <tool-id>
socket-help run <tool-id> [--file <filename>] [--options '{"action":"minify"}'] < input.txt
socket-help inbox create [--visibility private|public]
socket-help listen <inbox-id> [--token <inspection-token>] [--forward http://localhost:3000] [--all]
socket-help api <GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE> /api/path-or-/mock/path [--token <resource-token>] < body.json
socket-help upload <filename> [--visibility private|public] [--max-downloads 1] < file.bin
socket-help download <file-id> [--access-token token] > file.bin

Set SOCKET_HELP_URL and SOCKET_HELP_API_KEY. Commands output JSON; downloads output binary; help is plain text. Mutations are never retried.
Creation also accepts --ttl-seconds <n> and --persistent. Webhook receiving is public by default; inspection always needs workspace credentials or the inspection token. Use inbox create --visibility private only when senders can add X-Access-Token. Other resources default to private.`;
function settings(args: string[], file = false) {
    const result: {
        visibility?: 'private' | 'public';
        ttlSeconds?: number;
        persistent?: boolean;
        maxDownloads?: number;
    } = {};
    const seen = new Set<string>();
    for (let index = 2; index < args.length; index++) {
        const flag = args[index]!;
        if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`);
        seen.add(flag);
        if (flag === '--persistent') {
            result.persistent = true;
            continue;
        }
        const value = args[++index];
        if (flag === '--visibility' && (value === 'private' || value === 'public'))
            result.visibility = value;
        else if (
            flag === '--ttl-seconds' &&
            value &&
            /^\d+$/.test(value) &&
            Number.isSafeInteger(Number(value)) &&
            Number(value) >= 60
        )
            result.ttlSeconds = Number(value);
        else if (
            flag === '--max-downloads' &&
            file &&
            value &&
            /^\d+$/.test(value) &&
            Number.isSafeInteger(Number(value)) &&
            Number(value) >= 1 &&
            Number(value) <= 1000
        )
            result.maxDownloads = Number(value);
        else throw new Error(`Invalid option or value: ${flag}`);
    }
    return result;
}
export async function command(
    client: SocketHelp,
    args: string[],
    input: Uint8Array = new Uint8Array(),
) {
    if (args.length === 1 && args[0] === '--version') return { version: VERSION };
    if (!args.length || args[0] === '--help' || args[0] === 'help') return { help };
    const text = () => new TextDecoder('utf-8', { fatal: true }).decode(input);
    if (args.length === 1 && args[0] === 'tools') return client.tools();
    if (args.length === 2 && args[0] === 'describe') return client.tool(args[1]!);
    if (args.length === 1 && args[0] === 'plans') return client.plans();
    if (args.length === 1 && args[0] === 'activity') return client.activity();
    if (args.length === 1 && args[0] === 'usage') return client.usage();
    if (args.length === 1 && args[0] === 'resources') return client.resources();
    if (args[0] === 'run' && args[1]) {
        let options: Record<string, string> = {},
            fileName: string | undefined;
        const seen = new Set<string>();
        for (let index = 2; index < args.length; index += 2) {
            const flag = args[index]!,
                value = args[index + 1];
            if (seen.has(flag) || value === undefined)
                throw new Error(`Invalid or duplicate option: ${flag}`);
            seen.add(flag);
            if (flag === '--options') {
                const parsed: unknown = JSON.parse(value);
                if (
                    !parsed ||
                    typeof parsed !== 'object' ||
                    Array.isArray(parsed) ||
                    Object.values(parsed).some((item) => typeof item !== 'string')
                )
                    throw new Error('Options must be a JSON object of strings.');
                options = parsed as Record<string, string>;
            } else if (flag === '--file' && value && value.length <= 150) fileName = value;
            else throw new Error(`Invalid option: ${flag}`);
        }
        return client.run(
            args[1],
            fileName ? '' : text(),
            options,
            fileName
                ? { name: fileName, base64: Buffer.from(input).toString('base64') }
                : undefined,
        );
    }
    if (args[0] === 'inbox' && args[1] === 'create') return client.createInbox(settings(args));
    if (args[0] === 'upload' && args[1]) return client.upload(args[1], input, settings(args, true));
    if (
        args[0] === 'download' &&
        args[1] &&
        (args.length === 2 || (args.length === 4 && args[2] === '--access-token'))
    )
        return client.downloadFile(args[1], args[3]);
    if (
        args[0] === 'api' &&
        args[1] &&
        args[2] &&
        /^(GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE)$/.test(args[1]) &&
        (args.length === 3 || (args.length === 5 && args[3] === '--token'))
    )
        return client.request(
            args[1],
            args[2],
            input.length ? JSON.parse(text()) : undefined,
            args[4],
        );
    return agentCommand(client, args, input);
}
