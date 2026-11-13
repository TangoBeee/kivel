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
const appOrigin = new URL(`https://app.${origin.host}`);
const request = async (path, host = origin) => {
    const response = await fetch(new URL(path, host), {
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
const appHome = await request('/', appOrigin);
assert.match(appHome.headers.get('x-robots-tag') ?? '', /noindex/, 'Private workspace host');
assert.doesNotMatch(
    await appHome.text(),
    /aria-label="Main navigation"/,
    'Workspace serves the app export',
);
const billing = await (await request('/api/billing')).json();
assert.equal(billing.enabled, true, 'Paid plans must be open for checkout');
// Dodo does not follow redirects. The webhook must answer on this exact URL (an unsigned test
// is rejected with 400), or paid plans never activate. Point Dodo at https://<domain>/billing/webhook.
const webhook = await fetch(new URL('/billing/webhook', origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
});
assert.equal(
    webhook.status,
    400,
    `/billing/webhook: expected 400 for an unsigned test, got HTTP ${webhook.status}. Dodo webhooks will fail.`,
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
const plans = await (await request('/pricing/')).text();
const offers = [
    ...plans.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs),
].flatMap((entry) => JSON.parse(entry[1]).offers ?? []);
for (const plan of ['pro', 'team']) {
    const price = billing.prices.find((value) => value.plan === plan);
    const name = `${plan[0].toUpperCase()}${plan.slice(1)} (monthly)`;
    const offer = offers.find((value) => value.name === name);
    assert.ok(price && offer, `${plan}: checkout and pricing offer`);
    assert.equal(offer.price * 100, price.amount, `${plan}: published price matches checkout`);
    assert.equal(offer.priceCurrency.toLowerCase(), price.currency, `${plan}: currency`);
}
const robots = await (await request('/robots.txt')).text();
assert.ok(robots.includes(`${origin.origin}/sitemap.xml`), 'Build SEO URLs for this domain');
console.log(
    'Public HTTPS checks passed: readiness, paid checkout, SMTP configuration, policy pages and sitemap origin.',
);
console.log(
    'Before inviting users, confirm a real verification email and password-reset email arrive, and verify an off-VM backup restore.',
);
