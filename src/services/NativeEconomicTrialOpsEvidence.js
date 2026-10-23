import {validNativeEconomicOpsState, nativeOpsEconomicIdentity} from './NativeEconomicTrialOpsModel.js';
import {summarizeEconomicTrial, economicIdentityMatches} from './RemoteEconomicTrialModel.js';
import {nativeOpsCopy as copy} from './NativeEconomicTrialOpsProfile.js';

export function summarizeNativeEconomicOps(state, economicState, clock) {
    if (state === undefined) return null;
    if (!validNativeEconomicOpsState(state)) return {capturedAt: clock.tick, status: 'state_invalid'};
    const economic = summarizeEconomicTrial(economicState, clock);
    function compact(c) {
        if (!c) return null;
        const identity = nativeOpsEconomicIdentity(c.request, {remoteId: c.request.oldIdentity.remoteId});
        const matching = [economic?.current, economic?.previous].find(value => economicIdentityMatches(value, identity));
        return {id: c.request.id, stage: c.stage, request: copy(c.request), version: c.request.codeVersion,
            outcome: copy(c.outcome), admittedIdentity: copy(c.admittedIdentity),
            controlClosureConfirmed: c.controlClosureConfirmed === true, unknownEffect: c.unknownEffect === true,
            archive: c.archive ? {atTick: c.archive.atTick, source: c.archive.source,
                oldIdentity: copy(c.archive.current.identity), oldCosts: copy(c.archive.current.evidence),
                originalWindow: copy(c.archive.originalWindow)} : null,
            observations: copy(c.observations) || {}, economic: matching ? copy(matching) : null};
    }
    return {capturedAt: clock.tick, status: state.current?.stage || (state.lastRejection ? 'rejected' : 'inactive'),
        lastRejection: copy(state.lastRejection) || null,
        current: compact(state.current), previous: compact(state.previous)};
}
