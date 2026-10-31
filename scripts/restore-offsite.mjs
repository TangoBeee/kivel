import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const remote = process.env.BACKUP_REMOTE;
if (
    !remote ||
    !/^[A-Za-z0-9_-]+:[A-Za-z0-9][A-Za-z0-9_./-]+$/.test(remote) ||
    remote.split('/').includes('..')
)
    throw new Error('Set BACKUP_REMOTE to a dedicated rclone backup prefix.');
const run = (args) =>
    execFileSync('rclone', args, { encoding: 'utf8', timeout: 300000, maxBuffer: 1024 * 1024 });
const files = run(['lsf', remote, '--files-only', '--include', 'socket-*.dump'])
    .trim()
    .split('\n')
    .filter((name) => /^socket-[0-9TZ.-]+\.dump$/.test(name))
    .sort();
const latest = files.at(-1);
if (!latest) throw new Error('No off-site backup found.');
const temporary = mkdtempSync(join(tmpdir(), 'socket-offsite-'));
try {
    const dump = join(temporary, latest);
    run(['copyto', `${remote}/${latest}`, dump]);
    run(['copyto', `${remote}/${latest}.sha256`, `${dump}.sha256`]);
    const expected = readFileSync(`${dump}.sha256`, 'utf8').split(/\s/)[0];
    const actual = createHash('sha256').update(readFileSync(dump)).digest('hex');
    if (!/^[a-f0-9]{64}$/.test(expected) || expected !== actual)
        throw new Error('Off-site backup checksum mismatch.');
    execFileSync(process.execPath, ['scripts/verify-backup.mjs', '--dump', dump], {
        stdio: 'inherit',
        timeout: 600000,
    });
    console.log(`Restored and verified off-site backup ${latest} in an isolated database.`);
} finally {
    rmSync(temporary, { recursive: true, force: true });
}
