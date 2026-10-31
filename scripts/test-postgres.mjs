import EmbeddedPostgres from 'embedded-postgres';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'socket-postgres-'));
const reservation = createServer();
await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
});
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const password = randomBytes(24).toString('hex');
const database = new EmbeddedPostgres({
    databaseDir: join(directory, 'data'),
    port,
    user: 'socket_test',
    password,
    persistent: false,
    authMethod: 'scram-sha-256',
    postgresFlags: ['-h', '127.0.0.1', '-k', directory],
    onLog() {},
    onError(message) {
        console.error(String(message));
    },
});
let testExitCode = 1;
try {
    await database.initialise();
    await database.start();
    await database.createDatabase('socket_test');
    const child = spawn('pnpm', ['--filter', 'backend', 'test:integration'], {
        stdio: 'inherit',
        env: {
            ...process.env,
            TEST_DATABASE_URL: `postgres://socket_test:${password}@127.0.0.1:${port}/socket_test`,
        },
    });
    testExitCode = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code) => resolve(code ?? 1));
    });
} finally {
    await database.stop().catch(() => {});
    await rm(directory, { recursive: true, force: true });
}
// The database exit hook otherwise replaces a pending process.exitCode with zero.
process.exit(testExitCode);
