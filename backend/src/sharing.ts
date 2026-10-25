import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
export type Visibility = 'public' | 'private';
export interface PublicAccess {
    token?: string;
    ownerId?: string;
}
export interface Sharing {
    visibility: Visibility;
    accessVersion: string;
}
export interface SharingCredentials extends Sharing {
    accessToken?: string;
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest();
export function sharingCredentials(visibility: Visibility = 'public') {
    const accessToken =
        visibility === 'private' ? randomBytes(32).toString('base64url') : undefined;
    return {
        visibility,
        accessVersion: randomUUID(),
        accessHash: accessToken ? tokenHash(accessToken) : null,
        ...(accessToken ? { accessToken } : {}),
    };
}
export function publicAccessAllowed(
    visibility: Visibility,
    accessHash: Buffer | null,
    ownerId: string | undefined,
    access: PublicAccess = {},
) {
    return (
        visibility === 'public' ||
        (!!ownerId && ownerId === access.ownerId) ||
        (!!accessHash && timingSafeEqual(tokenHash(access.token ?? ''), accessHash))
    );
}
