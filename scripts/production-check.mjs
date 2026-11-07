import assert from 'node:assert/strict';
const value = process.argv[2];
if (!value) throw Error('Usage: node scripts/production-check.mjs https://kivel.io');
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
assert.equal(billing.enabled, true, 'Paid plans must be open for checkout');
assert.deepEqual(
    billing.prices.map((price) => [price.plan, price.amount]),
    [
        ['pro', 200],
        ['team', 600],
    ],
    'Pro is $2 and Team is $6 a month',
);
assert.equal(
    (await (await request('/api/auth/recovery')).json()).enabled,
    true,
    'Configure SMTP before inviting public users',
);
for (const path of ['/contact/', '/refunds/', '/terms/', '/privacy/', '/beta/']) {
    const html = await (await request(path)).text();
    assert.ok(html.includes('support@kivel.io'), `${path}: support contact`);
}
const plans = await (await request('/plans/')).text();
assert.ok(plans.includes('$2') && plans.includes('$6'), '/plans/: prices');
const robots = await (await request('/robots.txt')).text();
assert.ok(robots.includes(`${origin.origin}/sitemap.xml`), 'Build SEO URLs for this domain');
console.log(
    'Public HTTPS checks passed: readiness, paid checkout, SMTP configuration, policy pages and sitemap origin.',
);
console.log(
    'Before inviting users, confirm a real verification email and password-reset email arrive, and verify an off-VM backup restore.',
);
