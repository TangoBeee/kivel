const configured = process.env.SITE_URL ?? 'https://kivel.io';
const value = new URL(configured);
if (
    !['https:', 'http:'].includes(value.protocol) ||
    value.username ||
    value.password ||
    value.pathname !== '/' ||
    value.search ||
    value.hash
)
    throw new Error('SITE_URL must be an HTTP(S) origin.');
export const siteOrigin = value.origin;
