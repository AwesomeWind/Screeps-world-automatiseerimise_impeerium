import { validNativeEconomicOpsState, nativeOpsEconomicIdentity } from './NativeEconomicTrialOpsModel.js';
import { summarizeEconomicTrial, economicIdentityMatches } from './RemoteEconomicTrialModel.js';
import { nativeOpsCopy as copy } from './NativeEconomicTrialOpsProfile.js';

export function summarizeNativeEconomicOps(state, economicState, clock) {
    if (state === undefined) return null;
    if (!validNativeEconomicOpsState(state)) return { capturedAt: clock.tick, status: 'state_invalid' };
    const economic = summarizeEconomicTrial(economicState, clock);
    const history = state.schemaVersion === 2 ? state.history : [];
    const economicHistory = history.map((a) => summarizeEconomicTrial(a.economicState, clock));
    function compact(c) {
        if (!c) return null;
        const identity = nativeOpsEconomicIdentity(c.request, { remoteId: c.request.oldIdentity?.remoteId });
        const matching = [economic, ...economicHistory]
            .flatMap((e) => [e?.current, e?.previous])
            .find((value) => economicIdentityMatches(value, identity));
        const parent = history.find((a) => a.id === c.archiveRef);
        return {
            id: c.request.id,
            stage: c.stage,
            request: copy(c.request),
            version: c.request.codeVersion,
            outcome: copy(c.outcome),
            admittedIdentity: copy(c.admittedIdentity),
            controlClosureConfirmed: c.controlClosureConfirmed === true,
            unknownEffect: c.unknownEffect === true,
            archive: parent
                ? {
                      atTick: parent.atTick,
                      source: 'native-successor-handoff',
                      oldIdentity: copy(parent.economicState.current.identity),
                      oldCosts: copy(parent.economicState.current.evidence),
                      originalWindow: copy(parent.originalWindow)
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
        previous: compact(state.previous),
        ...(state.schemaVersion === 2
            ? { history: history.map((a) => compact(a.nativeSnapshot.current)), rejections: copy(state.rejections) }
            : {})
    };
}
