const DEFAULT_LIMITS = { targetTicks: 10000, eventLimit: 20, maxFields: 32 };
const SAFE_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,47}$/;

function copy(state) {
    return JSON.parse(JSON.stringify(state || createObservationState()));
}

function limitsFor(limits = DEFAULT_LIMITS) {
    return {
        targetTicks: 10000,
        eventLimit: Math.min(20, Number.isSafeInteger(limits.eventLimit) && limits.eventLimit > 0 ? limits.eventLimit : 20),
        maxFields: Math.min(32, Number.isSafeInteger(limits.maxFields) && limits.maxFields > 0 ? limits.maxFields : 32)
    };
}

function sameIdentity(left, right) {
    return left && right && left.codeVersion === right.codeVersion && left.scopeId === right.scopeId && left.epoch === right.epoch;
}

function identityValid(identity) {
    return typeof identity.codeVersion === 'string' && identity.codeVersion.length > 0 && identity.codeVersion.length <= 100 &&
        typeof identity.scopeId === 'string' && identity.scopeId.length > 0 && identity.scopeId.length <= 100 &&
        Number.isSafeInteger(identity.epoch) && identity.epoch > 0;
}

function event(window, tick, reason) {
    window.events.push({ tick, reason });
    if (window.events.length > window.limits.eventLimit) window.events.shift();
}

function freeze(window, tick, reason) {
    if (window.status === 'review_required') return;
    window.status = 'incomplete';
    window.endedAt = tick;
    window.incompleteReason = reason;
    window.incompleteFrames++;
    delete window.frame;
    event(window, tick, reason);
}

export function createObservationState() {
    return { current: null, previous: null };
}

export function beginObservationTick(input, frame, limits = DEFAULT_LIMITS) {
    const state = copy(input);
    if (!Number.isSafeInteger(frame.tick) || !identityValid(frame)) return state;
    let current = state.current;
    const identity = { codeVersion: frame.codeVersion, scopeId: frame.scopeId, epoch: frame.epoch };
    if (current?.status === 'review_required' && sameIdentity(current.identity, identity)) return state;
    if (current && current.status === 'collecting' && current.startedTick === frame.tick &&
        sameIdentity(current.identity, identity)) return state;
    if (current && current.status === 'collecting') {
        if (!sameIdentity(current.identity, identity)) freeze(current, frame.tick, 'identity_changed');
        else if (current.startedTick !== current.completedTick) freeze(current, frame.tick, 'unfinished_tick');
        else if (frame.tick !== current.lastTick + 1) freeze(current, frame.tick, 'tick_gap');
    }
    if (!current || current.status !== 'collecting' || !sameIdentity(current.identity, identity)) {
        if (current) state.previous = current;
        current = {
            identity, limits: limitsFor(limits), startTick: frame.tick, lastTick: null,
            startedTick: frame.tick, completedTick: null, observedTicks: 0, incompleteFrames: 0,
            status: 'collecting', acceptancePassed: false, fields: {}, counters: {},
            coverage: {}, flagTicks: {}, events: [],
            cpu: { count: 0, mean: null, max: null, bucketMin: null },
            p95Scope: 'rolling_telemetry_samples_only'
        };
        state.current = current;
    }
    current.startedTick = frame.tick;
    delete current.frame;
    return state;
}

function boundedMap(value, count) {
    return value && typeof value === 'object' && !Array.isArray(value) &&
        Object.keys(value).length <= count && Object.keys(value).every(key => SAFE_KEY.test(key) && !['constructor', 'prototype'].includes(key));
}

export function prepareObservationSample(input, sample) {
    const state = copy(input);
    const current = state.current;
    if (!current || current.status !== 'collecting') return state;
    if (!sample || sample.tick !== current.startedTick || !sameIdentity(sample.identity, current.identity) ||
        !boundedMap(sample.fields, current.limits.maxFields) || !boundedMap(sample.flags, 16) || !boundedMap(sample.counters, 12) ||
        !Object.values(sample.fields).every(value => value === null || Number.isFinite(value)) ||
        !Object.values(sample.flags).every(value => value === null || typeof value === 'boolean') ||
        !Object.values(sample.counters).every(value => value === null || Number.isFinite(value) && value >= 0)) {
        freeze(current, current.startedTick, 'invalid_sample');
        return state;
    }
    for (const [key, maximum] of [['fields', current.limits.maxFields], ['flags', 16], ['counters', 12]]) {
        const existing = key === 'flags' ? current.coverage : current[key];
        if (new Set([...Object.keys(existing), ...Object.keys(sample[key])]).size > maximum) {
            freeze(current, sample.tick, 'sample_capacity');
            return state;
        }
    }
    current.frame = JSON.parse(JSON.stringify(sample));
    return state;
}

function aggregate(previous, value) {
    const result = previous || { known: 0, unknown: 0, start: null, end: null, min: null, max: null, mean: null };
    if (!Number.isFinite(value)) { result.unknown++; return result; }
    if (!result.known) result.start = value;
    result.known++;
    result.end = value;
    result.min = result.min === null ? value : Math.min(result.min, value);
    result.max = result.max === null ? value : Math.max(result.max, value);
    result.mean = result.mean === null ? value : result.mean + (value - result.mean) / result.known;
    return result;
}

export function finishObservationTick(input, frame, limits = DEFAULT_LIMITS) {
    const state = copy(input);
    const current = state.current;
    if (!current || current.status !== 'collecting' || current.completedTick === frame.tick) return state;
    if (current.startedTick !== frame.tick || current.frame?.tick !== frame.tick ||
        current.identity.codeVersion !== frame.codeVersion) {
        freeze(current, frame.tick, 'unprepared_or_changed_tick');
        return state;
    }
    if (!Number.isFinite(frame.totalCpu) || frame.totalCpu < 0 || !Number.isFinite(frame.bucket)) {
        freeze(current, frame.tick, 'missing_cpu');
        return state;
    }
    const sample = current.frame;
    for (const [key, value] of Object.entries(sample.counters)) {
        const previous = current.counters[key];
        if (previous && Number.isFinite(value) && Number.isFinite(previous.end) && value < previous.end) {
            freeze(current, frame.tick, 'counter_reset');
            return state;
        }
    }
    for (const [key, value] of Object.entries(sample.fields)) current.fields[key] = aggregate(current.fields[key], value);
    for (const [key, value] of Object.entries(sample.counters)) current.counters[key] = aggregate(current.counters[key], value);
    for (const [key, value] of Object.entries(sample.flags)) {
        current.coverage[key] = current.coverage[key] === true || value === true;
        current.flagTicks[key] = (current.flagTicks[key] || 0) + (value === true ? 1 : 0);
    }
    current.cpu.count++;
    current.cpu.mean = current.cpu.mean === null ? frame.totalCpu :
        current.cpu.mean + (frame.totalCpu - current.cpu.mean) / current.cpu.count;
    current.cpu.max = current.cpu.max === null ? frame.totalCpu : Math.max(current.cpu.max, frame.totalCpu);
    current.cpu.bucketMin = current.cpu.bucketMin === null ? frame.bucket : Math.min(current.cpu.bucketMin, frame.bucket);
    current.completedTick = frame.tick;
    current.lastTick = frame.tick;
    current.observedTicks++;
    delete current.frame;
    if (current.observedTicks >= limitsFor(limits).targetTicks) {
        current.status = 'review_required';
        current.endedAt = frame.tick;
        event(current, frame.tick, 'target_reached_review_required');
    }
    return state;
}

export function pauseObservation(input, { tick, reason }) {
    const state = copy(input);
    if (state.current?.status === 'collecting') freeze(state.current, tick, reason);
    return state;
}
