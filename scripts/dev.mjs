import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const children = [];
let database;
let closing = false;
async function close(code = 0) {
    if (closing) return;
    closing = true;
    for (const child of children) child.kill('SIGTERM');
    await Promise.all(
        children.map((child) =>
            child.exitCode !== null || child.signalCode !== null
                ? Promise.resolve()
                : new Promise((done) => child.once('exit', done)),
        ),
    );
    await database?.stop();
    process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
        void close();
    });
try {
    const build = spawn('pnpm', ['build:packages'], { stdio: 'inherit' });
    const result = await new Promise((resolve, reject) => {
        build.once('error', reject);
        build.once('exit', resolve);
    });
    if (result !== 0) throw new Error('Workspace package build failed.');
    let databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        const directory = resolve('.data/postgres');
        const sockets = resolve('.data/sockets');
        await mkdir(sockets, { recursive: true });
        database = new EmbeddedPostgres({
            databaseDir: directory,
            port: 54329,
            user: 'socket_dev',
            password: 'local-development-only',
            persistent: true,
            authMethod: 'scram-sha-256',
            postgresFlags: ['-h', '127.0.0.1', '-k', sockets],
            onLog() {},
            onError(message) {
                console.error(String(message));
            },
        });
        if (!existsSync(resolve(directory, 'PG_VERSION'))) await database.initialise();
        await database.start();
        const client = database.getPgClient();
        await client.connect();
        try {
            const result = await client.query(
                "SELECT 1 FROM pg_database WHERE datname = 'socket_dev'",
            );
            if (!result.rowCount) await database.createDatabase('socket_dev');
        } finally {
            await client.end();
        }
        databaseUrl = 'postgres://socket_dev:local-development-only@127.0.0.1:54329/socket_dev';
    }
    for (const name of ['backend', 'frontend']) {
        const child = spawn('pnpm', ['--filter', name, 'dev'], {
            stdio: 'inherit',
            env: {
                ...process.env,
                DATABASE_URL: databaseUrl,
                PUBLIC_BASE_URL: 'http://localhost:3001',
                PORT: '3000',
            },
        });
        child.once('error', (error) => {
            console.error(error.message);
            void close(1);
        });
        child.once('exit', (code) => {
            if (!closing) void close(code ?? 1);
        });
        children.push(child);
    }
    console.log('Kivel: http://localhost:3001');
} catch (error) {
    console.error(error instanceof Error ? error.message : 'Development startup failed.');
    await close(1);
}
