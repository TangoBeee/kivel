import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.argv[2];
if (!base || !/^[a-zA-Z0-9_./-]+$/.test(base) || base.startsWith('-'))
    throw new Error('Provide a base Git ref or commit.');
const changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`, '--'], {
    encoding: 'utf8',
})
    .trim()
    .split('\n');
const notes = (await readdir('.changeset')).filter(
    (name) => name.endsWith('.md') && name !== 'README.md',
);
const declared = new Set();
for (const note of notes) {
    const text = await readFile(`.changeset/${note}`, 'utf8');
    for (const match of text
        .split('---')[1]
        ?.matchAll(/^["']?(@kivel\.io\/(?:sdk|cli))["']?:\s*(patch|minor|major)\s*$/gm) ?? [])
        declared.add(match[1]);
}
for (const name of ['sdk', 'cli']) {
    const files = changed.filter(
        (file) =>
            file.startsWith(`packages/${name}/`) &&
            !file.endsWith('CHANGELOG.md') &&
            !/\.test\.ts$/.test(file),
    );
    const substantive = files.filter((file) => {
        if (!file.endsWith('/package.json')) return true;
        try {
            const before = JSON.parse(
                execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' }),
            );
            const after = JSON.parse(
                execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' }),
            );
            delete before.version;
            delete after.version;
            return JSON.stringify(before) !== JSON.stringify(after);
        } catch {
            return true;
        }
    });
    assert.ok(
        !substantive.length || declared.has(`@kivel.io/${name}`),
        `${name} changed without a changeset. Run pnpm changeset and select @kivel.io/${name}.`,
    );
}
console.log('Client changeset coverage checked.');
