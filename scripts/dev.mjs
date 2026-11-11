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
        const directory = resolve('.data/kivel-postgres');
        const sockets = resolve('.data/sockets');
        await mkdir(sockets, { recursive: true });
        database = new EmbeddedPostgres({
            databaseDir: directory,
            port: 54329,
            user: 'kivel_dev',
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
                "SELECT 1 FROM pg_database WHERE datname = 'kivel_dev'",
            );
            if (!result.rowCount) await database.createDatabase('kivel_dev');
        } finally {
            await client.end();
        }
        databaseUrl = 'postgres://kivel_dev:local-development-only@127.0.0.1:54329/kivel_dev';
    }
    for (const name of ['backend', 'frontend', 'dashboard']) {
        const child = spawn('pnpm', ['--filter', name, 'dev'], {
            stdio: 'inherit',
            env: {
                ...process.env,
                DATABASE_URL: databaseUrl,
                PUBLIC_BASE_URL: 'http://localhost:3001',
                APP_BASE_URL: 'http://127.0.0.1:3002',
                SITE_URL: 'http://localhost:3001',
                APP_URL: 'http://127.0.0.1:3002',
                TRUSTED_PROXIES: '127.0.0.1/32',
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
    console.log('Kivel site: http://localhost:3001 · App: http://127.0.0.1:3002');
} catch (error) {
    console.error(error instanceof Error ? error.message : 'Development startup failed.');
    await close(1);
}
