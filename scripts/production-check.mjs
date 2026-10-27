import assert from 'node:assert/strict';
const value = process.argv[2];
if (!value) throw Error('Usage: node scripts/production-check.mjs https://socket.help');
const origin = new URL(value);
if (
    origin.protocol !== 'https:' ||
    origin.pathname !== '/' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
)
    throw Error('Provide the public HTTPS origin only.');
const request = async (path) => {
    const response = await fetch(new URL(path, origin), {
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
    assert.match(
        response.headers.get('strict-transport-security') ?? '',
        /max-age=/,
        `${path}: HTTPS proxy/HSTS`,
    );
    return response;
};
assert.equal((await (await request('/ready')).json()).status, 'ok');
const billing = await (await request('/api/billing')).json();
assert.equal(billing.enabled, false, 'Open beta must keep checkout disabled');
assert.deepEqual(billing.prices, []);
assert.equal(
    (await (await request('/api/auth/recovery')).json()).enabled,
    true,
    'Configure SMTP before inviting public users',
);
for (const path of ['/contact/', '/refunds/', '/terms/', '/privacy/', '/plans/', '/beta/']) {
    const html = await (await request(path)).text();
    assert.ok(html.includes('support@socket.help'), `${path}: support contact`);
    if (path === '/plans/') {
        assert.ok(!html.includes('cycle-yearly'));
        assert.ok(html.includes('Not available during beta'));
    }
}
const robots = await (await request('/robots.txt')).text();
assert.ok(robots.includes(`${origin.origin}/sitemap.xml`), 'Build SEO URLs for this domain');
console.log(
    'Public HTTPS beta checks passed: readiness, disabled checkout, SMTP configuration, policy pages and sitemap origin.',
);
console.log(
    'Before inviting users, confirm a real verification email and password-reset email arrive, and verify an off-VM backup restore.',
);
