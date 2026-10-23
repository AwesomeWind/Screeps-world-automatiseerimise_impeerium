import * as legacy from './NativeEconomicTrialOpsLegacyModel.js';
import { advanceNativeSuccessor, validNativeSuccessorState } from './NativeEconomicTrialOpsSuccessorModel.js';
import { NATIVE_OPS_PROFILE } from './NativeEconomicTrialOpsProfile.js';

export function validNativeEconomicOpsState(state) {
    return state?.schemaVersion === 2 ? validNativeSuccessorState(state) : legacy.validNativeEconomicOpsState(state);
}

export function nativeOpsEconomicIdentity(request, profile) {
    if (request?.schemaVersion !== 2) return legacy.nativeOpsEconomicIdentity(request, profile);
    return {
        trialId: request.trialId,
        sequence: request.startSequence,
        remoteId: request.parent.identity.remoteId,
        epoch: request.parent.identity.epoch,
        codeVersion: request.codeVersion
    };
}

export function advanceNativeEconomicOps(input, event, facts, clock, profile = NATIVE_OPS_PROFILE) {
    if (
        input?.schemaVersion === 2 ||
        (facts.settings?.enabled === true && facts.settings.request?.schemaVersion === 2)
    ) {
        return advanceNativeSuccessor(input, event, facts, clock, profile);
    }
    return legacy.advanceNativeEconomicOps(input, event, facts, clock, profile);
}
