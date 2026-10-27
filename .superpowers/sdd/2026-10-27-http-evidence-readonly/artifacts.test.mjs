import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture, wire, version} from './test-fixture.mjs';
const root = new URL('./', import.meta.url);
const load = () => import('./artifacts.mjs').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('artifacts.mjs')) return {};
    throw error;
});
function temporary(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screeps-http-evidence-'));
    t.after(() => {
        assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
        assert.ok(path.basename(dir).startsWith('screeps-http-evidence-'));
        fs.rmSync(dir, {recursive: true});
    });
    return dir;
}

test('exclusive local bundle retains raw response, decoded store and hashes without overwriting', async t => {
    const m = await load();
    assert.equal(typeof m.writeEvidenceBundle, 'function', 'an exclusive evidence exporter is required');
    const dir = path.join(temporary(t), 'capture'), raw = wire(fixture());
    const result = m.writeEvidenceBundle(raw, dir, {expectedVersion: version});
    assert.equal(result.origin, 'offline_import');
    assert.equal(result.runtimeAcceptance, 'not_performed');
    assert.equal(result.files['response.json'].sha256, createHash('sha256').update(raw).digest('hex'));
    assert.deepEqual(fs.readFileSync(path.join(dir, 'response.json')), raw);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'store.json'), 'utf8')), fixture());
    assert.throws(() => m.writeEvidenceBundle(wire(null), dir, {expectedVersion: version}), /EVIDENCE_OUTPUT_EXISTS/);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'response.json')), raw);
});

test('invalid data cannot leave a misleading completed bundle', async t => {
    const m = await load();
    assert.equal(typeof m.writeEvidenceBundle, 'function');
    const dir = path.join(temporary(t), 'invalid');
    assert.throws(() => m.writeEvidenceBundle(Buffer.from('bad'), dir), /EVIDENCE_INVALID_HTTP_JSON/);
    assert.equal(fs.existsSync(dir), false);
});

test('offline CLI check and denied online flags never load credentials or transport', t => {
    const command = args => spawnSync(process.execPath, ['--import', new URL('offline-guard.mjs', root).href,
        fileURLToPath(new URL('entry.mjs', root)), ...args], {encoding: 'utf8', timeout: 5000});
    const check = command(['--check']);
    assert.equal(check.status, 0, 'offline CLI check is required: ' + check.stderr);
    const result = JSON.parse(check.stdout);
    assert.equal(result.onlineExecutionAuthorized, false);
    assert.equal(result.credentialReads, 0);
    for (const args of [['--execute'], ['--online'], ['--decode', 'D:/.secret.json', '--out', path.join(temporary(t), 'denied')]]) {
        const denied = command(args);
        assert.notEqual(denied.status, 0);
        assert.match(denied.stderr, /EVIDENCE_(ONLINE_NOT_AUTHORIZED|CREDENTIAL_INPUT_FORBIDDEN)/);
    }
});

test('offline CLI decodes a local fixture with no network or active window requirement', t => {
    const dir = temporary(t), input = path.join(dir, 'input.json'), output = path.join(dir, 'decoded');
    fs.writeFileSync(input, wire(fixture()));
    const result = spawnSync(process.execPath, ['--import', new URL('offline-guard.mjs', root).href,
        fileURLToPath(new URL('entry.mjs', root)), '--decode', input, '--out', output], {encoding: 'utf8', timeout: 5000});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'available');
    assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8')).origin, 'offline_import');
});
