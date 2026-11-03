import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    catalog,
    categories,
    categoryRoadmap,
    categoryTools,
    featuredIds,
    searchTools,
    toolSlug,
    toolPageHref,
    backendToolIds,
} from './catalog';
import { tools } from './tools';
import { browserOperations } from './browser-tool-definitions';

test('catalog has stable unique identifiers and covers every roadmap category', () => {
    assert.equal(new Set(catalog.map((tool) => tool.id)).size, catalog.length);
    assert.equal(categories.length, 12);
    assert.equal(new Set(catalog.map(toolSlug)).size, catalog.length);
    for (const category of categories) {
        assert.ok(categoryTools(category.id).length, category.id);
        assert.ok(categoryRoadmap(category.id).length, category.id);
    }
    assert.ok(
        catalog.every((tool) => categories.some((category) => category.id === tool.categoryId)),
    );
    assert.ok(featuredIds.every((id) => catalog.some((tool) => tool.id === id)));
});

test('only implemented tools are advertised as available or given live destinations', () => {
    const available = catalog.filter((tool) => tool.status === 'available');
    assert.deepEqual(
        available.map((tool) => tool.id).sort(),
        [
            ...new Set([
                ...tools.map((tool) => tool.id),
                ...Object.keys(browserOperations),
                ...backendToolIds,
            ]),
        ].sort(),
    );
    for (const tool of available) assert.equal(tool.href, toolPageHref(tool));
    for (const tool of catalog.filter((tool) => tool.status === 'coming-soon'))
        assert.equal(tool.href, undefined);
});

test('search finds implemented and planned tools across categories', () => {
    assert.ok(searchTools('  JSON  ').some((tool) => tool.id === 'json'));
    assert.ok(searchTools('mcp mock').some((tool) => tool.id === 'agents-mock-mcp-server'));
    assert.ok(searchTools('PDF').length > 1);
    assert.equal(searchTools('not-a-tool-92817').length, 0);
    assert.equal(searchTools('', categoryTools('network')).length, categoryTools('network').length);
});

test('new developer tools are available to Utilities, command search and catalog categories', () => {
    const ids = [
        'developer-fake-identity-generator',
        'developer-test-bank-account-generator',
        'developer-json-schema-validator',
        'developer-json-schema-from-sample',
        'developer-openapi-validator',
        'developer-secret-scanner',
        'developer-phone-number-validator',
        'developer-timezone-converter',
        'developer-date-calculator',
        'network-web-page-to-markdown',
        'email-email-authentication-checker',
        'network-robots-and-sitemap-checker',
    ];
    const utilities = catalog.filter((tool) => tool.status === 'available');
    for (const id of ids) {
        const tool = utilities.find((tool) => tool.id === id)!;
        assert.ok(tool, id);
        assert.ok(
            categoryTools(tool.categoryId).some((entry) => entry.id === id),
            id,
        );
        assert.ok(
            searchTools(tool.name, utilities).some((entry) => entry.id === id),
            id,
        );
    }
    for (const id of ['developer-json-schema-validator', 'developer-openapi-validator'])
        assert.equal(catalog.find((tool) => tool.id === id)?.local, false);
    assert.equal(catalog.find((tool) => tool.id === 'developer-secret-scanner')?.local, true);
});

test('agent setup and language-model summaries derive counts from the complete catalog', async () => {
    const { setupPrompt } = await import('./setup-prompt');
    const { llmsIndex, llmsFull } = await import('./llms');
    const count = catalog.filter((tool) => tool.status === 'available').length;
    for (const content of [setupPrompt, llmsIndex(), llmsFull()]) {
        assert.ok(content.includes(`${count} tools`));
        for (const term of [
            'authenticators',
            'status pages',
            'test data',
            'DNS',
            'search_tools',
            'run_tool',
        ])
            assert.ok(content.includes(term), term);
    }
});
