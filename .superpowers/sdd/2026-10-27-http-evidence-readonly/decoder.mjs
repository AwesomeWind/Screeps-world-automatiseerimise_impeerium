import {EvidenceReadError, WIRE_HTTP_LIMITS, decodeRawMemoryEnvelope} from './memory-envelope.mjs';
export {EvidenceReadError} from './memory-envelope.mjs';
import {EVIDENCE_LIMITS, EVIDENCE_PROFILE, validEvidenceStore} from '../../../src/services/TrialEvidenceWindowModel.js';
import {evidenceWindowStatus, summarizeEvidenceWindow} from '../../../src/services/TrialEvidenceWindowReport.js';

export const HTTP_LIMITS = Object.freeze({...WIRE_HTTP_LIMITS,
    decodedBytes: EVIDENCE_LIMITS.storeChars * 4, storeChars: EVIDENCE_LIMITS.storeChars,
    requestMs: 15000, totalMs: 60000});
export const MEMORY_PATH = 'empire.remoteMining.evidenceWindows';
export const EXPECTED_VERSION = '1792987659461';
const identityKeys = ['trialId', 'sequence', 'remoteId', 'epoch', 'codeVersion'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = code => {throw new EvidenceReadError(code);};

function checkScope(store) {
    for (const window of [store?.current, store?.previous]) {
        if (window == null) continue;
        const h = window.header;
        if (!h || h.profileId !== EVIDENCE_PROFILE.id || h.baseRoom !== EVIDENCE_PROFILE.baseRoom ||
            h.targetRoom !== EVIDENCE_PROFILE.targetRoom || h.sourceId !== EVIDENCE_PROFILE.sourceId ||
            h.identity?.remoteId !== EVIDENCE_PROFILE.remoteId ||
            h.containerPos?.x !== EVIDENCE_PROFILE.containerPos.x || h.containerPos?.y !== EVIDENCE_PROFILE.containerPos.y ||
            h.containerPos?.roomName !== EVIDENCE_PROFILE.containerPos.roomName) fail('SCOPE_MISMATCH');
    }
}

export function validateDecodeOptions({expectedVersion = EXPECTED_VERSION, expectedIdentity} = {}) {
    if (typeof expectedVersion !== 'string' || !expectedVersion || expectedVersion.length > 4096) fail('INVALID_EXPECTATION');
    if (expectedIdentity !== undefined && (!record(expectedIdentity) || Object.keys(expectedIdentity).length !== 5 ||
        !identityKeys.every(key => Object.hasOwn(expectedIdentity, key)) ||
        !['trialId', 'remoteId', 'codeVersion'].every(key => typeof expectedIdentity[key] === 'string' && expectedIdentity[key].length > 0) ||
        !['sequence', 'epoch'].every(key => Number.isSafeInteger(expectedIdentity[key]) && expectedIdentity[key] > 0))) fail('INVALID_EXPECTATION');
    return {expectedVersion, expectedIdentity: expectedIdentity ? structuredClone(expectedIdentity) : undefined};
}

/** Decode the raw HTTP envelope, never an SDK's already-decoded object. No Game or Memory writes. */
export function decodeMemoryResponse(body, options = {}) {
    const expected = validateDecodeOptions(options);
    const envelope = decodeRawMemoryEnvelope(body, HTTP_LIMITS);
    const base = {schemaVersion: 1, memoryPath: MEMORY_PATH, runtimeAcceptance: 'not_performed',
        freshness: 'not_established', liveControls: 'not_checked', store: null, current: null, previous: null};
    if (envelope.status === 'missing') return {...base, status: 'missing'};
    const store = envelope.value;
    checkScope(store);
    let valid = false;
    try {valid = validEvidenceStore(store);}
    catch {fail('INVALID_STORE');}
    if (!valid || store.previous?.header.id === store.current.header.id) fail('INVALID_STORE');

    const describe = window => {
        if (window === null) return null;
        const status = evidenceWindowStatus(store, window.header.id);
        const report = summarizeEvidenceWindow(window);
        if (status.error || report.error) fail('REPORT_FAILED');
        if (status.pending) {
            report.pending = status.pending;
            report.coverage = status.coverage;
            report.firstDeliveryNewEnergyLowerBound = null;
        }
        return {versionMatches: window.header.identity.codeVersion === expected.expectedVersion, status, report};
    };
    let current, previous;
    try {current = describe(store.current); previous = describe(store.previous);}
    catch {fail('REPORT_FAILED');}
    const identityMatches = !expected.expectedIdentity || identityKeys.every(key =>
        store.current.header.identity[key] === expected.expectedIdentity[key]);
    const status = !identityMatches ? 'identity_mismatch' : !current.versionMatches ? 'version_mismatch' :
        current.status.coverage.partial ? 'partial' : 'available';
    return {...base, status, store, current, previous};
}
