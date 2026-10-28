import {HOME_EVIDENCE_LIMITS, validHomeEvidenceStore} from '../../../src/services/HomeEvidenceWindowModel.js';
import {homeEvidenceStatus, summarizeHomeEvidence} from '../../../src/services/HomeEvidenceWindowReport.js';
import {EvidenceReadError, WIRE_HTTP_LIMITS, decodeRawMemoryEnvelope} from './memory-envelope.mjs';

export const HOME_MEMORY_PATH = 'empire.observations.homeEvidence';
const limits = Object.freeze({...WIRE_HTTP_LIMITS, storeChars: HOME_EVIDENCE_LIMITS.storeChars, decodedBytes: HOME_EVIDENCE_LIMITS.storeChars * 4});
export function validateHomeDecodeOptions({expectedVersion, expectedWindowId} = {}) {
    if (expectedVersion !== undefined && (typeof expectedVersion !== 'string' || !expectedVersion || expectedVersion.length > 4096) ||
        expectedWindowId !== undefined && (typeof expectedWindowId !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(expectedWindowId))) throw new EvidenceReadError('INVALID_EXPECTATION');
    return {expectedVersion, expectedWindowId};
}
export function decodeHomeMemoryResponse(body, options = {}) {
    const expected = validateHomeDecodeOptions(options);
    const raw = decodeRawMemoryEnvelope(body, limits);
    const base = {schemaVersion: 1, profile: 'home_natural_v1', memoryPath: HOME_MEMORY_PATH,
        runtimeAcceptance: 'not_performed', freshness: 'not_established', liveControls: 'not_checked',
        expectedVersion: expected.expectedVersion ?? null, versionCheck: 'not_requested', store: null, window: null, report: null};
    if (raw.status === 'missing') return {...base, status: 'missing'};
    if (!validHomeEvidenceStore(raw.value)) throw new EvidenceReadError('INVALID_STORE');
    const store = raw.value, window = homeEvidenceStatus(store), report = summarizeHomeEvidence(store);
    if (window.error || report.error) throw new EvidenceReadError('REPORT_FAILED');
    const versionCheck = expected.expectedVersion === undefined ? 'not_requested' : expected.expectedVersion === window.codeVersion ? 'matched' : 'mismatch';
    const status = expected.expectedWindowId && expected.expectedWindowId !== window.windowId ? 'window_mismatch' :
        versionCheck === 'mismatch' ? 'version_mismatch' : versionCheck === 'not_requested' ? 'unverified_version' :
            store.schemaVersion === 2 && ['unknown', 'interrupted', 'rejected', 'accepted_no_row'].includes(window.phase) ? 'diagnostic' :
                window.coverage.partial ? 'partial' : 'available';
    return {...base, status, versionCheck, store, window, report};
}
