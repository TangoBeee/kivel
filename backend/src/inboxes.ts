import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { sharingCredentials, publicAccessAllowed } from './sharing.js';
import type { PublicAccess, Sharing, SharingCredentials, Visibility } from './sharing.js';
import { MemoryAllocations, ownsOrToken } from './allocations.js';
import type { AllocationContext } from './allocations.js';

export const INBOX_TTL_MS = 60 * 60 * 1000;
export const MAX_INBOXES = 1000;
export const MAX_REQUESTS_PER_INBOX = 100;
export const MAX_INBOX_BYTES = 1024 * 1024;
export const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

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
}

export type CaptureResult =
    | { status: 'captured'; requestId: string }
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
        this.ledger?.release(inbox.allocation, inbox.storedBytes);
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
        this.ledger?.reserve(allocation, 1, 0);

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

        this.ledger?.reserve(inbox.allocation, 0, bytes);
        inbox.requests.push(captured);
        inbox.storedBytes += bytes;
        this.totalBytes += bytes;
        return { status: 'captured', requestId: captured.id } as const;
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
        };
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
