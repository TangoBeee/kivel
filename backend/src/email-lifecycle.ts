import { plans } from '@kivel/tools/plans';
import type { IdentityRepository } from './identity.js';
import { effectivePlan } from './identity.js';
import type { EmailAddress, EmailAddressRepository } from './email-addresses.js';
import type { ResourceRepository } from './resources.js';
import type { EmailMessageRepository } from './email.js';

const day = 86400000;
export const PERMANENT_EMAIL_EXPIRY = '9999-12-31T00:00:00.000Z';

export class EmailLifecycle {
    private running = new Map<string, Promise<void>>();
    constructor(
        readonly addresses: EmailAddressRepository,
        private resources: ResourceRepository,
        private identities: IdentityRepository,
        private messages: EmailMessageRepository,
        private now = Date.now,
    ) {}

    async retire(row: EmailAddress) {
        const resourceId = row.resourceId;
        row.retiredAt = new Date(this.now()).toISOString();
        row.resourceId = null;
        await this.addresses.save(row);
        if (resourceId) {
            await this.resources.delete(resourceId, 'email', '', row.ownerId);
            await this.messages.delete(resourceId);
        }
    }
    reconcile(ownerId?: string): Promise<void> {
        const key = ownerId ?? '*';
        const current = this.running.get(key);
        if (current) return current;
        const run = this.sync(ownerId).finally(() => this.running.delete(key));
        this.running.set(key, run);
        return run;
    }
    private async sync(ownerId?: string) {
        const groups = new Map<string, EmailAddress[]>();
        for (const row of await this.addresses.list(ownerId)) {
            const list = groups.get(row.ownerId) ?? [];
            list.push(row);
            groups.set(row.ownerId, list);
        }
        for (const [owner, list] of groups) {
            const account = await this.identities.account(owner);
            const plan = account ? effectivePlan(account) : 'free';
            const paid = plan === 'pro' || plan === 'team';
            list.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
            const hasFree = list.some(
                (row) =>
                    row.resourceId &&
                    row.tier === 'free' &&
                    !row.pausedAt &&
                    row.expiresAt &&
                    Date.parse(row.expiresAt) > this.now(),
            );
            const newest = hasFree
                ? undefined
                : list.find((row) => row.resourceId && !row.pausedAt && row.tier === 'paid');
            let active = 0;
            for (const row of list) {
                const now = this.now();
                if (!row.resourceId) {
                    if (now - Date.parse(row.createdAt) > 5 * 60000) await this.retire(row);
                    continue;
                }
                const before = JSON.stringify(row);
                const resource = await this.resources.read(row.resourceId, 'email', '', owner);
                if (!account || !resource || (row.expiresAt && Date.parse(row.expiresAt) <= now)) {
                    await this.retire(row);
                    continue;
                }
                if (paid && active++ < plans[plan].emailInboxes) {
                    row.tier = 'paid';
                    row.pausedAt = null;
                    row.expiresAt = null;
                } else if (row.tier === 'paid' && !row.pausedAt) {
                    if (!paid && account.plan === 'free' && row.id === newest?.id) {
                        row.tier = 'free';
                        row.expiresAt = new Date(now + 7 * day).toISOString();
                    } else {
                        const lapse =
                            !paid && account.plan !== 'free' && account.planValidUntil
                                ? Math.min(now, Date.parse(account.planValidUntil))
                                : now;
                        row.pausedAt = new Date(lapse).toISOString();
                        row.expiresAt = new Date(lapse + 30 * day).toISOString();
                    }
                }
                if (row.expiresAt && Date.parse(row.expiresAt) <= now) {
                    await this.retire(row);
                    continue;
                }
                if (before !== JSON.stringify(row)) {
                    await this.addresses.save(row);
                    await this.resources.renew(
                        row.resourceId,
                        'email',
                        '',
                        row.expiresAt ?? PERMANENT_EMAIL_EXPIRY,
                        owner,
                        row.tier === 'paid',
                    );
                }
            }
        }
    }
}
