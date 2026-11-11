import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fromRegistry = process.argv.length === 3 && process.argv[2] === '--published';
if (process.argv.length > 2 && !fromRegistry)
    throw new Error(
        'Use --published to verify the npm release, or no arguments to test local tarballs.',
    );

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'release');
const temporary = await mkdtemp(join(tmpdir(), 'kivel-packages-'));
const manifests = await Promise.all(
    ['sdk', 'cli'].map(async (name) =>
        JSON.parse(await readFile(join(root, 'packages', name, 'package.json'), 'utf8')),
    ),
);
const [sdk, cli] = manifests;

assert.match(sdk.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);

function run(command, args, options = {}) {
    const { rawOutput = false, ...spawnOptions } = options;
    return new Promise((resolveRun, reject) => {
        const child = spawn(command, args, {
            cwd: root,
            stdio: ['pipe', 'pipe', 'pipe'],
            ...spawnOptions,
        });
        const stdout = [];
        let stderr = '';
        child.stdout.on('data', (chunk) => stdout.push(chunk));
        child.stderr.on('data', (chunk) => (stderr += chunk));
        child.on('error', reject);
        child.on('exit', (code) =>
            code === 0
                ? resolveRun(
                      rawOutput ? Buffer.concat(stdout) : Buffer.concat(stdout).toString().trim(),
                  )
                : reject(
                      new Error(
                          `${command} exited ${code}\n${stderr || Buffer.concat(stdout).toString()}`,
                      ),
                  ),
        );
        child.stdin.end();
    });
}
let server;
try {
    await mkdir(output, { recursive: true });
    const artifacts = [];
    for (const name of ['sdk', 'cli']) {
        const manifest = name === 'sdk' ? sdk : cli;
        assert.equal(manifest.private, undefined);
        assert.equal(manifest.publishConfig.access, 'public');
        assert.equal(manifest.license, 'Apache-2.0');
        await run('pnpm', ['--dir', `packages/${name}`, 'pack', '--pack-destination', output]);
        const path = join(output, `kivel.io-${name}-${manifest.version}.tgz`);
        const files = (await run('tar', ['-tzf', path])).split('\n');
        for (const file of files) {
            assert.match(
                file,
                /^package\/(?:package\.json|README\.md|CHANGELOG\.md|LICENSE|dist\/[\w-]+(?:\.d\.ts|\.js)|bin\/kivel\.mjs)$/,
                `Unexpected package file: ${file}`,
            );
            assert.ok(
                !/\.test\.|\.env|\.map$/.test(file),
                `Do not publish tests, credentials or source maps: ${file}`,
            );
        }
        for (const file of [
            'package/package.json',
            'package/README.md',
            'package/LICENSE',
            'package/CHANGELOG.md',
        ])
            assert.ok(files.includes(file), file);
        const packed = JSON.parse(await run('tar', ['-xOzf', path, 'package/package.json']));
        assert.ok(files.includes(`package/${packed.types.replace(/^\.\//, '')}`));
        if (name === 'cli') {
            assert.equal(
                packed.dependencies['@kivel.io/sdk'],
                sdk.version,
                'pnpm must replace workspace protocol',
            );
            assert.deepEqual(Object.keys(packed.dependencies), ['@kivel.io/sdk']);
            assert.ok(files.includes('package/bin/kivel.mjs'));
        } else assert.equal(packed.dependencies, undefined, 'SDK stays dependency-free');
        const data = await readFile(path);
        artifacts.push({
            name: packed.name,
            version: packed.version,
            file: path.split('/').pop(),
            sha512: createHash('sha512').update(data).digest('base64'),
            bytes: data.length,
        });
    }
    const consumer = join(temporary, 'consumer');
    await mkdir(consumer);
    await writeFile(
        join(consumer, 'package.json'),
        JSON.stringify({ private: true, type: 'module' }),
    );
    if (fromRegistry) {
        for (const artifact of artifacts) {
            let response;
            for (let attempt = 0; attempt < 10; attempt++) {
                response = await fetch(
                    `https://registry.npmjs.org/${encodeURIComponent(artifact.name)}`,
                    {
                        headers: { 'Cache-Control': 'no-cache' },
                        signal: AbortSignal.timeout(15000),
                    },
                );
                if (response.status !== 404 && response.status !== 503) break;
                if (attempt < 9) await new Promise((resolveWait) => setTimeout(resolveWait, 3000));
            }
            if (!response.ok) throw new Error(`Published package not available: ${artifact.name}`);
            const metadata = await response.json();
            assert.equal(
                metadata['dist-tags']?.beta,
                artifact.version,
                'Verify beta points to the tested release',
            );
            const distribution = metadata.versions?.[artifact.version]?.dist;
            assert.ok(distribution?.tarball, 'Published version must have a tarball');
            const download = await fetch(distribution.tarball, {
                signal: AbortSignal.timeout(30000),
            });
            assert.ok(download.ok, `Cannot download ${artifact.name}`);
            const data = Buffer.from(await download.arrayBuffer());
            assert.equal(
                distribution.integrity,
                `sha512-${createHash('sha512').update(data).digest('base64')}`,
                'Downloaded tarball must match registry integrity',
            );
            const publishedPath = join(temporary, artifact.file);
            await writeFile(publishedPath, data);
            const localPath = join(output, artifact.file);
            const localFiles = (await run('tar', ['-tzf', localPath])).split('\n').sort();
            const publishedFiles = (await run('tar', ['-tzf', publishedPath])).split('\n').sort();
            assert.deepEqual(
                publishedFiles,
                localFiles,
                'Published file list must match reviewed files',
            );
            // Compression can differ between Node versions; compare every file byte instead.
            for (const file of localFiles) {
                const [local, published] = await Promise.all([
                    run('tar', ['-xOzf', localPath, file], { rawOutput: true }),
                    run('tar', ['-xOzf', publishedPath, file], { rawOutput: true }),
                ]);
                assert.ok(
                    local.equals(published),
                    `Published file differs from reviewed source: ${artifact.name}/${file}`,
                );
            }
        }
    }
    await run(
        'npm',
        [
            'install',
            '--ignore-scripts',
            ...(fromRegistry ? ['--registry=https://registry.npmjs.org'] : ['--offline']),
            '--no-audit',
            '--no-fund',
            '--cache',
            join(temporary, 'cache'),
            ...artifacts.map((artifact) =>
                fromRegistry ? `${artifact.name}@${artifact.version}` : join(output, artifact.file),
            ),
        ],
        { cwd: consumer },
    );
    // This fixture checks installed client behavior; backend integration tests cover the actual service.
    const requests = [];
    server = createServer(async (request, response) => {
        let body = '';
        for await (const chunk of request) body += chunk;
        requests.push({ url: request.url, authorization: request.headers.authorization, body });
        response.setHeader('Content-Type', 'application/json');
        if (request.headers.authorization !== 'Bearer package-test-key') {
            response.writeHead(401, { 'X-Request-Id': 'package-denied' });
            return response.end(JSON.stringify({ error: 'Denied' }));
        }
        if (request.url === '/api/monitors' && request.method === 'POST') {
            response.writeHead(402, { 'X-Request-Id': 'package-limit' });
            return response.end(
                JSON.stringify({
                    error: 'Your Free plan allows 20 monitors.',
                    code: 'limit_reached',
                    message: 'Your Free plan allows 20 monitors.',
                    limit: 'monitors.active',
                    plan: 'free',
                    used: 20,
                    max: 20,
                    requiredPlan: 'pro',
                    upgradeUrl: 'https://kivel.io/pricing/',
                }),
            );
        }
        if (request.url === '/api/tools/json/run') {
            response.end(
                JSON.stringify({
                    toolId: 'json',
                    output: JSON.stringify(JSON.parse(JSON.parse(body).input)),
                    usage: { used: 1, limit: 1000, resetsAt: '2030-01-01T00:00:00Z' },
                }),
            );
        } else response.end(JSON.stringify({ tools: [{ id: 'json' }] }));
    });
    await new Promise((resolveListen, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolveListen);
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await writeFile(
        join(consumer, 'check.mjs'),
        `import assert from 'node:assert/strict';
import { Kivel, KivelError } from '@kivel.io/sdk';
const kivel = new Kivel({ baseUrl: process.env.KIVEL_URL, apiKey: process.env.KIVEL_API_KEY });
assert.equal((await kivel.tools()).tools[0].id, 'json');
const result = await kivel.run('json', '{"released":true}');
assert.equal(JSON.parse(result.output).released, true);
await assert.rejects(new Kivel({ baseUrl: process.env.KIVEL_URL }).tools(), error => error instanceof KivelError && error.status === 401 && error.requestId === 'package-denied');
${
    fromRegistry
        ? ''
        : `await assert.rejects(kivel.request('POST', '/api/monitors'), error => {
    assert.ok(error instanceof KivelError);
    assert.equal(error.message, 'Your Free plan allows 20 monitors.');
    assert.equal(error.status, 402);
    assert.equal(error.retryAfter, undefined);
    assert.equal(error.requiredPlan, 'pro');
    assert.deepEqual(error.limitDetails, { code: 'limit_reached', limit: 'monitors.active', used: 20, max: 20, plan: 'free' });
    return true;
});`
}
`,
    );
    await writeFile(
        join(consumer, 'check.ts'),
        `import { Kivel, type EmailInbox, type MemoryEntry } from '@kivel.io/sdk';
import { command } from '@kivel.io/cli';
const kivel = new Kivel({ baseUrl: 'http://localhost' });
const email: Promise<EmailInbox> = kivel.createEmailInbox();
const memory: Promise<MemoryEntry<{ passed: boolean }>> = kivel.memoryGet('release', 'result');
void email; void memory; void command(kivel, ['tools']);
`,
    );
    await run(
        process.execPath,
        [
            join(root, 'packages/sdk/node_modules/typescript/bin/tsc'),
            '--noEmit',
            '--strict',
            '--skipLibCheck',
            '--module',
            'NodeNext',
            '--moduleResolution',
            'NodeNext',
            '--target',
            'ES2022',
            '--lib',
            'ES2022,DOM',
            'check.ts',
        ],
        { cwd: consumer },
    );
    const env = {
        ...process.env,
        KIVEL_URL: baseUrl,
        KIVEL_API_KEY: 'package-test-key',
    };
    await run(process.execPath, ['check.mjs'], { cwd: consumer, env });
    const binary = join(consumer, 'node_modules/.bin/kivel');
    assert.equal(await run(binary, ['--version'], { cwd: consumer, env }), cli.version);
    assert.match(await run(binary, ['--help'], { cwd: consumer, env }), /agent login/);
    assert.equal(
        JSON.parse(await run(binary, ['tools'], { cwd: consumer, env })).tools[0].id,
        'json',
    );
    assert.ok(requests.some((request) => request.url === '/api/tools/json/run'));
    await writeFile(
        join(output, 'manifest.json'),
        JSON.stringify({ packages: artifacts }, null, 2) + '\n',
    );
    console.log(
        `Verified ${fromRegistry ? 'published' : 'local'} ${artifacts.length} npm tarballs: clean contents, rewritten dependencies, ${fromRegistry ? 'registry' : 'offline'} installation outside the workspace, SDK HTTP/errors, TypeScript declarations and executable CLI. Artifacts: release/`,
    );
} finally {
    if (server) await new Promise((resolveClose) => server.close(resolveClose));
    await rm(temporary, { recursive: true, force: true });
}
