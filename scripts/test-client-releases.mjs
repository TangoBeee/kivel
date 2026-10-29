import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'socket-release-flow-'));
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
        name: '@socket-help/sdk',
        version: '1.0.0',
    });
    await json(join(cwd, 'packages/cli/package.json'), {
        name: '@socket-help/cli',
        version: '2.0.0',
        dependencies: { '@socket-help/sdk': 'workspace:*' },
    });
    await json(join(cwd, 'backend/package.json'), {
        name: 'backend',
        version: '1.0.0',
        private: true,
        dependencies: { '@socket-help/sdk': 'workspace:*' },
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
            `---\n"@socket-help/${name}": ${name === 'sdk' ? 'minor' : 'patch'}\n---\n\nA tested change.\n`,
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
        '---\n"@socket-help/sdk": patch\n---\n\nFix the SDK.\n',
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
    console.log(
        'Verified CLI-only releases, SDK dependency propagation, private-package exclusion, changelogs, missing-note rejection and generated release PR coverage.',
    );
} finally {
    await rm(temporary, { recursive: true, force: true });
}
