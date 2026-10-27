import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {fixture, wire, version} from './test-fixture.mjs';
import {advanceEvidenceWindow, EVIDENCE_LIMITS} from '../../../src/services/TrialEvidenceWindowModel.js';

const load = () => import('./decoder.mjs').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('decoder.mjs')) return {};
    throw error;
});

test('gzip and plain raw HTTP responses reuse the real schema and report', async () => {
    const m = await load();
    assert.equal(typeof m.decodeMemoryResponse, 'function', 'bounded HTTP Memory decoder is required');
    for (const compressed of [true, false]) {
        const store = fixture(), before = JSON.stringify(store);
        const result = m.decodeMemoryResponse(wire(store, compressed), {expectedVersion: version});
        assert.equal(result.status, 'available');
        assert.deepEqual(result.store, store);
        assert.equal(result.current.status.phase, 'armed');
        assert.equal(result.current.report.firstDeliveryNewEnergyLowerBound, null);
        assert.equal(result.runtimeAcceptance, 'not_performed');
        assert.equal(result.freshness, 'not_established');
        assert.equal(JSON.stringify(store), before);
    }
});

test('disabled absent namespace and null mean missing, not successful acceptance', async () => {
    const m = await load();
    assert.equal(typeof m.decodeMemoryResponse, 'function');
    for (const response of [{ok: 1}, {ok: 1, data: null}, {ok: 1, data: 'null'}]) {
        const result = m.decodeMemoryResponse(Buffer.from(JSON.stringify(response)), {expectedVersion: version});
        assert.equal(result.status, 'missing');
        assert.equal(result.store, null);
        assert.equal(result.runtimeAcceptance, 'not_performed');
    }
});

test('bad JSON, base64, gzip, UTF8, wrapper and schema are refused with safe error codes', async () => {
    const m = await load();
    assert.equal(typeof m.decodeMemoryResponse, 'function');
    const bad = [Buffer.from('{'), Buffer.from([0xff]),
        ...[{ok: 0, error: 'SECRET'}, {ok: 1, data: {}}, {ok: 1, data: 'Incorrect memory path'},
            {ok: 1, data: 'gz:@@=='}, {ok: 1, data: 'gz:YWJj'}, {ok: 1, data: 'gz:AA'},
            {ok: 1, data: '{}'}, {ok: 1, data: '[]'},
            {ok: 1, data: 'gz:' + gzipSync(Buffer.from([0xff])).toString('base64')}]
            .map(value => Buffer.from(JSON.stringify(value)))];
    for (const body of bad) assert.throws(() => m.decodeMemoryResponse(body, {expectedVersion: version}),
        error => /^EVIDENCE_[A-Z0-9_]+$/.test(error.message) && !error.message.includes('SECRET'));
});

test('compressed bombs and HTTP byte caps fail before unbounded allocation', async () => {
    const m = await load();
    assert.equal(typeof m.decodeMemoryResponse, 'function');
    assert.throws(() => m.decodeMemoryResponse(Buffer.alloc(2 * 1024 * 1024 + 1), {expectedVersion: version}), /EVIDENCE_WIRE_TOO_LARGE/);
    assert.throws(() => m.decodeMemoryResponse(wire('x'.repeat(1100000)), {expectedVersion: version}), /EVIDENCE_DECODE_TOO_LARGE/);
    const store = fixture(); store.padding = '界'.repeat(270337);
    assert.throws(() => m.decodeMemoryResponse(wire(store), {expectedVersion: version}), /EVIDENCE_STORE_TOO_LARGE/);
});

test('pending writes retain partial coverage and cannot yield a source lower bound', async () => {
    const m = await load();
    assert.equal(typeof m.decodeMemoryResponse, 'function');
    const store = fixture();
    store.pending = {key: 'local-window:100:arm', windowId: 'local-window', stage: 'arm', tick: 100};
    const result = m.decodeMemoryResponse(wire(store), {expectedVersion: version});
    assert.equal(result.status, 'partial');
    assert.equal(result.current.status.pending.stage, 'arm');
    assert.equal(result.current.report.coverage.partial, true);
    assert.equal(result.current.report.firstDeliveryNewEnergyLowerBound, null);
});

test('foreign profile and requested identity mismatch cannot substitute for this session', async () => {
    const m = await load();
    assert.equal(typeof m.decodeMemoryResponse, 'function');
    const body = wire(fixture());
    for (const key of ['trialId', 'sequence', 'epoch', 'remoteId', 'codeVersion']) {
        const identity = {...fixture().current.header.identity};
        identity[key] = typeof identity[key] === 'number' ? 999 : 'other';
        assert.equal(m.decodeMemoryResponse(body, {expectedVersion: version, expectedIdentity: identity}).status, 'identity_mismatch');
    }
    const store = fixture(); store.current.header.baseRoom = 'W1N1';
    assert.throws(() => m.decodeMemoryResponse(wire(store), {expectedVersion: version}), /EVIDENCE_SCOPE_MISMATCH/);
});

test('old current version stays historical and previous window never replaces current', async () => {
    const m = await load();
    assert.equal(typeof m.decodeMemoryResponse, 'function');
    const result = m.decodeMemoryResponse(wire(fixture()), {expectedVersion: 'new-version'});
    assert.equal(result.status, 'version_mismatch');
    assert.equal(result.current.versionMatches, false);
    assert.equal(result.previous, null);
    assert.equal(result.liveControls, 'not_checked');
});

test('two windows preserve independent settlement and unknown without inheriting previous fees', async () => {
    const m = await load();
    const clock = {tick: 100, nowMs: 1000000, codeVersion: version};
    let store = fixture();
    store.current.capture.latestProof = {identity: structuredClone(store.current.header.identity),
        outboxPending: 0, settlement: {confirmedSpawnCost: 50, confirmedInfrastructureCost: 0, returnedEnergy: 0,
            unknownEvents: 1, unknownEnergyUpperBound: 100, logisticsUnknownEnergyUpperBound: 0,
            knownNetEnergy: -50, netEnergy: null}};
    store = advanceEvidenceWindow(store, {type: 'seal', reason: 'partial'}, clock).store;
    const request = structuredClone(store.current.header.request);
    request.id = 'next-window'; request.nativeId = 'next-native'; request.successorOf = 'local-window';
    request.identity.trialId = 'next-trial'; request.identity.sequence++;
    store = advanceEvidenceWindow(store, {type: 'arm', request}, clock).store;
    const result = m.decodeMemoryResponse(wire(store), {expectedVersion: version});
    assert.equal(result.current.status.windowId, 'next-window');
    assert.equal(result.current.report.settlement, null);
    assert.equal(result.previous.status.windowId, 'local-window');
    assert.equal(result.previous.report.settlement.confirmedSpawnCost, 50);
    assert.equal(result.previous.report.settlement.unknownEvents, 1);
    assert.equal(result.previous.report.settlement.netEnergy, null);
    assert.deepEqual(result.store, store);
});

test('exact character budget accepts multibyte text; one extra character refuses', async () => {
    const m = await load(), store = fixture(); store.padding = '';
    store.padding = '界'.repeat(EVIDENCE_LIMITS.storeChars - JSON.stringify(store).length);
    assert.equal(m.decodeMemoryResponse(wire(store), {expectedVersion: version}).status, 'available');
    store.padding += '界';
    assert.throws(() => m.decodeMemoryResponse(wire(store), {expectedVersion: version}), /EVIDENCE_STORE_TOO_LARGE/);
});

test('duplicate current and previous IDs cannot cause the archive report to resolve to current', async () => {
    const m = await load(), store = fixture();
    store.current.capture.phase = 'sealed'; store.current.seal = {reason: 'not_started', atTick: 100};
    store.previous = structuredClone(store.current);
    assert.throws(() => m.decodeMemoryResponse(wire(store), {expectedVersion: version}), /EVIDENCE_INVALID_STORE/);
});
