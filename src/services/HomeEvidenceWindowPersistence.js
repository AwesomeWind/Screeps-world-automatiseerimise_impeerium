import {validHomeEvidenceStore, homeCopy, homeEqual} from './HomeEvidenceWindowModel.js';

// A write call may have applied even when it throws. Only exact readback resolves it.
// Callers retain unknown keys; this adapter never retries either write.
export function commitHomeEvidenceStore({expected, candidate, key, kind, readStore, writeStore, checkpoint}) {
    let writeAttempted = false, stage = 'validate';
    const check = name => {stage = name; checkpoint(name, kind);};
    try {
        check('validate');
        if (!validHomeEvidenceStore(candidate)) return {status: 'conflict', writeAttempted, stage};
        const actual = readStore(); check('read');
        if (homeEqual(actual, candidate)) return {status: 'unchanged', writeAttempted, stage};
        if (!homeEqual(actual, expected)) return {status: 'conflict', writeAttempted, stage};
        const pending = homeCopy(candidate); check('copy');
        if (candidate.schemaVersion === 2) pending.pending = {key, kind, tick: global.Game?.time};
        else pending.window.pending = {key, stage: kind, tick: global.Game?.time};
        if (!validHomeEvidenceStore(pending)) return {status: 'conflict', writeAttempted, stage};
        check('beforePending'); writeAttempted = true;
        try {writeStore(pending);} catch {check('afterPending'); if (!homeEqual(readStore(), pending)) throw Error('pending_unknown');}
        check('afterPending');
        if (!homeEqual(readStore(), pending)) throw Error('pending_conflict');
        check('beforeFinal');
        try {writeStore(candidate);} catch {check('afterFinal'); if (!homeEqual(readStore(), candidate)) throw Error('final_unknown');}
        check('afterFinal');
        if (!homeEqual(readStore(), candidate)) throw Error('final_conflict');
        check('read');
        return {status: 'committed', writeAttempted, stage};
    } catch (error) {
        return {status: writeAttempted ? 'unknown' : 'conflict', writeAttempted, stage,
            reason: error?.code === 'HOME_CPU_LIMIT' ? 'cpu_skipped' : 'write_unknown'};
    }
}
