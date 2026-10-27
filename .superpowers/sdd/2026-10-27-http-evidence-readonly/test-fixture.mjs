import {gzipSync} from 'node:zlib';
import {advanceEvidenceWindow, EVIDENCE_PROFILE} from '../../../src/services/TrialEvidenceWindowModel.js';

export const version = '1792987659461';
export function fixture() {
    const clock = {tick: 100, nowMs: 1000000, codeVersion: version};
    const request = {schemaVersion: 1, id: 'local-window', nativeId: 'local-native',
        identity: {trialId: 'local-trial', sequence: 1, epoch: 1, remoteId: EVIDENCE_PROFILE.remoteId, codeVersion: version},
        profileId: EVIDENCE_PROFILE.id, issuedAtMs: clock.nowMs, expiresAtMs: clock.nowMs + 5400000,
        acceptNotBeforeTick: 100, acceptNotAfterTick: 110};
    return advanceEvidenceWindow(undefined, {type: 'arm', request}, clock).store;
}
export const wire = (store, compressed = true) => Buffer.from(JSON.stringify({ok: 1,
    data: compressed ? 'gz:' + gzipSync(JSON.stringify(store)).toString('base64') : JSON.stringify(store)}));
