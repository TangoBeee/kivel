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
export class SocketError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly requestId?: string,
        readonly retryAfter?: number,
    ) {
        super(message);
        this.name = 'SocketError';
    }
}
export class SocketHelp {
    readonly baseUrl: string;
    private fetcher: typeof fetch;
    private timeoutMs: number;
    constructor(private options: ClientOptions = {}) {
        const url = new URL(options.baseUrl ?? 'https://socket.help');
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
        if (
            !/^\/(?:api|mock)\/[a-zA-Z0-9_/?=&%.,:-]+$/.test(path) ||
            path.includes('..') ||
            /%2f|%5c|%2e/i.test(path)
        )
            throw new Error('Use a relative /api/ or /mock/ path.');
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
        if (response.status === 204 || response.status === 304) return undefined as T;
        const text = await response.text();
        let value: unknown;
        try {
            value = JSON.parse(text);
        } catch {
            throw new SocketError(
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
            throw new SocketError(
                message,
                response.status,
                response.headers.get('x-request-id') ?? undefined,
                Number(response.headers.get('retry-after')) || undefined,
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
    usage() {
        return this.request('GET', '/api/usage');
    }
    resources() {
        return this.request('GET', '/api/account/resources');
    }
    createInbox(settings: ResourceSettings = {}) {
        return this.request<ResourceCredentials & { webhookUrl: string }>(
            'POST',
            `/api/inboxes${creationQuery(settings)}`,
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
        const ceiling = Math.max(1, Math.floor(this.timeoutMs / 1000) - 5);
        const query = new URLSearchParams({
            timeoutSeconds: String(Math.min(options.timeoutSeconds ?? 20, ceiling, 30)),
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
        return this.request(
            response ? 'PUT' : 'DELETE',
            `/api/inboxes/${encodeURIComponent(id)}/response`,
            response ?? undefined,
            token,
        );
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
        kind: 'inboxes' | 'mocks' | 'files' | 'mcp-servers',
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
            throw new SocketError(
                'File unavailable or access denied.',
                response.status,
                response.headers.get('x-request-id') ?? undefined,
            );
        return new Uint8Array(await response.arrayBuffer());
    }
    remove(kind: 'inboxes' | 'mocks' | 'files' | 'mcp-servers', id: string, token?: string) {
        return this.request<void>(
            'DELETE',
            `/api/${kind}/${encodeURIComponent(id)}`,
            undefined,
            token,
        );
    }
    renew(
        kind: 'inboxes' | 'mocks' | 'files' | 'mcp-servers',
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
