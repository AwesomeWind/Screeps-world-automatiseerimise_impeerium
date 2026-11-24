export const LOCAL_SUPPLY_ROOM = 'W49N41';
export const LOCAL_SUPPLY_SHARD = 'shard3';
export const LOCAL_SUPPLY_LIMITS = Object.freeze({
    records: 16, characters: 16384, nativeEvents: 128, receipts: 200
});
export const LOCAL_SUPPLY_BIRTH_FIELDS = Object.freeze([
    'requestId', 'roomName', 'name', 'role', 'quotaKey', 'spawnName', 'cost',
    'state', 'admittedAt', 'expireAt', 'observeUntil', 'bornAt'
]);

const count = value => Number.isSafeInteger(value) && value >= 0;
const id = value => typeof value === 'string' && /^[0-9a-f]{24}$/.test(value);
const name = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const keys = (value, expected) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));

export function verifySpawnSupply(frame) {
    const {actor, action, transfers, eventCount} = frame ?? {};
    if (!count(frame?.tick) || frame.tick < 1 || !id(actor?.id) || actor.spawning !== false ||
        !id(action?.target) || action.tick !== frame.tick - 1 || action.reason !== 'transfer_completed' ||
        action.before?.tick !== action.tick || !count(eventCount) || eventCount < 1 ||
        eventCount > LOCAL_SUPPLY_LIMITS.nativeEvents ||
        !Array.isArray(transfers) || transfers.length !== 1 || !Array.isArray(transfers[0])) return null;
    const [source, target, amount, resource] = transfers[0];
    if (source !== actor.id || target !== action.target || resource !== 'energy' || !count(amount) || amount === 0 ||
        ![actor.energy, action.after, action.before.ownerAmount, action.before.targetAmount].every(count) ||
        action.before.ownerAmount - actor.energy !== amount || action.after - action.before.targetAmount !== amount) return null;
    return {tick: frame.tick, actionTick: action.tick, actorId: actor.id, spawnId: action.target, amount};
}

export function validateLocalSupplyBirth(birth, observationTick, actionTick) {
    if (!keys(birth, LOCAL_SUPPLY_BIRTH_FIELDS) || birth.roomName !== LOCAL_SUPPLY_ROOM ||
        birth.state !== 'born' || !name(birth.name) || !name(birth.spawnName) ||
        !count(birth.cost) || birth.cost === 0 ||
        !['hauler', 'miner'].includes(birth.role) || typeof birth.quotaKey !== 'string' ||
        typeof birth.requestId !== 'string' || birth.requestId.length > 48) return false;

    const identity = /^REQ_SPAWN_(\d+)_\d+$/.exec(birth.requestId);
    const offeredAt = Number(identity?.[1]);
    const quotaPrefix = birth.role + ':' + LOCAL_SUPPLY_ROOM + ':';
    const scope = birth.quotaKey.slice(quotaPrefix.length);
    return count(offeredAt) && birth.quotaKey.startsWith(quotaPrefix) &&
        (birth.role === 'hauler' ? scope === 'core' : id(scope)) &&
        [birth.admittedAt, birth.expireAt, birth.bornAt, birth.observeUntil, observationTick, actionTick].every(count) &&
        birth.expireAt === offeredAt + 1 && offeredAt <= birth.admittedAt &&
        birth.admittedAt <= birth.expireAt && birth.admittedAt <= birth.bornAt &&
        birth.bornAt <= actionTick && actionTick + 1 === observationTick && observationTick <= birth.observeUntil;
}

export function validateLocalSpawnSupplyRecord(record) {
    if (!keys(record, ['schemaVersion', 'shard', 'roomName', 'version', 'birth', 'frame']) ||
        record.schemaVersion !== 1 || record.shard !== LOCAL_SUPPLY_SHARD || record.roomName !== LOCAL_SUPPLY_ROOM ||
        typeof record.version !== 'string' || !record.version.length || record.version.length > 128) return false;

    const {frame, birth} = record;
    if (!keys(frame, ['tick', 'actor', 'action', 'eventCount', 'transfers']) ||
        !keys(frame.actor, ['id', 'role', 'spawning', 'energy']) ||
        !keys(frame.action, ['tick', 'target', 'reason', 'before', 'after']) ||
        !keys(frame.action.before, ['tick', 'ownerAmount', 'targetAmount']) ||
        !validateLocalSupplyBirth(birth, frame.tick, frame.action.tick) ||
        frame.actor.role !== birth.role || frame.actor.id === frame.action.target) return false;
    return verifySpawnSupply(frame) !== null && frame.transfers[0].length === 4;
}

export function validateLocalSpawnSupplyStore(store) {
    if (!keys(store, ['schemaVersion', 'records']) || store.schemaVersion !== 1 ||
        !Array.isArray(store.records) || store.records.length > LOCAL_SUPPLY_LIMITS.records) return false;
    const requests = new Set();
    for (const record of store.records) {
        if (!validateLocalSpawnSupplyRecord(record) || requests.has(record.birth.requestId)) return false;
        requests.add(record.birth.requestId);
    }
    return JSON.stringify(store).length <= LOCAL_SUPPLY_LIMITS.characters;
}
