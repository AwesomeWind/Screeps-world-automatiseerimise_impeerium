const IDENTITY_FIELDS = ['trialId', 'sequence', 'remoteId', 'epoch', 'codeVersion'];
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 100;
const copy = value => JSON.parse(JSON.stringify(value));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function sameIdentity(left, right) {
    return record(left) && record(right) && IDENTITY_FIELDS.every(key => left[key] === right[key]);
}

function bindingFor(session, confirmedReceiptTick = null) {
    return { schemaVersion: 1, identity: copy(session.identity), requestId: session.spawn?.requestId ?? null,
        name: session.spawn?.name ?? null, confirmedReceiptTick };
}

function bindingValid(session) {
    const binding = session.settlementBinding;
    return record(binding) && binding.schemaVersion === 1 && sameIdentity(binding.identity, session.identity) &&
        (binding.requestId === null || text(binding.requestId)) && (binding.name === null || text(binding.name)) &&
        (binding.confirmedReceiptTick === null || integer(binding.confirmedReceiptTick));
}

function confirmedHere(session, tick) {
    const value = session.settlement;
    const binding = session.settlementBinding;
    return bindingValid(session) && record(value) && value.confirmedCost === 50 && value.unknownUpperBound === 0 &&
        integer(value.updatedAtTick) && value.updatedAtTick >= session.startedAtTick && value.updatedAtTick <= tick &&
        text(session.spawn?.requestId) && text(session.spawn?.name) &&
        binding.requestId === session.spawn.requestId && binding.name === session.spawn.name &&
        integer(binding.confirmedReceiptTick) && binding.confirmedReceiptTick >= session.startedAtTick &&
        binding.confirmedReceiptTick <= value.updatedAtTick &&
        (!integer(session.spawn.callTick) || binding.confirmedReceiptTick >= session.spawn.callTick);
}

function legacyTerminal(session) {
    return !!session.outcome && !Object.hasOwn(session, 'settlementBinding') &&
        !Object.hasOwn(session, 'settlementSourceStatus');
}

function receiptValid(session, evidence, tick) {
    const receipt = evidence?.receipt;
    return record(evidence) && sameIdentity(evidence.identity, session.identity) &&
        text(session.spawn?.requestId) && evidence.requestId === session.spawn.requestId &&
        record(receipt) && receipt.requestId === session.spawn.requestId &&
        text(session.spawn.name) && receipt.name === session.spawn.name &&
        receipt.remoteId === session.identity.remoteId && receipt.epoch === session.identity.epoch &&
        receipt.cost === 50 && integer(receipt.tick) && receipt.tick >= session.startedAtTick &&
        (!integer(session.spawn.callTick) || receipt.tick >= session.spawn.callTick) && receipt.tick <= tick;
}

export function reconTrialSettlementReceipt(session, evidence, clock) {
    return session && receiptValid(session, evidence, clock.tick) ? evidence.receipt : null;
}

function resultFor(session, cost, upper, binding, sourceStatus, clock) {
    const previous = session.settlement;
    const changed = !record(previous) || previous.confirmedCost !== cost || previous.unknownUpperBound !== upper ||
        !integer(previous.updatedAtTick) || previous.updatedAtTick < session.startedAtTick ||
        previous.updatedAtTick > clock.tick || !same(binding, session.settlementBinding);
    return { settlement: { confirmedCost: cost, unknownUpperBound: upper,
        updatedAtTick: changed ? clock.tick : previous.updatedAtTick },
        binding, sourceStatus, changed };
}

function preserveLegacy(session) {
    return { settlement: session.settlement, binding: undefined, sourceStatus: 'legacy_unverified', changed: false };
}

export function createReconTrialSettlement(identity, tick) {
    return { settlement: { confirmedCost: 0, unknownUpperBound: 0, updatedAtTick: tick },
        binding: bindingFor({ identity, spawn: {} }), sourceStatus: 'scoped', changed: true };
}

export function fallbackReconTrialSettlement(session, clock) {
    if (legacyTerminal(session)) return preserveLegacy(session);
    if (confirmedHere(session, clock.tick)) {
        return { settlement: copy(session.settlement), binding: copy(session.settlementBinding),
            sourceStatus: 'invalid_evidence', changed: false };
    }
    const spawn = session.spawn || {};
    const unknown = spawn.callState === 'call_started' || spawn.result === 0 || spawn.acceptedAt !== undefined;
    return resultFor(session, unknown ? null : 0, unknown ? 50 : 0, bindingFor(session), 'invalid_evidence', clock);
}

export function reduceReconTrialSettlement(session, evidence, clock) {
    const receiptMatches = receiptValid(session, evidence, clock.tick);
    if (legacyTerminal(session) && !(session.settlement?.unknownUpperBound === 50 && receiptMatches)) {
        return preserveLegacy(session);
    }
    const badEvidence = evidence != null && (!record(evidence) || !sameIdentity(evidence.identity, session.identity) ||
        evidence.requestId !== (session.spawn?.requestId ?? null) || evidence.receipt != null && !receiptMatches);
    const confirmed = confirmedHere(session, clock.tick);
    const badBinding = !bindingValid(session) || session.settlement?.confirmedCost === 50 && !confirmed;
    const conflictingFailure = (confirmed || receiptMatches) && session.spawn?.callState === 'result_known' &&
        session.spawn.result !== 0;
    const sourceStatus = badEvidence || badBinding || conflictingFailure ? 'invalid_evidence' : 'scoped';
    if (confirmed) {
        return { settlement: copy(session.settlement), binding: copy(session.settlementBinding), sourceStatus, changed: false };
    }
    if (receiptMatches) {
        return resultFor(session, 50, 0, bindingFor(session, evidence.receipt.tick),
            conflictingFailure ? 'invalid_evidence' : 'scoped', clock);
    }
    const spawn = session.spawn || {};
    const unknown = spawn.callState === 'call_started' || spawn.result === 0 || spawn.acceptedAt !== undefined;
    return resultFor(session, unknown ? null : 0, unknown ? 50 : 0, bindingFor(session), sourceStatus, clock);
}

export function reconTrialSettlementSourceStatus(session, clock = null) {
    if (legacyTerminal(session)) return 'legacy_unverified';
    const upperTick = clock?.tick ?? session.settlement?.updatedAtTick;
    if (!bindingValid(session) || session.settlementSourceStatus === 'invalid_evidence' ||
        session.settlement?.confirmedCost === 50 && !confirmedHere(session, upperTick)) return 'invalid_evidence';
    return 'scoped';
}
