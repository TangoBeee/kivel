import { PostgresCredentials } from './credentials.js';
import { PostgresAuthenticators } from './authenticators.js';
import { PostgresPhones } from './phone/store.js';
import { TelnyxProvider } from './phone/telnyx.js';
import { PostgresJobs } from './scheduled-jobs.js';
import { PostgresRecoveryRepository } from './recovery-store.js';
import { PostgresMockCalls } from './mock-calls.js';
import { PostgresEmailMessages } from './email.js';
import { PostgresEmailAddresses } from './email-addresses.js';
import { PostgresEmailSending } from './email-sending-store.js';
import { PostgresActivity } from './activity.js';
import { PostgresKv } from './kv.js';
import { PostgresAgents } from './agents.js';
import { PostgresApprovals } from './approvals.js';
import { PostgresMonitors } from './monitors.js';
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
    const dashboardDir = resolve(
        process.env.DASHBOARD_DIR ?? fileURLToPath(new URL('../../dashboard/out', import.meta.url)),
    );
    const separateApp = config.appBaseUrl !== config.publicBaseUrl;
    if (config.production && separateApp && !existsSync(dashboardDir))
        throw new Error('Dashboard build is missing. Run pnpm build.');
    const identities = pool ? new PostgresIdentityRepository(pool) : new MemoryIdentityRepository();
    const limits = pool ? new PostgresRateLimiter(pool) : new RateLimiter();
    const app = buildApp({
        identityStore: identities,
        ...(pool ? { recoveryStore: new PostgresRecoveryRepository(pool) } : {}),
        ...(config.mailConfig ? { mailSender: smtpSender(config.mailConfig) } : {}),
        rateLimiter: limits,
        ...(config.authSecret ? { authSecret: config.authSecret } : {}),
        ...(pool ? { billingRepository: new BillingRepository(pool) } : {}),
        ...(pool ? { mockCalls: new PostgresMockCalls(pool) } : {}),
        ...(pool ? { emailMessages: new PostgresEmailMessages(pool, config.resourceBytes) } : {}),
        ...(pool ? { emailAddresses: new PostgresEmailAddresses(pool) } : {}),
        ...(pool ? { emailSending: new PostgresEmailSending(pool) } : {}),
        ...(config.smtpCaptureConfig ? { smtpCaptureConfig: config.smtpCaptureConfig } : {}),
        ...(config.agentEmailConfig ? { agentEmailConfig: config.agentEmailConfig } : {}),
        ...(pool ? { activity: new PostgresActivity(pool) } : {}),
        ...(pool
            ? {
                  memory: new PostgresKv(pool),
                  authenticatorStore: new PostgresAuthenticators(pool),
                  credentialStore: new PostgresCredentials(pool),
              }
            : {}),
        ...(pool ? { agentStore: new PostgresAgents(pool) } : {}),
        ...(pool ? { approvalStore: new PostgresApprovals(pool) } : {}),
        ...(pool ? { phoneStore: new PostgresPhones(pool) } : {}),
        phoneEnabled: config.phoneEnabled,
        ...(config.phoneConfig ? { phoneProvider: new TelnyxProvider(config.phoneConfig) } : {}),
        ...(pool ? { jobStore: new PostgresJobs(pool) } : {}),
        ...(pool ? { monitorStore: new PostgresMonitors(pool) } : {}),
        ...(config.mailDomain && config.emailIngestSecret
            ? { mailDomain: config.mailDomain, emailIngestSecret: config.emailIngestSecret }
            : {}),
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
        ...(separateApp ? { appBaseUrl: config.appBaseUrl } : {}),
        ...(separateApp && existsSync(dashboardDir) ? { dashboardDir } : {}),
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
        ? createSshServer(
              app,
              identities,
              limits,
              await loadHostKey(config.sshHostKeyPath),
              config.publicBaseUrl,
          )
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
