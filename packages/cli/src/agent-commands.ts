import type { SocketHelp, MonitorInput, ApprovalInput } from '@socket-help/sdk';

export function needsInput(args: string[]) {
    return (
        ['run', 'upload'].includes(args[0] ?? '') ||
        (args[0] === 'api' && !['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(args[1] ?? '')) ||
        (args[0] === 'agent' && args[1] === 'token') ||
        (args[0] === 'memory' && args[1] === 'set') ||
        (args[0] === 'approval' && args[1] === 'ask') ||
        (args[0] === 'monitor' && args[1] === 'create') ||
        (['mock', 'mcp-server'].includes(args[0] ?? '') &&
            ['create', 'update'].includes(args[1] ?? '')) ||
        (args[0] === 'inbox' && ['response', 'forward'].includes(args[1] ?? ''))
    );
}

export async function agentCommand(client: SocketHelp, args: string[], input: Uint8Array) {
    const [group, action, ...tail] = args;
    const resource = ['inbox', 'email', 'mock', 'mcp-server', 'file'].includes(group ?? '');
    const allowed = new Set<string>();
    if (resource && action !== 'create') allowed.add('--token');
    if (resource && action === 'create') {
        allowed.add('--ttl-seconds');
        allowed.add('--persistent');
        if (group !== 'email') allowed.add('--visibility');
    }
    if (resource && action === 'renew') allowed.add('--persistent');
    if (resource && action === 'sharing' && group !== 'email') allowed.add('--visibility');
    if (resource && action === 'wait') {
        allowed.add('--after');
        allowed.add('--timeout-seconds');
    }
    if (group === 'agent' && ['login', 'trial'].includes(action ?? '')) allowed.add('--client');
    if (group === 'agent' && action === 'trial') allowed.add('--human-email');
    if (group === 'memory' && action === 'set') allowed.add('--ttl-seconds');
    if (group === 'memory' && action === 'list') allowed.add('--prefix');
    if (group === 'approval' && action === 'wait') allowed.add('--timeout-seconds');
    const positional: string[] = [];
    const flags = new Map<string, string>();
    for (let i = 0; i < tail.length; i++) {
        const value = tail[i]!;
        if (!value.startsWith('--')) {
            positional.push(value);
            continue;
        }
        if (!allowed.has(value)) throw new Error(`Unknown option: ${value}`);
        if (flags.has(value)) throw new Error(`Duplicate option: ${value}`);
        if (value === '--persistent') flags.set(value, 'true');
        else {
            const next = tail[++i];
            if (next === undefined || next.startsWith('--'))
                throw new Error(`Missing value: ${value}`);
            flags.set(value, next);
        }
    }
    const take = (key: string) => {
        const value = flags.get(key);
        flags.delete(key);
        return value;
    };
    const number = (key: string) => {
        const value = take(key);
        if (value === undefined) return undefined;
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
            throw new Error(`Invalid number: ${key}`);
        return Number(value);
    };
    const token = take('--token');
    const wait = { token, after: take('--after'), timeoutSeconds: number('--timeout-seconds') };
    const settings = {
        ttlSeconds: number('--ttl-seconds'),
        persistent: take('--persistent') === 'true' || undefined,
    };
    const visibility = take('--visibility');
    if (visibility !== undefined && visibility !== 'public' && visibility !== 'private')
        throw new Error('visibility must be private or public.');
    const clientName = take('--client'),
        humanEmail = take('--human-email');
    const prefix = take('--prefix') ?? '';
    if (flags.size) throw new Error(`Unknown option: ${flags.keys().next().value}`);
    const exact = (count: number) => {
        if (positional.length !== count)
            throw new Error(`Expected ${count} arguments for ${group} ${action}.`);
    };
    const id = () => {
        exact(1);
        return positional[0]!;
    };
    const json = () => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input));
    if (group === 'agent') {
        if (action === 'login') return client.startLogin(id(), clientName);
        if (action === 'trial') return client.startTrial(id(), humanEmail, clientName);
        if (action === 'token') {
            exact(0);
            const value = json();
            if (typeof value?.deviceCode !== 'string')
                throw new Error('Pipe {"deviceCode":"…"} to agent token.');
            return client.finishLogin(value.deviceCode);
        }
        if (action === 'list') {
            exact(0);
            return client.agents();
        }
    }
    if (group === 'memory') {
        if (action === 'list') return client.memoryList(id(), prefix);
        exact(2);
        const [namespace, key] = positional as [string, string];
        if (action === 'set') return client.memorySet(namespace, key, json(), settings.ttlSeconds);
        if (action === 'get') return client.memoryGet(namespace, key);
        if (action === 'delete') return client.memoryDelete(namespace, key);
    }
    if (group === 'monitor') {
        if (action === 'create') {
            exact(0);
            return client.createMonitor(json() as MonitorInput);
        }
        if (action === 'list') {
            exact(0);
            return client.monitors();
        }
        if (action === 'inspect') return client.monitor(id());
        if (action === 'ping' || action === 'fail')
            return client.pingMonitor(id(), action === 'fail');
        if (action === 'pause' || action === 'resume')
            return client.pauseMonitor(id(), action === 'pause');
        if (action === 'delete') return client.deleteMonitor(id());
    }
    if (group === 'approval') {
        if (action === 'ask') {
            exact(0);
            return client.askHuman(json() as ApprovalInput);
        }
        if (action === 'list' || action === 'pending') {
            exact(0);
            return client.approvals(action === 'pending');
        }
        if (action === 'inspect') return client.approval(id());
        if (action === 'wait') return client.waitForApproval(id(), wait.timeoutSeconds);
    }
    if (group === 'inbox') {
        if (action === 'requests') return client.inspectInbox(id(), token);
        if (action === 'wait') return client.waitForRequests(id(), wait);
        if (action === 'response') return client.setInboxResponse(id(), json(), token);
        if (action === 'forward') {
            const body = json();
            return client.setInboxForward(id(), body === null ? null : body.url, token);
        }
        if (action === 'deliveries') return client.inboxDeliveries(id(), token);
    }
    if (group === 'email') {
        if (action === 'create') {
            exact(0);
            return client.createEmailInbox(settings);
        }
        if (action === 'messages') return client.emails(id(), token);
        if (action === 'wait') return client.waitForEmail(id(), wait);
    }
    if (group === 'mock' || group === 'mcp-server') {
        if (action === 'create') {
            exact(0);
            return group === 'mock'
                ? client.createMock(json(), { ...settings, visibility })
                : client.createMcpServer(json(), { ...settings, visibility });
        }
        if (action === 'update' && group === 'mock') return client.updateMock(id(), json(), token);
        if (action === 'reset' && group === 'mock') return client.resetMock(id(), token);
        if (action === 'calls' && group === 'mock') return client.mockCalls(id(), token);
    }
    const kinds = {
        inbox: 'inboxes',
        email: 'email-inboxes',
        mock: 'mocks',
        'mcp-server': 'mcp-servers',
        file: 'files',
    } as const;
    const kind = Object.hasOwn(kinds, group ?? '') ? kinds[group as keyof typeof kinds] : undefined;
    if (kind) {
        if (action === 'inspect') return client.inspectResource(kind, id(), token);
        if (action === 'delete') return client.remove(kind, id(), token);
        if (action === 'renew') return client.renew(kind, id(), settings, token);
        if (action === 'sharing' && kind !== 'email-inboxes') {
            if (!visibility) throw new Error('Provide --visibility private|public.');
            return client.sharing(kind, id(), visibility, token);
        }
    }
    throw new Error('Unknown command. Run socket-help --help.');
}
