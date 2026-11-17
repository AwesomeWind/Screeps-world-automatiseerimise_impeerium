// P1.4 reads one fixed home through the existing low-frequency room metrics.
const HOME_ROOM = 'W49N41';
const HOME_SHARD = 'shard3';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const boolean = value => typeof value === 'boolean';

function permissionsFor(control, tick) {
    const empire = Memory.empire;
    const operations = empire.remoteMining?.operations;
    const scopes = global.RemoteMining;
    const configs = empire.remoteRooms;
    if (!record(operations) || !record(scopes) || !record(configs) ||
        Object.keys(scopes).length !== Object.keys(operations).length) return null;

    let reconDeparture = false;
    let economicDeparture = false;
    for (const [id, operation] of Object.entries(operations)) {
        const scope = scopes[id];
        if (!record(operation) || scope?.operation !== operation || operation.evaluatedAt !== tick ||
            !boolean(operation.allowRecon) || !boolean(operation.allowEconomicDeparture) ||
            !boolean(scope.state?.allowRecon) || !boolean(scope.state?.allowEconomicDeparture)) return null;
        reconDeparture ||= operation.allowRecon || scope.state.allowRecon;
        economicDeparture ||= operation.allowEconomicDeparture || scope.state.allowEconomicDeparture;
    }

    const policy = control.policy;
    const remote = policy.remoteMining;
    const roomConfigs = Object.values(configs);
    if (!boolean(remote?.enabled) || roomConfigs.some(config => !boolean(config?.enabled))) return null;
    const permissions = {
        localPilot: policy.spawnIntake?.localReplacementPilotRoom != null,
        remoteMining: remote.enabled || roomConfigs.some(config => config.enabled),
        reconDeparture,
        economicDeparture,
        nativeTrial: remote.nativeTrialOps?.enabled,
        homeEvidence: policy.homeEvidence?.enabled,
        trialEvidence: remote.evidenceWindow?.enabled,
        goalPlanning: policy.goalPlanning?.enabled,
        market: empire.market?.enabled,
        schedulerEnforce: policy.scheduler?.enforce,
        governorShadow: policy.roomGovernor?.shadow
    };
    return Object.values(permissions).every(boolean) ? permissions : null;
}

function spawnStates() {
    if (!record(Game.spawns)) return null;
    const acceptedHere = new Set();
    for (const spawn of Object.values(Memory.empire.spawningCreeps || {})) {
        if (spawn?.acceptedAt === Game.time && spawn.spawnRoom === HOME_ROOM) {
            if (typeof spawn.spawnName !== 'string' || Game.spawns[spawn.spawnName]?.room?.name !== HOME_ROOM)
                return null;
            acceptedHere.add(spawn.spawnName);
        }
    }
    const spawns = [];
    for (const [name, spawn] of Object.entries(Game.spawns)) {
        if (spawn.room?.name !== HOME_ROOM) continue;
        const engine = spawn.spawning;
        if (!name.length || name.length > 100 || spawns.length >= 16 ||
            typeof spawn.isActive !== 'function' || (engine !== null && !record(engine))) return null;
        const active = spawn.isActive();
        if (!boolean(active)) return null;
        // An accepted intent occupies the Spawn even before the native countdown is visible.
        spawns.push({ name, active, busy: engine !== null || acceptedHere.has(name),
            remaining: count(engine?.remainingTime) ? engine.remainingTime : null });
    }
    return spawns;
}

export function stageHomePreflight(control, room, row) {
    if (room.name !== HOME_ROOM || Game.shard?.name !== HOME_SHARD) return;
    const state = global.EmpireTelemetry;
    const tick = Game.time;
    const phases = state?.services;
    const completed = (service, phase) => Object.hasOwn(phases?.[service] || {}, phase);
    if (!state?.enabled || state.tick !== tick || row.capturedAt !== tick ||
        typeof row.codeVersion !== 'string' || !row.codeVersion ||
        !completed('WarIntel', 'analyze') || !completed('RoomPhase', 'analyze') ||
        !completed('RemoteMining', 'analyze') || !completed('Spawn', 'run') ||
        !completed('Spawn', 'cleanup')) return;

    const recovery = row.recovery;
    const hostiles = global.WarIntel?.[room.name]?.hostiles;
    const controllerEmergencyTicks = control.policy.capabilityControl?.controllerEmergencyTicks;
    const receipts = Memory.empire.localSpawnReceipts;
    if (recovery?.evaluatedAt !== tick || typeof recovery.mode !== 'string' ||
        !['miner', 'hauler'].every(role => count(recovery.coreUsable?.[role]) && count(recovery.coreUpcoming?.[role])) ||
        !Array.isArray(hostiles) || !count(controllerEmergencyTicks) ||
        !count(room.energyAvailable) || !count(room.controller?.ticksToDowngrade) ||
        room.controller?.my !== true || (receipts !== undefined && receipts !== null && !record(receipts))) return;

    try {
        const permissions = permissionsFor(control, tick);
        const spawns = spawnStates();
        if (!permissions || !spawns) return;
        state.pendingHomePreflight = { roomName: room.name, row, snapshot: {
            schemaVersion: 1,
            capturedAt: tick,
            roomVisible: true,
            controllerOwned: true,
            controllerEmergencyTicks,
            hostiles: hostiles.length,
            localReceiptCount: Object.keys(receipts || {}).length,
            spawns,
            permissions
        } };
    } catch {
        // A failed diagnostic read leaves the last successful sample at its original tick.
    }
}
