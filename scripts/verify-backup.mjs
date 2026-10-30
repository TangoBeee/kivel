import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, openSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
const restored = `socket_restore_${randomBytes(6).toString('hex')}`;
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
    let fd = openSync(dump, 'wx', 0o600);
    try {
        transfer(['pg_dump', '-U', 'socket_admin', '-d', 'socket', '-Fc'], fd);
    } finally {
        closeSync(fd);
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
    assert.equal(sql(restored, latest), sql('socket', latest));
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
    assert.equal(
        sql(restored, 'SELECT resource_count FROM resource_usage'),
        sql(restored, 'SELECT count(*) FROM temporary_resources'),
    );
    assert.equal(
        sql(restored, 'SELECT stored_bytes FROM resource_usage'),
        sql(restored, 'SELECT COALESCE(sum(stored_bytes),0) FROM temporary_resources'),
    );
    for (const table of [
        'accounts',
        'account_members',
        'api_keys',
        'dodo_events',
        'user_contact_emails',
        'user_recovery_emails',
        'auth_challenges',
        'auth_mail_outbox',
    ])
        assert.match(sql(restored, `SELECT count(*) FROM ${table}`), /^\d+$/);
    assert.equal(sql('socket', "SELECT rolsuper FROM pg_roles WHERE rolname='socket'"), 'f');
    console.log(
        `Backup/restore verification passed in an isolated schema-${sql('socket', latest)} database. No live data was changed.`,
    );
} finally {
    try {
        if (created) sql('postgres', `DROP DATABASE ${restored}`);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}
