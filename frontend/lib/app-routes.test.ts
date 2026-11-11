import assert from 'node:assert/strict';
import test from 'node:test';
import {
    appLink,
    legacyWorkspaceLink,
    returnPath,
    workspaceHref,
    workspacePanel,
    workspaceResource,
} from './app-routes';

test('legacy workspace links preserve useful state and keep credentials on the old origin', () => {
    assert.equal(legacyWorkspaceLink('', ''), appLink());
    assert.equal(legacyWorkspaceLink('', '#register'), appLink('/signup/'));
    assert.equal(legacyWorkspaceLink('', '#signin'), appLink('/login/'));
    assert.equal(
        legacyWorkspaceLink('?resource=one&token=private#ignored', '#webhooks'),
        appLink('/webhooks/?id=one'),
    );
    assert.equal(
        legacyWorkspaceLink('?resource=inbox&thread=thread-2', '#email'),
        appLink('/email/?inbox=inbox&thread=thread-2'),
    );
    assert.equal(
        legacyWorkspaceLink('?tool=json&managementToken=private', '#tools'),
        appLink('/utilities/?tool=json'),
    );
    assert.equal(
        legacyWorkspaceLink('?billing=returned&status=active', ''),
        appLink('/usage/?tab=billing&billing=returned&status=active'),
    );
});

test('workspace routes preserve panel selection without accepting external return paths', () => {
    assert.equal(workspaceHref('authenticators'), '/credentials/?tab=authenticators');
    assert.equal(workspaceHref('billing'), '/usage/?tab=billing');
    assert.equal(
        workspacePanel('/credentials/', new URLSearchParams('tab=authenticators')),
        'authenticators',
    );
    assert.equal(workspacePanel('/monitors', new URLSearchParams('tab=jobs')), 'automation');
    assert.equal(returnPath('/approve/?id=example'), '/approve/?id=example');
    for (const path of [
        '//example.org/',
        '/\\example.org/',
        'https://example.org/',
        '/missing/',
        '/api/account',
    ]) {
        assert.equal(returnPath(path), null);
    }
});

test('resource workbenches accept the app query and the legacy query', () => {
    assert.equal(workspaceResource('?id=new&resource=old'), 'new');
    assert.equal(workspaceResource('?resource=old'), 'old');
    assert.equal(workspaceResource('?tool=webhooks'), null);
});
