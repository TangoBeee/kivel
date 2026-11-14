import { VERSION } from './version.js';
import { agentCommand } from './agent-commands.js';
export { needsInput } from './agent-commands.js';
import type { Kivel } from '@kivel.io/sdk';
export const help = `kivel tools | usage | resources
kivel --version
kivel plans | activity
kivel agent login <name> [--client <client>]
kivel agent token < login.json
kivel agent trial <name> [--human-email <email>] [--client <client>]
kivel agent list
kivel authenticator add < authenticator.json
kivel authenticator list|code|delete [id]
kivel authenticator rename <id> <name>
kivel email attachment|download-attachment <inbox-id> <message-id> <attachment-id>
kivel email create [--active-days <1-7>] [--local-part <paid-address>]
kivel email list
kivel email clear <id>
kivel email forward <id> [--token <token>] < forwarding.json
kivel email send <id> --idempotency-key <unique-key> < message.json
kivel event wait [--timeout-seconds <1-30>] < sources.json
kivel test-wallet create|list|inspect|update|delete [id]
kivel test-wallet balance|transactions <id>
kivel test-wallet pay|top-up <id> < test-payment.json
kivel test-paywall create|list|inspect|update|delete [id]
kivel test-checkout create|list|inspect|update|delete [id]
kivel test-checkout complete|confirm <id> < test-checkout.json
Test payments use fake units only. Create/update read JSON from stdin. Agent keys cannot set wallet limits; only a human owner/admin can. Resume approval with the same payment idempotencyKey.
kivel credential save < credential.json
kivel credential list
kivel credential inspect|delete <id>
kivel credential update <id> < changes.json
kivel credential reveal <id> [--approval-id <id>]
kivel password generate [--length <n>]
kivel email message <inbox-id> <message-id>
kivel email message-update <inbox-id> <message-id> < update.json
kivel email deliveries <inbox-id>
kivel email threads [inbox-id] [--cursor <cursor>] [--limit <n>]
kivel email thread <inbox-id> <thread-id>
kivel email drafts|rules <inbox-id>
kivel email draft-create <inbox-id> < content.json
kivel email draft-inspect|draft-delete <draft-id>
kivel email draft-submit <draft-id> [< settings.json]
kivel email messages|wait <id> [--cursor <cursor>] [--limit <n>] [--from <address>] [--mail-from <address>] [--subject <text>] [--text <text>] [--has-code true|false] [--has-link true|false] [--has-attachment true|false] [--read true|false] [--label <label>]
kivel email wait <id> [--checkpoint] [--after <id>] [--timeout-seconds <n>] [--token <token>]
kivel memory set <namespace> <key> [--ttl-seconds <n>] < value.json
kivel memory get|delete <namespace> <key>
kivel memory list <namespace> [--prefix <prefix>]
kivel monitor create < monitor.json
kivel monitor list|inspect|pause|resume|delete [id]
kivel monitor ping|fail <ping-token>
kivel monitor accept-dns <id>
kivel job create [--ttl-seconds <n>] < job.json
kivel job list|inspect|cancel [id]
kivel status-page create|update [id] < page.json
kivel smtp create [--ttl-seconds <n>]
kivel smtp rotate <id>
kivel phone available [US-area-code]
kivel phone create <E.164-number> --idempotency-key <unique-key>
kivel phone list|release|messages|wait [id] [--after <id>] [--timeout-seconds <n>]
kivel approval ask < question.json
kivel approval list|pending|inspect|wait [id] [--timeout-seconds <n>]
kivel inbox requests|wait|deliveries <id> [--token <token>]
kivel inbox response|forward <id> [--token <token>] < settings.json
kivel oauth create [--ttl-seconds <n>] < provider.json
kivel oauth update <id> < provider.json
kivel oauth list|inspect|calls|renew|delete [id]
kivel mock create|update [id] < config.json
kivel mock calls|reset <id> [--token <token>]
kivel mcp-server create < config.json
kivel inbox|email|mock|mcp-server|file inspect|delete|renew <id> [--token <token>]
kivel inbox|mock|mcp-server|file sharing <id> --visibility private|public [--token <token>]
kivel describe <tool-id>
kivel run <tool-id> [--file <filename>] [--options '{"action":"minify"}'] < input.txt
kivel inbox create [--visibility private|public]
kivel listen <inbox-id> [--token <inspection-token>] [--forward http://localhost:3000] [--all]
kivel api <GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE> /api/path-or-/mock/path [--token <resource-token>] < body.json
kivel upload <filename> [--visibility private|public] [--max-downloads 1] < file.bin
kivel download <file-id> [--access-token token] > file.bin

Set KIVEL_URL and KIVEL_API_KEY. Commands output JSON; downloads output binary; help is plain text. Mutations are never retried. Authenticators are only for accounts your human asked you to create or operate. Attachment downloads output untrusted binary files; attachment links expire in two minutes.
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
export async function command(client: Kivel, args: string[], input: Uint8Array = new Uint8Array()) {
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
