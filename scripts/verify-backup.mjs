import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, openSync, closeSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const externalDump =
    process.argv.length === 4 && process.argv[2] === '--dump' ? process.argv[3] : undefined;
if (process.argv.length > 2 && !externalDump)
    throw new Error('Usage: verify-backup.mjs [--dump path]');
const command = (args, options = {}) =>
    execFileSync('docker', ['compose', 'exec', '-T', 'database', ...args], {
        maxBuffer: 16 * 1024 * 1024,
        ...options,
    });
const sql = (database, query) =>
    command(
        ['psql', '-U', 'socket_admin', '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', '-c', query],
        { encoding: 'utf8' },
    ).trim();
const restored = `kivel_restore_${randomBytes(6).toString('hex')}`;
const directory = mkdtempSync(join(tmpdir(), 'socket-backup-'));
const dump = join(directory, 'backup.dump');
let created = false;
function transfer(args, fd, input = false) {
    const result = spawnSync('docker', ['compose', 'exec', '-T', 'database', ...args], {
        stdio: input ? [fd, 'ignore', 'pipe'] : ['ignore', fd, 'pipe'],
        encoding: 'utf8',
        timeout: 300000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
        throw new Error(
            `Database backup operation failed: ${result.stderr?.slice(0, 1000) ?? result.status}`,
        );
}
try {
    let fd;
    if (externalDump) copyFileSync(externalDump, dump);
    else {
        fd = openSync(dump, 'wx', 0o600);
        try {
            transfer(['pg_dump', '-U', 'socket_admin', '-d', 'socket', '-Fc'], fd);
        } finally {
            closeSync(fd);
        }
    }
    sql('postgres', `CREATE DATABASE ${restored}`);
    created = true;
    fd = openSync(dump, 'r');
    try {
        transfer(['pg_restore', '-U', 'socket_admin', '-d', restored, '--exit-on-error'], fd, true);
    } finally {
        closeSync(fd);
    }
    const latest = 'SELECT MAX(version) FROM schema_migrations';
    const restoredVersion = Number(sql(restored, latest)),
        liveVersion = Number(sql('socket', latest));
    assert.ok(
        Number.isInteger(restoredVersion) && restoredVersion > 0,
        'Invalid restored schema version.',
    );
    if (externalDump)
        assert.ok(restoredVersion <= liveVersion, 'Backup schema is newer than the live database.');
    else assert.equal(restoredVersion, liveVersion);
    assert.equal(
        sql(restored, 'SELECT inbox_count FROM platform_usage'),
        sql(restored, 'SELECT COUNT(*) FROM inboxes'),
    );
    assert.equal(
        sql(restored, 'SELECT stored_bytes FROM platform_usage'),
        sql(restored, 'SELECT COALESCE(SUM(stored_bytes),0) FROM captured_requests'),
    );
    assert.equal(
        sql(
            restored,
            'SELECT COUNT(*) FROM captured_requests WHERE stored_bytes <> octet_length(record)',
        ),
        '0',
    );
    if (restoredVersion >= 2) {
        assert.equal(
            sql(restored, 'SELECT resource_count FROM resource_usage'),
            sql(restored, 'SELECT count(*) FROM temporary_resources'),
        );
        assert.equal(
            sql(restored, 'SELECT stored_bytes FROM resource_usage'),
            sql(restored, 'SELECT COALESCE(sum(stored_bytes),0) FROM temporary_resources'),
        );
    }
    for (const [table, version] of Object.entries({
        accounts: 4,
        account_members: 4,
        api_keys: 4,
        dodo_events: 8,
        user_contact_emails: 7,
        user_recovery_emails: 6,
        auth_challenges: 6,
        auth_mail_outbox: 6,
        scheduled_jobs: 17,
        phone_numbers: 18,
        phone_messages: 18,
        email_addresses: 14,
        email_messages: 9,
        email_send_jobs: 15,
        email_suppressions: 15,
        email_sender_suspensions: 15,
    })) {
        if (restoredVersion < version) continue;
        assert.match(sql(restored, `SELECT count(*) FROM ${table}`), /^\d+$/);
    }
    assert.equal(sql('socket', "SELECT rolsuper FROM pg_roles WHERE rolname='socket'"), 'f');
    console.log(
        `Backup/restore verification passed in an isolated schema-${restoredVersion} database (live schema ${liveVersion}). No live data was changed.`,
    );
} finally {
    try {
        if (created) sql('postgres', `DROP DATABASE ${restored}`);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}
