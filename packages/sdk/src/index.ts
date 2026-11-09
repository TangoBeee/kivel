export * from './types.js';
import type {
    Authenticator,
    AuthenticatorInput,
    TotpCode,
    EmailAttachmentLink,
    OAuthProviderInput,
    OAuthProvider,
    CreatedOAuthProvider,
    AgentLogin,
    AgentToken,
    AgentTrial,
    Approval,
    ApprovalInput,
    EmailInbox,
    EmailMessage,
    EmailContent,
    EmailThread,
    EmailThreadsPage,
    EmailDraft,
    EmailRules,
    MemoryEntry,
    Monitor,
    MonitorInput,
    WaitOptions,
} from './types.js';
export interface ClientOptions {
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    fetch?: typeof fetch | undefined;
    timeoutMs?: number | undefined;
}
export interface ResourceSettings {
    ttlSeconds?: number | undefined;
    persistent?: boolean | undefined;
    visibility?: 'public' | 'private' | undefined;
}
export interface UploadSettings extends ResourceSettings {
    maxDownloads?: number | undefined;
}
export interface ResourceCredentials {
    visibility: 'public' | 'private';
    accessVersion: string;
    accessToken?: string;
    id: string;
    expiresAt: string;
    managementToken?: string;
    inspectionToken?: string;
}
export interface CapturedRequest {
    id: string;
    method: string;
    path: string;
    rawQuery?: string;
    headers: Record<string, string | string[]>;
    query: Record<string, string | string[]>;
    body: string;
    bodyEncoding: 'utf8' | 'base64';
    bodySize: number;
    timestamp: string;
}
export interface InboxResponse {
    status?: number;
    contentType?: 'application/json' | 'text/plain' | 'application/xml' | 'text/xml';
    body?: string;
    headers?: Record<string, string>;
    delayMs?: number;
}
export interface Execution {
    toolId: string;
    output: string;
    usage: { used: number; limit: number; resetsAt: string };
}
export interface KivelUsage {
    plan: 'anonymous' | 'free' | 'pro' | 'team';
    limits: Record<string, unknown>;
    runsToday: number;
    resetsAt: string;
    period?: { start: string; end: string };
    items?: {
        key: string;
        label: string;
        unit: 'count' | 'bytes';
        used: number;
        max: number;
        resetsAt?: string;
    }[];
}

export class KivelError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly requestId?: string,
        readonly retryAfter?: number,
        readonly requiredPlan?: string,
        readonly upgradeUrl?: string,
    ) {
        super(message);
        this.name = 'KivelError';
    }
}
export class Kivel {
    readonly baseUrl: string;
    private fetcher: typeof fetch;
    private timeoutMs: number;
    constructor(private options: ClientOptions = {}) {
        const url = new URL(options.baseUrl ?? 'https://kivel.io');
        if (
            !['http:', 'https:'].includes(url.protocol) ||
            url.username ||
            url.password ||
            url.pathname !== '/' ||
            url.search ||
            url.hash
        )
            throw new Error('baseUrl must be an HTTP(S) origin.');
        if (
            url.protocol !== 'https:' &&
            !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        )
            throw new Error('Remote API origins must use HTTPS.');
        this.baseUrl = url.origin;
        this.fetcher = options.fetch ?? fetch;
        this.timeoutMs = options.timeoutMs ?? 25000;
    }
    async request<T = unknown>(
        method: string,
        path: string,
        body?: unknown,
        resourceToken?: string,
        headers: Record<string, string> = {},
    ): Promise<T> {
        const pathname = path.split('?')[0]!;
        if (
            (!/^\/(?:api|mock)\//.test(path) &&
                !/^\/ping\/[A-Za-z0-9_-]{32}(?:\/fail)?$/.test(path)) ||
            /[\\#\x00-\x20]/.test(path) ||
            pathname.split('/').some((part) => {
                try {
                    return ['.', '..'].includes(decodeURIComponent(part)) || /%2f|%5c/i.test(part);
                } catch {
                    return true;
                }
            })
        )
            throw new Error('Use a relative /api/ or /mock/ path without traversal.');
        const requestHeaders = new Headers(headers);
        requestHeaders.set('Accept', 'application/json');
        if (this.options.apiKey)
            requestHeaders.set('Authorization', `Bearer ${this.options.apiKey}`);
        if (resourceToken)
            requestHeaders.set(
                path.startsWith('/mock/') ? 'X-Access-Token' : 'X-Resource-Token',
                resourceToken,
            );
        const binary = body instanceof Uint8Array || body instanceof ArrayBuffer;
        if (body !== undefined)
            requestHeaders.set(
                'Content-Type',
                binary ? 'application/octet-stream' : 'application/json',
            );
        const response = await this.fetcher(`${this.baseUrl}${path}`, {
            method,
            headers: requestHeaders,
            ...(body !== undefined
                ? { body: binary ? (body as BodyInit) : JSON.stringify(body) }
                : {}),
            redirect: 'error',
            credentials: 'omit',
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (
            response.status === 204 ||
            response.status === 304 ||
            (method.toUpperCase() === 'HEAD' && response.ok)
        )
            return undefined as T;
        const text = await response.text();
        let value: unknown;
        try {
            value = JSON.parse(text);
        } catch {
            if (response.ok && path.startsWith('/mock/')) return text as T;
            throw new KivelError(
                'The server returned an invalid response.',
                response.status,
                response.headers.get('x-request-id') ?? undefined,
            );
        }
        if (!response.ok) {
            const message =
                value &&
                typeof value === 'object' &&
                'error' in value &&
                typeof value.error === 'string'
                    ? value.error
                    : `Request failed (${response.status}).`;
            throw new KivelError(
                message,
                response.status,
                response.headers.get('x-request-id') ?? undefined,
                Number(response.headers.get('retry-after')) || undefined,
                value &&
                    typeof value === 'object' &&
                    'requiredPlan' in value &&
                    typeof value.requiredPlan === 'string'
                    ? value.requiredPlan
                    : undefined,
                value &&
                    typeof value === 'object' &&
                    'upgradeUrl' in value &&
                    typeof value.upgradeUrl === 'string'
                    ? value.upgradeUrl
                    : undefined,
            );
        }
        return value as T;
    }
    tools() {
        return this.request<{
            tools: {
                id: string;
                name: string;
                status: 'available' | 'coming-soon';
                minimumPlan?: 'free' | 'pro' | 'team' | null;
                execution: string | null;
                description?: string;
                guide?: {
                    action: string;
                    acceptsText: boolean;
                    acceptsFile: boolean;
                    inputLabel?: string;
                    inputExample?: string;
                    options: {
                        key: string;
                        label: string;
                        defaultValue: string;
                        choices?: [string, string][];
                        min?: number;
                        max?: number;
                    }[];
                    description?: string;
                    limits?: string;
                    steps?: string[];
                    example?: string;
                };
            }[];
        }>('GET', '/api/tools');
    }
    tool(id: string) {
        return this.request<Record<string, unknown>>('GET', `/api/tools/${encodeURIComponent(id)}`);
    }
    run(
        toolId: string,
        input = '',
        options: Record<string, string> = {},
        file?: { name: string; base64: string } | { name: string; base64: string }[],
    ) {
        return this.request<Execution>('POST', `/api/tools/${encodeURIComponent(toolId)}/run`, {
            input,
            options,
            ...(file ? { file } : {}),
        });
    }
    plans() {
        return this.request('GET', '/api/plans');
    }
    activity() {
        return this.request('GET', '/api/account/activity');
    }
    startLogin(name: string, client?: string) {
        return this.request<AgentLogin>('POST', '/api/agents/login', { name, client });
    }
    finishLogin(deviceCode: string) {
        return this.request<AgentToken>('POST', '/api/agents/token', { deviceCode });
    }
    startTrial(name: string, humanEmail?: string, client?: string) {
        return this.request<AgentTrial>('POST', '/api/agents/trial', { name, humanEmail, client });
    }
    agents() {
        return this.request('GET', '/api/agents');
    }
    /** Only for accounts your human asked you to create or operate. */
    addAuthenticator(input: AuthenticatorInput) {
        return this.request<Authenticator>('POST', '/api/authenticators', input);
    }
    listAuthenticators() {
        return this.request<{ authenticators: Authenticator[]; limit: number }>(
            'GET',
            '/api/authenticators',
        );
    }
    getTotpCode(id: string) {
        return this.request<TotpCode>('GET', `/api/authenticators/${encodeURIComponent(id)}/code`);
    }
    renameAuthenticator(id: string, name: string) {
        return this.request<{ id: string; name: string }>(
            'PATCH',
            `/api/authenticators/${encodeURIComponent(id)}`,
            { name },
        );
    }
    deleteAuthenticator(id: string) {
        return this.request<void>('DELETE', `/api/authenticators/${encodeURIComponent(id)}`);
    }
    getEmailAttachment(id: string, messageId: string, attachmentId: string) {
        return this.request<EmailAttachmentLink>(
            'GET',
            `/api/email-inboxes/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
        );
    }
    async downloadEmailAttachment(
        id: string,
        messageId: string,
        attachmentId: string,
    ): Promise<Uint8Array> {
        const link = await this.getEmailAttachment(id, messageId, attachmentId);
        const url = new URL(link.downloadUrl);
        if (
            url.origin !== new URL(this.baseUrl).origin ||
            !url.pathname.startsWith('/api/email-inboxes/')
        )
            throw new Error('Invalid attachment download URL.');
        const response = await this.fetcher(url, {
            redirect: 'error',
            credentials: 'omit',
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok)
            throw new KivelError(
                'Attachment link expired or unavailable.',
                response.status,
                response.headers.get('x-request-id') ?? undefined,
            );
        return new Uint8Array(await response.arrayBuffer());
    }
    createTestWallet(input: import('./types.js').TestWalletInput) {
        return this.request<import('./types.js').TestPaymentResource>(
            'POST',
            '/api/test-wallets',
            input,
        );
    }
    createTestPaywall(input: import('./types.js').TestPaywallInput) {
        return this.request<import('./types.js').TestPaymentResource>(
            'POST',
            '/api/test-paywalls',
            input,
        );
    }
    createTestCheckout(input: import('./types.js').TestCheckoutInput) {
        return this.request<import('./types.js').TestPaymentResource & { webhookSecret: string }>(
            'POST',
            '/api/test-checkouts',
            input,
        );
    }
    testPayments(kind: 'wallets' | 'paywalls' | 'checkouts') {
        return this.request<{
            testMode: true;
            resources: import('./types.js').TestPaymentResource[];
        }>('GET', `/api/test-${kind}`);
    }
    testPayment(kind: 'wallets' | 'paywalls' | 'checkouts', id: string) {
        return this.request<import('./types.js').TestPaymentResource>(
            'GET',
            `/api/test-${kind}/${encodeURIComponent(id)}`,
        );
    }
    updateTestPayment(
        kind: 'wallets' | 'paywalls' | 'checkouts',
        id: string,
        input: Partial<
            | import('./types.js').TestWalletInput
            | import('./types.js').TestPaywallInput
            | import('./types.js').TestCheckoutInput
        >,
    ) {
        return this.request<import('./types.js').TestPaymentResource>(
            'PATCH',
            `/api/test-${kind}/${encodeURIComponent(id)}`,
            input,
        );
    }
    deleteTestPayment(kind: 'wallets' | 'paywalls' | 'checkouts', id: string) {
        return this.request<void>('DELETE', `/api/test-${kind}/${encodeURIComponent(id)}`);
    }
    walletBalance(id: string) {
        return this.testPayment('wallets', id);
    }
    topUpTestWallet(id: string, amount: number) {
        return this.request<{
            testMode: true;
            balance: number;
            transaction: import('./types.js').TestTransaction;
        }>('POST', `/api/test-wallets/${encodeURIComponent(id)}/top-up`, { amount });
    }
    walletPay(id: string, input: import('./types.js').TestPaymentInput) {
        return this.request<import('./types.js').TestPaymentResult>(
            'POST',
            `/api/test-wallets/${encodeURIComponent(id)}/pay`,
            input,
        );
    }
    listWalletTransactions(id: string, options: { cursor?: string; limit?: number } = {}) {
        const query = new URLSearchParams();
        if (options.cursor) query.set('cursor', options.cursor);
        if (options.limit !== undefined) query.set('limit', String(options.limit));
        return this.request<{
            testMode: true;
            transactions: import('./types.js').TestTransaction[];
            nextCursor?: string;
        }>('GET', `/api/test-wallets/${encodeURIComponent(id)}/transactions?${query}`);
    }
    completeTestCheckout(
        id: string,
        input: { idempotencyKey: string; card: { number: string; expiry?: string; cvc?: string } },
    ) {
        return this.request<import('./types.js').TestCheckoutAttempt>(
            'POST',
            `/api/test-checkouts/${encodeURIComponent(id)}/complete`,
            input,
        );
    }
    confirmTestCheckout(id: string, confirmationToken: string) {
        return this.request<import('./types.js').TestCheckoutAttempt>(
            'POST',
            `/api/test-checkouts/${encodeURIComponent(id)}/confirm`,
            { confirmationToken },
        );
    }
    saveCredential(input: import('./types.js').CredentialInput) {
        return this.request<{ credential: import('./types.js').Credential; password?: string }>(
            'POST',
            '/api/credentials',
            input,
        );
    }
    credentials() {
        return this.request<{ credentials: import('./types.js').Credential[]; limit: number }>(
            'GET',
            '/api/credentials',
        );
    }
    credential(id: string) {
        return this.request<import('./types.js').Credential>(
            'GET',
            `/api/credentials/${encodeURIComponent(id)}`,
        );
    }
    updateCredential(id: string, input: Partial<import('./types.js').CredentialInput>) {
        return this.request<import('./types.js').Credential>(
            'PATCH',
            `/api/credentials/${encodeURIComponent(id)}`,
            input,
        );
    }
    deleteCredential(id: string) {
        return this.request<void>('DELETE', `/api/credentials/${encodeURIComponent(id)}`);
    }
    revealCredential(id: string, approvalId?: string) {
        return this.request<import('./types.js').CredentialReveal>(
            'POST',
            `/api/credentials/${encodeURIComponent(id)}/reveal`,
            approvalId ? { approvalId } : {},
        );
    }
    generatePassword(length = 24) {
        return this.request<{ password: string }>('POST', '/api/passwords/generate', { length });
    }
    createEmailInbox(settings: import('./types.js').EmailInboxSettings = {}) {
        return this.request<EmailInbox>('POST', '/api/email-inboxes', settings);
    }
    emailInboxes() {
        return this.request<{ inboxes: EmailInbox[] }>('GET', '/api/email-inboxes');
    }
    clearEmails(id: string, token?: string) {
        return this.request<void>(
            'DELETE',
            `/api/email-inboxes/${encodeURIComponent(id)}/messages`,
            undefined,
            token,
        );
    }
    sendEmail(id: string, input: import('./types.js').SendEmailInput) {
        const { idempotencyKey, ...body } = input;
        return this.request<{ id: string; status: 'sent'; providerIds: string[] }>(
            'POST',
            `/api/email-inboxes/${encodeURIComponent(id)}/send`,
            body,
            undefined,
            { 'Idempotency-Key': idempotencyKey },
        );
    }
    emailThreads(
        id?: string,
        settings: { cursor?: string | undefined; limit?: number | undefined } = {},
    ) {
        const query = new URLSearchParams();
        if (settings.cursor) query.set('cursor', settings.cursor);
        if (settings.limit !== undefined) query.set('limit', String(settings.limit));
        const path = id
            ? `/api/email-inboxes/${encodeURIComponent(id)}/threads`
            : '/api/email-threads';
        return this.request<EmailThreadsPage>('GET', path + (query.size ? `?${query}` : ''));
    }
    emailThread(id: string, threadId: string) {
        return this.request<EmailThread>(
            'GET',
            `/api/email-inboxes/${encodeURIComponent(id)}/threads/${encodeURIComponent(threadId)}`,
        );
    }
    createEmailDraft(id: string, content: EmailContent) {
        return this.request<EmailDraft & { content: EmailContent }>(
            'POST',
            `/api/email-inboxes/${encodeURIComponent(id)}/drafts`,
            content,
        );
    }
    emailDrafts(id: string) {
        return this.request<{ drafts: EmailDraft[] }>(
            'GET',
            `/api/email-inboxes/${encodeURIComponent(id)}/drafts`,
        );
    }
    emailDraft(id: string) {
        return this.request<EmailDraft & { content: EmailContent }>(
            'GET',
            `/api/email-drafts/${encodeURIComponent(id)}`,
        );
    }
    submitEmailDraft(id: string, settings: { approval?: boolean; sendAt?: string } = {}) {
        return this.request<EmailDraft & { content: EmailContent }>(
            'POST',
            `/api/email-drafts/${encodeURIComponent(id)}/send`,
            settings,
        );
    }
    deleteEmailDraft(id: string) {
        return this.request<void>('DELETE', `/api/email-drafts/${encodeURIComponent(id)}`);
    }
    emailInboxRules(id: string) {
        return this.request<{ rules: EmailRules }>(
            'GET',
            `/api/email-inboxes/${encodeURIComponent(id)}/rules`,
        );
    }
    waitForEvent(sources: import('./types.js').SocketEventSource[], timeoutSeconds = 20) {
        return this.request<{ timedOut: boolean; events: import('./types.js').SocketEvent[] }>(
            'POST',
            '/api/events/wait',
            { sources, timeoutSeconds: this.waitTimeout(timeoutSeconds) },
        );
    }
    emailForwarding(id: string, url: string | null, token?: string) {
        return this.request<{ forwardingUrl: string | null }>(
            'PUT',
            `/api/email-inboxes/${encodeURIComponent(id)}/forwarding`,
            { url },
            token,
        );
    }
    emailInbox(id: string, token?: string) {
        return this.request<EmailInbox>(
            'GET',
            `/api/email-inboxes/${encodeURIComponent(id)}`,
            undefined,
            token,
        );
    }
    emails(id: string, token?: string) {
        return this.request<{ messages: EmailMessage[] }>(
            'GET',
            `/api/email-inboxes/${encodeURIComponent(id)}/messages`,
            undefined,
            token,
        );
    }
    waitForEmail(id: string, options: WaitOptions = {}) {
        return this.request<{ timedOut: boolean; messages: EmailMessage[] }>(
            'GET',
            `/api/email-inboxes/${encodeURIComponent(id)}/wait${this.waitQuery(options)}`,
            undefined,
            options.token,
        );
    }
    memorySet<T>(namespace: string, key: string, value: T, ttlSeconds?: number) {
        return this.request<Omit<MemoryEntry<T>, 'value'>>('PUT', memoryPath(namespace, key), {
            value,
            ttlSeconds,
        });
    }
    memoryGet<T = unknown>(namespace: string, key: string) {
        return this.request<MemoryEntry<T>>('GET', memoryPath(namespace, key));
    }
    memoryList(namespace: string, prefix = '') {
        return this.request<{
            keys: Omit<MemoryEntry, 'value'>[];
            usedBytes: number;
            limitBytes: number;
        }>('GET', `${memoryPath(namespace)}${query({ prefix })}`);
    }
    memoryDelete(namespace: string, key: string) {
        return this.request<void>('DELETE', memoryPath(namespace, key));
    }
    availablePhoneNumbers(areaCode?: string) {
        return this.request<{
            numbers: {
                number: string;
                monthlyCost: string;
                upfrontCost: string;
                currency: string;
            }[];
        }>('GET', `/api/phone-numbers/available${query({ areaCode })}`);
    }
    createPhoneNumber(number: string, idempotencyKey: string) {
        return this.request<{ number: Record<string, unknown> }>(
            'POST',
            '/api/phone-numbers',
            { number },
            undefined,
            { 'Idempotency-Key': idempotencyKey },
        );
    }
    listPhoneNumbers() {
        return this.request<{ enabled: boolean; numbers: Record<string, unknown>[] }>(
            'GET',
            '/api/phone-numbers',
        );
    }
    releasePhoneNumber(id: string) {
        return this.request<void>('DELETE', `/api/phone-numbers/${encodeURIComponent(id)}`);
    }
    listSms(id: string) {
        return this.request<{ messages: Record<string, unknown>[] }>(
            'GET',
            `/api/phone-numbers/${encodeURIComponent(id)}/sms`,
        );
    }
    waitForSms(id: string, options: { after?: string; timeoutSeconds?: number } = {}) {
        return this.request<{ timedOut: boolean; messages: Record<string, unknown>[] }>(
            'GET',
            `/api/phone-numbers/${encodeURIComponent(id)}/wait${this.waitQuery(options)}`,
        );
    }
    createSmtpInbox(settings: ResourceSettings = {}) {
        return this.request<{
            id: string;
            expiresAt: string;
            smtp: {
                host: string;
                port: number;
                secure: boolean;
                username: string;
                password: string;
            };
        }>('POST', `/api/smtp-inboxes${query(settings)}`);
    }
    smtpInbox(id: string) {
        return this.request<{
            id: string;
            expiresAt: string;
            smtp: { host: string; port: number; secure: boolean; username: string };
            enabled: boolean;
        }>('GET', `/api/smtp-inboxes/${encodeURIComponent(id)}`);
    }
    rotateSmtpPassword(id: string) {
        return this.request<{
            smtp: {
                host: string;
                port: number;
                secure: boolean;
                username: string;
                password: string;
            };
        }>('POST', `/api/smtp-inboxes/${encodeURIComponent(id)}/rotate`);
    }
    createScheduledJob(
        config: {
            name: string;
            url: string;
            body?: unknown;
            delaySeconds?: number;
            startAt?: string;
            intervalSeconds?: number;
            maxRuns?: number;
        },
        settings: ResourceSettings = {},
    ) {
        return this.request<{ id: string; status: string; nextRunAt: string }>(
            'POST',
            `/api/scheduled-jobs${query(settings)}`,
            config,
        );
    }
    scheduledJobs() {
        return this.request<{ jobs: Record<string, unknown>[] }>('GET', '/api/scheduled-jobs');
    }
    scheduledJob(id: string) {
        return this.request<Record<string, unknown>>(
            'GET',
            `/api/scheduled-jobs/${encodeURIComponent(id)}`,
        );
    }
    cancelScheduledJob(id: string) {
        return this.request<void>('DELETE', `/api/scheduled-jobs/${encodeURIComponent(id)}`);
    }
    createStatusPage(
        config: { name: string; description?: string; monitorIds: string[] },
        settings: ResourceSettings = {},
    ) {
        return this.request<{
            id: string;
            pageUrl: string;
            expiresAt: string;
            accessToken?: string;
        }>('POST', `/api/status-pages${query(settings)}`, config);
    }
    updateStatusPage(
        id: string,
        config: { name: string; description?: string; monitorIds: string[] },
    ) {
        return this.request('PUT', `/api/status-pages/${encodeURIComponent(id)}`, config);
    }
    acceptDnsChanges(id: string) {
        return this.request<{ accepted: boolean }>(
            'POST',
            `/api/monitors/${encodeURIComponent(id)}/accept-dns`,
        );
    }
    createMonitor(settings: MonitorInput) {
        return this.request<Monitor>('POST', '/api/monitors', settings);
    }
    monitors() {
        return this.request<{ monitors: Monitor[]; limit: number; minIntervalSeconds: number }>(
            'GET',
            '/api/monitors',
        );
    }
    monitor(id: string) {
        return this.request<Monitor>('GET', `/api/monitors/${encodeURIComponent(id)}`);
    }
    pingMonitor(token: string, failed = false) {
        if (!/^[A-Za-z0-9_-]{32}$/.test(token))
            throw new Error('Provide the token from the monitor pingUrl.');
        return this.request<{ ok: true; status: 'up' | 'down' }>(
            'POST',
            `/ping/${token}${failed ? '/fail' : ''}`,
        );
    }
    pauseMonitor(id: string, paused = true) {
        return this.request<{ paused: boolean }>(
            'PATCH',
            `/api/monitors/${encodeURIComponent(id)}`,
            { paused },
        );
    }
    deleteMonitor(id: string) {
        return this.request<void>('DELETE', `/api/monitors/${encodeURIComponent(id)}`);
    }
    askHuman(input: ApprovalInput) {
        return this.request<Approval>('POST', '/api/approvals', input);
    }
    approvals(pendingOnly = false) {
        return this.request<{ approvals: Approval[] }>(
            'GET',
            `/api/approvals${pendingOnly ? '?status=pending' : ''}`,
        );
    }
    approval(id: string) {
        return this.request<Approval>('GET', `/api/approvals/${encodeURIComponent(id)}`);
    }
    waitForApproval(id: string, timeoutSeconds?: number) {
        return this.request<Approval & { timedOut: boolean }>(
            'GET',
            `/api/approvals/${encodeURIComponent(id)}/wait${this.waitQuery({ timeoutSeconds })}`,
        );
    }
    inspectResource(
        kind: 'inboxes' | 'mocks' | 'files' | 'mcp-servers' | 'email-inboxes' | 'status-pages',
        id: string,
        token?: string,
    ) {
        return this.request('GET', `/api/${kind}/${encodeURIComponent(id)}`, undefined, token);
    }
    updateMock(id: string, config: unknown, token?: string) {
        return this.request('PUT', `/api/mocks/${encodeURIComponent(id)}`, config, token);
    }
    resetMock(id: string, token?: string) {
        return this.request('POST', `/api/mocks/${encodeURIComponent(id)}/reset`, {}, token);
    }
    mockCalls(id: string, token?: string) {
        return this.request('GET', `/api/mocks/${encodeURIComponent(id)}/calls`, undefined, token);
    }
    setInboxForward(id: string, url: string | null, token?: string) {
        return this.request(
            url === null ? 'DELETE' : 'PUT',
            `/api/inboxes/${encodeURIComponent(id)}/forward`,
            url === null ? undefined : { url },
            token,
        );
    }
    inboxDeliveries(id: string, token?: string) {
        return this.request(
            'GET',
            `/api/inboxes/${encodeURIComponent(id)}/deliveries`,
            undefined,
            token,
        );
    }
    private waitTimeout(timeoutSeconds?: number) {
        const ceiling = Math.max(1, Math.floor(this.timeoutMs / 1000) - 5);
        return Math.min(timeoutSeconds ?? 20, ceiling, 30);
    }
    private waitQuery(options: WaitOptions) {
        return query({
            after: options.after,
            timeoutSeconds: this.waitTimeout(options.timeoutSeconds),
        });
    }
    usage() {
        return this.request<KivelUsage>('GET', '/api/usage');
    }
    resources() {
        return this.request('GET', '/api/account/resources');
    }
    /** Senders can POST to webhookUrl without credentials by default. Inspection stays private.
     * Set visibility to private to require X-Access-Token on incoming webhooks. */
    createInbox(settings: ResourceSettings = {}) {
        return this.request<ResourceCredentials & { webhookUrl: string }>(
            'POST',
            `/api/inboxes${creationQuery({ ...settings, visibility: settings.visibility ?? 'public' })}`,
        );
    }
    inspectInbox(id: string, token?: string) {
        return this.request(
            'GET',
            `/api/inboxes/${encodeURIComponent(id)}/requests`,
            undefined,
            token,
        );
    }
    /**
     * Long-polls until the inbox captures a request newer than `after` (any request when omitted).
     * Resolves with `timedOut: true` when nothing arrives; call again to keep waiting.
     */
    waitForRequests(
        id: string,
        options: { token?: string; after?: string; timeoutSeconds?: number } = {},
    ) {
        // Stay inside the client timeout so the server answers before the request is aborted.
        const query = new URLSearchParams({
            timeoutSeconds: String(this.waitTimeout(options.timeoutSeconds)),
            ...(options.after ? { after: options.after } : {}),
        });
        return this.request<{ timedOut: boolean; requests: CapturedRequest[] }>(
            'GET',
            `/api/inboxes/${encodeURIComponent(id)}/wait?${query}`,
            undefined,
            options.token,
        );
    }
    setInboxResponse(id: string, response: InboxResponse | null, token?: string) {
        if (
            response !== null &&
            (!response || typeof response !== 'object' || Array.isArray(response))
        )
            throw new Error('Provide response settings as an object, or null to reset.');
        return this.request(
            response === null ? 'DELETE' : 'PUT',
            `/api/inboxes/${encodeURIComponent(id)}/response`,
            response ?? undefined,
            token,
        );
    }
    createOAuthProvider(
        config: OAuthProviderInput,
        settings: Omit<ResourceSettings, 'visibility'> = {},
    ) {
        return this.request<CreatedOAuthProvider>(
            'POST',
            `/api/oauth-providers${creationQuery(settings)}`,
            config,
        );
    }
    oauthProvider(id: string) {
        return this.request<OAuthProvider>('GET', `/api/oauth-providers/${encodeURIComponent(id)}`);
    }
    oauthProviders() {
        return this.request<{ providers: OAuthProvider[] }>('GET', '/api/oauth-providers');
    }
    updateOAuthProvider(id: string, config: OAuthProviderInput) {
        return this.request<void>('PUT', `/api/oauth-providers/${encodeURIComponent(id)}`, config);
    }
    deleteOAuthProvider(id: string) {
        return this.request<void>('DELETE', `/api/oauth-providers/${encodeURIComponent(id)}`);
    }
    createMock(config: unknown, settings: ResourceSettings = {}) {
        return this.request<ResourceCredentials & { endpointUrl: string }>(
            'POST',
            `/api/mocks${creationQuery(settings)}`,
            config,
        );
    }
    createMcpServer(config: unknown, settings: ResourceSettings = {}) {
        return this.request<ResourceCredentials & { endpointUrl: string }>(
            'POST',
            `/api/mcp-servers${creationQuery(settings)}`,
            config,
        );
    }
    upload(name: string, data: Uint8Array, settings: UploadSettings = {}) {
        return this.request<ResourceCredentials & { downloadUrl: string }>(
            'POST',
            `/api/files${creationQuery(settings)}`,
            data,
            undefined,
            { 'X-File-Name': encodeURIComponent(name) },
        );
    }
    sharing(
        kind: 'inboxes' | 'mocks' | 'files' | 'mcp-servers' | 'status-pages',
        id: string,
        visibility: 'public' | 'private',
        token?: string,
    ) {
        return this.request<{
            visibility: 'public' | 'private';
            accessVersion: string;
            accessToken?: string;
        }>('POST', `/api/${kind}/${encodeURIComponent(id)}/sharing`, { visibility }, token);
    }
    async downloadFile(id: string, accessToken?: string): Promise<Uint8Array> {
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))
            throw new Error('Provide a file UUID.');
        const headers: Record<string, string> = {};
        if (accessToken) headers['X-Access-Token'] = accessToken;
        if (this.options.apiKey) headers.Authorization = `Bearer ${this.options.apiKey}`;
        const response = await this.fetcher(`${this.baseUrl}/files/${id}`, {
            method: 'GET',
            headers,
            redirect: 'error',
            credentials: 'omit',
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok)
            throw new KivelError(
                'File unavailable or access denied.',
                response.status,
                response.headers.get('x-request-id') ?? undefined,
            );
        return new Uint8Array(await response.arrayBuffer());
    }
    remove(
        kind: 'inboxes' | 'mocks' | 'files' | 'mcp-servers' | 'email-inboxes' | 'status-pages',
        id: string,
        token?: string,
    ) {
        return this.request<void>(
            'DELETE',
            `/api/${kind}/${encodeURIComponent(id)}`,
            undefined,
            token,
        );
    }
    renew(
        kind: 'inboxes' | 'mocks' | 'files' | 'mcp-servers' | 'email-inboxes' | 'status-pages',
        id: string,
        settings: { persistent?: boolean } = {},
        token?: string,
    ) {
        return this.request<{ id: string; expiresAt: string; persistent: boolean }>(
            'POST',
            `/api/${kind}/${encodeURIComponent(id)}/renew`,
            settings,
            token,
        );
    }
}
function query(settings: object) {
    const params = new URLSearchParams(
        Object.entries(settings)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, String(value)]),
    );
    return params.size ? `?${params}` : '';
}

function creationQuery(settings: ResourceSettings) {
    return query({ ...settings, visibility: settings.visibility ?? 'private' });
}

function memoryPath(namespace: string, key?: string) {
    if (!/^[a-zA-Z0-9_.:-]{1,64}$/.test(namespace) || ['.', '..'].includes(namespace))
        throw new Error('Provide a valid memory namespace.');
    if (
        key !== undefined &&
        (!/^[a-zA-Z0-9_./:-]{1,200}$/.test(key) ||
            key.split('/').some((part) => ['.', '..'].includes(part)))
    )
        throw new Error('Provide a valid memory key without traversal.');
    return `/api/memory/${encodeURIComponent(namespace)}${key === undefined ? '' : '/' + key.split('/').map(encodeURIComponent).join('/')}`;
}
