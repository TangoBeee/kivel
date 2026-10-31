import { promisify } from 'node:util';
import { execFile, spawn } from 'node:child_process';
import { mkdir, open, rename, rm, readdir } from 'node:fs/promises';
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
    const remote = process.env.BACKUP_REMOTE;
    if (remote) {
        if (
            !/^[A-Za-z0-9_-]+:[A-Za-z0-9][A-Za-z0-9_./-]+$/.test(remote) ||
            remote.split('/').includes('..')
        )
            throw new Error('BACKUP_REMOTE must name a dedicated rclone prefix.');
        const run = promisify(execFile);
        for (const path of [file, file + '.sha256'])
            await run('rclone', ['copyto', path, `${remote}/${path.split('/').pop()}`], {
                timeout: 300000,
            });
        await run(
            'rclone',
            [
                'delete',
                remote,
                '--min-age',
                '30d',
                '--include',
                'socket-*.dump',
                '--include',
                'socket-*.dump.sha256',
            ],
            { timeout: 300000 },
        );
        console.log('Off-site copy completed; remote retention is 30 days.');
    } else
        console.log(
            'Off-site copy is not configured. Set BACKUP_REMOTE after configuring an encrypted rclone remote.',
        );
    const local = (await readdir(directory))
        .filter((name) => /^socket-[0-9TZ.-]+\.dump$/.test(name))
        .sort()
        .reverse();
    for (const name of local.slice(14)) {
        await rm(join(directory, name));
        await rm(join(directory, name + '.sha256'), { force: true });
    }
} catch (error) {
    child.kill('SIGTERM');
    await rm(partial, { force: true });
    throw error;
} finally {
    clearTimeout(timer);
    await handle.close().catch(() => {});
}
