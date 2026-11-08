import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ssh2 from 'ssh2';
import { loadHostKey } from './ssh.js';

function validKey() {
    for (let attempt = 0; attempt < 100; attempt++) {
        const key = ssh2.utils.generateKeyPairSync('ed25519');
        if (!(ssh2.utils.parseKey(key.private) instanceof Error)) return key;
    }
    throw new Error('Test key generation failed.');
}

test('SSH validates generated host keys before saving and preserves the saved identity', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'kivel-host-key-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, 'state', 'host_key'),
        generated = validKey();
    let attempts = 0;
    t.mock.method(ssh2.utils, 'generateKeyPairSync', () =>
        ++attempts < 3 ? { private: 'Malformed key', public: '' } : generated,
    );
    const key = await loadHostKey(path);
    assert.equal(attempts, 3);
    assert.equal(key.toString(), generated.private);
    assert.ok(!(ssh2.utils.parseKey(key) instanceof Error));
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.deepEqual(await loadHostKey(path), key);
    assert.deepEqual(await readFile(path), key);
    assert.equal(attempts, 3);
});

test('SSH never persists malformed generated keys when validation keeps failing', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'kivel-host-key-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, 'host_key');
    const generate = t.mock.method(ssh2.utils, 'generateKeyPairSync', () => ({
        private: 'Malformed key',
        public: '',
    }));
    await assert.rejects(loadHostKey(path), /Could not generate a valid SSH host key/);
    assert.equal(generate.mock.callCount(), 8);
    await assert.rejects(readFile(path), { code: 'ENOENT' });
});
