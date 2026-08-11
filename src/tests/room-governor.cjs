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
        ensureEmpireControl
    } = await import('../config/EmpirePolicy.js');

    assert.ok(DEFAULT_EMPIRE_POLICY.roomGovernor, 'room governor policy defaults should exist');
    assert.strictEqual(DEFAULT_EMPIRE_POLICY.roomGovernor.shadow, true, 'room governor should default to shadow mode');
    assert.strictEqual(DEFAULT_EMPIRE_POLICY.roomGovernor.thresholds.sourceWorkPerSource, 5, 'room governor should expose initial capability thresholds through policy');

    const first = ensureEmpireControl();
    assert.ok(first.rooms, 'empire control should initialize room governor state');
    assert.strictEqual(first.rooms.W1N1.marker, 'preserve', 'room governor initialization should preserve existing room control state');
    assert.strictEqual(first.policy.roomGovernor.shadow, true, 'policy initialization should merge room governor defaults');
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
        controller: { my: true, level: 6 },
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

    console.log('room governor checks passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
