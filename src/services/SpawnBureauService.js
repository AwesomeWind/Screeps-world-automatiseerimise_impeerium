import BaseService from '../core/BaseService.js';
import { currentCreepPopulation, activeBodyPartCount } from '../core/CreepPopulation.js';
import { recoveryRestricted, controllerEmergency, essentialConstruction } from './RoomRecoveryPolicy.js';
import EventBus from '../core/EventBus.js';
import BodyBuilder from '../core/BodyBuilder.js';
import { resolveCapabilityMode, validateCapabilityControlPolicy } from '../config/EmpirePolicy.js';
import { recordEmpireEvent } from '../core/EmpireEventLog.js';
import { arbitrateUpgradeWork, advanceUpgradeWorkControl } from '../governance/SpawnCapabilityArbiter.js';
import { evaluateCapabilityReadiness } from '../governance/CapabilityRolloutReadiness.js';
import { getSourceOutputPolicy } from '../planning/CityAssetPolicy.js';
import { getControllerContainerAsset } from '../planning/CityPlanLegacyAdapter.js';
import { shouldUseStrictSourceRuntime } from '../planning/RuntimeReadiness.js';

class SpawnBureauService extends BaseService {
    analyze() {
        global.SpawnBureau = {};
        if (!global.SpawnDemands) global.SpawnDemands = {};

        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (room.controller && room.controller.my === false) continue;

            const state = {
                intents: [],
                blockedDemands: [],
                counts: {}
            };
            global.SpawnBureau[roomName] = state;

            this.addEconomicIntents(room, state);
            this.addDemandIntents(room, state);

            state.legacyIntents = state.intents.map((intent) => ({
                ...intent,
                body: [...intent.body],
                memory: { ...intent.memory }
            }));
            state.legacyIntents.sort((a, b) => b.priority - a.priority);
            if (room.controller && room.controller.my === true) {
                this.applyUpgradeWorkArbitration(room, state);
            }

            state.intents.sort((a, b) => b.priority - a.priority);
            for (const intent of state.intents) {
                EventBus.publish('REQ_SPAWN', intent.priority, {
                    roomName: intent.roomName,
                    role: intent.role,
                    body: intent.body,
                    memory: intent.memory
                }, intent.expireIn || 1);
            }
        }
    }

    addEconomicIntents(room, state) {
        this.addMinerIntents(room, state);
        this.addHaulerIntent(room, state);
        this.addUpgraderIntent(room, state);
        this.addBuilderIntent(room, state);
        this.addRepairerIntent(room, state);
    }

    addMinerIntents(room, state) {
        const cache = global.RoomCache && global.RoomCache[room.name];
        const sources = cache && cache.sources ? cache.sources : [];
        if (this.shouldWaitForBootstrapHauler(room)) return;
        const recoveryMode = this.isMinerRecoveryMode(room, state);

        for (const sourceId of sources) {
            const source = Game.getObjectById(sourceId);
            if (!source) continue;
            const unknownPending = currentCreepPopulation().some((entry) =>
                entry.roomName === room.name && entry.memory.role === 'miner' && entry.memory.sourceId === sourceId &&
                entry.state === 'spawning' && !entry.bodyKnown);
            if (unknownPending) continue;
            const openPositions = this.getOpenMiningPositions(room, source);
            if (openPositions.length === 0) continue;

            const quotaKey = `miner:${room.name}:${sourceId}`;
            if (this.countQuota(room.name, quotaKey, state) >= openPositions.length) continue;
            if (this.countSourceWorkParts(room.name, sourceId, state) >= 5) continue;

            this.addIntent(room, state, {
                role: 'miner',
                quotaKey,
                priority: recoveryMode ? 120 : (this.countRole(room.name, 'miner', state) === 0 ? 90 : 80),
                bodyProfile: recoveryMode ? 'emergency_miner' : this.minerBodyProfile(room.name, sourceId),
                energyCapacity: recoveryMode ? room.energyAvailable : undefined,
                memory: { role: 'miner', homeRoom: room.name, sourceId },
                reason: recoveryMode ? 'miner_recovery' : 'source_uncovered'
            });
        }
    }

    addHaulerIntent(room, state) {
        const desired = room.storage ? 3 : ((room.energyCapacityAvailable || 0) <= 300 ? 1 : 2);
        const current = this.countRole(room.name, 'hauler', state);
        if (current >= desired) return;

        this.addIntent(room, state, {
            role: 'hauler',
            quotaKey: `hauler:${room.name}:core`,
            priority: current === 0 ? 90 : 45,
            bodyProfile: current === 0 ? 'emergency_hauler' : 'hauler',
            energyCapacity: current === 0 ? room.energyAvailable : undefined,
            memory: { role: 'hauler', homeRoom: room.name },
            reason: current === 0 ? 'emergency_energy_logistics' : 'hauler_capacity'
        });
    }

    addUpgraderIntent(room, state) {
        const emergency = controllerEmergency(room);
        if (recoveryRestricted(room.name) && !emergency) return;
        if (!emergency && (this.countRole(room.name, 'miner', state) === 0 || this.countRole(room.name, 'hauler', state) === 0)) return;
        const desired = this.desiredUpgraders(room);
        const current = this.countRole(room.name, 'upgrader', state);
        if (current >= desired) return;

        this.addIntent(room, state, {
            role: 'upgrader',
            quotaKey: `upgrader:${room.name}:controller`,
            priority: current === 0 ? 60 : 35,
            bodyProfile: this.upgraderBodyProfile(room),
            energyCapacity: emergency ? room.energyAvailable : undefined,
            memory: { role: 'upgrader', homeRoom: room.name },
            reason: 'controller_progress'
        });
    }

    addBuilderIntent(room, state) {
        const sites = room.find ? room.find(FIND_CONSTRUCTION_SITES) : [];
        if (sites.length === 0) return;
        const limited = recoveryRestricted(room.name);
        const essentialBuild = limited && sites.some(site => essentialConstruction(room, site));
        if (limited && !essentialBuild) return;
        if (!essentialBuild && (this.countRole(room.name, 'miner', state) === 0 ||
            this.countRole(room.name, 'hauler', state) === 0 ||
            this.countRole(room.name, 'upgrader', state) === 0)) {
            return;
        }

        const current = this.countRole(room.name, 'builder', state);
        if (current >= (essentialBuild ? 1 : 2)) return;

        this.addIntent(room, state, {
            role: 'builder',
            quotaKey: `builder:${room.name}:construction`,
            priority: current === 0 ? 55 : 30,
            bodyProfile: this.builderBodyProfile(room),
            energyCapacity: essentialBuild ? room.energyAvailable : undefined,
            memory: { role: 'builder', homeRoom: room.name },
            reason: essentialBuild ? 'core_construction_recovery' : 'construction'
        });
    }

    addRepairerIntent(room, state) {
        const maintenanceDemand = this.maintenanceDemand(room);
        if (maintenanceDemand.totalTargets <= 0) return;
        const limited = recoveryRestricted(room.name);
        const essentialRepair = limited && maintenanceDemand.urgentTargets > 0;
        if (limited && !essentialRepair) return;
        if (!essentialRepair && (this.countRole(room.name, 'miner', state) === 0 ||
            this.countRole(room.name, 'hauler', state) === 0 ||
            this.countRole(room.name, 'upgrader', state) === 0)) {
            return;
        }

        const maintenanceWorkers = this.countRole(room.name, 'repairer', state);
        if (maintenanceWorkers === 0) {
            this.addIntent(room, state, {
                role: 'repairer',
                quotaKey: `repairer:${room.name}:maintenance`,
                priority: maintenanceDemand.urgentTargets > 0 ? 58 : 44,
                bodyProfile: 'repairer',
                energyCapacity: essentialRepair ? room.energyAvailable : undefined,
                memory: { role: 'repairer', homeRoom: room.name },
                reason: 'maintenance_coverage'
            });
            return;
        }

        const backlog = essentialRepair ? maintenanceDemand.urgentBacklog : maintenanceDemand.backlog;
        if (backlog <= 0) return;

        const desired = Math.min(2, Math.ceil(backlog / 3));
        const current = this.countRole(room.name, 'repairer', state);
        if (current >= desired) return;

        this.addIntent(room, state, {
            role: 'repairer',
            quotaKey: `repairer:${room.name}:maintenance`,
            priority: backlog >= 3 ? 52 : 42,
            bodyProfile: 'repairer',
            energyCapacity: essentialRepair ? room.energyAvailable : undefined,
            memory: { role: 'repairer', homeRoom: room.name },
            reason: 'maintenance_backlog'
        });
    }

    addDemandIntents(room, state) {
        const demands = global.SpawnDemands && global.SpawnDemands[room.name] ? global.SpawnDemands[room.name] : [];
        for (const demand of demands) {
            const quotaKey = demand.quotaKey || `${demand.role}:${room.name}:demand`;
            const maxCount = demand.maxCount || demand.minCount || 1;
            if (this.countQuota(room.name, quotaKey, state) >= maxCount) continue;

            this.addIntent(room, state, {
                role: demand.role,
                quotaKey,
                priority: demand.priority || 50,
                bodyProfile: demand.bodyProfile || demand.role,
                memory: demand.memory || { role: demand.role, homeRoom: room.name },
                reason: demand.reason || 'demand'
            });
        }
    }

    addIntent(room, state, intent) {
        if (state.intents.some((planned) => planned.quotaKey === intent.quotaKey)) return;

        const builtIntent = this.buildIntent(room, state, intent);
        if (builtIntent) state.intents.push(builtIntent);
    }

    buildIntent(room, state, intent) {
        const roomPhase = this.roomPhase(room);
        const bodySpec = BodyBuilder.build(intent.role, room, {
            phase: roomPhase.phase,
            bodyProfile: intent.bodyProfile,
            energyCapacity: intent.energyCapacity !== undefined
                ? intent.energyCapacity
                : (room.energyCapacityAvailable || room.energyAvailable || 0)
        });
        if (!bodySpec.body || bodySpec.body.length === 0) {
            if (!state.blockedDemands.some((blocked) => blocked.quotaKey === intent.quotaKey)) {
                state.blockedDemands.push({
                    role: intent.role,
                    quotaKey: intent.quotaKey,
                    reason: 'no_valid_body'
                });
            }
            return null;
        }

        return {
            roomName: room.name,
            role: intent.role,
            quotaKey: intent.quotaKey,
            priority: intent.priority,
            bodyProfile: intent.bodyProfile,
            body: bodySpec.body,
            memory: Object.assign({ quotaKey: intent.quotaKey }, intent.memory),
            reason: intent.reason
        };
    }

    applyUpgradeWorkArbitration(room, state) {
        const mode = resolveCapabilityMode(room.name, 'upgradeWork');
        const requestedMode = mode && mode.value;
        const snapshot = global.RoomGovernor && global.RoomGovernor[room.name];
        const control = typeof Memory !== 'undefined' && Memory.empire && Memory.empire.control;
        const capabilityControl = control && control.policy && control.policy.capabilityControl;
        const existingRoomControl = control && control.rooms && control.rooms[room.name];
        const previousControl = existingRoomControl && existingRoomControl.capabilityControl &&
            existingRoomControl.capabilityControl.upgradeWork;
        const readinessRollout = existingRoomControl && existingRoomControl.capabilityRollout &&
            existingRoomControl.capabilityRollout.upgradeWork;
        const upgradeRecommendation = snapshot && Array.isArray(snapshot.spawnRecommendations)
            ? snapshot.spawnRecommendations.find((recommendation) => recommendation.capability === 'upgradeWork')
            : null;
        const currentControllerTicks = room.controller && room.controller.ticksToDowngrade;
        const controllerEmergencyKnown = snapshot && Number.isFinite(snapshot.controllerTicksToDowngrade) && snapshot.controllerTicksToDowngrade >= 0 &&
            Number.isFinite(currentControllerTicks) && currentControllerTicks >= 0 &&
            capabilityControl && Number.isFinite(capabilityControl.controllerEmergencyTicks);
        const controllerEmergency = controllerEmergencyKnown &&
            currentControllerTicks < capabilityControl.controllerEmergencyTicks;
        const upgradeCapability = snapshot && snapshot.capabilities && snapshot.capabilities.upgradeWork;
        const upgradeBudget = snapshot && snapshot.budgets && snapshot.budgets.upgrade;
        const gap = upgradeCapability && upgradeCapability.gap;
        const current = upgradeCapability && upgradeCapability.current;
        const spawning = upgradeCapability && upgradeCapability.spawning;
        const budgetBlocked = upgradeBudget && typeof upgradeBudget.blocked === 'boolean'
            ? upgradeBudget.blocked
            : undefined;
        const quotaKey = `upgrader:${room.name}:controller`;
        const liveControllerQuotaCovered = this.countQuota(room.name, quotaKey) > 0;
        const replayingOlderGovernorSnapshot = snapshot && Number.isFinite(snapshot.evaluatedAt) &&
            snapshot.evaluatedAt < Game.time;
        const fulfilledOlderPositiveGap = replayingOlderGovernorSnapshot && liveControllerQuotaCovered &&
            Number.isFinite(gap) && gap > 0;
        const effectiveGap = fulfilledOlderPositiveGap ? 0 : gap;
        const fulfillmentReasons = fulfilledOlderPositiveGap
            ? ['controller_quota_already_covered']
            : [];
        const emergencyCandidateRequired = !liveControllerQuotaCovered && controllerEmergency && Number.isFinite(current) &&
            Number.isFinite(spawning) && current + spawning === 0;
        const hasGovernorReplacement = Number.isFinite(effectiveGap) && effectiveGap > 0 && upgradeRecommendation &&
            Number.isFinite(upgradeRecommendation.priority);
        const shouldBuildGovernorCandidate = requestedMode === 'active' &&
            (hasGovernorReplacement || emergencyCandidateRequired);
        const candidatePriority = shouldBuildGovernorCandidate
            ? hasGovernorReplacement ? upgradeRecommendation.priority : 60
            : 0;
        const governorCandidate = shouldBuildGovernorCandidate
            ? this.buildIntent(room, state, {
                role: 'upgrader',
                quotaKey,
                priority: candidatePriority,
                bodyProfile: this.upgraderBodyProfile(room),
                memory: { role: 'upgrader', homeRoom: room.name },
                reason: 'controller_progress'
            })
            : null;
        const health = snapshot && snapshot.health;
        const coreHealth = health && [health.survival, health.harvest, health.logistics];
        const readinessPolicy = capabilityControl && capabilityControl.readiness;
        const configurationBlockers = [
            ...validateCapabilityControlPolicy(capabilityControl),
            ...((mode && Array.isArray(mode.blockers)) ? mode.blockers : [])
        ];
        const evaluatedReadiness = evaluateCapabilityReadiness(readinessRollout, {
            lifecycle: snapshot && snapshot.lifecycle,
            staleFor: snapshot && snapshot.staleFor
        }, readinessPolicy, Game.time);
        const readiness = configurationBlockers.length > 0
            ? { ready: false, blockers: [...configurationBlockers, ...evaluatedReadiness.blockers] }
            : evaluatedReadiness;
        const rearmRequested = previousControl && previousControl.autoSuspended === true &&
            previousControl.requestedMode === 'shadow' && requestedMode === 'active';
        const safety = {
            emergencyDisable: configurationBlockers.length === 0 && capabilityControl &&
                (capabilityControl.enabled === false || capabilityControl.emergencyDisable === true),
            snapshotPresent: !!snapshot && controllerEmergencyKnown,
            snapshotFresh: !!snapshot && Number.isFinite(snapshot.staleFor) && readinessPolicy &&
                Number.isFinite(readinessPolicy.maxSnapshotAge) && snapshot.staleFor <= readinessPolicy.maxSnapshotAge,
            coreHealthy: Array.isArray(coreHealth) && coreHealth.every((entry) => entry &&
                ['healthy', 'strained'].includes(entry.status)),
            lifecycleEligible: !!snapshot && ['self_sufficient', 'developing', 'mature', 'industrial'].includes(snapshot.lifecycle),
            cpuMode: control && control.runtime ? control.runtime.cpuMode : undefined,
            controllerEmergency,
            autoSuspended: !!(previousControl && previousControl.autoSuspended === true && !rearmRequested)
        };
        const governorDecision = {
            gap: effectiveGap,
            budgetBlocked,
            priority: candidatePriority,
            current,
            spawning,
            reasons: [
                ...((upgradeRecommendation && Array.isArray(upgradeRecommendation.reasons))
                    ? upgradeRecommendation.reasons
                    : []),
                ...fulfillmentReasons
            ]
        };
        const arbitration = arbitrateUpgradeWork({
            roomName: room.name,
            legacyIntents: state.legacyIntents,
            governorCandidate,
            governorDecision,
            readiness,
            safety,
            requestedMode
        });
        const decision = requestedMode === 'shadow' && configurationBlockers.length > 0
            ? {
                ...arbitration,
                reasons: [...arbitration.reasons, ...configurationBlockers]
            }
            : arbitration;
        const nextControl = advanceUpgradeWorkControl({
            previous: previousControl,
            requestedMode,
            decision,
            fallbackSuspendCount: capabilityControl && capabilityControl.fallbackSuspendCount,
            tick: Game.time
        });
        const {
            rearmed: _rearmed,
            transitionEvents: _transitionEvents,
            ...persistedControl
        } = nextControl;
        if (control && control.rooms) {
            control.rooms[room.name] = {
                ...(existingRoomControl || {}),
                capabilityControl: {
                    ...((existingRoomControl && existingRoomControl.capabilityControl) || {}),
                    upgradeWork: persistedControl
                }
            };
        }
        this.recordUpgradeWorkControlEvents(room.name, previousControl, nextControl);
        state.intents = decision.intents;
        state.arbitration = {
            ...(state.arbitration || {}),
            upgradeWork: {
                ...decision,
                mode,
                control: nextControl
            }
        };
    }

    recordUpgradeWorkControlEvents(roomName, previous, next) {
        const eventData = {
            roomName,
            capability: 'upgradeWork',
            requestedMode: next.requestedMode,
            effectiveMode: next.effectiveMode,
            reasons: [...next.reasons]
        };
        const wasFallback = previous && previous.action === 'fallback';
        if (next.action === 'fallback' && (!wasFallback || previous.fallbackReason !== next.fallbackReason)) {
            recordEmpireEvent('capability_control_fallback', 'warning', eventData);
        }
        for (const transition of next.transitionEvents) {
            if (transition.type === 'upgrade_work_auto_suspended') {
                recordEmpireEvent('capability_control_suspended', 'warning', eventData);
            }
            if (transition.type === 'upgrade_work_rearmed') {
                recordEmpireEvent('capability_control_rearmed', 'info', eventData);
            }
        }
        const wasGovernorActive = previous && previous.effectiveMode === 'active' && previous.adoptedSource === 'governor';
        if (next.effectiveMode === 'active' && next.adoptedSource === 'governor' && !wasGovernorActive) {
            recordEmpireEvent('capability_control_activated', 'info', eventData);
        }
    }

    upgraderBodyProfile(room) {
        if (this.hasPlannedControllerContainer(room.name) || this.hasControllerContainer(room)) {
            return 'stationary_upgrader';
        }
        return 'upgrader';
    }

    desiredUpgraders(room) {
        if (!room) return 1;
        if (this.hasPlannedControllerContainer(room.name) || this.hasControllerContainer(room)) {
            return 1;
        }
        return room.storage ? 2 : 1;
    }

    minerBodyProfile(roomName, sourceId) {
        const roomMemory = typeof Memory !== 'undefined' &&
            Memory.rooms &&
            Memory.rooms[roomName] &&
            Memory.rooms[roomName];
        const cityPlan = roomMemory && roomMemory.cityPlan;
        const strictRuntimePolicy = shouldUseStrictSourceRuntime(roomMemory);
        return getSourceOutputPolicy(cityPlan, sourceId, {
            sourceRuntimeAllowLegacyFallback: !strictRuntimePolicy
        }).bodyProfile;
    }

    hasPlannedControllerContainer(roomName) {
        const cityPlan = typeof Memory !== 'undefined' &&
            Memory.rooms &&
            Memory.rooms[roomName] &&
            Memory.rooms[roomName].cityPlan;
        const controllerContainerAsset = getControllerContainerAsset(cityPlan, { allowLegacyFallback: false });
        return !!(controllerContainerAsset && controllerContainerAsset.pos);
    }

    hasControllerContainer(room) {
        if (!room || !room.controller || !room.controller.pos || !room.find) return false;
        const containers = room.find(FIND_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_CONTAINER
        });
        for (const container of containers) {
            if (!container.pos) continue;
            const range = container.pos.getRangeTo ?
                container.pos.getRangeTo(room.controller.pos) :
                Math.max(Math.abs(container.pos.x - room.controller.pos.x), Math.abs(container.pos.y - room.controller.pos.y));
            if (range <= 3) return true;
        }
        return false;
    }
    builderBodyProfile(room) {
        const roomPhase = this.roomPhase(room);
        if (roomPhase.hasStorage || roomPhase.phase === 'storage' || roomPhase.phase === 'terminal' || roomPhase.phase === 'empire') {
            return 'supplied_builder';
        }
        return 'mobile_builder';
    }

    roomPhase(room) {
        const phase = global.RoomPhase && global.RoomPhase[room.name];
        if (phase) return phase;
        return {
            phase: room.storage ? 'storage' : 'early',
            hasStorage: !!room.storage,
            hasTerminal: !!room.terminal
        };
    }

    maintenanceDemand(room) {
        const plan = typeof Memory !== 'undefined' &&
            Memory.rooms &&
            Memory.rooms[room.name] &&
            Memory.rooms[room.name].maintenancePlan;
        if (!plan || !plan.targets) {
            return {
                totalTargets: 0,
                urgentTargets: 0,
                backlog: 0
            };
        }

        const quotas = plan.quotas || {};
        const allowed = {
            urgent: quotas.urgent === undefined ? 0 : quotas.urgent,
            routine: quotas.routine === undefined ? 0 : quotas.routine,
            longTerm: quotas.longTerm === undefined ? 0 : quotas.longTerm
        };
        const counts = { urgent: 0, routine: 0, longTerm: 0 };
        let totalTargets = 0;

        for (const target of plan.targets) {
            if (target.executor !== 'repairer') continue;
            const urgency = this.urgencyFor(target);
            counts[urgency]++;
            totalTargets++;
        }

        return {
            totalTargets,
            urgentTargets: counts.urgent,
            urgentBacklog: Math.max(0, counts.urgent - allowed.urgent),
            backlog: Math.max(0, counts.urgent - allowed.urgent) +
                Math.max(0, counts.routine - allowed.routine) +
                Math.max(0, counts.longTerm - allowed.longTerm)
        };
    }

    urgencyFor(target) {
        if (target.urgency === 'urgent' || target.urgency === 'longTerm') return target.urgency;
        return 'routine';
    }

    shouldWaitForBootstrapHauler(room) {
        if (!room || room.storage) return false;
        if ((room.energyCapacityAvailable || 0) > 300) return false;
        if (this.countRole(room.name, 'miner') === 0) return false;
        return this.countRole(room.name, 'hauler') === 0 &&
            this.countRole(room.name, 'upgrader') === 0 &&
            this.countRole(room.name, 'builder') === 0;
    }

    isMinerRecoveryMode(room, state) {
        if (!room || this.countRole(room.name, 'miner', state) > 0) return false;
        return (room.energyAvailable || 0) >= BODYPART_COST[WORK] + BODYPART_COST[MOVE];
    }

    countRole(roomName, role, state) {
        let count = currentCreepPopulation().filter((entry) => entry.coversQuota &&
            entry.roomName === roomName && entry.memory.role === role).length;
        if (state) {
            count += state.intents.filter((intent) => intent.role === role).length;
        }
        return count;
    }

    countQuota(roomName, quotaKey, state) {
        let count = currentCreepPopulation().filter((entry) => entry.coversQuota && entry.roomName === roomName &&
            this.quotaKeyForMemory(entry.memory, roomName) === quotaKey).length;
        if (state) count += state.intents.filter((intent) => intent.quotaKey === quotaKey).length;
        return count;
    }

    countSourceWorkParts(roomName, sourceId, state) {
        let workParts = 0;
        for (const entry of currentCreepPopulation()) {
            if (entry.coversQuota && entry.roomName === roomName && entry.memory.role === 'miner' && entry.memory.sourceId === sourceId) {
                workParts += activeBodyPartCount(entry.body, WORK);
            }
        }
        if (state) {
            for (const intent of state.intents) {
                if (intent.role === 'miner' && intent.memory.sourceId === sourceId) {
                    workParts += this.countBodyParts(intent.body, WORK);
                }
            }
        }
        return workParts;
    }

    countBodyParts(body, partType) {
        return activeBodyPartCount(body, partType);
    }

    quotaKeyForMemory(memory, fallbackRoomName) {
        const roomName = memory.homeRoom || memory.targetRoom || fallbackRoomName;
        if (memory.quotaKey) return memory.quotaKey;
        if (memory.role === 'miner' && memory.sourceId) return `miner:${roomName}:${memory.sourceId}`;
        if (memory.role === 'hauler') return `hauler:${roomName}:core`;
        if (memory.role === 'upgrader') return `upgrader:${roomName}:controller`;
        if (memory.role === 'builder') return `builder:${roomName}:construction`;
        if (memory.role === 'repairer') return `repairer:${roomName}:maintenance`;
        if (memory.role === 'defender') return `defender:${roomName}:local`;
        return null;
    }

    getOpenMiningPositions(room, source) {
        const terrain = Game.map && Game.map.getRoomTerrain ? Game.map.getRoomTerrain(room.name) : null;
        const blockers = this.getPositionBlockers(room);
        const positions = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const x = source.pos.x + dx;
                const y = source.pos.y + dy;
                if (x <= 0 || x >= 49 || y <= 0 || y >= 49) continue;
                if (terrain && terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                if (blockers[`${x},${y}`]) continue;
                positions.push({ x, y, roomName: room.name });
            }
        }
        return positions;
    }

    getPositionBlockers(room) {
        const blockers = {};
        const structures = room.find ? room.find(FIND_STRUCTURES) : [];
        for (const structure of structures) {
            if (structure.structureType === STRUCTURE_ROAD ||
                structure.structureType === STRUCTURE_CONTAINER ||
                structure.structureType === STRUCTURE_RAMPART) {
                continue;
            }
            blockers[`${structure.pos.x},${structure.pos.y}`] = true;
        }
        return blockers;
    }
}

export default SpawnBureauService;
