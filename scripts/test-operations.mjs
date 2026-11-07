import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { retentionPlan, runRetention } from './dockerhub-retention.mjs';
const root = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'kivel-operations-'));
const bin = join(temporary, 'bin');
mkdirSync(bin);
const executable = (name, body) =>
    writeFileSync(join(bin, name), `#!/usr/bin/env node\n${body}`, { mode: 0o700 });
const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    DEPLOY_DIRECTORY: temporary,
    OPS_TEST_LOG: join(temporary, 'commands.jsonl'),
};
function run(command, args, extra = {}) {
    return spawnSync(command, args, {
        cwd: root,
        env: { ...env, ...extra },
        encoding: 'utf8',
        timeout: 30000,
    });
}
try {
    const tags = [];
    for (let release = 1; release <= 12; release++)
        for (const kind of ['app', 'postgres', 'proxy'])
            tags.push({
                name: `${kind}-${String(release).padStart(12, '0')}`,
                last_updated: new Date(1700000000000 + release * 1000).toISOString(),
            });
    tags.push(
        { name: 'latest', last_updated: 'ignored' },
        { name: 'app-aaaaaaaaaaaa', last_updated: new Date().toISOString() },
    );
    assert.equal(retentionPlan(tags, '000000000012').length, 6);
    assert.equal(retentionPlan(tags, '000000000001').length, 3);
    assert.ok(retentionPlan(tags, '000000000012').every((tag) => !tag.endsWith('aaaaaaaaaaaa')));
    assert.throws(() =>
        retentionPlan([{ name: 'app-bbbbbbbbbbbb', last_updated: 'invalid' }], '000000000012'),
    );
    const hubCalls = [],
        preview = [];
    const hubRequest = async (url, options = {}) => {
        hubCalls.push({ url, method: options.method ?? 'GET' });
        if (url.endsWith('/auth/token')) return Response.json({ access_token: 'synthetic-token' });
        if (options.method === 'DELETE') return new Response(null, { status: 204 });
        return Response.json({ results: tags, next: null });
    };
    const hubEnv = { DOCKERHUB_RETENTION_TOKEN: 'synthetic-secret', CURRENT_TAG: '000000000012' };
    await runRetention(['--dry-run'], hubEnv, hubRequest, (line) => preview.push(line));
    assert.ok(hubCalls.every((call) => call.method !== 'DELETE'));
    assert.ok(
        preview.some((line) =>
            line.includes(
                'Preview DELETE https://hub.docker.com/v2/repositories/tangobee/socket/tags/app-000000000001/',
            ),
        ),
    );
    hubCalls.length = 0;
    await assert.rejects(runRetention(['--apply'], hubEnv, hubRequest), /Confirm the dry run/);
    assert.equal(hubCalls.length, 0);
    await runRetention(
        ['--apply'],
        { ...hubEnv, DOCKERHUB_RETENTION_DRY_RUN_CONFIRMED: 'true' },
        hubRequest,
        () => {},
    );
    assert.equal(hubCalls.filter((call) => call.method === 'DELETE').length, 6);
    assert.ok(
        hubCalls
            .filter((call) => call.method === 'DELETE')
            .every((call) =>
                /^https:\/\/hub\.docker\.com\/v2\/repositories\/tangobee\/socket\/tags\/(app|postgres|proxy)-[a-f0-9]{12}\/$/.test(
                    call.url,
                ),
            ),
    );
    executable(
        'docker',
        `import fs from 'node:fs';
const args = process.argv.slice(2); fs.appendFileSync(process.env.OPS_TEST_LOG, JSON.stringify({args,app:process.env.APP_IMAGE,mail:process.env.MAIL_IMAGE})+'\\n');
if (args.includes('config')) { if(args.includes('--services')) console.log('app\\ndatabase\\nproxy'+(process.env.HAS_MAIL==='false'?'':'\\nmail')); else console.log('EMAIL_SENDING_ENABLED='+process.env.EMAIL_SENDING_ENABLED); }
else if (args.includes('manifest')) { if(process.env.PREVIOUS_MAIL==='missing')process.exit(1);console.log('{}'); }
else if (args.includes('psql') && process.env.RESTORE_TEST==='true') {
 const query=args[args.indexOf('-c')+1]??'', db=args[args.indexOf('-d')+1];
 if(query.includes('MAX(version)'))console.log(db==='socket'?process.env.LIVE_SCHEMA:process.env.RESTORED_SCHEMA);
 else if(query.includes('rolsuper'))console.log('f');
 else if(query.startsWith('SELECT')) {if(Number(process.env.RESTORED_SCHEMA)<18 && /phone_numbers|phone_messages|scheduled_jobs|email_addresses|email_send_jobs|email_suppressions|email_sender_suspensions/.test(query))process.exit(3);console.log('0');}
}
else if (args.includes('psql')) { const file=process.env.DEPLOY_DIRECTORY+'/query-count';const count=Number(fs.existsSync(file)?fs.readFileSync(file,'utf8'):0);fs.writeFileSync(file,String(count+1));console.log(count===0?process.env.SCHEMA_BEFORE:process.env.SCHEMA_AFTER); }
else if (args.includes('pg_dump')) process.stdout.write('test-backup-bytes');
else if (args.includes('ps') && args.includes('-q')) console.log('database-container');
else if (args.includes('up')) {
 if(args.at(-1)==='mail') { if(process.env.MAIL_FAIL==='true' && process.env.MAIL_IMAGE.endsWith('000000000012'))process.exit(1); }
 else if(process.env.CORE_HEALTHY!=='true' && process.env.APP_IMAGE.endsWith('000000000012'))process.exit(1);
}
`,
    );
    for (const [changed, hasMail, missingMail] of [
        [false, true, false],
        [true, true, true],
        [true, false, false],
    ]) {
        writeFileSync(join(temporary, '.release'), '000000000011');
        rmSync(join(temporary, 'query-count'), { force: true });
        const result = run('bash', ['deploy/server-deploy.sh', '000000000012'], {
            SCHEMA_BEFORE: '13',
            SCHEMA_AFTER: changed ? '15' : '13',
            HAS_MAIL: String(hasMail),
            PREVIOUS_MAIL: missingMail ? 'missing' : 'present',
        });
        assert.equal(result.status, 1, result.stderr);
        assert.equal(result.stderr.includes('Rolled back to healthy release'), true, result.stderr);
        assert.match(result.stderr, /Database schema before release: 13; after failure: (13|15)/);
        assert.equal(result.stderr.includes('Previous mail image unavailable'), missingMail);
        assert.equal(readFileSync(join(temporary, '.release'), 'utf8'), '000000000011');
    }
    const commands = readFileSync(env.OPS_TEST_LOG, 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(
        commands.some(
            (entry) =>
                entry.app?.endsWith('000000000011') &&
                entry.mail?.endsWith('000000000012') &&
                entry.args.includes('up'),
        ),
    );
    assert.ok(commands.some((entry) => entry.args.includes('up') && entry.mail === undefined));
    for (const sending of [false, true]) {
        writeFileSync(join(temporary, '.release'), '000000000011');
        rmSync(join(temporary, 'query-count'), { force: true });
        const result = run('bash', ['deploy/server-deploy.sh', '000000000012'], {
            CORE_HEALTHY: 'true',
            MAIL_FAIL: 'true',
            EMAIL_SENDING_ENABLED: String(sending),
            SCHEMA_BEFORE: '13',
            SCHEMA_AFTER: '15',
        });
        assert.equal(result.status, sending ? 1 : 0, result.stderr);
        assert.equal(
            readFileSync(join(temporary, '.release'), 'utf8').trim(),
            sending ? '000000000011' : '000000000012',
        );
    }
    const sampleDump = join(temporary, 'older.dump');
    writeFileSync(sampleDump, 'synthetic dump');
    for (const [restored, external, pass] of [
        [13, true, true],
        [20, true, false],
        [13, false, false],
    ]) {
        const result = run(
            process.execPath,
            ['scripts/verify-backup.mjs', ...(external ? ['--dump', sampleDump] : [])],
            {
                RESTORE_TEST: 'true',
                RESTORED_SCHEMA: String(restored),
                LIVE_SCHEMA: '19',
            },
        );
        assert.equal(result.status === 0, pass, result.stderr);
    }
    const workflow = readFileSync(join(root, '.github/workflows/deploy.yaml'), 'utf8');
    assert.match(workflow, /if: hashFiles\('deploy\/mail.Dockerfile'\) != ''/);
    assert.match(workflow, /if \[ -e "\$path" \]/);
    const firewallUnit = readFileSync(
        join(root, 'deploy/systemd/socket-cloudflare-firewall.service'),
        'utf8',
    );
    assert.match(firewallUnit, /EnvironmentFile=\/etc\/socket-help\/firewall.env/);
    assert.match(firewallUnit, /ExecStart=\/usr\/local\/sbin\/socket-cloudflare-firewall/);
    assert.ok(!firewallUnit.includes('/opt/socket-help'));
    const backupDir = join(temporary, 'nightly');
    mkdirSync(backupDir);
    for (let index = 1; index <= 15; index++)
        writeFileSync(
            join(backupDir, `socket-2020-01-${String(index).padStart(2, '0')}T00-00-00.000Z.dump`),
            'old',
        );
    executable(
        'rclone',
        `import fs from 'node:fs';fs.appendFileSync(process.env.OPS_TEST_LOG,JSON.stringify(process.argv.slice(2))+'\\n');if(process.env.FAIL_COPY==='true')process.exit(1);`,
    );
    const backup = run(process.execPath, ['scripts/backup.mjs', backupDir], {
        BACKUP_REMOTE: 'encrypted:production',
    });
    assert.equal(backup.status, 0, backup.stderr);
    assert.equal(readdirSync(backupDir).filter((name) => name.endsWith('.dump')).length, 14);
    const log = readFileSync(env.OPS_TEST_LOG, 'utf8');
    assert.match(log, /copyto/);
    assert.match(log, /30d/);
    const failed = run(process.execPath, ['scripts/backup.mjs', join(temporary, 'failed')], {
        BACKUP_REMOTE: 'encrypted:production',
        FAIL_COPY: 'true',
    });
    assert.notEqual(failed.status, 0);
    executable(
        'curl',
        `const v4=process.argv.some(value=>value.endsWith('ips-v4'));console.log(v4?'173.245.48.0/20\\n103.21.244.0/22\\n103.22.200.0/22\\n103.31.4.0/22\\n141.101.64.0/18':'2400:cb00::/32\\n2606:4700::/32\\n2803:f800::/32\\n2405:b500::/32\\n2405:8100::/32');`,
    );
    executable('iptables', "throw new Error('Firewall must not be changed during validation');");
    executable('ipset', "throw new Error('IP sets must not be changed during validation');");
    const firewall = run('bash', ['deploy/cloudflare-firewall.sh', '--check']);
    assert.equal(firewall.status, 0, firewall.stderr);
    assert.match(firewall.stdout, /no firewall rules changed/);
    console.log(
        'Verified image retention protections, additive-migration rollback, optional relay health, older backup restores and firewall validation without network or infrastructure changes.',
    );
} finally {
    rmSync(temporary, { recursive: true, force: true });
}
