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

    console.log('room governor checks passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
