import { randomBytes } from 'node:crypto';
import { writeFile, readFile, appendFile, chmod } from 'node:fs/promises';
const contents = `APP_PORT=8080
PUBLIC_BASE_URL=http://localhost:8080
POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}
APP_DATABASE_PASSWORD=${randomBytes(32).toString('hex')}
DOMAIN=socket.help
PROXY_NETWORK_PREFIX=10.203.0
LOG_LEVEL=info
AUTH_SECRET=${randomBytes(32).toString('hex')}
SSH_PORT=2222
BILLING_ENABLED=false
DODO_PAYMENTS_ENVIRONMENT=test_mode
SMTP_HOST=
SMTP_PORT=
SMTP_FROM=
SMTP_USER=
SMTP_PASSWORD=
`;
try {
    await writeFile('.env', contents, { flag: 'wx', mode: 0o600 });
    console.log(
        'Created private .env with random secrets and paid checkout disabled. Set DOMAIN and SMTP before public deployment.',
    );
} catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await readFile('.env', 'utf8'),
        lines = [];
    if (!/^AUTH_SECRET=.+$/m.test(existing))
        lines.push(`AUTH_SECRET=${randomBytes(32).toString('hex')}`);
    if (!/^BILLING_ENABLED=/m.test(existing)) lines.push('BILLING_ENABLED=false');
    if (lines.length) await appendFile('.env', `\n${lines.join('\n')}\n`);
    await chmod('.env', 0o600);
    console.log(
        'Existing .env secrets preserved; missing auth/beta defaults added and permissions restricted.',
    );
}
