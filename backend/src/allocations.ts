import { plans } from '@kivel.io/tools/plans';
import type { PlanId } from '@kivel.io/tools/plans';
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
export class QuotaError extends Error {
    statusCode = 429;
    constructor(public reason: 'resources' | 'storage') {
        super(
            reason === 'resources'
                ? 'Your plan’s active resource limit has been reached.'
                : 'Your plan’s storage allowance has been reached.',
        );
    }
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
        if (count > 0 && usage.count + count > plans[context.plan].maxResources)
            throw new QuotaError('resources');
        if (bytes > 0 && usage.bytes + bytes > plans[context.plan].storageBytes)
            throw new QuotaError('storage');
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
