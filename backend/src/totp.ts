import { createHmac } from 'node:crypto';
import { secretVault } from './secret-vault.js';
import { HttpError } from './errors.js';

export interface TotpConfig {
    secret: string;
    algorithm: 'SHA1' | 'SHA256' | 'SHA512';
    digits: 6 | 7 | 8;
    period: 30 | 60;
}
export function decodeBase32(input: string) {
    const value = input.toUpperCase().replace(/\s/g, '').replace(/=+$/, '');
    if (!/^[A-Z2-7]{16,205}$/.test(value))
        throw new HttpError(400, 'secret must be a Base32 key containing 10–128 bytes.');
    let bits = 0,
        buffer = 0;
    const bytes: number[] = [];
    for (const char of value) {
        buffer = (buffer << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char);
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((buffer >>> bits) & 255);
        }
    }
    if (bytes.length < 10 || bytes.length > 128 || (bits && buffer & ((1 << bits) - 1)))
        throw new HttpError(400, 'secret is not canonical Base32.');
    return Buffer.from(bytes);
}
export function parseTotp(input: Record<string, unknown>) {
    let secret = input.secret,
        algorithm = input.algorithm ?? 'SHA1',
        digits = input.digits ?? 6,
        period = input.period ?? 30;
    let issuer = '',
        accountName = '';
    if (input.uri !== undefined) {
        if (typeof input.uri !== 'string' || input.uri.length > 2048)
            throw new HttpError(400, 'uri must be a bounded otpauth://totp URI.');
        let uri: URL;
        try {
            uri = new URL(input.uri);
        } catch {
            throw new HttpError(400, 'uri must be an otpauth://totp URI.');
        }
        if (
            uri.protocol !== 'otpauth:' ||
            uri.hostname !== 'totp' ||
            uri.username ||
            uri.password ||
            uri.port ||
            uri.hash
        )
            throw new HttpError(400, 'Only otpauth://totp URIs are supported.');
        for (const key of ['secret', 'algorithm', 'digits', 'period', 'issuer'])
            if (uri.searchParams.getAll(key).length > 1)
                throw new HttpError(400, `Duplicate ${key} in uri.`);
        if (['algorithm', 'digits', 'period'].some((key) => input[key] !== undefined))
            throw new HttpError(
                400,
                'Set algorithm, digits and period inside uri when using an otpauth URI.',
            );
        secret = uri.searchParams.get('secret');
        algorithm = uri.searchParams.get('algorithm') ?? 'SHA1';
        digits = Number(uri.searchParams.get('digits') ?? 6);
        period = Number(uri.searchParams.get('period') ?? 30);
        let label: string;
        try {
            label = decodeURIComponent(uri.pathname.slice(1));
        } catch {
            throw new HttpError(400, 'Invalid label in uri.');
        }
        issuer =
            uri.searchParams.get('issuer') ?? (label.includes(':') ? label.split(':')[0]! : '');
        accountName = label.includes(':') ? label.slice(label.indexOf(':') + 1) : label;
    }
    if (typeof secret !== 'string' || secret.length > 256)
        throw new HttpError(400, 'Provide a Base32 secret.');
    const normalized = secret.toUpperCase().replace(/\s|=/g, '');
    decodeBase32(secret);
    if (
        !['SHA1', 'SHA256', 'SHA512'].includes(String(algorithm)) ||
        ![6, 7, 8].includes(Number(digits)) ||
        ![30, 60].includes(Number(period))
    )
        throw new HttpError(
            400,
            'Use algorithm SHA1/SHA256/SHA512, digits 6–8 and period 30 or 60.',
        );
    if (typeof algorithm !== 'string' || typeof digits !== 'number' || typeof period !== 'number')
        throw new HttpError(400, 'digits and period must be numbers.');
    if (/[\x00-\x1f\x7f]/.test(issuer + accountName))
        throw new HttpError(400, 'uri labels cannot contain control characters.');
    return {
        config: { secret: normalized, algorithm, digits, period } as TotpConfig,
        issuer: issuer.slice(0, 120).toWellFormed(),
        accountName: accountName.slice(0, 200).toWellFormed(),
    };
}
export function totp(config: TotpConfig, now = Date.now()) {
    const step = Math.floor(now / 1000 / config.period);
    const generate = (counter: number) => {
        const bytes = Buffer.alloc(8);
        bytes.writeBigUInt64BE(BigInt(counter));
        const hash = createHmac(config.algorithm.toLowerCase(), decodeBase32(config.secret))
            .update(bytes)
            .digest();
        const offset = hash.at(-1)! & 15;
        return String((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** config.digits).padStart(
            config.digits,
            '0',
        );
    };
    const expiresAt = (step + 1) * config.period * 1000;
    const remainingMs = expiresAt - now;
    const secondsRemaining = Math.ceil(remainingMs / 1000);
    return {
        code: generate(step),
        secondsRemaining,
        expiresAt: new Date(expiresAt).toISOString(),
        ...(remainingMs < 5000 ? { nextCode: generate(step + 1) } : {}),
    };
}
export function totpVault(serverSecret: string) {
    const vault = secretVault(serverSecret, 'authenticator-v1');
    return {
        encrypt(config: TotpConfig, owner: string, id: string) {
            return vault.encrypt(JSON.stringify(config), `${owner}:${id}`);
        },
        decrypt(value: string, owner: string, id: string): TotpConfig {
            return JSON.parse(vault.decrypt(value, `${owner}:${id}`));
        },
    };
}
