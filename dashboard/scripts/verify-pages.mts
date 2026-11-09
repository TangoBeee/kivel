import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceSections } from '../../frontend/lib/app-routes';

for (const path of ['', ...workspaceSections, 'approve', 'link', 'phone']) {
    const html = await readFile(join('out', path, 'index.html'), 'utf8');
    assert.match(html, /<meta name="robots" content="noindex/, `${path}: private app route`);
    assert.match(html, /data-theme="dark"/, `${path}: shared dark theme`);
    assert.doesNotMatch(
        html,
        /aria-label="Main navigation"|class="site-footer"/,
        `${path}: no marketing shell`,
    );
}
console.log('Verified dashboard routes, dark first paint and private indexing policy.');
