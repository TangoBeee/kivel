function origin(configured: string, name: string) {
    const value = new URL(configured);
    if (
        !['https:', 'http:'].includes(value.protocol) ||
        value.username ||
        value.password ||
        value.pathname !== '/' ||
        value.search ||
        value.hash
    )
        throw new Error(`${name} must be an HTTP(S) origin.`);
    return value.origin;
}
export const siteOrigin = origin(process.env.SITE_URL ?? 'https://kivel.io', 'SITE_URL');
export const appOrigin = origin(process.env.APP_URL ?? 'https://app.kivel.io', 'APP_URL');
