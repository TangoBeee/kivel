import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const publish = args.shift() === '--publish';
const tag = args.shift();
if (!publish || !['beta', 'latest'].includes(tag) || args.length)
    throw new Error(
        'Usage: node scripts/publish-clients.mjs --publish beta|latest. Run pnpm test:packages first.',
    );
const registry = 'https://registry.npmjs.org';
const { packages } = JSON.parse(await readFile(join(root, 'release/manifest.json'), 'utf8'));
assert.deepEqual(
    packages.map((pkg) => pkg.name),
    ['@kivel/sdk', '@kivel/cli'],
);

let plan;
try {
    const document = JSON.parse(await readFile(join(root, 'release/publish-plan.json'), 'utf8'));
    assert.equal(document.version, 1, 'Unsupported Changesets publish plan');
    plan = document.plan.flat();
    for (const entry of plan) {
        assert.ok(
            packages.some((pkg) => pkg.name === entry.name && pkg.version === entry.version),
            'Publish plan contains a non-client package or wrong version',
        );
        assert.ok(['publish', 'tag-only'].includes(entry.kind));
        if (entry.kind === 'publish')
            assert.ok(['latest', tag].includes(entry.tag), 'Unexpected planner channel');
    }
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}
if (process.env.GITHUB_ACTIONS === 'true' && !plan)
    throw new Error('GitHub publication requires the reviewed Changesets publish plan.');
const prepared = [];
for (const pkg of packages) {
    const expectedVersion = pkg.version;
    assert.match(expectedVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    if (expectedVersion.includes('-') && tag === 'latest')
        throw new Error('Use beta for prerelease versions.');
    const name = pkg.name.endsWith('/sdk') ? 'sdk' : 'cli';
    assert.equal(pkg.file, `kivel-${name}-${expectedVersion}.tgz`);
    const current = JSON.parse(
        await readFile(join(root, 'packages', name, 'package.json'), 'utf8'),
    );
    assert.equal(
        current.publishConfig?.tag ?? 'latest',
        tag,
        'The workflow and package release channel must agree',
    );
    assert.equal(
        current.version,
        expectedVersion,
        'Rebuild release artifacts after changing versions',
    );
    const path = join(root, 'release', pkg.file);
    assert.equal(
        createHash('sha512')
            .update(await readFile(path))
            .digest('base64'),
        pkg.sha512,
        'Artifact checksum mismatch',
    );
    if (
        plan &&
        !plan.some(
            (entry) =>
                entry.name === pkg.name &&
                entry.version === expectedVersion &&
                entry.kind === 'publish',
        )
    ) {
        console.log(
            `${pkg.name}@${expectedVersion} is not scheduled for npm publication; skipping.`,
        );
        continue;
    }
    const response = await fetch(`${registry}/${encodeURIComponent(pkg.name)}/${expectedVersion}`, {
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
    });
    if (response.status !== 404 && !response.ok)
        throw new Error(`Registry preflight failed (${response.status}) for ${pkg.name}`);
    if (response.ok) {
        const existing = await response.json();
        assert.equal(
            existing.dist?.integrity,
            `sha512-${pkg.sha512}`,
            `${pkg.name}@${expectedVersion} already exists with different contents. Choose a new version.`,
        );
    }
    prepared.push({ ...pkg, path, exists: response.ok });
}
for (const pkg of prepared) {
    const expectedVersion = pkg.version;
    if (pkg.exists) {
        console.log(`${pkg.name}@${expectedVersion} already matches; skipping.`);
        continue;
    }
    await new Promise((resolvePublish, reject) => {
        const child = spawn(
            'npm',
            [
                'publish',
                pkg.path,
                '--access',
                'public',
                '--tag',
                tag,
                '--registry',
                registry,
                '--ignore-scripts',
            ],
            { cwd: root, stdio: 'inherit' },
        );
        child.on('error', reject);
        child.on('exit', (code) =>
            code === 0
                ? resolvePublish()
                : reject(
                      new Error(
                          `Publication failed for ${pkg.name}; stop before publishing dependent packages.`,
                      ),
                  ),
        );
    });
}
