import type { Kivel, MonitorInput, ApprovalInput } from '@kivel.io/sdk';
import { signatureProviders } from '@kivel.io/sdk/webhook-signature';
import type { SignatureInput } from '@kivel.io/sdk/webhook-signature';

export function needsInput(args: string[]) {
    return (
        ['run', 'upload'].includes(args[0] ?? '') ||
        (['test-wallet', 'test-paywall', 'test-checkout'].includes(args[0] ?? '') &&
            ['create', 'update', 'pay', 'top-up', 'complete', 'confirm'].includes(args[1] ?? '')) ||
        (args[0] === 'api' && !['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(args[1] ?? '')) ||
        (args[0] === 'agent' && args[1] === 'token') ||
        (args[0] === 'memory' && args[1] === 'set') ||
        (args[0] === 'authenticator' && args[1] === 'add') ||
        (args[0] === 'credential' && ['save', 'update'].includes(args[1] ?? '')) ||
        (args[0] === 'approval' && args[1] === 'ask') ||
        (args[0] === 'monitor' && ['create', 'policy'].includes(args[1] ?? '')) ||
        (args[0] === 'status-page' && args[1] === 'publish') ||
        (args[0] === 'email' &&
            ['draft-create', 'draft-submit', 'message-update'].includes(args[1] ?? '')) ||
        (args[0] === 'event' && args[1] === 'wait') ||
        (['oauth', 'mock', 'mcp-server', 'status-page', 'job'].includes(args[0] ?? '') &&
            ['create', 'update'].includes(args[1] ?? '')) ||
        (args[0] === 'mock' && ['validate', 'match', 'assert'].includes(args[1] ?? '')) ||
        (['inbox', 'email'].includes(args[0] ?? '') &&
            ['response', 'forward', 'send'].includes(args[1] ?? '')) ||
        (args[0] === 'inbox' && args[1] === 'verify')
    );
}

export async function agentCommand(client: Kivel, args: string[], input: Uint8Array) {
    const [group, action, ...tail] = args;
    const resource = [
        'inbox',
        'email',
        'mock',
        'oauth',
        'mcp-server',
        'file',
        'status-page',
        'job',
        'smtp',
    ].includes(group ?? '');
    const allowed = new Set<string>();
    if (resource && !['create', 'replay'].includes(action ?? '') && group !== 'oauth')
        allowed.add('--token');
    if ((group === 'email' && action === 'send') || (group === 'phone' && action === 'create'))
        allowed.add('--idempotency-key');
    if (group === 'inbox' && action === 'replay')
        for (const flag of ['--url', '--idempotency-key']) allowed.add(flag);
    if (group === 'inbox' && action === 'verify')
        for (const flag of [
            '--provider',
            '--url',
            '--header',
            '--algorithm',
            '--encoding',
            '--timestamp-header',
            '--tolerance-seconds',
        ])
            allowed.add(flag);
    if (group === 'inbox' && ['requests', 'wait'].includes(action ?? '')) {
        for (const flag of ['--method', '--path', '--limit']) allowed.add(flag);
        if (action === 'requests') allowed.add('--cursor');
    }
    if (group === 'mock' && action === 'calls')
        for (const flag of ['--method', '--path', '--status', '--run', '--limit', '--cursor'])
            allowed.add(flag);
    if (resource && action === 'create') {
        if (group === 'email') {
            allowed.add('--active-days');
            allowed.add('--local-part');
        } else {
            allowed.add('--ttl-seconds');
            allowed.add('--persistent');
            if (group !== 'oauth') allowed.add('--visibility');
        }
    }
    if (resource && action === 'renew') allowed.add('--persistent');
    if (resource && action === 'sharing' && group !== 'email') allowed.add('--visibility');
    if ((resource || group === 'phone') && action === 'wait') {
        allowed.add('--after');
        allowed.add('--timeout-seconds');
    }
    if (group === 'email' && ['messages', 'wait'].includes(action ?? '')) {
        for (const flag of [
            '--from',
            '--mail-from',
            '--subject',
            '--text',
            '--has-code',
            '--has-link',
            '--has-attachment',
            '--read',
            '--label',
            '--cursor',
            '--limit',
        ])
            allowed.add(flag);
        if (action === 'wait') allowed.add('--checkpoint');
    }
    if (group === 'email' && action === 'threads') {
        allowed.add('--cursor');
        allowed.add('--limit');
    }
    if (group === 'credential' && action === 'reveal') allowed.add('--approval-id');
    if (group === 'password' && action === 'generate') allowed.add('--length');
    if (group === 'agent' && ['login', 'trial'].includes(action ?? '')) allowed.add('--client');
    if (group === 'agent' && action === 'trial') allowed.add('--human-email');
    if (group === 'memory' && action === 'set') allowed.add('--ttl-seconds');
    if (group === 'memory' && action === 'list') allowed.add('--prefix');
    if (group === 'approval' && action === 'wait') allowed.add('--timeout-seconds');
    if (group === 'approval' && action === 'ask') allowed.add('--idempotency-key');
    if (group === 'approval' && (action === 'list' || action === 'pending'))
        for (const flag of ['--status', '--agent', '--outcome', '--cursor', '--limit'])
            allowed.add(flag);
    if (group === 'event' && action === 'wait') allowed.add('--timeout-seconds');
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
        if (value === '--persistent' || value === '--checkpoint') flags.set(value, 'true');
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
    const idempotencyKey = take('--idempotency-key');
    const emailSettings = { activeDays: number('--active-days'), localPart: take('--local-part') };
    const threadPage = { cursor: take('--cursor'), limit: number('--limit') };
    const webhookFilters = {
        method: take('--method'),
        path: take('--path'),
        limit: threadPage.limit,
    };
    const webhookUrl = take('--url');
    const mockStatus = group === 'approval' ? undefined : number('--status');
    const approvalFilter = {
        status: group === 'approval' ? take('--status') : undefined,
        agent: take('--agent'),
        outcome: take('--outcome'),
    };
    const signature = {
        provider: take('--provider'),
        headerName: take('--header'),
        algorithm: take('--algorithm'),
        encoding: take('--encoding'),
        timestampHeader: take('--timestamp-header'),
        toleranceSeconds: number('--tolerance-seconds'),
    };
    const boolean = (key: string) => {
        const value = take(key);
        if (value === undefined) return undefined;
        if (value === 'true' || value === 'false') return value === 'true';
        throw new Error(`Use true or false for ${key}.`);
    };
    const emailSearch = {
        ...threadPage,
        token,
        from: take('--from'),
        mailFrom: take('--mail-from'),
        subject: take('--subject'),
        text: take('--text'),
        hasCode: boolean('--has-code'),
        hasLink: boolean('--has-link'),
        hasAttachment: boolean('--has-attachment'),
        read: boolean('--read'),
        label: take('--label'),
    };
    const checkpoint = boolean('--checkpoint');
    const approvalId = take('--approval-id');
    const passwordLength = number('--length');
    const mockRun = take('--run');
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
    if (group === 'mock') {
        if (action === 'validate') {
            exact(0);
            return client.validateMock(json());
        }
        if (action === 'export') return client.mockConfig(id(), token);
        if (action === 'recordings') return client.mockRecordings(id(), token);
        if (action === 'promote-recording') {
            exact(2);
            return client.promoteMockRecording(positional[0]!, positional[1]!, token);
        }
        if (action === 'reset-scenario') {
            exact(2);
            return client.resetMockScenario(positional[0]!, positional[1]!, token);
        }
        if (action === 'assert') return client.assertMockCalls(id(), json(), token);
        if (action === 'match') return client.matchMockRequest(id(), json(), token);
        if (action === 'calls')
            return client.mockCalls(id(), token, {
                ...webhookFilters,
                cursor: threadPage.cursor,
                status: mockStatus,
                run: mockRun,
            });
    }
    if (group === 'oauth') {
        if (action === 'create') {
            exact(0);
            return client.createOAuthProvider(json(), settings);
        }
        if (action === 'list') {
            exact(0);
            return client.oauthProviders();
        }
        if (action === 'inspect') return client.oauthProvider(id());
        if (action === 'update') return client.updateOAuthProvider(id(), json());
        if (action === 'delete') return client.deleteOAuthProvider(id());
        if (action === 'calls')
            return client.request('GET', `/api/mocks/${encodeURIComponent(id())}/calls`);
        if (action === 'renew')
            return client.request('POST', `/api/mocks/${encodeURIComponent(id())}/renew`, {
                persistent: settings.persistent ?? false,
            });
    }
    if (group === 'event' && action === 'wait') {
        exact(0);
        const value = json();
        return client.waitForEvent(
            value.sources,
            wait.timeoutSeconds ?? value.timeoutSeconds ?? 20,
        );
    }
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
    if (['test-wallet', 'test-paywall', 'test-checkout'].includes(group ?? '')) {
        const kind =
            group === 'test-wallet'
                ? 'wallets'
                : group === 'test-paywall'
                  ? 'paywalls'
                  : 'checkouts';
        if (action === 'create') {
            exact(0);
            const input = json();
            return kind === 'wallets'
                ? client.createTestWallet(input)
                : kind === 'paywalls'
                  ? client.createTestPaywall(input)
                  : client.createTestCheckout(input);
        }
        if (action === 'list') {
            exact(0);
            return client.testPayments(kind);
        }
        if (action === 'inspect' || action === 'balance') return client.testPayment(kind, id());
        if (action === 'update') return client.updateTestPayment(kind, id(), json());
        if (action === 'delete') return client.deleteTestPayment(kind, id());
        if (group === 'test-wallet' && action === 'pay') return client.walletPay(id(), json());
        if (group === 'test-wallet' && action === 'top-up')
            return client.topUpTestWallet(id(), json().amount);
        if (group === 'test-wallet' && action === 'transactions')
            return client.listWalletTransactions(id());
        if (group === 'test-checkout' && action === 'complete')
            return client.completeTestCheckout(id(), json());
        if (group === 'test-checkout' && action === 'confirm')
            return client.confirmTestCheckout(id(), json().confirmationToken);
    }
    if (group === 'credential') {
        if (action === 'save') {
            exact(0);
            return client.saveCredential(json());
        }
        if (action === 'list') {
            exact(0);
            return client.credentials();
        }
        if (action === 'inspect') return client.credential(id());
        if (action === 'update') return client.updateCredential(id(), json());
        if (action === 'delete') return client.deleteCredential(id());
        if (action === 'reveal') return client.revealCredential(id(), approvalId);
    }
    if (group === 'password' && action === 'generate') {
        exact(0);
        return client.generatePassword(passwordLength);
    }
    if (group === 'authenticator') {
        if (action === 'add') {
            exact(0);
            return client.addAuthenticator(json());
        }
        if (action === 'list') {
            exact(0);
            return client.listAuthenticators();
        }
        if (action === 'code') return client.getTotpCode(id());
        if (action === 'rename') {
            exact(2);
            return client.renameAuthenticator(positional[0]!, positional[1]!);
        }
        if (action === 'delete') return client.deleteAuthenticator(id());
    }
    if (group === 'email' && ['attachment', 'download-attachment'].includes(action ?? '')) {
        exact(3);
        return action === 'attachment'
            ? client.getEmailAttachment(positional[0]!, positional[1]!, positional[2]!)
            : client.downloadEmailAttachment(positional[0]!, positional[1]!, positional[2]!);
    }
    if (group === 'memory') {
        if (action === 'list') return client.memoryList(id(), prefix);
        exact(2);
        const [namespace, key] = positional as [string, string];
        if (action === 'set') return client.memorySet(namespace, key, json(), settings.ttlSeconds);
        if (action === 'get') return client.memoryGet(namespace, key);
        if (action === 'delete') return client.memoryDelete(namespace, key);
    }
    if (group === 'phone') {
        if (action === 'available') {
            if (positional.length > 1) throw new Error('Use an optional US area code.');
            return client.availablePhoneNumbers(positional[0]);
        }
        if (action === 'create') {
            exact(1);
            if (!idempotencyKey)
                throw new Error('Provide --idempotency-key and retain it for this purchase.');
            return client.createPhoneNumber(positional[0]!, idempotencyKey);
        }
        if (action === 'list') {
            exact(0);
            return client.listPhoneNumbers();
        }
        if (action === 'release') return client.releasePhoneNumber(id());
        if (action === 'messages') return client.listSms(id());
        if (action === 'wait')
            return client.waitForSms(id(), {
                ...(wait.after ? { after: wait.after } : {}),
                ...(wait.timeoutSeconds ? { timeoutSeconds: wait.timeoutSeconds } : {}),
            });
    }
    if (group === 'smtp' && action === 'create') {
        exact(0);
        return client.createSmtpInbox(settings);
    }
    if (group === 'smtp' && action === 'inspect') return client.smtpInbox(id());
    if (group === 'smtp' && action === 'rotate') return client.rotateSmtpPassword(id());
    if (group === 'job' && action === 'create') {
        exact(0);
        return client.createScheduledJob(json(), settings);
    }
    if (group === 'job' && action === 'list') {
        exact(0);
        return client.scheduledJobs();
    }
    if (group === 'job' && action === 'inspect') {
        exact(1);
        return client.scheduledJob(id());
    }
    if (group === 'job' && action === 'runs') return client.scheduledJobRuns(id());
    if (group === 'job' && (action === 'pause' || action === 'resume'))
        return client.pauseScheduledJob(id(), action === 'pause');
    if (group === 'job' && action === 'cancel') {
        exact(1);
        return client.cancelScheduledJob(id());
    }
    if (group === 'status-page' && action === 'create') {
        exact(0);
        return client.createStatusPage(json(), {
            ...settings,
            ...(visibility ? { visibility } : {}),
        });
    }
    if (group === 'status-page' && action === 'update')
        return client.updateStatusPage(id(), json());
    if (group === 'status-page' && action === 'inspect') return client.statusPage(id());
    if (group === 'status-page' && action === 'publish')
        return client.updateStatusPublication(id(), json());
    if (group === 'monitor') {
        if (action === 'accept-dns') return client.acceptDnsChanges(id());
        if (action === 'create') {
            exact(0);
            return client.createMonitor(json() as MonitorInput);
        }
        if (action === 'list') {
            exact(0);
            return client.monitors();
        }
        if (action === 'inspect') return client.monitor(id());
        if (action === 'checks') return client.monitorChecks(id());
        if (action === 'incidents') return client.monitorIncidents(id());
        if (action === 'deliveries') return client.monitorDeliveries(id());
        if (action === 'policy') return client.updateMonitorAlertPolicy(id(), json());
        if (action === 'ping' || action === 'fail')
            return client.pingMonitor(id(), action === 'fail');
        if (action === 'pause' || action === 'resume')
            return client.pauseMonitor(id(), action === 'pause');
        if (action === 'delete') return client.deleteMonitor(id());
    }
    if (group === 'approval') {
        if (action === 'ask') {
            exact(0);
            const input = json() as ApprovalInput;
            if (idempotencyKey) input.idempotencyKey = idempotencyKey;
            return client.askHuman(input);
        }
        if (action === 'list' || action === 'pending') {
            exact(0);
            const status = action === 'pending' ? 'pending' : approvalFilter.status;
            if (
                status !== undefined &&
                status !== 'pending' &&
                status !== 'answered' &&
                status !== 'expired'
            )
                throw new Error('Use pending, answered or expired for --status.');
            return client.approvals({ ...threadPage, ...approvalFilter, status });
        }
        if (action === 'events') return client.approvalEvents(id());
        if (action === 'deliveries') return client.approvalDeliveries(id());
        if (action === 'policy') {
            exact(0);
            return client.approvalPolicy();
        }
        if (action === 'inspect') return client.approval(id());
        if (action === 'wait') return client.waitForApproval(id(), wait.timeoutSeconds);
    }
    if (group === 'inbox') {
        if (action === 'requests')
            return threadPage.cursor ||
                Object.values(webhookFilters).some((value) => value !== undefined)
                ? client.inboxRequests(id(), {
                      ...webhookFilters,
                      cursor: threadPage.cursor,
                      token,
                  })
                : client.inspectInbox(id(), token);
        if (action === 'wait') return client.waitForRequests(id(), { ...wait, ...webhookFilters });
        if (action === 'request') {
            exact(2);
            return client.inboxRequest(positional[0]!, positional[1]!, token);
        }
        if (action === 'replay') {
            exact(2);
            if (!webhookUrl || !idempotencyKey)
                throw new Error('Provide --url and --idempotency-key.');
            return client.replayInboxRequest(
                positional[0]!,
                positional[1]!,
                webhookUrl,
                idempotencyKey,
            );
        }
        if (action === 'verify') {
            exact(2);
            if (!signature.provider || !Object.hasOwn(signatureProviders, signature.provider))
                throw new Error(
                    `Use --provider with one of: ${Object.keys(signatureProviders).join(', ')}.`,
                );
            const secret = new TextDecoder('utf-8', { fatal: true })
                .decode(input)
                .replace(/\r?\n$/, '');
            if (!secret) throw new Error('Provide the signing secret on standard input.');
            return client.verifyInboxSignature(positional[0]!, positional[1]!, {
                ...(signature as Omit<SignatureInput, 'secret' | 'body' | 'headers'>),
                secret,
                token,
                url: webhookUrl,
            });
        }
        if (action === 'response') return client.setInboxResponse(id(), json(), token);
        if (action === 'forward') {
            const body = json();
            return client.setInboxForward(
                id(),
                body === null ? null : body.url,
                token,
                body === null ? {} : { method: body.method, path: body.path },
            );
        }
        if (action === 'deliveries') return client.inboxDeliveries(id(), token);
    }
    if (group === 'email') {
        if (action === 'deliveries') return client.emailDeliveries(id());
        if (action === 'threads') {
            if (positional.length > 1) throw new Error('Provide at most one inbox ID.');
            return client.emailThreads(positional[0], threadPage);
        }
        if (action === 'thread') {
            exact(2);
            return client.emailThread(positional[0]!, positional[1]!);
        }
        if (action === 'draft-create') return client.createEmailDraft(id(), json());
        if (action === 'drafts') return client.emailDrafts(id());
        if (action === 'draft-inspect') return client.emailDraft(id());
        if (action === 'draft-submit')
            return client.submitEmailDraft(id(), input.length ? json() : {});
        if (action === 'draft-delete') return client.deleteEmailDraft(id());
        if (action === 'rules') return client.emailInboxRules(id());
        if (action === 'clear') return client.clearEmails(id(), token);
        if (action === 'send') {
            if (!idempotencyKey)
                throw new Error(
                    'Provide --idempotency-key and reuse it only when retrying this same message.',
                );
            const value = json();
            return client.sendEmail(id(), { ...value, idempotencyKey });
        }
        if (action === 'list') {
            exact(0);
            return client.emailInboxes();
        }
        if (action === 'forward') {
            const value = json();
            if (value?.url !== null && typeof value?.url !== 'string')
                throw new Error(
                    'Pipe {"url":"https://your-webhook"}, or {"url":null} to disable forwarding.',
                );
            return client.emailForwarding(id(), value.url, token);
        }
        if (action === 'create') {
            exact(0);
            return client.createEmailInbox(emailSettings);
        }
        if (action === 'message' || action === 'message-update') {
            exact(2);
            const [inboxId, messageId] = positional as [string, string];
            return action === 'message'
                ? client.emailMessage(inboxId, messageId, token)
                : client.updateEmailMessage(inboxId, messageId, json());
        }
        if (action === 'messages') return client.emails(id(), emailSearch);
        if (action === 'wait')
            return client.waitForEmail(id(), { ...wait, ...emailSearch, checkpoint });
    }
    if (group === 'mock' || group === 'mcp-server') {
        if (action === 'create') {
            exact(0);
            return group === 'mock'
                ? client.createMock(json(), { ...settings, visibility })
                : client.createMcpServer(json(), { ...settings, visibility });
        }
        if (action === 'update')
            return group === 'mock'
                ? client.updateMock(id(), json(), token)
                : client.updateMcpServer(id(), json(), token);
        if (action === 'reset' && group === 'mock') return client.resetMock(id(), token);
    }
    const kinds = {
        inbox: 'inboxes',
        email: 'email-inboxes',
        'status-page': 'status-pages',
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
    throw new Error('Unknown command. Run kivel --help.');
}
