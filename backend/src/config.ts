import { emailAddress } from './recovery.js';
import type { MailConfig } from './mail.js';
import { isIP } from 'node:net';
import { httpOrigin } from './security.js';
import type { BillingConfig } from './billing.js';

function legacyDodoProducts(
    raw: string | undefined,
    current: readonly (string | undefined)[],
): BillingConfig['legacyProducts'] {
    if (!raw) return undefined;
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {}
    if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.entries(value).some(
            ([id, plan]) =>
                !/^pdt_[A-Za-z0-9]+$/.test(id) ||
                current.includes(id) ||
                (plan !== 'pro' && plan !== 'team'),
        )
    )
        throw new Error('DODO_LEGACY_PRODUCT_IDS must map retired product IDs to pro or team.');
    return value as BillingConfig['legacyProducts'];
}

export function readConfig(env: Record<string, string | undefined>) {
    const production = env.NODE_ENV === 'production';
    const port = Number(env.PORT ?? 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error('PORT must be between 1 and 65535.');
    const publicBaseUrl = env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;
    const origin = httpOrigin(publicBaseUrl, 'PUBLIC_BASE_URL');
    const appOrigin = httpOrigin(env.APP_BASE_URL ?? origin.origin, 'APP_BASE_URL');
    if (appOrigin.origin !== origin.origin && appOrigin.hostname === origin.hostname)
        throw new Error('APP_BASE_URL must use a different hostname from PUBLIC_BASE_URL.');
    if (production && !env.PUBLIC_BASE_URL)
        throw new Error('PUBLIC_BASE_URL is required in production.');
    for (const [name, url] of [
        ['PUBLIC_BASE_URL', origin],
        ['APP_BASE_URL', appOrigin],
    ] as const) {
        if (
            production &&
            url.protocol !== 'https:' &&
            !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        )
            throw new Error(`${name} must use HTTPS in production.`);
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
    const legacyProducts = legacyDodoProducts(env.DODO_LEGACY_PRODUCT_IDS, [
        env.DODO_PRO_PRODUCT_ID,
        env.DODO_TEAM_PRODUCT_ID,
    ]);
    const dodoConfig = configured.length
        ? {
              apiKey: env.DODO_PAYMENTS_API_KEY!,
              webhookSecret: env.DODO_PAYMENTS_WEBHOOK_KEY!,
              proProduct: env.DODO_PRO_PRODUCT_ID!,
              teamProduct: env.DODO_TEAM_PRODUCT_ID!,
              ...(legacyProducts ? { legacyProducts } : {}),
              phoneAddonEnabled: env.PHONE_ENABLED === 'true',
              ...(env.DODO_PHONE_ADDON_ID ? { phoneAddonId: env.DODO_PHONE_ADDON_ID } : {}),
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
    // Agent addresses use a separate domain from account mail.
    const mailDomain = env.MAIL_DOMAIN?.trim().toLowerCase() || undefined;
    const emailIngestSecret = env.EMAIL_INGEST_SECRET || undefined;
    if (!!mailDomain !== !!emailIngestSecret)
        throw new Error('Set MAIL_DOMAIN and EMAIL_INGEST_SECRET together.');
    if (mailDomain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(mailDomain))
        throw new Error('MAIL_DOMAIN must be a domain name such as socketspace.xyz.');
    if (production && mailDomain && mailDomain !== 'socketspace.xyz')
        throw new Error('Agent email must use socketspace.xyz, separate from Kivel account mail.');
    if (emailIngestSecret && emailIngestSecret.length < 32)
        throw new Error('EMAIL_INGEST_SECRET must be at least 32 characters.');
    if (env.EMAIL_SENDING_ENABLED && !['true', 'false'].includes(env.EMAIL_SENDING_ENABLED))
        throw new Error('EMAIL_SENDING_ENABLED must be true or false.');
    const agentHost = env.AGENT_SMTP_HOST || undefined;
    const agentPort = Number(env.AGENT_SMTP_PORT || 25);
    if (
        (agentHost && !['mail', 'localhost', '127.0.0.1'].includes(agentHost)) ||
        !Number.isInteger(agentPort) ||
        agentPort < 1 ||
        agentPort > 65535
    )
        throw new Error('Configure a valid AGENT_SMTP_HOST and AGENT_SMTP_PORT.');
    if (
        env.EMAIL_SENDING_ENABLED === 'true' &&
        (!agentHost || !authSecret || mailDomain !== 'socketspace.xyz')
    )
        throw new Error(
            'Agent sending requires a private SMTP relay, AUTH_SECRET and socketspace.xyz receiving domain.',
        );
    if (agentHost && agentHost === env.SMTP_HOST)
        throw new Error('Use a separate relay for agent mail and account email.');
    const agentEmailConfig = agentHost
        ? { host: agentHost, port: agentPort, enabled: env.EMAIL_SENDING_ENABLED === 'true' }
        : undefined;
    const phoneKeys = [
        'TELNYX_API_KEY',
        'TELNYX_PUBLIC_KEY',
        'TELNYX_MESSAGING_PROFILE_ID',
    ] as const;
    const phoneSet = phoneKeys.filter((key) => env[key]);
    if (phoneSet.length && phoneSet.length !== 3)
        throw new Error('Configure all three Telnyx credentials together.');
    if (env.PHONE_ENABLED && !['true', 'false'].includes(env.PHONE_ENABLED))
        throw new Error('PHONE_ENABLED must be true or false.');
    if (
        env.PHONE_ENABLED === 'true' &&
        (!billingConfig?.phoneAddonId ||
            !env.PHONE_ADDON_PRICE_CONFIRMED ||
            env.PHONE_ADDON_PRICE_CONFIRMED !== 'true' ||
            phoneSet.length !== 3 ||
            Buffer.from(env.TELNYX_PUBLIC_KEY!, 'base64').length !== 32)
    )
        throw new Error(
            'Phone activation requires complete Telnyx settings, configured Dodo add-on, active billing and explicit price confirmation.',
        );
    const phoneConfig =
        phoneSet.length === 3
            ? {
                  apiKey: env.TELNYX_API_KEY!,
                  publicKey: env.TELNYX_PUBLIC_KEY!,
                  messagingProfileId: env.TELNYX_MESSAGING_PROFILE_ID!,
              }
            : undefined;
    const capturePort = Number(env.SMTP_CAPTURE_PORT || 0);
    if (
        !Number.isInteger(capturePort) ||
        capturePort < 0 ||
        capturePort > 65535 ||
        capturePort === port ||
        (capturePort && capturePort === sshPort)
    )
        throw new Error('SMTP_CAPTURE_PORT must be 0 or a distinct valid port.');
    if (
        capturePort &&
        (!env.SMTP_CAPTURE_PUBLIC_HOST ||
            !/^[a-z0-9.-]+$/i.test(env.SMTP_CAPTURE_PUBLIC_HOST) ||
            !env.SMTP_CAPTURE_CERT_PATH ||
            !env.SMTP_CAPTURE_KEY_PATH)
    )
        throw new Error('SMTP capture requires a public host and TLS certificate/key paths.');
    const capturePublicPort = Number(env.SMTP_CAPTURE_PUBLIC_PORT || 465);
    if (!Number.isInteger(capturePublicPort) || capturePublicPort < 1 || capturePublicPort > 65535)
        throw new Error('Invalid SMTP_CAPTURE_PUBLIC_PORT.');
    const smtpCaptureConfig = capturePort
        ? {
              port: capturePort,
              host: '0.0.0.0',
              publicHost: env.SMTP_CAPTURE_PUBLIC_HOST!,
              publicPort: capturePublicPort,
              certPath: env.SMTP_CAPTURE_CERT_PATH!,
              keyPath: env.SMTP_CAPTURE_KEY_PATH!,
          }
        : undefined;
    return {
        production,
        smtpCaptureConfig,
        phoneConfig,
        phoneEnabled: env.PHONE_ENABLED === 'true',
        mailDomain,
        emailIngestSecret,
        agentEmailConfig,
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
        appBaseUrl: appOrigin.origin,
        databaseUrl,
        trustProxy,
        logLevel,
        host: env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
    };
}
