const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertFile(relativePath) {
    const fullPath = path.join(root, relativePath);
    assert.ok(fs.existsSync(fullPath), `${relativePath} should exist`);
    return read(relativePath);
}

function assertContains(source, text, label) {
    assert.ok(source.includes(text), `${label} should include ${text}`);
}

const expectedFiles = [
    'main.js',
    'core/EventBus.js',
    'core/BaseService.js',
    'core/TaskTypes.js',
    'core/ActionParser.js',
    'services/RoomCacheService.js',
    'services/SpawnService.js',
    'services/LogisticsService.js',
    'services/SecurityService.js',
    'services/TowerDefenseService.js',
    'services/LabService.js',
    'services/MarketService.js',
    'services/RemoteMiningService.js',
    'strategies/MinerStrategyService.js',
    'strategies/BuilderStrategyService.js',
    'strategies/HaulerStrategyService.js',
    'strategies/DefenderStrategyService.js',
    'planning/BaseBlueprint.js',
    'planning/CityPlannerService.js',
    'planning/RoadPlannerService.js',
    'config/MemoryConfig.js'
];

for (const file of expectedFiles) {
    assertFile(file);
}

const actionParser = read('core/ActionParser.js');
for (const taskType of ['HARVEST', 'TRANSFER', 'WITHDRAW', 'PICKUP', 'BUILD', 'UPGRADE', 'ATTACK', 'MOVE_TO']) {
    assertContains(actionParser, `case TaskTypes.${taskType}`, `ActionParser ${taskType}`);
}

const main = read('main.js');
for (const phase of ['init();', 'analyze();', 'EventBus.dispatch();', 'run();', 'cleanup();']) {
    assertContains(main, phase, `main lifecycle`);
}

for (const file of expectedFiles.filter((file) => file !== 'main.js')) {
    assertContains(read(file), 'module.exports', `${file} export`);
}

console.log('smoke checks passed');
