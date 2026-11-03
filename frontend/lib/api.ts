export interface Inbox {
    id: string;
    visibility?: 'private' | 'public';
    accessToken?: string;
    accessVersion?: string;
    inspectionToken: string;
    requestLimit?: number;
    webhookUrl: string;
    expiresAt: string;
    response?: InboxResponse;
    forwardUrl?: string;
}

export interface InboxResponse {
    status: number;
    contentType: string;
    body: string;
    headers: Record<string, string>;
    delayMs: number;
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

export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
        public retryAfter: number = 0,
    ) {
        super(message);
    }
}

export async function api(
    path: string,
    options: RequestInit = {},
    timeoutMs = 10_000,
): Promise<Response> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const response = await fetch(path, {
        ...options,
        signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
        cache: 'no-store',
    });
    if (!response.ok && response.status !== 304) {
        let message = 'Something went wrong. Please try again.';
        try {
            message = (await response.json()).error ?? message;
        } catch {}
        const retry = response.headers.get('retry-after') ?? '0';
        const seconds = Number(retry);
        const delay = Number.isFinite(seconds) ? seconds : (Date.parse(retry) - Date.now()) / 1000;
        throw new ApiError(
            message,
            response.status,
            Number.isFinite(delay) ? Math.max(0, Math.ceil(delay)) : 0,
        );
    }
    return response;
}

export function resourceHeaders(token: string): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

const SESSION_KEY = 'socket-webhook-inbox';
export function remember(inbox: Inbox | null): void {
    try {
        if (inbox) sessionStorage.setItem(SESSION_KEY, JSON.stringify(inbox));
        else sessionStorage.removeItem(SESSION_KEY);
    } catch {}
}

export function restore(): Inbox | null {
    try {
        const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
        if (
            typeof value?.id !== 'string' ||
            !/^[a-f0-9-]{36}$/i.test(value.id) ||
            typeof value.inspectionToken !== 'string' ||
            (value.inspectionToken !== '' && !/^[A-Za-z0-9_-]{43}$/.test(value.inspectionToken)) ||
            typeof value.webhookUrl !== 'string' ||
            !Number.isFinite(Date.parse(value.expiresAt)) ||
            Date.parse(value.expiresAt) <= Date.now()
        ) {
            remember(null);
            return null;
        }
        return value as Inbox;
    } catch {
        remember(null);
        return null;
    }
}
