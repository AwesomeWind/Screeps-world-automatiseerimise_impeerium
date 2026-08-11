const assert = require('assert');

async function run() {
    global.Game = { time: 100 };
    global.Memory = {
        empire: {
            control: {
                policy: {},
                rooms: {
                    W1N1: { marker: 'preserve' }
                }
            }
        }
    };

    const {
        DEFAULT_EMPIRE_POLICY,
        ensureEmpireControl,
        resolveCapabilityMode
    } = await import('../config/EmpirePolicy.js');

    assert.ok(DEFAULT_EMPIRE_POLICY.roomGovernor, 'room governor policy defaults should exist');
    assert.strictEqual(DEFAULT_EMPIRE_POLICY.roomGovernor.shadow, true, 'room governor should default to shadow mode');
    assert.strictEqual(DEFAULT_EMPIRE_POLICY.roomGovernor.thresholds.sourceWorkPerSource, 5, 'room governor should expose initial capability thresholds through policy');
    assert.strictEqual(DEFAULT_EMPIRE_POLICY.capabilityControl.capabilities.upgradeWork.defaultMode, 'shadow', 'upgrade work should default to shadow mode');
    assert.strictEqual(DEFAULT_EMPIRE_POLICY.capabilityControl.readiness.minSamples, 50, 'capability readiness should require enough samples by default');

    const {
        CAPABILITY_ROLLOUT_FIELDS,
        appendCapabilitySample,
        evaluateCapabilityReadiness
    } = await import('../governance/CapabilityRolloutReadiness.js');
    const readinessPolicy = DEFAULT_EMPIRE_POLICY.capabilityControl.readiness;
    const healthyCapabilitySample = {
        known: true,
        critical: false,
        recommendationPresent: true,
        legacyMatched: true,
        legacyMissing: false,
        sampledAt: 100
    };
    const readinessCurrent = { lifecycle: 'self_sufficient', staleFor: 0 };
    let healthyRollout = null;
    for (let index = 0; index < 49; index++) {
        healthyRollout = appendCapabilitySample(healthyRollout, {
            ...healthyCapabilitySample,
            sampledAt: 100 + index
        });
    }
    assert.ok(evaluateCapabilityReadiness(healthyRollout, readinessCurrent, readinessPolicy, 200).blockers.includes('insufficient_samples'), '49 healthy samples should still be insufficient');
    healthyRollout = appendCapabilitySample(healthyRollout, { ...healthyCapabilitySample, sampledAt: 149 });
    assert.strictEqual(evaluateCapabilityReadiness(healthyRollout, readinessCurrent, readinessPolicy, 200).ready, true, '50 healthy samples should be ready');

    let lowKnownRollout = healthyRollout;
    for (let index = 0; index < 3; index++) {
        lowKnownRollout = appendCapabilitySample(lowKnownRollout, {
            ...healthyCapabilitySample,
            known: false,
            sampledAt: 150 + index
        });
    }
    assert.ok(evaluateCapabilityReadiness(lowKnownRollout, readinessCurrent, readinessPolicy, 200).blockers.includes('known_ratio_low'), 'known ratios below the threshold should block readiness');

    let criticalRollout = healthyRollout;
    for (let index = 0; index < 3; index++) {
        criticalRollout = appendCapabilitySample(criticalRollout, {
            ...healthyCapabilitySample,
            critical: true,
            sampledAt: 150 + index
        });
    }
    assert.ok(evaluateCapabilityReadiness(criticalRollout, readinessCurrent, readinessPolicy, 200).blockers.includes('critical_ratio_high'), 'critical ratios above the threshold should block readiness');

    let flipRollout = null;
    for (let index = 0; index < 50; index++) {
        flipRollout = appendCapabilitySample(flipRollout, {
            ...healthyCapabilitySample,
            recommendationPresent: index % 2 === 0,
            sampledAt: 100 + index
        });
    }
    assert.ok(evaluateCapabilityReadiness(flipRollout, readinessCurrent, readinessPolicy, 200).blockers.includes('recommendation_flip_ratio_high'), 'recommendation flip ratios above the threshold should block readiness');

    assert.ok(evaluateCapabilityReadiness(healthyRollout, { ...readinessCurrent, staleFor: 21 }, readinessPolicy, 200).blockers.includes('snapshot_stale'), 'stale snapshots should block readiness');
    assert.ok(evaluateCapabilityReadiness(healthyRollout, { ...readinessCurrent, lifecycle: 'claimed' }, readinessPolicy, 200).blockers.includes('lifecycle_ineligible'), 'claimed lifecycle should block readiness');
    assert.ok(evaluateCapabilityReadiness(healthyRollout, { ...readinessCurrent, lifecycle: 'bootstrap' }, readinessPolicy, 200).blockers.includes('lifecycle_ineligible'), 'bootstrap lifecycle should block readiness');
    assert.strictEqual(evaluateCapabilityReadiness(healthyRollout, { ...readinessCurrent, lifecycle: 'self_sufficient' }, readinessPolicy, 200).blockers.includes('lifecycle_ineligible'), false, 'self sufficient lifecycle should be eligible');
    assert.ok(evaluateCapabilityReadiness({ ...healthyRollout, lastErrorAt: 180 }, readinessCurrent, readinessPolicy, 200).blockers.includes('recent_governor_error'), 'recent governor errors should block readiness');

    const legacyVariant = {
        ...healthyRollout,
        legacyMatchCount: 0,
        legacyMissingCount: healthyRollout.sampleCount
    };
    assert.strictEqual(evaluateCapabilityReadiness(legacyVariant, readinessCurrent, readinessPolicy, 200).ready, true, 'legacy comparison counts should not gate readiness');

    const frozenRollout = Object.freeze({ ...healthyRollout });
    const frozenCurrent = Object.freeze({ ...readinessCurrent });
    const frozenPolicy = Object.freeze({ ...readinessPolicy });
    const readinessFrozenSnapshot = JSON.stringify({ frozenRollout, frozenCurrent, frozenPolicy });
    assert.strictEqual(evaluateCapabilityReadiness(frozenRollout, frozenCurrent, frozenPolicy, 200).ready, true, 'frozen readiness inputs should be accepted');
    assert.strictEqual(JSON.stringify({ frozenRollout, frozenCurrent, frozenPolicy }), readinessFrozenSnapshot, 'readiness evaluation should not mutate inputs');
    const frozenAppendPrevious = Object.freeze({ ...healthyRollout, blockers: Object.freeze([...healthyRollout.blockers]) });
    const frozenAppendSample = Object.freeze({ ...healthyCapabilitySample, sampledAt: 150 });
    const frozenAppendSnapshot = JSON.stringify({ frozenAppendPrevious, frozenAppendSample });
    const appendedFrozenInput = appendCapabilitySample(frozenAppendPrevious, frozenAppendSample);
    assert.notStrictEqual(appendedFrozenInput, frozenAppendPrevious, 'appending should return a new rollout object');
    assert.strictEqual(JSON.stringify({ frozenAppendPrevious, frozenAppendSample }), frozenAppendSnapshot, 'appending should not mutate frozen inputs');

    let boundedRollout = null;
    for (let index = 0; index < 1000; index++) {
        boundedRollout = appendCapabilitySample(boundedRollout, {
            ...healthyCapabilitySample,
            recommendationPresent: index % 2 === 0,
            sampledAt: index
        });
    }
    assert.deepStrictEqual(Object.keys(boundedRollout).sort(), [...CAPABILITY_ROLLOUT_FIELDS].sort(), 'rollout state should retain only its fixed schema fields after repeated samples');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(boundedRollout, 'samples'), false, 'rollout state should not retain a sample array');
    assert.strictEqual(evaluateCapabilityReadiness({ ...healthyRollout, sampleCount: NaN }, readinessCurrent, readinessPolicy, 200).ready, false, 'invalid rollout counts should never be ready');
    assert.strictEqual(evaluateCapabilityReadiness({ ...healthyRollout, criticalSampleCount: -1 }, readinessCurrent, readinessPolicy, 200).ready, false, 'negative rollout counts should never be ready');
    const incompleteRollout = { ...healthyRollout };
    delete incompleteRollout.blockers;
    assert.strictEqual(evaluateCapabilityReadiness(incompleteRollout, readinessCurrent, readinessPolicy, 200).ready, false, 'rollouts missing fixed schema fields should never be ready');
    assert.strictEqual(evaluateCapabilityReadiness(healthyRollout, { staleFor: 0 }, readinessPolicy, 200).ready, false, 'missing lifecycle should never be ready');

    const initializedMemory = Memory;
    global.Memory = {};
    const memoryBeforeCapabilityResolution = JSON.stringify(Memory);
    assert.strictEqual(resolveCapabilityMode('W1N1', 'upgradeWork').value, 'shadow', 'missing policy state should fall back to the shadow capability mode');
    assert.strictEqual(JSON.stringify(Memory), memoryBeforeCapabilityResolution, 'capability mode resolution should not initialize or mutate Memory');
    global.Memory = initializedMemory;

    const first = ensureEmpireControl();
    assert.ok(first.rooms, 'empire control should initialize room governor state');
    assert.strictEqual(first.rooms.W1N1.marker, 'preserve', 'room governor initialization should preserve existing room control state');
    assert.strictEqual(first.policy.roomGovernor.shadow, true, 'policy initialization should merge room governor defaults');
    first.policy.overrides.rooms.W1N1 = {
        'capability:upgradeWork': {
            value: 'active',
            reason: 'single_room_pilot',
            expiresAt: 150
        }
    };
    assert.deepStrictEqual(resolveCapabilityMode('W1N1', 'upgradeWork'), {
        value: 'active',
        source: 'room',
        reason: 'single_room_pilot',
        expiresAt: 150
    }, 'active room capability overrides should retain their explanation metadata');
    Game.time = 151;
    assert.strictEqual(resolveCapabilityMode('W1N1', 'upgradeWork').value, 'shadow', 'expired capability overrides should fall back to shadow mode');
    const second = ensureEmpireControl();
    assert.strictEqual(second.rooms.W1N1.marker, 'preserve', 'room governor initialization should be idempotent');

    global.WORK = 'work';
    global.CARRY = 'carry';
    global.ATTACK = 'attack';
    global.RANGED_ATTACK = 'ranged_attack';
    global.HEAL = 'heal';
    global.TOUGH = 'tough';
    global.MOVE = 'move';
    global.STRUCTURE_LAB = 'lab';
    global.STRUCTURE_FACTORY = 'factory';

    const objects = {
        source1: { id: 'source1' },
        source2: { id: 'source2' }
    };
    const ownedRoom = {
        name: 'W1N1',
        controller: { my: true, level: 6, ticksToDowngrade: 12345 },
        energyAvailable: 400,
        energyCapacityAvailable: 800,
        storage: {
            pos: { getRangeTo: (source) => source.id === 'source1' ? 5 : 10 },
            store: { getUsedCapacity: () => 60000 }
        },
        terminal: {}
    };
    Game.time = 200;
    Game.rooms = {
        W1N1: ownedRoom,
        W2N2: { name: 'W2N2', controller: { my: false, level: 3 } },
        W3N3: {
            name: 'W3N3',
            controller: { my: true, level: 1 },
            energyAvailable: 300,
            energyCapacityAvailable: 300
        }
    };
    Game.creeps = {
        Miner1: {
            memory: { role: 'miner', homeRoom: 'W1N1' },
            ticksToLive: 1000,
            body: [
                { type: WORK, hits: 100 },
                { type: WORK, hits: 100 },
                { type: WORK, hits: 0 },
                { type: MOVE, hits: 100 }
            ]
        },
        HaulerOld: {
            memory: { role: 'hauler', homeRoom: 'W1N1' },
            ticksToLive: 20,
            body: [
                { type: CARRY, hits: 100 },
                { type: CARRY, hits: 100 }
            ]
        },
        Builder1: {
            memory: { role: 'builder', homeRoom: 'W1N1' },
            ticksToLive: 1000,
            body: [{ type: WORK, hits: 100 }]
        }
    };
    Game.spawns = {
        Spawn1: { room: ownedRoom, spawning: null, pos: { getRangeTo: () => 8 } }
    };
    Game.getObjectById = (id) => objects[id] || null;
    Memory.empire.spawningCreeps = {
        NewHauler: {
            memory: { role: 'hauler', homeRoom: 'W1N1' },
            body: [CARRY, MOVE, CARRY],
            expireAt: 300
        }
    };
    Memory.empire.control.metrics = {
        rooms: {
            W1N1: { capturedAt: 190, storageEnergy: 58000 }
        }
    };
    global.RoomCache = {
        W1N1: {
            sources: ['source1', 'source2'],
            structures: { lab: ['lab1', 'lab2', 'lab3'], factory: ['factory1'] }
        }
    };
    global.RoomPhase = {
        W1N1: {
            spawnEnergyRatio: 0.5,
            constructionPressure: 4,
            maintenancePressure: 2
        }
    };
    global.WarIntel = {
        W1N1: { hostileStrength: 80, totalDefenseStrength: 120 }
    };
    global.Security = {
        W1N1: { defcon: 3, posture: 'defend' }
    };

    const { collectRoomGovernorFacts } = await import('../governance/RoomGovernorFacts.js');
    const collected = collectRoomGovernorFacts({ replacementLeadTicks: 50 });
    const facts = collected.rooms.W1N1;
    assert.strictEqual(collected.tick, 200, 'facts should record the collection tick');
    assert.deepStrictEqual(Object.keys(collected.rooms).sort(), ['W1N1', 'W3N3'], 'facts should include only owned visible rooms');
    assert.strictEqual(facts.capabilities.harvestWork, 2, 'facts should count only active miner work parts once');
    assert.strictEqual(facts.capabilities.logisticsCarry, 0, 'retiring carry capacity should not count as stable capacity');
    assert.strictEqual(facts.retiringCapabilities.logisticsCarry, 2, 'facts should separate retiring capability');
    assert.strictEqual(facts.spawningCapabilities.logisticsCarry, 2, 'facts should include spawning capability separately');
    assert.strictEqual(facts.capabilities.buildWork, 1, 'facts should map role work parts to build capability');
    assert.strictEqual(collected.rooms.W1N1.controllerTicksToDowngrade, 12345, 'facts should expose owned controller downgrade time');
    assert.strictEqual(facts.sourceCount, 2, 'facts should reuse cached room sources');
    assert.strictEqual(facts.haulDistanceEstimate, 15, 'facts should estimate aggregate source haul range from storage');
    assert.strictEqual(facts.hasIndustrialInfrastructure, true, 'facts should detect cached lab or factory infrastructure');
    assert.deepStrictEqual(facts.security, {
        defcon: 3,
        posture: 'defend',
        hostileStrength: 80,
        defenseStrength: 120
    }, 'facts should reuse existing security and war intel scores');
    assert.deepStrictEqual(facts.previousMetrics, { capturedAt: 190, storageEnergy: 58000 }, 'facts should expose the previous metrics snapshot');
    assert.strictEqual(collected.rooms.W3N3.sourceCount, null, 'missing room cache should remain unknown');
    assert.strictEqual(collected.rooms.W3N3.controllerTicksToDowngrade, null, 'missing controller downgrade time should remain unknown');
    assert.strictEqual(collected.rooms.W3N3.security.hostileStrength, null, 'missing war intel should remain unknown');

    const {
        requiredCapabilities,
        evaluateHealth,
        candidateLifecycle,
        resolveLifecycle,
        evaluateRoomGovernor
    } = await import('../governance/RoomGovernorModel.js');
    const governorPolicy = DEFAULT_EMPIRE_POLICY.roomGovernor;
    const baseFacts = {
        roomName: 'W1N1',
        hasSpawn: true,
        hasStorage: false,
        hasTerminal: false,
        hasIndustrialInfrastructure: false,
        energyAvailable: 800,
        energyCapacity: 800,
        spawnEnergyRatio: 1,
        storageEnergy: 0,
        sourceCount: 2,
        haulDistanceEstimate: 15,
        constructionPressure: 0,
        maintenancePressure: 0,
        capabilities: {
            harvestWork: 10,
            logisticsCarry: 6,
            buildWork: 0,
            repairWork: 0,
            upgradeWork: 1,
            defenseScore: 0
        },
        retiringCapabilities: {
            harvestWork: 0,
            logisticsCarry: 0,
            buildWork: 0,
            repairWork: 0,
            upgradeWork: 0,
            defenseScore: 0
        },
        spawningCapabilities: {
            harvestWork: 0,
            logisticsCarry: 0,
            buildWork: 0,
            repairWork: 0,
            upgradeWork: 0,
            defenseScore: 0
        },
        security: {
            defcon: 5,
            posture: 'peace',
            hostileStrength: 0,
            defenseStrength: 0
        }
    };
    const factsFor = (changes = {}) => ({
        ...baseFacts,
        ...changes,
        capabilities: { ...baseFacts.capabilities, ...(changes.capabilities || {}) },
        retiringCapabilities: { ...baseFacts.retiringCapabilities, ...(changes.retiringCapabilities || {}) },
        spawningCapabilities: { ...baseFacts.spawningCapabilities, ...(changes.spawningCapabilities || {}) },
        security: { ...baseFacts.security, ...(changes.security || {}) }
    });

    const claimedFacts = factsFor({ hasSpawn: false });
    const claimedRequirements = requiredCapabilities(claimedFacts, governorPolicy);
    const claimedHealth = evaluateHealth(claimedFacts, claimedRequirements, governorPolicy);
    assert.strictEqual(candidateLifecycle(claimedFacts, claimedRequirements, claimedHealth, governorPolicy), 'claimed', 'owned rooms without a spawn should be claimed');
    assert.strictEqual(claimedHealth.survival.status, 'critical', 'rooms without a spawn should have critical survival health');

    const noMinerFacts = factsFor({ capabilities: { harvestWork: 0 } });
    const noMinerRequirements = requiredCapabilities(noMinerFacts, governorPolicy);
    const noMinerHealth = evaluateHealth(noMinerFacts, noMinerRequirements, governorPolicy);
    assert.strictEqual(candidateLifecycle(noMinerFacts, noMinerRequirements, noMinerHealth, governorPolicy), 'bootstrap', 'rooms without harvest capability should be bootstrap');
    assert.strictEqual(noMinerHealth.harvest.status, 'critical', 'missing harvest capability should be critical');

    const selfRequirements = requiredCapabilities(baseFacts, governorPolicy);
    const selfHealth = evaluateHealth(baseFacts, selfRequirements, governorPolicy);
    assert.strictEqual(candidateLifecycle(baseFacts, selfRequirements, selfHealth, governorPolicy), 'self_sufficient', 'stable rooms without storage should be self sufficient');
    assert.strictEqual(selfHealth.reserves.status, 'unknown', 'rooms without storage should not fabricate healthy reserves');

    const developingFacts = factsFor({ hasStorage: true, storageEnergy: 10000 });
    const developingRequirements = requiredCapabilities(developingFacts, governorPolicy);
    const developingHealth = evaluateHealth(developingFacts, developingRequirements, governorPolicy);
    assert.strictEqual(candidateLifecycle(developingFacts, developingRequirements, developingHealth, governorPolicy), 'developing', 'storage rooms below mature reserve should be developing');
    assert.strictEqual(developingHealth.reserves.status, 'strained', 'reserves above the survival floor but below the mature target should be strained');

    const criticalReserveFacts = factsFor({ hasStorage: true, storageEnergy: 1000 });
    const criticalReserveHealth = evaluateHealth(criticalReserveFacts, requiredCapabilities(criticalReserveFacts, governorPolicy), governorPolicy);
    assert.strictEqual(criticalReserveHealth.reserves.status, 'critical', 'reserves below the survival floor should be critical');

    const matureFacts = factsFor({ hasStorage: true, storageEnergy: 60000 });
    const matureRequirements = requiredCapabilities(matureFacts, governorPolicy);
    const matureHealth = evaluateHealth(matureFacts, matureRequirements, governorPolicy);
    assert.strictEqual(candidateLifecycle(matureFacts, matureRequirements, matureHealth, governorPolicy), 'mature', 'healthy storage rooms above mature reserve should be mature');

    const industrialFacts = factsFor({
        hasStorage: true,
        hasTerminal: true,
        hasIndustrialInfrastructure: true,
        storageEnergy: 120000
    });
    const industrialRequirements = requiredCapabilities(industrialFacts, governorPolicy);
    const industrialHealth = evaluateHealth(industrialFacts, industrialRequirements, governorPolicy);
    assert.strictEqual(candidateLifecycle(industrialFacts, industrialRequirements, industrialHealth, governorPolicy), 'industrial', 'healthy terminal rooms with industry and reserve should be industrial');

    let lifecycleState = { lifecycle: 'self_sufficient', pendingLifecycle: null, stableSamples: 0 };
    lifecycleState = resolveLifecycle(lifecycleState, 'developing', false, governorPolicy);
    assert.strictEqual(lifecycleState.lifecycle, 'self_sufficient', 'lifecycle upgrades should wait for stable samples');
    lifecycleState = resolveLifecycle(lifecycleState, 'developing', false, governorPolicy);
    assert.strictEqual(lifecycleState.lifecycle, 'self_sufficient', 'lifecycle upgrades should remain pending before the stability threshold');
    lifecycleState = resolveLifecycle(lifecycleState, 'developing', false, governorPolicy);
    assert.strictEqual(lifecycleState.lifecycle, 'developing', 'lifecycle upgrades should apply after enough stable samples');
    const emergencyState = resolveLifecycle({ lifecycle: 'mature', pendingLifecycle: null, stableSamples: 0 }, 'bootstrap', true, governorPolicy);
    assert.strictEqual(emergencyState.lifecycle, 'bootstrap', 'loss of core capability should downgrade immediately');
    const minorShortfall = evaluateRoomGovernor(
        factsFor({ hasStorage: true, storageEnergy: 60000, capabilities: { harvestWork: 9 } }),
        { lifecycle: 'mature', pendingLifecycle: null, stableSamples: 0 },
        governorPolicy
    );
    assert.strictEqual(minorShortfall.emergency, false, 'partial core capability shortfalls should not trigger emergency downgrade');
    assert.strictEqual(minorShortfall.lifecycle, 'mature', 'partial shortfalls should pass through the stability window before downgrade');

    const frozenFacts = factsFor({ hasStorage: true, storageEnergy: 60000 });
    const frozenSnapshot = JSON.stringify(frozenFacts);
    Object.freeze(frozenFacts);
    Object.freeze(frozenFacts.capabilities);
    const evaluation = evaluateRoomGovernor(frozenFacts, null, governorPolicy);
    assert.strictEqual(evaluation.candidateLifecycle, 'mature', 'combined evaluation should expose the candidate lifecycle');
    assert.strictEqual(JSON.stringify(frozenFacts), frozenSnapshot, 'room governor model should not mutate input facts');

    const nearRequirements = requiredCapabilities(factsFor({ haulDistanceEstimate: 15 }), governorPolicy);
    const farRequirements = requiredCapabilities(factsFor({ haulDistanceEstimate: 30 }), governorPolicy);
    assert.strictEqual(nearRequirements.logisticsCarry.required, 6, 'logistics requirements should derive carry parts from source throughput and range');
    assert.strictEqual(farRequirements.logisticsCarry.required, 12, 'longer haul ranges should increase required carry capability');

    const incomingLogistics = evaluateRoomGovernor(factsFor({
        capabilities: { logisticsCarry: 0 },
        retiringCapabilities: { logisticsCarry: 3 },
        spawningCapabilities: { logisticsCarry: 2 }
    }), null, governorPolicy);
    assert.deepStrictEqual(incomingLogistics.capabilities.logisticsCarry, {
        current: 0,
        spawning: 2,
        retiring: 3,
        required: 6,
        gap: 4,
        confidence: 'measured',
        reasons: []
    }, 'spawning capability should reduce gaps while retiring capability remains replacement evidence');

    const noMinerEvaluation = evaluateRoomGovernor(noMinerFacts, null, governorPolicy);
    assert.strictEqual(noMinerEvaluation.budgets.survival.posture, 'protected', 'survival budget should remain protected');
    assert.strictEqual(noMinerEvaluation.budgets.construction.blocked, true, 'construction should pause during a core capability crisis');
    assert.strictEqual(noMinerEvaluation.budgets.upgrade.blocked, true, 'upgrade should pause during a core capability crisis');
    assert.strictEqual(noMinerEvaluation.budgets.support.blocked, true, 'external support should pause during a core capability crisis');

    const lowReserveEvaluation = evaluateRoomGovernor(factsFor({ hasStorage: true, storageEnergy: 1000 }), null, governorPolicy);
    assert.strictEqual(lowReserveEvaluation.budgets.reserve.posture, 'protected', 'low storage should protect the reserve budget');
    assert.strictEqual(lowReserveEvaluation.budgets.support.blocked, true, 'low storage should block external support');

    const harvestRecommendation = noMinerEvaluation.spawnRecommendations.find((item) => item.capability === 'harvestWork');
    assert.ok(harvestRecommendation, 'harvest gaps should produce a shadow spawn recommendation');
    assert.strictEqual(harvestRecommendation.suggestedRole, 'miner', 'harvest recommendations should map to miner');
    assert.strictEqual(harvestRecommendation.requiredCapacity, 10, 'recommendations should express capability rather than creep count');
    assert.ok(harvestRecommendation.reasons.includes('harvestWork_gap'), 'recommendations should explain their capability gap');

    const coveredEvaluation = evaluateRoomGovernor(baseFacts, null, governorPolicy);
    assert.strictEqual(coveredEvaluation.spawnRecommendations.some((item) => item.capability === 'harvestWork'), false, 'covered capabilities should not produce spawn recommendations');
    assert.strictEqual(coveredEvaluation.spawnRecommendations.some((item) => item.capability === 'logisticsCarry'), false, 'covered logistics should not produce spawn recommendations');

    const { compareSpawnDecisions } = await import('../governance/SpawnDecisionComparator.js');
    const logisticsRecommendation = [{
        capability: 'logisticsCarry',
        suggestedRole: 'hauler',
        bodyProfile: 'hauler',
        priority: 70,
        requiredCapacity: 4,
        reasons: ['logisticsCarry_gap']
    }];
    const smallHaulerIntent = {
        role: 'hauler',
        bodyProfile: 'emergency_hauler',
        priority: 45,
        body: [CARRY, MOVE, CARRY],
        reason: 'hauler_capacity'
    };
    const shortfallComparison = compareSpawnDecisions(logisticsRecommendation, [smallHaulerIntent], 600);
    assert.strictEqual(shortfallComparison.matched.length, 0, 'equal intent counts should not match when body capability is insufficient');
    assert.strictEqual(shortfallComparison.missing[0].reason, 'capacity_shortfall', 'insufficient body capability should be reported explicitly');
    assert.strictEqual(shortfallComparison.missing[0].actualCapacity, 2, 'comparison should report aggregate intent capability');

    const comparisonInput = [
        smallHaulerIntent,
        { ...smallHaulerIntent, body: [CARRY, MOVE, CARRY] }
    ];
    const comparisonSnapshot = JSON.stringify(comparisonInput);
    const matchedComparison = compareSpawnDecisions(logisticsRecommendation, comparisonInput, 601);
    assert.strictEqual(matchedComparison.matched.length, 1, 'multiple intents should combine to cover one capability recommendation');
    assert.strictEqual(matchedComparison.priorityMismatches.length, 1, 'priority differences should be reported separately from capability coverage');
    assert.strictEqual(matchedComparison.bodyProfileMismatches.length, 1, 'body profile differences should be reported separately from capability coverage');
    assert.strictEqual(matchedComparison.comparedAt, 601, 'comparison should retain the supplied tick without reading global state');
    assert.strictEqual(JSON.stringify(comparisonInput), comparisonSnapshot, 'comparison should not mutate intent inputs');

    const safetyComparison = compareSpawnDecisions([], [{
        owner: 'war',
        role: 'defender',
        bodyProfile: 'melee_defender',
        priority: 85,
        body: [ATTACK, MOVE],
        reason: 'war_defend'
    }], 602);
    assert.strictEqual(safetyComparison.excess[0].classification, 'external_or_safety', 'external safety demands should not be treated as governor economic errors');

    const { default: RoomGovernorService } = await import('../services/RoomGovernorService.js');
    const roomGovernorService = new RoomGovernorService('RoomGovernor');
    const setHealthyGovernorWorld = (time) => {
        const room = {
            name: 'W1N1',
            controller: { my: true, level: 4 },
            energyAvailable: 600,
            energyCapacityAvailable: 600
        };
        Game.time = time;
        Game.rooms = { W1N1: room };
        Game.creeps = {
            MinerHealthy: {
                memory: { role: 'miner', homeRoom: 'W1N1' },
                ticksToLive: 1000,
                body: new Array(5).fill(null).map(() => ({ type: WORK, hits: 100 }))
            },
            HaulerHealthy: {
                memory: { role: 'hauler', homeRoom: 'W1N1' },
                ticksToLive: 1000,
                body: new Array(4).fill(null).map(() => ({ type: CARRY, hits: 100 }))
            },
            UpgraderHealthy: {
                memory: { role: 'upgrader', homeRoom: 'W1N1' },
                ticksToLive: 1000,
                body: [{ type: WORK, hits: 100 }]
            }
        };
        Game.spawns = {
            SpawnHealthy: { room, spawning: null, pos: { getRangeTo: () => 10 } }
        };
        Game.getObjectById = (id) => id === 'healthySource' ? { id: 'healthySource' } : null;
        Memory.empire.spawningCreeps = {};
        global.RoomCache = {
            W1N1: { sources: ['healthySource'], structures: {}, constructionSites: [] }
        };
        global.RoomPhase = {
            W1N1: { spawnEnergyRatio: 1, constructionPressure: 0, maintenancePressure: 0 }
        };
        global.WarIntel = {
            W1N1: { hostileStrength: 0, totalDefenseStrength: 0 }
        };
        global.Security = {
            W1N1: { defcon: 5, posture: 'peace' }
        };
        global.SpawnBureau = { W1N1: { intents: [] } };
    };

    const governorControl = ensureEmpireControl();
    governorControl.rooms = {};
    governorControl.events = [];
    governorControl.runtime.cpuMode = 'normal';
    governorControl.policy.roomGovernor = JSON.parse(JSON.stringify(DEFAULT_EMPIRE_POLICY.roomGovernor));
    setHealthyGovernorWorld(700);
    roomGovernorService.analyze();
    assert.strictEqual(global.RoomGovernor.W1N1.lifecycle, 'self_sufficient', 'first room governor evaluation should produce a lifecycle');
    assert.strictEqual(governorControl.rooms.W1N1.shadow.evaluatedAt, 700, 'first evaluation should persist a shadow snapshot');

    Game.time = 701;
    roomGovernorService.analyze();
    assert.strictEqual(global.RoomGovernor.W1N1.staleFor, 1, 'non-evaluation ticks should restore the latest snapshot');
    assert.strictEqual(governorControl.rooms.W1N1.shadow.evaluatedAt, 700, 'cache restoration should not rewrite the evaluation tick');

    Game.time = 702;
    delete Game.creeps.MinerHealthy;
    roomGovernorService.analyze();
    assert.strictEqual(governorControl.rooms.W1N1.shadow.evaluatedAt, 702, 'emergency core capability loss should bypass the normal interval');
    assert.strictEqual(global.RoomGovernor.W1N1.lifecycle, 'bootstrap', 'emergency core loss should immediately downgrade lifecycle');
    global.SpawnBureau = { W1N1: { intents: [] } };
    roomGovernorService.cleanup();
    assert.ok(governorControl.rooms.W1N1.shadow.comparison.missing.length > 0, 'cleanup should compare shadow recommendations with real spawn intents');
    const lifecycleEventCount = governorControl.events.filter((event) => event.type === 'room_lifecycle_changed').length;

    Game.time = 703;
    roomGovernorService.analyze();
    roomGovernorService.cleanup();
    assert.strictEqual(governorControl.events.filter((event) => event.type === 'room_lifecycle_changed').length, lifecycleEventCount, 'repeated lifecycle state should not duplicate transition events');

    setHealthyGovernorWorld(710);
    governorControl.runtime.cpuMode = 'critical';
    roomGovernorService.analyze();
    assert.strictEqual(governorControl.rooms.W1N1.shadow.evaluatedAt, 703, 'critical cpu should defer a non-emergency full evaluation');
    assert.strictEqual(global.RoomGovernor.W1N1.deferred, true, 'critical cpu cache restoration should explain that evaluation was deferred');

    Game.time = 760;
    roomGovernorService.analyze();
    assert.ok(global.RoomGovernor.W1N1.staleFor > governorControl.policy.roomGovernor.maxSnapshotAge, 'old snapshots should expose their age');
    assert.deepStrictEqual(global.RoomGovernor.W1N1.spawnRecommendations, [], 'expired snapshots should stop emitting spawn recommendations');

    governorControl.runtime.cpuMode = 'normal';
    governorControl.rooms.W5N5 = { schemaVersion: 1, shadow: { evaluatedAt: 799, marker: 'preserve' } };
    Game.time = 800;
    Game.creeps = {};
    Game.spawns = {};
    Game.rooms = {
        W4N4: {
            name: 'W4N4',
            controller: { my: true, level: 1 },
            energyAvailable: 300,
            energyCapacityAvailable: 300
        },
        W5N5: {
            name: 'W5N5',
            controller: { my: true, level: 4 },
            energyAvailable: 300,
            energyCapacityAvailable: 550,
            storage: { store: { getUsedCapacity: () => { throw new Error('broken storage'); } } }
        }
    };
    global.RoomCache = {
        W4N4: { sources: [], structures: {}, constructionSites: [] },
        W5N5: { sources: [], structures: {}, constructionSites: [] }
    };
    global.RoomPhase = {
        W4N4: { spawnEnergyRatio: 1, constructionPressure: 0, maintenancePressure: 0 },
        W5N5: { spawnEnergyRatio: 1, constructionPressure: 0, maintenancePressure: 0 }
    };
    global.WarIntel = {};
    global.Security = {};
    roomGovernorService.analyze();
    assert.ok(governorControl.rooms.W4N4.shadow, 'one broken room should not prevent other rooms from being evaluated');
    assert.strictEqual(governorControl.rooms.W5N5.shadow.marker, 'preserve', 'room errors should preserve the last valid snapshot');
    assert.ok(governorControl.events.some((event) => event.type === 'room_governor_error' && event.data.roomName === 'W5N5'), 'room errors should be recorded with room context');

    const { default: ServiceScheduler } = await import('../core/ServiceScheduler.js');
    governorControl.runtime.cpuMode = 'normal';
    assert.strictEqual(ServiceScheduler.decision('RoomGovernor', 'analyze').tier, 'P1', 'room governor should be scheduled as a P1 service');

    const { default: EventBus } = await import('../core/EventBus.js');
    setHealthyGovernorWorld(900);
    governorControl.runtime.cpuMode = 'normal';
    const sentinelIntent = { role: 'hauler', priority: 45, body: [CARRY, MOVE] };
    global.SpawnBureau = { W1N1: { intents: [sentinelIntent] } };
    EventBus.topics = { SENTINEL: [{ id: 'sentinel' }] };
    const bureauBeforeGovernor = JSON.stringify(global.SpawnBureau);
    const topicsBeforeGovernor = JSON.stringify(EventBus.topics);
    roomGovernorService.analyze();
    assert.strictEqual(JSON.stringify(global.SpawnBureau), bureauBeforeGovernor, 'shadow governor integration should not change real spawn intents');
    assert.strictEqual(JSON.stringify(EventBus.topics), topicsBeforeGovernor, 'shadow governor integration should not publish event bus requests');

    const { default: EmpireMetricsService } = await import('../services/EmpireMetricsService.js');
    governorControl.policy.telemetry.metricsInterval = 1;
    governorControl.metrics = { rooms: {} };
    global.RoomGovernor = {
        W1N1: {
            lifecycle: 'mature',
            health: { overall: { status: 'healthy', score: 100 } },
            staleFor: 0,
            comparison: {
                matched: [{ capability: 'harvestWork' }],
                missing: [{ capability: 'logisticsCarry' }],
                excess: [],
                priorityMismatches: [],
                bodyProfileMismatches: []
            }
        }
    };
    global.ResourceMarket = {};
    new EmpireMetricsService('EmpireMetrics').cleanup();
    const metricSnapshot = governorControl.metrics.rooms.W1N1;
    assert.strictEqual(metricSnapshot.governorLifecycle, 'mature', 'metrics should retain the governor lifecycle summary');
    assert.deepStrictEqual(metricSnapshot.governorHealth, { status: 'healthy', score: 100 }, 'metrics should retain only compact governor health');
    assert.strictEqual(metricSnapshot.governorStaleFor, 0, 'metrics should retain governor snapshot age');
    assert.deepStrictEqual(metricSnapshot.spawnDecisionDiff, {
        matched: 1,
        missing: 1,
        excess: 0,
        priorityMismatches: 0,
        bodyProfileMismatches: 0
    }, 'metrics should summarize comparison counts without duplicating full evidence');

    const constructionPressureEvaluation = evaluateRoomGovernor(factsFor({
        constructionPressure: 6,
        capabilities: { buildWork: 0 }
    }), null, governorPolicy);
    assert.strictEqual(constructionPressureEvaluation.capabilities.buildWork.required, 2, 'construction pressure should translate into a bounded build work requirement');
    assert.strictEqual(constructionPressureEvaluation.capabilities.buildWork.gap, 2, 'construction pressure should expose the uncovered build capability');
    assert.ok(constructionPressureEvaluation.budgets.construction.reasons.includes('construction_pressure_high'), 'construction budget should explain high construction pressure');

    console.log('room governor checks passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
