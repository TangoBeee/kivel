import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'kivel-release-flow-'));
const cli = join(root, 'node_modules/@changesets/cli/bin.js');
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const json = (path, value) => writeFile(path, JSON.stringify(value, null, 2));
function git(cwd, ...args) {
    return execFileSync(
        'git',
        [
            '-c',
            'core.hooksPath=/dev/null',
            '-c',
            'commit.gpgsign=false',
            '-c',
            'user.name=Release test',
            '-c',
            'user.email=release@example.test',
            ...args,
        ],
        { cwd, encoding: 'utf8' },
    ).trim();
}
async function fixture(name) {
    const cwd = join(temporary, name);
    for (const directory of ['.changeset', 'packages/sdk/src', 'packages/cli/src', 'backend'])
        await mkdir(join(cwd, directory), { recursive: true });
    await json(join(cwd, 'package.json'), { private: true, workspaces: ['packages/*', 'backend'] });
    await writeFile(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n  - backend\n');
    await writeFile(
        join(cwd, '.changeset/config.json'),
        await readFile(join(root, '.changeset/config.json')),
    );
    await json(join(cwd, 'packages/sdk/package.json'), {
        name: '@kivel.io/sdk',
        version: '1.0.0',
    });
    await json(join(cwd, 'packages/cli/package.json'), {
        name: '@kivel.io/cli',
        version: '2.0.0',
        dependencies: { '@kivel.io/sdk': 'workspace:*' },
    });
    await json(join(cwd, 'backend/package.json'), {
        name: 'backend',
        version: '1.0.0',
        private: true,
        dependencies: { '@kivel.io/sdk': 'workspace:*' },
    });
    await writeFile(join(cwd, 'packages/sdk/src/index.ts'), 'export const ready = true;\n');
    git(cwd, 'init', '-b', 'main');
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'Fixture');
    return cwd;
}
try {
    for (const name of ['cli', 'sdk']) {
        const cwd = await fixture(name);
        await writeFile(
            join(cwd, '.changeset/change.md'),
            `---\n"@kivel.io/${name}": ${name === 'sdk' ? 'minor' : 'patch'}\n---\n\nA tested change.\n`,
        );
        git(cwd, 'add', '.');
        git(cwd, 'commit', '-m', 'Add changeset');
        execFileSync(process.execPath, [cli, 'version'], { cwd, stdio: 'pipe' });
        assert.equal(
            (await read(join(cwd, 'packages/sdk/package.json'))).version,
            name === 'sdk' ? '1.1.0' : '1.0.0',
        );
        assert.equal((await read(join(cwd, 'packages/cli/package.json'))).version, '2.0.1');
        assert.equal((await read(join(cwd, 'backend/package.json'))).version, '1.0.0');
        assert.match(await readFile(join(cwd, 'packages/cli/CHANGELOG.md'), 'utf8'), /2\.0\.1/);
    }
    const cwd = await fixture('coverage');
    const base = git(cwd, 'rev-parse', 'HEAD');
    await writeFile(join(cwd, 'packages/sdk/src/index.ts'), 'export const ready = false;\n');
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'Change SDK');
    const check = () =>
        execFileSync(process.execPath, [join(root, 'scripts/check-client-changesets.mjs'), base], {
            cwd,
            stdio: 'pipe',
        });
    assert.throws(check, /Command failed/);
    await writeFile(
        join(cwd, '.changeset/change.md'),
        '---\n"@kivel.io/sdk": patch\n---\n\nFix the SDK.\n',
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'Cover change');
    check();
    const releaseBase = git(cwd, 'rev-parse', 'HEAD');
    execFileSync(process.execPath, [cli, 'version'], { cwd, stdio: 'pipe' });
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'Version packages');
    execFileSync(
        process.execPath,
        [join(root, 'scripts/check-client-changesets.mjs'), releaseBase],
        { cwd, stdio: 'pipe' },
    );
    const publisher = join(temporary, 'publisher');
    for (const directory of ['scripts', 'release', 'packages/sdk', 'packages/cli', 'bin'])
        await mkdir(join(publisher, directory), { recursive: true });
    await writeFile(
        join(publisher, 'scripts/publish-clients.mjs'),
        await readFile(join(root, 'scripts/publish-clients.mjs')),
    );
    await writeFile(
        join(publisher, 'offline.mjs'),
        "globalThis.fetch = async () => new Response('{}', { status: 404 });\n",
    );
    const log = join(publisher, 'npm-calls.jsonl');
    await writeFile(
        join(publisher, 'bin/npm'),
        '#!/usr/bin/env node\nrequire("node:fs").appendFileSync(process.env.NPM_TEST_LOG, JSON.stringify(process.argv.slice(2))+"\\n");\n',
    );
    await chmod(join(publisher, 'bin/npm'), 0o755);
    const artifacts = [];
    for (const name of ['sdk', 'cli']) {
        const data = Buffer.from(`test ${name}`);
        const file = `kivel.io-${name}-1.0.0.tgz`;
        await writeFile(join(publisher, 'release', file), data);
        artifacts.push({
            name: `@kivel.io/${name}`,
            version: '1.0.0',
            file,
            sha512: createHash('sha512').update(data).digest('base64'),
        });
        await json(join(publisher, 'packages', name, 'package.json'), {
            version: '1.0.0',
            publishConfig: { tag: 'beta' },
        });
    }
    await json(join(publisher, 'release/manifest.json'), { packages: artifacts });
    const plan = {
        version: 1,
        plan: [
            artifacts.map((pkg) => ({
                name: pkg.name,
                version: pkg.version,
                kind: 'publish',
                tag: 'latest',
            })),
        ],
    };
    await json(join(publisher, 'release/publish-plan.json'), plan);
    const publish = () =>
        execFileSync(
            process.execPath,
            [
                '--import',
                join(publisher, 'offline.mjs'),
                join(publisher, 'scripts/publish-clients.mjs'),
                '--publish',
                'beta',
            ],
            {
                env: {
                    ...process.env,
                    GITHUB_ACTIONS: 'true',
                    PATH: `${join(publisher, 'bin')}:${process.env.PATH}`,
                    NPM_TEST_LOG: log,
                },
                stdio: 'pipe',
            },
        );
    publish();
    const calls = (await readFile(log, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
    assert.equal(calls.length, 2);
    assert.ok(calls[0][1].includes('sdk'));
    assert.ok(calls[1][1].includes('cli'));
    for (const args of calls) assert.equal(args[args.indexOf('--tag') + 1], 'beta');
    await json(join(publisher, 'packages/sdk/package.json'), {
        version: '1.0.0',
        publishConfig: { tag: 'latest' },
    });
    assert.throws(publish, /Command failed/);
    await json(join(publisher, 'packages/sdk/package.json'), {
        version: '1.0.0',
        publishConfig: { tag: 'beta' },
    });
    await rm(log);
    plan.plan[0] = [plan.plan[0][1]];
    await json(join(publisher, 'release/publish-plan.json'), plan);
    publish();
    assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 1);
    console.log(
        'Verified CLI-only releases, SDK dependency propagation, private-package exclusion, changelogs, missing-note rejection and generated release PR coverage, beta publishing arguments and planned-package selection.',
    );
} finally {
    await rm(temporary, { recursive: true, force: true });
}
