import { validNativeEconomicOpsState, nativeOpsEconomicIdentity } from './NativeEconomicTrialOpsModel.js';
import { summarizeEconomicTrial, economicIdentityMatches, nativeReleaseReceiptMatches } from './RemoteEconomicTrialModel.js';
import { nativeSuccessorPrevious, resolveArchivedEconomicState } from './NativeEconomicTrialOpsSuccessorProtocol.js';
import { nativeOpsCopy as copy } from './NativeEconomicTrialOpsProfile.js';

export function summarizeNativeEconomicOps(state, economicState, clock) {
    if (state === undefined) return null;
    if (!validNativeEconomicOpsState(state)) return { capturedAt: clock.tick, status: 'state_invalid' };
    const economic = summarizeEconomicTrial(economicState, clock);
    const history = state.schemaVersion === 2 ? state.history : [];
    const archives = history.map((a, index) => resolveArchivedEconomicState(a, history.slice(0, index)));
    const economicHistory = archives.map((a) => summarizeEconomicTrial(a, clock));
    const receipts = [economicState, ...archives].map((value) => value?.nativeReleaseReceipt);
    const previous = nativeSuccessorPrevious(state);
    function compact(c) {
        if (!c) return null;
        const identity = nativeOpsEconomicIdentity(c.request, { remoteId: c.request.oldIdentity?.remoteId });
        const matching = [economic, ...economicHistory]
            .flatMap((e) => [e?.current, e?.previous])
            .find((value) => economicIdentityMatches(value, identity));
        const parentIndex = history.findIndex((a) => a.id === c.archiveRef);
        const parent = history[parentIndex], parentEconomic = archives[parentIndex];
        const retained = c === state.current && Object.hasOwn(state, 'previousAbort') ? previous.request : null;
        return {
            id: c.request.id,
            stage: c.stage,
            request: copy(c.request),
            version: c.request.codeVersion,
            outcome: copy(c.outcome),
            ...(c.request.schemaVersion === 2 ? {
                releaseReceipt: copy(receipts.find((receipt) => nativeReleaseReceiptMatches(receipt, c.releaseRequest, c.request.id))) ?? null
            } : {}),
            admittedIdentity: copy(c.admittedIdentity),
            controlClosureConfirmed: c.controlClosureConfirmed === true,
            unknownEffect: c.unknownEffect === true,
            archive: parent
                ? {
                      atTick: retained ? c.preflightAt : parent.atTick,
                      source: retained ? 'native-pre-release-abort' : 'native-successor-handoff',
                      oldIdentity: copy(parentEconomic.current.identity),
                      oldCosts: copy(parentEconomic.current.evidence),
                      originalWindow: retained
                              ? {issuedAtMs: retained.issuedAtMs, stopAtMs: retained.stopAtMs, notAfterMs: retained.notAfterMs}
                              : copy(parent.originalWindow)
                  }
                : c.archive
                  ? {
                        atTick: c.archive.atTick,
                        source: c.archive.source,
                        oldIdentity: copy(c.archive.current.identity),
                        oldCosts: copy(c.archive.current.evidence),
                        originalWindow: copy(c.archive.originalWindow)
                    }
                  : null,
            observations: copy(c.observations) || {},
            economic: matching ? copy(matching) : null
        };
    }
    return {
        capturedAt: clock.tick,
        status: state.current?.stage || (state.lastRejection ? 'rejected' : 'inactive'),
        lastRejection: copy(state.lastRejection) || null,
        current: compact(state.current),
        previous: compact(previous),
        ...(state.schemaVersion === 2
            ? { history: history.map((a) => compact(a.nativeSnapshot.current)), rejections: copy(state.rejections) }
            : {})
    };
}
