import { PostgresRecoveryRepository } from './recovery-store.js';
import { smtpSender } from './mail.js';
import { buildApp } from './app.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from './config.js';
import { createPool, migrate } from './database.js';
import { PostgresInboxStore, PostgresRateLimiter } from './postgres.js';
import type { Pool } from 'pg';
import { PostgresResourceStore } from './resources.js';
import { MemoryIdentityRepository, PostgresIdentityRepository } from './identity.js';
import { RateLimiter } from './rate-limit.js';
import { BillingRepository } from './billing.js';
import { createSshServer, loadHostKey } from './ssh.js';

let pool: Pool | undefined;
try {
    const config = readConfig(process.env);
    if (config.databaseUrl) {
        pool = createPool(config.databaseUrl);
        pool.on('error', () => console.error('Unexpected database connection error.'));
        await migrate(pool);
    }
    const frontendDir = resolve(
        process.env.FRONTEND_DIR ?? fileURLToPath(new URL('../../frontend/out', import.meta.url)),
    );
    if (config.production && !existsSync(frontendDir))
        throw new Error('Frontend build is missing. Run pnpm build.');
    const identities = pool ? new PostgresIdentityRepository(pool) : new MemoryIdentityRepository();
    const limits = pool ? new PostgresRateLimiter(pool) : new RateLimiter();
    const app = buildApp({
        identityStore: identities,
        ...(pool ? { recoveryStore: new PostgresRecoveryRepository(pool) } : {}),
        ...(config.mailConfig ? { mailSender: smtpSender(config.mailConfig) } : {}),
        rateLimiter: limits,
        ...(config.authSecret ? { authSecret: config.authSecret } : {}),
        ...(pool ? { billingRepository: new BillingRepository(pool) } : {}),
        ...(config.billingConfig ? { billingConfig: config.billingConfig } : {}),
        publicBaseUrl: config.publicBaseUrl,
        production: config.production,
        trustProxy: config.trustProxy,
        logger: true,
        logLevel: config.logLevel,
        ...(pool
            ? {
                  inboxStore: new PostgresInboxStore(
                      pool,
                      { maxInboxes: config.inboxCount, maxTotalBytes: config.inboxBytes },
                      true,
                  ),
                  resourceStore: new PostgresResourceStore(
                      pool,
                      config.resourceBytes,
                      config.resourceCount,
                      true,
                  ),
              }
            : {}),
        ...(existsSync(frontendDir) ? { frontendDir } : {}),
    });
    const database = pool;
    app.addHook('onClose', async () => {
        await database?.end();
    });
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
            const timeout = setTimeout(() => process.exit(1), 10_000).unref();
            void app
                .close()
                .catch(() => {
                    process.exitCode = 1;
                })
                .finally(() => clearTimeout(timeout));
        });
    }
    const ssh = config.sshPort
        ? createSshServer(app, identities, limits, await loadHostKey(config.sshHostKeyPath))
        : undefined;
    if (ssh) app.addHook('preClose', () => ssh.close());
    const address = await app.listen({ port: config.port, host: config.host });
    if (ssh) {
        await new Promise<void>((resolve, reject) => {
            ssh.server.once('error', reject);
            ssh.server.listen(config.sshPort, config.host, () => {
                ssh.server.removeListener('error', reject);
                resolve();
            });
        });
        ssh.server.on('error', () => {
            app.log.error('SSH gateway failed.');
            void app.close();
        });
        app.log.info({ port: config.sshPort, fingerprint: ssh.fingerprint }, 'SSH gateway ready');
    }
    app.log.info({ address, storage: pool ? 'postgresql' : 'memory' }, 'Server ready');
} catch (error) {
    console.error('Startup failed:', error instanceof Error ? error.message : 'Unknown error');
    await pool?.end();
    process.exitCode = 1;
}
