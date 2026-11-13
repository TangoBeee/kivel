import { plans } from '@kivel.io/tools/plans';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { sharingCredentials, publicAccessAllowed } from './sharing.js';
import type { PublicAccess, Sharing, SharingCredentials, Visibility } from './sharing.js';
import { MemoryAllocations, ownsOrToken } from './allocations.js';
import type { AllocationContext } from './allocations.js';

export const INBOX_TTL_MS = 60 * 60 * 1000;
export const MAX_INBOXES = 1000;
export const MAX_REQUESTS_PER_INBOX = plans.anonymous.captureRequests;
export const MAX_INBOX_BYTES = 1024 * 1024;
export const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

/** What a webhook inbox answers its senders with, instead of the default JSON receipt. */
export interface InboxResponse {
    status: number;
    contentType: string;
    body: string;
    headers: Record<string, string>;
    delayMs: number;
}

const RESPONSE_TYPES = ['application/json', 'text/plain', 'application/xml', 'text/xml'];
export const MAX_RESPONSE_BODY = 16 * 1024;

// Responses are served from the main origin, so HTML, cookies and redirects are never allowed.
export function validateInboxResponse(value: unknown): InboxResponse {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Response must be an object.');
    const input = value as Record<string, unknown>;
    for (const key of Object.keys(input))
        if (!['status', 'contentType', 'body', 'headers', 'delayMs'].includes(key))
            throw new Error(`Unknown response field: ${key}.`);
    const status = input.status ?? 200;
    if (!Number.isInteger(status) || (status as number) < 200 || (status as number) > 599)
        throw new Error('status must be an integer from 200 to 599.');
    const contentType = input.contentType ?? 'application/json';
    if (typeof contentType !== 'string' || !RESPONSE_TYPES.includes(contentType))
        throw new Error(`contentType must be one of ${RESPONSE_TYPES.join(', ')}.`);
    const body = input.body ?? '';
    if (typeof body !== 'string' || Buffer.byteLength(body) > MAX_RESPONSE_BODY)
        throw new Error('body must be a string of at most 16 KiB.');
    const delayMs = input.delayMs ?? 0;
    if (!Number.isInteger(delayMs) || (delayMs as number) < 0 || (delayMs as number) > 5000)
        throw new Error('delayMs must be an integer from 0 to 5000.');
    const headers: Record<string, string> = {};
    const rawHeaders = input.headers ?? {};
    if (!rawHeaders || typeof rawHeaders !== 'object' || Array.isArray(rawHeaders))
        throw new Error('headers must be an object.');
    const entries = Object.entries(rawHeaders);
    if (entries.length > 10) throw new Error('Use at most 10 response headers.');
    for (const [name, headerValue] of entries) {
        if (!/^x-[a-z0-9-]{1,60}$/i.test(name))
            throw new Error(
                'Custom header names must start with X- and use letters, digits and dashes.',
            );
        if (typeof headerValue !== 'string' || !/^[\x20-\x7e]{0,256}$/.test(headerValue))
            throw new Error('Header values must be printable text of at most 256 characters.');
        headers[name.toLowerCase()] = headerValue;
    }
    return {
        status: status as number,
        contentType,
        body,
        headers,
        delayMs: delayMs as number,
    };
}

/** The outcome of relaying one captured request to an inbox's forwarding URL. */
export interface InboxDelivery {
    requestId: string;
    at: string;
    attempts: number;
    status?: number;
    error?: string;
    durationMs: number;
}
export const DELIVERY_LIMIT = 100;

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

interface Inbox extends Sharing {
    accessHash: Buffer | null;
    id: string;
    inspectionTokenHash: Buffer;
    expiresAt: number;
    requests: CapturedRequest[];
    storedBytes: number;
    createdAt: number;
    persistent: boolean;
    allocation?: AllocationContext;
    requestLimit: number;
    byteLimit: number;
    response?: InboxResponse;
    forwardUrl?: string;
    deliveries?: InboxDelivery[];
}

export interface StoreLimits {
    maxInboxes?: number;
    maxRequestsPerInbox?: number;
    maxInboxBytes?: number;
    maxTotalBytes?: number;
}

interface StoreOptions extends StoreLimits {
    now?: () => number;
    quotaLedger?: MemoryAllocations;
}

export interface InboxCredentials extends SharingCredentials {
    id: string;
    inspectionToken: string;
    expiresAt: string;
}

export interface InboxInfo extends Sharing {
    id: string;
    expiresAt: string;
    requestCount: number;
    storedBytes: number;
    createdAt?: string;
    persistent?: boolean;
    ownerId?: string;
    requestLimit?: number;
    byteLimit?: number;
    response?: InboxResponse;
    forwardUrl?: string;
}

export type CaptureResult =
    | {
          status: 'captured';
          requestId: string;
          response?: InboxResponse;
          forwardUrl?: string;
          ownerId?: string;
      }
    | { status: 'not-found' | 'inbox-full' | 'storage-full' };

type MaybePromise<T> = T | Promise<T>;

export interface InboxRepository {
    create(allocation?: AllocationContext): MaybePromise<InboxCredentials | null>;
    has(id: string, access?: PublicAccess): MaybePromise<boolean>;
    info(id: string, token: string, ownerId?: string): MaybePromise<InboxInfo | undefined>;
    capture(
        id: string,
        input: Omit<CapturedRequest, 'id' | 'timestamp'>,
        access?: PublicAccess,
    ): MaybePromise<CaptureResult>;
    listRequests(
        id: string,
        token: string,
        ownerId?: string,
    ): MaybePromise<CapturedRequest[] | undefined>;
    delete(id: string, token: string, ownerId?: string): MaybePromise<boolean>;
    renew(
        id: string,
        token: string,
        expiresAt: string,
        ownerId?: string,
        persistent?: boolean,
    ): MaybePromise<boolean>;
    setSharing(
        id: string,
        token: string,
        visibility: Visibility,
        ownerId?: string,
    ): MaybePromise<SharingCredentials | undefined>;
    setResponse(
        id: string,
        token: string,
        response: InboxResponse | null,
        ownerId?: string,
    ): MaybePromise<boolean>;
    setForward(
        id: string,
        token: string,
        url: string | null,
        ownerId?: string,
    ): MaybePromise<boolean>;
    recordDelivery(id: string, delivery: InboxDelivery): MaybePromise<void>;
    listDeliveries(
        id: string,
        token: string,
        ownerId?: string,
    ): MaybePromise<InboxDelivery[] | undefined>;
    listOwned(ownerId: string): MaybePromise<InboxInfo[]>;
    deleteExpired(): MaybePromise<void>;
    ping(): MaybePromise<void>;
}

export function resolveLimits(limits: StoreLimits = {}): Required<StoreLimits> {
    const result = {
        maxInboxes: MAX_INBOXES,
        maxRequestsPerInbox: MAX_REQUESTS_PER_INBOX,
        maxInboxBytes: MAX_INBOX_BYTES,
        maxTotalBytes: MAX_TOTAL_BYTES,
        ...limits,
    };
    for (const limit of Object.values(result)) {
        if (!Number.isSafeInteger(limit) || limit < 1)
            throw new Error('Inbox limits must be positive safe integers.');
    }
    return result;
}

export class InboxStore implements InboxRepository {
    private readonly inboxes = new Map<string, Inbox>();
    private totalBytes = 0;
    private readonly now: () => number;
    private readonly limits: Required<StoreLimits>;
    private readonly ledger?: MemoryAllocations;
    private readonly caps: StoreLimits;

    constructor({ now = Date.now, quotaLedger, ...limits }: StoreOptions = {}) {
        this.now = now;
        this.caps = limits;
        if (quotaLedger) this.ledger = quotaLedger;
        this.limits = resolveLimits(limits);
    }

    ping(): void {}

    private remove(inbox: Inbox): void {
        this.totalBytes -= inbox.storedBytes;
        this.ledger?.release(inbox.allocation, 'webhooks', inbox.storedBytes);
        this.inboxes.delete(inbox.id);
    }

    private find(id: string): Inbox | undefined {
        const inbox = this.inboxes.get(id);
        if (inbox && inbox.expiresAt <= this.now()) {
            this.remove(inbox);
            return undefined;
        }
        return inbox;
    }

    has(id: string, access: PublicAccess = {}): boolean {
        const inbox = this.find(id);
        return (
            !!inbox &&
            publicAccessAllowed(
                inbox.visibility,
                inbox.accessHash,
                inbox.allocation?.ownerId,
                access,
            )
        );
    }

    private authorize(id: string, token: string, ownerId?: string): Inbox | undefined {
        const inbox = this.find(id);
        // Compare fixed-size hashes even for unknown inboxes.
        const tokenHash = createHash('sha256').update(token).digest();
        const expected = inbox?.inspectionTokenHash ?? Buffer.alloc(32);
        return ownsOrToken(inbox?.allocation?.ownerId, ownerId, () =>
            timingSafeEqual(tokenHash, expected),
        )
            ? inbox
            : undefined;
    }

    deleteExpired(): void {
        const now = this.now();
        for (const inbox of this.inboxes.values()) {
            if (inbox.expiresAt <= now) {
                this.remove(inbox);
            }
        }
    }

    create(allocation?: AllocationContext) {
        this.deleteExpired();
        if (this.inboxes.size >= this.limits.maxInboxes) {
            return null;
        }

        const id = randomUUID();
        const inspectionToken = randomBytes(32).toString('base64url');
        const expiresAt = allocation?.expiresAt
            ? Date.parse(allocation.expiresAt)
            : this.now() + INBOX_TTL_MS;
        this.ledger?.reserve(allocation, 'webhooks', 1, 0);

        const { accessToken, ...sharing } = sharingCredentials(allocation?.visibility);
        this.inboxes.set(id, {
            ...sharing,
            id,
            inspectionTokenHash: createHash('sha256').update(inspectionToken).digest(),
            expiresAt,
            createdAt: this.now(),
            persistent: allocation?.persistent ?? false,
            requestLimit: Math.min(
                allocation?.requestLimit ?? this.limits.maxRequestsPerInbox,
                this.caps.maxRequestsPerInbox ?? Infinity,
            ),
            byteLimit: Math.min(
                allocation?.byteLimit ?? this.limits.maxInboxBytes,
                this.caps.maxInboxBytes ?? Infinity,
            ),
            ...(allocation ? { allocation } : {}),
            requests: [],
            storedBytes: 0,
        });

        return {
            id,
            inspectionToken,
            expiresAt: new Date(expiresAt).toISOString(),
            visibility: sharing.visibility,
            accessVersion: sharing.accessVersion,
            ...(accessToken ? { accessToken } : {}),
        };
    }

    capture(
        id: string,
        input: Omit<CapturedRequest, 'id' | 'timestamp'>,
        access: PublicAccess = {},
    ) {
        this.deleteExpired();
        const inbox = this.find(id);
        if (
            !inbox ||
            !publicAccessAllowed(
                inbox.visibility,
                inbox.accessHash,
                inbox.allocation?.ownerId,
                access,
            )
        )
            return { status: 'not-found' } as const;

        const captured: CapturedRequest = {
            ...input,
            id: randomUUID(),
            timestamp: new Date(this.now()).toISOString(),
        };
        const bytes = Buffer.byteLength(JSON.stringify(captured));
        if (
            inbox.requests.length >= inbox.requestLimit ||
            inbox.storedBytes + bytes > inbox.byteLimit
        ) {
            return { status: 'inbox-full' } as const;
        }
        if (this.totalBytes + bytes > this.limits.maxTotalBytes) {
            return { status: 'storage-full' } as const;
        }

        this.ledger?.reserve(inbox.allocation, 'webhooks', 0, bytes);
        inbox.requests.push(captured);
        inbox.storedBytes += bytes;
        this.totalBytes += bytes;
        return {
            status: 'captured',
            requestId: captured.id,
            ...(inbox.response ? { response: inbox.response } : {}),
            ...(inbox.forwardUrl ? { forwardUrl: inbox.forwardUrl } : {}),
            ...(inbox.allocation?.ownerId ? { ownerId: inbox.allocation.ownerId } : {}),
        } as const;
    }

    listRequests(id: string, token: string, ownerId?: string): CapturedRequest[] | undefined {
        return this.authorize(id, token, ownerId)?.requests;
    }

    info(id: string, token: string, ownerId?: string): InboxInfo | undefined {
        const inbox = this.authorize(id, token, ownerId);
        if (!inbox) return undefined;
        return {
            visibility: inbox.visibility,
            accessVersion: inbox.accessVersion,
            id: inbox.id,
            expiresAt: new Date(inbox.expiresAt).toISOString(),
            requestCount: inbox.requests.length,
            storedBytes: inbox.storedBytes,
            ...(inbox.allocation
                ? {
                      createdAt: new Date(inbox.createdAt).toISOString(),
                      persistent: inbox.persistent,
                      requestLimit: inbox.requestLimit,
                      byteLimit: inbox.byteLimit,
                  }
                : {}),
            ...(inbox.allocation?.ownerId ? { ownerId: inbox.allocation.ownerId } : {}),
            ...(inbox.response ? { response: inbox.response } : {}),
            ...(inbox.forwardUrl ? { forwardUrl: inbox.forwardUrl } : {}),
        };
    }

    setForward(id: string, token: string, url: string | null, ownerId?: string) {
        const inbox = this.authorize(id, token, ownerId);
        if (!inbox) return false;
        if (url) inbox.forwardUrl = url;
        else delete inbox.forwardUrl;
        return true;
    }

    recordDelivery(id: string, delivery: InboxDelivery) {
        const inbox = this.find(id);
        if (!inbox) return;
        inbox.deliveries = [...(inbox.deliveries ?? []), delivery].slice(-DELIVERY_LIMIT);
    }

    listDeliveries(id: string, token: string, ownerId?: string) {
        const inbox = this.authorize(id, token, ownerId);
        return inbox ? [...(inbox.deliveries ?? [])] : undefined;
    }

    setResponse(id: string, token: string, response: InboxResponse | null, ownerId?: string) {
        const inbox = this.authorize(id, token, ownerId);
        if (!inbox) return false;
        if (response) inbox.response = response;
        else delete inbox.response;
        return true;
    }

    delete(id: string, token: string, ownerId?: string): boolean {
        const inbox = this.authorize(id, token, ownerId);
        if (!inbox) return false;
        this.remove(inbox);
        return true;
    }
    renew(id: string, token: string, expiresAt: string, ownerId?: string, persistent = false) {
        const inbox = this.authorize(id, token, ownerId);
        if (!inbox) return false;
        inbox.expiresAt = Date.parse(expiresAt);
        inbox.persistent = persistent;
        return true;
    }
    setSharing(id: string, token: string, visibility: Visibility, ownerId?: string) {
        const inbox = this.authorize(id, token, ownerId);
        if (!inbox) return undefined;
        const { accessToken, ...sharing } = sharingCredentials(visibility);
        Object.assign(inbox, sharing);
        return {
            visibility,
            accessVersion: sharing.accessVersion,
            ...(accessToken ? { accessToken } : {}),
        };
    }
    listOwned(ownerId: string) {
        this.deleteExpired();
        return [...this.inboxes.values()]
            .filter((inbox) => inbox.allocation?.ownerId === ownerId)
            .map((inbox) => this.info(inbox.id, '', ownerId)!);
    }
}
