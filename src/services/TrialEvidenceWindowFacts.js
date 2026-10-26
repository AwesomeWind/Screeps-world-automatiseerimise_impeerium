import { economicIdentityMatches, validEconomicTrialState, summarizeEconomicTrial, economicTrialPermission } from './RemoteEconomicTrialModel.js';
import { EVIDENCE_LIMITS as LIMITS, EVIDENCE_SAFETY_BITS, EVIDENCE_STATE_BITS, EVIDENCE_FLAGS,
    evidenceCopy as copy, evidenceEqual as equal, evidenceInteger as integer } from './TrialEvidenceWindowModel.js';

const ROLES = ['scout', 'remoteMiner', 'remoteHauler'];
const shortText = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const energy = object => integer(object?.store?.energy) ? object.store.energy : null;
const add = (total, amount) => integer(total + amount) ? total + amount : null;
const position = object => {
    const p = object?.pos;
    return integer(p?.x) && p.x <= 49 && integer(p?.y) && p.y <= 49 && shortText(p.roomName)
        ? {x: p.x, y: p.y, roomName: p.roomName} : null;
};
function checkpoint(deps) {
    if (deps.continueCapture && !deps.continueCapture()) {
        const error = new Error('evidence_cpu');
        error.code = 'EVIDENCE_CPU_LIMIT';
        throw error;
    }
}
function bits(values, definitions) {
    let known = 0, value = 0;
    for (const [key, mask] of Object.entries(definitions)) if (typeof values[key] === 'boolean') {
        known |= mask;
        if (values[key]) value |= mask;
    }
    return [known, value];
}

export function readEvidenceBusiness() {
    const empire = global.Memory?.empire;
    return {economicState: empire?.remoteMining?.economicTrials, nativeState: empire?.remoteMining?.nativeEconomicOps,
        policy: empire?.control?.policy, market: empire?.market,
        operations: empire?.remoteMining?.operations, budgets: empire?.remoteMining?.budgets,
        remoteRooms: empire?.remoteRooms};
}
export function collectEvidenceAdmission(profile, clock, deps = {}) {
    const business = (deps.readBusiness || readEvidenceBusiness)();
    return {economicState: business.economicState, nativeState: business.nativeState,
        startRequest: business.policy?.remoteMining?.economicTrial?.request};
}

/** Declaration-shaped events. Numeric observations remain unverified in production. */
export function normalizeEvidenceEvents(events, context) {
    const result = {harvestEnergy: null, sourceDepositEnergy: null, homeTransferEnergy: null,
        foreignInput: false, actorInput: false, complete: true, events: []};
    if (context.eventTick < context.startedAtTick) return result;
    const seen = new Map(), unknownFields = new Set();
    for (const entry of events.slice(0, LIMITS.events)) {
        const item = entry?.item, data = item?.data;
        if (![context.baseRoom, context.targetRoom].includes(entry?.roomName) || !integer(entry.index) ||
            !integer(item?.event) || !shortText(item.objectId) || !data || typeof data !== 'object') {
            result.complete = false; continue;
        }
        const key = entry.roomName + ':' + entry.index;
        if (seen.has(key)) {
            if (!equal(seen.get(key), item)) result.complete = false;
            continue;
        }
        seen.set(key, item);
        if (![5, 12].includes(item.event)) continue;
        const role = ROLES.find(name => context.binding[name]?.id === item.objectId &&
            economicIdentityMatches(context.binding[name].identity, context.identity));
        const actorRecipient = ROLES.some(name => context.binding[name]?.id === data.targetId &&
            economicIdentityMatches(context.binding[name].identity, context.identity));
        let field = null;
        if (item.event === 5 && role === 'remoteMiner' && data.targetId === context.sourceId && entry.roomName === context.targetRoom) field = 'harvestEnergy';
        if (item.event === 12 && role === 'remoteMiner' && data.targetId === context.containerId && entry.roomName === context.targetRoom) field = 'sourceDepositEnergy';
        if (item.event === 12 && role === 'remoteHauler' && data.targetId === context.receiverId && entry.roomName === context.baseRoom) field = 'homeTransferEnergy';
        if (item.event === 12 && [context.containerId, context.receiverId].includes(data.targetId) && !field) result.foreignInput = true;
        if (item.event === 12 && actorRecipient && data.resourceType === 'energy') {
            result.actorInput = true;
            if (!role) result.foreignInput = true;
        }
        if (!shortText(data.targetId) || !integer(data.amount) || data.amount <= 0 ||
            item.event === 12 && data.resourceType !== 'energy') {
            result.complete = false;
            if (field) {unknownFields.add(field); result[field] = null;}
            continue;
        }
        if (field) {
            if (!unknownFields.has(field)) result[field] = add(result[field] ?? 0, data.amount);
            if (result[field] === null) {result.complete = false; unknownFields.add(field);}
            result.events.push({roomName: entry.roomName, index: entry.index, event: item.event,
                objectId: item.objectId, targetId: data.targetId, amount: data.amount, field});
        }
    }
    if (events.length > LIMITS.events) result.complete = false;
    return result;
}

function boundedEntries(table, limit = LIMITS.entries) {
    if (!table || typeof table !== 'object' || Array.isArray(table)) return {known: false, count: null, values: []};
    const values = [];
    for (const key in table) if (Object.hasOwn(table, key)) {
        if (values.length === limit) return {known: false, count: null, values};
        values.push(table[key]);
    }
    return {known: true, count: values.length, values};
}

function ownersForRoom(roomName, deps) {
    const reservations = deps.readReservations ? deps.readReservations(roomName) :
        global.Memory?.rooms?.[roomName]?.resourceMarket?.reservations;
    if (!reservations) return {known: false, count: null};
    let count = 0, entries = 0;
    for (const kind of ['supply', 'demand']) {
        if (!reservations[kind] || typeof reservations[kind] !== 'object') return {known: false, count: null};
        for (const key in reservations[kind]) if (Object.hasOwn(reservations[kind], key)) {
            if (++entries > LIMITS.entries) return {known: false, count: null};
            const group = boundedEntries(reservations[kind][key]?.owners);
            if (!group.known || count + group.count > LIMITS.entries || reservations[kind][key]?.anonymousAmount > 0) return {known: false, count: null};
            count += group.count;
        }
    }
    return {known: true, count};
}

function actorBindings(window, session, clock, deps, milestone) {
    const binding = copy(window.binding), snapshots = {};
    let complete = true;
    for (const role of ROLES) {
        checkpoint(deps);
        const slot = session?.slots?.[role], previous = binding[role];
        if (!slot?.receiptBinding || !economicIdentityMatches(slot.receiptBinding.identity, window.header.identity) ||
            slot.receiptBinding.name !== slot.name || slot.receiptBinding.requestId !== slot.requestId ||
            slot.receiptBinding.tick !== slot.acceptedAt) {
            if (previous) complete = false;
            snapshots[role] = {present: slot?.acceptedAt === undefined ? false : null};
            continue;
        }
        const actor = (deps.readActor || (name => global.Game?.creeps?.[name]))(slot.name);
        if (!actor) {
            snapshots[role] = {present: false, energy: null, pos: null};
            if (previous) binding[role].missingSinceTick ??= clock.tick;
            continue;
        }
        if (!shortText(actor.id) || actor.memory?.role !== role || actor.memory?.economicTrialId !== window.header.identity.trialId ||
            actor.memory?.economicTrialSequence !== window.header.identity.sequence || previous && previous.id !== actor.id) {
            complete = false; snapshots[role] = {present: null}; continue;
        }
        const pos = position(actor), stock = energy(actor);
        const current = {name: slot.name, id: actor.id, role, identity: copy(window.header.identity),
            receipt: {requestId: slot.requestId, acceptedAt: slot.acceptedAt}, pos,
            lastTick: clock.tick, energy: stock, spawning: actor.spawning === true,
            bornAtTick: previous?.bornAtTick ?? null, birthEmpty: previous?.birthEmpty ?? null};
        milestone('accepted_' + role, {name: slot.name, id: actor.id, acceptedAt: slot.acceptedAt});
        if (!actor.spawning && current.bornAtTick === null) {
            current.bornAtTick = clock.tick;
            current.birthEmpty = previous?.spawning === true && previous.lastTick === clock.tick - 1 && stock !== null ? stock === 0 : null;
            milestone('born_' + role, {id: actor.id, pos, empty: current.birthEmpty});
        }
        if (pos && previous?.pos && previous.spawning === false && !actor.spawning && !equal(pos, previous.pos)) milestone('moved_' + role,
            {id: actor.id, fromTick: previous.lastTick, toTick: clock.tick, pos, exact: previous.lastTick === clock.tick - 1});
        if (pos?.roomName === window.header.targetRoom) milestone('entered_' + role, {id: actor.id, pos});
        binding[role] = current;
        snapshots[role] = {present: true, id: actor.id, pos, energy: stock, spawning: current.spawning};
        if (!pos || stock === null) complete = false;
    }
    return {binding, snapshots, complete};
}

function actorResourceFlow(window, binding, normalized, proof, pickupTotal, clock) {
    const result = {};
    for (const role of ROLES) {
        const before = window.binding[role], after = binding[role];
        if (!before || !after || before.spawning || after.spawning) {result[role] = {known: null, reason: 'not_observed_alive_pair'}; continue;}
        if (before.lastTick !== clock.tick - 1 || after.lastTick !== clock.tick || before.id !== after.id ||
            !integer(before.energy) || !integer(after.energy)) {result[role] = {known: false, reason: 'actor_flow_gap'}; continue;}
        let expected = 0;
        if (role === 'remoteMiner') {
            const oldCost = window.capture.latestProof?.settlement?.confirmedInfrastructureCost;
            const cost = proof.settlement?.confirmedInfrastructureCost;
            expected = integer(oldCost) && integer(cost) && cost >= oldCost
                ? (normalized.harvestEnergy ?? 0) - (normalized.sourceDepositEnergy ?? 0) - (cost - oldCost) : null;
        } else if (role === 'remoteHauler') {
            const oldPickups = window.capture.provenance?.lastPickupTotal;
            expected = integer(oldPickups) && integer(pickupTotal) && pickupTotal >= oldPickups
                ? pickupTotal - oldPickups - (normalized.homeTransferEnergy ?? 0) : null;
        }
        const known = expected !== null && after.energy - before.energy === expected;
        result[role] = {known, reason: known ? 'classified_energy_change' : 'unclassified_energy_change'};
    }
    return result;
}

export function collectEvidencePacket(window, clock, deps = {}) {
    checkpoint(deps);
    const business = (deps.readBusiness || readEvidenceBusiness)();
    const session = business.economicState?.current;
    const identityKnown = validEconomicTrialState(business.economicState) && economicIdentityMatches(session?.identity, window.header.identity);
    const active = identityKnown ? session : null;
    const milestones = [];
    const milestone = (type, data) => {
        if (!window.milestones.some(item => item.type === type) && !milestones.some(item => item.type === type)) {
            milestones.push({type, observedTick: clock.tick, eventTick: clock.tick - 1, ...data});
        }
    };
    const actors = actorBindings(window, active, clock, deps, milestone);
    checkpoint(deps);
    const readRoom = deps.readRoom || (name => global.Game?.rooms?.[name]);
    const home = readRoom(window.header.baseRoom), remote = readRoom(window.header.targetRoom);
    const readObject = deps.readObject || (id => global.Game?.getObjectById?.(id));
    const source = remote ? readObject(window.header.sourceId) : null;
    const container = active?.containerId && remote ? readObject(active.containerId) : null;
    const receiver = home ? readObject(window.header.receiverId) : null;
    const hostiles = room => room ? room.find(global.FIND_HOSTILE_CREEPS).length === 0 : null;
    const remoteRelevant = ROLES.some(role => actors.snapshots[role]?.pos?.roomName === window.header.targetRoom ||
        window.binding[role]?.pos?.roomName === window.header.targetRoom);
    const apiEvidence = {methodSupported: false, shapeValid: null,
        semanticsLevel: deps.simulatedNativeEvents === true ? 'simulated' : 'unverified', verificationRef: null};
    let flags = identityKnown && actors.complete ? 0 : EVIDENCE_FLAGS.identity;
    const events = [];
    for (const [roomName, room] of [[window.header.baseRoom, home], [window.header.targetRoom, remote]]) {
        checkpoint(deps);
        if (!room) {
            if (roomName === window.header.baseRoom || remoteRelevant) flags |= EVIDENCE_FLAGS.partial;
            continue;
        }
        try {
            const log = deps.readEvents ? deps.readEvents(room) : room.getEventLog?.();
            checkpoint(deps);
            if (log === undefined) { apiEvidence.methodSupported = false; flags |= EVIDENCE_FLAGS.unsupported; continue; }
            apiEvidence.methodSupported = true;
            if (!Array.isArray(log)) { apiEvidence.shapeValid = false; flags |= EVIDENCE_FLAGS.partial; continue; }
            if (apiEvidence.shapeValid !== false) apiEvidence.shapeValid = true;
            if (log.length > LIMITS.events - events.length) flags |= EVIDENCE_FLAGS.eventOverflow;
            const readCount = Math.min(log.length, LIMITS.events - events.length);
            for (let index = 0; index < readCount; index++) events.push({roomName, index, item: log[index]});
        } catch (error) {
            if (error?.code === 'EVIDENCE_CPU_LIMIT') throw error;
            apiEvidence.shapeValid = false; flags |= EVIDENCE_FLAGS.partial;
        }
    }
    checkpoint(deps);
    const normalized = normalizeEvidenceEvents(events, {eventTick: clock.tick - 1,
        startedAtTick: window.bounds.startedAtTick, binding: actors.binding, identity: window.header.identity,
        sourceId: window.header.sourceId, containerId: active?.containerId,
        receiverId: window.header.receiverId, baseRoom: window.header.baseRoom, targetRoom: window.header.targetRoom});
    if (!normalized.complete) flags |= EVIDENCE_FLAGS.partial;
    checkpoint(deps);
    const grants = boundedEntries(business.budgets?.[window.header.baseRoom]?.grants);
    const infrastructure = boundedEntries(business.budgets?.[window.header.baseRoom]?.infrastructure?.pending);
    const owners = ownersForRoom(window.header.baseRoom, deps);
    if (!grants.known || !owners.known || !infrastructure.known) flags |= EVIDENCE_FLAGS.entryOverflow;
    const policy = business.policy || {}, remotePolicy = policy.remoteMining || {};
    const operation = business.operations?.[window.header.identity.remoteId];
    const raw = business.remoteRooms?.[window.header.targetRoom];
    const scope = deps.readScope ? deps.readScope(window.header.identity.remoteId) : global.RemoteMining?.[window.header.identity.remoteId];
    const settingsClosed = typeof remotePolicy.enabled === 'boolean' && typeof raw?.hold === 'boolean' && typeof raw.enabled === 'boolean'
        ? remotePolicy.enabled === false && raw.enabled === false && raw.hold === true : null;
    const operationClosed = operation?.epoch === window.header.identity.epoch && operation.evaluatedAt === clock.tick &&
        typeof operation.allowRecon === 'boolean' && typeof operation.allowEconomicDeparture === 'boolean'
        ? operation.allowRecon === false && operation.allowEconomicDeparture === false : null;
    const scopeClosed = scope?.operation === operation && operation?.evaluatedAt === clock.tick &&
        typeof scope?.state?.allowRecon === 'boolean' && typeof scope.state.allowEconomicDeparture === 'boolean'
        ? scope.state.allowRecon === false && scope.state.allowEconomicDeparture === false : null;
    const controlClosed = [settingsClosed, operationClosed, scopeClosed].some(value => value === null)
        ? null : settingsClosed && operationClosed && scopeClosed;
    const safety = bits({homeOwned: home ? home.controller?.my === true : null, homeNoHostiles: hostiles(home),
        remoteVisible: !!remote, remoteNoHostiles: hostiles(remote), sourceVisible: remote ? !!source : null,
        noForeignControl: remote?.controller ? !remote.controller.owner && (!remote.controller.reservation ||
            remote.controller.reservation.username === home?.controller?.owner?.username) : null,
        currentScoutRemote: actors.snapshots.scout?.present === true ? actors.snapshots.scout.pos?.roomName === window.header.targetRoom : null}, EVIDENCE_SAFETY_BITS);
    const stateValues = {reconEnabled: remotePolicy.reconTrial?.enabled, economicEnabled: remotePolicy.economicTrial?.enabled,
        goalPlanningEnabled: policy.goalPlanning?.enabled, marketEnabled: business.market?.enabled,
        governorShadow: policy.roomGovernor?.shadow, schedulerEnforce: policy.scheduler?.enforce, controlClosed,
        tailPermission: identityKnown ? ROLES.some(role => active.slots[role].name && economicTrialPermission(business.economicState,
            {...window.header.identity, role, name: active.slots[role].name, action: 'return'}, clock).allowed) : null};
    for (const [index, role] of ROLES.entries()) {
        const label = ['scout', 'miner', 'hauler'][index], actor = actors.snapshots[role];
        stateValues[label + 'Present'] = actor.present;
        stateValues[label + 'Home'] = actor.pos ? actor.pos.roomName === window.header.baseRoom : null;
        stateValues[label + 'Empty'] = actor.energy === undefined || actor.energy === null ? null : actor.energy === 0;
    }
    const state = bits(stateValues, EVIDENCE_STATE_BITS);
    checkpoint(deps);
    const summary = identityKnown ? summarizeEconomicTrial(business.economicState, clock).current : null;
    const proof = {identity: copy(window.header.identity), apiEvidence, status: active?.status ?? null,
        control: {identityKnown, settingsClosed, operationClosed, scopeClosed},
        outcome: copy(active?.outcome ?? null), firstDelivery: copy(active?.firstDelivery ?? null),
        settlement: copy(summary?.settlement ?? null), closeAppliedAtTick: active?.closeAppliedAtTick ?? null,
        closureVerifiedAtTick: active?.closureVerifiedAtTick ?? null, tailExpiresAtTick: active?.tailExpiresAtTick ?? null,
        containerId: active?.containerId ?? null, containerEnergy: energy(container), receiverFree: receiver?.store?.getFreeCapacity('energy') ?? null,
        owners: {known: owners.known, count: owners.count}, grants: {known: grants.known, count: grants.count},
        infrastructure: {known: infrastructure.known, count: infrastructure.count},
        outboxPending: active ? active.outbox.filter(item => item.stage !== 'applied' || item.application?.applied !== true || item.evidenceApplied !== true).length : null,
        pickups: copy(active?.evidence?.pickups ?? null), delivered: copy(active?.evidence?.delivered ?? null),
        visibility: remote ? 'visible' : remoteRelevant ? 'missing' : 'not_required_no_bound_actor'};
    const old = window.capture.provenance;
    const provenance = old ? copy(old) : {openingEnergy: clock.tick === window.bounds.startedAtTick ? energy(container) : null,
        containerId: active?.containerId ?? null, harvest: 0, deposits: 0, foreignInput: false, incomplete: false,
        firstPickupTick: null, tripId: null, lastContainerEnergy: energy(container), lastPickupTotal: 0};
    provenance.incomplete ||= flags !== 0 || window.capture.partial || normalized.actorInput;
    provenance.foreignInput ||= normalized.foreignInput;
    const pickups = proof.pickups ? Object.entries(proof.pickups) : [];
    const pickupTotal = pickups.reduce((total, [, value]) => total === null ? null : add(total, value), 0);
    proof.actorFlow = actorResourceFlow(window, actors.binding, normalized, proof, pickupTotal, clock);
    provenance.incomplete ||= Object.values(proof.actorFlow).some(flow => flow.known === false);
    if (provenance.firstPickupTick === null) {
        provenance.harvest = add(provenance.harvest, normalized.harvestEnergy ?? 0);
        provenance.deposits = add(provenance.deposits, normalized.sourceDepositEnergy ?? 0);
        if (pickupTotal > 0) {
            provenance.firstPickupTick = clock.tick;
            provenance.tripId = pickups.length === 1 ? pickups[0][0].slice(5) : null;
            provenance.incomplete ||= (normalized.sourceDepositEnergy ?? 0) > 0;
        }
    }
    if (old && energy(container) !== null && old.lastContainerEnergy !== null &&
        energy(container) !== old.lastContainerEnergy + (normalized.sourceDepositEnergy ?? 0) - (pickupTotal - old.lastPickupTotal)) provenance.incomplete = true;
    provenance.lastContainerEnergy = energy(container);
    provenance.lastPickupTotal = pickupTotal;
    if (normalized.harvestEnergy !== null) milestone('first_harvest', {eventTick: clock.tick - 1, events: normalized.events.filter(item => item.field === 'harvestEnergy').slice(0, 4)});
    if (active?.firstDelivery) milestone('first_delivery', {firstDelivery: copy(active.firstDelivery)});
    if (active?.outcome) milestone('outcome', {outcome: copy(active.outcome)});
    const snapshot = (clock.tick - window.bounds.startedAtTick) % LIMITS.snapshotInterval === 0 || milestones.length
        ? {observedTick: clock.tick, actors: actors.snapshots, proof: copy(proof), events: normalized.events.slice(0, 8)} : null;
    return {windowId: window.header.id, observedTick: clock.tick, eventTick: clock.tick - 1,
        observedAtMs: clock.nowMs, codeVersion: clock.codeVersion,
        row: [clock.tick, clock.nowMs, ...safety, active?.safeStreak ?? null,
            normalized.harvestEnergy, normalized.sourceDepositEnergy, normalized.homeTransferEnergy, ...state, flags],
        binding: actors.binding, snapshot, milestones, proof, provenance, coverage: {complete: flags === 0}};
}
