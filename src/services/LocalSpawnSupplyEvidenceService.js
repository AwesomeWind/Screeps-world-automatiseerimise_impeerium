import BaseService from '../core/BaseService.js';
import {
    LOCAL_SUPPLY_BIRTH_FIELDS, LOCAL_SUPPLY_LIMITS, LOCAL_SUPPLY_ROOM, LOCAL_SUPPLY_SHARD,
    validateLocalSupplyBirth, validateLocalSpawnSupplyRecord, validateLocalSpawnSupplyStore
} from './LocalSpawnSupplyProof.js';

const CAPTURE_CPU = 2;
const CPU_RESERVE = 5;
const MIN_BUCKET = 5000;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeAmount = value => Number.isSafeInteger(value) && value >= 0;
const selected = () => Memory.empire?.control?.policy?.spawnIntake?.localReplacementPilotRoom === LOCAL_SUPPLY_ROOM;

function scope() {
    if (!selected() ||
        Game.shard?.name !== LOCAL_SUPPLY_SHARD || !Number.isSafeInteger(Game.time)) return null;
    const room = Game.rooms?.[LOCAL_SUPPLY_ROOM];
    const version = global.EmpireServicesVersion;
    return room?.controller?.my === true && typeof version === 'string' && version.length > 0 &&
        version.length <= 128 ? {room, version, tick: Game.time} : null;
}

function budget(prior = 0) {
    const cpu = Game.cpu;
    const start = cpu?.getUsed?.();
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(cpu.tickLimit) ||
        !(cpu.bucket >= MIN_BUCKET) || cpu.tickLimit - start < CPU_RESERVE + CAPTURE_CPU - prior) return null;
    return () => {
        const used = cpu.getUsed();
        const elapsed = used - start;
        return Number.isFinite(elapsed) && elapsed >= 0 && prior + elapsed < CAPTURE_CPU &&
            cpu.bucket >= MIN_BUCKET && cpu.tickLimit - used >= CPU_RESERVE ? prior + elapsed : null;
    };
}

function candidateFor(source, tick) {
    if (source?.state !== 'born' || source.roomName !== LOCAL_SUPPLY_ROOM || typeof source.name !== 'string') return null;
    const actor = Game.creeps?.[source.name];
    const memory = actor?.memory;
    const clear = memory?.lastTaskClear;
    const before = clear?.logisticsObservation;
    const reservation = clear?.logisticsReservation;

    if (actor?.my !== true || actor.name !== source.name || actor.spawning !== false ||
        actor.room?.name !== LOCAL_SUPPLY_ROOM || memory?.localSpawnRequestId !== source.requestId ||
        memory?.homeRoom !== LOCAL_SUPPLY_ROOM || memory.role !== source.role || memory.quotaKey !== source.quotaKey ||
        clear?.tick !== tick - 1 || clear.reason !== 'transfer_completed' || clear.result !== OK ||
        clear.taskType !== 'TRANSFER' || before?.tick !== clear.tick ||
        reservation?.side !== 'demand' || reservation.taskType !== 'TRANSFER' ||
        reservation.targetId !== clear.targetId || reservation.resourceType !== RESOURCE_ENERGY ||
        reservation.creepName !== actor.name || reservation.roomName !== LOCAL_SUPPLY_ROOM ||
        !safeAmount(before.ownerAmount) || !safeAmount(before.targetAmount)) return null;

    const spawn = Game.getObjectById(clear.targetId);
    if (spawn?.id !== clear.targetId || spawn?.my !== true || spawn.structureType !== STRUCTURE_SPAWN ||
        spawn.room?.name !== LOCAL_SUPPLY_ROOM || !safeAmount(actor.store?.energy) ||
        !safeAmount(spawn.store?.energy)) return null;

    const birth = Object.fromEntries(LOCAL_SUPPLY_BIRTH_FIELDS.map(field => [field, source[field]]));
    if (!validateLocalSupplyBirth(birth, tick, clear.tick)) return null;
    return {
        birth,
        frame: {
            tick,
            actor: {id: actor.id, role: actor.memory.role, spawning: false, energy: actor.store.energy},
            action: {tick: clear.tick, reason: clear.reason, target: spawn.id, after: spawn.store.energy,
                before: {tick: before.tick, ownerAmount: before.ownerAmount, targetAmount: before.targetAmount}}
        }
    };
}

function transferEvents(events, check) {
    if (!Array.isArray(events) || events.length === 0 || events.length > LOCAL_SUPPLY_LIMITS.nativeEvents) return null;
    const transfers = [];
    for (const event of events) {
        if (check() === null || !Number.isSafeInteger(event?.event) || event.event < 1 ||
            typeof event.objectId !== 'string' || !event.objectId) return null;
        if (event.event !== EVENT_TRANSFER) continue;
        const {targetId, amount, resourceType} = event.data ?? {};
        if (typeof targetId !== 'string' || !targetId || !safeAmount(amount) || amount === 0 ||
            typeof resourceType !== 'string' || !resourceType) return null;
        transfers.push([event.objectId, targetId, amount, resourceType]);
    }
    return transfers;
}

function persist(records, observations, check) {
    if (observations === undefined) {
        if (check() !== null) Memory.empire.observations = {localSpawnSupply: {schemaVersion: 1, records}};
    } else if (check() !== null) {
        observations.localSpawnSupply = {schemaVersion: 1, records};
    }
}

export default class LocalSpawnSupplyEvidenceService extends BaseService {
    init() {
        try {
            if (this.lastTick >= Game.time) return;
            this.lastTick = Game.time;
            this.pending = null;
            if (!selected()) return;
            const check = budget();
            if (!check) return;
            const current = scope();
            const receipts = Memory.empire.localSpawnReceipts;
            if (!current || !record(receipts)) return;

            const candidates = [];
            let inspected = 0;
            for (const requestId in receipts) {
                if (!Object.hasOwn(receipts, requestId)) continue;
                if (++inspected > LOCAL_SUPPLY_LIMITS.receipts || check() === null) return;
                const birth = receipts[requestId];
                if (birth?.requestId !== requestId) continue;
                const candidate = candidateFor(birth, current.tick);
                if (candidate) candidates.push(candidate);
            }
            const elapsed = check();
            if (elapsed !== null && candidates.length) {
                this.pending = {tick: current.tick, version: current.version, elapsed, candidates};
            }
        } catch {
            // Optional evidence cannot interrupt room initialization.
            this.pending = null;
        }
    }

    cleanup() {
        const pending = this.pending;
        this.pending = null;
        if (!pending) return;

        try {
            if (Game.time !== pending.tick || !selected()) return;
            const check = budget(pending.elapsed);
            if (!check) return;
            const current = scope();
            if (!current || current.version !== pending.version) return;
            const observations = Memory.empire.observations;
            if (observations !== undefined && !record(observations)) return;
            const saved = observations?.localSpawnSupply;
            if (saved !== undefined && !validateLocalSpawnSupplyStore(saved)) return;
            const records = saved ? saved.records.slice() : [];
            if (records.length >= LOCAL_SUPPLY_LIMITS.records) return;
            const known = new Set(records.map(row => row.birth.requestId));
            const unrecorded = pending.candidates.filter(row => !known.has(row.birth.requestId));
            if (!unrecorded.length || check() === null) return;

            const events = current.room.getEventLog?.();
            if (check() === null) return;
            const transfers = transferEvents(events, check);
            if (!transfers) return;

            const priorLength = records.length;
            for (const {birth, frame} of unrecorded) {
                if (check() === null || records.length >= LOCAL_SUPPLY_LIMITS.records) break;
                const actor = frame.actor.id;
                const spawn = frame.action.target;
                const touching = transfers.filter(([a, b]) => a === actor || b === actor || a === spawn || b === spawn);
                const row = {schemaVersion: 1, shard: LOCAL_SUPPLY_SHARD, roomName: LOCAL_SUPPLY_ROOM,
                    version: current.version, birth, frame: {...frame, eventCount: events.length, transfers: touching}};
                if (!validateLocalSpawnSupplyRecord(row)) continue;
                records.push(row);
                if (JSON.stringify({schemaVersion: 1, records}).length > LOCAL_SUPPLY_LIMITS.characters) {
                    records.pop();
                    break;
                }
            }
            if (records.length === priorLength) return;
            const finalScope = scope();
            if (!finalScope || finalScope.tick !== pending.tick || finalScope.version !== pending.version ||
                Memory.empire.observations !== observations || observations?.localSpawnSupply !== saved) return;
            persist(records, observations, check);
        } catch {
            // A failed or indeterminate write is never retried for this tick.
        }
    }
}
