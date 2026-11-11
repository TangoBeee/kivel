import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { request } from 'node:https';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function freePort() {
    const server = createServer();
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    return port;
}

const directory = await mkdtemp(join(tmpdir(), 'kivel-https-'));
const project = `kivel-https-${randomBytes(4).toString('hex')}`;
const port = await freePort();
const httpPort = await freePort();
const appPort = await freePort();
const overlay = join(directory, 'compose.yaml');
const certificate = join(directory, 'root.crt');
const proxyConfig = join(directory, 'Caddyfile');
const sourceProxy = await readFile('deploy/Caddyfile', 'utf8');
await writeFile(
    proxyConfig,
    sourceProxy.replace(
        '\tencode zstd gzip',
        '\tencode zstd gzip\n\thandle /__test__/slow {\n\t\treverse_proxy slow:3000 {\n\t\t\timport kivel_transport\n\t\t}\n\t}',
    ),
);
const slowCommand = [
    'node',
    '--input-type=module',
    '-e',
    "const {buildApp}=await import('./backend/dist/app.js');const app=buildApp();app.get('/__test__/slow',async()=>{await new Promise(resolve=>setTimeout(resolve,21000));return {ok:true};});await app.listen({host:'0.0.0.0',port:3000});",
];
const env = {
    ...process.env,
    DOMAIN: 'localhost',
    MAIL_NETWORK_PREFIX: process.env.TEST_MAIL_NETWORK_PREFIX ?? '10.207.0',
    PROXY_NETWORK_PREFIX: process.env.TEST_PROXY_NETWORK_PREFIX ?? '10.204.0',
};
const args = [
    'compose',
    '-p',
    project,
    '-f',
    'compose.yaml',
    '-f',
    'compose.production.yaml',
    '-f',
    overlay,
];
const docker = (...command) =>
    execFileSync('docker', [...args, ...command], { env, stdio: 'inherit' });
await writeFile(
    overlay,
    `services:
  app:
    ports: !override ['127.0.0.1:${appPort}:3000']
    environment:
      PUBLIC_BASE_URL: https://localhost:${port}
      APP_BASE_URL: https://app.localhost:${port}
      BILLING_ENABLED: 'false'
  proxy:
    ports: !override ['127.0.0.1:${port}:443', '127.0.0.1:${httpPort}:80']
    environment:
      DOMAIN: localhost
    volumes:
      - ${JSON.stringify(`${proxyConfig}:/etc/caddy/Caddyfile:ro`)}
  slow:
    image: kivel:local
    command: ${JSON.stringify(slowCommand)}
    mem_limit: 256m
    networks:
      edge:
        ipv4_address: ${env.PROXY_NETWORK_PREFIX}.4
`,
);

try {
    docker('up', '-d', '--no-build', '--wait', '--wait-timeout', '90');
    docker('cp', 'proxy:/data/caddy/pki/authorities/local/root.crt', certificate);
    const smoke = spawnSync('pnpm', ['test:smoke'], {
        stdio: 'inherit',
        env: {
            ...env,
            NODE_EXTRA_CA_CERTS: certificate,
            KIVEL_BASE_URL: `https://localhost:${port}`,
        },
    });
    if (smoke.error) throw smoke.error;
    assert.equal(smoke.status, 0, 'HTTPS smoke test');
    const ca = await readFile(certificate);
    const lookup = (_host, options, callback) =>
        options.all
            ? callback(null, [{ address: '127.0.0.1', family: 4 }])
            : callback(null, '127.0.0.1', 4);
    function call(path, method = 'GET', headers = {}, body, timeout = 15000, host = 'localhost') {
        return new Promise((resolve, reject) => {
            const req = request(
                `https://${host}:${port}${path}`,
                {
                    method,
                    ca,
                    headers,
                    timeout,
                    lookup,
                },
                (response) => {
                    let text = '';
                    response.setEncoding('utf8');
                    response.on('data', (chunk) => {
                        text += chunk;
                    });
                    response.on('end', () =>
                        resolve({ status: response.statusCode, headers: response.headers, text }),
                    );
                },
            );
            req.once('timeout', () => req.destroy(new Error('HTTPS request timed out.')));
            req.once('error', reject);
            req.end(body);
        });
    }
    const ready = await call('/ready', 'GET', { 'X-Forwarded-Proto': 'http' });
    assert.equal(ready.status, 200);
    assert.equal(ready.headers['strict-transport-security'], 'max-age=31536000');
    const appHost = 'app.localhost';
    const appOrigin = `https://${appHost}:${port}`;
    const landing = await call('/');
    assert.equal(landing.status, 200);
    assert.match(landing.text, /aria-label="Main navigation"/);
    const dashboard = await call('/', 'GET', {}, undefined, 15000, appHost);
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.headers['x-robots-tag'], /noindex/);
    assert.doesNotMatch(dashboard.text, /Main navigation/);
    const signIn = JSON.stringify({
        username: 'https-host-test',
        password: 'local fixture password',
        email: 'test@example.invalid',
    });
    const authHeaders = { Origin: appOrigin, 'Content-Type': 'application/json' };
    const session = await call('/api/auth/register', 'POST', authHeaders, signIn, 15000, appHost);
    assert.equal(session.status, 201, session.text);
    const cookie = session.headers['set-cookie'][0];
    assert.match(
        cookie,
        /^__Host-kivel_session=.*; Path=\/; HttpOnly; SameSite=Strict; Max-Age=604800; Secure$/,
    );
    assert.equal((await call('/api/account', 'GET', { Cookie: cookie.split(';')[0] })).status, 401);
    assert.equal(
        (
            await call(
                '/api/account',
                'GET',
                { Cookie: cookie.split(';')[0] },
                undefined,
                15000,
                appHost,
            )
        ).status,
        200,
    );
    const streamHeaders = await new Promise((resolve, reject) => {
        const stream = request(
            `${appOrigin}/api/stream?topics=monitors`,
            {
                ca,
                lookup,
                headers: {
                    Cookie: cookie.split(';')[0],
                    Accept: 'text/event-stream',
                    'Accept-Encoding': 'gzip',
                },
                timeout: 3000,
            },
            (response) => {
                if (response.statusCode !== 200) {
                    response.resume();
                    reject(new Error(`Workspace stream returned ${response.statusCode}.`));
                    return;
                }
                let frame = '';
                response.setEncoding('utf8');
                response.on('data', (chunk) => {
                    frame += chunk;
                    if (!frame.includes('event: ready\n')) return;
                    resolve(response.headers);
                    response.destroy();
                });
                response.once('end', () =>
                    reject(new Error('Workspace stream closed before ready.')),
                );
                response.once('error', reject);
            },
        );
        stream.once('timeout', () => stream.destroy(new Error('Workspace stream was buffered.')));
        stream.once('error', reject);
        stream.end();
    });
    assert.match(streamHeaders['content-type'], /text\/event-stream/);
    assert.match(streamHeaders['cache-control'], /no-transform/);
    assert.equal(streamHeaders['content-encoding'], undefined);
    console.log('Workspace live stream opens immediately over HTTPS.');
    assert.equal((await call('/plans/')).headers.location, '/pricing/');
    const payload = Buffer.alloc(10 * 1024 * 1024, 90);
    payload[payload.length - 1] = 1;
    const expected = createHash('sha256').update(payload).digest('hex');
    const file = { name: 'maximum.bin', base64: payload.toString('base64') };
    const checksum = await call(
        '/api/tools/everyday-file-checksums/run',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ file }),
    );
    assert.equal(checksum.status, 200, checksum.text.slice(0, 500));
    assert.equal(
        JSON.parse(checksum.text).output,
        expected,
        '10 MiB upload must reach the HTTP tool intact',
    );
    const rpc = await call(
        '/mcp',
        'POST',
        { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        JSON.stringify({
            jsonrpc: '2.0',
            id: 23,
            method: 'tools/call',
            params: { name: 'run_tool', arguments: { toolId: 'everyday-file-checksums', file } },
        }),
    );
    assert.equal(rpc.status, 200, rpc.text.slice(0, 500));
    assert.equal(
        JSON.parse(JSON.parse(rpc.text).result.content[0].text).output,
        expected,
        '10 MiB upload must reach MCP intact',
    );
    const require = createRequire(new URL('../backend/package.json', import.meta.url));
    const sharp = createRequire(require.resolve('@kivel.io/tools/media-engine'))('sharp');
    const photo = await sharp({
        create: { width: 4000, height: 4000, channels: 3, background: '#386b50' },
    })
        .jpeg()
        .toBuffer();
    const image = await call(
        '/api/tools/everyday-image-resizer/run',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({
            file: { name: 'maximum-pixels.jpg', base64: photo.toString('base64') },
            options: { width: '1000', height: '1000', format: 'jpeg' },
        }),
    );
    assert.equal(image.status, 200, image.text.slice(0, 500));
    const artifact = JSON.parse(JSON.parse(image.text).output);
    const dimensions = await sharp(Buffer.from(artifact.base64, 'base64')).metadata();
    assert.equal(dimensions.width, 1000);
    assert.equal(dimensions.height, 1000);
    const slow = await call('/__test__/slow', 'GET', {}, undefined, 30000);
    assert.equal(
        slow.status,
        200,
        '21-second response must survive both backend and proxy timeouts',
    );
    assert.equal(JSON.parse(slow.text).ok, true);
    const container = execFileSync('docker', [...args, 'ps', '-q', 'app'], {
        env,
        encoding: 'utf8',
    }).trim();
    const health = JSON.parse(
        execFileSync('docker', ['inspect', container], { encoding: 'utf8' }),
    )[0];
    assert.equal(health.State.OOMKilled, false);
    assert.equal(health.RestartCount, 0, 'Tool limits must fit the container budget');
    console.log(
        'HTTPS size and timeout checks passed: full 10 MiB HTTP/MCP uploads, 16 MP image processing and a 21-second response.',
    );
    let limited = 0;
    for (let index = 1; index <= 21; index++) {
        const response = await call('/api/inboxes?visibility=public', 'POST', {
            'X-Forwarded-For': `198.51.100.${index}`,
        });
        if (response.status === 429) {
            limited++;
            continue;
        }
        assert.equal(response.status, 201);
        const inbox = JSON.parse(response.text);
        assert.equal(
            (
                await call(`/api/inboxes/${inbox.id}`, 'DELETE', {
                    Authorization: `Bearer ${inbox.inspectionToken}`,
                })
            ).status,
            204,
        );
    }
    assert.ok(limited > 0, 'Forged forwarding headers must not bypass IP quotas.');
    console.log('HTTPS integration passed: verified TLS, HSTS, proxy trust, and shared quotas.');
} catch (error) {
    try {
        docker('logs', '--tail=20', 'app', 'proxy');
    } catch {}
    throw error;
} finally {
    try {
        docker('down', '--volumes');
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}
