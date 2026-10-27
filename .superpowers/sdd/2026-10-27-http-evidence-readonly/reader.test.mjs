import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, wire, version} from './test-fixture.mjs';

const load = () => import('./reader.mjs').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('reader.mjs')) return {};
    throw error;
});
const options = extra => ({allowNetwork: true, expectedVersion: version,
    tokenProvider: async () => 'LOCAL_TEST_TOKEN', fetchImpl: async () => new Response(wire(fixture())), ...extra});

test('default disabled reader refuses before credentials, SDK or network access', async () => {
    const m = await load();
    assert.equal(typeof m.createMemoryReader, 'function', 'a default disabled single GET reader is required');
    const reader = m.createMemoryReader({tokenProvider: () => assert.fail('credential accessed'),
        fetchImpl: () => assert.fail('network accessed')});
    await assert.rejects(reader.read(), /EVIDENCE_ONLINE_NOT_AUTHORIZED/);
});

test('one fixed GET downloads and decodes raw gzip without WS, console or arbitrary paths', async () => {
    const m = await load();
    assert.equal(typeof m.createMemoryReader, 'function');
    let calls = 0;
    const reader = m.createMemoryReader(options({fetchImpl: async (url, request) => {
        calls++;
        assert.equal(url, 'https://screeps.com/api/user/memory?shard=shard3&path=empire.remoteMining.evidenceWindows');
        assert.equal(request.method, 'GET');
        assert.equal(request.redirect, 'error');
        assert.equal(request.headers['X-Token'], 'LOCAL_TEST_TOKEN');
        assert.equal(request.body, undefined);
        return new Response(wire(fixture()));
    }}));
    const result = await reader.read();
    assert.equal(result.decoded.status, 'available');
    assert.deepEqual(result.raw, wire(fixture()));
    assert.equal(result.metadata.httpStatus, 200);
    assert.equal(result.metadata.attempts, 1);
    assert.equal(JSON.stringify(result).includes('LOCAL_TEST_TOKEN'), false);
    await assert.rejects(reader.read(), /EVIDENCE_READER_CONSUMED/);
    assert.equal(calls, 1);
});

for (const status of [301, 401, 403, 429, 502]) test('HTTP ' + status + ' stops once without replay or token refresh', async () => {
    const m = await load();
    assert.equal(typeof m.createMemoryReader, 'function');
    let calls = 0, tokens = 0;
    const reader = m.createMemoryReader(options({tokenProvider: async () => {tokens++; return 'TEST';},
        fetchImpl: async () => {calls++; return new Response('SECRET', {status});}}));
    await assert.rejects(reader.read(), new RegExp('EVIDENCE_HTTP_' + status));
    await assert.rejects(reader.read(), /EVIDENCE_READER_CONSUMED/);
    assert.equal(calls, 1); assert.equal(tokens, 1);
});

test('unknown transport error is sanitized, consumed, never automatically retried', async () => {
    const m = await load();
    assert.equal(typeof m.createMemoryReader, 'function');
    let calls = 0;
    const reader = m.createMemoryReader(options({fetchImpl: async () => {calls++; throw new Error('token=SECRET');}}));
    await assert.rejects(reader.read(), /EVIDENCE_TRANSPORT_FAILED$/);
    await assert.rejects(reader.read(), /EVIDENCE_READER_CONSUMED/);
    assert.equal(calls, 1);
});

test('credential wait shares the original deadline and late credentials cannot send a request', async () => {
    const m = await load();
    assert.equal(typeof m.createMemoryReader, 'function');
    let tick = 1000, fire, release, calls = 0;
    const reader = m.createMemoryReader(options({now: () => tick,
        setTimer: fn => {fire = fn; return 1;}, clearTimer: () => {},
        tokenProvider: () => new Promise(resolve => {release = resolve;}),
        fetchImpl: async () => {calls++; return new Response(wire(fixture()));}}));
    const pending = reader.read();
    await new Promise(resolve => setImmediate(resolve));
    tick = 16000; fire();
    await assert.rejects(pending, /EVIDENCE_DEADLINE/);
    release('LATE_TOKEN');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 0);
});

test('caller cancellation aborts streaming body and never decodes a partial response', async () => {
    const m = await load();
    assert.equal(typeof m.createMemoryReader, 'function');
    const controller = new AbortController(); let entered, cancelled = false, signal;
    const waiting = new Promise(resolve => {entered = resolve;});
    const reader = m.createMemoryReader(options({fetchImpl: async (_url, request) => {
        signal = request.signal;
        return new Response(new ReadableStream({pull() {entered(); return new Promise(() => {});},
            cancel() {cancelled = true;}}));
    }}));
    const pending = reader.read({signal: controller.signal});
    await waiting; controller.abort();
    await assert.rejects(pending, /EVIDENCE_CANCELLED/);
    assert.equal(signal.aborted, true);
    assert.equal(cancelled, true);
});

test('streamed bytes and declared size have bounded caps', async () => {
    const m = await load();
    assert.equal(typeof m.createMemoryReader, 'function');
    for (const declared of [true, false]) {
        let cancelled = false;
        const response = new Response(new ReadableStream({start(controller) {
            controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
        }, cancel() {cancelled = true;}}), {headers: declared ? {'Content-Length': '2097153'} : {}});
        const reader = m.createMemoryReader(options({fetchImpl: async () => response}));
        await assert.rejects(reader.read(), /EVIDENCE_WIRE_TOO_LARGE/);
        assert.equal(cancelled, true);
    }
});

test('original deadline is not extended and reversed clock or late completion fails', async () => {
    const m = await load();
    assert.equal(typeof m.createMemoryReader, 'function');
    for (const next of [999, 2001]) {
        let tick = 1000;
        const reader = m.createMemoryReader(options({now: () => tick, deadlineMs: 2000,
            fetchImpl: async () => {tick = next; return new Response(wire(fixture()));}}));
        await assert.rejects(reader.read(), next === 999 ? /EVIDENCE_INVALID_CLOCK/ : /EVIDENCE_DEADLINE/);
    }
});

test('options are captured and unexpected endpoints or extra read parameters are rejected', async () => {
    const m = await load();
    assert.equal(typeof m.createMemoryReader, 'function');
    assert.throws(() => m.createMemoryReader(options({url: 'https://other.example'})), /EVIDENCE_INVALID_OPTIONS/);
    const input = options(); const reader = m.createMemoryReader(input); input.expectedVersion = 'other';
    assert.equal((await reader.read()).decoded.status, 'available');
    const other = m.createMemoryReader(options());
    await assert.rejects(other.read({path: 'empire'}), /EVIDENCE_INVALID_READ/);
});
