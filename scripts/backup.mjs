import { spawn } from 'node:child_process';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { join, resolve } from 'node:path';
const directory = resolve(process.argv[2] ?? 'backups');
await mkdir(directory, { recursive: true, mode: 0o700 });
const file = join(directory, `socket-${new Date().toISOString().replaceAll(':', '-')}.dump`),
    partial = file + '.partial';
const handle = await open(partial, 'wx', 0o600);
const child = spawn(
    'docker',
    ['compose', 'exec', '-T', 'database', 'pg_dump', '-U', 'socket_admin', '-d', 'socket', '-Fc'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
);
let stderr = '';
child.stderr.on('data', (chunk) => {
    if (stderr.length < 2000) stderr += chunk.toString();
});
const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) =>
        code === 0 ? resolve() : reject(Error(`Database dump failed: ${stderr || code}`)),
    );
});
const timer = setTimeout(() => child.kill('SIGTERM'), 300000).unref();
try {
    await Promise.all([completed, pipeline(child.stdout, handle.createWriteStream())]);
    await rename(partial, file);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    const checksum = await open(file + '.sha256', 'wx', 0o600);
    try {
        await checksum.writeFile(`${hash.digest('hex')}  ${file.split('/').pop()}\n`);
    } finally {
        await checksum.close();
    }
    console.log(`Backup written: ${file}`);
    console.log('Copy the dump, checksum and a separately protected .env to off-VM storage.');
} catch (error) {
    child.kill('SIGTERM');
    await rm(partial, { force: true });
    throw error;
} finally {
    clearTimeout(timer);
    await handle.close().catch(() => {});
}
