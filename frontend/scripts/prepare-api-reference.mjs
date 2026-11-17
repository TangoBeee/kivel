import { copyFile, mkdir } from 'node:fs/promises';

const bundle = new URL('./browser/standalone.js', import.meta.resolve('@scalar/api-reference'));
const output = new URL('../public/generated/', import.meta.url);
await mkdir(output, { recursive: true });
await copyFile(bundle, new URL('scalar-reference.js', output));
