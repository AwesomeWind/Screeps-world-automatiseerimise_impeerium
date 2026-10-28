import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {wire, fixture as economicFixture} from './test-fixture.mjs';
const require = createRequire(import.meta.url);
const {admitted, clock} = require('../../../src/tests/helpers/home-evidence-data.cjs');
test('home_http_v2_rejection_is_a_diagnostic_download_not_capture', async () => {
    const {request} = require('../../../src/tests/helpers/home-evidence-data.cjs');
    const m = await import('../../../src/services/HomeEvidenceWindowModel.js');
    const {decodeHomeMemoryResponse} = await load('home-decoder');
    const reserved = m.advanceHomeEvidence(undefined, {type: 'reserve', request: request()}, clock).store;
    const store = m.advanceHomeEvidence(reserved, {type: 'reject', reason: 'cpu_skipped', stage: 'selection'}, clock).store;
    const out = decodeHomeMemoryResponse(wire(store), {expectedVersion: clock.codeVersion});
    assert.equal(out.status, 'diagnostic'); assert.equal(out.report.phase, 'rejected');
    assert.equal(out.report.coverage.rows, null); assert.equal(out.runtimeAcceptance, 'not_performed');
    assert.equal(decodeHomeMemoryResponse(wire(store), {expectedVersion: 'foreign'}).status, 'version_mismatch');
    assert.equal(decodeHomeMemoryResponse(wire(store), {expectedWindowId: 'foreign'}).status, 'window_mismatch');
});
test('home_http_v2_pending_cannot_be_an_admission_proof', async () => {
    const {m, store} = await require('../../../src/tests/helpers/home-evidence-data.cjs').admittedV2();
    const {decodeHomeMemoryResponse} = await load('home-decoder');
    store.pending = {key: m.homeCommitKey(store.admission.request, 'admit'), kind: 'admit', tick: 100};
    const out = decodeHomeMemoryResponse(wire(store), {expectedVersion: clock.codeVersion});
    assert.equal(out.status, 'diagnostic'); assert.equal(out.report.phase, 'unknown');
    assert.equal(out.report.admissionConfirmed, false);
    store.window.header.request.id = 'foreign';
    assert.throws(() => decodeHomeMemoryResponse(wire(store)), /EVIDENCE_INVALID_STORE/);
});
const root = new URL('./', import.meta.url);
const load = name => import('./' + name + '.mjs').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes(name + '.mjs')) return {};
    throw error;
});
function temporary(t) {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'home-http-'));
    t.after(() => {assert.equal(path.dirname(folder), path.resolve(os.tmpdir())); assert.ok(path.basename(folder).startsWith('home-http-')); fs.rmSync(folder, {recursive: true});});
    return folder;
}
test('home_http_fixed_profile_only_one_get_and_missing_is_terminal', async () => {
    const m = await load('profile-reader'); assert.equal(typeof m.createHomeMemoryReader, 'function', 'fixed home HTTP reader required');
    let count = 0;
    const reader = m.createHomeMemoryReader({allowNetwork: true, expectedVersion: clock.codeVersion, tokenProvider: () => 'FIXTURE',
        fetchImpl: async (url, input) => {
            count++; assert.equal(url, 'https://screeps.com/api/user/memory?shard=shard3&path=empire.observations.homeEvidence');
            assert.equal(input.method, 'GET'); assert.equal(input.redirect, 'error');
            return new Response(Buffer.from('{"ok":1}'));
        }});
    const output = await reader.read(); assert.equal(output.decoded.status, 'missing');
    assert.equal(output.metadata.memoryPath, 'empire.observations.homeEvidence');
    await assert.rejects(reader.read(), /EVIDENCE_READER_CONSUMED/); assert.equal(count, 1);
});
test('home_http_no_arbitrary_profile_or_path_and_default_off', async () => {
    const m = await load('profile-reader'); assert.equal(typeof m.createProfileReader, 'function');
    for (const profile of ['anything', 'https://elsewhere', '__proto__']) assert.throws(() => m.createProfileReader(profile), /EVIDENCE_INVALID_PROFILE/);
    assert.throws(() => m.createHomeMemoryReader({url: 'https://elsewhere'}), /EVIDENCE_INVALID_OPTIONS/);
    await assert.rejects(m.createHomeMemoryReader({tokenProvider: () => assert.fail('credentials')}).read(), /EVIDENCE_ONLINE_NOT_AUTHORIZED/);
});
test('home_http_dedicated_schema_version_and_window_binding', async () => {
    const m = await load('home-decoder'); assert.equal(typeof m.decodeHomeMemoryResponse, 'function');
    const {store} = await admitted(), raw = wire(store);
    const value = m.decodeHomeMemoryResponse(raw, {expectedVersion: clock.codeVersion, expectedWindowId: 'home-one'});
    assert.equal(value.status, 'available'); assert.deepEqual(value.store, store);
    assert.equal(value.runtimeAcceptance, 'not_performed'); assert.equal(value.report.productionSemantics, 'unverified');
    assert.equal(value.report.settlement, undefined);
    assert.equal(m.decodeHomeMemoryResponse(raw, {expectedVersion: 'other'}).status, 'version_mismatch');
    assert.equal(m.decodeHomeMemoryResponse(raw, {expectedVersion: clock.codeVersion, expectedWindowId: 'other'}).status, 'window_mismatch');
    assert.throws(() => m.decodeHomeMemoryResponse(raw, {expectedWindowId: '../bad'}), /EVIDENCE_INVALID_EXPECTATION/);
});
test('home_http_foreign_store_is_not_a_profile_fallback', async () => {
    const m = await load('home-decoder'); assert.equal(typeof m.decodeHomeMemoryResponse, 'function');
    const old = await load('decoder'), {store} = await admitted();
    assert.throws(() => m.decodeHomeMemoryResponse(wire(economicFixture())), /EVIDENCE_INVALID_STORE/);
    assert.throws(() => old.decodeMemoryResponse(wire(store)), /EVIDENCE_INVALID_STORE/);
    const wrong = structuredClone(store); wrong.window.header.roomName = 'W1N1';
    assert.throws(() => m.decodeHomeMemoryResponse(wire(wrong)), /EVIDENCE_INVALID_STORE/);
});
test('home_http_new_character_limit_and_gzip_bounds', async () => {
    const m = await load('home-decoder'); assert.equal(typeof m.decodeHomeMemoryResponse, 'function');
    assert.throws(() => m.decodeHomeMemoryResponse(wire({padding: '界'.repeat(131073)})), /EVIDENCE_STORE_TOO_LARGE/);
    assert.throws(() => m.decodeHomeMemoryResponse(wire('x'.repeat(600000))), /EVIDENCE_DECODE_TOO_LARGE/);
    assert.equal(m.decodeHomeMemoryResponse(Buffer.from('{"ok":1}')).status, 'missing');
});
test('home_http_export_uses_home_codec_and_does_not_overwrite', async t => {
    const m = await load('artifacts'); assert.equal(typeof m.writeHomeEvidenceBundle, 'function', 'dedicated home exporter required');
    const {store} = await admitted(), directory = path.join(temporary(t), 'out');
    const result = m.writeHomeEvidenceBundle(wire(store), directory, {expectedVersion: clock.codeVersion});
    assert.equal(result.origin, 'offline_import'); assert.equal(result.status, 'available');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'store.json'), 'utf8')), store);
    assert.throws(() => m.writeHomeEvidenceBundle(wire(store), directory), /EVIDENCE_OUTPUT_EXISTS/);
});
test('home_http_offline_cli_selects_fixed_profile_and_rejects_unknown_before_read', async t => {
    const {store} = await admitted(), directory = temporary(t), input = path.join(directory, 'raw.json');
    fs.writeFileSync(input, wire(store));
    const run = args => spawnSync(process.execPath, ['--import', new URL('offline-guard.mjs', root).href,
        fileURLToPath(new URL('entry.mjs', root)), ...args], {encoding: 'utf8', timeout: 5000});
    const result = run(['--decode', input, '--out', path.join(directory, 'out'), '--profile', 'home_natural_v1']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).profile, 'home_natural_v1');
    const denied = run(['--decode', 'D:/.secret.json', '--out', path.join(directory, 'bad'), '--profile', 'arbitrary']);
    assert.notEqual(denied.status, 0); assert.match(denied.stderr, /EVIDENCE_INVALID_PROFILE/);
});

test('home_review_decoder_does_not_assume_old_economic_version', async () => {
    const m = await load('home-decoder'); const {store} = await admitted();
    const version = '1793069737159'; store.window.header.codeVersion = version; store.window.header.request.codeVersion = version;
    const raw = wire(store), withoutExpectation = m.decodeHomeMemoryResponse(raw);
    assert.equal(withoutExpectation.status, 'unverified_version'); assert.equal(withoutExpectation.versionCheck, 'not_requested');
    const checked = m.decodeHomeMemoryResponse(raw, {expectedVersion: version});
    assert.equal(checked.status, 'available'); assert.equal(checked.versionCheck, 'matched');
});

test('home_review_online_reader_requires_explicit_version_before_token_or_fetch', async () => {
    const m = await load('profile-reader');
    const reader = m.createHomeMemoryReader({allowNetwork: true, tokenProvider: () => assert.fail('token'), fetchImpl: () => assert.fail('fetch')});
    await assert.rejects(reader.read(), /EVIDENCE_INVALID_EXPECTATION/);
});

test('home_review_offline_cli_can_compare_an_explicit_new_version', async t => {
    const {store} = await admitted(); const version = '1793069737159';
    store.window.header.codeVersion = version; store.window.header.request.codeVersion = version;
    const directory = temporary(t), input = path.join(directory, 'raw.json'); fs.writeFileSync(input, wire(store));
    const result = spawnSync(process.execPath, ['--import', new URL('offline-guard.mjs', root).href,
        fileURLToPath(new URL('entry.mjs', root)), '--decode', input, '--out', path.join(directory, 'out'),
        '--profile', 'home_natural_v1', '--expected-version', version], {encoding: 'utf8', timeout: 5000});
    assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).status, 'available');
});
