import { validNativeEconomicOpsState, nativeOpsEconomicIdentity } from './NativeEconomicTrialOpsModel.js';
import { economicIdentityMatches } from './RemoteEconomicTrialModel.js';
import {
    NATIVE_OPS_PROFILE,
    nativeOpsEqual as equal,
    nativeOpsInteger as integer
} from './NativeEconomicTrialOpsProfile.js';

function requestIdentity(request) {
    try {
        return nativeOpsEconomicIdentity(request, { remoteId: request?.oldIdentity?.remoteId });
    } catch {
        return null;
    }
}

export function resolveNativeEconomicOwnership({
    nativeState,
    nativeSettings,
    economicState,
    economicSettings,
    profile = NATIVE_OPS_PROFILE,
    clock
}) {
    const current = economicState?.current,
        q = economicSettings?.request;
    const identity = current?.managed
        ? current.identity
        : q?.schemaVersion === 1 &&
            q.action === 'start' &&
            typeof q.id === 'string' &&
            integer(q.sequence) &&
            q.sequence > 0 &&
            typeof q.remoteId === 'string' &&
            integer(q.epoch) &&
            q.epoch > 0 &&
            typeof q.codeVersion === 'string'
          ? { trialId: q.id, sequence: q.sequence, remoteId: q.remoteId, epoch: q.epoch, codeVersion: q.codeVersion }
          : null;
    if (!identity) return null;
    const owner = economicIdentityMatches(requestIdentity(nativeState?.current?.request), identity)
        ? nativeState.current
        : null;
    const policyMatches = economicIdentityMatches(requestIdentity(nativeSettings?.request), identity);
    if (!owner && !policyMatches) {
        const pending = nativeState?.current;
        const pendingIdentity = requestIdentity(pending?.request);
        if (
            !current?.managed &&
            pending &&
            pending.stage !== 'terminal' &&
            pendingIdentity?.remoteId === identity.remoteId
        ) {
            return { identity, owner: pending, request: pending.request, failure: 'native_ops_control_changed' };
        }
        if (
            nativeState !== undefined &&
            !validNativeEconomicOpsState(nativeState) &&
            identity.remoteId === profile.remoteId
        ) {
            return { identity, owner: null, request: null, failure: 'native_ops_state_invalid' };
        }
        return null;
    }
    const request = owner?.request || nativeSettings?.request;
    const failure =
        nativeState !== undefined && !validNativeEconomicOpsState(nativeState)
            ? 'native_ops_state_invalid'
            : !integer(request?.stopAtMs) || !integer(clock.nowMs) || clock.nowMs >= request.stopAtMs
              ? 'native_ops_window_expired'
              : !owner ||
                  nativeSettings?.enabled !== true ||
                  !equal(nativeSettings.request, owner.request) ||
                  !owner.startRequest ||
                  !equal(economicSettings?.request, owner.startRequest)
                ? 'native_ops_control_changed'
                : null;
    return { identity, owner, request, failure };
}
