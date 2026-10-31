import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createPool } from './database.js';
import { PostgresEmailSending } from './email-sending-store.js';
import type { EmailSendingRepository } from './email-sending-store.js';
import { isUuid } from './security.js';

export async function liftEmailSuspension(store: EmailSendingRepository, ownerId: string) {
    if (!isUuid(ownerId)) throw new Error('Provide a workspace UUID.');
    await store.withOwner(ownerId, (session) => session.unsuspend());
    return { workspaceId: ownerId, suspended: false, suppressionsRetained: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [action, ownerId, confirm, ...extra] = process.argv.slice(2);
    if (action !== 'unsuspend' || !ownerId || confirm !== '--confirm' || extra.length)
        throw new Error(
            'Usage: node backend/dist/email-admin.js unsuspend <workspace-uuid> --confirm',
        );
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    const pool = createPool(process.env.DATABASE_URL);
    try {
        console.log(
            JSON.stringify(await liftEmailSuspension(new PostgresEmailSending(pool), ownerId)),
        );
    } finally {
        await pool.end();
    }
}
