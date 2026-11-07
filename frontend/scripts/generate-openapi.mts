// Snapshot the backend's OpenAPI document so the reference page can render a crawlable endpoint index.
import { mkdirSync, writeFileSync } from 'node:fs';
import { openApi } from '../../backend/src/openapi.ts';

const origin = process.env.SITE_URL ?? 'https://kivel.io';
mkdirSync(new URL('../lib/generated/', import.meta.url), { recursive: true });
writeFileSync(
    new URL('../lib/generated/openapi.json', import.meta.url),
    JSON.stringify(openApi(origin), null, 2),
);
console.log('OpenAPI snapshot written');
