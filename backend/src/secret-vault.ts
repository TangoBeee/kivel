import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export function secretVault(serverSecret: string, purpose: string) {
    // The salt is the old name on purpose: changing it would make stored secrets unreadable.
    const key = Buffer.from(hkdfSync('sha256', serverSecret, 'socket.help', purpose, 32));
    return {
        encrypt(value: string, associatedData: string) {
            const iv = randomBytes(12),
                cipher = createCipheriv('aes-256-gcm', key, iv);
            cipher.setAAD(Buffer.from(associatedData));
            return Buffer.concat([
                iv,
                cipher.update(value),
                cipher.final(),
                cipher.getAuthTag(),
            ]).toString('base64');
        },
        decrypt(value: string, associatedData: string) {
            const bytes = Buffer.from(value, 'base64');
            if (bytes.length < 28) throw new Error('Invalid encrypted secret.');
            const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
            decipher.setAAD(Buffer.from(associatedData));
            decipher.setAuthTag(bytes.subarray(-16));
            return Buffer.concat([
                decipher.update(bytes.subarray(12, -16)),
                decipher.final(),
            ]).toString('utf8');
        },
    };
}
