import {
    plans,
    resourceAllowanceKeys,
    resourceCountKey,
    resourceStorageKey,
} from '@kivel.io/tools/plans';
import type { PlanId, ResourceAllowance } from '@kivel.io/tools/plans';
import type { ResourceKind } from './resources.js';
import { checkLimit, HttpError, LimitError } from './errors.js';
export interface AllocationContext {
    visibility?: 'public' | 'private';
    quotaKey: string;
    ownerId?: string;
    plan: PlanId;
    expiresAt?: string;
    persistent?: boolean;
    requestLimit?: number;
    byteLimit?: number;
    maxUses?: number;
}
export function resourceAllowance(
    kind: ResourceKind,
    payload: Record<string, unknown>,
): ResourceAllowance {
    switch (kind) {
        case 'mock':
            return payload.payment ? 'payments' : 'mocks';
        case 'mcp':
            return 'mocks';
        case 'email':
            return payload.smtpCapture ? 'smtp' : 'email';
        case 'file':
            return 'files';
        case 'status':
            return 'status';
        case 'job':
            return 'jobs';
    }
}

export const resourceAllowanceSql = (kind: string, payload: string) => `CASE ${kind}
    WHEN 'mock' THEN CASE WHEN ${payload}::jsonb ? 'payment' THEN 'payments' ELSE 'mocks' END
    WHEN 'mcp' THEN 'mocks'
    WHEN 'email' THEN CASE WHEN ${payload}::jsonb ? 'smtpCapture' THEN 'smtp' ELSE 'email' END
    WHEN 'file' THEN 'files'
    WHEN 'status' THEN 'status'
    WHEN 'job' THEN 'jobs'
END`;

export function allocationError(error: { code?: string; message?: string; detail?: string }) {
    if (error.code !== 'P0001') return;
    const limit =
        error.message === 'account_resource_limit'
            ? 'resources.active'
            : error.message === 'account_storage_limit'
              ? 'resources.storage'
              : undefined;
    if (!limit) return;
    if (error.detail) {
        try {
            const data = JSON.parse(error.detail);
            if (
                data &&
                Object.hasOwn(plans, data.plan) &&
                [data.used, data.max, data.adding].every(Number.isSafeInteger) &&
                data.used >= 0 &&
                data.max >= 0 &&
                data.adding > 0
            )
                return new LimitError(
                    resourceAllowanceKeys.includes(data.product)
                        ? limit === 'resources.active'
                            ? resourceCountKey(data.product)
                            : resourceStorageKey(data.product)
                        : limit,
                    data.used,
                    data.plan as PlanId,
                    data.adding,
                    undefined,
                    data.max,
                );
        } catch {}
    }
    return new HttpError(402, 'Your workspace has reached its resource or storage allowance.');
}

export class MemoryAllocations {
    private usage = new Map<string, Map<ResourceAllowance, { count: number; bytes: number }>>();
    reserve(
        context: AllocationContext | undefined,
        product: ResourceAllowance,
        count: number,
        bytes: number,
    ) {
        if (!context) return;
        const buckets = this.usage.get(context.quotaKey) ?? new Map();
        const usage = buckets.get(product) ?? { count: 0, bytes: 0 };
        if (count > 0 && product !== 'email')
            checkLimit(context.plan, resourceCountKey(product), usage.count, count);
        if (bytes > 0) checkLimit(context.plan, resourceStorageKey(product), usage.bytes, bytes);
        usage.count += count;
        usage.bytes += bytes;
        if (usage.count === 0 && usage.bytes === 0) buckets.delete(product);
        else buckets.set(product, usage);
        if (buckets.size === 0) this.usage.delete(context.quotaKey);
        else this.usage.set(context.quotaKey, buckets);
    }
    release(context: AllocationContext | undefined, product: ResourceAllowance, bytes: number) {
        this.reserve(context, product, -1, -bytes);
    }
    info(key: string) {
        const totals = { resourceCount: 0, storedBytes: 0 };
        for (const value of this.usage.get(key)?.values() ?? []) {
            totals.resourceCount += value.count;
            totals.storedBytes += value.bytes;
        }
        return totals;
    }
}
export const ownsOrToken = (
    owner: string | undefined,
    requestingOwner: string | undefined,
    verify: () => boolean,
) => (owner ? owner === requestingOwner : verify());
