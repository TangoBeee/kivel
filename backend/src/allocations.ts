import { plans } from '@kivel.io/tools/plans';
import type { PlanId } from '@kivel.io/tools/plans';
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
                    limit,
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
    private usage = new Map<string, { count: number; bytes: number; plan: PlanId }>();
    reserve(context: AllocationContext | undefined, count: number, bytes: number) {
        if (!context) return;
        const usage = this.usage.get(context.quotaKey) ?? {
            count: 0,
            bytes: 0,
            plan: context.plan,
        };
        usage.plan = context.plan;
        if (count > 0) checkLimit(context.plan, 'resources.active', usage.count, count);
        if (bytes > 0) checkLimit(context.plan, 'resources.storage', usage.bytes, bytes);
        usage.count += count;
        usage.bytes += bytes;
        if (usage.count === 0 && usage.bytes === 0) this.usage.delete(context.quotaKey);
        else this.usage.set(context.quotaKey, usage);
    }
    release(context: AllocationContext | undefined, bytes: number) {
        this.reserve(context, -1, -bytes);
    }
    info(key: string) {
        const value = this.usage.get(key);
        return { resourceCount: value?.count ?? 0, storedBytes: value?.bytes ?? 0 };
    }
}
export const ownsOrToken = (
    owner: string | undefined,
    requestingOwner: string | undefined,
    verify: () => boolean,
) => (owner ? owner === requestingOwner : verify());
