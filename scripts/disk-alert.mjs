import { statfs, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
const path = process.env.OPS_DISK_PATH ?? '/opt/socket-help';
const statePath = process.env.OPS_DISK_STATE ?? '/opt/socket-help/backups/.disk-alert.json';
const disk = await statfs(path);
const available = disk.bavail * disk.bsize,
    total = disk.blocks * disk.bsize;
const low = available < 2 * 1024 ** 3 || available / total < 0.1;
let previous;
try {
    previous = JSON.parse(await readFile(statePath, 'utf8'));
} catch {}
if ((!low && !previous?.low) || (low === previous?.low && Date.now() - previous.at < 86400000))
    process.exit(low ? 1 : 0);
const message = low
    ? `Kivel disk space is low: ${(available / 1024 ** 3).toFixed(1)} GiB free (${Math.round((available / total) * 100)}%).`
    : 'Kivel disk space recovered.';
console.log(message);
if (process.env.OPS_ALERT_WEBHOOK) {
    const url = new URL(process.env.OPS_ALERT_WEBHOOK);
    if (url.protocol !== 'https:' || url.username || url.password)
        throw new Error('OPS_ALERT_WEBHOOK must use HTTPS without URL credentials.');
    const response = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: message, event: low ? 'disk.low' : 'disk.recovered' }),
    });
    if (!response.ok) throw new Error(`Disk alert delivery failed (${response.status}).`);
}
await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
await writeFile(statePath, JSON.stringify({ low, at: Date.now() }), { mode: 0o600 });
process.exitCode = low ? 1 : 0;
