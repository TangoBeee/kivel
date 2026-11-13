import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const { version, plan } = JSON.parse(await readFile('release/publish-plan.json', 'utf8'));
assert.equal(version, 1);
assert.match(process.env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/);
const seen = new Set();
for (const entry of plan.flat()) {
    assert.ok(['@kivel.io/sdk', '@kivel.io/cli'].includes(entry.name));
    assert.match(entry.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    const tag = `${entry.name}@${entry.version}`;
    if (seen.has(tag)) continue;
    seen.add(tag);
    const result = spawnSync('gh', ['release', 'view', tag, '--json', 'tagName'], {
        encoding: 'utf8',
    });
    if (result.status === 0) continue;
    // Check the API response code so network/authentication failures are not treated as absent releases.
    const check = spawnSync(
        'gh',
        ['api', `repos/${process.env.GITHUB_REPOSITORY}/releases/tags/${encodeURIComponent(tag)}`],
        { encoding: 'utf8' },
    );
    if (!check.stderr.includes('HTTP 404'))
        throw new Error(check.stderr || 'Could not verify GitHub release.');
    const name = entry.name.endsWith('/sdk') ? 'sdk' : 'cli';
    const changelog = await readFile(`packages/${name}/CHANGELOG.md`, 'utf8');
    const section = changelog.split(`## ${entry.version}\n`)[1]?.split('\n## ')[0]?.trim();
    const notes = section || `Published ${tag} under the npm latest tag.`;
    const created = spawnSync(
        'gh',
        [
            'release',
            'create',
            tag,
            '--target',
            process.env.GITHUB_SHA,
            '--title',
            tag,
            '--notes-file',
            '-',
        ],
        { input: notes, stdio: ['pipe', 'inherit', 'inherit'] },
    );
    if (created.status !== 0) throw new Error(`Could not record ${tag}.`);
}
