import { emailAddress } from './recovery.js';
import type { MailConfig } from './mail.js';
import { isIP } from 'node:net';

export function readConfig(env: Record<string, string | undefined>) {
    const production = env.NODE_ENV === 'production';
    const port = Number(env.PORT ?? 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error('PORT must be between 1 and 65535.');
    const publicBaseUrl = env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;
    let origin: URL;
    try {
        origin = new URL(publicBaseUrl);
    } catch {
        throw new Error('PUBLIC_BASE_URL must be a valid HTTP(S) origin.');
    }
    if (
        !['http:', 'https:'].includes(origin.protocol) ||
        origin.username ||
        origin.password ||
        origin.pathname !== '/' ||
        origin.search ||
        origin.hash
    ) {
        throw new Error(
            'PUBLIC_BASE_URL must be an HTTP(S) origin without credentials, path, query, or fragment.',
        );
    }
    if (production && !env.PUBLIC_BASE_URL)
        throw new Error('PUBLIC_BASE_URL is required in production.');
    if (
        production &&
        origin.protocol !== 'https:' &&
        !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
    ) {
        throw new Error('PUBLIC_BASE_URL must use HTTPS in production.');
    }
    const databaseUrl = env.DATABASE_URL;
    if (production && !databaseUrl) throw new Error('DATABASE_URL is required in production.');
    if (databaseUrl) {
        try {
            const database = new URL(databaseUrl);
            if (
                !['postgres:', 'postgresql:'].includes(database.protocol) ||
                !database.hostname ||
                !database.pathname.slice(1)
            )
                throw new Error();
        } catch {
            throw new Error('DATABASE_URL must be a PostgreSQL URL with a database name.');
        }
    }
    const trustProxy =
        env.TRUSTED_PROXIES?.split(',')
            .map((part) => part.trim())
            .filter(Boolean) ?? [];
    for (const proxy of trustProxy) {
        const [address = '', prefix, extra] = proxy.split('/');
        const version = isIP(address);
        if (
            !version ||
            extra !== undefined ||
            (prefix !== undefined &&
                (!/^\d+$/.test(prefix) ||
                    Number(prefix) < 1 ||
                    Number(prefix) > (version === 4 ? 32 : 128)))
        ) {
            throw new Error(
                'TRUSTED_PROXIES must contain explicit IP addresses or CIDRs; trust-all ranges are not allowed.',
            );
        }
    }
    const logLevel = env.LOG_LEVEL ?? 'info';
    if (!['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'].includes(logLevel))
        throw new Error('Invalid LOG_LEVEL.');
    const authSecret = env.AUTH_SECRET;
    if (authSecret !== undefined && authSecret.length < 32)
        throw new Error('AUTH_SECRET must contain at least 32 characters.');
    if (production && !authSecret)
        throw new Error('AUTH_SECRET is required in production. Run node scripts/setup-env.mjs.');
    if (Object.keys(env).some((key) => key.startsWith('STRIPE_') && env[key]))
        throw new Error('Stripe billing is no longer supported. Configure Dodo Payments instead.');
    const billingEnabled = env.BILLING_ENABLED === 'true';
    if (env.BILLING_ENABLED && !['true', 'false'].includes(env.BILLING_ENABLED))
        throw new Error('BILLING_ENABLED must be true or false.');
    const billingKeys = [
        'DODO_PAYMENTS_API_KEY',
        'DODO_PAYMENTS_WEBHOOK_KEY',
        'DODO_PRO_PRODUCT_ID',
        'DODO_TEAM_PRODUCT_ID',
    ] as const;
    const configured = billingKeys.filter((key) => env[key]);
    if (configured.length && configured.length !== billingKeys.length)
        throw new Error(
            'Configure all four Dodo Payments settings together, or leave them all unset.',
        );
    const environment = env.DODO_PAYMENTS_ENVIRONMENT || 'test_mode';
    if (!['test_mode', 'live_mode'].includes(environment))
        throw new Error('DODO_PAYMENTS_ENVIRONMENT must be test_mode or live_mode.');
    const dodoConfig = configured.length
        ? {
              apiKey: env.DODO_PAYMENTS_API_KEY!,
              webhookSecret: env.DODO_PAYMENTS_WEBHOOK_KEY!,
              proProduct: env.DODO_PRO_PRODUCT_ID!,
              teamProduct: env.DODO_TEAM_PRODUCT_ID!,
              environment: environment as 'test_mode' | 'live_mode',
          }
        : undefined;
    if (
        dodoConfig &&
        (dodoConfig.apiKey.trim() !== dodoConfig.apiKey ||
            dodoConfig.apiKey.length < 12 ||
            !/^whsec_[A-Za-z0-9+/=]+$/.test(dodoConfig.webhookSecret) ||
            !/^pdt_[A-Za-z0-9]+$/.test(dodoConfig.proProduct) ||
            !/^pdt_[A-Za-z0-9]+$/.test(dodoConfig.teamProduct) ||
            dodoConfig.proProduct === dodoConfig.teamProduct ||
            !databaseUrl)
    )
        throw new Error(
            'Dodo Payments requires valid credentials, distinct product IDs, and PostgreSQL.',
        );
    if (billingEnabled && !dodoConfig)
        throw new Error(
            'BILLING_ENABLED requires all four Dodo Payments credentials/product settings.',
        );
    const billingConfig = billingEnabled ? dodoConfig : undefined;
    let mailConfig: MailConfig | undefined;
    if (env.SMTP_HOST || env.SMTP_FROM || env.SMTP_USER || env.SMTP_PASSWORD || env.SMTP_PORT) {
        const host = env.SMTP_HOST ?? '',
            mailPort = Number(env.SMTP_PORT || 587);
        if (
            !host ||
            /[\s/\\]/.test(host) ||
            !env.SMTP_FROM ||
            !Number.isInteger(mailPort) ||
            mailPort < 1 ||
            mailPort > 65535 ||
            !!env.SMTP_USER !== !!env.SMTP_PASSWORD
        )
            throw new Error(
                'Configure SMTP_HOST, SMTP_FROM, a valid SMTP_PORT, and both SMTP credentials when authentication is required.',
            );
        const from = emailAddress(env.SMTP_FROM);
        const local =
            ['localhost', '127.0.0.1', '::1', 'mailpit'].includes(host) &&
            ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
        mailConfig = {
            host,
            port: mailPort,
            from,
            local,
            ...(env.SMTP_USER ? { user: env.SMTP_USER, password: env.SMTP_PASSWORD! } : {}),
        };
        if (!authSecret) throw new Error('AUTH_SECRET is required for encrypted email delivery.');
    }
    if (production && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) && !mailConfig)
        throw new Error('Configure recovery email delivery before a public production deployment.');
    if (billingConfig && !mailConfig)
        throw new Error('Configure recovery email delivery before enabling paid subscriptions.');
    const sshPort = Number(env.SSH_PORT ?? 0);
    if (!Number.isInteger(sshPort) || sshPort < 0 || sshPort > 65535 || sshPort === port)
        throw new Error('SSH_PORT must be 0 (disabled) or a distinct port between 1 and 65535.');
    const positive = (name: string, fallback: number) => {
        const value = Number(env[name] ?? fallback);
        if (!Number.isSafeInteger(value) || value < 1)
            throw new Error(`${name} must be a positive safe integer.`);
        return value;
    };
    const resourceBytes = positive('MAX_RESOURCE_BYTES', 4 * 1024 ** 3),
        resourceCount = positive('MAX_RESOURCES', 10000);
    const inboxBytes = positive('MAX_TOTAL_INBOX_BYTES', 1024 ** 3),
        inboxCount = positive('MAX_INBOXES', 10000);
    return {
        production,
        resourceBytes,
        resourceCount,
        inboxBytes,
        inboxCount,
        authSecret,
        billingConfig,
        mailConfig,
        sshPort,
        sshHostKeyPath: env.SSH_HOST_KEY_PATH ?? '.data/ssh_host_ed25519',
        port,
        publicBaseUrl: origin.origin,
        databaseUrl,
        trustProxy,
        logLevel,
        host: env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
    };
}
