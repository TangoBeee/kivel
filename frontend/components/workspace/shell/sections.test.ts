import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retiredPanels, sectionOf, sections, tabsFor, teamTabs } from './sections';

test('every top-level section opens on a page that belongs to it', () => {
    for (const section of sections) assert.equal(sectionOf(section.home), section.id);
});

test('team pages share one tab row, other sections have none', () => {
    for (const panel of teamTabs) {
        assert.equal(sectionOf(panel), 'team');
        assert.deepEqual(tabsFor(panel), teamTabs);
    }
    assert.deepEqual(tabsFor('catalog'), []);
    assert.deepEqual(tabsFor('email'), []);
});

test('Kivel tool pages and retired tools live under the catalog', () => {
    for (const panel of ['email', 'webhooks', 'mocks', 'authenticators', 'tools'] as const)
        assert.equal(sectionOf(panel), 'catalog');
    for (const panel of retiredPanels) assert.equal(sectionOf(panel), 'catalog');
});

test('getting started and activity are their own sections', () => {
    assert.equal(sectionOf('overview'), 'start');
    assert.equal(sectionOf('activity'), 'activity');
});
