const ids = {miner: 'a'.repeat(24), hauler: 'b'.repeat(24), source: 'c'.repeat(24), storage: 'd'.repeat(24)};
const clock = {tick: 100, nowMs: 1000000, codeVersion: 'home-test-v1', shard: 'shard3'};
const request = extra => ({schemaVersion: 1, id: 'home-one', profile: 'home_natural_v1', codeVersion: clock.codeVersion,
    shard: 'shard3', roomName: 'W49N41', issuedAtMs: clock.nowMs, expiresAtMs: clock.nowMs + 600000,
    acceptNotBeforeTick: 100, acceptNotAfterTick: 110, ...extra});
const gate = tick => ({observedTick: tick ?? clock.tick, known: true, closed: true, homeReady: true, reason: null});
const selection = () => ({cohort: [{id: ids.miner, name: 'Miner', role: 'miner'}, {id: ids.hauler, name: 'Hauler', role: 'hauler'}],
    objectIds: Object.values(ids), complete: true, reason: null});
function packet(tick = 100, extra = {}) {
    return {windowId: 'home-one', codeVersion: clock.codeVersion, observedTick: tick, declaredEventTick: tick - 1,
        observedAtMs: clock.nowMs + tick - 100, objects: Object.fromEntries(Object.values(ids).map(id => [id,
            {id, exists: false, kind: null, role: null, my: null, pos: null, energy: null}])), events: [], otherEventCounts: {},
        api: {methodSupported: true, shapeValid: true, nativeCount: 0, semantics: 'simulated'},
        cpu: {usedBefore: 0, tickLimit: 20, bucket: 10000, captureCpu: 0}, coverage: {complete: true, reasons: []}, ...extra};
}
async function admitted() {
    const m = await import('../../services/HomeEvidenceWindowModel.js');
    return {m, store: m.advanceHomeEvidence(undefined, {type: 'admit', request: request(), selection: selection(), gate: gate()}, clock).store};
}
module.exports = {ids, clock, request, gate, selection, packet, admitted};
