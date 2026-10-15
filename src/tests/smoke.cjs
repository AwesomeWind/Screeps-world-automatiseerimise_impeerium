const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..', '..');

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

function assertNotContains(source, text, label) {
    assert.ok(!source.includes(text), `${label} should not include ${text}`);
}

const expectedFiles = [
    'src/main.js',
    'src/core/EventBus.js',
    'src/core/BaseService.js',
    'src/core/TaskTypes.js',
    'src/core/ActionParser.js',
    'src/core/BodyBuilder.js',
    'src/core/TaskGuard.js',
    'src/core/WorkPositionCoordinator.js',
    'src/core/WorkPositionPlanner.js',
    'src/core/EmpireEventLog.js',
    'src/core/RuntimeTelemetry.js',
    'src/core/ServiceScheduler.js',
    'src/governance/RoomGovernorFacts.js',
    'src/governance/RoomGovernorModel.js',
    'src/governance/SpawnDecisionComparator.js',
    'src/governance/SpawnCapabilityArbiter.js',
    'src/services/RoomCacheService.js',
    'src/services/RoomPhaseService.js',
    'src/services/SpawnBureauService.js',
    'src/services/SpawnService.js',
    'src/services/CreepRetirementService.js',
    'src/services/LinkService.js',
    'src/services/StructureLifecycleService.js',
    'src/services/CityPlanDebugService.js',
    'src/services/TaskGuardService.js',
    'src/services/LogisticsService.js',
    'src/services/ResourceMarketService.js',
    'src/services/SecurityService.js',
    'src/services/WarIntelService.js',
    'src/services/WarStrategyService.js',
    'src/services/CombatPlannerService.js',
    'src/services/TowerDefenseService.js',
    'src/services/LabService.js',
    'src/services/MarketService.js',
    'src/services/RemoteMiningService.js',
    'src/services/EmpireMetricsService.js',
    'src/services/RoomGovernorService.js',
    'src/strategies/MinerStrategyService.js',
    'src/strategies/BuilderStrategyService.js',
    'src/strategies/RepairerStrategyService.js',
    'src/strategies/HaulerStrategyService.js',
    'src/strategies/UpgraderStrategyService.js',
    'src/strategies/DefenderStrategyService.js',
    'src/planning/BaseBlueprint.js',
    'src/planning/CityAssetPolicy.js',
    'src/planning/CityPlanDebug.js',
    'src/planning/CityPlanLegacyAdapter.js',
    'src/planning/CityPlanMigration.js',
    'src/planning/CityPlanSchema.js',
    'src/planning/RuntimeReadiness.js',
    'src/planning/CityPlanLegacyCleanup.js',
    'src/planning/CityWorkPositionPolicy.js',
    'src/planning/SourceRuntimeState.js',
    'src/planning/CityPlanHelpers.js',
    'src/planning/CityPlannerService.js',
    'src/planning/DefensePlannerService.js',
    'src/planning/MaintenancePlannerService.js',
    'src/planning/RoadPlannerService.js',
    'src/config/MemoryConfig.js',
    'src/config/EmpirePolicy.js'
];

for (const file of expectedFiles) {
    assertFile(file);
}

const actionParser = read('src/core/ActionParser.js');
for (const taskType of ['HARVEST', 'TRANSFER', 'WITHDRAW', 'PICKUP', 'BUILD', 'REPAIR', 'UPGRADE', 'ATTACK', 'RANGED_ATTACK', 'RESERVE', 'MOVE_TO']) {
    assertContains(actionParser, `case TaskTypes.${taskType}`, `ActionParser ${taskType}`);
}
assertContains(read('src/services/ResourceMarketService.js'), 'requestResource', 'resource market should expose generic resource request planning');
assertContains(read('src/services/ResourceMarketService.js'), 'planWorkerEnergyTask', 'resource market should keep worker energy planning as a compatibility wrapper');
assertContains(read('src/strategies/BuilderStrategyService.js'), 'requestResource', 'builder strategy should consume generic resource requests');
assertNotContains(read('src/strategies/BuilderStrategyService.js'), 'assignRepairerTask', 'builder strategy should not own repairer task assignment');
assertContains(read('src/strategies/UpgraderStrategyService.js'), 'requestResource', 'upgrader strategy should consume generic resource requests');
assertNotContains(read('src/strategies/UpgraderStrategyService.js'), 'getPlannedControllerContainerPos', 'upgrader strategy should not keep legacy controller-container position helpers');
assertNotContains(read('src/strategies/UpgraderStrategyService.js'), 'getPlannedControllerLinkPos', 'upgrader strategy should not keep legacy controller-link position helpers');
assertNotContains(read('src/strategies/UpgraderStrategyService.js'), 'return plan ? plan.primaryUpgradePos : null;', 'upgrader strategy should resolve planned upgrade work positions through city work position policy instead of direct legacy controller plan reads');
assertNotContains(read('src/strategies/MinerStrategyService.js'), 'sourcePlan.linkPos', 'miner strategy should resolve source links through the legacy adapter instead of direct source plan positions');
assertNotContains(read('src/strategies/MinerStrategyService.js'), 'return plan ? plan.containerPos : null;', 'miner strategy should resolve source containers through the legacy adapter instead of direct source plan positions');
assertNotContains(read('src/strategies/MinerStrategyService.js'), "plan && plan.preferredOutputRole === 'source_link'", 'miner strategy should derive source link output mode through source output policy instead of direct source plan checks');
assertNotContains(read('src/strategies/MinerStrategyService.js'), 'return plan ? plan.primaryMiningPos : null;', 'miner strategy should resolve planned mining work positions through city work position policy instead of direct legacy source plan reads');
assertNotContains(read('src/strategies/MinerStrategyService.js'), 'getSourcePlan(roomName, sourceId)', 'miner strategy should not keep unused legacy source plan helpers once policy-based reads are in place');
assertNotContains(read('src/services/SpawnBureauService.js'), 'sourcePlan.preferredOutputRole === \'source_link\' && sourcePlan.linkPos', 'spawn bureau should not derive link-miner output mode directly from legacy source plan positions');
assertNotContains(read('src/services/SpawnBureauService.js'), 'cityPlan.controller.containerPos', 'spawn bureau should resolve controller container presence through the legacy adapter instead of direct legacy controller plan reads');
assertNotContains(read('src/services/SpawnBureauService.js'), 'sourcePlan(roomName, sourceId)', 'spawn bureau should not keep unused legacy source plan helpers once policy-based reads are in place');
assertContains(read('src/strategies/RepairerStrategyService.js'), 'requestResource', 'repairer strategy should consume generic resource requests');
assertContains(read('src/strategies/HaulerStrategyService.js'), 'assignHauler', 'hauler strategy should delegate task assignment to resource market');
assertNotContains(read('src/services/LinkService.js'), 'cityPlan.controller.linkPos', 'link service should resolve controller links through the legacy adapter instead of direct legacy position reads');
assertNotContains(read('src/services/LinkService.js'), 'cityPlan.sources[sourceId].linkPos', 'link service should resolve source links through the legacy adapter instead of direct legacy position reads');
assertNotContains(read('src/services/LinkService.js'), "sourcePlan.preferredOutputRole !== 'source_link'", 'link service should derive source output mode through source output policy instead of direct source plan checks');
assertNotContains(read('src/services/LinkService.js'), 'for (const sourceId in cityPlan.sources)', 'link service should enumerate source ids through shared source runtime state helpers');
assertNotContains(read('src/services/LinkService.js'), "preferredOutputRole: 'source_link'", 'link service should not directly patch source runtime output role when promoting link-primary sources');
assertNotContains(read('src/services/LinkService.js'), "deliveryMode: 'link_primary'", 'link service should not directly patch source runtime delivery mode when promoting link-primary sources');
assertNotContains(read('src/services/LinkService.js'), 'promoteSourceToLinkPrimary(', 'link service should route link-primary promotion through the shared source runtime transition helper');
assertContains(read('src/services/LinkService.js'), 'SOURCE_RUNTIME_EVENTS.LINK_NETWORK_ONLINE', 'link service should use named source runtime events instead of inline event strings');
assertContains(read('src/services/LinkService.js'), 'allowDirectPromotion: true', 'link service should allow compatible direct link-primary promotion when the network is already online');
assertNotContains(read('src/services/LinkService.js'), "deliveryMode || 'transition'", 'link service should not hand-roll transition runtime modes from deliveryMode strings');
assertContains(read('src/services/LinkService.js'), 'SOURCE_RUNTIME_MODES.LINK_TRANSITION', 'link service should use shared runtime mode constants when mirroring source runtime into link network state');
assertContains(read('src/services/LinkService.js'), 'SOURCE_RUNTIME_MODES.LINK_PRIMARY', 'link service should use shared runtime mode constants for link-primary source state');
assertContains(read('src/services/LinkService.js'), "from '../planning/RuntimeReadiness.js'", 'link service should reuse the shared runtime readiness helper');
assertNotContains(read('src/services/LinkService.js'), '    shouldUseStrictSourceRuntime(roomMemory) {', 'link service should not keep a duplicated strict source-runtime readiness helper');
assertContains(read('src/services/LinkService.js'), 'resolveControllerContainerAsset(cityPlan, { allowLegacyFallback: false })', 'link service should use strict controller-container resolution for its first execution-layer fallback disable');
assertContains(read('src/services/SpawnBureauService.js'), 'getControllerContainerAsset(cityPlan, { allowLegacyFallback: false })', 'spawn bureau should use strict controller-container reads during controller_container strict rollout');
assertContains(read('src/services/SpawnBureauService.js'), "from '../planning/RuntimeReadiness.js'", 'spawn bureau should reuse the shared runtime readiness helper');
assertContains(read('src/services/SpawnBureauService.js'), 'resolveCapabilityMode', 'spawn bureau should resolve the requested capability mode at its execution boundary');
assertContains(read('src/services/SpawnBureauService.js'), 'arbitrateUpgradeWork', 'spawn bureau should delegate upgrade takeover to the pure arbiter');
assertContains(read('src/services/SpawnBureauService.js'), 'legacyIntents', 'spawn bureau should retain the exact pre-arbitration legacy intent baseline');
assertNotContains(read('src/services/SpawnBureauService.js'), '    shouldUseStrictSourceRuntime(roomMemory) {', 'spawn bureau should not keep a duplicated strict source-runtime readiness helper');
assertContains(read('src/planning/MaintenancePlannerService.js'), 'getControllerContainerAsset(cityPlan, { allowLegacyFallback: false })', 'maintenance planner should use strict controller-container reads during controller_container strict rollout');
assertContains(read('src/planning/MaintenancePlannerService.js'), 'getSourceContainerAsset(cityPlan, sourceId, { allowLegacyFallback: false })', 'maintenance planner should use strict source-container reads during source_container maintenance rollout');
assertContains(read('src/services/ResourceMarketService.js'), 'getControllerContainerAsset(cityPlan || {}, { allowLegacyFallback: false })', 'resource market should use strict controller-container reads during controller_container strict rollout');
assertContains(read('src/services/ResourceMarketService.js'), 'isSourceContainerAsset(cityPlan, structure, null, { allowLegacyFallback: false })', 'resource market should use strict source-container reads during source_container resource-market rollout');
assertContains(read('src/strategies/BuilderStrategyService.js'), 'isSourceContainerAsset(cityPlan, site, null, { allowLegacyFallback: false })', 'builder strategy should use strict source-container reads during source_container builder rollout');
assertContains(read('src/strategies/MinerStrategyService.js'), 'getSourceContainerAsset(cityPlan, sourceId, { allowLegacyFallback: false })', 'miner strategy should use strict source-container reads during source_container miner rollout');
assertContains(read('src/strategies/MinerStrategyService.js'), "from '../planning/RuntimeReadiness.js'", 'miner strategy should reuse the shared runtime readiness helper');
assertNotContains(read('src/strategies/MinerStrategyService.js'), '    shouldUseStrictSourceRuntime(roomMemory) {', 'miner strategy should not keep a duplicated strict source-runtime readiness helper');
assertContains(read('src/strategies/UpgraderStrategyService.js'), 'getControllerUpgradeWorkPosition(cityPlan)', 'upgrader strategy should use canonical-only controller upgrade work-position reads once policy fallback is removed');
assertContains(read('src/strategies/MinerStrategyService.js'), 'getSourceMiningWorkPosition(cityPlan, sourceId)', 'miner strategy should use canonical-only source mining work-position reads once policy fallback is removed');
assertContains(read('src/services/LinkService.js'), 'getControllerLinkAsset(cityPlan, { allowLegacyFallback: false })', 'link service should use strict controller-link reads during controller_link strict rollout');
assertContains(read('src/strategies/UpgraderStrategyService.js'), 'getControllerLinkAsset(cityPlan, { allowLegacyFallback: false })', 'upgrader strategy should use strict controller-link reads during controller_link strict rollout');
assertContains(read('src/services/StructureLifecycleService.js'), 'getControllerLinkAsset(cityPlan, { allowLegacyFallback: false })', 'structure lifecycle should use strict controller-link reads during controller_link strict rollout');
assertContains(read('src/services/StructureLifecycleService.js'), "from '../planning/RuntimeReadiness.js'", 'structure lifecycle should reuse the shared runtime readiness helper');
assertNotContains(read('src/services/StructureLifecycleService.js'), '    shouldUseStrictSourceRuntime(roomMemory) {', 'structure lifecycle should not keep a duplicated strict source-runtime readiness helper');
assertContains(read('src/services/LinkService.js'), 'resolveSourceContainerAsset(cityPlan, sourceId, { allowLegacyFallback: false })', 'link service should use strict source-container resolution for the first source_container execution rollout');
assertNotContains(read('src/services/StructureLifecycleService.js'), "sourcePlan.deliveryMode !== 'link_primary'", 'structure lifecycle service should derive source runtime state through source output policy instead of direct source plan checks');
assertNotContains(read('src/services/StructureLifecycleService.js'), 'for (const sourceId in cityPlan.sources)', 'structure lifecycle service should enumerate source ids through shared source runtime state helpers');
assertNotContains(read('src/services/StructureLifecycleService.js'), 'cityPlan.controller.linkPos', 'structure lifecycle service should resolve controller links through the legacy adapter instead of direct legacy position reads');
assertNotContains(read('src/services/StructureLifecycleService.js'), 'cityPlan.sources[sourceId].linkPos', 'structure lifecycle service should resolve source links through the legacy adapter instead of direct legacy position reads');
assertContains(read('src/services/StructureLifecycleService.js'), 'SOURCE_RUNTIME_MODES.LINK_PRIMARY', 'structure lifecycle service should compare mirrored link-network source state through shared runtime mode constants');
assertNotContains(read('src/planning/CityAssetPolicy.js'), 'cityPlan.sources && cityPlan.sources[sourceId]', 'city asset policy should read source runtime state through shared source runtime helpers');
assertContains(read('src/planning/CityPlanMigration.js'), 'sourcePlan.containerPos', 'city plan migration should remain the compat-only source-container coordinate import boundary');
assertContains(read('src/planning/CityPlanMigration.js'), 'cityPlan.controller && cityPlan.controller.linkPos', 'city plan migration should remain the compat-only controller-link coordinate import boundary');
assertNotContains(read('src/planning/CityPlanLegacyAdapter.js'), 'legacySource && legacySource.containerPos', 'legacy adapter should no longer read legacy source-container storage after adapter hard retirement');
assertNotContains(read('src/planning/CityPlanLegacyAdapter.js'), 'cityPlan.controller && cityPlan.controller.linkPos', 'legacy adapter should no longer read legacy controller-link storage after adapter hard retirement');
assertNotContains(read('src/planning/CityPlanLegacyAdapter.js'), 'function legacyAsset(', 'legacy adapter should remove legacy asset record construction after adapter hard retirement');
assertNotContains(read('src/planning/CityPlanDebug.js'), 'allowLegacyFallback: true', 'city plan debug should stop opting into legacy asset fallback observation during debug fallback retirement');
assertNotContains(read('src/services/CityPlanDebugService.js'), 'allowLegacyFallback: true', 'city plan debug service should not activate legacy asset fallback directly outside the debug summary boundary');
assertNotContains(read('src/services/LinkService.js'), 'allowLegacyFallback: true', 'link service should not activate legacy asset fallback once strict execution reads are in place');
assertNotContains(read('src/services/SpawnBureauService.js'), 'allowLegacyFallback: true', 'spawn bureau should not activate legacy asset fallback once strict execution reads are in place');
assertNotContains(read('src/services/StructureLifecycleService.js'), 'allowLegacyFallback: true', 'structure lifecycle should not activate legacy asset fallback once strict execution reads are in place');
assertNotContains(read('src/strategies/MinerStrategyService.js'), 'allowLegacyFallback: true', 'miner strategy should not activate legacy asset fallback once strict execution reads are in place');
assertNotContains(read('src/strategies/UpgraderStrategyService.js'), 'allowLegacyFallback: true', 'upgrader strategy should not activate legacy asset fallback once strict execution reads are in place');
assertContains(read('src/planning/CityPlanMigration.js'), 'sourcePlan.primaryMiningPos', 'city plan migration should remain the compat-only source mining-position import boundary');
assertContains(read('src/planning/CityPlanMigration.js'), 'cityPlan.controller.primaryUpgradePos', 'city plan migration should remain the compat-only controller upgrade-position import boundary');
assertContains(read('src/planning/CityPlanLegacyCleanup.js'), 'sourcePlan.primaryMiningPos', 'legacy cleanup helper should remain an allowed source mining-position deletion boundary');
assertContains(read('src/planning/CityPlanLegacyCleanup.js'), 'cityPlan.controller.primaryUpgradePos', 'legacy cleanup helper should remain an allowed controller upgrade-position deletion boundary');
assertNotContains(read('src/planning/CityWorkPositionPolicy.js'), 'legacySourcePlan && legacySourcePlan.primaryMiningPos', 'city work position policy should no longer read legacy source mining-position compatibility storage after migration-only convergence');
assertNotContains(read('src/planning/CityWorkPositionPolicy.js'), 'cityPlan.controller && cityPlan.controller.primaryUpgradePos', 'city work position policy should no longer read legacy controller upgrade-position compatibility storage after migration-only convergence');
assertNotContains(read('src/planning/DefensePlannerService.js'), 'primaryMiningPos', 'defense planner should not read legacy work-position coordinates directly');
assertNotContains(read('src/planning/DefensePlannerService.js'), 'primaryUpgradePos', 'defense planner should not read legacy work-position coordinates directly');
assertNotContains(read('src/planning/DefensePlannerService.js'), 'containerPos', 'defense planner should no longer read legacy asset-position coordinates directly');
assertNotContains(read('src/planning/DefensePlannerService.js'), 'linkPos', 'defense planner should no longer read legacy asset-position coordinates directly');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'CityWorkPositionPolicy', 'legacy read audit should describe the city work position convergence entrypoint');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'workPositions', 'legacy read audit should describe the workPositions model');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'schema/debug coverage for `workPositions` is complete', 'legacy read audit should reflect that work position schema/debug coverage is complete');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'Legacy `primaryMiningPos / primaryUpgradePos` now remain only as migration input for canonical `workPositions` regeneration.', 'legacy read audit should confine legacy work-position storage to migration input only');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'compatibility read ownership for work positions now belongs to `CityPlanMigration` import and `CityPlanLegacyCleanup` deletion only.', 'legacy read audit should record that work-position compatibility reads are limited to migration import and cleanup deletion');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'adapter fallback should require explicit opt-in while execution callers stay strict by default', 'legacy read audit should record the adapter default-canonical convergence step');
assertContains(read('docs/city-planning-legacy-read-audit.md'), '`MinerStrategyService` is now the second strict work-position consumer and no longer uses legacy-only source mining positions when canonical `workPositions.sources[sourceId].mining.primary` is absent.', 'legacy read audit should record the miner strict work-position rollout');
assertNotContains(read('docs/city-planning-legacy-read-audit.md'), 'decide when `CityWorkPositionPolicy` and migration no longer need legacy `primaryMiningPos / primaryUpgradePos` fallback support', 'legacy read audit should no longer describe work-position fallback scope as an unstructured future question after V3.7a boundary hardening');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'Remaining compatibility storage is limited to:', 'legacy read audit should state that new plans no longer publish legacy asset-position storage');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'migrated legacy room memory', 'legacy read audit should confine legacy asset-position storage to migrated room memory and compat tooling');
assertNotContains(read('docs/city-planning-legacy-read-audit.md'), 'decide when planning producers can stop writing `containerPos / linkPos` as legacy asset-position compatibility output', 'legacy read audit should no longer treat planner legacy asset-position output removal as pending work');
assertNotContains(read('docs/city-planning-legacy-read-audit.md'), 'legacy asset-position compatibility cleanup planning', 'legacy read audit should no longer describe asset-position cleanup as a future planning step after planner output removal');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'no longer need to read `cityPlan.controller.containerPos` directly', 'legacy read audit should reflect the spawn bureau controller compatibility convergence');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'Runtime state storage is still legacy-backed, but write intent is now routed through a semantic helper', 'legacy read audit should describe semantic source runtime writes');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'transitionSourceRuntimeState(cityPlan, sourceId, event)', 'legacy read audit should describe the event-based source runtime transition entrypoint');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'source runtime boundary is established', 'legacy read audit should describe source runtime boundary hardening progress');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'consumer tightening', 'legacy read audit should describe the remaining work as consumer tightening instead of raw runtime-field convergence');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'CityPlan v3 Readiness', 'legacy read audit should define the readiness checklist before schema migration work starts');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'canonical models', 'legacy read audit should list canonical models for the v3 target');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'legacy compatibility storage', 'legacy read audit should list compatibility storage that remains before v3 migration');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'v3.0', 'legacy read audit should define staged v3 rollout guidance');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'preserving legacy compatibility storage', 'legacy read audit should state that v3.0 migration preserves compatibility storage');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'v3.1', 'legacy read audit should define the v3.1 observability phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'observe fallback usage through debug summaries', 'legacy read audit should require fallback observation before disabling compatibility paths');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.2a', 'legacy read audit should define the first fallback-disable planning phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'readyForFallbackDisable === true', 'legacy read audit should define the readiness gate for disabling fallback');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'three consecutive debug updates', 'legacy read audit should require a stable observation window before disabling fallback');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'rollback criteria', 'legacy read audit should define rollback criteria before execution-layer fallback is tightened');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.2b', 'legacy read audit should define the adapter strict-mode implementation phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'allowLegacyFallback', 'legacy read audit should define the resolver option that separates strict and compat reads');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.2d', 'legacy read audit should define the unified controller_container strict rollout phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'controller_container strict rollout', 'legacy read audit should describe the unified controller_container strict rollout phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.2e', 'legacy read audit should define the controller_link strict rollout phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'controller_link strict rollout', 'legacy read audit should describe the unified controller_link strict rollout phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.2f', 'legacy read audit should define the source_container rollout planning phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'source_container strict rollout plan', 'legacy read audit should describe the source_container rollout planning phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'LinkService.setSourceContainerLifecycle()', 'legacy read audit should identify the low-risk source_container strict consumer');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'MinerStrategyService', 'legacy read audit should identify miner strategy as a deferred source_container strict consumer');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'BuilderStrategyService', 'legacy read audit should identify builder strategy as a deferred source_container strict consumer');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.2g', 'legacy read audit should define the first source_container strict execution rollout phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'source_container first strict consumer', 'legacy read audit should describe the first source_container strict execution rollout phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.2h', 'legacy read audit should define the source_container maintenance strict rollout phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'source_container maintenance strict rollout', 'legacy read audit should describe the source_container maintenance strict rollout phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.2i', 'legacy read audit should define the source_container resource-market strict rollout phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'source_container resource-market strict rollout', 'legacy read audit should describe the source_container resource-market strict rollout phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.2j', 'legacy read audit should define the source_container builder strict rollout phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'source_container builder strict rollout', 'legacy read audit should describe the source_container builder strict rollout phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.2k', 'legacy read audit should define the source_container miner strict rollout phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'source_container miner strict rollout', 'legacy read audit should describe the source_container miner strict rollout phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.2l', 'legacy read audit should define the source_link strict rollout planning phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'source_link strict rollout plan', 'legacy read audit should describe the source_link rollout planning phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'CityAssetPolicy.getSourceOutputPolicy()', 'legacy read audit should identify source output policy as the highest-risk source_link strict consumer');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.3a', 'legacy read audit should define the source runtime canonical model planning phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'source runtime canonical model plan', 'legacy read audit should describe the source runtime canonical model planning phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'cityPlan.sourceRuntime', 'legacy read audit should identify canonical source runtime storage for the next phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'SourceRuntimeState.resolveSourceRuntimeMode', 'legacy read audit should keep runtimeMode as a derived value in the next phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'default strict source-runtime reads', 'legacy read audit should record that source output policy now defaults to strict runtime reads');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'RuntimeReadiness.shouldUseStrictSourceRuntime', 'legacy read audit should record the shared runtime readiness helper used by execution services');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'compat-only boundary hardening and legacy fallback observation cleanup', 'legacy read audit should state that the next phase is compat-only boundary hardening after planner asset-position output removal');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'continuous observation window', 'legacy read audit should require a continuous observation window before disabling asset fallback compatibility');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.9 deletion-gate plan', 'legacy read audit should define the V3.9 deletion-gate phase for legacy asset-position cleanup');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'readyForControllerAssetFieldRemoval', 'legacy read audit should document the controller-side asset-field deletion gate');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.10 controller-only cleanup wave', 'legacy read audit should document the first controller-only cleanup execution wave');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.11 source cleanup wave', 'legacy read audit should document the follow-up source cleanup execution wave');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.13 work-position cleanup wave', 'legacy read audit should document the work-position cleanup execution wave');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.14 final legacy cleanup boundary audit', 'legacy read audit should document the final legacy cleanup boundary audit phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.15 debug fallback retirement', 'legacy read audit should document the debug fallback retirement phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'there should be no remaining active compat asset fallback activation points in production reads', 'legacy read audit should record that debug fallback activation has been retired from production reads');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.16c adapter legacy-read retirement', 'legacy read audit should document the adapter legacy-read retirement phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), '`CityPlanLegacyAdapter` should no longer read legacy asset coordinates or return legacy-derived missing diagnostics', 'legacy read audit should record that adapter no longer reads legacy asset coordinates');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.17a migration import retirement plan', 'legacy read audit should document the migration import retirement planning phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), '`CityPlanMigration` should remain the last canonical asset-regeneration boundary for genuinely old room memory until migration retirement gates are satisfied', 'legacy read audit should keep migration import as the final asset-regeneration boundary during migration retirement planning');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'asset-position migration import should not be removed until canonical `plannedStructures` remain complete without regeneration', 'legacy read audit should define the canonical plannedStructures gate before migration asset import retirement');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'cleanup execution should have already removed reintroduced legacy asset coordinates in steady-state room memory before migration import retirement begins', 'legacy read audit should require cleanup stability before migration asset import retirement');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'test coverage should explicitly include pre-canonical room memory migration, canonical-only room memory migration, and post-cleanup steady-state room memory', 'legacy read audit should define migration retirement test coverage requirements');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.17b migration asset import dry-run readiness', 'legacy read audit should document the migration asset import dry-run readiness phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'migration metadata should explicitly report whether canonical planned assets were already complete before legacy asset import ran', 'legacy read audit should require explicit readiness metadata for canonical asset completeness before migration import');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'steady-state canonical rooms should report ready for asset import removal only when migration no longer regenerates any controller/source container or link planned structures', 'legacy read audit should define the dry-run readiness gate for asset import retirement');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.17c asset import readiness observation', 'legacy read audit should document the room-level asset import readiness observation phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'three consecutive migration observations', 'legacy read audit should require a stable observation window before asset import retirement is considered ready');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'legacy asset import regeneration should reset the readiness streak', 'legacy read audit should require regeneration to reset asset import retirement readiness');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.18a migration asset import controlled-disable path', 'legacy read audit should document the controlled-disable phase for migration asset import');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'asset-position import should be switchable between enabled and disabled modes without changing the default migration behavior', 'legacy read audit should define the controlled-disable switch without changing default migration behavior');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'disabled mode should stop regenerating controller/source container and link planned structures from legacy coordinates while preserving readiness diagnostics', 'legacy read audit should define disabled-mode migration behavior for asset import retirement rehearsal');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.18b asset import disabled rehearsal observation', 'legacy read audit should document the disabled-mode rehearsal observation phase for migration asset import');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'disabled rehearsal should not mutate room memory', 'legacy read audit should require disabled-mode rehearsal to remain non-persistent');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'default migration should remain enabled while rehearsal observes disabled-mode readiness', 'legacy read audit should require rehearsal observation without changing default migration behavior');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.18c asset import retirement gate consolidation', 'legacy read audit should document the retirement gate consolidation phase for migration asset import');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'readyForDefaultDisabled', 'legacy read audit should define the final default-disabled readiness gate');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'blockingReasons', 'legacy read audit should define explicit blocking reasons for asset import retirement');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.19 room-level default-disabled rollout decision', 'legacy read audit should document the room-level rollout decision phase for default-disabled migration');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'requestedMode', 'legacy read audit should define the requested rollout mode for room-level default-disabled migration');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'effectiveMode', 'legacy read audit should define the effective rollout mode for room-level default-disabled migration');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'rollbackMode', 'legacy read audit should define the rollback mode for room-level default-disabled migration');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.20 controlled migration-mode consumption', 'legacy read audit should document the controlled migration-mode consumption phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'effective rollout mode should only take effect on a later observation cycle after it has already been persisted', 'legacy read audit should define the one-cycle delay before rollout mode affects migration');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'requested rollout mode alone should not change migration behavior unless the persisted effective mode is already disabled', 'legacy read audit should require migration to consume effective mode rather than requested mode');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.21 rollout execution observation', 'legacy read audit should document the rollout execution observation phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'consumedMode', 'legacy read audit should define the consumed migration asset import mode for rollout execution observation');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'rollbackRecommended', 'legacy read audit should define rollback guidance for rollout execution observation');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.22 rollback gate observation', 'legacy read audit should document the rollback gate observation phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'cityPlanAssetImportRollbackGate', 'legacy read audit should define room-level rollback gate observation state');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'stableRollbackRecommended', 'legacy read audit should define rollback stability for rollout rollback-gate observation');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'readyForManualRollback', 'legacy read audit should define manual rollback readiness for rollout rollback-gate observation');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.23 rollback summary convergence', 'legacy read audit should document the rollback summary convergence phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'cityPlanAssetImportRollbackSummary', 'legacy read audit should define empire-level rollback summary state');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'actionRequired', 'legacy read audit should define whether rollback summary requires operator action');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.24 controlled manual rollback action', 'legacy read audit should document the controlled manual rollback action phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'cityPlanAssetImportRollbackAction', 'legacy read audit should define room-level rollback action state');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'cityPlanAssetImportRollbackExecution', 'legacy read audit should define room-level rollback execution state');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.25 empire batch rollback action', 'legacy read audit should document the empire batch rollback action phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'cityPlanAssetImportRollbackBatchExecution', 'legacy read audit should define empire-level rollback batch execution state');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'V3.26 rollback action history and cooldown', 'legacy read audit should document the rollback action history and cooldown phase');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'cityPlanAssetImportRollbackHistory', 'legacy read audit should define room-level rollback history state');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'cityPlanAssetImportRollbackBatchHistory', 'legacy read audit should define empire-level rollback batch history state');
assertNotContains(read('docs/city-planning-legacy-read-audit.md'), '`CityPlanLegacyAdapter` may still retain explicit fallback capability for transitional tests and future removal planning, but `CityPlanDebug` should no longer call it', 'legacy read audit should no longer describe explicit adapter fallback capability after adapter fallback retirement');
assertNotContains(read('docs/city-planning-legacy-read-audit.md'), 'active compat asset fallback activation is now limited to `CityPlanDebug`', 'legacy read audit should no longer describe city plan debug as an active compat asset fallback activation point after debug fallback retirement');
assertNotContains(read('docs/city-planning-legacy-read-audit.md'), '`CityPlanDebug` may still read compat asset fallback state because it is the explicit observability boundary for rollback and migration readiness.', 'legacy read audit should no longer describe city plan debug as an active compat asset fallback observability boundary after debug fallback retirement');
assertNotContains(read('docs/city-planning-legacy-read-audit.md'), '`CityPlanDebug` should continue using compat reads so `legacyFallbackSummary` remains an honest observation channel for fallback usage.', 'legacy read audit should no longer prescribe compat debug reads after debug fallback retirement');
assertNotContains(read('docs/city-planning-legacy-read-audit.md'), '`CityPlanDebug` should remain the only active compat asset fallback activation point while final rollback visibility is still required.', 'legacy read audit should no longer describe city plan debug as the only active compat asset fallback activation point after debug fallback retirement');
assertNotContains(read('docs/city-planning-legacy-read-audit.md'), '`CityPlanDebug` still observes compat asset fallback, but no longer compares canonical source runtime against legacy runtime fields.', 'legacy read audit should no longer describe city plan debug as observing compat asset fallback after debug fallback retirement');
assertContains(read('docs/city-planning-legacy-read-audit.md'), '`CityPlanMigration` remains the only import boundary for legacy asset-position storage', 'legacy read audit should record migration as the only asset-position import boundary that still consumes legacy coordinates');
assertContains(read('docs/city-planning-legacy-read-audit.md'), '`cityPlanLegacyCleanup` metadata should remain visible', 'legacy read audit should preserve cleanup execution metadata as part of the compat-boundary audit');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'asset-position compatibility read ownership is now limited to `CityPlanMigration` and `CityPlanLegacyCleanup`.', 'legacy read audit should record that asset-position compatibility ownership is limited to migration and cleanup after adapter hard retirement');
assertNotContains(read('docs/city-planning-legacy-read-audit.md'), 'asset-position compatibility read ownership is now limited to `CityPlanMigration`, `CityPlanLegacyAdapter`, and `CityPlanLegacyCleanup`.', 'legacy read audit should no longer list city plan legacy adapter as an active asset-position compatibility read boundary after adapter hard retirement');
assertNotContains(read('docs/city-planning-legacy-read-audit.md'), 'asset-position compatibility read ownership is now limited to `CityPlanMigration`, `CityPlanLegacyAdapter`, `CityPlanDebug`, and `CityPlanLegacyCleanup`.', 'legacy read audit should no longer list city plan debug as an active asset-position compatibility read boundary after debug fallback retirement');
assertContains(read('docs/city-planning-legacy-read-audit.md'), 'work-position compatibility read ownership is now limited to `CityPlanMigration` and `CityPlanLegacyCleanup`.', 'legacy read audit should record the final allowed work-position compatibility boundaries');
assertContains(read('src/services/CityPlanDebugService.js'), 'cityPlanAssetFallbackObservation', 'city plan debug service should persist asset fallback observation state');
assertContains(read('src/services/CityPlanDebugService.js'), 'cityPlanAssetImportObservation', 'city plan debug service should persist asset import readiness observation state');
assertContains(read('src/services/CityPlanDebugService.js'), 'cityPlanAssetImportRehearsal', 'city plan debug service should persist disabled-mode asset import rehearsal state');
assertContains(read('src/services/CityPlanDebugService.js'), 'cityPlanAssetImportRetirementGate', 'city plan debug service should persist the consolidated asset import retirement gate state');
assertContains(read('src/services/CityPlanDebugService.js'), 'cityPlanAssetImportRollout', 'city plan debug service should persist room-level asset import rollout decision state');
assertContains(read('src/services/CityPlanDebugService.js'), 'effectiveMode', 'city plan debug service should consume room-level effective asset import rollout mode during controlled migration rollout');
assertContains(read('src/services/CityPlanDebugService.js'), 'cityPlanAssetImportExecution', 'city plan debug service should persist rollout execution observation state');
assertContains(read('src/services/CityPlanDebugService.js'), 'cityPlanAssetImportRollbackGate', 'city plan debug service should persist rollout rollback-gate observation state');
assertContains(read('src/services/CityPlanDebugService.js'), 'cityPlanAssetImportRollbackSummary', 'city plan debug service should persist empire-level rollback summary state');
assertContains(read('src/services/CityPlanDebugService.js'), 'cityPlanAssetImportRollbackAction', 'city plan debug service should consume room-level rollback actions');
assertContains(read('src/services/CityPlanDebugService.js'), 'cityPlanAssetImportRollbackExecution', 'city plan debug service should persist room-level rollback execution state');
assertContains(read('src/services/CityPlanDebugService.js'), 'cityPlanAssetImportRollbackBatchExecution', 'city plan debug service should persist empire-level rollback batch execution state');
assertContains(read('src/services/CityPlanDebugService.js'), 'applyEmpireAssetImportRollbackAction', 'city plan debug service should distribute empire-level rollback actions before room-level execution');
assertContains(read('src/services/CityPlanDebugService.js'), 'cityPlanAssetImportRollbackHistory', 'city plan debug service should persist room-level rollback execution history');
assertContains(read('src/services/CityPlanDebugService.js'), 'cityPlanAssetImportRollbackBatchHistory', 'city plan debug service should persist empire-level rollback batch history');
assertContains(read('src/services/CityPlanDebugService.js'), 'ROLLBACK_ACTION_COOLDOWN_TICKS', 'city plan debug service should define a cooldown window for repeated rollback actions');
assertContains(read('src/services/CityPlanDebugService.js'), 'cityPlanWorkPositionCleanupObservation', 'city plan debug service should persist work-position cleanup observation state');
assertContains(read('src/services/CityPlanDebugService.js'), 'applyLegacyWorkPositionFieldCleanup', 'city plan debug service should execute legacy work-position field cleanup after readiness is evaluated');
assertContains(read('src/services/CityPlanDebugService.js'), 'legacyCleanupReadiness', 'city plan debug service should persist legacy cleanup readiness state');
assertContains(read('src/services/CityPlanDebugService.js'), 'applyLegacyAssetFieldCleanup', 'city plan debug service should execute legacy asset-field cleanup after readiness is evaluated');
assertContains(read('src/services/CityPlanDebugService.js'), 'cleanupSourceFields: true', 'city plan debug service should enable source cleanup during the source-only cleanup wave');
assertContains(read('src/planning/CityPlanDebug.js'), 'assetFallbackReadiness', 'city plan debug should expose per-role asset fallback readiness details');
assertContains(read('src/planning/CityPlanDebug.js'), 'assetImportRollbackGate', 'city plan debug should expose rollout rollback-gate observation details');
assertContains(read('src/planning/CityPlanLegacyCleanup.js'), 'cleanupLegacyAssetFields', 'legacy cleanup helper should expose asset-field cleanup execution');
assertContains(read('src/planning/CityPlanLegacyCleanup.js'), 'cleanupLegacyWorkPositionFields', 'legacy cleanup helper should expose work-position cleanup execution');
assertContains(read('src/config/EmpirePolicy.js'), 'enforce: false', 'scheduler should default to shadow mode');
assertContains(read('src/config/EmpirePolicy.js'), 'shadow: true', 'room governor should default to shadow mode');
assertContains(read('src/config/EmpirePolicy.js'), 'if (!control.rooms) control.rooms = {}', 'empire control should initialize room governor state');
assertNotContains(read('src/governance/RoomGovernorFacts.js'), 'Memory.rooms', 'room governor facts should not read room strategy memory');
assertNotContains(read('src/governance/RoomGovernorFacts.js'), 'cityPlan', 'room governor facts should not read city plan data');
assertNotContains(read('src/governance/RoomGovernorFacts.js'), 'PathFinder.search', 'room governor facts should not run pathfinder in the first shadow model');
assertNotContains(read('src/governance/RoomGovernorModel.js'), 'global.', 'room governor model should remain independent from global state');
assertNotContains(read('src/governance/RoomGovernorModel.js'), 'Memory', 'room governor model should remain independent from Memory');
assertNotContains(read('src/governance/RoomGovernorModel.js'), 'Game.', 'room governor model should remain independent from Game');
assertNotContains(read('src/governance/RoomGovernorModel.js'), 'EventBus', 'room governor model should not publish execution requests');
assertNotContains(read('src/governance/RoomGovernorModel.js'), 'REQ_SPAWN', 'room governor model should not create real spawn requests');
assertNotContains(read('src/governance/SpawnDecisionComparator.js'), 'EventBus', 'spawn comparator should remain a pure comparison utility');
assertNotContains(read('src/governance/SpawnDecisionComparator.js'), 'Memory', 'spawn comparator should not persist state');
assertNotContains(read('src/core/RuntimeTelemetry.js'), 'Memory.rooms', 'runtime telemetry should not mutate room strategy state');
assertNotContains(read('src/core/ServiceScheduler.js'), 'creep.memory', 'scheduler should not mutate creep state');
assertContains(read('src/AGENTS.md'), 'ServiceScheduler` 默认 `enforce: false', 'module guide should document shadow scheduling');
assertContains(read('src/AGENTS.md'), 'RoomGovernorService` 只能生成影子建议', 'module guide should document the room governor shadow-only boundary');
assertContains(read('src/AGENTS.md'), 'Memory.empire.control.rooms[roomName].shadow', 'module guide should document the room governor persistence path');
const metricsSource = read('src/services/EmpireMetricsService.js');
for (const forbidden of ['EventBus.publish', 'assignTask(', 'spawnCreep(', 'createConstructionSite(', 'Game.market.deal']) {
    assertNotContains(metricsSource, forbidden, 'empire metrics should remain read-only');
}
const governorServiceSource = read('src/services/RoomGovernorService.js');
for (const forbidden of ['EventBus.publish', 'REQ_SPAWN', 'spawnCreep(', 'assignTask(', 'creep.memory =', 'cityPlan']) {
    assertNotContains(governorServiceSource, forbidden, 'room governor service should remain shadow-only');
}

const main = read('src/main.js');
for (const phase of ["runServicePhase(services, 'init')", "runServicePhase(services, 'analyze')", 'EventBus.dispatch()', "runServicePhase(services, 'run')", "runServicePhase(services, 'cleanup')"]) {
    assertContains(main, phase, 'main lifecycle');
}
assertContains(main, "RuntimeTelemetry.measure(service.name, phase", 'main loop should measure every service phase');
assertContains(main, "ServiceScheduler.decision(service.name, phase)", 'main loop should consult the scheduler');
assertContains(main, "RuntimeTelemetry.measure('EventBus', 'dispatch'", 'main loop should measure event dispatch');
assertContains(main, "RuntimeTelemetry.measure('ActionParser', 'run'", 'main loop should measure creep action execution');
assert.ok(main.indexOf("runServicePhase(services, 'init')") < main.indexOf("runServicePhase(services, 'analyze')"), 'init should remain before analyze');
assert.ok(main.indexOf("runServicePhase(services, 'analyze')") < main.indexOf("EventBus.dispatch()"), 'analyze should remain before event dispatch');
assert.ok(main.indexOf("EventBus.dispatch()") < main.indexOf("runServicePhase(services, 'run')"), 'event dispatch should remain before service run');
assert.ok(main.indexOf("runServicePhase(services, 'run')") < main.indexOf("ActionParser.run"), 'service run should remain before creep actions');
assert.ok(main.indexOf("ActionParser.run") < main.indexOf("runServicePhase(services, 'cleanup')"), 'creep actions should remain before cleanup');
assertContains(main, "const SERVICE_VERSION = '__SERVICE_VERSION__';", 'main should use build-time service version placeholder');
assertNotContains(main, 'delete global.Memory', 'main should not replace the Screeps Memory object');
assertNotContains(main, 'RawMemory._parsed = global.LastMemory', 'main should not override RawMemory parsed cache');
assertContains(main, 'WarIntelService', 'main should include war intel service');
assertContains(main, 'WarStrategyService', 'main should include war strategy service');
assertContains(main, 'CombatPlannerService', 'main should include combat planner service');
assertContains(main, 'RoomPhaseService', 'main should include room phase service');
assertContains(main, 'RoomGovernorService', 'main should include room governor service');
assertContains(main, 'SpawnBureauService', 'main should include spawn bureau service');
assertContains(main, 'TaskGuardService', 'main should include task guard service');
assertContains(main, 'CreepRetirementService', 'main should include creep retirement service');
assertContains(main, 'LinkService', 'main should include link service');
assertContains(main, 'StructureLifecycleService', 'main should include structure lifecycle service');
assertContains(main, 'CityPlanDebugService', 'main should include city plan debug service');
assertContains(main, 'ResourceMarketService', 'main should include resource market service');
assertContains(main, 'DefensePlannerService', 'main should include defense planner service');
assertContains(main, 'MaintenancePlannerService', 'main should include maintenance planner service');
assertContains(main, 'RepairerStrategyService', 'main should include repairer strategy service');
assertNotContains(main, "new LogisticsService('Logistics')", 'main should not run old logistics dispatcher');
assert.ok(main.indexOf("new WarIntelService('WarIntel')") < main.indexOf("new SecurityService('Security')"), 'war intel should run before security bridge');
assert.ok(main.indexOf("new RoomPhaseService('RoomPhase')") < main.indexOf("new SpawnBureauService('SpawnBureau')"), 'room phase should run before spawn bureau reads room state');
assert.ok(main.indexOf("new RoomPhaseService('RoomPhase')") < main.indexOf("new RoomGovernorService('RoomGovernor')"), 'room phase should run before room governor reads room facts');
assert.ok(main.indexOf("new RoomGovernorService('RoomGovernor')") < main.indexOf("new SpawnBureauService('SpawnBureau')"), 'room governor should recommend before spawn bureau creates real intents');
assert.ok(main.indexOf("new RoomGovernorService('RoomGovernor')") < main.indexOf("new EmpireMetricsService('EmpireMetrics')"), 'room governor comparison should finish before empire metrics snapshots');
assertContains(read('src/core/ServiceScheduler.js'), "const P1 = new Set(['EmpireMetrics', 'RoomGovernor'])", 'room governor should run as a P1 service');
for (const field of ['governorLifecycle', 'governorHealth', 'governorStaleFor', 'spawnDecisionDiff']) {
    assertContains(read('src/services/EmpireMetricsService.js'), field, 'empire metrics should include compact room governor summaries');
}
assert.ok(main.indexOf("new SecurityService('Security')") < main.indexOf("new SpawnBureauService('SpawnBureau')"), 'security bridge should run before spawn bureau');
assert.ok(main.indexOf("new SpawnBureauService('SpawnBureau')") < main.indexOf("new SpawnService('Spawn')"), 'spawn bureau should publish before spawn service executes');
assert.ok(main.indexOf("new TaskGuardService('TaskGuard')") < main.indexOf("new ResourceMarketService('ResourceMarket')"), 'task guard should run before resource market and role strategies');
assert.ok(main.indexOf("new ResourceMarketService('ResourceMarket')") < main.indexOf("new LinkService('Link')"), 'link service should run after the market and role strategies have settled room state');
assert.ok(main.indexOf("new LinkService('Link')") < main.indexOf("new StructureLifecycleService('StructureLifecycle')"), 'structure lifecycle should observe link state after the link service updates room lifecycle');
assert.ok(main.indexOf("new StructureLifecycleService('StructureLifecycle')") < main.indexOf("new CityPlanDebugService('CityPlanDebug')"), 'city plan debug should observe lifecycle state after structure lifecycle updates the room');
assert.ok(main.indexOf("new UpgraderStrategyService('UpgraderStrategy')") < main.indexOf("new CreepRetirementService('CreepRetirement')"), 'retirement should evaluate after role strategies assign useful work');
assert.ok(main.indexOf("new CityPlannerService('CityPlanner')") < main.indexOf("new DefensePlannerService('DefensePlanner')"), 'city planner should populate the city plan before defense planner reads it');

const rollupConfig = read('rollup.config.js');
assertContains(rollupConfig, 'function serviceVersionPlugin()', 'rollup should define service version injection plugin');
assertContains(rollupConfig, "code.replaceAll('__SERVICE_VERSION__'", 'rollup should replace service version placeholder at build time');

const distPath = path.join(root, 'dist', 'main.js');
if (fs.existsSync(distPath)) {
    const dist = read('dist/main.js');
    assert.ok(!dist.includes("require('src/"), 'dist/main.js should not keep src absolute requires');
    assert.ok(!dist.includes('require("src/'), 'dist/main.js should not keep src absolute requires');
    assertNotContains(dist, 'delete global.Memory', 'dist should not replace the Screeps Memory object');
    assertNotContains(dist, 'RawMemory._parsed = global.LastMemory', 'dist should not override RawMemory parsed cache');
}

async function runBehaviorChecks() {
    global.OK = 0;
    global.ERR_FULL = -8;
    global.ERR_NOT_ENOUGH_RESOURCES = -6;
    global.ERR_NOT_IN_RANGE = -9;
    global.ERR_INVALID_TARGET = -7;
    global.ERR_INVALID_ARGS = -10;
    global.ERR_NO_BODYPART = -12;
    global.ERR_NO_PATH = -2;
    global.RESOURCE_ENERGY = 'energy';
    global.RESOURCE_UTRIUM = 'U';
    global.RESOURCE_LEMERGIUM = 'L';
    global.RESOURCE_UTRIUM_LEMERGITE = 'UL';
    global.WORK = 'work';
    global.CARRY = 'carry';
    global.MOVE = 'move';
    global.CLAIM = 'claim';
    global.BODYPART_COST = { work: 100, carry: 50, move: 50, attack: 80, ranged_attack: 150, heal: 250, tough: 10, claim: 600 };
    global._ = {
        filter: (collection, predicate) => Object.values(collection).filter(predicate)
    };
    global.FIND_MY_STRUCTURES = 1;
    global.FIND_DROPPED_RESOURCES = 2;
    global.FIND_SOURCES = 3;
    global.FIND_STRUCTURES = 4;
    global.FIND_CONSTRUCTION_SITES = 5;
    global.FIND_MY_SPAWNS = 6;
    global.FIND_HOSTILE_CREEPS = 7;
    global.FIND_MY_CREEPS = 8;
    global.FIND_MINERALS = 9;
    global.STRUCTURE_SPAWN = 'spawn';
    global.STRUCTURE_EXTENSION = 'extension';
    global.STRUCTURE_TOWER = 'tower';
    global.STRUCTURE_STORAGE = 'storage';
    global.STRUCTURE_LINK = 'link';
    global.STRUCTURE_TERMINAL = 'terminal';
    global.STRUCTURE_LAB = 'lab';
    global.STRUCTURE_FACTORY = 'factory';
    global.STRUCTURE_OBSERVER = 'observer';
    global.STRUCTURE_POWER_SPAWN = 'powerSpawn';
    global.STRUCTURE_NUKER = 'nuker';
    global.STRUCTURE_EXTRACTOR = 'extractor';
    global.STRUCTURE_ROAD = 'road';
    global.STRUCTURE_CONTAINER = 'container';
    global.STRUCTURE_WALL = 'constructedWall';
    global.STRUCTURE_RAMPART = 'rampart';
    global.TERRAIN_MASK_WALL = 1;
    global.ATTACK = 'attack';
    global.RANGED_ATTACK = 'ranged_attack';
    global.HEAL = 'heal';
    global.TOUGH = 'tough';
    global.RoomPosition = class RoomPosition {
        constructor(x, y, roomName) {
            this.x = x;
            this.y = y;
            this.roomName = roomName;
        }
    };

    const { default: ActionParser } = await import('../core/ActionParser.js');
    const { default: BodyBuilder } = await import('../core/BodyBuilder.js');
    const { default: EventBus } = await import('../core/EventBus.js');
    const { recordEmpireEvent, getEmpireEvents } = await import('../core/EmpireEventLog.js');
    const { default: RuntimeTelemetry } = await import('../core/RuntimeTelemetry.js');
    const { default: ServiceScheduler } = await import('../core/ServiceScheduler.js');
    const { default: EmpireMetricsService } = await import('../services/EmpireMetricsService.js');
    const { default: MinerStrategyService } = await import('../strategies/MinerStrategyService.js');
    const { default: HaulerStrategyService } = await import('../strategies/HaulerStrategyService.js');
    const { default: UpgraderStrategyService } = await import('../strategies/UpgraderStrategyService.js');
    const { default: BuilderStrategyService } = await import('../strategies/BuilderStrategyService.js');
    const { default: RepairerStrategyService } = await import('../strategies/RepairerStrategyService.js');
    const { default: DefenderStrategyService } = await import('../strategies/DefenderStrategyService.js');
    const { default: SecurityService } = await import('../services/SecurityService.js');
    const { default: WarIntelService } = await import('../services/WarIntelService.js');
    const { default: WarStrategyService } = await import('../services/WarStrategyService.js');
    const { default: CombatPlannerService } = await import('../services/CombatPlannerService.js');
    const { default: RoomPhaseService } = await import('../services/RoomPhaseService.js');
    const { default: SpawnBureauService } = await import('../services/SpawnBureauService.js');
    const { default: SpawnService } = await import('../services/SpawnService.js');
    const { default: CreepRetirementService } = await import('../services/CreepRetirementService.js');
    const { default: LinkService } = await import('../services/LinkService.js');
    const { default: StructureLifecycleService } = await import('../services/StructureLifecycleService.js');
    const { default: CityPlanDebugService } = await import('../services/CityPlanDebugService.js');
    const { default: TaskGuard } = await import('../core/TaskGuard.js');
    const { default: ResourceMarketService } = await import('../services/ResourceMarketService.js');
    const { default: TaskGuardService } = await import('../services/TaskGuardService.js');
    const { default: LabService } = await import('../services/LabService.js');
    const { default: RemoteMiningService } = await import('../services/RemoteMiningService.js');
    const { default: TowerDefenseService } = await import('../services/TowerDefenseService.js');
    const { default: MemoryConfig } = await import('../config/MemoryConfig.js');
    const {
        ensureEmpireControl,
        resolvePolicy,
        DEFAULT_EMPIRE_POLICY
    } = await import('../config/EmpirePolicy.js');
    const { default: CityPlannerService } = await import('../planning/CityPlannerService.js');
    const {
        getAssetPolicy,
        getLogisticsPolicy,
        getMaintenancePolicy,
        getBuildPolicy,
        getSourceOutputPolicy,
        shouldParticipateInLogistics,
        shouldRepairAsset,
        shouldBuildAsset
    } = await import('../planning/CityAssetPolicy.js');
    const {
        resolveControllerContainerAsset,
        resolveSourceContainerAsset,
        resolveControllerLinkAsset,
        resolveSourceLinkAsset,
        getControllerContainerAsset,
        getSourceContainerAsset,
        getControllerLinkAsset,
        getSourceLinkAsset,
        isControllerContainerAsset,
        isSourceContainerAsset,
        isControllerLinkAsset,
        isSourceLinkAsset
    } = await import('../planning/CityPlanLegacyAdapter.js');
    const {
        CITY_PLAN_SCHEMA_VERSION,
        validateCityPlan,
        transitionAssetLifecycle
    } = await import('../planning/CityPlanSchema.js');
    const {
        migrateCityPlan,
        migrateCityPlanToCurrent
    } = await import('../planning/CityPlanMigration.js');
    const {
        buildCityPlanDebug,
        recordLifecycleTransitionFailure
    } = await import('../planning/CityPlanDebug.js');
    const {
        buildLegacyCleanupReadiness,
        cleanupLegacyAssetFields,
        buildLegacyWorkPositionCleanupReadiness,
        cleanupLegacyWorkPositionFields
    } = await import('../planning/CityPlanLegacyCleanup.js');
    const {
        getSourceRuntimeState,
        setSourceRuntimeState,
        getSourceIds,
        SOURCE_OUTPUT_ROLES,
        SOURCE_DELIVERY_MODES,
        SOURCE_RUNTIME_MODES,
        SOURCE_RUNTIME_EVENTS,
        promoteSourceToLinkPrimary,
        setSourceLinkOutputTransition,
        setSourceContainerOutput,
        transitionSourceRuntimeState
    } = await import('../planning/SourceRuntimeState.js');
    const {
        getCityWorkPositions,
        getSourceMiningWorkPosition,
        getControllerUpgradeWorkPosition
    } = await import('../planning/CityWorkPositionPolicy.js');
    const {
        shouldUseStrictSourceRuntime
    } = await import('../planning/RuntimeReadiness.js');
    const {
        getActivePlannedStructure,
        getPlannedStructuresByRole,
        getPlannedStructuresByPhase,
        getPlannedStructuresByGroup,
        findPlannedStructureForObject,
        getPlannedRole,
        getPlannedGroup,
        getPlannedLifecycleState,
        isLifecycleState,
        getHubPlan,
        getStructureLifecycle
    } = await import('../planning/CityPlanHelpers.js');
    const { default: DefensePlannerService } = await import('../planning/DefensePlannerService.js');
    const { default: MaintenancePlannerService } = await import('../planning/MaintenancePlannerService.js');
    const { default: RoadPlannerService } = await import('../planning/RoadPlannerService.js');

    assertContains(main, 'UpgraderStrategyService', 'main services');

    const roomPhaseService = new RoomPhaseService('RoomPhase');

    const smallMinerBody = BodyBuilder.build('miner', {
        energyAvailable: 250,
        energyCapacityAvailable: 250
    }, { phase: 'early' });
    assert.deepStrictEqual(smallMinerBody.body, [WORK, WORK, MOVE], 'miner body should use stationary WORK/MOVE parts when possible');
    assert.strictEqual(smallMinerBody.capacity.workParts, 2, 'miner body should report work part capacity');
    const bootstrapMinerBody = BodyBuilder.build('miner', {
        energyAvailable: 100,
        energyCapacityAvailable: 300
    }, { phase: 'bootstrap' });
    assert.ok(bootstrapMinerBody.body.includes(WORK), 'miner body should never degrade to move-only');

    const earlyMinerLowEnergy = BodyBuilder.build('miner', {
        energyAvailable: 250,
        energyCapacityAvailable: 550
    }, { phase: 'early' });
    const earlyMinerHighEnergy = BodyBuilder.build('miner', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { phase: 'early' });
    assert.deepStrictEqual(earlyMinerLowEnergy.body, earlyMinerHighEnergy.body, 'same phase miner body should not change with current available energy');
    const linkMinerBody = BodyBuilder.build('miner', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { bodyProfile: 'link_miner' });
    assert.ok(linkMinerBody.capacity.carryParts >= 1, 'link miner profile should reserve carry parts for source link transfer');
    assert.ok(linkMinerBody.capacity.workParts >= 2, 'link miner profile should still keep meaningful work throughput');

    const largeHaulerBody = BodyBuilder.build('hauler', {
        energyAvailable: 500,
        energyCapacityAvailable: 500
    }, { phase: 'stable' });
    assert.ok(largeHaulerBody.capacity.carryParts > 2, 'hauler body should scale carry capacity with available energy');
    const emergencyHaulerBody = BodyBuilder.build('hauler', {
        energyAvailable: 500,
        energyCapacityAvailable: 500
    }, { bodyProfile: 'emergency_hauler' });
    assert.ok(emergencyHaulerBody.body.length < largeHaulerBody.body.length, 'emergency hauler body should be smaller than standard logistics body');
    const upgraderBody = BodyBuilder.build('upgrader', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { phase: 'early' });
    assert.ok(upgraderBody.body.includes(WORK) && upgraderBody.body.includes(CARRY), 'upgrader body should include work and carry parts');
    const stationaryUpgraderBody = BodyBuilder.build('upgrader', {
        energyAvailable: 300,
        energyCapacityAvailable: 300
    }, { bodyProfile: 'stationary_upgrader' });
    const mobileUpgraderBody = BodyBuilder.build('upgrader', {
        energyAvailable: 300,
        energyCapacityAvailable: 300
    }, { bodyProfile: 'upgrader' });
    assert.ok(stationaryUpgraderBody.capacity.workParts > mobileUpgraderBody.capacity.workParts, 'stationary upgrader body should bias work parts over the mobile profile');
    assert.ok(stationaryUpgraderBody.capacity.carryParts <= mobileUpgraderBody.capacity.carryParts, 'stationary upgrader body should not spend more on carry than the mobile profile');
    const builder300Body = BodyBuilder.build('builder', {
        energyAvailable: 300,
        energyCapacityAvailable: 300
    });
    const builder550Body = BodyBuilder.build('builder', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    });
    assert.ok(builder550Body.body.length > builder300Body.body.length, 'builder body should scale when RCL2 energy capacity increases');
    const mobileBuilderBody = BodyBuilder.build('builder', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { bodyProfile: 'mobile_builder' });
    const suppliedBuilderBody = BodyBuilder.build('builder', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { bodyProfile: 'supplied_builder' });
    assert.ok(suppliedBuilderBody.capacity.workParts > mobileBuilderBody.capacity.workParts, 'supplied builder should bias work parts when logistics can feed it');
    assert.ok(mobileBuilderBody.capacity.carryParts >= suppliedBuilderBody.capacity.carryParts, 'mobile builder should keep more carry capacity for self-supply');
    const storagePhaseBuilderBody = BodyBuilder.build('builder', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { phase: 'storage', bodyProfile: 'supplied_builder' });
    const terminalPhaseBuilderBody = BodyBuilder.build('builder', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { phase: 'terminal', bodyProfile: 'supplied_builder' });
    assert.deepStrictEqual(storagePhaseBuilderBody.body, suppliedBuilderBody.body, 'storage phase builder bodies should reuse the supplied builder profile');
    assert.deepStrictEqual(terminalPhaseBuilderBody.body, suppliedBuilderBody.body, 'terminal phase builder bodies should reuse the supplied builder profile');
    const repairerBody = BodyBuilder.build('repairer', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { bodyProfile: 'repairer' });
    assert.ok(repairerBody.capacity.workParts >= 2 && repairerBody.capacity.carryParts >= 1, 'repairer profile should support sustained repair work');
    const defender550Body = BodyBuilder.build('defender', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { bodyProfile: 'melee_defender' });
    assert.ok(defender550Body.body.includes(ATTACK) && defender550Body.body.includes(TOUGH), 'defender body profile should include combat parts');
    const rangedDefenderBody = BodyBuilder.build('defender', {
        energyAvailable: 550,
        energyCapacityAvailable: 550
    }, { bodyProfile: 'ranged_defender' });
    assert.ok(rangedDefenderBody.body.includes(RANGED_ATTACK) && rangedDefenderBody.body.includes(MOVE), 'ranged defender profile should include ranged attack and movement');
    const reserver650Body = BodyBuilder.build('reserver', {
        energyAvailable: 650,
        energyCapacityAvailable: 650
    }, { bodyProfile: 'reserver' });
    assert.deepStrictEqual(reserver650Body.body, [CLAIM, MOVE], 'reserver should degrade to a single claim pair when room capacity is limited');
    const reserver1300Body = BodyBuilder.build('reserver', {
        energyAvailable: 1300,
        energyCapacityAvailable: 1300
    }, { bodyProfile: 'reserver' });
    assert.deepStrictEqual(reserver1300Body.body, [CLAIM, CLAIM, MOVE, MOVE], 'reserver should scale up when room capacity supports a full reserve body');
    const standardRemoteMinerBody = BodyBuilder.build('remoteMiner', {
        energyAvailable: 650,
        energyCapacityAvailable: 650
    }, { bodyProfile: 'remote_miner' });
    const travelRemoteMinerBody = BodyBuilder.build('remoteMiner', {
        energyAvailable: 650,
        energyCapacityAvailable: 650
    }, { bodyProfile: 'remote_travel_miner' });
    assert.ok(travelRemoteMinerBody.capacity.moveParts > standardRemoteMinerBody.capacity.moveParts, 'long-distance remote miner should trade some work for movement');

    global.Game = {
        time: 1,
        getObjectById: () => ({ id: 'source1', pos: {} })
    };

    const fullMiner = {
        memory: { task: { type: 'HARVEST', targetId: 'source1' } },
        harvest: () => ERR_FULL,
        pos: {}
    };
    ActionParser.run(fullMiner);
    assert.strictEqual(fullMiner.memory.task, null, 'HARVEST should end when creep store is full');

    global.Memory = { creeps: {}, rooms: { W1N1: { maintenancePlan: { targets: [1, 2] } } }, empire: {} };
    const policyTestTime = Game.time;
    Memory.empire = { market: { enabled: false }, existingField: { keep: true } };
    Game.time = 100;
    const control = ensureEmpireControl();
    assert.strictEqual(control.schemaVersion, 1, 'empire control should start at schema version 1');
    assert.strictEqual(control.policy.autoExpansion, true, 'empire policy should default to automatic expansion');
    assert.strictEqual(control.policy.autoWar, true, 'empire policy should default to automatic war decisions');
    assert.strictEqual(control.policy.scheduler.enforce, false, 'scheduler should start in shadow mode');
    assert.deepStrictEqual(Memory.empire.existingField, { keep: true }, 'control initialization should preserve existing empire memory');

    control.policy.overrides = {
        empire: {
            autoExpansion: { value: false, reason: 'manual pause', expiresAt: 120 }
        },
        rooms: {
            W1N1: {
                autoExpansion: { value: true, reason: 'room exception', expiresAt: 120 }
            }
        }
    };
    assert.strictEqual(resolvePolicy('autoExpansion', { roomName: 'W1N1' }), true, 'room override should outrank empire override');
    assert.strictEqual(resolvePolicy('autoExpansion', { roomName: 'W2N2' }), false, 'empire override should outrank the default policy');
    Game.time = 121;
    assert.strictEqual(resolvePolicy('autoExpansion', { roomName: 'W1N1' }), true, 'expired overrides should fall back to the default policy');
    assert.strictEqual(DEFAULT_EMPIRE_POLICY.telemetry.eventLimit, 50, 'event history should have a bounded default limit');
    Memory.empire.control.events = [];
    Memory.empire.control.policy.telemetry.eventLimit = 2;
    Game.time = 200;
    const eventInput = { roomName: 'W1N1' };
    recordEmpireEvent('cpu_mode_changed', 'warning', eventInput);
    Game.time = 201;
    recordEmpireEvent('goal_paused', 'info', { goalId: 'g1' });
    Game.time = 202;
    recordEmpireEvent('room_recovered', 'info', { roomName: 'W1N1' });
    assert.deepStrictEqual(getEmpireEvents().map((event) => event.type), ['goal_paused', 'room_recovered'], 'event log should retain only the newest bounded entries');
    assert.deepStrictEqual(eventInput, { roomName: 'W1N1' }, 'event recording should not mutate caller data');
    assert.strictEqual(getEmpireEvents()[1].tick, 202, 'event log should record the game tick');
    Memory.empire.control.policy.telemetry.eventLimit = DEFAULT_EMPIRE_POLICY.telemetry.eventLimit;

    const previousCpu = Game.cpu;
    let usedCpu = 10;
    Game.cpu = { bucket: 9000, getUsed: () => usedCpu };
    Game.time = 300;
    Memory.empire.control.policy.telemetry.persistInterval = 1;
    RuntimeTelemetry.beginTick();
    const telemetryResult = RuntimeTelemetry.measure('FakeService', 'analyze', () => {
        usedCpu = 11.25;
        return 'ok';
    });
    assert.strictEqual(telemetryResult, 'ok', 'telemetry wrapper should return callback results');
    RuntimeTelemetry.finishTick();
    assert.strictEqual(global.EmpireTelemetry.services.FakeService.analyze, 1.25, 'telemetry should record phase CPU deltas');
    assert.strictEqual(Memory.empire.control.telemetry.services.FakeService.analyzeEwma, 1.25, 'telemetry should persist phase EWMA');

    RuntimeTelemetry.beginTick();
    assert.throws(() => RuntimeTelemetry.measure('BrokenService', 'run', () => {
        usedCpu = 12;
        throw new Error('boom');
    }), /boom/, 'telemetry should preserve existing error propagation');
    assert.strictEqual(global.EmpireTelemetry.errors.BrokenService.run, 1, 'telemetry should count measured errors');

    delete Game.cpu;
    assert.strictEqual(RuntimeTelemetry.measure('NoCpu', 'init', () => 42), 42, 'telemetry should preserve behavior when Game.cpu is unavailable');
    RuntimeTelemetry.beginTick('recovery-a');
    RuntimeTelemetry.finishTick();
    assert.strictEqual(global.EmpireTelemetry.totalCpu, null, 'missing CPU evidence must remain unknown rather than become zero');
    Game.cpu = { bucket: 9000, getUsed: () => usedCpu };
    for (let i = 0; i < 55; i++) {
        Game.time++;
        RuntimeTelemetry.beginTick('recovery-a');
        usedCpu += 1;
        RuntimeTelemetry.finishTick();
    }
    assert.strictEqual(Memory.empire.control.telemetry.history.length, 50, 'raw CPU history must have a strict capacity bound');
    assert.strictEqual(Memory.empire.control.telemetry.codeVersion, 'recovery-a', 'telemetry history must identify the measured code version');
    Game.time++;
    RuntimeTelemetry.beginTick('recovery-b');
    usedCpu += 2;
    RuntimeTelemetry.finishTick();
    assert.strictEqual(Memory.empire.control.telemetry.history.length, 1, 'a code change must start a fresh CPU measurement segment');
    assert.strictEqual(Memory.empire.control.telemetry.totalCpuP95, 2, 'p95 must be computed from finite raw samples rather than EWMA');
    Memory.empire.control.policy.telemetry.enabled = false;
    const heldTelemetry = JSON.stringify(Memory.empire.control.telemetry);
    RuntimeTelemetry.beginTick('disabled-version');
    assert.strictEqual(RuntimeTelemetry.measure('StillRuns', 'run', () => 42), 42, 'disabling observation must not disable service execution');
    RuntimeTelemetry.finishTick();
    assert.strictEqual(JSON.stringify(Memory.empire.control.telemetry), heldTelemetry, 'disabled observation must not mutate persistent telemetry');
    Memory.empire.control.policy.telemetry.enabled = true;
    Game.cpu = previousCpu;
    Memory.empire.control.policy.telemetry.persistInterval = DEFAULT_EMPIRE_POLICY.telemetry.persistInterval;

    const schedulerPreviousCpu = Game.cpu;
    Memory.empire.control.policy.scheduler = {
        enforce: false,
        constrainedBelow: 7000,
        criticalBelow: 3000,
        recoveryAbove: 8000
    };
    Game.cpu = { bucket: 2500, getUsed: () => 0 };
    Game.time = 400;
    ServiceScheduler.beginTick();
    const shadow = ServiceScheduler.decision('CityPlanDebug', 'analyze');
    assert.strictEqual(shadow.mode, 'critical', 'low bucket should enter critical mode');
    assert.strictEqual(shadow.wouldRun, false, 'critical mode should recommend skipping P3 work');
    assert.strictEqual(shadow.shouldRun, true, 'shadow mode should preserve existing execution');

    Memory.empire.control.policy.scheduler.enforce = true;
    const enforced = ServiceScheduler.decision('CityPlanDebug', 'analyze');
    assert.strictEqual(enforced.shouldRun, false, 'enforced scheduler should skip optional work');
    assert.strictEqual(ServiceScheduler.decision('Spawn', 'run').shouldRun, true, 'P0 services should run in critical mode');
    assert.strictEqual(ServiceScheduler.decision('CityPlanDebug', 'init').shouldRun, true, 'scheduler should never skip service initialization');
    assert.strictEqual(ServiceScheduler.decision('CityPlanDebug', 'cleanup').shouldRun, true, 'scheduler should never skip service cleanup');

    Game.cpu.bucket = 7500;
    ServiceScheduler.beginTick();
    assert.strictEqual(Memory.empire.control.runtime.cpuMode, 'recovery', 'critical mode should enter recovery before normal');
    Game.cpu.bucket = 8500;
    ServiceScheduler.beginTick();
    assert.strictEqual(Memory.empire.control.runtime.cpuMode, 'normal', 'recovery should exit only above recovery threshold');
    Game.cpu = schedulerPreviousCpu;
    Memory.empire.control.policy.scheduler = { ...DEFAULT_EMPIRE_POLICY.scheduler };

    const previousRooms = Game.rooms;
    const previousCreeps = Game.creeps;
    const previousSpawns = Game.spawns;
    const previousRoomPhase = global.RoomPhase;
    const previousResourceMarket = global.ResourceMarket;
    const previousMetrics = Memory.empire.control.metrics;
    Memory.empire.control.policy.telemetry.metricsInterval = 10;
    Memory.empire.control.metrics = { rooms: {} };
    Game.time = 500;
    Game.rooms = {
        W1N1: {
            name: 'W1N1',
            controller: { my: true, level: 3, progress: 123 },
            energyAvailable: 400,
            energyCapacityAvailable: 550,
            storage: { store: { getUsedCapacity: () => 120000 } }
        }
    };
    Game.creeps = {
        M1: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        H1: { memory: { role: 'hauler', homeRoom: 'W1N1' } }
    };
    Game.spawns = {
        Spawn1: { room: Game.rooms.W1N1, spawning: { name: 'NewMiner' } }
    };
    global.RoomPhase = {
        W1N1: {
            phase: 'storage',
            energyPosture: 'normal',
            spawnEnergyRatio: 0.72,
            constructionPressure: 3,
            maintenancePressure: 2
        }
    };
    global.ResourceMarket = { W1N1: { stats: { supplies: 4, demands: 3 } } };
    new EmpireMetricsService('EmpireMetrics').cleanup();
    assert.deepStrictEqual(Memory.empire.control.metrics.rooms.W1N1.roleCounts, { miner: 1, hauler: 1 }, 'metrics should aggregate role counts by home room');
    assert.strictEqual(Memory.empire.control.metrics.rooms.W1N1.storageEnergy, 120000, 'metrics should record storage energy');
    assert.strictEqual(Memory.empire.control.metrics.rooms.W1N1.spawningCount, 1, 'metrics should record active room spawns');
    assert.strictEqual(Memory.empire.control.metrics.rooms.W1N1.controllerProgress, 123, 'metrics must expose actual Controller task progress for acceptance');
    assert.deepStrictEqual(Game.creeps.M1.memory, { role: 'miner', homeRoom: 'W1N1' }, 'metrics should not mutate creep memory');
    global.RoomPhase.W1N1.recovery = { mode: 'hauler_gap', reasons: ['hauler_gap'], evaluatedAt: Game.time, coreUsable: { miner: 1, hauler: 0 }, coreUpcoming: { miner: 0, hauler: 1 }, blockedBy: [] };
    RuntimeTelemetry.beginTick('room-recovery-a');
    const metricsObserver = new EmpireMetricsService('EmpireMetrics');
    for (let i = 0; i < 55; i++) {
        Game.time = 500 + i * 50;
        metricsObserver.cleanup();
    }
    assert.strictEqual(Memory.empire.control.metrics.histories.W1N1.samples.length, 50, 'room recovery history must remain bounded');
    assert.strictEqual(Memory.empire.control.metrics.rooms.W1N1.recovery.mode, 'hauler_gap', 'latest metrics should expose the explicit recovery reason');
    assert.strictEqual(Memory.empire.control.metrics.histories.W1N1.samples[49].codeVersion, 'room-recovery-a', 'room history must carry the measured code version');
    RuntimeTelemetry.beginTick('room-recovery-b');
    Game.time += 50;
    metricsObserver.cleanup();
    assert.strictEqual(Memory.empire.control.metrics.histories.W1N1.samples.length, 1, 'new room code versions must not inherit old acceptance history');
    Game.rooms = previousRooms;
    Game.creeps = previousCreeps;
    Game.spawns = previousSpawns;
    global.RoomPhase = previousRoomPhase;
    global.ResourceMarket = previousResourceMarket;
    Memory.empire.control.metrics = previousMetrics;
    Memory.empire.control.policy.telemetry.metricsInterval = DEFAULT_EMPIRE_POLICY.telemetry.metricsInterval;
    Game.time = policyTestTime;
    Game.rooms = {
        W1N1: {
            name: 'W1N1',
            controller: { my: true, level: 3 },
            energyAvailable: 150,
            energyCapacityAvailable: 300,
            storage: null,
            terminal: null
        }
    };
    Game.creeps = {
        BootstrapMiner: { memory: { role: 'miner', homeRoom: 'W1N1' } }
    };
    roomPhaseService.analyze();
    assert.strictEqual(global.RoomPhase.W1N1.phase, 'bootstrap', 'room phase should classify a room with miners but no hauler as bootstrap');
    assert.strictEqual(global.RoomPhase.W1N1.energyCritical, true, 'room phase should flag low available energy as critical');
    assert.strictEqual(global.RoomPhase.W1N1.maintenancePressure, 2, 'room phase should expose maintenance backlog size');

    Game.rooms.W1N1.energyAvailable = 280;
    Game.creeps = {
        EarlyMiner: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        EarlyHauler: { memory: { role: 'hauler', homeRoom: 'W1N1' } }
    };
    roomPhaseService.analyze();
    assert.strictEqual(global.RoomPhase.W1N1.phase, 'early', 'room phase should classify a room with miner and hauler but no storage as early');
    assert.strictEqual(global.RoomPhase.W1N1.logisticsMode, 'self_supply', 'room phase should keep early rooms on self supply until storage logistics are online');

    Game.rooms.W1N1.storage = {
        store: {
            getUsedCapacity: () => 20000
        }
    };
    roomPhaseService.analyze();
    assert.strictEqual(global.RoomPhase.W1N1.phase, 'storage', 'room phase should classify storage-backed rooms as storage phase');
    assert.strictEqual(global.RoomPhase.W1N1.hasStorage, true, 'room phase should expose storage presence');

    const rescueSpawn = {
        id: 'rescueSpawn',
        structureType: STRUCTURE_SPAWN,
        store: {
            getUsedCapacity: () => 100,
            getFreeCapacity: () => 200
        }
    };
    const rescueExtension = {
        id: 'rescueExtension',
        structureType: STRUCTURE_EXTENSION,
        store: {
            getUsedCapacity: () => 0,
            getFreeCapacity: () => 50
        }
    };
    Game.rooms.W1N1.storage = {
        store: {
            getUsedCapacity: () => 2000
        }
    };
    Game.rooms.W1N1.find = (type, opts = {}) => {
        let results = [];
        if (type === FIND_MY_STRUCTURES) results = [rescueSpawn, rescueExtension];
        if (opts.filter) return results.filter(opts.filter);
        return results;
    };
    Game.rooms.W1N1.terminal = null;
    Game.creeps = {
        RescueMiner: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        RescueHauler: { memory: { role: 'hauler', homeRoom: 'W1N1' } }
    };
    Memory.rooms.W1N1.energyPosture = 'normal';
    roomPhaseService.analyze();
    assert.strictEqual(global.RoomPhase.W1N1.energyPosture, 'spawn_rescue', 'room phase should enter spawn rescue when spawn and extensions fall below the low watermark');
    assert.strictEqual(global.RoomPhase.W1N1.storageRescueActive, true, 'spawn rescue should allow storage to feed economy energy');
    assert.ok(global.RoomPhase.W1N1.spawnEnergyRatio < 0.5, 'room phase should expose spawn and extension energy ratio');
    assert.strictEqual(global.RoomPhase.W1N1.storageEnergy, 2000, 'room phase should expose storage energy');

    rescueSpawn.store = {
        getUsedCapacity: () => 250,
        getFreeCapacity: () => 50
    };
    rescueExtension.store = {
        getUsedCapacity: () => 40,
        getFreeCapacity: () => 10
    };
    roomPhaseService.analyze();
    assert.strictEqual(global.RoomPhase.W1N1.energyPosture, 'spawn_rescue', 'room phase should keep spawn rescue active until the high watermark is reached');

    rescueSpawn.store = {
        getUsedCapacity: () => 300,
        getFreeCapacity: () => 0
    };
    rescueExtension.store = {
        getUsedCapacity: () => 50,
        getFreeCapacity: () => 0
    };
    roomPhaseService.analyze();
    assert.strictEqual(global.RoomPhase.W1N1.energyPosture, 'normal', 'room phase should exit spawn rescue once spawn and extensions recover above the high watermark');
    assert.strictEqual(global.RoomPhase.W1N1.storageRescueActive, false, 'normal posture should disable storage rescue');

    rescueSpawn.store = {
        getUsedCapacity: () => 0,
        getFreeCapacity: () => 300
    };
    rescueExtension.store = {
        getUsedCapacity: () => 0,
        getFreeCapacity: () => 50
    };
    Game.rooms.W1N1.storage = {
        store: {
            getUsedCapacity: () => 500
        }
    };
    Game.creeps = {
        RescueHauler: { memory: { role: 'hauler', homeRoom: 'W1N1' } }
    };
    Memory.rooms.W1N1.energyPosture = 'normal';
    roomPhaseService.analyze();
    assert.strictEqual(global.RoomPhase.W1N1.energyPosture, 'bootstrap_rescue', 'room phase should enter bootstrap rescue when there is no miner and spawn energy cannot produce a recovery miner');
    assert.strictEqual(global.RoomPhase.W1N1.storageRescueActive, true, 'bootstrap rescue should allow storage draw even below the ordinary reserve');

    Game.rooms.W1N1.terminal = {
        store: {
            getUsedCapacity: () => 5000
        }
    };
    roomPhaseService.analyze();
    assert.strictEqual(global.RoomPhase.W1N1.phase, 'terminal', 'room phase should classify terminal-backed rooms as terminal phase');
    assert.strictEqual(global.RoomPhase.W1N1.hasTerminal, true, 'room phase should expose terminal presence');

    let moveRange = null;
    const exactMoveCreep = {
        memory: { task: { type: 'MOVE_TO', pos: { x: 10, y: 10, roomName: 'W1N1' }, range: 0 } },
        pos: {
            inRangeTo: () => false
        },
        moveTo: (pos, opts) => {
            moveRange = opts.range;
            return OK;
        }
    };
    ActionParser.run(exactMoveCreep);
    assert.strictEqual(moveRange, 0, 'MOVE_TO should preserve explicit range 0 for planned positions');

    let rangedTargetId = null;
    const rangedAttackCreep = {
        memory: { task: { type: 'RANGED_ATTACK', targetId: 'hostileRangedTarget' } },
        rangedAttack: (target) => {
            rangedTargetId = target.id;
            return OK;
        },
        pos: {}
    };
    Game.getObjectById = (id) => ({ id, pos: {} });
    ActionParser.run(rangedAttackCreep);
    assert.strictEqual(rangedTargetId, 'hostileRangedTarget', 'RANGED_ATTACK should execute creep.rangedAttack');
    assert.strictEqual(rangedAttackCreep.memory.task, null, 'RANGED_ATTACK should clear after successful attack');

    let repairedTargetId = null;
    const repairCreep = {
        memory: { task: { type: 'REPAIR', targetId: 'rampartRepairTarget', targetHits: 5000 } },
        repair: (target) => {
            repairedTargetId = target.id;
            return OK;
        },
        pos: {}
    };
    Game.getObjectById = (id) => ({ id, hits: 2500, pos: {} });
    ActionParser.run(repairCreep);
    assert.strictEqual(repairedTargetId, 'rampartRepairTarget', 'REPAIR should execute creep.repair');
    assert.deepStrictEqual(repairCreep.memory.task, { type: 'REPAIR', targetId: 'rampartRepairTarget', targetHits: 5000 }, 'REPAIR should keep the task while the target is still below targetHits');

    const completedRepairCreep = {
        memory: { task: { type: 'REPAIR', targetId: 'roadAtTarget', targetHits: 5000 } },
        repair: () => OK,
        pos: {}
    };
    Game.getObjectById = (id) => ({ id, hits: 5000, pos: {} });
    ActionParser.run(completedRepairCreep);
    assert.strictEqual(completedRepairCreep.memory.task, null, 'REPAIR should clear after the target reaches targetHits');

    let buildMoveTarget = null;
    const reroutingBuilder = {
        memory: {
            task: {
                type: 'BUILD',
                targetId: 'roadSite1',
                workPos: { x: 11, y: 10, roomName: 'W1N1' }
            }
        },
        room: {
            name: 'W1N1',
            find: (type, opts) => {
                if (type !== FIND_STRUCTURES) return [];
                const structures = [{ structureType: STRUCTURE_ROAD, pos: { x: 10, y: 10, roomName: 'W1N1' } }];
                return opts && opts.filter ? structures.filter(opts.filter) : structures;
            }
        },
        pos: {
            x: 10,
            y: 10,
            roomName: 'W1N1',
            inRangeTo: (target, range) => {
                const tx = target.x !== undefined ? target.x : target.pos.x;
                const ty = target.y !== undefined ? target.y : target.pos.y;
                return Math.max(Math.abs(tx - 10), Math.abs(ty - 10)) <= range;
            }
        },
        build: () => OK,
        moveTo: (pos, opts) => {
            buildMoveTarget = { pos, range: opts.range };
            if (!(pos instanceof RoomPosition)) return ERR_INVALID_TARGET;
            return OK;
        }
    };
    Game.getObjectById = (id) => id === 'roadSite1' ? { id, pos: { x: 10, y: 11, roomName: 'W1N1' } } : null;
    ActionParser.run(reroutingBuilder);
    assert.deepStrictEqual({ x: buildMoveTarget.pos.x, y: buildMoveTarget.pos.y, roomName: buildMoveTarget.pos.roomName, range: buildMoveTarget.range }, {
        x: 11,
        y: 10,
        roomName: 'W1N1',
        range: 0
    }, 'BUILD should move to the planned off-road work position before starting a long task');
    assert.ok(buildMoveTarget.pos instanceof RoomPosition, 'BUILD should pass a real RoomPosition to moveTo when moving toward a reserved work position');
    assert.deepStrictEqual(reroutingBuilder.memory.task, {
        type: 'BUILD',
        targetId: 'roadSite1',
        workPos: { x: 11, y: 10, roomName: 'W1N1' }
    }, 'BUILD should keep the original long task while moving toward its work position');

    let buildCalls = 0;
    const offRoadBuilder = {
        memory: {
            task: {
                type: 'BUILD',
                targetId: 'roadSite1',
                workPos: { x: 12, y: 10, roomName: 'W1N1' }
            }
        },
        room: {
            name: 'W1N1',
            find: (type, opts) => {
                if (type !== FIND_STRUCTURES) return [];
                const structures = [{ structureType: STRUCTURE_ROAD, pos: { x: 12, y: 10, roomName: 'W1N1' } }];
                return opts && opts.filter ? structures.filter(opts.filter) : structures;
            }
        },
        pos: {
            x: 10,
            y: 10,
            roomName: 'W1N1',
            inRangeTo: (target, range) => {
                const tx = target.x !== undefined ? target.x : target.pos.x;
                const ty = target.y !== undefined ? target.y : target.pos.y;
                return Math.max(Math.abs(tx - 10), Math.abs(ty - 10)) <= range;
            }
        },
        build: () => {
            buildCalls++;
            return OK;
        },
        moveTo: () => {
            throw new Error('builder already in a valid off-road build position and should not move');
        }
    };
    Game.getObjectById = (id) => id === 'roadSite1' ? { id, pos: { x: 10, y: 11, roomName: 'W1N1' } } : null;
    ActionParser.run(offRoadBuilder);
    assert.strictEqual(buildCalls, 1, 'BUILD should continue from any non-road range-1 position instead of requiring the exact reserved work position');
    assert.deepStrictEqual(offRoadBuilder.memory.task, {
        type: 'BUILD',
        targetId: 'roadSite1',
        workPos: { x: 12, y: 10, roomName: 'W1N1' }
    }, 'BUILD should keep the task after a successful build tick so builders keep working at the site');

    const stuckMoveCreep = {
        memory: { task: { type: 'MOVE_TO', pos: { x: 10, y: 10, roomName: 'W1N1' }, range: 0, stuckLimit: 2 } },
        pos: {
            x: 5,
            y: 5,
            roomName: 'W1N1',
            inRangeTo: () => false
        },
        moveTo: () => OK
    };
    ActionParser.run(stuckMoveCreep);
    Game.time++;
    ActionParser.run(stuckMoveCreep);
    Game.time++;
    ActionParser.run(stuckMoveCreep);
    assert.strictEqual(stuckMoveCreep.memory.task, null, 'MOVE_TO should clear when creep stays stuck for too many ticks');

    const noPathMoveCreep = {
        memory: { task: { type: 'MOVE_TO', pos: { x: 10, y: 10, roomName: 'W1N1' }, range: 0 } },
        pos: {
            inRangeTo: () => false
        },
        moveTo: () => ERR_NO_PATH
    };
    ActionParser.run(noPathMoveCreep);
    assert.strictEqual(noPathMoveCreep.memory.task, null, 'MOVE_TO should clear when no path can be found');
    assert.strictEqual(noPathMoveCreep.memory.lastTaskClear.reason, 'move_no_path', 'MOVE_TO should record why the task was cleared');

    const staleTransferCreep = {
        memory: { task: { type: 'TRANSFER', targetId: 'spawn1', resourceType: RESOURCE_ENERGY } },
        transfer: () => ERR_INVALID_TARGET,
        pos: { inRangeTo: () => true }
    };
    Game.getObjectById = (id) => id === 'spawn1' ? { id } : null;
    ActionParser.run(staleTransferCreep);
    assert.strictEqual(staleTransferCreep.memory.task, null, 'TRANSFER should clear stale invalid targets');
    assert.strictEqual(staleTransferCreep.memory.lastTaskClear.reason, 'transfer_invalid_target', 'TRANSFER should record invalid target clear reasons');

    const spawn = {
        id: 'spawn1',
        structureType: STRUCTURE_SPAWN,
        store: {
            getFreeCapacity: () => 300
        }
    };
    const room = {
        name: 'W1N1',
        find: () => [spawn]
    };
    const miner = {
        name: 'Miner1',
        room,
        memory: {
            role: 'miner',
            homeRoom: 'W1N1',
            sourceId: 'source1',
            miningPos: { x: 10, y: 10, roomName: 'W1N1' }
        },
        pos: {
            inRangeTo: () => true
        },
        store: {
            getFreeCapacity: () => 0,
            getUsedCapacity: () => 50
        }
    };

    Game.getObjectById = (id) => {
        if (id === 'source1') return { id, pos: { x: 10, y: 10, roomName: 'W1N1' } };
        return null;
    };
    const service = new MinerStrategyService('MinerStrategy');
    service.assignMiningTask(miner);
    assert.deepStrictEqual(miner.memory.task, {
        type: 'HARVEST',
        targetId: 'source1'
    }, 'stationary miner should keep harvesting instead of delivering energy');

    Game.getObjectById = (id) => {
        if (id === 'source1') return { id, pos: { x: 10, y: 10, roomName: 'W1N1' } };
        if (id === 'source2') return { id, pos: { x: 20, y: 20, roomName: 'W1N1' } };
        return null;
    };
    global.Game.creeps = {
        MinerA: { memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' }, body: [{ type: WORK }, { type: WORK }] }
    };
    global.RoomCache = {
        W1N1: {
            sources: ['source1', 'source2']
        }
    };
    const assignedSource = service.pickSource(miner);
    assert.strictEqual(assignedSource, 'source2', 'miner source assignment should prefer the less-covered source');

    Memory.rooms = {
        W1N1: {
            cityPlan: {
                sources: {
                    source1: {
                        primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' },
                        linkPos: { x: 10, y: 11, roomName: 'W1N1' },
                        preferredOutputRole: 'source_link'
                    }
                },
                plannedStructures: [{
                    id: 'source1:link',
                    role: 'source_link',
                    structureType: STRUCTURE_LINK,
                    pos: { x: 10, y: 11, roomName: 'W1N1' },
                    scope: { sourceId: 'source1' },
                    lifecycle: { state: 'planned', activeFromRcl: 5 }
                }]
            }
        }
    };
    const linkMiningRoom = {
        name: 'W1N1',
        find: (type, opts = {}) => {
            let results = [];
            if (type === FIND_STRUCTURES) {
                results = [{
                    id: 'sourceLink1',
                    structureType: STRUCTURE_LINK,
                    pos: { x: 10, y: 11, roomName: 'W1N1' },
                    store: {
                        getFreeCapacity: () => 700,
                        getUsedCapacity: () => 0
                    }
                }];
            }
            if (type === FIND_HOSTILE_CREEPS) results = [];
            if (opts.filter) return results.filter(opts.filter);
            return results;
        }
    };
    const linkMiner = {
        name: 'LinkMiner',
        room: linkMiningRoom,
        memory: {
            role: 'miner',
            homeRoom: 'W1N1',
            sourceId: 'source1',
            miningPos: { x: 9, y: 10, roomName: 'W1N1' }
        },
        pos: {
            x: 9,
            y: 10,
            roomName: 'W1N1',
            inRangeTo: (target, range) => {
                const pos = target.pos || target;
                return Math.max(Math.abs(pos.x - 9), Math.abs(pos.y - 10)) <= range;
            }
        },
        store: {
            getFreeCapacity: () => 0,
            getUsedCapacity: () => 50
        }
    };
    Game.getObjectById = (id) => {
        if (id === 'source1') return { id, pos: { x: 10, y: 10, roomName: 'W1N1' } };
        if (id === 'sourceLink1') return linkMiningRoom.find(FIND_STRUCTURES)[0];
        return null;
    };
    Memory.rooms.W1N1.cityPlan.sourceRuntime = {
        sources: {
            source1: {
                preferredOutputRole: 'source_link',
                deliveryMode: 'link_primary'
            }
        }
    };
    service.assignMiningTask(linkMiner);
    assert.deepStrictEqual(linkMiner.memory.task, {
        type: 'TRANSFER',
        targetId: 'sourceLink1',
        resourceType: RESOURCE_ENERGY
    }, 'miner should transfer into the planned source link once link mode is active and the link is available');
    Memory.rooms.W1N1 = {
        cityPlan: {
            sources: {
                source1: {
                    primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' },
                    linkPos: { x: 10, y: 11, roomName: 'W1N1' },
                    preferredOutputRole: 'source_link'
                }
            },
            plannedStructures: []
        }
    };
    const legacyOnlyLinkMiner = {
        name: 'LegacyOnlyLinkMiner',
        room: linkMiningRoom,
        memory: {
            role: 'miner',
            homeRoom: 'W1N1',
            sourceId: 'source1',
            miningPos: { x: 9, y: 10, roomName: 'W1N1' }
        },
        pos: {
            x: 9,
            y: 10,
            roomName: 'W1N1',
            inRangeTo: (target, range) => {
                const pos = target.pos || target;
                return Math.max(Math.abs(pos.x - 9), Math.abs(pos.y - 10)) <= range;
            }
        },
        store: {
            getFreeCapacity: () => 0,
            getUsedCapacity: () => 50
        }
    };
    service.assignMiningTask(legacyOnlyLinkMiner);
    assert.deepStrictEqual(legacyOnlyLinkMiner.memory.task, {
        type: 'HARVEST',
        targetId: 'source1'
    }, 'miner should not transfer into legacy-only source links during strict source_link rollout');
    Memory.rooms.W1N1 = {
        cityPlan: {
            sourceRuntime: {
                sources: {
                    source1: {
                        preferredOutputRole: 'source_link',
                        deliveryMode: 'link_primary'
                    }
                }
            },
            sources: {
                source1: {
                    primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' },
                    preferredOutputRole: 'source_link'
                }
            },
            plannedStructures: [{
                id: 'source1:link',
                role: 'source_link',
                structureType: STRUCTURE_LINK,
                pos: { x: 10, y: 11, roomName: 'W1N1' },
                scope: { sourceId: 'source1' },
                lifecycle: { state: 'planned', activeFromRcl: 5 }
            }]
        }
    };
    const plannedOnlyLinkMiner = {
        name: 'PlannedOnlyLinkMiner',
        room: linkMiningRoom,
        memory: {
            role: 'miner',
            homeRoom: 'W1N1',
            sourceId: 'source1',
            miningPos: { x: 9, y: 10, roomName: 'W1N1' }
        },
        pos: {
            x: 9,
            y: 10,
            roomName: 'W1N1',
            inRangeTo: (target, range) => {
                const pos = target.pos || target;
                return Math.max(Math.abs(pos.x - 9), Math.abs(pos.y - 10)) <= range;
            }
        },
        store: {
            getFreeCapacity: () => 0,
            getUsedCapacity: () => 50
        }
    };
    service.assignMiningTask(plannedOnlyLinkMiner);
    assert.deepStrictEqual(plannedOnlyLinkMiner.memory.task, {
        type: 'TRANSFER',
        targetId: 'sourceLink1',
        resourceType: RESOURCE_ENERGY
    }, 'miner should transfer into planned source links even when legacy source link positions are absent');
    Memory.rooms.W1N1 = {
        cityPlan: {
            sources: {
                source1: {
                    primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' },
                    preferredOutputRole: 'source_link',
                    deliveryMode: 'link_primary'
                }
            },
            plannedStructures: [{
                id: 'source1:link',
                role: 'source_link',
                structureType: STRUCTURE_LINK,
                pos: { x: 10, y: 11, roomName: 'W1N1' },
                scope: { sourceId: 'source1' },
                lifecycle: { state: 'planned', activeFromRcl: 5 }
            }]
        },
        cityPlanRuntimeObservation: {
            readyStreak: 3,
            readyForRuntimeFallbackDisable: true
        }
    };
    const strictLegacyRuntimeMiner = {
        name: 'StrictLegacyRuntimeMiner',
        room: linkMiningRoom,
        memory: {
            role: 'miner',
            homeRoom: 'W1N1',
            sourceId: 'source1',
            miningPos: { x: 9, y: 10, roomName: 'W1N1' }
        },
        pos: {
            x: 9,
            y: 10,
            roomName: 'W1N1',
            inRangeTo: (target, range) => {
                const pos = target.pos || target;
                return Math.max(Math.abs(pos.x - 9), Math.abs(pos.y - 10)) <= range;
            }
        },
        store: {
            getFreeCapacity: () => 0,
            getUsedCapacity: () => 50
        }
    };
    service.assignMiningTask(strictLegacyRuntimeMiner);
    assert.deepStrictEqual(strictLegacyRuntimeMiner.memory.task, {
        type: 'HARVEST',
        targetId: 'source1'
    }, 'miner should stop link-transfer behavior when only legacy source runtime remains after the strict runtime gate opens');
    Memory.rooms.W1N1 = {
        cityPlan: {
            sourceRuntime: {
                sources: {
                    source1: {
                        preferredOutputRole: 'source_link',
                        deliveryMode: 'transition'
                    }
                }
            },
            sources: {
                source1: {
                    primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' },
                    preferredOutputRole: 'source_container',
                    deliveryMode: 'container'
                }
            },
            plannedStructures: [{
                id: 'source1:link',
                role: 'source_link',
                structureType: STRUCTURE_LINK,
                pos: { x: 10, y: 11, roomName: 'W1N1' },
                scope: { sourceId: 'source1' },
                lifecycle: { state: 'planned', activeFromRcl: 5 }
            }]
        },
        cityPlanRuntimeObservation: {
            readyStreak: 3,
            readyForRuntimeFallbackDisable: true
        }
    };
    const strictCanonicalRuntimeMiner = {
        name: 'StrictCanonicalRuntimeMiner',
        room: linkMiningRoom,
        memory: {
            role: 'miner',
            homeRoom: 'W1N1',
            sourceId: 'source1',
            miningPos: { x: 9, y: 10, roomName: 'W1N1' }
        },
        pos: {
            x: 9,
            y: 10,
            roomName: 'W1N1',
            inRangeTo: (target, range) => {
                const pos = target.pos || target;
                return Math.max(Math.abs(pos.x - 9), Math.abs(pos.y - 10)) <= range;
            }
        },
        store: {
            getFreeCapacity: () => 0,
            getUsedCapacity: () => 50
        }
    };
    service.assignMiningTask(strictCanonicalRuntimeMiner);
    assert.deepStrictEqual(strictCanonicalRuntimeMiner.memory.task, {
        type: 'TRANSFER',
        targetId: 'sourceLink1',
        resourceType: RESOURCE_ENERGY
    }, 'miner should preserve link-transfer behavior when canonical source runtime remains valid after the strict runtime gate opens');
    const blockedLinkMiningRoom = {
        name: 'W1N1',
        find: (type, opts = {}) => {
            let results = [];
            if (type === FIND_STRUCTURES) {
                results = [{
                    id: 'sourceLinkFull',
                    structureType: STRUCTURE_LINK,
                    pos: { x: 10, y: 11, roomName: 'W1N1' },
                    store: {
                        getFreeCapacity: () => 0,
                        getUsedCapacity: () => 800
                    }
                }, {
                    id: 'sourceContainerFallback',
                    structureType: STRUCTURE_CONTAINER,
                    pos: { x: 9, y: 10, roomName: 'W1N1' },
                    store: {
                        getFreeCapacity: () => 1500,
                        getUsedCapacity: () => 500
                    }
                }];
            }
            if (type === FIND_HOSTILE_CREEPS) results = [];
            if (opts.filter) return results.filter(opts.filter);
            return results;
        }
    };
    const blockedLinkMiner = {
        name: 'BlockedLinkMiner',
        room: blockedLinkMiningRoom,
        memory: {
            role: 'miner',
            homeRoom: 'W1N1',
            sourceId: 'source1',
            miningPos: { x: 9, y: 10, roomName: 'W1N1' }
        },
        pos: {
            x: 9,
            y: 10,
            roomName: 'W1N1',
            inRangeTo: (target, range) => {
                const pos = target.pos || target;
                return Math.max(Math.abs(pos.x - 9), Math.abs(pos.y - 10)) <= range;
            }
        },
        store: {
            getFreeCapacity: () => 0,
            getUsedCapacity: () => 50
        }
    };
    Game.getObjectById = (id) => {
        if (id === 'source1') return { id, pos: { x: 10, y: 10, roomName: 'W1N1' } };
        if (id === 'sourceLinkFull') return blockedLinkMiningRoom.find(FIND_STRUCTURES)[0];
        if (id === 'sourceContainerFallback') return blockedLinkMiningRoom.find(FIND_STRUCTURES)[1];
        return null;
    };
    service.assignMiningTask(blockedLinkMiner);
    assert.deepStrictEqual(blockedLinkMiner.memory.task, {
        type: 'HARVEST',
        targetId: 'source1'
    }, 'miner should not treat legacy-only source containers as canonical fallback targets when the source link is full');
    Memory.rooms.W1N1 = {
        cityPlan: {
            sourceRuntime: {
                sources: {
                    source1: {
                        preferredOutputRole: 'source_link',
                        deliveryMode: 'link_primary'
                    }
                }
            },
            sources: {
                source1: {
                    primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' },
                    preferredOutputRole: 'source_link'
                }
            },
            plannedStructures: [
                {
                    id: 'source1:link',
                    role: 'source_link',
                    structureType: STRUCTURE_LINK,
                    pos: { x: 10, y: 11, roomName: 'W1N1' },
                    scope: { sourceId: 'source1' },
                    lifecycle: { state: 'planned', activeFromRcl: 5 }
                },
                {
                    id: 'source1:container',
                    role: 'source_container',
                    structureType: STRUCTURE_CONTAINER,
                    pos: { x: 9, y: 10, roomName: 'W1N1' },
                    scope: { sourceId: 'source1' },
                    lifecycle: { state: 'active', activeFromRcl: 1 }
                }
            ]
        }
    };
    const plannedOnlyBlockedLinkMiner = {
        name: 'PlannedOnlyBlockedLinkMiner',
        room: blockedLinkMiningRoom,
        memory: {
            role: 'miner',
            homeRoom: 'W1N1',
            sourceId: 'source1',
            miningPos: { x: 9, y: 10, roomName: 'W1N1' }
        },
        pos: {
            x: 9,
            y: 10,
            roomName: 'W1N1',
            inRangeTo: (target, range) => {
                const pos = target.pos || target;
                return Math.max(Math.abs(pos.x - 9), Math.abs(pos.y - 10)) <= range;
            }
        },
        store: {
            getFreeCapacity: () => 0,
            getUsedCapacity: () => 50
        }
    };
    service.assignMiningTask(plannedOnlyBlockedLinkMiner);
    assert.deepStrictEqual(plannedOnlyBlockedLinkMiner.memory.task, {
        type: 'TRANSFER',
        targetId: 'sourceContainerFallback',
        resourceType: RESOURCE_ENERGY
    }, 'miner should fall back to planned source containers when legacy container positions are absent');
    Memory.rooms.W1N1 = {
        cityPlan: {
            sources: {
                source1: {
                    primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' },
                    preferredOutputRole: 'source_link',
                    deliveryMode: 'link_primary'
                }
            },
            plannedStructures: [
                {
                    id: 'source1:link',
                    role: 'source_link',
                    structureType: STRUCTURE_LINK,
                    pos: { x: 10, y: 11, roomName: 'W1N1' },
                    scope: { sourceId: 'source1' },
                    lifecycle: { state: 'planned', activeFromRcl: 5 }
                },
                {
                    id: 'source1:container',
                    role: 'source_container',
                    structureType: STRUCTURE_CONTAINER,
                    pos: { x: 9, y: 10, roomName: 'W1N1' },
                    scope: { sourceId: 'source1' },
                    lifecycle: { state: 'active', activeFromRcl: 1 }
                }
            ]
        },
        cityPlanRuntimeObservation: {
            readyStreak: 3,
            readyForRuntimeFallbackDisable: true
        }
    };
    const strictLegacyRuntimeBlockedLinkMiner = {
        name: 'StrictLegacyRuntimeBlockedLinkMiner',
        room: blockedLinkMiningRoom,
        memory: {
            role: 'miner',
            homeRoom: 'W1N1',
            sourceId: 'source1',
            miningPos: { x: 9, y: 10, roomName: 'W1N1' }
        },
        pos: {
            x: 9,
            y: 10,
            roomName: 'W1N1',
            inRangeTo: (target, range) => {
                const pos = target.pos || target;
                return Math.max(Math.abs(pos.x - 9), Math.abs(pos.y - 10)) <= range;
            }
        },
        store: {
            getFreeCapacity: () => 0,
            getUsedCapacity: () => 50
        }
    };
    service.assignMiningTask(strictLegacyRuntimeBlockedLinkMiner);
    assert.deepStrictEqual(strictLegacyRuntimeBlockedLinkMiner.memory.task, {
        type: 'HARVEST',
        targetId: 'source1'
    }, 'miner should stop source-container fallback behavior when only legacy source runtime remains after the strict runtime gate opens');
    Game.getObjectById = (id) => {
        if (id === 'source1') return { id, pos: { x: 10, y: 10, roomName: 'W1N1' } };
        if (id === 'source2') return { id, pos: { x: 20, y: 20, roomName: 'W1N1' } };
        return null;
    };

    EventBus.topics = {};
    Game.rooms = {
        W1N1: {
            name: 'W1N1',
            controller: { my: true },
            energyAvailable: 550,
            energyCapacityAvailable: 550,
            find: () => []
        }
    };
    Game.creeps = {
        MinerA: { memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' }, body: [{ type: WORK }, { type: WORK }] },
        MinerB: { memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' }, body: [{ type: WORK }, { type: WORK }] }
    };
    service.ensureMiners('W1N1');
    assert.ok(!EventBus.topics.REQ_SPAWN, 'miner strategy should not publish spawn requests after spawn bureau owns spawning');
    const spawnBureau = new SpawnBureauService('SpawnBureau');
    spawnBureau.analyze();
    const uncoveredMinerRequest = EventBus.topics.REQ_SPAWN &&
        EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'miner' && event.data.memory.sourceId === 'source2');
    assert.ok(uncoveredMinerRequest, 'spawn bureau should cover uncovered sources, not just total miner count');
    assert.ok(!uncoveredMinerRequest.data.body.includes(CARRY), 'stationary miner spawn body should not include carry parts');

    EventBus.topics = {};
    Memory.rooms.W1N1 = {
        cityPlan: {
            sourceRuntime: {
                sources: {
                    source1: {
                        preferredOutputRole: 'source_link',
                        deliveryMode: 'transition'
                    },
                    source2: {
                        preferredOutputRole: 'source_container',
                        deliveryMode: 'container'
                    }
                }
            },
            sources: {
                source1: {
                    preferredOutputRole: 'source_link',
                    linkPos: { x: 11, y: 10, roomName: 'W1N1' }
                },
                source2: {
                    preferredOutputRole: 'source_container'
                }
            }
        }
    };
    Game.rooms.W1N1.find = () => [];
    spawnBureau.analyze();
    const linkMinerRequest = EventBus.topics.REQ_SPAWN &&
        EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'miner' && event.data.memory.sourceId === 'source1');
    assert.ok(linkMinerRequest && linkMinerRequest.data.body.includes(CARRY), 'spawn bureau should request a carry-capable miner body when the source is planned for source-link output');
    assert.strictEqual(getSourceOutputPolicy(Memory.rooms.W1N1.cityPlan, 'source1', {
        sourceRuntimeAllowLegacyFallback: true
    }).bodyProfile, 'link_miner', 'city asset policy should expose link-miner body selection for source-link output when callers explicitly opt into legacy runtime fallback');
    EventBus.topics = {};
    Memory.rooms.W1N1 = {
        cityPlan: {
            sources: {
                source1: {
                    preferredOutputRole: 'source_link',
                    deliveryMode: 'link_primary',
                    linkPos: { x: 11, y: 10, roomName: 'W1N1' }
                },
                source2: {
                    preferredOutputRole: 'source_container'
                }
            },
            plannedStructures: [{
                id: 'source1:link',
                role: 'source_link',
                structureType: STRUCTURE_LINK,
                pos: { x: 11, y: 10, roomName: 'W1N1' },
                scope: { sourceId: 'source1' },
                lifecycle: { state: 'planned', activeFromRcl: 5 }
            }]
        },
        cityPlanRuntimeObservation: {
            readyStreak: 3,
            readyForRuntimeFallbackDisable: true
        }
    };
    spawnBureau.analyze();
    const strictLegacyRuntimeMinerRequest = EventBus.topics.REQ_SPAWN &&
        EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'miner' && event.data.memory.sourceId === 'source1');
    assert.ok(strictLegacyRuntimeMinerRequest && !strictLegacyRuntimeMinerRequest.data.body.includes(CARRY), 'spawn bureau should stop requesting link-miner bodies when only legacy source runtime remains after the strict runtime gate opens');

    EventBus.topics = {};
    Memory.rooms.W1N1 = {
        cityPlan: {
            sourceRuntime: {
                sources: {
                    source1: {
                        preferredOutputRole: 'source_link',
                        deliveryMode: 'transition'
                    },
                    source2: {
                        preferredOutputRole: 'source_container',
                        deliveryMode: 'container'
                    }
                }
            },
            sources: {
                source1: {
                    preferredOutputRole: 'source_link'
                },
                source2: {
                    preferredOutputRole: 'source_container'
                }
            },
            plannedStructures: [{
                id: 'source1:link',
                role: 'source_link',
                structureType: STRUCTURE_LINK,
                pos: { x: 11, y: 10, roomName: 'W1N1' },
                scope: { sourceId: 'source1' },
                lifecycle: { state: 'planned', activeFromRcl: 5 }
            }]
        }
    };
    spawnBureau.analyze();
    const plannedOnlyLinkMinerRequest = EventBus.topics.REQ_SPAWN &&
        EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'miner' && event.data.memory.sourceId === 'source1');
    assert.ok(plannedOnlyLinkMinerRequest && plannedOnlyLinkMinerRequest.data.body.includes(CARRY), 'spawn bureau should request a carry-capable miner body when only a planned source-link asset exists');
    assert.strictEqual(getSourceOutputPolicy(Memory.rooms.W1N1.cityPlan, 'source1').outputAssetSource, 'planned', 'city asset policy should report planned source-link assets when deriving source output policy');
    EventBus.topics = {};
    Memory.rooms.W1N1 = {
        cityPlan: {
            sourceRuntime: {
                sources: {
                    source1: {
                        preferredOutputRole: 'source_link',
                        deliveryMode: 'transition'
                    }
                }
            },
            sources: {
                source1: {
                    preferredOutputRole: 'source_container',
                    deliveryMode: 'container'
                },
                source2: {
                    preferredOutputRole: 'source_container'
                }
            },
            plannedStructures: [{
                id: 'source1:link',
                role: 'source_link',
                structureType: STRUCTURE_LINK,
                pos: { x: 11, y: 10, roomName: 'W1N1' },
                scope: { sourceId: 'source1' },
                lifecycle: { state: 'planned', activeFromRcl: 5 }
            }]
        },
        cityPlanRuntimeObservation: {
            readyStreak: 3,
            readyForRuntimeFallbackDisable: true
        }
    };
    spawnBureau.analyze();
    const strictCanonicalRuntimeMinerRequest = EventBus.topics.REQ_SPAWN &&
        EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'miner' && event.data.memory.sourceId === 'source1');
    assert.ok(strictCanonicalRuntimeMinerRequest && strictCanonicalRuntimeMinerRequest.data.body.includes(CARRY), 'spawn bureau should preserve link-miner bodies when canonical source runtime remains valid after the strict runtime gate opens');
    Memory.rooms.W1N1 = {
        cityPlan: {
            sources: {
                source1: {
                    preferredOutputRole: 'source_link',
                    linkPos: { x: 11, y: 10, roomName: 'W1N1' }
                }
            },
            plannedStructures: []
        }
    };
    const legacyOnlySourceLinkPolicy = getSourceOutputPolicy(Memory.rooms.W1N1.cityPlan, 'source1');
    assert.strictEqual(legacyOnlySourceLinkPolicy.validRuntimeState, false, 'city asset policy should default to strict source-runtime reads when canonical runtime storage is missing');
    assert.strictEqual(legacyOnlySourceLinkPolicy.runtimeMode, 'invalid', 'city asset policy should report invalid runtime mode by default when canonical source runtime storage is missing');
    assert.strictEqual(legacyOnlySourceLinkPolicy.bodyProfile, 'miner', 'city asset policy should fall back to stationary miner bodies by default when only legacy source-link runtime storage exists');
    assert.strictEqual(legacyOnlySourceLinkPolicy.usesLinkOutput, false, 'city asset policy should disable source-link output by default when only legacy source runtime storage exists');
    assert.strictEqual(legacyOnlySourceLinkPolicy.outputAssetSource, 'none', 'city asset policy should report none once adapter no longer reads legacy-only source-link storage during strict rollout');
    assert.strictEqual(legacyOnlySourceLinkPolicy.outputAssetRole, null, 'city asset policy should clear source-link asset role when only legacy compatibility storage exists');
    const compatLegacyOnlySourceLinkPolicy = getSourceOutputPolicy(Memory.rooms.W1N1.cityPlan, 'source1', {
        sourceRuntimeAllowLegacyFallback: true
    });
    assert.strictEqual(compatLegacyOnlySourceLinkPolicy.validRuntimeState, true, 'city asset policy should fall back to canonical default runtime semantics when callers explicitly opt into non-strict reads without canonical runtime storage');
    assert.strictEqual(compatLegacyOnlySourceLinkPolicy.runtimeMode, 'container', 'city asset policy should treat missing canonical runtime storage as container-mode during non-strict fallback after legacy runtime removal');
    assert.strictEqual(compatLegacyOnlySourceLinkPolicy.bodyProfile, 'miner', 'city asset policy should not preserve legacy source-link runtime semantics once legacy runtime fallback is removed');
    assert.strictEqual(compatLegacyOnlySourceLinkPolicy.usesLinkOutput, false, 'city asset policy should disable source-link output once legacy runtime fallback is removed');
    const strictLegacyOnlySourceLinkPolicy = getSourceOutputPolicy(Memory.rooms.W1N1.cityPlan, 'source1', {
        sourceRuntimeAllowLegacyFallback: false
    });
    assert.strictEqual(strictLegacyOnlySourceLinkPolicy.validRuntimeState, false, 'city asset policy should surface invalid runtime state when strict source-runtime reads do not find canonical runtime storage');
    assert.strictEqual(strictLegacyOnlySourceLinkPolicy.runtimeMode, 'invalid', 'city asset policy should report invalid runtime mode when strict source-runtime reads do not find canonical runtime storage');
    assert.strictEqual(strictLegacyOnlySourceLinkPolicy.bodyProfile, 'miner', 'city asset policy should fall back to stationary miner bodies when strict source-runtime reads invalidate legacy-only source-link intent');
    assert.strictEqual(strictLegacyOnlySourceLinkPolicy.usesLinkOutput, false, 'city asset policy should disable source-link output when strict source-runtime reads invalidate legacy-only source-link intent');
    assert.strictEqual(strictLegacyOnlySourceLinkPolicy.shouldUseLinkMiner, false, 'city asset policy should not request link miners when strict source-runtime reads invalidate source-link intent');
    assert.strictEqual(strictLegacyOnlySourceLinkPolicy.shouldTransferToSourceLink, false, 'city asset policy should not transfer to source links when strict source-runtime reads invalidate source-link intent');
    const strictCanonicalSourceLinkPolicy = getSourceOutputPolicy({
        sourceRuntime: {
            sources: {
                source1: {
                    preferredOutputRole: 'source_link',
                    deliveryMode: 'transition'
                }
            }
        },
        sources: {
            source1: {
                preferredOutputRole: 'source_container',
                deliveryMode: 'container'
            }
        },
        plannedStructures: [{
            id: 'source1:link',
            role: 'source_link',
            structureType: STRUCTURE_LINK,
            pos: { x: 11, y: 10, roomName: 'W1N1' },
            scope: { sourceId: 'source1' },
            lifecycle: { state: 'planned', activeFromRcl: 5 }
        }]
    }, 'source1', {
        sourceRuntimeAllowLegacyFallback: false
    });
    assert.strictEqual(strictCanonicalSourceLinkPolicy.validRuntimeState, true, 'city asset policy should keep canonical source-runtime intent valid under strict reads');
    assert.strictEqual(strictCanonicalSourceLinkPolicy.bodyProfile, 'link_miner', 'city asset policy should preserve canonical link-miner intent under strict source-runtime reads');
    assert.strictEqual(strictCanonicalSourceLinkPolicy.usesLinkOutput, true, 'city asset policy should preserve canonical source-link output under strict source-runtime reads');
    Memory.rooms.W1N1 = {
        cityPlan: {
            plannedStructures: [{
                id: 'controller:container',
                role: 'controller_container',
                structureType: STRUCTURE_CONTAINER,
                pos: { x: 24, y: 25, roomName: 'W1N1' },
                lifecycle: { state: 'active', activeFromRcl: 1 }
            }]
        }
    };
    assert.strictEqual(spawnBureau.upgraderBodyProfile(Game.rooms.W1N1), 'stationary_upgrader', 'spawn bureau should prefer stationary upgrader bodies when only a planned controller container asset exists');
    assert.strictEqual(spawnBureau.desiredUpgraders(Game.rooms.W1N1), 1, 'spawn bureau should cap upgrader count when only a planned controller container asset exists');
    const previousSpawnRoom = Game.rooms.W1N1;
    Memory.rooms.W1N1 = {
        cityPlan: {
            controller: {
                containerPos: { x: 24, y: 25, roomName: 'W1N1' }
            }
        }
    };
    Game.rooms.W1N1 = {
        ...previousSpawnRoom,
        find: () => []
    };
    assert.strictEqual(spawnBureau.upgraderBodyProfile(Game.rooms.W1N1), 'upgrader', 'spawn bureau should not treat legacy-only controller container planning as canonical during strict rollout');
    assert.strictEqual(spawnBureau.desiredUpgraders(Game.rooms.W1N1), 1, 'spawn bureau should fall back to the default non-stationary upgrader quota when only legacy controller container planning exists');
    Game.rooms.W1N1 = previousSpawnRoom;

    EventBus.topics = {};
    Game.map = {
        getRoomTerrain: () => ({
            get: (x, y) => (x === 9 && y === 9 ? 0 : TERRAIN_MASK_WALL)
        })
    };
    Game.getObjectById = (id) => id === 'source1' ? { id, pos: { x: 10, y: 10, roomName: 'W1N1' } } : null;
    global.RoomCache = { W1N1: { sources: ['source1'] } };
    Game.creeps = {
        MinerA: {
            memory: {
                role: 'miner',
                homeRoom: 'W1N1',
                sourceId: 'source1',
                miningPos: { x: 9, y: 9, roomName: 'W1N1' }
            },
            body: [{ type: WORK }, { type: WORK }]
        }
    };
    spawnBureau.analyze();
    assert.ok(!EventBus.topics.REQ_SPAWN ||
        !EventBus.topics.REQ_SPAWN.some((event) => event.data.role === 'miner'), 'miner spawning should not exceed source open mining positions');

    EventBus.topics = {};
    Game.map = {
        getRoomTerrain: () => ({
            get: () => 0
        })
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true },
        storage: null,
        energyAvailable: 300,
        energyCapacityAvailable: 300
    };
    Game.getObjectById = (id) => ({ id, pos: { x: id === 'source1' ? 10 : 20, y: 10, roomName: 'W1N1' } });
    global.RoomCache = { W1N1: { sources: ['source1', 'source2'] } };
    Game.creeps = {
        MinerBootstrap: {
            memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' },
            body: [{ type: WORK }, { type: WORK }]
        }
    };
    global.Memory = { creeps: {}, rooms: {}, empire: {} };
    spawnBureau.analyze();
    assert.ok(!EventBus.topics.REQ_SPAWN ||
        !EventBus.topics.REQ_SPAWN.some((event) => event.data.role === 'miner'), 'bootstrap room should not request a second pure miner before an energy hauler exists');

    EventBus.topics = {};
    Game.map = {
        getRoomTerrain: () => ({
            get: () => 0
        })
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true },
        storage: { id: 'storage1' },
        energyAvailable: 300,
        energyCapacityAvailable: 550,
        find: () => []
    };
    Game.getObjectById = (id) => id === 'source1' ? { id, pos: { x: 10, y: 10, roomName: 'W1N1' } } : null;
    global.RoomCache = { W1N1: { sources: ['source1'] } };
    global.RoomPhase = { W1N1: { phase: 'storage', hasStorage: true } };
    Game.creeps = {
        RecoveryHauler: {
            memory: { role: 'hauler', homeRoom: 'W1N1' },
            body: [{ type: CARRY }, { type: MOVE }]
        }
    };
    Memory.creeps = {
        RecoveryHauler: {
            role: 'hauler',
            homeRoom: 'W1N1'
        }
    };
    spawnBureau.analyze();
    const recoveryMinerRequest = EventBus.topics.REQ_SPAWN &&
        EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'miner');
    const recoveryHaulerRequest = EventBus.topics.REQ_SPAWN &&
        EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'hauler');
    assert.ok(recoveryMinerRequest, 'spawn bureau should request a miner when a storage room has no mining workforce');
    assert.ok(recoveryMinerRequest.data.body.reduce((sum, part) => sum + BODYPART_COST[part], 0) <= Game.rooms.W1N1.energyAvailable, 'miner recovery body should be spawnable with currently available energy');
    assert.ok(!recoveryHaulerRequest || recoveryMinerRequest.priority > recoveryHaulerRequest.priority, 'miner recovery should outrank continued hauler expansion during starvation');

    EventBus.topics = {};
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true },
        storage: null,
        energyAvailable: 300,
        energyCapacityAvailable: 300
    };
    global.RoomPhase = { W1N1: { phase: 'bootstrap', hasStorage: false } };
    Game.creeps = {};
    global.RoomCache = { W1N1: { sources: ['source1'] } };
    Memory.creeps = {
        MinerSpawning: {
            role: 'miner',
            homeRoom: 'W1N1',
            sourceId: 'source1'
        }
    };
    Game.spawns = { PendingMinerSpawn: { room: Game.rooms.W1N1, spawning: { name: 'MinerSpawning' } } };
    spawnBureau.analyze();
    assert.ok(!EventBus.topics.REQ_SPAWN ||
        !EventBus.topics.REQ_SPAWN.some((event) => event.data.role === 'miner'), 'miner spawning should count miner memory created while a creep is still spawning');
    Game.spawns = {};

    EventBus.topics = {};
    Game.map = {
        getRoomTerrain: () => ({
            get: (x, y) => ((x === 9 && y === 10) || (x === 10 && y === 11) ? 0 : TERRAIN_MASK_WALL)
        })
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true },
        storage: null,
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        find: () => []
    };
    Game.getObjectById = (id) => id === 'source1' ? { id, pos: { x: 10, y: 10, roomName: 'W1N1' } } : null;
    global.RoomCache = { W1N1: { sources: ['source1'] } };
    Game.creeps = {
        MinerLeft: {
            room: { name: 'W1N1' },
            memory: { role: 'miner', sourceId: 'source1' },
            body: [{ type: WORK }, { type: WORK }]
        },
        MinerBottom: {
            room: { name: 'W1N1' },
            memory: { role: 'miner', sourceId: 'source1' },
            body: [{ type: WORK }, { type: WORK }]
        }
    };
    Memory.creeps = {};
    spawnBureau.analyze();
    assert.ok(!EventBus.topics.REQ_SPAWN ||
        !EventBus.topics.REQ_SPAWN.some((event) => event.data.role === 'miner'), 'spawn bureau should count live miners without homeRoom against source mining slots');

    EventBus.topics = {};
    Game.map = {
        getRoomTerrain: () => ({
            get: (x, y) => (x === 9 && y === 9 ? 0 : TERRAIN_MASK_WALL)
        })
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true },
        storage: null,
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        find: () => []
    };
    Game.getObjectById = (id) => id === 'source1' ? { id, pos: { x: 10, y: 10, roomName: 'W1N1' } } : null;
    global.RoomCache = { W1N1: { sources: ['source1'] } };
    Memory.creeps = {};
    Game.creeps = {
        RetiringMiner: {
            name: 'RetiringMiner',
            room: { name: 'W1N1' },
            ticksToLive: 20,
            memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' },
            body: [{ type: WORK }, { type: WORK }, { type: MOVE }]
        },
        StableHauler: {
            name: 'StableHauler',
            room: { name: 'W1N1' },
            ticksToLive: 1000,
            memory: { role: 'hauler', homeRoom: 'W1N1' },
            body: [{ type: CARRY }, { type: MOVE }]
        }
    };
    spawnBureau.analyze();
    assert.ok(EventBus.topics.REQ_SPAWN &&
        EventBus.topics.REQ_SPAWN.some((event) => event.data.role === 'miner' && event.data.memory.sourceId === 'source1'), 'spawn bureau should pre-spawn replacement miners before the current miner expires');

    Game.map = {
        getRoomTerrain: () => ({
            get: () => 0
        })
    };
    const blockedMiningPositions = service.getOpenMiningPositions({
        name: 'W1N1',
        find: (type) => type === FIND_STRUCTURES ? [{
            structureType: STRUCTURE_SPAWN,
            pos: { x: 9, y: 9 }
        }] : []
    }, { id: 'source1', pos: { x: 10, y: 10, roomName: 'W1N1' } });
    assert.ok(!blockedMiningPositions.some((pos) => pos.x === 9 && pos.y === 9), 'source mining positions should exclude blocking structures');

    const dangerousMiningRoom = {
        name: 'W1N1',
        find: (type) => {
            if (type === FIND_HOSTILE_CREEPS) {
                return [{
                    pos: {
                        x: 7,
                        y: 7,
                        getRangeTo: (pos) => Math.max(Math.abs(pos.x - 7), Math.abs(pos.y - 7))
                    },
                    getActiveBodyparts: (part) => part === RANGED_ATTACK ? 1 : 0
                }];
            }
            if (type === FIND_STRUCTURES) return [];
            return [];
        }
    };
    const sourceNearHostile = { id: 'source1', pos: { x: 10, y: 10, roomName: 'W1N1' } };
    global.Memory = {
        rooms: {
            W1N1: {
                cityPlan: {
                    sources: {
                        source1: {
                            primaryMiningPos: { x: 9, y: 9, roomName: 'W1N1' }
                        }
                    }
                }
            }
        },
        empire: {}
    };
    const safeMiningPos = service.pickMiningPos(dangerousMiningRoom, sourceNearHostile, null);
    assert.notDeepStrictEqual(safeMiningPos, { x: 9, y: 9, roomName: 'W1N1' }, 'miner should not use planned mining positions inside hostile ranged attack range');
    assert.ok(!service.isPositionDangerous(dangerousMiningRoom, safeMiningPos), 'miner should choose a safe mining position when one exists');

    Game.map = {
        getRoomTerrain: () => ({
            get: (x, y) => ((x === 9 && y === 10) || (x === 10 && y === 11) ? 0 : TERRAIN_MASK_WALL)
        })
    };
    global.Memory = {
        rooms: {
            W1N1: {
                cityPlan: {
                    sources: {
                        source1: {
                            primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' }
                        }
                    }
                }
            }
        },
        creeps: {},
        empire: {}
    };
    const twoSlotRoom = {
        name: 'W1N1',
        find: (type) => type === FIND_STRUCTURES || type === FIND_HOSTILE_CREEPS ? [] : []
    };
    const twoSlotSource = { id: 'source1', pos: { x: 10, y: 10, roomName: 'W1N1' } };
    const plannedOccupant = {
        name: 'MinerOnPlanned',
        room: twoSlotRoom,
        memory: {
            role: 'miner',
            homeRoom: 'W1N1',
            sourceId: 'source1',
            miningPos: { x: 9, y: 10, roomName: 'W1N1' }
        }
    };
    const secondMiner = {
        name: 'MinerSecond',
        room: twoSlotRoom,
        memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' },
        pos: {
            x: 8,
            y: 10,
            roomName: 'W1N1',
            inRangeTo: () => false
        }
    };
    Game.creeps = { MinerOnPlanned: plannedOccupant, MinerSecond: secondMiner };
    Game.getObjectById = (id) => id === 'source1' ? twoSlotSource : null;
    service.assignMiningTask(secondMiner);
    assert.deepStrictEqual(secondMiner.memory.miningPos, { x: 10, y: 11, roomName: 'W1N1' }, 'miner should choose an unoccupied valid mining position when planned position is occupied');

    const haulerRoom = { name: 'W1N1' };
    const hauler = {
        room: haulerRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        store: {
            getUsedCapacity: () => 0,
            getFreeCapacity: () => 150
        }
    };
    const haulerService = new HaulerStrategyService('HaulerStrategy');
    global.ResourceMarketService = {
        assignHauler: (creep) => {
            creep.memory.task = { type: 'PICKUP', targetId: 'drop1' };
            return true;
        }
    };
    haulerService.assignHaulerTask(hauler);
    assert.deepStrictEqual(hauler.memory.task, {
        type: 'PICKUP',
        targetId: 'drop1'
    }, 'hauler strategy should delegate empty-hauler assignment to resource market');

    const loadedHaulerWithFullEconomy = {
        room: { name: 'W1N1' },
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        store: {
            getUsedCapacity: () => 100
        }
    };
    global.ResourceMarketService.assignHauler = (creep) => {
        creep.memory.task = {
            type: 'TRANSFER',
            targetId: 'depositContainer',
            resourceType: RESOURCE_ENERGY
        };
        return true;
    };
    haulerService.assignHaulerTask(loadedHaulerWithFullEconomy);
    assert.deepStrictEqual(loadedHaulerWithFullEconomy.memory.task, {
        type: 'TRANSFER',
        targetId: 'depositContainer',
        resourceType: RESOURCE_ENERGY
    }, 'hauler strategy should delegate loaded-hauler assignment to resource market');

    EventBus.topics = {};
    Game.rooms.W1N1 = {
        name: 'W1N1',
        storage: null,
        energyAvailable: 500,
        energyCapacityAvailable: 500
    };
    Game.creeps = {};
    haulerService.ensureHaulers(Game.rooms.W1N1);
    assert.ok(!EventBus.topics.REQ_SPAWN, 'hauler strategy should not publish spawn requests after spawn bureau owns spawning');
    spawnBureau.analyze();
    assert.ok(EventBus.topics.REQ_SPAWN && EventBus.topics.REQ_SPAWN.some((event) => event.data.role === 'hauler'), 'spawn bureau should request haulers when under capacity');
    const haulerRequest = EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'hauler');
    assert.ok(haulerRequest.data.body.length <= 4, 'first hauler spawn body should stay compact for faster logistics recovery');

    const controller = { id: 'controller1', pos: { x: 25, y: 25, roomName: 'W1N1' } };
    const upgraderRoom = {
        name: 'W1N1',
        controller,
        storage: {
            id: 'storage1',
            store: { getUsedCapacity: () => 1000 }
        },
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        find: () => []
    };
    EventBus.topics = {};
    Game.rooms.W1N1 = upgraderRoom;
    Game.creeps = {};
    const upgraderService = new UpgraderStrategyService('UpgraderStrategy');
    upgraderService.ensureUpgraders(upgraderRoom);
    assert.ok(!EventBus.topics.REQ_SPAWN, 'upgrader strategy should not publish spawn requests after spawn bureau owns spawning');
    Game.creeps = {
        MinerCore: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        HaulerCore: { memory: { role: 'hauler', homeRoom: 'W1N1' } }
    };
    spawnBureau.analyze();
    assert.ok(EventBus.topics.REQ_SPAWN && EventBus.topics.REQ_SPAWN.some((event) => event.data.role === 'upgrader'), 'spawn bureau should request upgrader creeps');
    assert.strictEqual(EventBus.topics.REQ_SPAWN.filter((event) => event.data.role === 'upgrader').length, 1, 'storage rooms with controller container planning should only request one stationary upgrader');

    EventBus.topics = {};
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller,
        storage: null,
        energyAvailable: 300,
        energyCapacityAvailable: 300,
        find: () => []
    };
    Game.creeps = {
        MinerCore: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        HaulerCore: { memory: { role: 'hauler', homeRoom: 'W1N1' } }
    };
    spawnBureau.analyze();
    const firstUpgraderRequest = EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'upgrader');
    assert.ok(firstUpgraderRequest.priority > 50, 'first upgrader should outrank continued miner expansion once mining logistics exist');

    const emptyUpgrader = {
        room: upgraderRoom,
        memory: { role: 'upgrader', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 0 }
    };
    upgraderService.assignUpgraderTask(emptyUpgrader);
    assert.deepStrictEqual(emptyUpgrader.memory.task, {
        type: 'WITHDRAW',
        targetId: 'storage1',
        resourceType: RESOURCE_ENERGY
    }, 'empty upgrader should withdraw energy');

    const loadedUpgrader = {
        room: upgraderRoom,
        memory: { role: 'upgrader', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    upgraderService.assignUpgraderTask(loadedUpgrader);
    assert.deepStrictEqual(loadedUpgrader.memory.task, {
        type: 'UPGRADE',
        targetId: 'controller1'
    }, 'loaded upgrader should upgrade controller');

    Memory.rooms.W1N1 = {
        cityPlan: {
            controller: {
                primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' },
                linkPos: { x: 24, y: 24, roomName: 'W1N1' }
            }
        }
    };
    const controllerLink = {
        id: 'controllerLink1',
        structureType: STRUCTURE_LINK,
        pos: { x: 24, y: 24, roomName: 'W1N1' },
        store: { getUsedCapacity: () => 400 }
    };
    const linkBackedUpgraderRoom = {
        name: 'W1N1',
        controller,
        storage: null,
        find: (type, opts = {}) => {
            let results = [];
            if (type === FIND_STRUCTURES) results = [controllerLink];
            if (opts.filter) return results.filter(opts.filter);
            return results;
        }
    };
    const linkBackedUpgrader = {
        room: linkBackedUpgraderRoom,
        pos: { x: 24, y: 25, roomName: 'W1N1', inRangeTo: (x, y, range) => Math.max(Math.abs(x - 24), Math.abs(y - 25)) <= range },
        memory: { role: 'upgrader', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 0 }
    };
    upgraderService.assignUpgraderTask(linkBackedUpgrader);
    assert.strictEqual(linkBackedUpgrader.memory.task, undefined, 'upgrader should not withdraw from legacy-only controller links during strict rollout');

    const controllerContainer = {
        id: 'controllerContainer1',
        structureType: STRUCTURE_CONTAINER,
        pos: { x: 24, y: 25, roomName: 'W1N1' },
        store: { getUsedCapacity: () => 150 }
    };
    Memory.rooms.W1N1 = {
        cityPlan: {
            controller: {
                primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' },
                containerPos: { x: 24, y: 25, roomName: 'W1N1' }
            }
        }
    };
    Game.getObjectById = (id) => {
        if (id === 'controller1') return controller;
        if (id === 'controllerContainer1') return controllerContainer;
        return null;
    };
    global.ResourceMarket = { W1N1: { supplyMode: 'hauler_supply' } };
    const stationedUpgrader = {
        id: 'upgrader1',
        name: 'Upgrader1',
        room: {
            name: 'W1N1',
            controller,
            storage: { id: 'storage1', store: { getUsedCapacity: () => 1000 } },
            find: (type) => type === FIND_STRUCTURES ? [controllerContainer] : []
        },
        pos: { inRangeTo: (x, y, range) => x === 24 && y === 25 && range === 0 },
        memory: { role: 'upgrader', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 }
    };
    EventBus.topics = {};
    upgraderService.assignUpgraderTask(stationedUpgrader);
    assert.deepStrictEqual(stationedUpgrader.memory.task, {
        type: 'WITHDRAW',
        targetId: 'controllerContainer1',
        resourceType: RESOURCE_ENERGY
    }, 'upgrader should withdraw from controller container before waiting for hauler supply');

    const controllerLinkBackedContainer = {
        id: 'controllerContainerLifecycle',
        structureType: STRUCTURE_CONTAINER,
        pos: { x: 24, y: 25, roomName: 'W1N1' },
        store: { getUsedCapacity: () => 150 }
    };
    const controllerLifecycleLink = {
        id: 'controllerLinkLifecycle',
        structureType: STRUCTURE_LINK,
        pos: { x: 24, y: 24, roomName: 'W1N1' },
        store: { getUsedCapacity: () => 400 }
    };
    Memory.rooms.W1N1 = {
        cityPlan: {
            controller: {
                primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' },
                containerPos: { x: 24, y: 25, roomName: 'W1N1' },
                linkPos: { x: 24, y: 24, roomName: 'W1N1' }
            },
            plannedStructures: [{
                id: 'controller:container',
                role: 'controller_container',
                structureType: STRUCTURE_CONTAINER,
                pos: { x: 24, y: 25, roomName: 'W1N1' },
                lifecycle: { state: 'link_primary', activeFromRcl: 1, replacement: 'controller:link' }
            }]
        }
    };
    Game.getObjectById = (id) => {
        if (id === 'controller1') return controller;
        if (id === 'controllerContainerLifecycle') return controllerLinkBackedContainer;
        if (id === 'controllerLinkLifecycle') return controllerLifecycleLink;
        return null;
    };
    const linkPrimaryUpgrader = {
        id: 'upgraderLinkPrimary',
        name: 'UpgraderLinkPrimary',
        room: {
            name: 'W1N1',
            controller,
            find: (type) => type === FIND_STRUCTURES ? [controllerLinkBackedContainer, controllerLifecycleLink] : []
        },
        pos: { inRangeTo: (x, y, range) => x === 24 && y === 25 && range === 0 },
        memory: { role: 'upgrader', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 }
    };
    upgraderService.assignUpgraderTask(linkPrimaryUpgrader);
    assert.deepStrictEqual(linkPrimaryUpgrader.memory.task, {
        type: 'WITHDRAW',
        targetId: 'controllerContainerLifecycle',
        resourceType: RESOURCE_ENERGY
    }, 'upgrader should fall back to controller container when the controller link exists only in legacy compatibility storage during strict rollout');

    const plannedOnlyControllerContainer = {
        id: 'plannedControllerContainer',
        structureType: STRUCTURE_CONTAINER,
        pos: { x: 22, y: 25, roomName: 'W1N1' },
        store: { getUsedCapacity: () => 150 }
    };
    const unplannedCloserControllerContainer = {
        id: 'decoyControllerContainer',
        structureType: STRUCTURE_CONTAINER,
        pos: { x: 24, y: 25, roomName: 'W1N1' },
        store: { getUsedCapacity: () => 150 }
    };
    const plannedOnlyControllerLink = {
        id: 'plannedControllerLink',
        structureType: STRUCTURE_LINK,
        pos: { x: 22, y: 24, roomName: 'W1N1' },
        store: { getUsedCapacity: () => 500 }
    };
    const unplannedCloserControllerLink = {
        id: 'decoyControllerLink',
        structureType: STRUCTURE_LINK,
        pos: { x: 24, y: 24, roomName: 'W1N1' },
        store: { getUsedCapacity: () => 500 }
    };
    Memory.rooms.W1N1 = {
        cityPlan: {
            controller: {
                primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' }
            },
            plannedStructures: [
                {
                    id: 'controller:container',
                    role: 'controller_container',
                    structureType: STRUCTURE_CONTAINER,
                    pos: { x: 22, y: 25, roomName: 'W1N1' },
                    lifecycle: { state: 'link_primary', activeFromRcl: 1, replacement: 'controller:link' }
                },
                {
                    id: 'controller:link',
                    role: 'controller_link',
                    structureType: STRUCTURE_LINK,
                    pos: { x: 22, y: 24, roomName: 'W1N1' },
                    lifecycle: { state: 'planned', activeFromRcl: 5 }
                }
            ]
        }
    };
    const plannedAssetUpgrader = {
        id: 'upgraderPlannedAssets',
        name: 'UpgraderPlannedAssets',
        room: {
            name: 'W1N1',
            controller,
            find: (type) => type === FIND_STRUCTURES ? [
                unplannedCloserControllerContainer,
                plannedOnlyControllerContainer,
                unplannedCloserControllerLink,
                plannedOnlyControllerLink
            ] : []
        },
        pos: { inRangeTo: (x, y, range) => x === 24 && y === 25 && range === 0 },
        memory: { role: 'upgrader', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 }
    };
    upgraderService.assignUpgraderTask(plannedAssetUpgrader);
    assert.deepStrictEqual(plannedAssetUpgrader.memory.task, {
        type: 'WITHDRAW',
        targetId: 'plannedControllerLink',
        resourceType: RESOURCE_ENERGY
    }, 'upgrader should resolve controller container and link assets from planned structures even when legacy positions are absent');

    controllerContainer.store.getUsedCapacity = () => 0;
    const waitingUpgrader = {
        id: 'upgrader2',
        name: 'Upgrader2',
        room: stationedUpgrader.room,
        pos: stationedUpgrader.pos,
        memory: { role: 'upgrader', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 }
    };
    EventBus.topics = {};
    upgraderService.assignUpgraderTask(waitingUpgrader);
    assert.strictEqual(waitingUpgrader.memory.task, undefined, 'upgrader should wait when controller container is empty in hauler supply mode');
    assert.ok(global.ResourceMarket.W1N1.demands.some((demand) => demand.targetId === 'controllerContainer1' && demand.resourceType === RESOURCE_ENERGY), 'upgrader should register controller container refill demand when the buffer is empty');
    global.ResourceMarket = {};

    const builderService = new BuilderStrategyService('BuilderStrategy');
    const buildSite = { id: 'site1', pos: { x: 15, y: 15, roomName: 'W1N1' } };
    Game.map = {
        getRoomTerrain: () => ({
            get: () => 0
        })
    };
    global.RoomCache.W1N1 = { constructionSites: ['site1'] };
    const builder = {
        room: {
            name: 'W1N1',
            controller,
            find: (type) => {
                if (type !== FIND_STRUCTURES) return [];
                return [{ structureType: STRUCTURE_ROAD, pos: { x: 14, y: 15, roomName: 'W1N1' } }];
            }
        },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    const builderTwo = {
        room: builder.room,
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    Game.creeps = {
        BuilderOne: builder,
        BuilderTwo: builderTwo
    };
    Game.getObjectById = (id) => id === 'site1' ? buildSite : null;
    builderService.assignBuilderTask(builder);
    builderService.assignBuilderTask(builderTwo);
    assert.deepStrictEqual(builder.memory.task, {
        type: 'BUILD',
        targetId: 'site1',
        workPos: { x: 14, y: 14, roomName: 'W1N1' },
        workPosReservedAt: Game.time
    }, 'loaded builder should build construction sites before other work and reserve an off-road work position');
    assert.deepStrictEqual(builderTwo.memory.task, {
        type: 'BUILD',
        targetId: 'site1',
        workPos: { x: 14, y: 16, roomName: 'W1N1' },
        workPosReservedAt: Game.time
    }, 'builders targeting the same site should reserve different work positions');

    const roadSite = {
        id: 'roadSite',
        structureType: STRUCTURE_ROAD,
        progress: 0,
        progressTotal: 300,
        pos: { x: 12, y: 12, roomName: 'W1N1' }
    };
    const spawnSite = {
        id: 'spawnSite',
        structureType: STRUCTURE_SPAWN,
        progress: 0,
        progressTotal: 5000,
        pos: { x: 18, y: 18, roomName: 'W1N1' }
    };
    const prioritizedRoom = {
        name: 'W1N1',
        controller,
        find: (type, opts) => {
            if (type === FIND_CONSTRUCTION_SITES) return [roadSite, spawnSite];
            if (type !== FIND_STRUCTURES) return [];
            const structures = [{ structureType: STRUCTURE_ROAD, pos: { x: 17, y: 18, roomName: 'W1N1' } }];
            return opts && opts.filter ? structures.filter(opts.filter) : structures;
        }
    };
    const prioritizedBuilderOne = {
        name: 'PrioritizedBuilderOne',
        room: prioritizedRoom,
        pos: { x: 10, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.max(Math.abs(pos.x - 10), Math.abs(pos.y - 10)) },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    const prioritizedBuilderTwo = {
        name: 'PrioritizedBuilderTwo',
        room: prioritizedRoom,
        pos: { x: 11, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.max(Math.abs(pos.x - 11), Math.abs(pos.y - 10)) },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    Game.creeps = {
        PrioritizedBuilderOne: prioritizedBuilderOne,
        PrioritizedBuilderTwo: prioritizedBuilderTwo
    };
    global.RoomCache.W1N1 = { constructionSites: ['roadSite', 'spawnSite'] };
    Game.getObjectById = (id) => {
        if (id === 'roadSite') return roadSite;
        if (id === 'spawnSite') return spawnSite;
        return null;
    };
    builderService.assignBuilderTask(prioritizedBuilderOne);
    builderService.assignBuilderTask(prioritizedBuilderTwo);
    assert.strictEqual(prioritizedBuilderOne.memory.task.targetId, 'spawnSite', 'builder should prioritize high-value construction sites over lower-value nearby roads');
    assert.strictEqual(prioritizedBuilderTwo.memory.task.targetId, 'spawnSite', 'multiple builders should still be allowed to converge on the same high-priority construction site');
    assert.notDeepStrictEqual(prioritizedBuilderOne.memory.task.workPos, prioritizedBuilderTwo.memory.task.workPos, 'multiple builders on the same prioritized site should reserve different work positions');

    const nearExtensionSite = {
        id: 'nearExtensionSite',
        structureType: STRUCTURE_EXTENSION,
        progress: 0,
        progressTotal: 3000,
        pos: { x: 13, y: 13, roomName: 'W1N1' }
    };
    const farExtensionSite = {
        id: 'farExtensionSite',
        structureType: STRUCTURE_EXTENSION,
        progress: 0,
        progressTotal: 3000,
        pos: { x: 25, y: 25, roomName: 'W1N1' }
    };
    const distanceBuilder = {
        name: 'DistanceBuilder',
        room: {
            name: 'W1N1',
            controller,
            find: (type) => type === FIND_CONSTRUCTION_SITES ? [farExtensionSite, nearExtensionSite] : []
        },
        pos: { x: 12, y: 12, roomName: 'W1N1', getRangeTo: (pos) => Math.max(Math.abs(pos.x - 12), Math.abs(pos.y - 12)) },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    Game.creeps = { DistanceBuilder: distanceBuilder };
    global.RoomCache.W1N1 = { constructionSites: ['farExtensionSite', 'nearExtensionSite'] };
    Game.getObjectById = (id) => {
        if (id === 'farExtensionSite') return farExtensionSite;
        if (id === 'nearExtensionSite') return nearExtensionSite;
        return null;
    };
    builderService.assignBuilderTask(distanceBuilder);
    assert.strictEqual(distanceBuilder.memory.task.targetId, 'nearExtensionSite', 'builder should prefer the nearer site when structure priority is otherwise equal');

    const earlyCriticalRoadSite = {
        id: 'earlyCriticalRoadSite',
        structureType: STRUCTURE_ROAD,
        progress: 0,
        progressTotal: 300,
        pos: { x: 16, y: 16, roomName: 'W1N1' }
    };
    const earlyStorageSite = {
        id: 'earlyStorageSite',
        structureType: STRUCTURE_STORAGE,
        progress: 0,
        progressTotal: 5000,
        pos: { x: 17, y: 16, roomName: 'W1N1' }
    };
    const earlyPhaseBuilder = {
        name: 'EarlyPhaseBuilder',
        room: {
            name: 'W1N1',
            controller,
            find: (type, opts) => {
                if (type === FIND_CONSTRUCTION_SITES) return [earlyStorageSite, earlyCriticalRoadSite];
                if (type !== FIND_STRUCTURES) return [];
                const structures = [{ structureType: STRUCTURE_ROAD, pos: { x: 15, y: 16, roomName: 'W1N1' } }];
                return opts && opts.filter ? structures.filter(opts.filter) : structures;
            }
        },
        pos: { x: 15, y: 15, roomName: 'W1N1', getRangeTo: (pos) => Math.max(Math.abs(pos.x - 15), Math.abs(pos.y - 15)) },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    Game.creeps = { EarlyPhaseBuilder: earlyPhaseBuilder };
    global.RoomPhase = { W1N1: { phase: 'early' } };
    Memory.rooms.W1N1 = {
        ...(Memory.rooms.W1N1 || {}),
        roadNetwork: ['16,16'],
        cityPlan: {
            center: { x: 15, y: 15, roomName: 'W1N1' },
            sources: {},
            controller: { containerPos: { x: 20, y: 20, roomName: 'W1N1' } }
        }
    };
    global.RoomCache.W1N1 = { constructionSites: ['earlyStorageSite', 'earlyCriticalRoadSite'] };
    Game.getObjectById = (id) => {
        if (id === 'earlyStorageSite') return earlyStorageSite;
        if (id === 'earlyCriticalRoadSite') return earlyCriticalRoadSite;
        return null;
    };
    builderService.assignBuilderTask(earlyPhaseBuilder);
    assert.strictEqual(earlyPhaseBuilder.memory.task.targetId, 'earlyCriticalRoadSite', 'early-phase builders should prioritize critical planned roads ahead of adjacent storage construction');

    const storagePhaseRoadSite = {
        id: 'storagePhaseRoadSite',
        structureType: STRUCTURE_ROAD,
        progress: 0,
        progressTotal: 300,
        pos: { x: 18, y: 18, roomName: 'W1N1' }
    };
    const storagePhaseStorageSite = {
        id: 'storagePhaseStorageSite',
        structureType: STRUCTURE_STORAGE,
        progress: 0,
        progressTotal: 5000,
        pos: { x: 19, y: 18, roomName: 'W1N1' }
    };
    const storagePhaseBuilder = {
        name: 'StoragePhaseBuilder',
        room: {
            name: 'W1N1',
            controller,
            find: (type) => type === FIND_CONSTRUCTION_SITES ? [storagePhaseRoadSite, storagePhaseStorageSite] : []
        },
        pos: { x: 17, y: 17, roomName: 'W1N1', getRangeTo: (pos) => Math.max(Math.abs(pos.x - 17), Math.abs(pos.y - 17)) },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    Game.creeps = { StoragePhaseBuilder: storagePhaseBuilder };
    global.RoomPhase = { W1N1: { phase: 'storage' } };
    Memory.rooms.W1N1 = {
        ...(Memory.rooms.W1N1 || {}),
        roadNetwork: [],
        cityPlan: {
            center: { x: 17, y: 17, roomName: 'W1N1' },
            sources: {},
            controller: { containerPos: { x: 20, y: 20, roomName: 'W1N1' } }
        }
    };
    global.RoomCache.W1N1 = { constructionSites: ['storagePhaseRoadSite', 'storagePhaseStorageSite'] };
    Game.getObjectById = (id) => {
        if (id === 'storagePhaseRoadSite') return storagePhaseRoadSite;
        if (id === 'storagePhaseStorageSite') return storagePhaseStorageSite;
        return null;
    };
    builderService.assignBuilderTask(storagePhaseBuilder);
    assert.strictEqual(storagePhaseBuilder.memory.task.targetId, 'storagePhaseStorageSite', 'storage-phase builders should prioritize storage over non-critical roads');

    const incompleteRoadSite = {
        id: 'incompleteRoadSite',
        structureType: STRUCTURE_ROAD,
        progress: 0,
        progressTotal: 300,
        pos: { x: 21, y: 21, roomName: 'W1N1' }
    };
    const incompleteStorageSite = {
        id: 'incompleteStorageSite',
        structureType: STRUCTURE_STORAGE,
        progress: 0,
        progressTotal: 5000,
        pos: { x: 22, y: 21, roomName: 'W1N1' }
    };
    const incompleteRoadNetworkBuilder = {
        name: 'IncompleteRoadNetworkBuilder',
        room: {
            name: 'W1N1',
            controller,
            find: (type, opts) => {
                if (type === FIND_CONSTRUCTION_SITES) return [incompleteRoadSite, incompleteStorageSite];
                if (type !== FIND_STRUCTURES) return [];
                const structures = [{ structureType: STRUCTURE_ROAD, pos: { x: 20, y: 20, roomName: 'W1N1' } }];
                return opts && opts.filter ? structures.filter(opts.filter) : structures;
            }
        },
        pos: { x: 20, y: 20, roomName: 'W1N1', getRangeTo: (pos) => Math.max(Math.abs(pos.x - 20), Math.abs(pos.y - 20)) },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    Game.creeps = { IncompleteRoadNetworkBuilder: incompleteRoadNetworkBuilder };
    global.RoomPhase = { W1N1: { phase: 'storage' } };
    Memory.rooms.W1N1 = {
        ...(Memory.rooms.W1N1 || {}),
        roadNetwork: ['20,20', '21,21', '22,22', '23,23'],
        cityPlan: {
            center: { x: 20, y: 20, roomName: 'W1N1' },
            sources: {},
            controller: { containerPos: { x: 24, y: 24, roomName: 'W1N1' } }
        }
    };
    global.RoomCache.W1N1 = { constructionSites: ['incompleteRoadSite', 'incompleteStorageSite'] };
    Game.getObjectById = (id) => {
        if (id === 'incompleteRoadSite') return incompleteRoadSite;
        if (id === 'incompleteStorageSite') return incompleteStorageSite;
        return null;
    };
    builderService.assignBuilderTask(incompleteRoadNetworkBuilder);
    assert.strictEqual(incompleteRoadNetworkBuilder.memory.task.targetId, 'incompleteRoadSite', 'storage-phase builders should still prioritize critical roads while the planned road network is largely incomplete');

    const sourceContainerSite = {
        id: 'sourceContainerSite',
        structureType: STRUCTURE_CONTAINER,
        progress: 0,
        progressTotal: 5000,
        pos: { x: 9, y: 10, roomName: 'W1N1' }
    };
    const ordinaryContainerSite = {
        id: 'ordinaryContainerSite',
        structureType: STRUCTURE_CONTAINER,
        progress: 0,
        progressTotal: 5000,
        pos: { x: 14, y: 14, roomName: 'W1N1' }
    };
    const containerPriorityBuilder = {
        name: 'ContainerPriorityBuilder',
        room: {
            name: 'W1N1',
            controller,
            find: (type) => type === FIND_CONSTRUCTION_SITES ? [ordinaryContainerSite, sourceContainerSite] : []
        },
        pos: { x: 13, y: 13, roomName: 'W1N1', getRangeTo: (pos) => Math.max(Math.abs(pos.x - 13), Math.abs(pos.y - 13)) },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    Game.creeps = { ContainerPriorityBuilder: containerPriorityBuilder };
    global.RoomPhase = { W1N1: { phase: 'early' } };
    Memory.rooms.W1N1 = {
        ...(Memory.rooms.W1N1 || {}),
        roadNetwork: [],
        cityPlan: {
            center: { x: 13, y: 13, roomName: 'W1N1' },
            sources: {
                source1: {
                    containerPos: { x: 9, y: 10, roomName: 'W1N1' }
                }
            },
            controller: { containerPos: { x: 20, y: 20, roomName: 'W1N1' } }
        }
    };
    global.RoomCache.W1N1 = { constructionSites: ['ordinaryContainerSite', 'sourceContainerSite'] };
    Game.getObjectById = (id) => {
        if (id === 'ordinaryContainerSite') return ordinaryContainerSite;
        if (id === 'sourceContainerSite') return sourceContainerSite;
        return null;
    };
    builderService.assignBuilderTask(containerPriorityBuilder);
    assert.strictEqual(containerPriorityBuilder.memory.task.targetId, 'ordinaryContainerSite', 'builder should not treat legacy-only source container planning as canonical during strict rollout');
    assert.strictEqual(resolveSourceContainerAsset(Memory.rooms.W1N1.cityPlan, 'source1').source, 'none', 'legacy adapter should report none once legacy-only source-container storage is no longer read');
    assert.strictEqual(resolveSourceContainerAsset(Memory.rooms.W1N1.cityPlan, 'source1', { allowLegacyFallback: true }).source, 'none', 'legacy adapter should keep reporting none even when compat fallback is requested after adapter hard retirement');

    const plannedStructureOnlyBuilder = {
        name: 'PlannedStructureOnlyBuilder',
        room: {
            name: 'W1N1',
            controller,
            find: (type) => type === FIND_CONSTRUCTION_SITES ? [ordinaryContainerSite, sourceContainerSite] : []
        },
        pos: { x: 13, y: 13, roomName: 'W1N1', getRangeTo: (pos) => Math.max(Math.abs(pos.x - 13), Math.abs(pos.y - 13)) },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    Game.creeps = { PlannedStructureOnlyBuilder: plannedStructureOnlyBuilder };
    Memory.rooms.W1N1.cityPlan = {
        center: { x: 13, y: 13, roomName: 'W1N1' },
        plannedStructures: [{
            id: 'source1:container',
            role: 'source_container',
            structureType: STRUCTURE_CONTAINER,
            pos: { x: 9, y: 10, roomName: 'W1N1' },
            scope: { sourceId: 'source1' },
            lifecycle: { state: 'active', activeFromRcl: 1, activeUntilRcl: 5 }
        }]
    };
    builderService.assignBuilderTask(plannedStructureOnlyBuilder);
    assert.strictEqual(plannedStructureOnlyBuilder.memory.task.targetId, 'sourceContainerSite', 'builder should still identify critical containers through plannedStructures when legacy cityPlan fields are absent');
    assert.strictEqual(resolveSourceContainerAsset(Memory.rooms.W1N1.cityPlan, 'source1').source, 'planned', 'legacy adapter should report planned source for source container assets');

    const hubLinkSite = {
        id: 'hubLinkSite',
        structureType: STRUCTURE_LINK,
        pos: { x: 16, y: 15, roomName: 'W1N1' },
        progress: 0,
        progressTotal: 100
    };
    const extractorSite = {
        id: 'extractorSite',
        structureType: STRUCTURE_EXTRACTOR,
        pos: { x: 14, y: 15, roomName: 'W1N1' },
        progress: 0,
        progressTotal: 100
    };
    Memory.rooms.W1N1.cityPlan = {
        center: { x: 15, y: 15, roomName: 'W1N1' },
        plannedStructures: [
            {
                id: 'hub:link',
                role: 'hub_link',
                structureType: STRUCTURE_LINK,
                pos: { x: 16, y: 15, roomName: 'W1N1' },
                phase: 'logistics_link',
                group: 'logistics',
                lifecycle: { state: 'planned', activeFromRcl: 5 }
            },
            {
                id: 'mineral:mineral1:extractor',
                role: 'mineral_extractor',
                structureType: STRUCTURE_EXTRACTOR,
                pos: { x: 14, y: 15, roomName: 'W1N1' },
                phase: 'industry',
                group: 'industry',
                lifecycle: { state: 'planned', activeFromRcl: 6 }
            }
        ]
    };
    global.RoomPhase.W1N1 = { phase: 'terminal' };
    global.RoomCache.W1N1 = { constructionSites: ['hubLinkSite', 'extractorSite'] };
    Game.getObjectById = (id) => {
        if (id === 'hubLinkSite') return hubLinkSite;
        if (id === 'extractorSite') return extractorSite;
        return null;
    };
    const v2Builder = {
        room: {
            name: 'W1N1',
            controller,
            find: (type) => type === FIND_CONSTRUCTION_SITES ? [hubLinkSite, extractorSite] : []
        },
        pos: { x: 15, y: 15, roomName: 'W1N1', getRangeTo: (pos) => Math.max(Math.abs(pos.x - 15), Math.abs(pos.y - 15)) },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    builderService.assignBuilderTask(v2Builder);
    assert.strictEqual(v2Builder.memory.task.targetId, 'hubLinkSite', 'builder should prioritize planned logistics hub link assets over lower-value industry extractor work in terminal phase');

    const genericTerminalSite = {
        id: 'genericTerminalSite',
        structureType: STRUCTURE_TERMINAL,
        pos: { x: 17, y: 15, roomName: 'W1N1' },
        progress: 0,
        progressTotal: 100
    };
    const hubTerminalSite = {
        id: 'hubTerminalSite',
        structureType: STRUCTURE_TERMINAL,
        pos: { x: 16, y: 15, roomName: 'W1N1' },
        progress: 0,
        progressTotal: 100
    };
    Memory.rooms.W1N1.cityPlan = {
        center: { x: 15, y: 15, roomName: 'W1N1' },
        plannedStructures: [{
            id: 'hub:terminal',
            role: 'hub_terminal',
            structureType: STRUCTURE_TERMINAL,
            pos: { x: 16, y: 15, roomName: 'W1N1' },
            phase: 'industry',
            group: 'industry',
            lifecycle: { state: 'planned', activeFromRcl: 6 }
        }]
    };
    global.RoomCache.W1N1 = { constructionSites: ['genericTerminalSite', 'hubTerminalSite'] };
    Game.getObjectById = (id) => {
        if (id === 'genericTerminalSite') return genericTerminalSite;
        if (id === 'hubTerminalSite') return hubTerminalSite;
        return null;
    };
    const roleAwareBuilder = {
        room: {
            name: 'W1N1',
            controller,
            find: (type) => type === FIND_CONSTRUCTION_SITES ? [genericTerminalSite, hubTerminalSite] : []
        },
        pos: { x: 15, y: 15, roomName: 'W1N1', getRangeTo: (pos) => Math.max(Math.abs(pos.x - 15), Math.abs(pos.y - 15)) },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    builderService.assignBuilderTask(roleAwareBuilder);
    assert.strictEqual(roleAwareBuilder.memory.task.targetId, 'hubTerminalSite', 'builder should prefer the planned hub terminal over an unplanned terminal site of the same structure type');
    assert.strictEqual(getBuildPolicy(Memory.rooms.W1N1.cityPlan, hubTerminalSite).priorityModifier > 0, true, 'city asset policy should elevate planned hub terminal construction');
    const activeRoadSite = {
        id: 'activeRoadSite',
        structureType: STRUCTURE_ROAD,
        pos: { x: 16, y: 15, roomName: 'W1N1' },
        progress: 0,
        progressTotal: 100
    };
    const retiringRoadSite = {
        id: 'retiringRoadSite',
        structureType: STRUCTURE_ROAD,
        pos: { x: 17, y: 15, roomName: 'W1N1' },
        progress: 0,
        progressTotal: 100
    };
    Memory.rooms.W1N1.cityPlan = {
        center: { x: 15, y: 15, roomName: 'W1N1' },
        plannedStructures: [
            {
                id: 'road:logistics:16,15',
                role: 'logistics_road',
                structureType: STRUCTURE_ROAD,
                pos: { x: 16, y: 15, roomName: 'W1N1' },
                phase: 'logistics_link',
                group: 'infrastructure',
                lifecycle: { state: 'active', activeFromRcl: 3 }
            },
            {
                id: 'road:logistics:17,15',
                role: 'logistics_road',
                structureType: STRUCTURE_ROAD,
                pos: { x: 17, y: 15, roomName: 'W1N1' },
                phase: 'logistics_link',
                group: 'infrastructure',
                lifecycle: { state: 'retiring', activeFromRcl: 3 }
            }
        ]
    };
    global.RoomCache.W1N1 = { constructionSites: ['activeRoadSite', 'retiringRoadSite'] };
    Game.getObjectById = (id) => {
        if (id === 'activeRoadSite') return activeRoadSite;
        if (id === 'retiringRoadSite') return retiringRoadSite;
        return null;
    };
    const lifecycleAwareBuilder = {
        room: {
            name: 'W1N1',
            controller,
            find: (type) => type === FIND_CONSTRUCTION_SITES ? [activeRoadSite, retiringRoadSite] : []
        },
        pos: { x: 15, y: 15, roomName: 'W1N1', getRangeTo: (pos) => Math.max(Math.abs(pos.x - 15), Math.abs(pos.y - 15)) },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    builderService.assignBuilderTask(lifecycleAwareBuilder);
    assert.strictEqual(lifecycleAwareBuilder.memory.task.targetId, 'activeRoadSite', 'builder should avoid retiring logistics road sites when an active planned road site is available');
    assert.strictEqual(getBuildPolicy(Memory.rooms.W1N1.cityPlan, retiringRoadSite).buildable, false, 'city asset policy should block retiring logistics road sites from normal build priority');

    assert.deepStrictEqual(TaskGuard.validate({
        memory: { role: 'builder' },
        room: builder.room,
        pos: { x: 14, y: 14, roomName: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    }, {
        type: 'MOVE_TO',
        pos: { x: 15, y: 15, roomName: 'W1N1' }
    }), { valid: true }, 'task guard should keep MOVE_TO tasks that use a direct position without a target id');
    assert.strictEqual(TaskGuard.validate({
        memory: { role: 'hauler' },
        room: builder.room,
        pos: { x: 14, y: 14, roomName: 'W1N1' },
        store: { getUsedCapacity: () => 0 }
    }, {
        type: 'WAIT_SUPPLY'
    }).reason, 'unknown_task_type', 'task guard should reject legacy wait tasks that are not executable actions');

    const taskGuardService = new TaskGuardService('TaskGuard');
    const migratedBuilder = {
        name: 'MigratedBuilder',
        room: builder.room,
        pos: { x: 14, y: 14, roomName: 'W1N1' },
        memory: {
            role: 'builder',
            homeRoom: 'W1N1',
            task: { type: 'REPAIR', targetId: 'site1', targetHits: 5000 }
        },
        store: { getUsedCapacity: () => 50 }
    };
    const migratedUpgrader = {
        name: 'MigratedUpgrader',
        room: upgraderRoom,
        pos: { x: 24, y: 25, roomName: 'W1N1', inRangeTo: () => true },
        memory: {
            role: 'upgrader',
            homeRoom: 'W1N1',
            task: { type: 'BUILD', targetId: 'site1' }
        },
        store: { getUsedCapacity: () => 50 }
    };
    Game.rooms.W1N1 = builder.room;
    Game.creeps = {
        MigratedBuilder: migratedBuilder,
        MigratedUpgrader: migratedUpgrader
    };
    global.RoomCache.W1N1 = { constructionSites: ['site1'] };
    Game.getObjectById = (id) => {
        if (id === 'site1') return buildSite;
        if (id === 'controller1') return controller;
        return null;
    };
    taskGuardService.analyze();
    builderService.analyze();
    upgraderService.analyze();
    assert.strictEqual(migratedBuilder.memory.task.type, 'BUILD', 'task guard should clear obsolete builder repair tasks so builders can receive new build work in the same tick');
    assert.strictEqual(migratedBuilder.memory.task.targetId, 'site1', 'migrated builder should retarget the active construction site after task guard cleanup');
    assert.deepStrictEqual(migratedUpgrader.memory.task, {
        type: 'UPGRADE',
        targetId: 'controller1'
    }, 'task guard should clear obsolete upgrader build tasks so upgraders can receive new upgrade work in the same tick');

    const nullTaskBuilder = {
        name: 'NullTaskBuilder',
        room: builder.room,
        pos: { x: 14, y: 14, roomName: 'W1N1' },
        memory: {
            role: 'builder',
            homeRoom: 'W1N1',
            task: null
        },
        store: { getUsedCapacity: () => 50 }
    };
    Game.creeps = { NullTaskBuilder: nullTaskBuilder };
    global.RoomCache.W1N1 = { constructionSites: ['site1'] };
    Game.getObjectById = (id) => id === 'site1' ? buildSite : null;
    builderService.analyze();
    assert.strictEqual(nullTaskBuilder.memory.task.type, 'BUILD', 'builder strategy should recover existing builders with null tasks when construction work is available');
    assert.strictEqual(nullTaskBuilder.memory.task.targetId, 'site1', 'builder with a null task should retarget the active construction site on the next strategy tick');
    assert.strictEqual(nullTaskBuilder.memory.builderState.state, 'assigned_build', 'builder state should record that a null-task builder was recovered into build work');

    const pickedEnergy = { id: 'pickedEnergy', pos: { x: 13, y: 14, roomName: 'W1N1' } };
    let pickupBuilderEnergy = 0;
    const pickupThenBuildBuilder = {
        name: 'PickupThenBuildBuilder',
        room: builder.room,
        pos: { x: 13, y: 14, roomName: 'W1N1' },
        memory: {
            role: 'builder',
            homeRoom: 'W1N1',
            task: { type: 'PICKUP', targetId: 'pickedEnergy' }
        },
        store: { getUsedCapacity: () => pickupBuilderEnergy },
        pickup: () => {
            pickupBuilderEnergy = 50;
            return OK;
        }
    };
    Game.creeps = { PickupThenBuildBuilder: pickupThenBuildBuilder };
    Game.getObjectById = (id) => {
        if (id === 'pickedEnergy') return pickedEnergy;
        if (id === 'site1') return buildSite;
        return null;
    };
    ActionParser.run(pickupThenBuildBuilder);
    assert.strictEqual(pickupThenBuildBuilder.memory.task, null, 'PICKUP should clear after collecting energy so the builder can choose work next tick');
    builderService.analyze();
    assert.strictEqual(pickupThenBuildBuilder.memory.task.type, 'BUILD', 'builder should recover from a completed pickup into build work once it has energy');
    assert.strictEqual(pickupThenBuildBuilder.memory.task.targetId, 'site1', 'builder should target construction work after pickup recovery');
    assert.strictEqual(pickupThenBuildBuilder.memory.builderState.state, 'assigned_build', 'builder state should record pickup recovery into build work');

    const fallbackBuildSite = { id: 'siteFallback', pos: { x: 20, y: 20, roomName: 'W1N1' } };
    const staleCacheBuilder = {
        room: {
            name: 'W1N1',
            controller,
            find: (type) => {
                if (type === FIND_CONSTRUCTION_SITES) return [fallbackBuildSite];
                if (type === FIND_STRUCTURES) return [];
                return [];
            }
        },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    global.RoomCache.W1N1 = { constructionSites: ['staleSite'] };
    Game.getObjectById = (id) => id === 'siteFallback' ? fallbackBuildSite : null;
    builderService.assignBuilderTask(staleCacheBuilder);
    assert.strictEqual(staleCacheBuilder.memory.task.type, 'BUILD', 'builder should still build when cached construction site ids are stale');
    assert.strictEqual(staleCacheBuilder.memory.task.targetId, 'siteFallback', 'builder should fall back to live construction sites after stale cache entries');
    assert.strictEqual(global.RoomCache.W1N1.isDirty, true, 'builder should mark room cache dirty when cached construction site ids are stale');

    EventBus.topics = {};
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller,
        storage: null,
        energyAvailable: 300,
        energyCapacityAvailable: 300,
        find: (type) => type === FIND_CONSTRUCTION_SITES ? [buildSite] : []
    };
    Game.creeps = {
        MinerCore: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        HaulerCore: { memory: { role: 'hauler', homeRoom: 'W1N1' } },
        UpgraderCore: { memory: { role: 'upgrader', homeRoom: 'W1N1' } }
    };
    global.RoomPhase = {
        W1N1: {
            phase: 'early',
            hasStorage: false,
            hasTerminal: false,
            logisticsMode: 'self_supply'
        }
    };
    builderService.ensureBuilders(Game.rooms.W1N1);
    assert.ok(!EventBus.topics.REQ_SPAWN, 'builder strategy should not publish spawn requests after spawn bureau owns spawning');
    spawnBureau.analyze();
    const firstBuilderRequest = EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'builder');
    assert.ok(firstBuilderRequest.priority > 50, 'first builder should outrank continued miner expansion when construction sites exist and core economy is online');
    assert.strictEqual(firstBuilderRequest.data.memory.bodyProfile, undefined, 'spawn memory should not leak body profile details');
    assert.ok(firstBuilderRequest.data.body.filter((part) => part === CARRY).length >= firstBuilderRequest.data.body.filter((part) => part === WORK).length, 'mobile builder should preserve carry capacity before storage logistics exist');

    EventBus.topics = {};
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller,
        storage: { id: 'storage1', store: { getUsedCapacity: () => 2000 } },
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        find: (type) => type === FIND_CONSTRUCTION_SITES ? [buildSite] : []
    };
    Game.creeps = {
        MinerCore: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        HaulerCore: { memory: { role: 'hauler', homeRoom: 'W1N1' } },
        UpgraderCore: { memory: { role: 'upgrader', homeRoom: 'W1N1' } }
    };
    global.RoomPhase = {
        W1N1: {
            phase: 'storage',
            hasStorage: true,
            hasTerminal: false,
            logisticsMode: 'hauler'
        }
    };
    spawnBureau.analyze();
    const suppliedBuilderRequest = EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'builder');
    assert.ok(
        suppliedBuilderRequest.data.body.filter((part) => part === WORK).length >
        suppliedBuilderRequest.data.body.filter((part) => part === CARRY).length,
        'storage-backed builder should use a supplied work-heavy body'
    );

    EventBus.topics = {};
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller,
        storage: null,
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        find: (type) => type === FIND_CONSTRUCTION_SITES ? [{ id: 'siteStoragePhase' }] : []
    };
    Game.creeps = {
        MinerCore: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        HaulerCore: { memory: { role: 'hauler', homeRoom: 'W1N1' } },
        UpgraderCore: { memory: { role: 'upgrader', homeRoom: 'W1N1' } }
    };
    global.RoomPhase = {
        W1N1: {
            phase: 'storage',
            hasStorage: true,
            hasTerminal: false,
            logisticsMode: 'hauler'
        }
    };
    spawnBureau.analyze();
    const roomPhaseBuilderRequest = EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'builder');
    assert.ok(
        roomPhaseBuilderRequest.data.body.filter((part) => part === WORK).length >
        roomPhaseBuilderRequest.data.body.filter((part) => part === CARRY).length,
        'room phase storage state should make builder spawning use supplied builder bodies even before room.storage exists'
    );

    EventBus.topics = {};
    Memory.rooms.W1N1.maintenancePlan = {
        quotas: { urgent: 1, routine: 1, longTerm: 0 },
        targets: [
            { id: 'urgentContainer', executor: 'repairer', urgency: 'urgent', priority: 95 },
            { id: 'routineRoad1', executor: 'repairer', urgency: 'routine', priority: 60 },
            { id: 'routineRoad2', executor: 'repairer', urgency: 'routine', priority: 59 },
            { id: 'routineRoad3', executor: 'repairer', urgency: 'routine', priority: 58 }
        ]
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller,
        storage: { id: 'storage1', store: { getUsedCapacity: () => 20000 } },
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        find: (type) => type === FIND_CONSTRUCTION_SITES ? [] : []
    };
    Game.creeps = {
        MinerCore: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        HaulerCore: { memory: { role: 'hauler', homeRoom: 'W1N1' } },
        UpgraderCore: { memory: { role: 'upgrader', homeRoom: 'W1N1' } },
        BuilderCore: { memory: { role: 'builder', homeRoom: 'W1N1' } }
    };
    spawnBureau.analyze();
    const repairerRequest = EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'repairer');
    assert.ok(repairerRequest, 'spawn bureau should request a repairer when maintenance backlog exceeds routine quota');
    assert.strictEqual(repairerRequest.data.memory.role, 'repairer', 'repairer spawn request should persist repairer role memory');

    EventBus.topics = {};
    Memory.rooms.W1N1.maintenancePlan = {
        quotas: { urgent: 3, routine: 5, longTerm: 6 },
        targets: [
            { id: 'roadMaintenance1', executor: 'repairer', urgency: 'urgent', structureType: STRUCTURE_ROAD, priority: 70 },
            { id: 'roadMaintenance2', executor: 'repairer', urgency: 'urgent', structureType: STRUCTURE_ROAD, priority: 69 }
        ]
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller,
        storage: { id: 'storage1', store: { getUsedCapacity: () => 20000 } },
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        find: (type) => type === FIND_CONSTRUCTION_SITES ? [] : []
    };
    Game.creeps = {
        MinerCore: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        HaulerCore: { memory: { role: 'hauler', homeRoom: 'W1N1' } },
        UpgraderCore: { memory: { role: 'upgrader', homeRoom: 'W1N1' } }
    };
    spawnBureau.analyze();
    const maintenanceRepairerRequest = EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'repairer');
    assert.ok(maintenanceRepairerRequest, 'spawn bureau should request a repairer when maintenance targets exist but there is no maintenance workforce');

    const containerEnergy = {
        id: 'container1',
        structureType: STRUCTURE_CONTAINER,
        store: { getUsedCapacity: () => 200 }
    };
    const emptyBuilderWithContainer = {
        room: {
            name: 'W1N1',
            find: (type) => type === FIND_STRUCTURES ? [containerEnergy] : []
        },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 0 }
    };
    builderService.assignBuilderTask(emptyBuilderWithContainer);
    assert.deepStrictEqual(emptyBuilderWithContainer.memory.task, {
        type: 'WITHDRAW',
        targetId: 'container1',
        resourceType: RESOURCE_ENERGY
    }, 'empty builder should withdraw from energy containers before idling');

    const makeStore = (resources, capacity = 1000) => ({
        getUsedCapacity: (resourceType) => {
            if (resourceType) return resources[resourceType] || 0;
            return Object.values(resources).reduce((sum, value) => sum + value, 0);
        },
        getFreeCapacity: (resourceType) => {
            const used = resourceType ? (resources[resourceType] || 0) : Object.values(resources).reduce((sum, value) => sum + value, 0);
            return Math.max(0, capacity - used);
        },
        [Symbol.iterator]: function* () {
            for (const resourceType of Object.keys(resources)) yield resourceType;
        }
    });

    const marketSpawn = {
        id: 'marketSpawn',
        structureType: STRUCTURE_SPAWN,
        pos: { x: 20, y: 20, roomName: 'W1N1' },
        store: makeStore({ energy: 0 }, 300)
    };
    const marketStorage = {
        id: 'marketStorage',
        structureType: STRUCTURE_STORAGE,
        pos: { x: 10, y: 10, roomName: 'W1N1' },
        store: makeStore({ energy: 1000, U: 300 }, 2000)
    };
    const marketTerminal = {
        id: 'marketTerminal',
        structureType: STRUCTURE_TERMINAL,
        pos: { x: 12, y: 10, roomName: 'W1N1' },
        store: makeStore({ energy: 100, L: 500 }, 3000)
    };
    const marketLab = {
        id: 'marketLab',
        structureType: STRUCTURE_LAB,
        pos: { x: 15, y: 15, roomName: 'W1N1' },
        store: makeStore({ UL: 50 }, 500)
    };
    const marketControllerContainer = {
        id: 'marketControllerContainer',
        structureType: STRUCTURE_CONTAINER,
        pos: { x: 24, y: 25, roomName: 'W1N1' },
        store: makeStore({ energy: 150 }, 2000)
    };
    const marketSourceContainer = {
        id: 'marketSourceContainer',
        structureType: STRUCTURE_CONTAINER,
        pos: { x: 11, y: 10, roomName: 'W1N1' },
        store: makeStore({ energy: 150 }, 2000)
    };
    const marketDrop = {
        id: 'marketDrop',
        resourceType: RESOURCE_ENERGY,
        amount: 250,
        pos: { x: 9, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 9) + Math.abs(pos.y - 10) }
    };
    const marketRoom = {
        name: 'W1N1',
        controller: { my: true, pos: { x: 25, y: 25, roomName: 'W1N1' } },
        storage: marketStorage,
        terminal: marketTerminal,
        find: (type, opts = {}) => {
            let results = [];
            if (type === FIND_DROPPED_RESOURCES) results = [marketDrop];
            if (type === FIND_MY_STRUCTURES) results = [marketSpawn, marketStorage, marketTerminal, marketLab];
            if (type === FIND_STRUCTURES) results = [marketSpawn, marketStorage, marketTerminal, marketLab, marketControllerContainer, marketSourceContainer];
            if (opts.filter) return results.filter(opts.filter);
            return results;
        }
    };
    const marketObjects = {
        marketSpawn,
        marketStorage,
        marketTerminal,
        marketLab,
        marketControllerContainer,
        marketSourceContainer,
        marketDrop
    };
    Memory.rooms.W1N1 = {
        cityPlan: {
            controller: {
                containerPos: { x: 24, y: 25, roomName: 'W1N1' }
            }
        }
    };
    Game.rooms = { W1N1: marketRoom };
    Game.getObjectById = (id) => marketObjects[id] || Game.creeps[id] || null;
    Game.creeps = {
        HaulerA: {
            name: 'HaulerA',
            room: marketRoom,
            memory: { role: 'hauler', homeRoom: 'W1N1' },
            pos: { x: 8, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 8) + Math.abs(pos.y - 10) },
            store: makeStore({}, 100),
            body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
        },
        HaulerB: {
            name: 'HaulerB',
            room: marketRoom,
            memory: { role: 'hauler', homeRoom: 'W1N1' },
            pos: { x: 8, y: 11, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 8) + Math.abs(pos.y - 11) },
            store: makeStore({}, 100),
            body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
        }
    };
    global.ResourceMarket = {};
    EventBus.topics = {};
    EventBus.clearSubscribers();
    const resourceMarket = new ResourceMarketService('ResourceMarket');
    resourceMarket.init();
    global.RoomPhase = { W1N1: { logisticsMode: 'hauler' } };
    resourceMarket.analyze();
    assert.strictEqual(global.ResourceMarket.W1N1.supplyMode, 'hauler_supply', 'resource market should adopt hauler supply mode from room phase');
    assert.ok(global.ResourceMarket.W1N1.supplies.some((supply) => supply.targetId === 'marketDrop' && supply.resourceType === RESOURCE_ENERGY), 'resource market should discover dropped energy supply');
    assert.ok(global.ResourceMarket.W1N1.supplies.some((supply) => supply.targetId === 'marketStorage' && supply.resourceType === RESOURCE_UTRIUM), 'resource market should discover storage mineral supply');
    assert.ok(global.ResourceMarket.W1N1.supplies.some((supply) => supply.targetId === 'marketTerminal' && supply.resourceType === RESOURCE_LEMERGIUM), 'resource market should discover terminal mineral supply');
    assert.ok(global.ResourceMarket.W1N1.supplies.some((supply) => supply.targetId === 'marketLab' && supply.resourceType === RESOURCE_UTRIUM_LEMERGITE), 'resource market should discover lab compound supply');
    const spawnDemand = global.ResourceMarket.W1N1.demands.find((demand) => demand.targetId === 'marketSpawn');
    assert.strictEqual(spawnDemand.demandType, 'pull', 'economy energy demand should declare pull semantics');
    assert.strictEqual(spawnDemand.currentAmount, 0, 'economy energy demand should record current store amount');

    global.RoomPhase = { W1N1: { logisticsMode: 'self_supply' } };
    resourceMarket.init();
    resourceMarket.analyze();
    assert.strictEqual(global.ResourceMarket.W1N1.supplyMode, 'self_supply', 'resource market should keep self supply mode when room phase marks logistics as self supply');
    assert.strictEqual(spawnDemand.targetAmount, 300, 'economy energy demand should record target store amount');
    const controllerBufferDemand = global.ResourceMarket.W1N1.demands.find((demand) => demand.targetId === 'marketControllerContainer' && demand.demandType === 'buffer');
    assert.ok(!controllerBufferDemand, 'resource market should not create controller buffer demand from legacy-only controller container compatibility storage during strict rollout');
    assert.ok(global.ResourceMarket.W1N1.demands.some((demand) => demand.targetId === 'marketControllerContainer' && demand.purpose === 'storage_balance'), 'resource market should fall back to generic container demand handling when only legacy controller container planning exists during strict rollout');
    assert.strictEqual(getControllerContainerAsset(Memory.rooms.W1N1.cityPlan), null, 'legacy adapter should default controller-container getters to canonical planned assets only when planned assets are absent');
    assert.strictEqual(resolveControllerContainerAsset(Memory.rooms.W1N1.cityPlan).source, 'none', 'legacy adapter should report none once legacy-only controller-container storage is no longer read');
    assert.strictEqual(getControllerContainerAsset(Memory.rooms.W1N1.cityPlan, { allowLegacyFallback: true }), null, 'legacy adapter should ignore explicit compat fallback getter requests for legacy-only controller containers');
    assert.strictEqual(resolveControllerContainerAsset(Memory.rooms.W1N1.cityPlan, { allowLegacyFallback: true }).source, 'none', 'legacy adapter should report none for legacy-only controller containers even when compat fallback is requested after adapter hard retirement');
    Memory.rooms.W1N1.cityPlan.sources = {
        source1: {
            containerPos: { x: 11, y: 10, roomName: 'W1N1' }
        }
    };
    resourceMarket.init();
    resourceMarket.analyze();
    assert.ok(global.ResourceMarket.W1N1.demands.some((demand) => demand.targetId === 'marketSourceContainer' && demand.purpose === 'storage_balance'), 'resource market should treat legacy-only source containers as generic container demand targets during strict rollout');
    Memory.rooms.W1N1.cityPlan.plannedStructures = [{
        id: 'controller:container',
        role: 'controller_container',
        structureType: STRUCTURE_CONTAINER,
        pos: { x: 24, y: 25, roomName: 'W1N1' },
        lifecycle: { state: 'link_primary', activeFromRcl: 1, replacement: 'controller:link' }
    }];
    resourceMarket.init();
    resourceMarket.analyze();
    const linkPrimaryControllerDemand = global.ResourceMarket.W1N1.demands.find((demand) => demand.targetId === 'marketControllerContainer' && demand.demandType === 'buffer');
    assert.ok(linkPrimaryControllerDemand, 'resource market should keep a reduced controller buffer demand during link-primary transition');
    assert.strictEqual(linkPrimaryControllerDemand.demandType, 'buffer', 'controller container should be tracked as buffer demand once a canonical planned asset exists');
    assert.strictEqual(linkPrimaryControllerDemand.priority, 35, 'controller buffer demand should be downgraded once controller link is primary');
    Memory.rooms.W1N1.cityPlan.plannedStructures[0].lifecycle.state = 'retired_ready';
    resourceMarket.init();
    resourceMarket.analyze();
    assert.ok(!global.ResourceMarket.W1N1.demands.some((demand) => demand.targetId === 'marketControllerContainer' && demand.demandType === 'buffer'), 'resource market should stop emitting controller buffer demand once the controller container is retired-ready');
    delete Memory.rooms.W1N1.cityPlan.plannedStructures;
    resourceMarket.assignHauler(Game.creeps.HaulerA);
    resourceMarket.assignHauler(Game.creeps.HaulerB);
    assert.deepStrictEqual(Game.creeps.HaulerA.memory.task, { type: 'PICKUP', targetId: 'marketDrop' }, 'resource market should assign first empty hauler to picked-up dropped resource');
    assert.ok(Game.creeps.HaulerB.memory.task.targetId !== 'marketDrop', 'resource market reservations should prevent duplicate dropped resource pickup assignment');

    const controllerSourceRoom = {
        name: 'W1N1',
        controller: { my: true, pos: { x: 25, y: 25, roomName: 'W1N1' } },
        storage: null,
        find: (type, opts = {}) => {
            let results = [];
            if (type === FIND_DROPPED_RESOURCES) results = [];
            if (type === FIND_MY_STRUCTURES) results = [marketSpawn];
            if (type === FIND_STRUCTURES) results = [{
                ...marketControllerContainer,
                store: makeStore({ energy: 500 }, 2000)
            }, marketSpawn];
            if (opts.filter) return results.filter(opts.filter);
            return results;
        }
    };
    const controllerSourceHauler = {
        name: 'ControllerSourceHauler',
        room: controllerSourceRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 24, y: 24, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 24) + Math.abs(pos.y - 24) },
        store: makeStore({}, 100),
        body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
    };
    Game.rooms = { W1N1: controllerSourceRoom };
    Game.creeps = { ControllerSourceHauler: controllerSourceHauler };
    Game.getObjectById = (id) => {
        if (id === 'marketControllerContainer') return controllerSourceRoom.find(FIND_STRUCTURES)[0];
        if (id === 'marketSpawn') return marketSpawn;
        return Game.creeps[id] || null;
    };
    Memory.rooms.W1N1.resourceMarket = { reservations: { supply: {}, demand: {} } };
    resourceMarket.init();
    resourceMarket.buildRoomMarket(controllerSourceRoom);
    resourceMarket.assignHauler(controllerSourceHauler);
    assert.deepStrictEqual(controllerSourceHauler.memory.task, {
        type: 'WITHDRAW',
        targetId: 'marketControllerContainer',
        resourceType: 'energy',
        amount: 100
    }, 'hauler should treat legacy-only controller containers as generic supply sources during strict rollout');

    const retiringSourceContainer = {
        id: 'retiringSourceContainer',
        structureType: STRUCTURE_CONTAINER,
        pos: { x: 11, y: 10, roomName: 'W1N1' },
        store: makeStore({ energy: 500 }, 2000),
        hits: 90000,
        hitsMax: 250000
    };
    Memory.rooms.W1N1 = {
        cityPlan: {
            plannedStructures: [{
                id: 'source1:container',
                role: 'source_container',
                structureType: STRUCTURE_CONTAINER,
                pos: { x: 11, y: 10, roomName: 'W1N1' },
                scope: { sourceId: 'source1' },
                lifecycle: { state: 'retiring', activeFromRcl: 1, activeUntilRcl: 5, replacement: 'source1:link' }
            }]
        },
        resourceMarket: { reservations: { supply: {}, demand: {} } }
    };
    const retiringContainerRoom = {
        name: 'W1N1',
        controller: { my: true, pos: { x: 25, y: 25, roomName: 'W1N1' } },
        storage: null,
        find: (type, opts = {}) => {
            let results = [];
            if (type === FIND_DROPPED_RESOURCES) results = [];
            if (type === FIND_MY_STRUCTURES) results = [marketSpawn];
            if (type === FIND_STRUCTURES) results = [marketSpawn, retiringSourceContainer];
            if (opts.filter) return results.filter(opts.filter);
            return results;
        }
    };
    Game.rooms = { W1N1: retiringContainerRoom };
    Game.creeps = {};
    Game.getObjectById = (id) => {
        if (id === 'marketSpawn') return marketSpawn;
        if (id === 'retiringSourceContainer') return retiringSourceContainer;
        return null;
    };
    resourceMarket.init();
    resourceMarket.buildRoomMarket(retiringContainerRoom);
    assert.ok(!global.ResourceMarket.W1N1.supplies.some((supply) => supply.targetId === 'retiringSourceContainer'), 'resource market should stop advertising retiring source containers as regular supply');
    assert.ok(!global.ResourceMarket.W1N1.demands.some((demand) => demand.targetId === 'retiringSourceContainer' && demand.purpose === 'storage_balance'), 'resource market should not treat source containers as generic storage-balance sinks');
    Memory.rooms.W1N1.cityPlan = {
        sources: {
            source1: {
                containerPos: { x: 11, y: 10, roomName: 'W1N1' }
            }
        }
    };
    resourceMarket.init();
    resourceMarket.buildRoomMarket(retiringContainerRoom);
    assert.ok(global.ResourceMarket.W1N1.demands.some((demand) => demand.targetId === 'retiringSourceContainer' && demand.purpose === 'storage_balance'), 'resource market should fall back to generic storage-balance demand when only legacy source container storage exists during strict rollout');
    Memory.rooms.W1N1.cityPlan.plannedStructures = [{
        id: 'source1:container',
        role: 'source_container',
        structureType: STRUCTURE_CONTAINER,
        pos: { x: 11, y: 10, roomName: 'W1N1' },
        scope: { sourceId: 'source1' },
        lifecycle: { state: 'retiring', activeFromRcl: 1, activeUntilRcl: 5, replacement: 'source1:link' }
    }];
    Memory.rooms.W1N1.cityPlan.plannedStructures[0].lifecycle.state = 'link_primary';
    resourceMarket.init();
    resourceMarket.buildRoomMarket(retiringContainerRoom);
    const linkPrimarySupply = global.ResourceMarket.W1N1.supplies.find((supply) => supply.targetId === 'retiringSourceContainer');
    assert.ok(linkPrimarySupply, 'resource market should keep link-primary source containers available as fallback supply');
    assert.strictEqual(linkPrimarySupply.priority, 20, 'resource market should downgrade link-primary source container pickup priority so dedicated link logistics stay primary');
    assert.strictEqual(getLogisticsPolicy(Memory.rooms.W1N1.cityPlan, retiringSourceContainer).supplyMode, 'fallback', 'city asset policy should expose source container link-primary supply as fallback logistics');
    Memory.rooms.W1N1.cityPlan.plannedStructures[0].lifecycle.state = 'retired_ready';
    resourceMarket.init();
    resourceMarket.buildRoomMarket(retiringContainerRoom);
    assert.ok(!global.ResourceMarket.W1N1.supplies.some((supply) => supply.targetId === 'retiringSourceContainer'), 'resource market should stop advertising retired-ready source containers as supply');
    assert.strictEqual(shouldParticipateInLogistics(Memory.rooms.W1N1.cityPlan, retiringSourceContainer), false, 'city asset policy should exclude retired-ready source containers from logistics');
    Memory.rooms.W1N1.cityPlan.plannedStructures[0].lifecycle.state = 'retiring';

    const controllerBufferHauler = {
        name: 'ControllerBufferHauler',
        room: controllerSourceRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 24, y: 24, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 24) + Math.abs(pos.y - 24) },
        store: makeStore({ energy: 100 }, 100),
        body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
    };
    Game.creeps = { ControllerBufferHauler: controllerBufferHauler };
    resourceMarket.init();
    resourceMarket.buildRoomMarket(controllerSourceRoom);
    resourceMarket.assignHauler(controllerBufferHauler);
    assert.deepStrictEqual(controllerBufferHauler.memory.task, {
        type: 'TRANSFER',
        targetId: 'marketSpawn',
        resourceType: RESOURCE_ENERGY
    }, 'loaded hauler should still prioritize spawn before topping up the controller buffer');

    const previousMarketCityPlan = Memory.rooms.W1N1.cityPlan;
    Memory.rooms.W1N1 = {
        cityPlan: {
            plannedStructures: [
                {
                    id: 'controller:container',
                    role: 'controller_container',
                    structureType: STRUCTURE_CONTAINER,
                    pos: { x: 24, y: 25, roomName: 'W1N1' },
                    lifecycle: { state: 'active', activeFromRcl: 1 }
                },
                {
                    id: 'hub:terminal',
                    role: 'hub_terminal',
                    structureType: STRUCTURE_TERMINAL,
                    pos: { x: 12, y: 10, roomName: 'W1N1' },
                    phase: 'industry',
                    group: 'industry',
                    lifecycle: { state: 'planned', activeFromRcl: 6 }
                }
            ]
        },
        resourceMarket: { reservations: { supply: {}, demand: {} } }
    };
    resourceMarket.init();
    resourceMarket.buildRoomMarket(marketRoom);
    assert.ok(global.ResourceMarket.W1N1.demands.some((demand) => {
        return demand.targetId === 'marketControllerContainer' &&
            demand.purpose === 'controller_buffer';
    }), 'resource market should derive controller buffer demand from planned role even when legacy controller container position is absent');
    assert.strictEqual(getLogisticsPolicy(Memory.rooms.W1N1.cityPlan, marketControllerContainer).demandMode, 'buffer', 'city asset policy should expose controller containers as buffer demand assets');
    assert.ok(global.ResourceMarket.W1N1.supplies.some((supply) => {
        return supply.targetId === 'marketTerminal' &&
            supply.resourceType === RESOURCE_LEMERGIUM &&
            supply.priority >= 65;
    }), 'resource market should keep hub terminal supplies visible through planned role lookup');
    Memory.rooms.W1N1.cityPlan = previousMarketCityPlan;
    Game.rooms = { W1N1: marketRoom };
    Game.getObjectById = (id) => marketObjects[id] || Game.creeps[id] || null;

    const nearbyBuilder = {
        name: 'NearbyBuilder',
        id: 'nearbyBuilderId',
        room: marketRoom,
        memory: { role: 'builder', homeRoom: 'W1N1' },
        pos: { x: 10, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 10) + Math.abs(pos.y - 10) },
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 },
        body: [{ type: WORK }, { type: CARRY }, { type: MOVE }]
    };
    const farHauler = {
        name: 'FarHauler',
        id: 'farHaulerId',
        room: marketRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 30, y: 30, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 30) + Math.abs(pos.y - 30) },
        store: makeStore({ energy: 100 }, 100),
        body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
    };
    Game.creeps = {
        NearbyBuilder: nearbyBuilder,
        FarHauler: farHauler
    };
    Game.getObjectById = (id) => marketObjects[id] || Game.creeps[id] || null;
    resourceMarket.init();
    resourceMarket.buildRoomMarket(marketRoom);
    const selfFetchPlan = resourceMarket.requestResource(nearbyBuilder, {
        resourceType: RESOURCE_ENERGY,
        amount: 50,
        purpose: 'build',
        targetId: 'site1',
        targetPos: { x: 15, y: 15, roomName: 'W1N1' },
        priority: 60,
        allowedFulfillment: ['self_fetch', 'delivery']
    });
    assert.strictEqual(selfFetchPlan.mode, 'self_fetch', 'resource market should prefer nearby self-fetch over distant hauler delivery');
    assert.ok(
        selfFetchPlan.task &&
        (selfFetchPlan.task.type === 'PICKUP' || selfFetchPlan.task.type === 'WITHDRAW'),
        'resource market self-fetch should return a direct pickup or withdraw task'
    );
    assert.strictEqual(selfFetchPlan.reason, 'self_fetch_selected', 'resource market should explain why self fetch was selected');
    assert.ok(Memory.rooms.W1N1.resourceMarket.stats.selfFetchSelected >= 1, 'resource market should record self-fetch selections in stats');
    assert.ok(Memory.rooms.W1N1.resourceMarket.stats.supplyCount >= 1, 'resource market should persist room-level supply stats');

    EventBus.topics = {};
    Game.creeps = {
        HaulerLoaded: {
            name: 'HaulerLoaded',
            room: marketRoom,
            memory: { role: 'hauler', homeRoom: 'W1N1' },
            pos: { x: 11, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 11) + Math.abs(pos.y - 10) },
            store: makeStore({ U: 100 }, 100),
            body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
        }
    };
    resourceMarket.init();
    EventBus.publish('REQ_RESOURCE', 85, {
        roomName: 'W1N1',
        action: 'move',
        resourceType: RESOURCE_UTRIUM,
        amount: 100,
        targetId: 'marketTerminal',
        priority: 85,
        purpose: 'terminal_balance'
    }, 3);
    EventBus.dispatch();
    assert.deepStrictEqual(Game.creeps.HaulerLoaded.memory.task, {
        type: 'TRANSFER',
        targetId: 'marketTerminal',
        resourceType: RESOURCE_UTRIUM,
        amount: 100
    }, 'resource market should fulfill explicit arbitrary resource move requests');

    EventBus.topics = {};
    const fullHauler = {
        name: 'FullHauler',
        room: marketRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 11, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 11) + Math.abs(pos.y - 10) },
        store: makeStore({ energy: 100 }, 100),
        body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
    };
    Game.creeps = { FullHauler: fullHauler };
    resourceMarket.init();
    resourceMarket.assignHauler(fullHauler);
    assert.deepStrictEqual(fullHauler.memory.task, {
        type: 'TRANSFER',
        targetId: 'marketSpawn',
        resourceType: RESOURCE_ENERGY
    }, 'loaded hauler should prioritize spawn energy demand from resource market');

    const hungrySpawn = {
        id: 'hungrySpawn',
        structureType: STRUCTURE_SPAWN,
        pos: { x: 20, y: 20, roomName: 'W1N1' },
        store: makeStore({ energy: 0 }, 300)
    };
    const hugeStorageSink = {
        id: 'hugeStorageSink',
        structureType: STRUCTURE_STORAGE,
        pos: { x: 10, y: 10, roomName: 'W1N1' },
        store: makeStore({ energy: 1000 }, 1000000)
    };
    const hungryRoom = {
        name: 'W1N1',
        controller,
        storage: hugeStorageSink,
        find: (type, opts = {}) => {
            let results = [];
            if (type === FIND_DROPPED_RESOURCES) results = [];
            if (type === FIND_MY_STRUCTURES) results = [hungrySpawn, hugeStorageSink];
            if (type === FIND_STRUCTURES) results = [hungrySpawn, hugeStorageSink];
            if (opts.filter) return results.filter(opts.filter);
            return results;
        }
    };
    const hungryHauler = {
        name: 'HungryHauler',
        room: hungryRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 11, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 11) + Math.abs(pos.y - 10) },
        store: makeStore({ energy: 100 }, 100),
        body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
    };
    Game.rooms = { W1N1: hungryRoom };
    Game.creeps = { HungryHauler: hungryHauler };
    Game.getObjectById = (id) => {
        if (id === 'hungrySpawn') return hungrySpawn;
        if (id === 'hugeStorageSink') return hugeStorageSink;
        return Game.creeps[id] || null;
    };
    Memory.rooms.W1N1.resourceMarket = { reservations: { supply: {}, demand: {} } };
    resourceMarket.init();
    resourceMarket.buildRoomMarket(hungryRoom);
    resourceMarket.assignHauler(hungryHauler);
    assert.deepStrictEqual(hungryHauler.memory.task, {
        type: 'TRANSFER',
        targetId: 'hungrySpawn',
        resourceType: RESOURCE_ENERGY
    }, 'loaded energy hauler should refill spawn before large storage balance demand');

    const rescueStorage = {
        id: 'rescueStorage',
        structureType: STRUCTURE_STORAGE,
        pos: { x: 10, y: 10, roomName: 'W1N1' },
        store: makeStore({ energy: 2000 }, 5000)
    };
    const rescueSpawnMarket = {
        id: 'rescueSpawnMarket',
        structureType: STRUCTURE_SPAWN,
        pos: { x: 12, y: 10, roomName: 'W1N1' },
        store: makeStore({ energy: 100 }, 300)
    };
    const rescueMarketRoom = {
        name: 'W1N1',
        controller,
        storage: rescueStorage,
        find: (type, opts = {}) => {
            let results = [];
            if (type === FIND_DROPPED_RESOURCES) results = [];
            if (type === FIND_MY_STRUCTURES) results = [rescueSpawnMarket, rescueStorage];
            if (type === FIND_STRUCTURES) results = [rescueSpawnMarket, rescueStorage];
            if (opts.filter) return results.filter(opts.filter);
            return results;
        }
    };
    const rescueEnergyHauler = {
        name: 'RescueEnergyHauler',
        room: rescueMarketRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 11, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 11) + Math.abs(pos.y - 10) },
        store: makeStore({}, 100),
        body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
    };
    Game.rooms = { W1N1: rescueMarketRoom };
    Game.creeps = { RescueEnergyHauler: rescueEnergyHauler };
    Game.getObjectById = (id) => {
        if (id === 'rescueStorage') return rescueStorage;
        if (id === 'rescueSpawnMarket') return rescueSpawnMarket;
        return Game.creeps[id] || null;
    };
    global.RoomPhase = { W1N1: { logisticsMode: 'hauler', storageRescueActive: true, energyPosture: 'spawn_rescue' } };
    Memory.rooms.W1N1.resourceMarket = { reservations: { supply: {}, demand: {} } };
    resourceMarket.init();
    resourceMarket.buildRoomMarket(rescueMarketRoom);
    resourceMarket.assignHauler(rescueEnergyHauler);
    assert.deepStrictEqual(rescueEnergyHauler.memory.task, {
        type: 'WITHDRAW',
        targetId: 'rescueStorage',
        resourceType: RESOURCE_ENERGY,
        amount: 100
    }, 'empty hauler should draw from storage to refill spawn while storage rescue is active');

    const partiallyUnloadedHauler = {
        name: 'PartiallyUnloadedHauler',
        room: rescueMarketRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 13, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 13) + Math.abs(pos.y - 10) },
        store: makeStore({ energy: 200 }, 250),
        body: [{ type: CARRY }, { type: CARRY }, { type: CARRY }, { type: CARRY }, { type: CARRY }, { type: MOVE }]
    };
    Game.creeps = { PartiallyUnloadedHauler: partiallyUnloadedHauler };
    Memory.rooms.W1N1.resourceMarket = { reservations: { supply: {}, demand: {} } };
    resourceMarket.init();
    resourceMarket.buildRoomMarket(rescueMarketRoom);
    resourceMarket.assignHauler(partiallyUnloadedHauler);
    assert.deepStrictEqual(partiallyUnloadedHauler.memory.task, {
        type: 'TRANSFER',
        targetId: 'rescueSpawnMarket',
        resourceType: RESOURCE_ENERGY
    }, 'partially unloaded hauler should continue delivering carried energy before returning to top off');

    const normalEnergyHauler = {
        name: 'NormalEnergyHauler',
        room: rescueMarketRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 11, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 11) + Math.abs(pos.y - 10) },
        store: makeStore({}, 100),
        body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
    };
    Game.creeps = { NormalEnergyHauler: normalEnergyHauler };
    global.RoomPhase = { W1N1: { logisticsMode: 'hauler', storageRescueActive: false, energyPosture: 'normal' } };
    Memory.rooms.W1N1.resourceMarket = { reservations: { supply: {}, demand: {} } };
    resourceMarket.init();
    resourceMarket.buildRoomMarket(rescueMarketRoom);
    resourceMarket.assignHauler(normalEnergyHauler);
    assert.strictEqual(normalEnergyHauler.memory.task, undefined, 'empty hauler should not continually drain storage for ordinary spawn top-off outside rescue');

    const preciseStorage = {
        id: 'preciseStorage',
        structureType: STRUCTURE_STORAGE,
        pos: { x: 10, y: 10, roomName: 'W1N1' },
        store: makeStore({ U: 300 }, 1000)
    };
    const preciseLab = {
        id: 'preciseLab',
        structureType: STRUCTURE_LAB,
        pos: { x: 15, y: 10, roomName: 'W1N1' },
        store: makeStore({}, 500)
    };
    const preciseHauler = {
        name: 'PreciseHauler',
        room: { name: 'W1N1' },
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 11, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 11) + Math.abs(pos.y - 10) },
        store: makeStore({}, 100),
        body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
    };
    global.ResourceMarket = {
        W1N1: {
            roomName: 'W1N1',
            supplies: [{
                id: 'supply:preciseStorage:U',
                roomName: 'W1N1',
                kind: 'withdraw',
                targetId: 'preciseStorage',
                resourceType: RESOURCE_UTRIUM,
                amount: 300,
                priority: 65
            }],
            demands: [{
                id: 'demand:preciseLab:U',
                roomName: 'W1N1',
                targetId: 'preciseLab',
                resourceType: RESOURCE_UTRIUM,
                amount: 7,
                priority: 85,
                purpose: 'lab_input',
                demandType: 'worker',
                deliveryMode: 'haul',
                producer: 'test'
            }],
            reservations: { supply: {}, demand: {} },
            logistics: { haulerThroughput: 0, workDemand: 0 },
            supplyMode: 'hauler_supply',
            stats: resourceMarket.createEmptyStats()
        }
    };
    Game.rooms = { W1N1: { name: 'W1N1', controller, storage: preciseStorage, find: () => [] } };
    Game.creeps = { PreciseHauler: preciseHauler };
    Game.getObjectById = (id) => {
        if (id === 'preciseStorage') return preciseStorage;
        if (id === 'preciseLab') return preciseLab;
        return Game.creeps[id] || null;
    };
    resourceMarket.assignHauler(preciseHauler);
    assert.deepStrictEqual(preciseHauler.memory.task, {
        type: 'WITHDRAW',
        targetId: 'preciseStorage',
        resourceType: RESOURCE_UTRIUM,
        amount: 7
    }, 'empty hauler should only withdraw the remaining amount for precise small demands');

    const fallbackEnergyHauler = {
        name: 'FallbackEnergyHauler',
        room: marketRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 11, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 11) + Math.abs(pos.y - 10) },
        store: makeStore({ energy: 100 }, 100),
        body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
    };
    const fullSpawnRoom = {
        ...marketRoom,
        find: (type, opts = {}) => {
            let results = [];
            if (type === FIND_DROPPED_RESOURCES) results = [];
            if (type === FIND_MY_STRUCTURES) results = [{
                ...marketSpawn,
                store: makeStore({ energy: 300 }, 300)
            }, marketStorage, marketTerminal, marketLab];
            if (type === FIND_STRUCTURES) results = [{
                ...marketSpawn,
                store: makeStore({ energy: 300 }, 300)
            }, marketStorage, marketTerminal, marketLab, {
                ...marketControllerContainer,
                store: makeStore({ energy: 1200 }, 2000)
            }];
            if (opts.filter) return results.filter(opts.filter);
            return results;
        }
    };
    Game.rooms = { W1N1: fullSpawnRoom };
    Game.creeps = { FallbackEnergyHauler: fallbackEnergyHauler };
    Game.getObjectById = (id) => {
        if (id === 'marketSpawn') return fullSpawnRoom.find(FIND_MY_STRUCTURES)[0];
        return marketObjects[id] || Game.creeps[id] || null;
    };
    Memory.rooms.W1N1.resourceMarket = { reservations: { supply: {}, demand: {} } };
    resourceMarket.init();
    resourceMarket.buildRoomMarket(fullSpawnRoom);
    resourceMarket.assignHauler(fallbackEnergyHauler);
    assert.deepStrictEqual(fallbackEnergyHauler.memory.task, {
        type: 'TRANSFER',
        targetId: 'marketStorage',
        resourceType: RESOURCE_ENERGY
    }, 'loaded hauler should store energy in storage when there is no active demand');
    Game.rooms = { W1N1: marketRoom };
    Game.getObjectById = (id) => marketObjects[id] || Game.creeps[id] || null;

    const repairDemandRoom = {
        name: 'W1N1',
        controller: { my: true },
        storage: null,
        find: (type, opts = {}) => {
            let results = [];
            if (type === FIND_DROPPED_RESOURCES) results = [];
            if (type === FIND_MY_STRUCTURES) results = [];
            if (type === FIND_STRUCTURES) results = [];
            if (opts.filter) return results.filter(opts.filter);
            return results;
        }
    };
    const supplyHauler = {
        name: 'SupplyHauler',
        id: 'supplyHaulerId',
        room: repairDemandRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 10, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 10) + Math.abs(pos.y - 10) },
        store: makeStore({ energy: 100 }, 100),
        body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
    };
    const marketWaitingRepairer = {
        name: 'MarketWaitingRepairer',
        id: 'marketWaitingRepairerId',
        room: repairDemandRoom,
        memory: { role: 'repairer', homeRoom: 'W1N1' },
        pos: { x: 12, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 12) + Math.abs(pos.y - 10) },
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 },
        body: [{ type: WORK }, { type: CARRY }, { type: MOVE }]
    };
    Game.rooms = { W1N1: repairDemandRoom };
    Game.creeps = { SupplyHauler: supplyHauler, MarketWaitingRepairer: marketWaitingRepairer };
    Game.getObjectById = (id) => Game.creeps[id] || null;
    global.RoomPhase = { W1N1: { logisticsMode: 'hauler' } };
    global.ResourceMarket = {};
    resourceMarket.init();
    resourceMarket.buildRoomMarket(repairDemandRoom);
    const deliveredPlan = resourceMarket.requestResource(marketWaitingRepairer, {
        resourceType: RESOURCE_ENERGY,
        amount: 50,
        purpose: 'repair',
        targetId: 'marketWaitingRepairerId',
        targetPos: { x: 20, y: 20, roomName: 'W1N1' },
        priority: 60,
        allowedFulfillment: ['self_fetch', 'delivery']
    });
    assert.strictEqual(deliveredPlan.mode, 'delivery', 'resource market should choose delivery when no local self-fetch exists and a hauler can fulfill the request');
    assert.strictEqual(deliveredPlan.reason, 'delivery_selected', 'resource market should explain why delivery was selected');
    assert.deepStrictEqual(supplyHauler.memory.task, {
        type: 'TRANSFER',
        targetId: 'marketWaitingRepairerId',
        resourceType: RESOURCE_ENERGY,
        amount: 50
    }, 'resource market should immediately wake an idle loaded hauler when a worker requests delivery');
    resourceMarket.assignHauler(supplyHauler);
    assert.deepStrictEqual(supplyHauler.memory.task, {
        type: 'TRANSFER',
        targetId: 'marketWaitingRepairerId',
        resourceType: RESOURCE_ENERGY,
        amount: 50
    }, 'resource market should assign loaded hauler to worker delivery demand');
    const repairerDemands = global.ResourceMarket.W1N1.demands.filter((demand) => {
        return demand.targetId === 'marketWaitingRepairerId' &&
            demand.resourceType === RESOURCE_ENERGY &&
            demand.purpose === 'repair';
    });
    assert.strictEqual(repairerDemands.length, 1, 'resource market should register a single worker delivery demand for repair requests');
    assert.ok(Memory.rooms.W1N1.resourceMarket.stats.deliverySelected >= 1, 'resource market should record delivery selections in stats');
    Game.rooms = { W1N1: marketRoom };
    Game.getObjectById = (id) => marketObjects[id] || Game.creeps[id] || null;

    const idleTerminal = {
        id: 'idleTerminal',
        structureType: STRUCTURE_TERMINAL,
        pos: { x: 14, y: 10, roomName: 'W1N1' },
        store: makeStore({ energy: 500 }, 3000)
    };
    const idleNoDemandRoom = {
        name: 'W1N1',
        controller,
        storage: null,
        find: (type, opts = {}) => {
            let results = [];
            if (type === FIND_DROPPED_RESOURCES) results = [marketDrop];
            if (type === FIND_MY_STRUCTURES) results = [];
            if (type === FIND_STRUCTURES) results = [idleTerminal];
            if (opts.filter) return results.filter(opts.filter);
            return results;
        }
    };
    const idleHauler = {
        name: 'IdleHauler',
        room: idleNoDemandRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 12, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 12) + Math.abs(pos.y - 10) },
        store: makeStore({}, 100),
        body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }]
    };
    Game.rooms = { W1N1: idleNoDemandRoom };
    Game.creeps = { IdleHauler: idleHauler };
    Game.getObjectById = (id) => marketObjects[id] || (id === 'idleTerminal' ? idleTerminal : Game.creeps[id] || null);
    Memory.rooms.W1N1.resourceMarket = {
        reservations: {
            supply: {
                'supply:marketDrop:energy': { amount: 100, expiresAt: Game.time + 5 }
            },
            demand: {}
        }
    };
    resourceMarket.init();
    resourceMarket.buildRoomMarket(idleNoDemandRoom);
    resourceMarket.assignHauler(idleHauler);
    assert.strictEqual(idleHauler.memory.task, undefined, 'empty hauler should stay idle when only reserved dropped energy exists and there is no demand');
    assert.ok(Memory.rooms.W1N1.resourceMarket.stats.idleHaulers >= 1, 'resource market should track idle haulers when no safe fallback exists');
    Game.rooms = { W1N1: marketRoom };
    Game.getObjectById = (id) => marketObjects[id] || Game.creeps[id] || null;

    const weakLogisticsRoom = {
        name: 'W1N1',
        controller,
        storage: marketStorage,
        find: (type) => type === FIND_STRUCTURES ? [marketStorage] : []
    };
    Memory.rooms.W1N1.resourceMarket = { reservations: { supply: {}, demand: {} } };
    const marketBuilder = new BuilderStrategyService('BuilderStrategy');
    const marketRepairerService = new RepairerStrategyService('RepairerStrategy');
    const emptySelfSupplyBuilder = {
        room: weakLogisticsRoom,
        memory: { role: 'builder', homeRoom: 'W1N1' },
        body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
        store: { getUsedCapacity: () => 0 }
    };
    Game.creeps = {
        BuilderNeedingEnergy: emptySelfSupplyBuilder,
        HaulerTiny: { memory: { role: 'hauler', homeRoom: 'W1N1' }, body: [{ type: CARRY }] }
    };
    global.ResourceMarket = { W1N1: { supplyMode: 'self_supply' } };
    marketBuilder.assignBuilderTask(emptySelfSupplyBuilder);
    assert.deepStrictEqual(emptySelfSupplyBuilder.memory.task, {
        type: 'WITHDRAW',
        targetId: 'marketStorage',
        resourceType: RESOURCE_ENERGY
    }, 'builder should self-supply energy when room logistics capacity is insufficient');

    const suppliedBuilder = {
        name: 'SuppliedBuilder',
        id: 'suppliedBuilderId',
        room: weakLogisticsRoom,
        memory: { role: 'builder', homeRoom: 'W1N1' },
        body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 }
    };
    Game.creeps = {
        SuppliedBuilder: suppliedBuilder,
        HaulerStrong: { memory: { role: 'hauler', homeRoom: 'W1N1' }, body: [{ type: CARRY }, { type: CARRY }, { type: CARRY }, { type: CARRY }, { type: CARRY }, { type: CARRY }] }
    };
    Memory.rooms.W1N1.resourceMarket = { reservations: { supply: {}, demand: {} } };
    global.ResourceMarket = { W1N1: { supplyMode: 'hauler_supply' } };
    EventBus.topics = {};
    marketBuilder.assignBuilderTask(suppliedBuilder);
    assert.deepStrictEqual(suppliedBuilder.memory.task, {
        type: 'WITHDRAW',
        targetId: 'marketStorage',
        resourceType: RESOURCE_ENERGY
    }, 'builder should still self-supply when local energy is closer than involving hauler delivery');

    const suppliedRepairer = {
        name: 'SuppliedRepairer',
        id: 'suppliedRepairerId',
        room: weakLogisticsRoom,
        memory: { role: 'repairer', homeRoom: 'W1N1' },
        body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 }
    };
    global.ResourceMarket = { W1N1: { supplyMode: 'hauler_supply' } };
    Memory.rooms.W1N1.resourceMarket = { reservations: { supply: {}, demand: {} } };
    EventBus.topics = {};
    marketRepairerService.assignRepairerTask(suppliedRepairer);
    assert.deepStrictEqual(suppliedRepairer.memory.task, {
        type: 'WITHDRAW',
        targetId: 'marketStorage',
        resourceType: RESOURCE_ENERGY
    }, 'repairer should still self-supply when local energy is closer than involving hauler delivery');

    const noLocalSupplyRoom = {
        name: 'W1N1',
        controller,
        storage: null,
        find: () => []
    };
    const waitingBuilder = {
        name: 'WaitingBuilder',
        id: 'waitingBuilderId',
        room: noLocalSupplyRoom,
        memory: { role: 'builder', homeRoom: 'W1N1' },
        body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 }
    };
    global.ResourceMarket = { W1N1: { demands: [], reservations: { supply: {}, demand: {} }, supplies: [] } };
    EventBus.topics = {};
    marketBuilder.assignBuilderTask(waitingBuilder);
    assert.strictEqual(waitingBuilder.memory.task, undefined, 'builder should wait when ResourceMarket cannot find a local energy source');
    assert.ok(global.ResourceMarket.W1N1.demands.some((demand) => demand.targetId === 'waitingBuilderId' && demand.resourceType === RESOURCE_ENERGY), 'builder should register resource demand when ResourceMarket cannot fulfill immediately');
    assert.strictEqual(waitingBuilder.memory.builderState.state, 'waiting_resource_unavailable', 'builder state should explain null tasks caused by unavailable resource supply');
    assert.strictEqual(waitingBuilder.memory.builderState.reason, 'no_supply', 'builder state should include the resource market unavailable reason');
    assert.strictEqual(Memory.rooms.W1N1.resourceMarket.stats.unavailableRequests, 1, 'resource market should track unavailable requests in stats');

    const waitingRepairer = {
        name: 'WaitingRepairer',
        id: 'waitingRepairerId',
        room: noLocalSupplyRoom,
        memory: { role: 'repairer', homeRoom: 'W1N1' },
        body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 }
    };
    global.ResourceMarket = { W1N1: { demands: [], reservations: { supply: {}, demand: {} }, supplies: [] } };
    EventBus.topics = {};
    marketRepairerService.assignRepairerTask(waitingRepairer);
    assert.strictEqual(waitingRepairer.memory.task, undefined, 'repairer should wait when ResourceMarket cannot find a local energy source');
    assert.ok(global.ResourceMarket.W1N1.demands.some((demand) => demand.targetId === 'waitingRepairerId' && demand.resourceType === RESOURCE_ENERGY), 'repairer should register resource demand when ResourceMarket cannot fulfill immediately');

    const reservedSupplyRoom = {
        name: 'W1N1',
        controller,
        storage: marketStorage,
        find: (type) => type === FIND_STRUCTURES ? [marketStorage] : []
    };
    const reservationBlockedBuilder = {
        name: 'ReservationBlockedBuilder',
        id: 'reservationBlockedBuilderId',
        room: reservedSupplyRoom,
        pos: { x: 14, y: 14, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 14) + Math.abs(pos.y - 14) },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
        store: { getUsedCapacity: () => 0, getFreeCapacity: () => 50 }
    };
    Game.rooms = { W1N1: reservedSupplyRoom };
    Game.creeps = { ReservationBlockedBuilder: reservationBlockedBuilder };
    Game.getObjectById = (id) => marketObjects[id] || Game.creeps[id] || null;
    Memory.rooms.W1N1.resourceMarket = {
        reservations: {
            supply: {
                'supply:marketStorage:energy': { amount: 200, expiresAt: Game.time + 5 }
            },
            demand: {}
        }
    };
    resourceMarket.init();
    resourceMarket.buildRoomMarket(reservedSupplyRoom);
    const reservedResult = resourceMarket.requestResource(reservationBlockedBuilder, {
        resourceType: RESOURCE_ENERGY,
        amount: 50,
        purpose: 'build',
        targetId: 'reservationBlockedBuilderId',
        targetPos: { x: 20, y: 20, roomName: 'W1N1' },
        priority: 60,
        allowedFulfillment: ['self_fetch']
    });
    assert.strictEqual(reservedResult.mode, 'unavailable', 'resource market should report unavailable when supply exists but is fully reserved');
    assert.strictEqual(reservedResult.reason, 'reserved_supply', 'resource market should distinguish reserved supply from total absence');
    assert.ok(global.ResourceMarket.W1N1.demands.some((demand) => demand.targetId === 'reservationBlockedBuilderId' && demand.resourceType === RESOURCE_ENERGY), 'resource market should still retain demand when self-fetch supply is fully reserved');
    assert.ok(Memory.rooms.W1N1.resourceMarket.stats.reservedSupplyCount >= 1, 'resource market stats should expose reserved supply pressure');
    Game.rooms = { W1N1: marketRoom };
    Game.getObjectById = (id) => marketObjects[id] || Game.creeps[id] || null;

    EventBus.topics = {};
    global.REACTIONS = { U: { L: RESOURCE_UTRIUM_LEMERGITE } };
    const labService = new LabService('Lab');
    labService.requestLabDelivery('marketLab', RESOURCE_UTRIUM, 100);
    assert.ok(EventBus.topics.REQ_RESOURCE && EventBus.topics.REQ_RESOURCE.some((event) => event.data.action === 'demand' && event.data.resourceType === RESOURCE_UTRIUM), 'lab delivery should publish REQ_RESOURCE demand');
    assert.ok(!EventBus.topics.REQ_LOGISTICS, 'lab delivery should not publish old logistics requests');

    const compoundHauler = {
        name: 'CompoundHauler',
        room: marketRoom,
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 14, y: 15, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 14) + Math.abs(pos.y - 15) },
        store: makeStore({ UL: 50 }, 100),
        body: [{ type: CARRY }, { type: MOVE }]
    };
    Game.creeps = { CompoundHauler: compoundHauler };
    resourceMarket.init();
    resourceMarket.assignHauler(compoundHauler);
    assert.deepStrictEqual(compoundHauler.memory.task, {
        type: 'TRANSFER',
        targetId: 'marketTerminal',
        resourceType: RESOURCE_UTRIUM_LEMERGITE
    }, 'loaded hauler should store lab compounds in terminal when no explicit demand exists');
    assert.ok(Memory.rooms.W1N1.resourceMarket.stats.fallbackStoreAssignments >= 1, 'resource market should track fallback storage assignments');

    const emptyHaulerNoDemand = {
        name: 'EmptyHaulerNoDemand',
        room: {
            name: 'W1N1',
            controller,
            storage: null,
            find: (type, opts = {}) => {
                let results = [];
                if (type === FIND_DROPPED_RESOURCES) results = [];
                if (type === FIND_MY_STRUCTURES) results = [];
                if (type === FIND_STRUCTURES) results = [idleTerminal];
                if (opts.filter) return results.filter(opts.filter);
                return results;
            }
        },
        memory: { role: 'hauler', homeRoom: 'W1N1' },
        pos: { x: 13, y: 10, roomName: 'W1N1', getRangeTo: (pos) => Math.abs(pos.x - 13) + Math.abs(pos.y - 10) },
        store: makeStore({}, 100),
        body: [{ type: CARRY }, { type: MOVE }]
    };
    Game.rooms = { W1N1: emptyHaulerNoDemand.room };
    Game.creeps = { EmptyHaulerNoDemand: emptyHaulerNoDemand };
    Game.getObjectById = (id) => marketObjects[id] || (id === 'idleTerminal' ? idleTerminal : Game.creeps[id] || null);
    Memory.rooms.W1N1.resourceMarket = { reservations: { supply: {}, demand: {} } };
    resourceMarket.init();
    resourceMarket.buildRoomMarket(emptyHaulerNoDemand.room);
    resourceMarket.assignHauler(emptyHaulerNoDemand);
    assert.strictEqual(emptyHaulerNoDemand.memory.task, undefined, 'empty hauler should not withdraw ordinary storage energy when there is no demand or explicit high-value supply');

    {
        const savedGame = { ...Game };
        const savedMemory = Memory;
        const savedMarket = global.ResourceMarket;
        const savedMarketService = global.ResourceMarketService;
        const { clearTaskState, assignTask } = await import('../core/TaskMetadata.js');
        Game.time = 100;
        const feedbackRoom = { name: 'W1N1', controller: { my: true }, find: () => [] };
        Game.rooms = { W1N1: feedbackRoom };
        global.Memory = { rooms: {}, empire: {} };
        let targetEnergy = 0;
        let feedbackTarget = { id: 'feedback-sink', pos: { x: 25, y: 25, roomName: 'W1N1' }, store: { getUsedCapacity: () => targetEnergy, getFreeCapacity: () => 100 - targetEnergy } };
        Game.getObjectById = id => id === 'feedback-sink' ? feedbackTarget : null;
        const energyByName = { FeedbackA: 50, FeedbackB: 50 };
        const makeFeedbackHauler = name => ({
            name, room: feedbackRoom, memory: { role: 'hauler', homeRoom: 'W1N1' },
            pos: { x: 24, y: 25, roomName: 'W1N1', getRangeTo: () => 1 },
            store: { energy: 50, getUsedCapacity: () => energyByName[name], getFreeCapacity: () => 100 - energyByName[name] },
            transfer: () => OK
        });
        const a = makeFeedbackHauler('FeedbackA');
        const b = makeFeedbackHauler('FeedbackB');
        Game.creeps = { FeedbackA: a, FeedbackB: b };
        const feedbackService = new ResourceMarketService('ResourceMarket');
        const createFeedbackMarket = () => feedbackService.ensureMarketShape({ demands: [{
            id: 'feedback-demand', targetId: 'feedback-sink', resourceType: RESOURCE_ENERGY, amount: 100,
            priority: 80, purpose: 'economy_energy'
        }] }, 'W1N1');
        let feedbackMarket = createFeedbackMarket();
        global.ResourceMarket = { W1N1: feedbackMarket };
        feedbackService.assignHauler(a);
        feedbackService.assignHauler(b);
        clearTaskState(a, 'diagnostic_cancel');
        feedbackService.cleanup();
        assert.strictEqual(feedbackMarket.reservations.demand['feedback-demand'].amount, 50, 'cancelling one task must release only that owner reservation');
        assert.ok(b.memory.task, 'the other competing hauler must retain its task');
        feedbackService.cleanup();
        assert.strictEqual(feedbackMarket.reservations.demand['feedback-demand'].amount, 50, 'repeated cancellation reconciliation must be idempotent');
        feedbackTarget = null;
        ActionParser.run(b);
        feedbackService.cleanup();
        assert.strictEqual(Object.keys(feedbackMarket.reservations.demand).length, 0, 'a disappearing target must release its owner reservation without waiting for TTL');

        feedbackTarget = { id: 'feedback-sink', pos: { x: 25, y: 25, roomName: 'W1N1' }, store: { getUsedCapacity: () => targetEnergy, getFreeCapacity: () => 100 - targetEnergy } };
        feedbackMarket = createFeedbackMarket();
        global.ResourceMarket = { W1N1: feedbackMarket };
        feedbackService.assignHauler(a);
        ActionParser.run(a);
        feedbackService.cleanup();
        assert.strictEqual(feedbackMarket.reservations.demand['feedback-demand'].amount, 50, 'an accepted intent must retain its reservation until the next tick');
        assert.strictEqual(feedbackMarket.stats.confirmedDeliveryAmount || 0, 0, 'same-tick OK must not be reported as delivered energy');
        Game.time++;
        energyByName.FeedbackA = 20;
        targetEnergy = 30;
        feedbackService.cleanup();
        assert.strictEqual(Object.keys(feedbackMarket.reservations.demand).length, 0, 'the completed intent should release its owner in a fresh tick');
        assert.strictEqual(feedbackMarket.stats.confirmedDeliveryAmount, 30, 'partial unload should confirm only the actual matched store delta');
        feedbackService.cleanup();
        assert.strictEqual(feedbackMarket.stats.confirmedDeliveryAmount, 30, 'confirmation must not count the same reservation twice');

        feedbackMarket = createFeedbackMarket();
        global.ResourceMarket = { W1N1: feedbackMarket };
        energyByName.FeedbackA = 50;
        targetEnergy = 0;
        feedbackService.assignHauler(a);
        ActionParser.run(a);
        feedbackService.cleanup();
        Game.time++;
        feedbackTarget = null;
        feedbackService.cleanup();
        assert.strictEqual(feedbackMarket.stats.confirmedDeliveryAmount || 0, 0, 'missing next-tick evidence must not turn intended quantity into confirmed delivery');
        assert.strictEqual(feedbackMarket.stats.confirmationUnknown, 1, 'missing next-tick evidence should be visible as unknown confirmation');

        feedbackTarget = { id: 'feedback-sink', pos: { x: 25, y: 25, roomName: 'W1N1' }, store: { getUsedCapacity: () => 0, getFreeCapacity: () => 100 } };
        feedbackMarket = createFeedbackMarket();
        global.ResourceMarket = { W1N1: feedbackMarket };
        feedbackService.assignHauler(a);
        assignTask(a, { type: 'MOVE_TO', pos: { x: 20, y: 20, roomName: 'W1N1' } });
        feedbackService.cleanup();
        assert.strictEqual(Object.keys(feedbackMarket.reservations.demand).length, 0, 'replacing a resource task must release its old owner claim');

        feedbackMarket = createFeedbackMarket();
        global.ResourceMarket = { W1N1: feedbackMarket };
        a.memory.task = null;
        feedbackService.assignHauler(a);
        delete Game.creeps.FeedbackA;
        feedbackService.cleanup();
        assert.strictEqual(Object.keys(feedbackMarket.reservations.demand).length, 0, 'a dead owner must not retain its claim');
        Game.creeps.FeedbackA = a;
        a.memory.task = null;
        feedbackService.assignHauler(a);
        const taskLimit = a.memory.taskMeta.logisticsReservation.maxExpiresAt;
        Game.time += 6;
        feedbackService.cleanup();
        assert.ok(feedbackMarket.reservations.demand['feedback-demand'].expiresAt >= Game.time, 'a still valid travelling task should regain a bounded reservation after the short TTL');
        Game.time = taskLimit + 1;
        new TaskGuardService('TaskGuard').analyze();
        feedbackService.cleanup();
        assert.strictEqual(a.memory.task, null, 'a stalled resource task must not run beyond its bounded deadline');
        assert.strictEqual(Object.keys(feedbackMarket.reservations.demand).length, 0, 'the bounded task deadline must release its claim');

        Game.time++;
        energyByName.FeedbackA = 50;
        targetEnergy = 0;
        feedbackTarget = { id: 'feedback-sink', pos: { x: 25, y: 25, roomName: 'W1N1' }, store: { getUsedCapacity: () => targetEnergy, getFreeCapacity: () => 100 - targetEnergy } };
        feedbackMarket = createFeedbackMarket();
        global.ResourceMarket = { W1N1: feedbackMarket };
        feedbackService.assignHauler(a);
        ActionParser.run(a);
        a.memory = JSON.parse(JSON.stringify(a.memory));
        global.Memory = JSON.parse(JSON.stringify(Memory));
        Game.time++;
        energyByName.FeedbackA = 20;
        targetEnergy = 30;
        const resetFeedbackService = new ResourceMarketService('ResourceMarketAfterReset');
        resetFeedbackService.init();
        resetFeedbackService.analyze();
        assert.strictEqual(global.ResourceMarket.W1N1.stats.confirmedDeliveryAmount, 30, 'serialized receipts must restore confirmation after a service reset');
        assert.strictEqual(Object.keys(global.ResourceMarket.W1N1.reservations.demand).length, 0, 'reset reconciliation must release the old completed claim');

        feedbackMarket = createFeedbackMarket();
        feedbackMarket.demands[0].amount = 1000;
        targetEnergy = 0;
        feedbackTarget = {
            id: 'feedback-sink', pos: { x: 25, y: 25, roomName: 'W1N1' },
            store: { getUsedCapacity: () => targetEnergy, getFreeCapacity: () => 1000 - targetEnergy }
        };
        global.ResourceMarket = { W1N1: feedbackMarket };
        Game.creeps = {};
        for (let i = 0; i < 201; i++) {
            const name = `CapacityHauler${i}`;
            energyByName[name] = 1;
            const hauler = makeFeedbackHauler(name);
            Game.creeps[name] = hauler;
            const assigned = resetFeedbackService.assignHauler(hauler);
            assert.strictEqual(assigned, i < 200, 'owner capacity must accept only the first 200 live claims');
        }
        assert.strictEqual(Object.keys(feedbackMarket.reservations.demand['feedback-demand'].owners).length, 200, 'capacity rejection must retain all existing owners');
        assert.strictEqual(feedbackMarket.stats.reservationBlocked, 1, 'capacity blocking must remain observable');

        Game.time++;
        let supplyEnergy = 200;
        const sourceStore = { id: 'feedback-source', pos: { x: 23, y: 25, roomName: 'W1N1' }, store: { getUsedCapacity: () => supplyEnergy, getFreeCapacity: () => 300 - supplyEnergy } };
        Game.getObjectById = id => id === 'feedback-source' ? sourceStore : (id === 'feedback-sink' ? feedbackTarget : null);
        energyByName.FeedbackA = 0;
        a.memory = { role: 'hauler', homeRoom: 'W1N1' };
        a.withdraw = () => OK;
        Game.creeps = { FeedbackA: a };
        feedbackMarket = createFeedbackMarket();
        feedbackMarket.supplies = [{ id: 'feedback-supply', kind: 'withdraw', targetId: 'feedback-source', resourceType: RESOURCE_ENERGY, amount: 200, priority: 60 }];
        global.ResourceMarket = { W1N1: feedbackMarket };
        resetFeedbackService.assignHauler(a);
        assert.strictEqual(a.memory.task.type, 'WITHDRAW', 'empty hauler should use the normal supply API');
        ActionParser.run(a);
        resetFeedbackService.cleanup();
        assert.strictEqual(feedbackMarket.reservations.supply['feedback-supply'].amount, 100, 'accepted withdrawal must retain its same-tick supply claim');
        Game.time++;
        energyByName.FeedbackA = 30;
        supplyEnergy = 170;
        resetFeedbackService.cleanup();
        assert.strictEqual(feedbackMarket.stats.confirmedPickupAmount, 30, 'withdrawal confirmation must use actual resource deltas');

        Game.time++;
        const self = makeFeedbackHauler('SelfFetcher');
        self.memory.role = 'builder';
        self.withdraw = () => OK;
        energyByName.SelfFetcher = 0;
        Game.creeps.SelfFetcher = self;
        feedbackMarket = createFeedbackMarket();
        feedbackMarket.supplies = [{ id: 'feedback-supply', kind: 'withdraw', targetId: 'feedback-source', resourceType: RESOURCE_ENERGY, amount: supplyEnergy, priority: 60 }];
        global.ResourceMarket = { W1N1: feedbackMarket };
        const selfRequest = resetFeedbackService.requestResource(self, { resourceType: RESOURCE_ENERGY, amount: 50, purpose: 'build', targetId: 'feedback-sink', allowedFulfillment: ['self_fetch'] });
        assert.strictEqual(selfRequest.mode, 'self_fetch', 'worker self-fetch should retain its public API mode');
        assignTask(self, selfRequest.task);
        assert.ok(self.memory.taskMeta.logisticsReservation, 'the self-fetch task should carry a serializable owner reference in task metadata');
        ActionParser.run(self);
        resetFeedbackService.cleanup();
        Game.time++;
        energyByName.SelfFetcher = 20;
        supplyEnergy = 150;
        resetFeedbackService.cleanup();
        assert.strictEqual(feedbackMarket.stats.confirmedPickupAmount, 20, 'self-fetch confirmation should share the same actual-effect contract');
        Memory.empire.control.policy.resourceReservations.maxOwnersPerRoom = 'unbounded';
        feedbackMarket = createFeedbackMarket();
        global.ResourceMarket = { W1N1: feedbackMarket };
        a.memory.task = null;
        energyByName.FeedbackA = 50;
        assert.strictEqual(resetFeedbackService.assignHauler(a), false, 'malformed reservation limits must not disable the owner bound');
        Memory.empire.control.policy.resourceReservations.maxOwnersPerRoom = 200;
        Memory.rooms.W1N1.resourceMarket.reservations = { supply: { LegacyClearedSupply: null }, demand: {} };
        Game.creeps = {};
        resetFeedbackService.init();
        assert.doesNotThrow(() => resetFeedbackService.analyze(), 'legacy null reservation entries must retain the old prune compatibility');
        assert.strictEqual(Object.keys(global.ResourceMarket.W1N1.reservations.supply).length, 0, 'legacy null reservations should be pruned without blocking the room lifecycle');
        Object.assign(Game, savedGame);
        global.Memory = savedMemory;
        global.ResourceMarket = savedMarket;
        global.ResourceMarketService = savedMarketService;
    }

    EventBus.topics = {};
    global.Memory.empire.remoteRooms = { W2N2: { enabled: true, baseRoom: 'W1N1' } };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true },
        energyAvailable: 650,
        energyCapacityAvailable: 650,
        find: () => []
    };
    Game.rooms.W2N2 = {
        name: 'W2N2',
        controller: { reservation: { ticksToEnd: 500 } },
        find: (type) => type === FIND_SOURCES ? [] : []
    };
    const remoteMiningService = new RemoteMiningService('RemoteMining');
    remoteMiningService.init();
    remoteMiningService.analyze();
    const reserverRequest = EventBus.topics.REQ_SPAWN && EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'reserver');
    assert.strictEqual(reserverRequest, undefined, 'legacy remote config must not bypass the disabled pilot or publish a raw reserver request');

    EventBus.topics = {};
    global.Memory.empire.remoteRooms = { W3N3: { enabled: true, baseRoom: 'W1N1', distance: 60 } };
    Game.creeps = {};
    Game.rooms.W3N3 = {
        name: 'W3N3',
        controller: { reservation: { ticksToEnd: 2000 } },
        find: (type) => type === FIND_SOURCES ? [{ id: 'remoteSource1' }] : []
    };
    remoteMiningService.analyze();
    const remoteMinerRequest = EventBus.topics.REQ_SPAWN && EventBus.topics.REQ_SPAWN.find((event) => event.data.role === 'remoteMiner');
    assert.strictEqual(remoteMinerRequest, undefined, 'legacy distance hints must not activate an unvalidated remote source outside the single adjacent-room pilot');

    const defenderService = new DefenderStrategyService('DefenderStrategy');
    global.Security = { W1N1: { primaryTargetId: 'hostile1' } };
    const defender = {
        room: { name: 'W1N1' },
        memory: { role: 'defender', targetRoom: 'W1N1' }
    };
    Game.creeps = { Defender1: defender };
    defenderService.analyze();
    assert.deepStrictEqual(defender.memory.task, { type: 'ATTACK', targetId: 'hostile1' }, 'defender should attack the primary security target');

    global.Security = {};
    const fallbackDefenderRoom = {
        name: 'W1N1',
        find: (type) => type === FIND_HOSTILE_CREEPS ? [{ id: 'hostileFallback' }] : []
    };
    const fallbackDefender = {
        room: fallbackDefenderRoom,
        memory: { role: 'defender', targetRoom: 'W1N1' }
    };
    Game.creeps = { DefenderFallback: fallbackDefender };
    defenderService.analyze();
    assert.deepStrictEqual(fallbackDefender.memory.task, { type: 'ATTACK', targetId: 'hostileFallback' }, 'defender should attack visible hostiles when security cache has no primary target');

    const rangedDefender = {
        room: fallbackDefenderRoom,
        memory: { role: 'defender', targetRoom: 'W1N1' },
        body: [{ type: RANGED_ATTACK }, { type: MOVE }]
    };
    Game.creeps = { RangedDefender: rangedDefender };
    defenderService.analyze();
    assert.deepStrictEqual(rangedDefender.memory.task, { type: 'RANGED_ATTACK', targetId: 'hostileFallback' }, 'ranged defenders should use ranged attack tasks');

    global.Security = { W1N1: { posture: 'defend' } };
    const healerHostile = {
        id: 'healerHostile',
        pos: { x: 20, y: 20 },
        getActiveBodyparts: (part) => part === HEAL ? 2 : 0
    };
    const attackerHostile = {
        id: 'attackerHostile',
        pos: { x: 21, y: 20 },
        getActiveBodyparts: (part) => part === ATTACK ? 3 : 0
    };
    const focusRoom = {
        name: 'W1N1',
        find: (type) => type === FIND_HOSTILE_CREEPS ? [attackerHostile, healerHostile] : []
    };
    const firstDefender = {
        room: focusRoom,
        memory: { role: 'defender', targetRoom: 'W1N1' },
        body: [{ type: ATTACK }, { type: MOVE }]
    };
    const secondDefender = {
        room: focusRoom,
        memory: { role: 'defender', targetRoom: 'W1N1' },
        body: [{ type: ATTACK }, { type: MOVE }]
    };
    Game.rooms.W1N1 = focusRoom;
    Game.creeps = { FirstDefender: firstDefender, SecondDefender: secondDefender };
    defenderService.analyze();
    assert.deepStrictEqual(firstDefender.memory.task, { type: 'ATTACK', targetId: 'healerHostile' }, 'defenders should focus the highest-value hostile target');
    assert.deepStrictEqual(secondDefender.memory.task, { type: 'ATTACK', targetId: 'healerHostile' }, 'all idle defenders should focus the same priority hostile target');

    global.Security = { W1N1: { posture: 'develop', primaryTargetId: 'strongRangedHostile' } };
    const rallySpawn = {
        id: 'spawn1',
        structureType: STRUCTURE_SPAWN,
        pos: { x: 15, y: 15, roomName: 'W1N1' }
    };
    const strongRangedForRetreat = {
        id: 'strongRangedHostile',
        pos: { x: 20, y: 20 },
        getActiveBodyparts: (part) => part === RANGED_ATTACK ? 8 : 0
    };
    const rallyRoom = {
        name: 'W1N1',
        find: (type) => {
            if (type === FIND_HOSTILE_CREEPS) return [strongRangedForRetreat];
            if (type === FIND_MY_STRUCTURES) return [rallySpawn];
            return [];
        }
    };
    const weakMeleeDefender = {
        room: rallyRoom,
        memory: { role: 'defender', targetRoom: 'W1N1' },
        body: [{ type: TOUGH }, { type: ATTACK }, { type: MOVE }]
    };
    Game.rooms.W1N1 = rallyRoom;
    Game.creeps = { WeakMeleeDefender: weakMeleeDefender };
    defenderService.analyze();
    assert.deepStrictEqual(weakMeleeDefender.memory.task, {
        type: 'MOVE_TO',
        pos: { x: 15, y: 15, roomName: 'W1N1' },
        range: 3
    }, 'weak melee defenders should rally instead of charging overwhelming ranged threats during develop posture');

    EventBus.topics = {};
    global.Security = {};
    global.Memory = {
        creeps: {
            DefenderSpawning: { role: 'defender', targetRoom: 'W1N1' }
        },
        rooms: {},
        empire: {}
    };
    Game.creeps = {};
    const hostilePlayer = {
        id: 'hostile1',
        owner: { username: 'Enemy' },
        getActiveBodyparts: (part) => part === ATTACK ? 1 : 0
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true },
        energyCapacityAvailable: 300,
        find: (type) => type === FIND_HOSTILE_CREEPS ? [hostilePlayer] : []
    };
    const securityService = new SecurityService('Security');
    securityService.analyze();
    assert.ok(!global.SpawnDemands || !global.SpawnDemands.W1N1, 'security service should not demand more defenders while one is already spawning');

    EventBus.topics = {};
    global.Security = {};
    global.Memory = { creeps: {}, rooms: {}, empire: {} };
    Game.creeps = {};
    const strongRangedHostile = {
        id: 'strongRangedHostile',
        owner: { username: 'Enemy' },
        getActiveBodyparts: (part) => part === RANGED_ATTACK ? 8 : 0
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true, level: 2 },
        energyAvailable: 300,
        energyCapacityAvailable: 300,
        find: (type) => type === FIND_HOSTILE_CREEPS ? [strongRangedHostile] : []
    };
    securityService.analyze();
    assert.strictEqual(global.Security.W1N1.posture, 'develop', 'room should develop instead of feeding weak defenders into overwhelming ranged threats');
    assert.ok(!global.SpawnDemands || !global.SpawnDemands.W1N1, 'security service should not demand weak defenders against overwhelming ranged threats');

    EventBus.topics = {};
    global.Security = {};
    const weakHostile = {
        id: 'weakHostile',
        owner: { username: 'Enemy' },
        getActiveBodyparts: (part) => part === ATTACK ? 1 : 0
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true, level: 2 },
        energyAvailable: 300,
        energyCapacityAvailable: 300,
        find: (type) => type === FIND_HOSTILE_CREEPS ? [weakHostile] : []
    };
    securityService.analyze();
    assert.strictEqual(global.Security.W1N1.posture, 'defend', 'room should defend when current defender body can contest the threat');
    assert.ok(global.SpawnDemands.W1N1 && global.SpawnDemands.W1N1[0].role === 'defender', 'security service should express defender demand only when it can contest the threat');
    EventBus.topics = {};
    spawnBureau.analyze();
    assert.ok(EventBus.topics.REQ_SPAWN && EventBus.topics.REQ_SPAWN.some((event) => event.data.role === 'defender'), 'spawn bureau should publish defender requests from war demand');

    EventBus.topics = {};
    global.Security = {};
    global.SpawnDemands = {};
    const lightRangedHostile = {
        id: 'lightRangedHostile',
        owner: { username: 'Enemy' },
        getActiveBodyparts: (part) => part === RANGED_ATTACK ? 1 : 0
    };
    Game.creeps = {};
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true, level: 4 },
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        find: (type) => type === FIND_HOSTILE_CREEPS ? [lightRangedHostile] : []
    };
    securityService.analyze();
    assert.ok(global.SpawnDemands.W1N1 && global.SpawnDemands.W1N1[0].bodyProfile === 'ranged_defender', 'security service should request ranged defenders against ranged threats it can contest');

    const warHealer = {
        id: 'warHealer',
        pos: { x: 20, y: 20, roomName: 'W1N1' },
        getActiveBodyparts: (part) => part === HEAL ? 2 : 0
    };
    const warRanger = {
        id: 'warRanger',
        pos: { x: 22, y: 20, roomName: 'W1N1' },
        getActiveBodyparts: (part) => part === RANGED_ATTACK ? 3 : 0
    };
    const warSpawn = {
        id: 'spawn1',
        structureType: STRUCTURE_SPAWN,
        pos: { x: 15, y: 15, roomName: 'W1N1' }
    };
    const warRoom = {
        name: 'W1N1',
        controller: { my: true, level: 3 },
        energyCapacityAvailable: 550,
        find: (type) => {
            if (type === FIND_HOSTILE_CREEPS) return [warRanger, warHealer];
            if (type === FIND_MY_STRUCTURES) return [warSpawn];
            return [];
        }
    };
    Game.rooms.W1N1 = warRoom;
    Game.creeps = {
        DefenderA: {
            room: warRoom,
            memory: { role: 'defender', targetRoom: 'W1N1' },
            body: [
                { type: ATTACK }, { type: ATTACK }, { type: ATTACK }, { type: ATTACK }, { type: ATTACK },
                { type: ATTACK }, { type: ATTACK }, { type: ATTACK }, { type: ATTACK }, { type: ATTACK },
                { type: MOVE }, { type: MOVE }
            ]
        }
    };
    global.WarIntel = {};
    global.WarStrategy = {};
    global.CombatPlan = {};
    const warIntelService = new WarIntelService('WarIntel');
    warIntelService.analyze();
    assert.ok(global.WarIntel.W1N1.hostileStrength > 0, 'war intel should calculate hostile strength');
    assert.ok(global.WarIntel.W1N1.defenderStrength > 0, 'war intel should calculate defender strength');
    assert.ok(global.WarIntel.W1N1.dangerZones['20,20'], 'war intel should mark hostile positions as danger zones');
    assert.strictEqual(global.WarIntel.W1N1.primaryHostileId, 'warHealer', 'war intel should prioritize healer hostiles');

    const warStrategyService = new WarStrategyService('WarStrategy');
    warStrategyService.analyze();
    assert.strictEqual(global.WarStrategy.W1N1.posture, 'rally', 'war strategy should rally when defenders can contest but are below attack threshold');
    assert.strictEqual(global.WarStrategy.W1N1.primaryTargetId, 'warHealer', 'war strategy should carry forward the primary target');

    const combatPlannerService = new CombatPlannerService('CombatPlanner');
    combatPlannerService.analyze();
    assert.deepStrictEqual(global.CombatPlan.W1N1.rallyPoint, { x: 15, y: 15, roomName: 'W1N1' }, 'combat planner should use spawn as rally point');
    assert.strictEqual(global.CombatPlan.W1N1.primaryTargetId, 'warHealer', 'combat planner should plan focus fire on the primary target');
    assert.ok(global.CombatPlan.W1N1.avoidZones['20,20'], 'combat planner should expose danger zones for strategy services');

    global.WarIntel = {
        W1N1: {
            hostiles: [],
            hostileStrength: 0,
            defenderStrength: 0,
            towerStrength: 0,
            totalDefenseStrength: 0,
            dangerZones: {},
            safeRallyPoints: [],
            primaryHostileId: null
        }
    };
    global.WarStrategy = {};
    warStrategyService.analyze();
    assert.strictEqual(global.WarStrategy.W1N1.posture, 'recover', 'war strategy should recover when no hostiles are visible');

    global.Memory = {
        creeps: {
            CreepStillSpawning: { role: 'miner' },
            GoneCreep: { role: 'hauler' }
        },
        rooms: {},
        empire: {}
    };
    Game.spawns = {
        Spawn1: { spawning: { name: 'CreepStillSpawning' } }
    };
    Game.creeps = {};
    const spawnService = new SpawnService('Spawn');
    spawnService.cleanup();
    assert.ok(Memory.creeps.CreepStillSpawning, 'spawn cleanup should preserve memory for creeps that are still spawning');
    assert.ok(!Memory.creeps.GoneCreep, 'spawn cleanup should still remove dead creep memory');

    {
        const savedGame = { ...Game };
        const savedMemory = Memory;
        const populationRoom = {
            name: 'W1N1', energyAvailable: 550, energyCapacityAvailable: 550,
            controller: { my: true, level: 3 }, find: () => []
        };
        Game.time = 100;
        Game.rooms = { W1N1: populationRoom };
        Game.creeps = {};
        Game.spawns = {};
        global.Memory = {
            creeps: {
                GhostMiner: { role: 'miner', homeRoom: 'W1N1', sourceId: 'population-source' },
                GhostHauler: { role: 'hauler', homeRoom: 'W1N1' }
            }, rooms: {}, empire: { spawningCreeps: {} }
        };
        const populationBureau = new SpawnBureauService('SpawnBureau');
        assert.strictEqual(populationBureau.countRole('W1N1', 'miner'), 0, 'stale memory alone must not cover a core role');
        assert.strictEqual(populationBureau.countQuota('W1N1', 'miner:W1N1:population-source'), 0, 'stale memory alone must not cover a core quota');
        assert.strictEqual(populationBureau.countSourceWorkParts('W1N1', 'population-source'), 0, 'stale memory must not invent one WORK');
        assert.strictEqual(new RoomPhaseService('RoomPhase').buildPhase(populationRoom).phase, 'bootstrap', 'ghost roles must not hide bootstrap recovery');

        Memory.creeps = {};
        const populationSpawn = { name: 'PopulationSpawn', room: populationRoom, spawning: null, spawnCreep: () => OK };
        Game.spawns = { PopulationSpawn: populationSpawn };
        const populationSpawner = new SpawnService('Spawn');
        populationSpawner.init();
        populationSpawner.handleSpawnRequest({ data: {
            roomName: 'W1N1', name: 'PopulationMiner', role: 'miner', body: [WORK, WORK, WORK, WORK, WORK, MOVE],
            memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'population-source' }
        } });
        populationSpawner.run();
        populationSpawner.cleanup();
        assert.strictEqual(populationBureau.countSourceWorkParts('W1N1', 'population-source'), 5, 'source WORK must consume the actual accepted backup body');
        const populationRecord = Memory.empire.spawningCreeps.PopulationMiner;
        assert.strictEqual(populationRecord.acceptedAt, 100, 'successful spawn records must retain their acceptance tick');
        assert.strictEqual(populationRecord.spawnName, 'PopulationSpawn', 'successful spawn records must identify their producer');
        populationSpawn.spawning = { name: 'PopulationMiner' };
        Game.time++;
        assert.strictEqual(populationBureau.countSourceWorkParts('W1N1', 'population-source'), 5, 'a real spawning name should preserve accepted WORK across ticks');
        Game.creeps.PopulationMiner = { memory: Memory.creeps.PopulationMiner, body: populationRecord.body.map(type => ({ type, hits: 100 })), spawning: true };
        populationSpawner.cleanup();
        assert.strictEqual(populationBureau.countSourceWorkParts('W1N1', 'population-source'), 5, 'live spawning WORK must survive backup removal');
        Game.creeps.PopulationMiner.spawning = false;
        populationSpawn.spawning = null;
        Game.creeps.PopulationMiner.ticksToLive = 69;
        assert.strictEqual(populationBureau.countSourceWorkParts('W1N1', 'population-source'), 5, 'WORK above the TTL replacement boundary should remain available');
        Game.creeps.PopulationMiner.ticksToLive = 68;
        assert.strictEqual(populationBureau.countSourceWorkParts('W1N1', 'population-source'), 0, 'WORK at the TTL replacement boundary should require replacement');
        Game.creeps.PopulationMiner.ticksToLive = 1000;
        Game.creeps.PopulationMiner.body.forEach(part => { if (part.type === WORK) part.hits = 0; });
        assert.strictEqual(populationBureau.countSourceWorkParts('W1N1', 'population-source'), 0, 'destroyed WORK must not be counted');
        assert.strictEqual(populationBureau.countRole('W1N1', 'miner'), 0, 'an incapacitated miner must not block an affordable recovery body');
        Game.creeps = {};
        Memory.empire.spawningCreeps.PopulationMiner = populationRecord;
        assert.strictEqual(populationBureau.countSourceWorkParts('W1N1', 'population-source'), 0, 'a cancelled spawn must not remain covered by its old successful record');
        Game.spawns = {};
        assert.strictEqual(populationBureau.countQuota('W1N1', 'miner:W1N1:population-source'), 0, 'a destroyed spawn cannot retain a pending quota');
        Memory.empire.spawningCreeps.OldUnbounded = { memory: { role: 'miner', homeRoom: 'W1N1' } };
        populationSpawner.init();
        const legacyExpiry = Memory.empire.spawningCreeps.OldUnbounded.expireAt;
        assert.strictEqual(legacyExpiry, Game.time + 150, 'legacy identity backups should receive one finite retention window');
        Game.time += 10;
        populationSpawner.init();
        assert.strictEqual(Memory.empire.spawningCreeps.OldUnbounded.expireAt, legacyExpiry, 'legacy backup reads must not renew their expiry');
        Memory.creeps.LiveWithoutRole = { role: 'hauler', homeRoom: 'W1N1' };
        Game.creeps.LiveWithoutRole = { memory: {}, body: [{ type: CARRY, hits: 100 }], ticksToLive: 1000 };
        new SpawnService('SpawnAfterReset').init();
        assert.strictEqual(Game.creeps.LiveWithoutRole.memory.role, 'hauler', 'a reset should restore identity from same-name live memory metadata');
        Game.creeps.SurplusHauler = { memory: { role: 'hauler', homeRoom: 'W1N1', retire: true }, body: [{ type: CARRY, hits: 100 }], ticksToLive: 1000 };
        assert.strictEqual(new CreepRetirementService('Retirement').roleCountsByRoom().W1N1.hauler, 2, 'an idle retirement marker must not pretend an unloading live actor has already died');
        const { collectCreepPopulation, activeBodyPartCount } = await import('../core/CreepPopulation.js');
        assert.strictEqual(activeBodyPartCount([WORK, { type: WORK, hits: 0 }, { type: WORK, hits: 100 }, null], WORK), 2, 'mixed bodies count only valid active parts');
        const unknown = collectCreepPopulation({ creeps: {}, spawns: { Unknown: { spawning: { name: 'UnknownBody' } } }, creepMemory: { UnknownBody: { role: 'miner', homeRoom: 'W1N1' } }, tick: Game.time })[0];
        assert.strictEqual(unknown.bodyKnown, false, 'physical spawning with no body must remain unknown');
        assert.strictEqual(unknown.activeParts.work, undefined, 'unknown bodies must not invent a WORK part');
        assert.strictEqual(unknown.coversQuota, true, 'physical spawning with unknown body still protects its occupied quota');
        Object.assign(Game, savedGame);
        global.Memory = savedMemory;
    }

    global.Memory = {
        creeps: {},
        rooms: {},
        empire: {}
    };
    {
        const savedGame = { ...Game };
        const savedMemory = Memory;
        const savedTopics = EventBus.topics;
        const savedSubscribers = EventBus.subscribers;
        EventBus.topics = {};
        EventBus.clearSubscribers();
        const intakeRoom = { name: 'W1N1', energyAvailable: 300 };
        global.ERR_NAME_EXISTS = -3;
        Game.time = 1000;
        Game.rooms = { W1N1: intakeRoom };
        Game.creeps = {};
        global.Memory = { creeps: {}, empire: { spawningCreeps: {} } };
        const attempts = [];
        const makeIntakeSpawn = name => ({ name, room: intakeRoom, spawning: null, spawnCreep: (body, creepName) => { attempts.push(creepName); return OK; } });
        Game.spawns = { Intake1: makeIntakeSpawn('Intake1'), Intake2: makeIntakeSpawn('Intake2') };
        const intake = new SpawnService('Spawn');
        const publishIntake = (quotaKey, extra = {}) => EventBus.publish('REQ_SPAWN', 45, {
            roomName: 'W1N1', role: 'hauler', body: [CARRY, CARRY, CARRY, MOVE],
            memory: { role: 'hauler', homeRoom: 'W1N1', quotaKey }, ...extra
        }, 3);
        intake.init();
        publishIntake('hauler:W1N1:first');
        publishIntake('hauler:W1N1:second');
        EventBus.dispatch();
        assert.strictEqual(intake.pendingTasks.length, 1, 'two spawns must not overbook the same 300 room energy with two 200-cost bodies');
        intake.run();
        assert.strictEqual(attempts.length, 1, 'only the affordable accepted request should execute');

        EventBus.topics = {};
        Game.time++;
        intakeRoom.energyAvailable = 500;
        intake.init();
        publishIntake('hauler:W1N1:first');
        publishIntake('hauler:W1N1:second');
        EventBus.dispatch();
        assert.strictEqual(intake.pendingTasks.length, 2, 'different affordable quotas should use both idle spawns');
        assert.strictEqual(new Set(intake.pendingTasks.map(task => task.name)).size, 2, 'automatic names must be unique across simultaneous spawns');

        EventBus.topics = {};
        intake.init();
        publishIntake('hauler:W1N1:core', { requestId: 'replay-me' });
        publishIntake('hauler:W1N1:core', { requestId: 'replay-me' });
        EventBus.dispatch();
        assert.strictEqual(intake.pendingTasks.length, 1, 'the same request and economic quota must not be queued twice');
        assert.strictEqual(intake.idleSpawns.W1N1.length, 1, 'a duplicate request must not consume another idle spawn');
        EventBus.topics = {};
        intake.init();
        publishIntake('hauler:W1N1:a', { name: 'ExplicitName' });
        publishIntake('hauler:W1N1:b', { name: 'ExplicitName' });
        EventBus.dispatch();
        assert.strictEqual(intake.pendingTasks.length, 1, 'an explicit name conflict must not create a second renamed actor');
        assert.strictEqual(intake.pendingTasks[0].name, 'ExplicitName', 'explicit caller names should be preserved');

        EventBus.topics = {};
        intake.init();
        publishIntake('hauler:W1N1:bad', { body: [null] });
        EventBus.dispatch();
        assert.strictEqual(intake.pendingTasks.length, 0, 'invalid bodies must not consume room energy or a spawn');
        EventBus.topics = {};
        Game.spawns.Intake2.spawnCreep = () => ERR_NOT_ENOUGH_RESOURCES;
        intake.init();
        publishIntake('hauler:W1N1:retry', { name: 'RetryHauler', requestId: 'retry-once' });
        EventBus.dispatch();
        const requestExpiry = Game.time + 3;
        const savedLog = console.log;
        try { console.log = () => {}; intake.run(); } finally { console.log = savedLog; }
        assert.strictEqual(Memory.empire.spawningCreeps.RetryHauler, undefined, 'failed run must not create a successful spawn backup');
        assert.strictEqual(EventBus.topics.REQ_SPAWN.length, 1, 'a valid failed request should remain available for a later tick');
        assert.strictEqual(EventBus.topics.REQ_SPAWN[0].expireAt, requestExpiry, 'retry must preserve the original deadline');
        Game.time++;
        Game.spawns.Intake2.spawnCreep = (body, name) => { attempts.push(name); return OK; };
        intake.init();
        EventBus.beginTick();
        EventBus.dispatch();
        intake.run();
        assert.strictEqual(Memory.empire.spawningCreeps.RetryHauler.acceptedAt, Game.time, 'a later successful retry should record its actual acceptance tick');
        EventBus.topics = {};
        intake.init();
        publishIntake('hauler:W1N1:retry', { name: 'RetryHauler', requestId: 'retry-once' });
        EventBus.dispatch();
        assert.strictEqual(intake.pendingTasks.length, 0, 'a successful request receipt should reject a cross-tick replay within its deadline');
        new SpawnService('SpawnReset').init();
        const resetIntake = new SpawnService('SpawnResetCheck');
        resetIntake.init();
        assert.strictEqual(resetIntake.handleSpawnRequest({ id: 'different-event', data: { roomName: 'W1N1', role: 'hauler', requestId: 'retry-once', body: [CARRY, MOVE], memory: { role: 'hauler' } } }), true, 'successful backup receipts should protect request identity after a global reset');
        assert.strictEqual(resetIntake.pendingTasks.length, 0, 'reset request protection must not consume a spawn');
        const successfulRetry = Memory.empire.spawningCreeps.RetryHauler;
        Game.creeps.RetryHauler = { memory: Memory.creeps.RetryHauler, spawning: true, body: successfulRetry.body.map(type => ({ type, hits: 100 })) };
        intake.cleanup();
        assert.strictEqual(Memory.empire.spawningCreeps.RetryHauler, undefined, 'successful live identity should still clean its body backup');
        const resetAfterCleanup = new SpawnService('SpawnResetAfterCleanup');
        resetAfterCleanup.init();
        resetAfterCleanup.handleSpawnRequest({ id: 'replay-after-cleanup', data: { roomName: 'W1N1', role: 'hauler', requestId: 'retry-once', body: [CARRY, MOVE], memory: { role: 'hauler', homeRoom: 'W1N1' } } });
        assert.strictEqual(resetAfterCleanup.pendingTasks.length, 0, 'request receipts must survive global reset after the body backup was removed');
        Object.assign(Game, savedGame);
        global.Memory = savedMemory;
        EventBus.topics = savedTopics;
        EventBus.subscribers = savedSubscribers;
    }

    {
        const savedGame = { ...Game };
        const savedMemory = Memory;
        const savedPhase = global.RoomPhase;
        const savedCache = global.RoomCache;
        const savedMarketService = global.ResourceMarketService;
        const recoverySites = [
            { id: 'optional-extension', structureType: STRUCTURE_EXTENSION, progress: 0, progressTotal: 100, pos: new RoomPosition(20, 20, 'W1N1') },
            { id: 'core-spawn-site', structureType: STRUCTURE_SPAWN, progress: 0, progressTotal: 100, pos: new RoomPosition(21, 20, 'W1N1') }
        ];
        let reserveEnergy = 4999;
        const recoveryRoom = {
            name: 'W1N1', controller: { id: 'recovery-controller', my: true, ticksToDowngrade: 12000, pos: new RoomPosition(25, 25, 'W1N1') },
            energyAvailable: 300, energyCapacityAvailable: 550,
            storage: { id: 'recovery-storage', store: { getUsedCapacity: () => reserveEnergy } },
            find: type => type === FIND_CONSTRUCTION_SITES ? recoverySites : []
        };
        Game.time = 2000;
        Game.rooms = { W1N1: recoveryRoom };
        Game.spawns = { RecoverySpawn: { name: 'RecoverySpawn', room: recoveryRoom, spawning: null } };
        global.Memory = { creeps: {}, rooms: {}, empire: {} };
        global.RoomCache = { W1N1: { sources: [], constructionSites: recoverySites.map(site => site.id) } };
        Game.creeps = {
            RecoveryMiner: { memory: { role: 'miner', homeRoom: 'W1N1' }, body: [{ type: WORK, hits: 100 }], ticksToLive: 1000 },
            RecoveryHauler: { memory: { role: 'hauler', homeRoom: 'W1N1' }, body: [{ type: CARRY, hits: 100 }], ticksToLive: 1000 }
        };
        Game.getObjectById = id => recoverySites.find(site => site.id === id) || (id === recoveryRoom.controller.id ? recoveryRoom.controller : null);
        const recoveryPhase = new RoomPhaseService('RoomPhase');
        recoveryPhase.analyze();
        assert.ok(global.RoomPhase.W1N1.recovery, 'RoomPhase must expose the approved recovery contract');
        assert.strictEqual(global.RoomPhase.W1N1.recovery.mode, 'reserve_low', 'a room below the approved reserve floor should expose recovery explicitly');
        reserveEnergy = 5000;
        recoveryPhase.analyze();
        assert.strictEqual(global.RoomPhase.W1N1.recovery.mode, 'normal', 'the reserve boundary should release the low-reserve restriction');
        delete Game.creeps.RecoveryHauler;
        recoveryPhase.analyze();
        assert.strictEqual(global.RoomPhase.W1N1.recovery.mode, 'hauler_gap', 'missing transport should become the primary recoverable role gap');
        EventBus.topics = {};
        new SpawnBureauService('SpawnBureau').analyze();
        const emergencyHaul = (EventBus.topics.REQ_SPAWN || []).find(event => event.data.role === 'hauler');
        assert.ok(emergencyHaul && emergencyHaul.data.body.reduce((cost, part) => cost + BODYPART_COST[part], 0) <= 300, 'missing hauler recovery must use a currently affordable body');
        assert.strictEqual((EventBus.topics.REQ_SPAWN || []).some(event => event.data.role === 'upgrader'), false, 'role recovery must pause ordinary upgrader spawning');
        assert.ok(global.SpawnBureau.W1N1.intents.filter(intent => intent.role === 'builder').every(intent => intent.reason === 'core_construction_recovery'), 'recovery builder intents must be limited to essential construction');

        const worker = {
            name: 'RecoveryBuilder', room: recoveryRoom, memory: { role: 'builder', homeRoom: 'W1N1' },
            pos: new RoomPosition(20, 19, 'W1N1'), store: { getUsedCapacity: () => 50, getFreeCapacity: () => 50 }
        };
        Game.creeps.RecoveryBuilder = worker;
        const recoveryBuilder = new BuilderStrategyService('BuilderStrategy');
        recoveryBuilder.assignBuilderTask(worker);
        assert.strictEqual(worker.memory.task.targetId, 'core-spawn-site', 'recovery workers should preserve core construction while skipping optional sites');
        worker.memory.task = { type: 'BUILD', targetId: 'optional-extension' };
        new TaskGuardService('TaskGuard').analyze();
        assert.strictEqual(worker.memory.task, null, 'pre-existing optional construction must respect the same recovery restriction');
        recoverySites.splice(1, 1);
        global.RoomCache.W1N1.constructionSites = ['optional-extension'];
        recoveryBuilder.assignBuilderTask(worker);
        assert.strictEqual(worker.memory.task, null, 'a funded builder must wait rather than consume energy on an optional recovery-period site');
        assert.strictEqual(worker.memory.builderState.state, 'waiting_recovery', 'paused construction must carry an explicit recovery reason');
        const spendingMarket = new ResourceMarketService('RecoveryResourceMarket');
        assert.strictEqual(spendingMarket.requestResource(worker, { resourceType: RESOURCE_ENERGY, purpose: 'build' }).reason, 'recovery_limited', 'the central resource API must reject the same optional recovery spending');
        Memory.empire.control.policy.economyRecovery.enabled = false;
        recoveryBuilder.assignBuilderTask(worker);
        assert.strictEqual(worker.memory.task.targetId, 'optional-extension', 'manual recovery disable should preserve normal worker behavior');
        Memory.empire.control.policy.economyRecovery.enabled = true;
        worker.memory.task = null;
        const urgentStructure = { id: 'urgent-repair', hits: 10, hitsMax: 100, pos: new RoomPosition(22, 20, 'W1N1') };
        const routineStructure = { id: 'routine-repair', hits: 10, hitsMax: 100, pos: new RoomPosition(23, 20, 'W1N1') };
        Memory.rooms.W1N1.maintenancePlan = { targets: [
            { id: routineStructure.id, executor: 'repairer', urgency: 'routine', targetHits: 100 },
            { id: urgentStructure.id, executor: 'repairer', urgency: 'urgent', targetHits: 100 }
        ] };
        const recoveryObjects = { [urgentStructure.id]: urgentStructure, [routineStructure.id]: routineStructure, [recoveryRoom.controller.id]: recoveryRoom.controller, 'optional-extension': recoverySites[0] };
        Game.getObjectById = id => recoveryObjects[id] || null;
        worker.memory.role = 'repairer';
        new RepairerStrategyService('RecoveryRepairer').assignRepairerTask(worker);
        assert.strictEqual(worker.memory.task.targetId, 'urgent-repair', 'urgent repair must remain available while routine repair is restricted');
        worker.memory.task = { type: 'REPAIR', targetId: 'routine-repair' };
        new TaskGuardService('TaskGuard').analyze();
        assert.strictEqual(worker.memory.task, null, 'existing routine repair must obey the same recovery boundary');
        delete Game.creeps.RecoveryBuilder;
        Game.creeps.RecoveryHauler = { room: recoveryRoom, memory: { role: 'hauler', homeRoom: 'W1N1' }, body: [{ type: CARRY, hits: 100 }], ticksToLive: 1000 };
        reserveEnergy = 4999;
        recoveryPhase.analyze();
        EventBus.topics = {};
        new SpawnBureauService('UrgentRecoveryBureau').analyze();
        const urgentRepairRequest = (EventBus.topics.REQ_SPAWN || []).find(event => event.data.role === 'repairer');
        assert.ok(urgentRepairRequest, 'urgent repair must retain a replacement route when ordinary upgrader spawning is paused');
        assert.ok(urgentRepairRequest.data.body.reduce((sum, part) => sum + BODYPART_COST[part], 0) <= recoveryRoom.energyAvailable, 'urgent recovery repair must use currently affordable body parts');
        const requiredSpawnSite = { id: 'required-spawn-site', structureType: STRUCTURE_SPAWN, progress: 0, progressTotal: 100, pos: new RoomPosition(21, 20, 'W1N1') };
        recoverySites.push(requiredSpawnSite);
        recoveryObjects[requiredSpawnSite.id] = requiredSpawnSite;
        global.RoomCache.W1N1.constructionSites = recoverySites.map(site => site.id);
        EventBus.topics = {};
        new SpawnBureauService('ConstructionRecoveryBureau').analyze();
        const essentialBuilderRequest = (EventBus.topics.REQ_SPAWN || []).find(event => event.data.role === 'builder');
        assert.ok(essentialBuilderRequest, 'essential construction must retain minimum builder replacement during recovery');
        assert.ok(essentialBuilderRequest.data.body.reduce((sum, part) => sum + BODYPART_COST[part], 0) <= recoveryRoom.energyAvailable, 'essential recovery construction must use currently affordable body parts');
        assert.deepStrictEqual(BodyBuilder.build('hauler', recoveryRoom, { energyCapacity: 0, bodyProfile: 'emergency_hauler' }).body, [], 'an explicit zero energy budget must not fall back to full room capacity');
        delete Game.creeps.RecoveryMiner;
        recoveryRoom.energyAvailable = 0;
        Game.creeps.RecoveryHauler.store = { getUsedCapacity: () => 150 };
        reserveEnergy = 0;
        recoveryPhase.analyze();
        assert.strictEqual(global.RoomPhase.W1N1.recovery.mode, 'miner_gap', 'real carried hauler energy must prevent a false external-support diagnosis');
        Game.creeps.RecoveryHauler.store = { getUsedCapacity: () => 0 };
        recoveryPhase.analyze();
        assert.strictEqual(global.RoomPhase.W1N1.recovery.mode, 'miner_gap', 'an active spawn can recover its basic energy deficit through engine regeneration');
        assert.ok(global.RoomPhase.W1N1.recovery.reasons.includes('awaiting_spawn_regeneration'), 'engine recovery waiting must be distinguished from unavailable external support');
        const restoredStorage = recoveryRoom.storage;
        recoveryRoom.storage = null;
        Game.creeps.RecoveryMiner = { memory: { role: 'miner', homeRoom: 'W1N1' }, body: [{ type: WORK, hits: 100 }], ticksToLive: 1000 };
        recoveryRoom.energyAvailable = 50;
        recoveryPhase.analyze();
        assert.strictEqual(global.RoomPhase.W1N1.recovery.mode, 'spawn_energy', 'early rooms without storage must still protect an empty spawn energy buffer');
        recoveryRoom.energyAvailable = 300;
        recoveryPhase.analyze();
        assert.strictEqual(global.RoomPhase.W1N1.recovery.mode, 'spawn_energy', 'spawn recovery must retain the existing exit-ratio hysteresis');
        recoveryRoom.energyAvailable = 500;
        recoveryPhase.analyze();
        assert.strictEqual(global.RoomPhase.W1N1.recovery.mode, 'normal', 'spawn recovery should release when its exit-ratio boundary is satisfied');
        recoveryRoom.storage = restoredStorage;
        recoveryRoom.energyAvailable = 300;
        recoveryPhase.analyze();
        Game.creeps.RecoveryBuilder = worker;
        worker.memory.role = 'upgrader';
        let energyRequests = 0;
        global.ResourceMarketService = { requestResource: () => { energyRequests++; return { mode: 'unavailable' }; } };
        new UpgraderStrategyService('Upgrader').assignUpgraderTask(worker);
        assert.strictEqual(worker.memory.task, null, 'ordinary upgrade spending must pause during core recovery');
        recoveryRoom.controller.ticksToDowngrade = 4999;
        new UpgraderStrategyService('Upgrader').assignUpgraderTask(worker);
        assert.strictEqual(worker.memory.task.type, 'UPGRADE', 'Controller emergency must override ordinary recovery spending limits');
        assert.strictEqual(energyRequests, 0, 'a fueled emergency worker should not publish unnecessary energy requests');
        recoveryRoom.controller.ticksToDowngrade = 12000;
        delete Game.spawns.RecoverySpawn;
        recoveryPhase.analyze();
        assert.strictEqual(global.RoomPhase.W1N1.recovery.mode, 'support_required', 'a room with no spawn must report its external support dependency');
        Object.assign(Game, savedGame);
        global.Memory = savedMemory;
        global.RoomPhase = savedPhase;
        global.RoomCache = savedCache;
        global.ResourceMarketService = savedMarketService;
    }

    const memorySpawn = {
        spawning: null,
        spawnCreep: () => OK
    };
    const memorySpawnService = new SpawnService('Spawn');
    memorySpawnService.pendingTasks = [{
        spawn: memorySpawn,
        name: 'MinerWithMemory',
        data: {
            body: [WORK, MOVE],
            memory: {
                role: 'miner',
                homeRoom: 'W1N1',
                sourceId: 'source1'
            }
        }
    }];
    Game.spawns = { Spawn1: memorySpawn };
    Game.creeps = {};
    memorySpawnService.run();
    memorySpawnService.cleanup();
    assert.deepStrictEqual(Memory.creeps.MinerWithMemory, {
        role: 'miner',
        homeRoom: 'W1N1',
        sourceId: 'source1'
    }, 'spawn service should persist memory for creeps accepted by spawnCreep');

    global.Game.time = 20;
    global.Memory = {
        creeps: {
            MinerPending: {
                role: 'miner',
                homeRoom: 'W1N1',
                sourceId: 'source1'
            }
        },
        rooms: {},
        empire: {
            spawningCreeps: {
                MinerPending: {
                    memory: {
                        role: 'miner',
                        homeRoom: 'W1N1',
                        sourceId: 'source1'
                    },
                    expireAt: 50
                }
            }
        }
    };
    Game.creeps = {};
    Game.spawns = { Spawn1: { spawning: null } };
    const pendingSpawnService = new SpawnService('Spawn');
    pendingSpawnService.cleanup();
    assert.deepStrictEqual(Memory.creeps.MinerPending, {
        role: 'miner',
        homeRoom: 'W1N1',
        sourceId: 'source1'
    }, 'spawn cleanup should preserve pending spawn memory even when spawn.spawning is temporarily unavailable');

    global.Memory = {
        creeps: {},
        rooms: {},
        empire: {
            spawningCreeps: {
                MinerRecovered: {
                    role: 'miner',
                    homeRoom: 'W1N1',
                    sourceId: 'source1'
                }
            }
        }
    };
    const recoveredCreep = { memory: {} };
    Game.creeps = { MinerRecovered: recoveredCreep };
    Game.spawns = {};
    const recoverySpawnService = new SpawnService('Spawn');
    recoverySpawnService.init();
    assert.deepStrictEqual(recoveredCreep.memory, {
        role: 'miner',
        homeRoom: 'W1N1',
        sourceId: 'source1'
    }, 'spawn service should restore missing creep memory before strategies analyze');

    global.Memory = {
        rooms: {
            W1N1: {
                serviceFlags: { planning: true }
            }
        },
        empire: {}
    };
    global.CONTROLLER_STRUCTURES = {
        [STRUCTURE_EXTENSION]: { 4: 20, 6: 40, 8: 60 },
        [STRUCTURE_LINK]: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 2, 6: 3, 7: 4, 8: 6 },
        [STRUCTURE_TOWER]: { 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 6 },
        [STRUCTURE_STORAGE]: { 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 },
        [STRUCTURE_TERMINAL]: { 6: 1, 7: 1, 8: 1 },
        [STRUCTURE_LAB]: { 6: 3, 7: 6, 8: 10 },
        [STRUCTURE_FACTORY]: { 7: 1, 8: 1 },
        [STRUCTURE_OBSERVER]: { 8: 1 },
        [STRUCTURE_POWER_SPAWN]: { 8: 1 },
        [STRUCTURE_NUKER]: { 8: 1 },
        [STRUCTURE_EXTRACTOR]: { 6: 1, 7: 1, 8: 1 }
    };
    const cityPlanner = new CityPlannerService('CityPlanner');
    const defensePlanner = new DefensePlannerService('DefensePlanner');
    const sourceForPlan = { id: 'source1', pos: { x: 10, y: 10, roomName: 'W1N1' } };
    const mineralForPlan = { id: 'mineral1', pos: { x: 22, y: 22, roomName: 'W1N1' } };
    const controllerForPlan = { id: 'controller1', my: true, level: 4, pos: { x: 25, y: 25, roomName: 'W1N1' } };
    const spawnForPlan = { id: 'spawn1', pos: { x: 15, y: 15, roomName: 'W1N1' }, structureType: STRUCTURE_SPAWN };
    Game.map = {
        getRoomTerrain: () => ({
            get: () => 0
        })
    };
    const cityRoom = {
        name: 'W1N1',
        controller: controllerForPlan,
        storage: { pos: { x: 20, y: 20, roomName: 'W1N1' } },
        find: (type) => {
            if (type === FIND_MY_SPAWNS) return [spawnForPlan];
            if (type === FIND_SOURCES) return [sourceForPlan];
            if (type === FIND_MINERALS) return [mineralForPlan];
            if (type === FIND_STRUCTURES) return [spawnForPlan];
            if (type === FIND_CONSTRUCTION_SITES) return [];
            return [];
        }
    };
    const firstCenter = MemoryConfig.baseCenter(cityRoom);
    assert.deepStrictEqual(Memory.rooms.W1N1.baseCenter, { x: 15, y: 15, roomName: 'W1N1' }, 'base center should be persisted from the initial spawn');
    assert.strictEqual(firstCenter.x, 15, 'base center should not drift to storage after it is persisted');

    const cityPlan = cityPlanner.buildCityPlan(cityRoom, firstCenter);
    assert.strictEqual(cityPlan.version, 1, 'city plan should keep its internal planner version');
    assert.strictEqual(cityPlan.schemaVersion, 4, 'city plan should publish schema version 4 for staged city planning');
    assert.strictEqual(CITY_PLAN_SCHEMA_VERSION, 4, 'city plan schema should publish the current supported schema version');
    assert.strictEqual(cityPlan.sources.source1.containerPos, undefined, 'city plan should stop publishing legacy source container compatibility storage');
    assert.strictEqual(cityPlan.controller.containerPos, undefined, 'city plan should stop publishing legacy controller container compatibility storage');
    assert.deepStrictEqual(cityPlan.sourceRuntime.sources.source1, {
        preferredOutputRole: 'source_container',
        deliveryMode: 'container'
    }, 'city plan should publish canonical source runtime storage for source logistics intent');
    assert.strictEqual(cityPlan.sources.source1.preferredOutputRole, undefined, 'city plan should stop publishing legacy source runtime output-role compatibility fields');
    assert.strictEqual(cityPlan.sources.source1.deliveryMode, undefined, 'city plan should stop publishing legacy source runtime delivery-mode compatibility fields');
    assert.deepStrictEqual(cityPlan.workPositions.sources.source1.mining.primary, { x: 9, y: 10, roomName: 'W1N1' }, 'city plan should publish canonical source mining work positions');
    assert.deepStrictEqual(cityPlan.workPositions.controller.upgrade.primary, { x: 24, y: 25, roomName: 'W1N1' }, 'city plan should publish canonical controller upgrade work positions');
    assert.strictEqual(cityPlan.sources.source1.primaryMiningPos, undefined, 'city plan should stop publishing legacy source mining-position compatibility fields');
    assert.strictEqual(cityPlan.controller.primaryUpgradePos, undefined, 'city plan should stop publishing legacy controller upgrade-position compatibility fields');
    assert.ok(cityPlan.roadAnchors.length >= 2, 'city plan should expose road anchors for source and controller zones');
    assert.ok(cityPlan.hub && cityPlan.hub.center, 'city plan should publish a hub section for mid and late game planning');
    assert.ok(cityPlan.phaseGoals && Array.isArray(cityPlan.phaseGoals.bootstrap), 'city plan should publish phase goals for staged consumers');
    assert.ok(cityPlan.assetGroups && Array.isArray(cityPlan.assetGroups.logistics), 'city plan should publish grouped asset ids');
    assert.ok(Array.isArray(cityPlan.plannedStructures) && cityPlan.plannedStructures.length > 0, 'city plan should expose planned structures for staged planning consumers');
    assert.ok(cityPlan.plannedStructures.some((entry) => entry.role === 'source_container' && entry.structureType === STRUCTURE_CONTAINER), 'city plan should publish planned source containers in the compatibility model');
    assert.ok(cityPlan.plannedStructures.some((entry) => entry.role === 'controller_container' && entry.structureType === STRUCTURE_CONTAINER), 'city plan should publish planned controller containers in the compatibility model');
    assert.ok(cityPlan.plannedStructures.some((entry) => entry.role === 'core_road' && entry.structureType === STRUCTURE_ROAD), 'city plan should publish planned core roads in the compatibility model');
    assert.ok(!cityPlan.plannedStructures.some((entry) => entry.role === 'source_link'), 'pre-RCL5 plans should not publish source links yet');
    const migratedLegacyPlan = migrateCityPlanToCurrent({
        schemaVersion: 2,
        sources: {
            source1: {
                primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' },
                containerPos: { x: 9, y: 10, roomName: 'W1N1' },
                linkPos: { x: 10, y: 11, roomName: 'W1N1' }
            }
        },
        controller: {
            primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' },
            containerPos: { x: 24, y: 25, roomName: 'W1N1' },
            linkPos: { x: 24, y: 24, roomName: 'W1N1' }
        }
    });
    assert.strictEqual(migratedLegacyPlan.changed, true, 'city plan migration should report changes when migrating a v2 compatibility plan');
    assert.strictEqual(migratedLegacyPlan.fromVersion, 2, 'city plan migration should report the source schema version');
    assert.strictEqual(migratedLegacyPlan.toVersion, 4, 'city plan migration should report the target schema version');
    assert.strictEqual(migratedLegacyPlan.cityPlan.schemaVersion, 4, 'city plan migration should upgrade legacy plans to schema version 4');
    assert.strictEqual(migratedLegacyPlan.changes.plannedStructuresAdded, 4, 'city plan migration should count regenerated planned structures for v3 observability');
    assert.strictEqual(migratedLegacyPlan.changes.workPositionsAdded, 2, 'city plan migration should count regenerated work positions for v3 observability');
    assert.strictEqual(migratedLegacyPlan.changes.runtimeDefaultsAdded, 2, 'city plan migration should count canonical source runtime defaults backfilled for v3 observability');
    assert.strictEqual(migratedLegacyPlan.changes.sourceRuntimeEntriesAdded, 1, 'city plan migration should count canonical source runtime entries generated during source runtime backfill');
    assert.strictEqual(migratedLegacyPlan.changes.legacyStoragePreserved, true, 'city plan migration should report that legacy compatibility storage remains preserved in v3.0');
    assert.deepStrictEqual(migratedLegacyPlan.cityPlan.workPositions.sources.source1.mining.primary, { x: 9, y: 10, roomName: 'W1N1' }, 'city plan migration should regenerate source work positions from legacy source mining coordinates');
    assert.deepStrictEqual(migratedLegacyPlan.cityPlan.workPositions.controller.upgrade.primary, { x: 24, y: 25, roomName: 'W1N1' }, 'city plan migration should regenerate controller work positions from legacy upgrade coordinates');
    assert.ok(migratedLegacyPlan.cityPlan.plannedStructures.some((entry) => entry.id === 'source1:container' && entry.role === 'source_container'), 'city plan migration should regenerate source container planned assets from legacy coordinates');
    assert.ok(migratedLegacyPlan.cityPlan.plannedStructures.some((entry) => entry.id === 'source1:link' && entry.role === 'source_link'), 'city plan migration should regenerate source link planned assets from legacy coordinates');
    assert.ok(migratedLegacyPlan.cityPlan.plannedStructures.some((entry) => entry.id === 'controller:container' && entry.role === 'controller_container'), 'city plan migration should regenerate controller container planned assets from legacy coordinates');
    assert.ok(migratedLegacyPlan.cityPlan.plannedStructures.some((entry) => entry.id === 'controller:link' && entry.role === 'controller_link'), 'city plan migration should regenerate controller link planned assets from legacy coordinates');
    assert.strictEqual(migratedLegacyPlan.assetImportReadiness.canonicalCompleteBeforeImport, false, 'city plan migration should report incomplete canonical planned assets before importing legacy asset coordinates');
    assert.strictEqual(migratedLegacyPlan.assetImportReadiness.legacyAssetImportUsed, true, 'city plan migration should report when legacy asset coordinates regenerated canonical planned assets');
    assert.strictEqual(migratedLegacyPlan.assetImportReadiness.readyForAssetImportRemoval, false, 'city plan migration should keep asset import removal disabled while regeneration still occurs');
    assert.deepStrictEqual(migratedLegacyPlan.assetImportReadiness.missingCanonicalAssetRoles.sort(), ['controller_container', 'controller_link', 'source_container', 'source_link'], 'city plan migration should report which canonical asset roles were missing before legacy import');
    assert.deepStrictEqual(migratedLegacyPlan.assetImportReadiness.regeneratedAssetRoles.sort(), ['controller_container', 'controller_link', 'source_container', 'source_link'], 'city plan migration should report which canonical asset roles were regenerated from legacy coordinates');
    assert.deepStrictEqual(migratedLegacyPlan.cityPlan.sources.source1.containerPos, { x: 9, y: 10, roomName: 'W1N1' }, 'city plan migration should preserve legacy source compatibility storage in v3.0');
    assert.deepStrictEqual(migratedLegacyPlan.cityPlan.controller.containerPos, { x: 24, y: 25, roomName: 'W1N1' }, 'city plan migration should preserve legacy controller compatibility storage in v3.0');
    assert.deepStrictEqual(migratedLegacyPlan.cityPlan.sourceRuntime.sources.source1, {
        preferredOutputRole: 'source_container',
        deliveryMode: 'container'
    }, 'city plan migration should generate default canonical source runtime storage when legacy source runtime fields are no longer imported');
    const migratedDefaultsPlan = migrateCityPlanToCurrent({
        schemaVersion: 2,
        sources: {
            source2: {
                containerPos: { x: 8, y: 8, roomName: 'W1N1' }
            }
        }
    });
    assert.strictEqual(migratedDefaultsPlan.cityPlan.sources.source2.preferredOutputRole, undefined, 'city plan migration should not backfill missing source runtime output-role defaults into legacy source compatibility storage');
    assert.strictEqual(migratedDefaultsPlan.cityPlan.sources.source2.deliveryMode, undefined, 'city plan migration should not backfill missing source runtime delivery-mode defaults into legacy source compatibility storage');
    assert.strictEqual(migratedDefaultsPlan.changes.runtimeDefaultsAdded, 2, 'city plan migration should report canonical source runtime defaults that were added');
    assert.deepStrictEqual(migratedDefaultsPlan.cityPlan.sourceRuntime.sources.source2, {
        preferredOutputRole: 'source_container',
        deliveryMode: 'container'
    }, 'city plan migration should materialize defaulted source runtime values only in canonical source runtime storage');
    const preservedCanonicalPlan = migrateCityPlan({
        schemaVersion: 2,
        sources: {
            source1: {
                primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' }
            }
        },
        workPositions: {
            sources: {
                source1: {
                    mining: {
                        primary: { x: 7, y: 7, roomName: 'W1N1' }
                    }
                }
            }
        },
        plannedStructures: [{
            id: 'source1:container',
            role: 'source_container',
            structureType: STRUCTURE_CONTAINER,
            pos: { x: 7, y: 7, roomName: 'W1N1' },
            scope: { sourceId: 'source1' },
            lifecycle: { state: 'active', activeFromRcl: 1 }
        }]
    });
    assert.deepStrictEqual(preservedCanonicalPlan.cityPlan.workPositions.sources.source1.mining.primary, { x: 7, y: 7, roomName: 'W1N1' }, 'city plan migration should preserve existing canonical work positions');
    assert.strictEqual(preservedCanonicalPlan.cityPlan.plannedStructures.filter((entry) => entry.id === 'source1:container').length, 1, 'city plan migration should not duplicate existing canonical planned assets');
    assert.strictEqual(preservedCanonicalPlan.assetImportReadiness.canonicalCompleteBeforeImport, true, 'city plan migration should treat rooms with no remaining legacy asset import targets as complete before import');
    assert.strictEqual(preservedCanonicalPlan.assetImportReadiness.legacyAssetImportUsed, false, 'city plan migration should report no legacy asset import when no canonical assets were regenerated');
    assert.strictEqual(preservedCanonicalPlan.assetImportReadiness.readyForAssetImportRemoval, true, 'city plan migration should mark rooms with no remaining legacy asset import targets ready for asset import removal');
    const canonicalAssetReadyPlan = migrateCityPlan({
        schemaVersion: 2,
        sources: {
            source1: {
                primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' },
                containerPos: { x: 9, y: 10, roomName: 'W1N1' },
                linkPos: { x: 10, y: 11, roomName: 'W1N1' }
            }
        },
        controller: {
            primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' },
            containerPos: { x: 24, y: 25, roomName: 'W1N1' },
            linkPos: { x: 24, y: 24, roomName: 'W1N1' }
        },
        plannedStructures: [{
            id: 'source1:container',
            role: 'source_container',
            structureType: STRUCTURE_CONTAINER,
            pos: { x: 9, y: 10, roomName: 'W1N1' },
            scope: { sourceId: 'source1' },
            lifecycle: { state: 'active', activeFromRcl: 1 }
        }, {
            id: 'source1:link',
            role: 'source_link',
            structureType: STRUCTURE_LINK,
            pos: { x: 10, y: 11, roomName: 'W1N1' },
            scope: { sourceId: 'source1' },
            lifecycle: { state: 'planned', activeFromRcl: 5 }
        }, {
            id: 'controller:container',
            role: 'controller_container',
            structureType: STRUCTURE_CONTAINER,
            pos: { x: 24, y: 25, roomName: 'W1N1' },
            lifecycle: { state: 'active', activeFromRcl: 1 }
        }, {
            id: 'controller:link',
            role: 'controller_link',
            structureType: STRUCTURE_LINK,
            pos: { x: 24, y: 24, roomName: 'W1N1' },
            lifecycle: { state: 'planned', activeFromRcl: 5 }
        }]
    });
    assert.strictEqual(canonicalAssetReadyPlan.assetImportReadiness.canonicalCompleteBeforeImport, true, 'city plan migration should report steady-state canonical rooms as complete before legacy asset import');
    assert.strictEqual(canonicalAssetReadyPlan.assetImportReadiness.legacyAssetImportUsed, false, 'city plan migration should report no legacy asset import when canonical planned assets already exist');
    assert.strictEqual(canonicalAssetReadyPlan.assetImportReadiness.readyForAssetImportRemoval, true, 'city plan migration should mark fully canonical rooms ready for asset import removal dry-run');
    assert.deepStrictEqual(canonicalAssetReadyPlan.assetImportReadiness.missingCanonicalAssetRoles, [], 'city plan migration should report no missing canonical asset roles for steady-state canonical rooms');
    assert.deepStrictEqual(canonicalAssetReadyPlan.assetImportReadiness.regeneratedAssetRoles, [], 'city plan migration should report no regenerated asset roles for steady-state canonical rooms');
    const disabledAssetImportPlan = migrateCityPlan({
        schemaVersion: 2,
        sources: {
            source1: {
                primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' },
                containerPos: { x: 9, y: 10, roomName: 'W1N1' },
                linkPos: { x: 10, y: 11, roomName: 'W1N1' }
            }
        },
        controller: {
            primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' },
            containerPos: { x: 24, y: 25, roomName: 'W1N1' },
            linkPos: { x: 24, y: 24, roomName: 'W1N1' }
        }
    }, 4, {
        assetImportMode: 'disabled'
    });
    assert.strictEqual(disabledAssetImportPlan.changed, true, 'city plan migration should still migrate schema/runtime/work-position state when asset import is disabled');
    assert.strictEqual(disabledAssetImportPlan.changes.plannedStructuresAdded, 0, 'city plan migration should stop regenerating planned assets when asset import mode is disabled');
    assert.strictEqual(disabledAssetImportPlan.cityPlan.plannedStructures.length, 0, 'city plan migration should leave canonical planned assets missing when legacy asset import is disabled');
    assert.strictEqual(disabledAssetImportPlan.assetImportReadiness.canonicalCompleteBeforeImport, false, 'city plan migration should continue reporting incomplete canonical planned assets before disabled import runs');
    assert.strictEqual(disabledAssetImportPlan.assetImportReadiness.legacyAssetImportUsed, false, 'city plan migration should report no legacy asset import usage when asset import mode is disabled');
    assert.strictEqual(disabledAssetImportPlan.assetImportReadiness.readyForAssetImportRemoval, false, 'city plan migration should keep asset import retirement gated when canonical planned assets remain incomplete in disabled mode');
    assert.deepStrictEqual(disabledAssetImportPlan.assetImportReadiness.missingCanonicalAssetRoles.sort(), ['controller_container', 'controller_link', 'source_container', 'source_link'], 'city plan migration should preserve missing-role diagnostics when asset import mode is disabled');
    assert.deepStrictEqual(disabledAssetImportPlan.assetImportReadiness.regeneratedAssetRoles, [], 'city plan migration should not report regenerated asset roles when asset import mode is disabled');
    const activeSourceContainer = getActivePlannedStructure(cityPlan, 'source_container', { sourceId: 'source1' });
    assert.ok(activeSourceContainer && activeSourceContainer.pos, 'city plan helpers should resolve active planned structures by role and scope');
    assert.strictEqual(getPlannedStructuresByRole(cityPlan, 'controller_container').length, 1, 'city plan helpers should return role-filtered planned structures');
    assert.ok(getPlannedStructuresByPhase(cityPlan, 'bootstrap').length > 0, 'city plan helpers should expose phase-filtered planned structures');
    assert.ok(getPlannedStructuresByGroup(cityPlan, 'logistics').length > 0, 'city plan helpers should expose grouped city assets');
    assert.ok(getHubPlan(cityPlan) && getHubPlan(cityPlan).center, 'city plan helpers should return the hub plan');
    assert.strictEqual(getStructureLifecycle(cityPlan, activeSourceContainer).state, 'active', 'city plan helpers should expose structure lifecycle metadata');
    assert.strictEqual(findPlannedStructureForObject(cityPlan, activeSourceContainer).id, activeSourceContainer.id, 'city plan helpers should resolve planned entries from live structures');
    assert.strictEqual(getPlannedRole(cityPlan, activeSourceContainer), 'source_container', 'city plan helpers should expose planned role lookup for structures');
    assert.strictEqual(getPlannedGroup(cityPlan, activeSourceContainer), 'logistics', 'city plan helpers should expose planned group lookup for structures');
    assert.strictEqual(getPlannedLifecycleState(cityPlan, activeSourceContainer), 'active', 'city plan helpers should expose lifecycle state lookup for structures');
    assert.strictEqual(isLifecycleState(activeSourceContainer, ['active']), true, 'city plan helpers should match lifecycle state on planned entries');
    assert.deepStrictEqual(validateCityPlan(cityPlan), { valid: true, errors: [] }, 'city plan schema should accept planner output');
    assert.strictEqual(getControllerContainerAsset(cityPlan).role, 'controller_container', 'legacy adapter should resolve controller container assets from planned structures');
    assert.strictEqual(getSourceContainerAsset(cityPlan, 'source1').role, 'source_container', 'legacy adapter should resolve source container assets by source id');
    assert.strictEqual(resolveControllerContainerAsset(cityPlan).source, 'planned', 'legacy adapter should report planned source when planned controller container exists');
    assert.strictEqual(resolveSourceContainerAsset(cityPlan, 'source1').source, 'planned', 'legacy adapter should report planned source when planned source container exists');
    assert.strictEqual(resolveSourceContainerAsset({}, 'missing').source, 'none', 'legacy adapter should report none when no source container asset exists');
    assert.strictEqual(resolveControllerContainerAsset({
        controller: { containerPos: { x: 24, y: 25, roomName: 'W1N1' } }
    }).source, 'none', 'legacy adapter should report none once legacy-only controller-container storage is no longer read');
    assert.strictEqual(resolveControllerContainerAsset({
        controller: { containerPos: { x: 24, y: 25, roomName: 'W1N1' } }
    }, { allowLegacyFallback: false }).source, 'none', 'legacy adapter strict controller-container resolution should report none when only legacy coordinates exist after adapter hard retirement');
    assert.strictEqual(resolveControllerContainerAsset({
        controller: { containerPos: { x: 24, y: 25, roomName: 'W1N1' } }
    }, { allowLegacyFallback: true }).source, 'none', 'legacy adapter should report none for legacy-only controller containers even when compat fallback is requested after adapter hard retirement');
    assert.strictEqual(resolveSourceContainerAsset({
        sources: {
            source1: { containerPos: { x: 9, y: 10, roomName: 'W1N1' } }
        }
    }, 'source1').source, 'none', 'legacy adapter should report none once legacy-only source-container storage is no longer read');
    assert.strictEqual(resolveSourceContainerAsset({
        sources: {
            source1: { containerPos: { x: 9, y: 10, roomName: 'W1N1' } }
        }
    }, 'source1', { allowLegacyFallback: false }).source, 'none', 'legacy adapter strict source-container resolution should report none when only legacy coordinates exist after adapter hard retirement');
    assert.strictEqual(resolveSourceContainerAsset({
        sources: {
            source1: { containerPos: { x: 9, y: 10, roomName: 'W1N1' } }
        }
    }, 'source1', { allowLegacyFallback: true }).source, 'none', 'legacy adapter should report none for legacy-only source containers even when compat fallback is requested after adapter hard retirement');
    assert.strictEqual(resolveControllerLinkAsset({
        controller: { linkPos: { x: 24, y: 24, roomName: 'W1N1' } }
    }).source, 'none', 'legacy adapter should report none once legacy-only controller-link storage is no longer read');
    assert.strictEqual(resolveControllerLinkAsset({
        controller: { linkPos: { x: 24, y: 24, roomName: 'W1N1' } }
    }, { allowLegacyFallback: false }).source, 'none', 'legacy adapter strict controller-link resolution should report none when only legacy coordinates exist after adapter hard retirement');
    assert.strictEqual(resolveControllerLinkAsset({
        controller: { linkPos: { x: 24, y: 24, roomName: 'W1N1' } }
    }, { allowLegacyFallback: true }).source, 'none', 'legacy adapter should report none for legacy-only controller links even when compat fallback is requested after adapter hard retirement');
    assert.strictEqual(resolveSourceLinkAsset({
        sources: {
            source1: { linkPos: { x: 10, y: 11, roomName: 'W1N1' } }
        }
    }, 'source1').source, 'none', 'legacy adapter should report none once legacy-only source-link storage is no longer read');
    assert.strictEqual(resolveSourceLinkAsset({
        sources: {
            source1: { linkPos: { x: 10, y: 11, roomName: 'W1N1' } }
        }
    }, 'source1', { allowLegacyFallback: false }).source, 'none', 'legacy adapter strict source-link resolution should report none when only legacy coordinates exist after adapter hard retirement');
    assert.strictEqual(resolveSourceLinkAsset({
        sources: {
            source1: { linkPos: { x: 10, y: 11, roomName: 'W1N1' } }
        }
    }, 'source1', { allowLegacyFallback: true }).source, 'none', 'legacy adapter should report none for legacy-only source links even when compat fallback is requested after adapter hard retirement');
    assert.strictEqual(resolveControllerContainerAsset(cityPlan, { allowLegacyFallback: false }).source, 'planned', 'legacy adapter strict controller-container resolution should still return canonical planned assets');
    assert.strictEqual(getControllerContainerAsset({
        controller: { containerPos: { x: 24, y: 25, roomName: 'W1N1' } }
    }, { allowLegacyFallback: false }), null, 'legacy adapter strict controller-container getter should not expose legacy-only compatibility storage');
    assert.strictEqual(getControllerLinkAsset({
        controller: { linkPos: { x: 24, y: 24, roomName: 'W1N1' } }
    }, { allowLegacyFallback: false }), null, 'legacy adapter strict controller-link getter should not expose legacy-only compatibility storage');
    assert.strictEqual(getSourceContainerAsset({
        sources: {
            source1: { containerPos: { x: 9, y: 10, roomName: 'W1N1' } }
        }
    }, 'source1', { allowLegacyFallback: false }), null, 'legacy adapter strict source-container getter should not expose legacy-only compatibility storage');
    assert.strictEqual(resolveSourceContainerAsset(cityPlan, 'source1', { allowLegacyFallback: false }).source, 'planned', 'legacy adapter strict source-container resolution should still return canonical planned assets');
    assert.strictEqual(getSourceContainerAsset(cityPlan, 'source1', { allowLegacyFallback: false }).role, 'source_container', 'legacy adapter strict source-container getter should still return canonical planned assets');
    assert.strictEqual(getAssetPolicy(cityPlan, activeSourceContainer).role, 'source_container', 'city asset policy should resolve planned role for source containers');
    assert.strictEqual(getLogisticsPolicy(cityPlan, activeSourceContainer).supplyMode, 'active', 'city asset policy should advertise active source containers as normal logistics supply');
    assert.strictEqual(getMaintenancePolicy(cityPlan, activeSourceContainer).repairMode, 'band', 'city asset policy should expose band repair mode for active source containers');
    assert.strictEqual(getSourceOutputPolicy(cityPlan, 'source1').bodyProfile, 'miner', 'city asset policy should default source output policy to stationary miner when source-link output is not planned');
    const transitionSourcePolicy = getSourceOutputPolicy({
        sourceRuntime: {
            sources: {
                source1: {
                    preferredOutputRole: 'source_link',
                    deliveryMode: 'transition'
                }
            }
        },
        plannedStructures: [{
            id: 'source1:link',
            role: 'source_link',
            structureType: STRUCTURE_LINK,
            pos: { x: 10, y: 11, roomName: 'W1N1' },
            scope: { sourceId: 'source1' },
            lifecycle: { state: 'planned', activeFromRcl: 5 }
        }]
    }, 'source1', {
        sourceLinkOnline: true,
        controllerLinkOnline: true,
        normalEnergyPosture: true,
        stableTicks: 1,
        retireObservationTicks: 1500
    });
    assert.strictEqual(transitionSourcePolicy.usesLinkOutput, true, 'city asset policy should recognize source-link output usage from source runtime state');
    assert.strictEqual(transitionSourcePolicy.transitioningToLink, true, 'city asset policy should report transition mode before link-primary promotion');
    assert.strictEqual(transitionSourcePolicy.shouldUseLinkMiner, true, 'city asset policy should request link-miner bodies for link-output sources');
    const linkPrimarySourcePolicy = getSourceOutputPolicy({
        sourceRuntime: {
            sources: {
                source1: {
                    preferredOutputRole: 'source_link',
                    deliveryMode: 'link_primary'
                }
            }
        },
        plannedStructures: [{
            id: 'source1:link',
            role: 'source_link',
            structureType: STRUCTURE_LINK,
            pos: { x: 10, y: 11, roomName: 'W1N1' },
            scope: { sourceId: 'source1' },
            lifecycle: { state: 'planned', activeFromRcl: 5 }
        }]
    }, 'source1', {
        sourceLinkOnline: true,
        controllerLinkOnline: true,
        normalEnergyPosture: true,
        stableTicks: 1500,
        retireObservationTicks: 1500
    });
    assert.strictEqual(linkPrimarySourcePolicy.linkPrimary, true, 'city asset policy should report link-primary source runtime state');
    assert.strictEqual(linkPrimarySourcePolicy.shouldRetireSourceContainer, true, 'city asset policy should flag source containers as retirement candidates after a stable link-primary window');
    assert.deepStrictEqual(SOURCE_OUTPUT_ROLES, {
        CONTAINER: 'source_container',
        LINK: 'source_link'
    }, 'source runtime state should export canonical output role constants');
    assert.deepStrictEqual(SOURCE_DELIVERY_MODES, {
        CONTAINER: 'container',
        TRANSITION: 'transition',
        LINK_PRIMARY: 'link_primary'
    }, 'source runtime state should export canonical delivery mode constants');
    assert.deepStrictEqual(SOURCE_RUNTIME_MODES, {
        CONTAINER: 'container',
        LINK_TRANSITION: 'link_transition',
        LINK_PRIMARY: 'link_primary',
        INVALID: 'invalid'
    }, 'source runtime state should export canonical runtime mode constants');
    assert.deepStrictEqual(SOURCE_RUNTIME_EVENTS, {
        LINK_OUTPUT_PLANNED: 'link_output_planned',
        LINK_NETWORK_ONLINE: 'link_network_online',
        CONTAINER_OUTPUT_SELECTED: 'container_output_selected'
    }, 'source runtime state should export canonical event constants');
    assert.deepStrictEqual(getSourceRuntimeState({}, 'source1'), {
        sourceId: 'source1',
        preferredOutputRole: 'source_container',
        deliveryMode: 'container',
        runtimeMode: 'container',
        valid: true,
        error: null,
        hasSourcePlan: false
    }, 'source runtime state helper should provide stable defaults when no source runtime state exists');
    assert.strictEqual(shouldUseStrictSourceRuntime(null), false, 'runtime readiness helper should keep strict source-runtime reads disabled when observation data is absent');
    assert.strictEqual(shouldUseStrictSourceRuntime({
        cityPlanRuntimeObservation: {
            readyStreak: 2,
            readyForRuntimeFallbackDisable: true
        }
    }), false, 'runtime readiness helper should keep strict source-runtime reads disabled before the readiness streak is satisfied');
    assert.strictEqual(shouldUseStrictSourceRuntime({
        cityPlanRuntimeObservation: {
            readyStreak: 3,
            readyForRuntimeFallbackDisable: true
        }
    }), true, 'runtime readiness helper should enable strict source-runtime reads once the readiness streak is satisfied');
    assert.deepStrictEqual(getSourceRuntimeState({
        sources: {
            sourceCanonical: {
                preferredOutputRole: 'source_container',
                deliveryMode: 'container'
            }
        },
        sourceRuntime: {
            sources: {
                sourceCanonical: {
                    preferredOutputRole: 'source_link',
                    deliveryMode: 'transition'
                }
            }
        }
    }, 'sourceCanonical'), {
        sourceId: 'sourceCanonical',
        preferredOutputRole: 'source_link',
        deliveryMode: 'transition',
        runtimeMode: 'link_transition',
        valid: true,
        error: null,
        hasSourcePlan: true
    }, 'source runtime state helper should prefer canonical source runtime storage when canonical and legacy runtime values diverge');
    assert.deepStrictEqual(getSourceRuntimeState({
        sources: {
            sourceCanonical: {
                preferredOutputRole: 'source_container',
                deliveryMode: 'container'
            }
        },
        sourceRuntime: {
            sources: {
                sourceCanonical: {
                    preferredOutputRole: 'source_link',
                    deliveryMode: 'transition'
                }
            }
        }
    }, 'sourceCanonical', {
        allowLegacyFallback: false
    }), {
        sourceId: 'sourceCanonical',
        preferredOutputRole: 'source_link',
        deliveryMode: 'transition',
        runtimeMode: 'link_transition',
        valid: true,
        error: null,
        hasSourcePlan: true
    }, 'source runtime state helper should allow strict canonical-only reads when canonical runtime storage exists');
    assert.deepStrictEqual(getSourceRuntimeState({
        sources: {
            sourceLegacyOnly: {
                preferredOutputRole: 'source_link',
                deliveryMode: 'link_primary'
            }
        }
    }, 'sourceLegacyOnly'), {
        sourceId: 'sourceLegacyOnly',
        preferredOutputRole: 'source_container',
        deliveryMode: 'container',
        runtimeMode: 'container',
        valid: true,
        error: null,
        hasSourcePlan: true
    }, 'source runtime state helper should ignore legacy-only source runtime fields and fall back to default runtime semantics when canonical runtime storage is missing');
    assert.deepStrictEqual(getSourceRuntimeState({
        sources: {
            sourceLegacyOnly: {
                preferredOutputRole: 'source_link',
                deliveryMode: 'link_primary'
            }
        }
    }, 'sourceLegacyOnly', {
        allowLegacyFallback: false
    }), {
        sourceId: 'sourceLegacyOnly',
        preferredOutputRole: null,
        deliveryMode: null,
        runtimeMode: 'invalid',
        valid: false,
        error: 'missing canonical source runtime state: sourceLegacyOnly',
        hasSourcePlan: true
    }, 'source runtime state helper should report missing canonical runtime storage when strict reads are enabled');
    assert.deepStrictEqual(getSourceRuntimeState({}, 'sourceMissingStrict', {
        allowLegacyFallback: false
    }), {
        sourceId: 'sourceMissingStrict',
        preferredOutputRole: null,
        deliveryMode: null,
        runtimeMode: 'invalid',
        valid: false,
        error: 'missing canonical source runtime state: sourceMissingStrict',
        hasSourcePlan: false
    }, 'source runtime state helper should not fall back to default runtime values when strict reads are enabled');
    const sourceRuntimePlan = {
        sources: {
            source1: {
                preferredOutputRole: 'source_container',
                primaryMiningPos: { x: 11, y: 10, roomName: 'W1N1' }
            }
        }
    };
    setSourceRuntimeState(sourceRuntimePlan, 'source1', {
        preferredOutputRole: 'source_link',
        deliveryMode: 'transition',
        containerPos: { x: 10, y: 10, roomName: 'W1N1' }
    });
    assert.deepStrictEqual(getSourceRuntimeState(sourceRuntimePlan, 'source1'), {
        sourceId: 'source1',
        preferredOutputRole: 'source_link',
        deliveryMode: 'transition',
        runtimeMode: 'link_transition',
        valid: true,
        error: null,
        hasSourcePlan: true
    }, 'source runtime state helper should update only runtime-owned fields');
    assert.strictEqual(sourceRuntimePlan.sources.source1.primaryMiningPos.x, 11, 'source runtime state helper should preserve non-runtime source plan fields');
    assert.strictEqual(sourceRuntimePlan.sources.source1.containerPos, undefined, 'source runtime state helper should ignore non-runtime patch fields');
    assert.strictEqual(sourceRuntimePlan.sources.source1.preferredOutputRole, 'source_container', 'source runtime state helper should not rewrite legacy source runtime output-role fields during canonical updates');
    assert.strictEqual(sourceRuntimePlan.sources.source1.deliveryMode, undefined, 'source runtime state helper should not add legacy source runtime delivery-mode fields during canonical updates');
    assert.deepStrictEqual(sourceRuntimePlan.sourceRuntime.sources.source1, {
        preferredOutputRole: 'source_link',
        deliveryMode: 'transition'
    }, 'source runtime state helper should persist canonical source runtime storage');
    const promotedSourceRuntimePlan = {
        sources: {
            source1: {
                preferredOutputRole: 'source_container',
                deliveryMode: 'transition'
            }
        }
    };
    promoteSourceToLinkPrimary(promotedSourceRuntimePlan, 'source1');
    assert.deepStrictEqual(getSourceRuntimeState(promotedSourceRuntimePlan, 'source1'), {
        sourceId: 'source1',
        preferredOutputRole: 'source_link',
        deliveryMode: 'link_primary',
        runtimeMode: 'link_primary',
        valid: true,
        error: null,
        hasSourcePlan: true
    }, 'source runtime state helper should expose a semantic promotion helper for link-primary source output');
    const transitionSourceRuntimePlan = { sources: { source1: { primaryMiningPos: { x: 11, y: 10, roomName: 'W1N1' } } } };
    setSourceLinkOutputTransition(transitionSourceRuntimePlan, 'source1');
    assert.deepStrictEqual(getSourceRuntimeState(transitionSourceRuntimePlan, 'source1'), {
        sourceId: 'source1',
        preferredOutputRole: 'source_link',
        deliveryMode: 'transition',
        runtimeMode: 'link_transition',
        valid: true,
        error: null,
        hasSourcePlan: true
    }, 'source runtime state helper should expose a semantic transition helper for source-link output');
    assert.deepStrictEqual(transitionSourceRuntimeState(transitionSourceRuntimePlan, 'source1', SOURCE_RUNTIME_EVENTS.LINK_NETWORK_ONLINE), {
        changed: true,
        event: 'link_network_online',
        from: 'link_transition',
        to: 'link_primary',
        state: {
            sourceId: 'source1',
            preferredOutputRole: 'source_link',
            deliveryMode: 'link_primary',
            runtimeMode: 'link_primary',
            valid: true,
            error: null,
            hasSourcePlan: true
        },
        error: null
    }, 'source runtime state helper should promote transition-mode source output through the shared event-based entrypoint');
    assert.strictEqual(transitionSourceRuntimePlan.sources.source1.primaryMiningPos.x, 11, 'source runtime transition helper should preserve non-runtime source plan fields');
    assert.strictEqual(transitionSourceRuntimePlan.sources.source1.preferredOutputRole, undefined, 'source runtime transition helper should leave legacy source runtime output-role fields untouched');
    assert.strictEqual(transitionSourceRuntimePlan.sources.source1.deliveryMode, undefined, 'source runtime transition helper should leave legacy source runtime delivery-mode fields untouched');
    assert.deepStrictEqual(transitionSourceRuntimePlan.sourceRuntime.sources.source1, {
        preferredOutputRole: 'source_link',
        deliveryMode: 'link_primary'
    }, 'source runtime transition helper should keep canonical source runtime storage in sync after transitions');

    const containerSourceRuntimePlan = {};
    setSourceContainerOutput(containerSourceRuntimePlan, 'source2');
    assert.deepStrictEqual(getSourceRuntimeState(containerSourceRuntimePlan, 'source2'), {
        sourceId: 'source2',
        preferredOutputRole: 'source_container',
        deliveryMode: 'container',
        runtimeMode: 'container',
        valid: true,
        error: null,
        hasSourcePlan: true
    }, 'source runtime state helper should expose a semantic helper for container-based source output');
    assert.deepStrictEqual(transitionSourceRuntimeState(containerSourceRuntimePlan, 'source2', SOURCE_RUNTIME_EVENTS.LINK_OUTPUT_PLANNED), {
        changed: true,
        event: 'link_output_planned',
        from: 'container',
        to: 'link_transition',
        state: {
            sourceId: 'source2',
            preferredOutputRole: 'source_link',
            deliveryMode: 'transition',
            runtimeMode: 'link_transition',
            valid: true,
            error: null,
            hasSourcePlan: true
        },
        error: null
    }, 'source runtime transition helper should move container-based source output into link transition mode through named events');
    assert.deepStrictEqual(transitionSourceRuntimeState(containerSourceRuntimePlan, 'source2', SOURCE_RUNTIME_EVENTS.CONTAINER_OUTPUT_SELECTED), {
        changed: true,
        event: 'container_output_selected',
        from: 'link_transition',
        to: 'container',
        state: {
            sourceId: 'source2',
            preferredOutputRole: 'source_container',
            deliveryMode: 'container',
            runtimeMode: 'container',
            valid: true,
            error: null,
            hasSourcePlan: true
        },
        error: null
    }, 'source runtime transition helper should restore container-based source output through named events');
    assert.deepStrictEqual(transitionSourceRuntimeState({}, 'source3', SOURCE_RUNTIME_EVENTS.LINK_NETWORK_ONLINE), {
        changed: false,
        event: 'link_network_online',
        from: 'container',
        to: 'link_primary',
        state: {
            sourceId: 'source3',
            preferredOutputRole: 'source_container',
            deliveryMode: 'container',
            runtimeMode: 'container',
            valid: true,
            error: null,
            hasSourcePlan: false
        },
        error: 'illegal source runtime transition: container -> link_primary'
    }, 'source runtime transition helper should reject direct link-primary promotion without compatibility context');
    assert.deepStrictEqual(transitionSourceRuntimeState({}, 'source3', SOURCE_RUNTIME_EVENTS.LINK_NETWORK_ONLINE, {
        allowDirectPromotion: true
    }), {
        changed: true,
        event: 'link_network_online',
        from: 'container',
        to: 'link_primary',
        state: {
            sourceId: 'source3',
            preferredOutputRole: 'source_link',
            deliveryMode: 'link_primary',
            runtimeMode: 'link_primary',
            valid: true,
            error: null,
            hasSourcePlan: true
        },
        error: null
    }, 'source runtime transition helper should allow direct promotion when compatibility context is explicit');
    assert.deepStrictEqual(transitionSourceRuntimeState({}, 'source4', 'unknown_event'), {
        changed: false,
        event: 'unknown_event',
        from: 'container',
        to: null,
        state: {
            sourceId: 'source4',
            preferredOutputRole: 'source_container',
            deliveryMode: 'container',
            runtimeMode: 'container',
            valid: true,
            error: null,
            hasSourcePlan: false
        },
        error: 'unknown source runtime event: unknown_event'
    }, 'source runtime transition helper should return the current state for unknown events');
    assert.deepStrictEqual(getSourceRuntimeState({
        sources: {
            source5: {
                preferredOutputRole: 'source_container',
                deliveryMode: 'transition'
            }
        }
    }, 'source5'), {
        sourceId: 'source5',
        preferredOutputRole: 'source_container',
        deliveryMode: 'container',
        runtimeMode: 'container',
        valid: true,
        error: null,
        hasSourcePlan: true
    }, 'source runtime state helper should ignore invalid legacy-only source runtime combinations and fall back to default runtime semantics');
    assert.deepStrictEqual(getSourceIds({
        sources: {
            source1: {},
            source2: {}
        },
        sourceRuntime: {
            sources: {
                source4: {
                    preferredOutputRole: 'source_container',
                    deliveryMode: 'container'
                }
            }
        },
        plannedStructures: [{
            id: 'source2:link',
            role: 'source_link',
            structureType: STRUCTURE_LINK,
            pos: { x: 12, y: 10, roomName: 'W1N1' },
            scope: { sourceId: 'source2' },
            lifecycle: { state: 'planned', activeFromRcl: 5 }
        }, {
            id: 'source3:container',
            role: 'source_container',
            structureType: STRUCTURE_CONTAINER,
            pos: { x: 15, y: 10, roomName: 'W1N1' },
            scope: { sourceId: 'source3' },
            lifecycle: { state: 'active', activeFromRcl: 1 }
        }]
    }), ['source1', 'source2', 'source4', 'source3'], 'source runtime state helper should merge and deduplicate source ids from runtime state, canonical runtime storage, and planned assets');
    assert.deepStrictEqual(getCityWorkPositions(cityPlan).sources.source1.mining.primary, { x: 9, y: 10, roomName: 'W1N1' }, 'city work position policy should expose source mining positions from the new workPositions model');
    assert.deepStrictEqual(getSourceMiningWorkPosition({
        workPositions: {
            sources: {
                source1: {
                    mining: {
                        primary: { x: 8, y: 9, roomName: 'W1N1' }
                    }
                }
            }
        },
        sources: {
            source1: {
                primaryMiningPos: { x: 9, y: 9, roomName: 'W1N1' }
            }
        }
    }, 'source1'), { x: 8, y: 9, roomName: 'W1N1' }, 'city work position policy should prefer the new workPositions source mining position over legacy fields');
    assert.strictEqual(getSourceMiningWorkPosition({
        sources: {
            source1: {
                primaryMiningPos: { x: 9, y: 9, roomName: 'W1N1' }
            }
        }
    }, 'source1'), null, 'city work position policy should default source mining reads to canonical workPositions only when workPositions are absent');
    assert.strictEqual(getSourceMiningWorkPosition({
        sources: {
            source1: {
                primaryMiningPos: { x: 9, y: 9, roomName: 'W1N1' }
            }
        }
    }, 'source1', { allowLegacyFallback: true }), null, 'city work position policy should ignore explicit legacy source mining fallback requests once migration owns compatibility import');
    assert.strictEqual(getSourceMiningWorkPosition({
        sources: {
            source1: {
                primaryMiningPos: { x: 9, y: 9, roomName: 'W1N1' }
            }
        }
    }, 'source1', { allowLegacyFallback: false }), null, 'city work position policy should not expose legacy-only source mining work positions after fallback removal');
    assert.deepStrictEqual(getControllerUpgradeWorkPosition({
        workPositions: {
            controller: {
                upgrade: {
                    primary: { x: 22, y: 24, roomName: 'W1N1' }
                }
            }
        },
        controller: {
            primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' }
        }
    }), { x: 22, y: 24, roomName: 'W1N1' }, 'city work position policy should prefer the new controller upgrade work position over legacy fields');
    assert.strictEqual(getControllerUpgradeWorkPosition({
        controller: {
            primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' }
        }
    }), null, 'city work position policy should default controller upgrade reads to canonical workPositions only when workPositions are absent');
    assert.strictEqual(getControllerUpgradeWorkPosition({
        controller: {
            primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' }
        }
    }, { allowLegacyFallback: true }), null, 'city work position policy should ignore explicit legacy controller upgrade fallback requests once migration owns compatibility import');
    assert.strictEqual(getControllerUpgradeWorkPosition({
        controller: {
            primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' }
        }
    }, { allowLegacyFallback: false }), null, 'city work position policy should not expose legacy-only controller upgrade work positions after fallback removal');
    const debugSummary = buildCityPlanDebug('W1N1', cityPlan);
    assert.strictEqual(debugSummary.validation.valid, true, 'city plan debug should include schema validation results');
    assert.strictEqual(debugSummary.assetCountsByRole.source_container, 1, 'city plan debug should count assets by role');
    assert.strictEqual(debugSummary.assetCountsByLifecycle.active >= 1, true, 'city plan debug should count assets by lifecycle');
    assert.strictEqual(debugSummary.workPositions.sourceMiningCount, 1, 'city plan debug should summarize source mining work positions');
    assert.strictEqual(debugSummary.workPositions.hasControllerUpgrade, true, 'city plan debug should summarize whether a controller upgrade work position exists');
    assert.strictEqual(debugSummary.sourceRuntime.byMode.container, 1, 'city plan debug should summarize container-mode source runtime states');
    assert.strictEqual(debugSummary.sourceRuntime.byMode.invalid, 0, 'city plan debug should report zero invalid source runtime states when all source plans are canonical');
    assert.strictEqual(debugSummary.sourceRuntime.canonical.totalSources, 1, 'city plan debug should report canonical source runtime storage generated by the planner');
    assert.deepStrictEqual(debugSummary.sourceRuntime.canonical.missingSources, [], 'city plan debug should report no missing canonical source runtime entries for fresh planner output');
    assert.deepStrictEqual(debugSummary.sourceRuntime.canonical.fallbackSources, [], 'city plan debug should report no runtime fallback sources for fresh planner output');
    assert.deepStrictEqual(debugSummary.sourceRuntime.canonical.mismatchedSources, [], 'city plan debug should report no canonical mismatch for fresh planner output');
    assert.strictEqual(debugSummary.legacyFallbackSummary.total, 0, 'city plan debug should summarize zero legacy fallbacks when canonical assets resolve cleanly');
    assert.strictEqual(debugSummary.v3Readiness.schemaCurrent, true, 'city plan debug should report schema-current status for v3 readiness');
    assert.strictEqual(debugSummary.v3Readiness.migrationObserved, false, 'city plan debug should report when migration observation has not yet been recorded');
    assert.strictEqual(debugSummary.v3Readiness.sourceRuntimeCanonicalComplete, true, 'city plan debug should mark fresh planner output as canonical-runtime complete');
    assert.strictEqual(debugSummary.v3Readiness.sourceRuntimeStorageConsistent, true, 'city plan debug should treat rooms without canonical entries as having no canonical-storage mismatch');
    assert.strictEqual(debugSummary.v3Readiness.sourceRuntimeFallbackFree, true, 'city plan debug should mark fresh planner output as runtime-fallback-free');
    assert.strictEqual(debugSummary.v3Readiness.readyForRuntimeFallbackDisable, false, 'city plan debug should still keep runtime fallback disable gated before migration observation is recorded');
    assert.strictEqual(debugSummary.v3Readiness.readyForFallbackDisable, false, 'city plan debug should not mark rooms ready for fallback disable before migration observation is recorded');
    const legacyDebugSummary = buildCityPlanDebug('W1N1', {
        controller: { containerPos: { x: 24, y: 25, roomName: 'W1N1' } },
        sources: {}
    });
    assert.deepStrictEqual(legacyDebugSummary.legacyFallbacks, [], 'city plan debug should stop reporting legacy asset fallbacks once debug fallback observation is retired');
    assert.strictEqual(legacyDebugSummary.legacyFallbackSummary.total, 0, 'city plan debug should summarize zero legacy fallback totals once debug fallback observation is retired');
    assert.strictEqual(legacyDebugSummary.assetFallbackReadiness.controller_container.fallbackCount, 0, 'city plan debug should stop surfacing compat fallback counts once debug fallback observation is retired');
    assert.strictEqual(legacyDebugSummary.assetFallbackReadiness.controller_container.fallbackFree, true, 'city plan debug should treat asset fallback readiness as cleanup-driven once direct fallback observation is retired');
    assert.strictEqual(legacyDebugSummary.assetFallbackReadiness.source_container.fallbackFree, true, 'city plan debug should keep untouched source-container fallback readiness free when direct compat fallback observation is retired');
    assert.strictEqual(legacyDebugSummary.v3Readiness.legacyFallbackFree, true, 'city plan debug should stop treating legacy-only asset coordinates as active fallback once direct observation is retired');
    assert.strictEqual(legacyDebugSummary.v3Readiness.assetFallbackFree, true, 'city plan debug should stop treating legacy-only asset coordinates as asset-fallback-active once direct observation is retired');
    assert.strictEqual(legacyDebugSummary.v3Readiness.assetFallbackObservationStable, false, 'city plan debug should still leave asset fallback observation stability unset before the service records cleanup-derived readiness');
    assert.strictEqual(legacyDebugSummary.v3Readiness.readyForAssetFallbackDisable, false, 'city plan debug should keep asset fallback disable gated before service-side cleanup readiness is recorded');
    Memory.rooms.W1N1.cityPlanMigration = {
        updatedAt: 48,
        fromVersion: 2,
        toVersion: 4,
        changed: true,
        warnings: [],
        changes: {
            plannedStructuresAdded: 0,
            workPositionsAdded: 0,
            runtimeDefaultsAdded: 0,
            sourceRuntimeEntriesAdded: 0,
            legacyStoragePreserved: true
        }
    };
    const invalidRuntimeDebugSummary = buildCityPlanDebug('W1N1', {
        schemaVersion: 4,
        sources: {
            sourceBad: {
                preferredOutputRole: 'source_container',
                deliveryMode: 'transition'
            }
        },
        sourceRuntime: {
            sources: {
                sourceBad: {
                    preferredOutputRole: 'source_link',
                    deliveryMode: 'transition'
                }
            }
        }
    });
    assert.strictEqual(invalidRuntimeDebugSummary.sourceRuntime.byMode.link_transition, 1, 'city plan debug should summarize canonical source runtime modes before legacy runtime fallback is disabled');
    assert.strictEqual(invalidRuntimeDebugSummary.v3Readiness.sourceRuntimeValid, true, 'city plan debug should treat canonical source runtime combinations as valid even when legacy runtime storage still mismatches');
    assert.strictEqual(invalidRuntimeDebugSummary.v3Readiness.sourceRuntimeCanonicalComplete, true, 'city plan debug should recognize canonical runtime coverage when source runtime storage exists');
    assert.strictEqual(invalidRuntimeDebugSummary.v3Readiness.sourceRuntimeStorageConsistent, true, 'city plan debug should stop treating legacy source runtime divergence as a consistency failure once legacy runtime observation is removed');
    assert.strictEqual(invalidRuntimeDebugSummary.v3Readiness.sourceRuntimeFallbackFree, true, 'city plan debug should treat canonical-covered rooms as runtime-fallback-free');
    assert.strictEqual(invalidRuntimeDebugSummary.v3Readiness.readyForRuntimeFallbackDisable, true, 'city plan debug should not block runtime fallback disable once canonical source runtime coverage is complete and valid, even when legacy runtime storage diverges');
    assert.deepStrictEqual(invalidRuntimeDebugSummary.sourceRuntime.canonical.mismatchedSources, [], 'city plan debug should stop surfacing canonical-versus-legacy runtime mismatch once legacy runtime observation is removed');
    Memory.rooms.W1N1.cityPlanMigration = {
        updatedAt: 49,
        fromVersion: 2,
        toVersion: 4,
        changed: true,
        warnings: [],
        changes: {
            plannedStructuresAdded: 0,
            workPositionsAdded: 0,
            runtimeDefaultsAdded: 0,
            sourceRuntimeEntriesAdded: 0,
            legacyStoragePreserved: true
        }
    };
    const readyDebugSummary = buildCityPlanDebug('W1N1', {
        schemaVersion: CITY_PLAN_SCHEMA_VERSION,
        plannedStructures: [{
            id: 'source1:container',
            role: 'source_container',
            structureType: STRUCTURE_CONTAINER,
            pos: { x: 9, y: 10, roomName: 'W1N1' },
            scope: { sourceId: 'source1' },
            lifecycle: { state: 'active' }
        }],
        workPositions: {
            sources: {
                source1: {
                    mining: {
                        primary: { x: 9, y: 10, roomName: 'W1N1' }
                    }
                }
            },
            controller: {
                upgrade: {
                    primary: { x: 24, y: 25, roomName: 'W1N1' }
                }
            }
        },
        sourceRuntime: {
            sources: {
                source1: {
                    preferredOutputRole: 'source_container',
                    deliveryMode: 'container'
                }
            }
        },
        sources: {
            source1: {
                preferredOutputRole: 'source_container',
                deliveryMode: 'container'
            }
        }
    });
    assert.strictEqual(readyDebugSummary.migration.fromVersion, 2, 'city plan debug should surface the last observed city plan migration summary');
    assert.strictEqual(readyDebugSummary.v3Readiness.readyForFallbackDisable, true, 'city plan debug should mark rooms ready for fallback disable once migration is observed and no fallback remains');
    assert.strictEqual(readyDebugSummary.assetFallbackReadiness.controller_container.readyForDisable, true, 'city plan debug should mark controller-container asset fallback as snapshot-ready when migration is observed and no fallback remains');
    assert.strictEqual(readyDebugSummary.assetFallbackReadiness.source_container.readyForDisable, true, 'city plan debug should mark source-container asset fallback as snapshot-ready when migration is observed and no fallback remains');
    assert.strictEqual(readyDebugSummary.assetFallbackReadiness.controller_link.readyForDisable, true, 'city plan debug should mark controller-link asset fallback as snapshot-ready when migration is observed and no fallback remains');
    assert.strictEqual(readyDebugSummary.assetFallbackReadiness.source_link.readyForDisable, true, 'city plan debug should mark source-link asset fallback as snapshot-ready when migration is observed and no fallback remains');
    assert.strictEqual(readyDebugSummary.v3Readiness.assetFallbackFree, true, 'city plan debug should mark rooms without legacy asset fallback as asset-fallback-free');
    assert.strictEqual(readyDebugSummary.v3Readiness.assetFallbackObservationStable, false, 'city plan debug should not claim asset fallback observation stability before the service records a streak');
    assert.strictEqual(readyDebugSummary.v3Readiness.readyForAssetFallbackDisable, false, 'city plan debug should keep asset fallback disable gated until the observation streak is satisfied');
    assert.strictEqual(readyDebugSummary.sourceRuntime.canonical.totalSources, 1, 'city plan debug should report canonical source runtime storage coverage');
    assert.deepStrictEqual(readyDebugSummary.sourceRuntime.canonical.missingSources, [], 'city plan debug should report no missing canonical source runtime entries after migration');
    assert.deepStrictEqual(readyDebugSummary.sourceRuntime.canonical.fallbackSources, [], 'city plan debug should report no runtime fallback sources after canonical coverage is complete');
    assert.strictEqual(readyDebugSummary.v3Readiness.sourceRuntimeCanonicalComplete, true, 'city plan debug should mark rooms with full canonical runtime coverage as complete');
    assert.strictEqual(readyDebugSummary.v3Readiness.sourceRuntimeStorageConsistent, true, 'city plan debug should mark rooms with matching canonical and legacy runtime storage as consistent');
    assert.strictEqual(readyDebugSummary.v3Readiness.sourceRuntimeFallbackFree, true, 'city plan debug should mark rooms without runtime fallback as fallback-free');
    assert.strictEqual(readyDebugSummary.v3Readiness.readyForRuntimeFallbackDisable, true, 'city plan debug should mark rooms ready for runtime fallback disable when all runtime gates are satisfied');
    assert.deepStrictEqual(invalidRuntimeDebugSummary.sourceRuntime.invalidSources, [], 'city plan debug should not surface invalid runtime states when canonical source runtime storage is valid');
    assert.strictEqual(shouldParticipateInLogistics(cityPlan, activeSourceContainer), true, 'city asset policy should let active source containers participate in logistics');
    assert.strictEqual(shouldRepairAsset(cityPlan, activeSourceContainer), true, 'city asset policy should allow repairing active source containers');
    assert.strictEqual(shouldBuildAsset(cityPlan, activeSourceContainer), true, 'city asset policy should keep active planned assets buildable');
    const invalidCityPlan = {
        schemaVersion: 2,
        plannedStructures: [
            {
                id: 'dup',
                role: 'source_container',
                structureType: STRUCTURE_CONTAINER,
                pos: { x: 10, y: 10, roomName: 'W1N1' },
                lifecycle: { state: 'active' }
            },
            {
                id: 'dup',
                role: 'controller_container',
                structureType: STRUCTURE_CONTAINER,
                pos: { x: 11, y: 11, roomName: 'W1N1' },
                lifecycle: { state: 'unknown_state' }
            }
        ]
    };
    const invalidCityPlanValidation = validateCityPlan(invalidCityPlan);
    assert.strictEqual(invalidCityPlanValidation.valid, false, 'city plan schema should reject invalid asset ids and lifecycle states');
    assert.ok(invalidCityPlanValidation.errors.some((error) => error.includes('duplicate id')), 'city plan schema should report duplicate planned structure ids');
    assert.ok(invalidCityPlanValidation.errors.some((error) => error.includes('unknown_state')), 'city plan schema should report invalid lifecycle states');
    const invalidSourceWorkPositionValidation = validateCityPlan({
        schemaVersion: CITY_PLAN_SCHEMA_VERSION,
        workPositions: {
            sources: {
                source1: {
                    mining: {
                        primary: { x: 'bad', y: 10, roomName: 'W1N1' }
                    }
                }
            }
        },
        plannedStructures: []
    });
    assert.strictEqual(invalidSourceWorkPositionValidation.valid, false, 'city plan schema should reject invalid source mining work positions');
    assert.ok(invalidSourceWorkPositionValidation.errors.some((error) => error.includes('workPositions.sources.source1.mining.primary has invalid pos')), 'city plan schema should report invalid source mining work position paths');
    const invalidControllerWorkPositionValidation = validateCityPlan({
        schemaVersion: CITY_PLAN_SCHEMA_VERSION,
        workPositions: {
            controller: {
                upgrade: {
                    primary: { x: 24, y: null, roomName: 'W1N1' }
                }
            }
        },
        plannedStructures: []
    });
    assert.strictEqual(invalidControllerWorkPositionValidation.valid, false, 'city plan schema should reject invalid controller upgrade work positions');
    assert.ok(invalidControllerWorkPositionValidation.errors.some((error) => error.includes('workPositions.controller.upgrade.primary has invalid pos')), 'city plan schema should report invalid controller upgrade work position paths');
    const transitioningAsset = {
        id: 'asset:1',
        role: 'source_container',
        structureType: STRUCTURE_CONTAINER,
        pos: { x: 9, y: 10, roomName: 'W1N1' },
        lifecycle: { state: 'active' }
    };
    assert.strictEqual(transitionAssetLifecycle(transitioningAsset, 'retired_ready').valid, false, 'city plan schema should reject illegal lifecycle jumps');
    const legalTransition = transitionAssetLifecycle(transitioningAsset, 'link_primary');
    assert.strictEqual(legalTransition.valid, true, 'city plan schema should allow legal lifecycle transitions');
    assert.strictEqual(legalTransition.asset.lifecycle.state, 'link_primary', 'city plan schema should return the transitioned asset state');
    const canonicalControllerContainer = getControllerContainerAsset(cityPlan);
    const canonicalSourceContainer = getSourceContainerAsset(cityPlan, 'source1');
    assert.strictEqual(isControllerContainerAsset(cityPlan, { structureType: STRUCTURE_CONTAINER, pos: canonicalControllerContainer.pos }), true, 'legacy adapter should recognize controller container structures');
    assert.strictEqual(isSourceContainerAsset(cityPlan, { structureType: STRUCTURE_CONTAINER, pos: canonicalSourceContainer.pos }, 'source1'), true, 'legacy adapter should recognize source container structures by source id');
    assert.strictEqual(isSourceContainerAsset({
        sources: {
            source1: { containerPos: { x: 9, y: 10, roomName: 'W1N1' } }
        }
    }, { structureType: STRUCTURE_CONTAINER, pos: { x: 9, y: 10, roomName: 'W1N1' } }, null, { allowLegacyFallback: false }), false, 'legacy adapter strict source-container helper should not recognize legacy-only source containers');
    assert.strictEqual(isSourceContainerAsset(cityPlan, { structureType: STRUCTURE_CONTAINER, pos: canonicalSourceContainer.pos }, null, { allowLegacyFallback: false }), true, 'legacy adapter strict source-container helper should still recognize canonical planned source containers');
    const coreDefensePlan = defensePlanner.buildDefensePlan(cityRoom, cityPlan);
    assert.strictEqual(coreDefensePlan.mode, 'core_fortress', 'early defense planning should start in core fortress mode');
    assert.ok(coreDefensePlan.towers.length > 0, 'defense plan should own tower positions');
    assert.ok(coreDefensePlan.ramparts.some((entry) => entry.reason === 'spawn'), 'core fortress plan should protect the spawn with ramparts');
    assert.ok(coreDefensePlan.repairTargets.rampartHits > 0, 'defense plan should define repair targets');

    const containerSites = [];
    const previousRoomPosition = global.RoomPosition;
    global.RoomPosition = class RoomPosition {
        constructor(x, y, roomName) {
            this.x = x;
            this.y = y;
            this.roomName = roomName;
        }
        createConstructionSite(structureType) {
            containerSites.push({ x: this.x, y: this.y, roomName: this.roomName, structureType });
            return OK;
        }
    };
    Memory.rooms.W1N1.cityPlan = cityPlan;
    cityPlanner.placePlannedContainers(cityRoom, cityPlan);
    assert.ok(containerSites.some((site) => site.structureType === STRUCTURE_CONTAINER), 'city planner should create planned container sites');
    assert.ok(!containerSites.some((site) => site.structureType === STRUCTURE_TOWER), 'city planner should no longer place tower sites directly');
    const plannedStructureOnlyContainerPlan = JSON.parse(JSON.stringify(cityPlan));
    const canonicalContainerSites = [];
    global.RoomPosition = class RoomPosition {
        constructor(x, y, roomName) {
            this.x = x;
            this.y = y;
            this.roomName = roomName;
        }
        createConstructionSite(structureType) {
            canonicalContainerSites.push({ x: this.x, y: this.y, roomName: this.roomName, structureType });
            return OK;
        }
    };
    cityPlanner.placePlannedContainers(cityRoom, plannedStructureOnlyContainerPlan);
    assert.ok(canonicalContainerSites.some((site) => site.structureType === STRUCTURE_CONTAINER), 'city planner should place container sites from plannedStructures when legacy container positions are absent');
    global.RoomPosition = previousRoomPosition;

    const defenseSites = [];
    global.RoomPosition = class RoomPosition {
        constructor(x, y, roomName) {
            this.x = x;
            this.y = y;
            this.roomName = roomName;
        }
        createConstructionSite(structureType) {
            defenseSites.push({ x: this.x, y: this.y, roomName: this.roomName, structureType });
            return OK;
        }
    };
    Game.time = 100;
    Game.rooms.W1N1 = cityRoom;
    global.RoomCache = { W1N1: {} };
    defensePlanner.analyze();
    assert.ok(defenseSites.some((site) => site.structureType === STRUCTURE_TOWER), 'defense planner should place tower sites from the defense build queue');
    assert.ok(defenseSites.some((site) => site.structureType === STRUCTURE_RAMPART), 'defense planner should place rampart sites from the defense build queue');
    assert.ok(defenseSites.length <= Memory.rooms.W1N1.cityPlan.defense.buildLimitPerRun, 'defense planner should throttle site creation per planning pass');
    assert.ok(Memory.rooms.W1N1.cityPlan.plannedStructures.some((entry) => entry.role === 'defense_rampart' && entry.group === 'defense'), 'defense planner should sync planned rampart assets back into planned structures');
    Memory.rooms.W1N1.cityPlan.plannedStructures.push({
        id: 'defense:rampart:stale',
        role: 'defense_rampart',
        structureType: STRUCTURE_RAMPART,
        pos: { x: 30, y: 30, roomName: 'W1N1' },
        phase: 'defense_shell',
        group: 'defense',
        lifecycle: { state: 'active', activeFromRcl: 2 }
    });
    defensePlanner.syncDefensePlannedStructures(Memory.rooms.W1N1.cityPlan, Memory.rooms.W1N1.cityPlan.defense);
    const staleDefenseRampart = Memory.rooms.W1N1.cityPlan.plannedStructures.find((entry) => entry.id === 'defense:rampart:stale');
    assert.strictEqual(staleDefenseRampart.lifecycle.state, 'low_priority', 'defense planner should downgrade stale defense ramparts that are no longer protected');
    global.RoomPosition = previousRoomPosition;

    const assetRoom = {
        name: 'W1N1',
        controller: { id: 'controller1', my: true, level: 6, pos: { x: 25, y: 25, roomName: 'W1N1' } },
        storage: { id: 'storage1', pos: { x: 20, y: 20, roomName: 'W1N1' }, store: { getUsedCapacity: () => 20000 } },
        find: (type) => {
            if (type === FIND_MY_SPAWNS) return [spawnForPlan];
            if (type === FIND_SOURCES) return [sourceForPlan];
            if (type === FIND_MINERALS) return [mineralForPlan];
            if (type === FIND_STRUCTURES) {
                return [
                    spawnForPlan,
                    { id: 'sourceContainer1', structureType: STRUCTURE_CONTAINER, pos: { x: 11, y: 10, roomName: 'W1N1' } },
                    { id: 'controllerContainer1', structureType: STRUCTURE_CONTAINER, pos: { x: 24, y: 25, roomName: 'W1N1' } },
                    { id: 'tower1', structureType: STRUCTURE_TOWER, pos: { x: 17, y: 12, roomName: 'W1N1' }, store: { getUsedCapacity: () => 1000 } },
                    { id: 'tower2', structureType: STRUCTURE_TOWER, pos: { x: 12, y: 17, roomName: 'W1N1' }, store: { getUsedCapacity: () => 1000 } }
                ];
            }
            if (type === FIND_CONSTRUCTION_SITES) return [];
            return [];
        }
    };
    const assetPlan = cityPlanner.buildCityPlan(assetRoom, firstCenter);
    assert.strictEqual(assetPlan.sources.source1.linkPos, undefined, 'RCL5+ plans should stop publishing legacy source link compatibility storage');
    assert.strictEqual(assetPlan.controller.linkPos, undefined, 'RCL5+ plans should stop publishing legacy controller link compatibility storage');
    assert.deepStrictEqual(assetPlan.sourceRuntime.sources.source1, {
        preferredOutputRole: 'source_link',
        deliveryMode: 'transition'
    }, 'RCL5+ plans should mark source logistics as transitional in canonical source runtime storage before lifecycle switching is active');
    assert.strictEqual(assetPlan.sources.source1.preferredOutputRole, undefined, 'RCL5+ plans should not publish legacy source runtime output-role compatibility fields');
    assert.strictEqual(assetPlan.sources.source1.deliveryMode, undefined, 'RCL5+ plans should not publish legacy source runtime delivery-mode compatibility fields');
    assert.ok(assetPlan.hub && assetPlan.hub.storagePos, 'RCL5+ plans should publish hub storage coordinates');
    assert.ok(assetPlan.hub && assetPlan.hub.linkPos, 'RCL5+ plans should publish a hub link coordinate once links unlock');
    assert.ok(assetPlan.plannedStructures.some((entry) => entry.role === 'source_link' && entry.structureType === STRUCTURE_LINK), 'RCL5+ plans should publish source links in planned structures');
    assert.ok(assetPlan.plannedStructures.some((entry) => entry.role === 'controller_link' && entry.structureType === STRUCTURE_LINK), 'RCL5+ plans should publish controller links in planned structures');
    assert.ok(assetPlan.plannedStructures.some((entry) => entry.role === 'hub_link' && entry.structureType === STRUCTURE_LINK), 'RCL5+ plans should publish a hub link in planned structures');
    assert.ok(assetPlan.plannedStructures.some((entry) => entry.role === 'hub_terminal' && entry.structureType === STRUCTURE_TERMINAL), 'RCL6+ plans should publish a terminal asset in planned structures');
    assert.ok(assetPlan.plannedStructures.some((entry) => entry.role === 'hub_lab' && entry.structureType === STRUCTURE_LAB), 'RCL6+ plans should publish lab assets in planned structures');
    assert.ok(assetPlan.plannedStructures.some((entry) => entry.role === 'mineral_extractor' && entry.structureType === STRUCTURE_EXTRACTOR), 'RCL6+ plans should publish extractor assets in planned structures');
    assert.ok(getPlannedStructuresByGroup(assetPlan, 'industry').length > 0, 'city plan helpers should expose grouped industry assets');
    assert.ok(getPlannedStructuresByPhase(assetPlan, 'industry').length > 0, 'city plan helpers should expose late-phase assets by phase');
    const canonicalSourceLink = getActivePlannedStructure(assetPlan, 'source_link', { sourceId: 'source1' });
    const canonicalControllerLink = getActivePlannedStructure(assetPlan, 'controller_link');
    assert.strictEqual(canonicalSourceLink.lifecycle.activeFromRcl, 5, 'link structures should carry their activation threshold');
    assert.strictEqual(resolveControllerLinkAsset(assetPlan).source, 'planned', 'legacy adapter should report planned source when planned controller link exists');
    assert.strictEqual(resolveSourceLinkAsset(assetPlan, 'source1').source, 'planned', 'legacy adapter should report planned source when planned source link exists');
    assert.strictEqual(isControllerLinkAsset(assetPlan, { structureType: STRUCTURE_LINK, pos: canonicalControllerLink.pos }), true, 'legacy adapter should recognize controller link structures');
    assert.strictEqual(isSourceLinkAsset(assetPlan, { structureType: STRUCTURE_LINK, pos: canonicalSourceLink.pos }, 'source1'), true, 'legacy adapter should recognize source link structures by source id');
    const assetDefensePlan = defensePlanner.buildDefensePlan(assetRoom, assetPlan);
    assert.strictEqual(assetDefensePlan.mode, 'asset_protection', 'mid-game defense should activate asset protection mode');
    assert.ok(assetDefensePlan.ramparts.some((entry) => entry.reason === 'source_container'), 'asset protection should include source container ramparts');
    const plannedStructureOnlyAssetPlan = JSON.parse(JSON.stringify(assetPlan));
    const plannedStructureOnlyAssetDefensePlan = defensePlanner.buildDefensePlan(assetRoom, plannedStructureOnlyAssetPlan);
    assert.ok(plannedStructureOnlyAssetDefensePlan.ramparts.some((entry) => entry.reason === 'source_container'), 'asset protection should still include source container ramparts when legacy source container positions are absent');
    assert.ok(plannedStructureOnlyAssetDefensePlan.ramparts.some((entry) => entry.reason === 'controller_container'), 'asset protection should still include controller container ramparts when legacy controller container positions are absent');

    const linkSites = [];
    global.RoomPosition = class RoomPosition {
        constructor(x, y, roomName) {
            this.x = x;
            this.y = y;
            this.roomName = roomName;
        }
        createConstructionSite(structureType) {
            linkSites.push({ x: this.x, y: this.y, roomName: this.roomName, structureType });
            return OK;
        }
    };
    cityPlanner.placePlannedLinks(assetRoom, assetPlan);
    assert.ok(linkSites.some((site) => site.structureType === STRUCTURE_LINK), 'city planner should place planned link sites once links are unlocked');
    const plannedStructureOnlyLinkPlan = JSON.parse(JSON.stringify(assetPlan));
    const canonicalLinkSites = [];
    global.RoomPosition = class RoomPosition {
        constructor(x, y, roomName) {
            this.x = x;
            this.y = y;
            this.roomName = roomName;
        }
        createConstructionSite(structureType) {
            canonicalLinkSites.push({ x: this.x, y: this.y, roomName: this.roomName, structureType });
            return OK;
        }
    };
    cityPlanner.placePlannedLinks(assetRoom, plannedStructureOnlyLinkPlan);
    assert.ok(canonicalLinkSites.some((site) => site.structureType === STRUCTURE_LINK), 'city planner should place link sites from plannedStructures when legacy link positions are absent');
    global.RoomPosition = previousRoomPosition;

    const linkService = new LinkService('Link');
    const sourceLinkStructure = {
        id: 'sourceLink1',
        structureType: STRUCTURE_LINK,
        pos: canonicalSourceLink.pos,
        store: {
            getUsedCapacity: () => 600,
            getFreeCapacity: () => 200
        },
        transferEnergy(target) {
            this.lastTransferTarget = target.id;
            return OK;
        }
    };
    const controllerLinkStructure = {
        id: 'controllerLink1',
        structureType: STRUCTURE_LINK,
        pos: canonicalControllerLink.pos,
        store: {
            getUsedCapacity: () => 100,
            getFreeCapacity: () => 700
        }
    };
    Memory.rooms.W1N1.cityPlan = {
        controller: {
            linkPos: { x: 24, y: 24, roomName: 'W1N1' }
        },
        sources: {},
        plannedStructures: []
    };
    Game.rooms = {
        W1N1: {
            ...assetRoom,
            find: (type) => {
                if (type === FIND_STRUCTURES) {
                    return assetRoom.find(type).concat([controllerLinkStructure]);
                }
                return assetRoom.find(type);
            }
        }
    };
    linkService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.linkNetwork.controller.linkId, null, 'link service should not treat legacy-only controller links as canonical during strict rollout');
    Memory.rooms.W1N1.cityPlan = {
        controller: {
            linkPos: canonicalControllerLink.pos
        },
        sources: {
            source1: {
                linkPos: canonicalSourceLink.pos,
                preferredOutputRole: 'source_link',
                deliveryMode: 'link_primary'
            }
        },
        plannedStructures: [{
            id: 'controller:link',
            role: 'controller_link',
            structureType: STRUCTURE_LINK,
            pos: canonicalControllerLink.pos,
            lifecycle: { state: 'active', activeFromRcl: 5 }
        }]
    };
    delete Memory.rooms.W1N1.linkNetwork;
    Game.rooms = {
        W1N1: {
            ...assetRoom,
            find: (type) => {
                if (type === FIND_STRUCTURES) {
                    return assetRoom.find(type).concat([sourceLinkStructure, controllerLinkStructure]);
                }
                return assetRoom.find(type);
            }
        }
    };
    linkService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.linkNetwork.sources.source1, undefined, 'link service should not treat legacy-only source links as canonical during the first source_link strict rollout');
    Memory.rooms.W1N1.cityPlan = JSON.parse(JSON.stringify(assetPlan));
    Memory.rooms.W1N1.cityPlan.sourceRuntime = {
        sources: {
            source1: {
                preferredOutputRole: 'source_link',
                deliveryMode: 'transition'
            }
        }
    };
    delete Memory.rooms.W1N1.linkNetwork;
    Game.rooms = {
        W1N1: {
            ...assetRoom,
            find: (type) => {
                if (type === FIND_STRUCTURES) {
                    return assetRoom.find(type).concat([sourceLinkStructure, controllerLinkStructure]);
                }
                return assetRoom.find(type);
            }
        }
    };
    Game.getObjectById = (id) => {
        if (id === 'source1') return sourceForPlan;
        if (id === 'sourceLink1') return sourceLinkStructure;
        if (id === 'controllerLink1') return controllerLinkStructure;
        return null;
    };
    global.RoomPhase = { W1N1: { energyPosture: 'normal' } };
    linkService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.sources.source1.deliveryMode, undefined, 'link service should not reintroduce legacy source delivery-mode compatibility fields once planner output is canonical-only');
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.sources.source1.preferredOutputRole, undefined, 'link service should not reintroduce legacy source output-role compatibility fields once planner output is canonical-only');
    assert.deepStrictEqual(Memory.rooms.W1N1.cityPlan.sourceRuntime.sources.source1, {
        preferredOutputRole: 'source_link',
        deliveryMode: 'link_primary'
    }, 'link service should promote canonical source runtime storage once source and controller links are online');
    assert.ok(Memory.rooms.W1N1.linkNetwork, 'link service should publish link network health in room memory');
    assert.strictEqual(Memory.rooms.W1N1.linkNetwork.sources.source1.mode, 'link_primary', 'link network health should record source link mode');
    assert.strictEqual(Memory.rooms.W1N1.linkNetwork.sources.source1.linkId, 'sourceLink1', 'link network health should record the active source link id');
    assert.strictEqual(Memory.rooms.W1N1.linkNetwork.sources.source1.stableTicks, 1, 'link network health should start counting stable link ticks once the path is online');
    assert.strictEqual(Memory.rooms.W1N1.linkNetwork.controller.linkId, 'controllerLink1', 'link network health should record the controller link id');
    assert.strictEqual(Memory.rooms.W1N1.linkNetwork.controller.underfilledTicks, 1, 'link network health should track controller link underfill pressure');
    assert.strictEqual(Memory.rooms.W1N1.linkNetwork.controller.stableTicks, 1, 'link network health should track controller link stability once the controller path is online');
    const sourceContainerStructure = Memory.rooms.W1N1.cityPlan.plannedStructures.find((entry) => entry.role === 'source_container');
    const controllerContainerStructure = Memory.rooms.W1N1.cityPlan.plannedStructures.find((entry) => entry.role === 'controller_container');
    assert.strictEqual(sourceContainerStructure.lifecycle.state, 'link_primary', 'link service should first move the source container lifecycle into link-primary observation before retirement');
    assert.strictEqual(controllerContainerStructure.lifecycle.state, 'link_primary', 'link service should move the controller container into link-primary observation before retirement');
    linkService.run();
    assert.strictEqual(sourceLinkStructure.lastTransferTarget, 'controllerLink1', 'link service should transfer source link energy into the controller link while the controller buffer is underfilled');
    assert.ok(Memory.rooms.W1N1.linkNetwork.sources.source1.lastTransferAt > 0, 'link network health should remember the last successful source-link transfer');
    const secondSourceLinkStructure = {
        id: 'sourceLink2',
        structureType: STRUCTURE_LINK,
        pos: { x: 12, y: 10, roomName: 'W1N1' },
        cooldown: 0,
        store: {
            getUsedCapacity: () => 700,
            getFreeCapacity: () => 100
        },
        transferEnergy(target) {
            this.lastTransferTarget = target.id;
            return OK;
        }
    };
    Memory.rooms.W1N1.cityPlan.sources.source2 = {
        linkPos: { x: 12, y: 10, roomName: 'W1N1' },
        preferredOutputRole: 'source_link',
        deliveryMode: 'link_primary'
    };
    Memory.rooms.W1N1.cityPlan.sourceRuntime.sources.source2 = {
        preferredOutputRole: 'source_link',
        deliveryMode: 'link_primary'
    };
    Memory.rooms.W1N1.cityPlan.plannedStructures.push({
        id: 'source2:link',
        role: 'source_link',
        structureType: STRUCTURE_LINK,
        pos: { x: 12, y: 10, roomName: 'W1N1' },
        scope: { sourceId: 'source2' },
        lifecycle: { state: 'planned', activeFromRcl: 5 }
    });
    sourceLinkStructure.cooldown = 1;
    sourceLinkStructure.lastTransferTarget = null;
    Game.rooms.W1N1 = {
        ...Game.rooms.W1N1,
        find: (type) => {
            if (type === FIND_STRUCTURES) {
                return assetRoom.find(type).concat([sourceLinkStructure, controllerLinkStructure, secondSourceLinkStructure]);
            }
            return assetRoom.find(type);
        }
    };
    Game.getObjectById = (id) => {
        if (id === 'source1') return sourceForPlan;
        if (id === 'source2') return { id, pos: { x: 12, y: 9, roomName: 'W1N1' } };
        if (id === 'sourceLink1') return sourceLinkStructure;
        if (id === 'sourceLink2') return secondSourceLinkStructure;
        if (id === 'controllerLink1') return controllerLinkStructure;
        return null;
    };
    Memory.rooms.W1N1.linkNetwork.sources.source1.stableTicks = 1499;
    Memory.rooms.W1N1.linkNetwork.sources.source2 = {
        mode: 'link_primary',
        linkId: 'sourceLink2',
        linkEnergy: 700,
        stableTicks: 1499,
        transferFailures: 0,
        fallbackContainerUsed: false,
        lastTransferAt: 0
    };
    Memory.rooms.W1N1.linkNetwork.controller.stableTicks = 1499;
    linkService.analyze();
    assert.strictEqual(sourceContainerStructure.lifecycle.state, 'retiring', 'link service should only retire the source container after the source link has stayed healthy through the observation window');
    assert.strictEqual(controllerContainerStructure.lifecycle.state, 'retiring', 'link service should only retire the controller container after the controller link has stayed healthy through the observation window');
    linkService.run();
    assert.strictEqual(sourceLinkStructure.lastTransferTarget, null, 'link service should not use source links that are cooling down');
    assert.strictEqual(secondSourceLinkStructure.lastTransferTarget, 'controllerLink1', 'link service should choose another ready source link when the first one is cooling down');
    sourceContainerStructure.lifecycle.state = 'low_priority';
    controllerContainerStructure.lifecycle.state = 'low_priority';
    Memory.rooms.W1N1.linkNetwork.sources.source1.stableTicks = 0;
    Memory.rooms.W1N1.linkNetwork.controller.stableTicks = 0;
    sourceLinkStructure.cooldown = 0;
    secondSourceLinkStructure.lastTransferTarget = null;
    linkService.analyze();
    assert.strictEqual(sourceContainerStructure.lifecycle.state, 'low_priority', 'link service should refuse illegal lifecycle rewinds when schema rejects source-container transitions');
    assert.strictEqual(controllerContainerStructure.lifecycle.state, 'low_priority', 'link service should refuse illegal lifecycle rewinds when schema rejects controller-container transitions');
    assert.ok(Array.isArray(Memory.rooms.W1N1.cityPlanTransitionFailures), 'link service should record lifecycle transition failures in room memory');
    assert.ok(Memory.rooms.W1N1.cityPlanTransitionFailures.some((failure) => {
        return failure.service === 'LinkService' &&
            failure.role === 'source_container' &&
            failure.to === 'link_primary';
    }), 'link service should record rejected source-container lifecycle rewinds for debugging');
    Memory.rooms.W1N1.cityPlan = {
        controller: {
            containerPos: { x: 24, y: 25, roomName: 'W1N1' },
            linkPos: { x: 24, y: 24, roomName: 'W1N1' }
        },
        sources: {},
        plannedStructures: []
    };
    Memory.rooms.W1N1.linkNetwork.controller.stableTicks = 1;
    const controllerTransitionFailureCount = Memory.rooms.W1N1.cityPlanTransitionFailures.filter((failure) => {
        return failure.service === 'LinkService' &&
            failure.role === 'controller_container' &&
            failure.to === 'link_primary';
    }).length;
    linkService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.plannedStructures.length, 0, 'link service should not materialize or mutate legacy-only controller containers when strict resolution is enabled');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanTransitionFailures.filter((failure) => {
        return failure.service === 'LinkService' &&
            failure.role === 'controller_container' &&
            failure.to === 'link_primary';
    }).length, controllerTransitionFailureCount, 'link service should skip controller-container lifecycle transitions when only legacy compatibility storage exists');
    Memory.rooms.W1N1.cityPlan = {
        controller: {},
        sources: {
            source1: {
                containerPos: { x: 10, y: 10, roomName: 'W1N1' },
                preferredOutputRole: 'source_link',
                deliveryMode: 'link_primary'
            }
        },
        plannedStructures: []
    };
    Memory.rooms.W1N1.linkNetwork.sources.source1 = {
        mode: 'link_primary',
        linkId: 'sourceLink1',
        linkEnergy: 700,
        stableTicks: 1500,
        transferFailures: 0,
        fallbackContainerUsed: false,
        lastTransferAt: 0
    };
    const sourceTransitionFailureCount = Memory.rooms.W1N1.cityPlanTransitionFailures.filter((failure) => {
        return failure.service === 'LinkService' &&
            failure.role === 'source_container' &&
            failure.to === 'link_primary';
    }).length;
    linkService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.plannedStructures.length, 0, 'link service should not materialize or mutate legacy-only source containers during the first strict source_container rollout');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanTransitionFailures.filter((failure) => {
        return failure.service === 'LinkService' &&
            failure.role === 'source_container' &&
            failure.to === 'link_primary';
    }).length, sourceTransitionFailureCount, 'link service should skip source-container lifecycle transitions when only legacy compatibility storage exists');
    Memory.rooms.W1N1 = {
        cityPlan: {
            controller: {
                linkPos: assetPlan.controller.linkPos
            },
            sourceRuntime: {
                sources: {}
            },
            sources: {
                source1: {
                    linkPos: assetPlan.sources.source1.linkPos,
                    preferredOutputRole: 'source_link',
                    deliveryMode: 'link_primary'
                }
            },
            plannedStructures: [{
                id: 'source1:link',
                role: 'source_link',
                structureType: STRUCTURE_LINK,
                pos: assetPlan.sources.source1.linkPos,
                scope: { sourceId: 'source1' },
                lifecycle: { state: 'planned', activeFromRcl: 5 }
            }, {
                id: 'controller:link',
                role: 'controller_link',
                structureType: STRUCTURE_LINK,
                pos: assetPlan.controller.linkPos,
                lifecycle: { state: 'planned', activeFromRcl: 5 }
            }]
        },
        cityPlanRuntimeObservation: {
            readyStreak: 2,
            readyForRuntimeFallbackDisable: false
        }
    };
    delete Memory.rooms.W1N1.linkNetwork;
    sourceLinkStructure.lastTransferTarget = null;
    Game.rooms = {
        W1N1: {
            ...assetRoom,
            find: (type) => {
                if (type === FIND_STRUCTURES) {
                    return assetRoom.find(type).concat([sourceLinkStructure, controllerLinkStructure]);
                }
                return assetRoom.find(type);
            }
        }
    };
    linkService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.linkNetwork.sources.source1, undefined, 'link service should stop treating legacy-only source runtime storage as link output even before the runtime fallback-disable streak is satisfied');
    linkService.run();
    assert.strictEqual(sourceLinkStructure.lastTransferTarget, null, 'link service should stop source-link transfers when only legacy source runtime storage exists, even before the runtime fallback-disable streak is satisfied');
    Memory.rooms.W1N1 = {
        cityPlan: {
            controller: {
                linkPos: assetPlan.controller.linkPos
            },
            sourceRuntime: {
                sources: {}
            },
            sources: {
                source1: {
                    linkPos: assetPlan.sources.source1.linkPos,
                    preferredOutputRole: 'source_link',
                    deliveryMode: 'link_primary'
                }
            },
            plannedStructures: [{
                id: 'source1:link',
                role: 'source_link',
                structureType: STRUCTURE_LINK,
                pos: assetPlan.sources.source1.linkPos,
                scope: { sourceId: 'source1' },
                lifecycle: { state: 'planned', activeFromRcl: 5 }
            }, {
                id: 'controller:link',
                role: 'controller_link',
                structureType: STRUCTURE_LINK,
                pos: assetPlan.controller.linkPos,
                lifecycle: { state: 'planned', activeFromRcl: 5 }
            }]
        },
        cityPlanRuntimeObservation: {
            readyStreak: 3,
            readyForRuntimeFallbackDisable: true
        }
    };
    delete Memory.rooms.W1N1.linkNetwork;
    sourceLinkStructure.lastTransferTarget = null;
    linkService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.linkNetwork.sources.source1, undefined, 'link service should stop treating legacy-only source runtime storage as link output once the runtime fallback-disable streak is satisfied');
    linkService.run();
    assert.strictEqual(sourceLinkStructure.lastTransferTarget, null, 'link service should stop source-link transfers for legacy-only source runtime storage once strict runtime reads are enabled');

    const territorialRoom = {
        name: 'W1N1',
        controller: { id: 'controller1', my: true, level: 8, pos: { x: 25, y: 25, roomName: 'W1N1' } },
        storage: { id: 'storage1', pos: { x: 20, y: 20, roomName: 'W1N1' }, store: { getUsedCapacity: () => 100000 } },
        find: (type) => {
            if (type === FIND_MY_SPAWNS) return [spawnForPlan];
            if (type === FIND_SOURCES) return [sourceForPlan];
            if (type === FIND_STRUCTURES) {
                return [
                    spawnForPlan,
                    { id: 'tower1', structureType: STRUCTURE_TOWER, pos: { x: 17, y: 12, roomName: 'W1N1' }, store: { getUsedCapacity: () => 1000 } },
                    { id: 'tower2', structureType: STRUCTURE_TOWER, pos: { x: 12, y: 17, roomName: 'W1N1' }, store: { getUsedCapacity: () => 1000 } },
                    { id: 'tower3', structureType: STRUCTURE_TOWER, pos: { x: 18, y: 18, roomName: 'W1N1' }, store: { getUsedCapacity: () => 1000 } }
                ];
            }
            if (type === FIND_CONSTRUCTION_SITES) return [];
            return [];
        }
    };
    const territorialPlan = cityPlanner.buildCityPlan(territorialRoom, firstCenter);
    const territorialDefensePlan = defensePlanner.buildDefensePlan(territorialRoom, territorialPlan);
    assert.strictEqual(territorialDefensePlan.mode, 'territorial_gate', 'late-game defense should expand to territorial gate mode');
    assert.ok(territorialDefensePlan.gates.length > 0, 'territorial defense should plan gate positions');
    assert.ok(territorialDefensePlan.chokes.length > 0, 'territorial defense should identify choke anchors');

    const maintenancePlanner = new MaintenancePlannerService('MaintenancePlanner');
    const maintenanceStructures = [
        { id: 'spawnDamaged', structureType: STRUCTURE_SPAWN, hits: 3500, hitsMax: 5000, pos: { x: 15, y: 15, roomName: 'W1N1' } },
        { id: 'mainRoad', structureType: STRUCTURE_ROAD, hits: 1200, hitsMax: 5000, pos: { x: 16, y: 15, roomName: 'W1N1' } },
        { id: 'healthyRoad', structureType: STRUCTURE_ROAD, hits: 3400, hitsMax: 5000, pos: { x: 16, y: 16, roomName: 'W1N1' } },
        { id: 'sourceContainer1', structureType: STRUCTURE_CONTAINER, hits: 90000, hitsMax: 250000, pos: { x: 9, y: 10, roomName: 'W1N1' }, store: { getUsedCapacity: () => 500 } },
        { id: 'controllerContainer1', structureType: STRUCTURE_CONTAINER, hits: 90000, hitsMax: 250000, pos: { x: 24, y: 25, roomName: 'W1N1' }, store: { getUsedCapacity: () => 500 } },
        { id: 'terminal1', structureType: STRUCTURE_TERMINAL, hits: 2000, hitsMax: 3000, pos: { x: 20, y: 20, roomName: 'W1N1' }, store: { getUsedCapacity: () => 1000 } },
        { id: 'extractor1', structureType: STRUCTURE_EXTRACTOR, hits: 300, hitsMax: 500, pos: { x: 22, y: 22, roomName: 'W1N1' } },
        { id: 'rampartEmergency', structureType: STRUCTURE_RAMPART, hits: 800, hitsMax: 300000000, pos: { x: 17, y: 15, roomName: 'W1N1' } },
        { id: 'wallRoutine', structureType: STRUCTURE_WALL, hits: 3000, hitsMax: 300000000, pos: { x: 18, y: 15, roomName: 'W1N1' } }
    ];
    const maintenanceRoom = {
        name: 'W1N1',
        controller: { id: 'controller1', my: true, level: 6, pos: { x: 25, y: 25, roomName: 'W1N1' } },
        storage: { id: 'storage1', pos: { x: 20, y: 20, roomName: 'W1N1' }, store: { getUsedCapacity: () => 30000 } },
        find: (type) => {
            if (type === FIND_MY_SPAWNS) return [spawnForPlan];
            if (type === FIND_SOURCES) return [sourceForPlan];
            if (type === FIND_STRUCTURES) return maintenanceStructures;
            if (type === FIND_CONSTRUCTION_SITES) return [];
            return [];
        }
    };
    Memory.rooms.W1N1.cityPlan = {
        ...assetPlan,
        defense: {
            repairTargets: {
                rampartHits: 100000,
                wallHits: 50000
            }
        }
    };
    const maintenancePlan = maintenancePlanner.buildMaintenancePlan(maintenanceRoom, Memory.rooms.W1N1.cityPlan);
    assert.strictEqual(maintenancePlan.version, 1, 'maintenance plan should be versioned');
    assert.ok(maintenancePlan.targets.some((target) => target.id === 'spawnDamaged' && target.repairClass === 'core'), 'maintenance plan should include damaged core structures');
    assert.ok(maintenancePlan.targets.some((target) => {
        return target.id === 'mainRoad' &&
            target.repairClass === 'economic' &&
            target.targetHits === 4500 &&
            target.repairBelow === 3250;
    }), 'maintenance plan should include roads below the newer repair band and repair them closer to full health');
    assert.ok(!maintenancePlan.targets.some((target) => target.id === 'healthyRoad'), 'maintenance plan should skip roads that remain above the newer repair band');
    assert.ok(maintenancePlan.targets.some((target) => {
        return target.id === 'sourceContainer1' &&
            target.repairClass === 'decay' &&
            target.targetHits === 237500 &&
            target.repairBelow === 187500;
    }), 'maintenance plan should include source and controller containers below the newer repair band and repair them near full health');
    assert.ok(maintenancePlan.targets.some((target) => target.id === 'rampartEmergency' && target.executor === 'tower'), 'maintenance plan should route emergency rampart repair to towers');
    assert.ok(maintenancePlan.targets.some((target) => target.id === 'wallRoutine' && target.repairClass === 'defense'), 'maintenance plan should include walls with defense targets');
    assert.strictEqual(maintenancePlan.targets[0].id, 'rampartEmergency', 'maintenance plan should sort urgent defense emergencies first');

    const compatibilityMaintenancePlan = maintenancePlanner.buildMaintenancePlan(maintenanceRoom, {
        plannedStructures: [
            {
                id: 'source1:container',
                role: 'source_container',
                structureType: STRUCTURE_CONTAINER,
                pos: { x: 9, y: 10, roomName: 'W1N1' },
                scope: { sourceId: 'source1' },
                lifecycle: { state: 'active', activeFromRcl: 1, activeUntilRcl: 5 }
            },
            {
                id: 'controller:container',
                role: 'controller_container',
                structureType: STRUCTURE_CONTAINER,
                pos: { x: 24, y: 25, roomName: 'W1N1' },
                lifecycle: { state: 'active', activeFromRcl: 1 }
            }
        ]
    });
    assert.ok(compatibilityMaintenancePlan.targets.some((target) => {
        return target.id === 'sourceContainer1' &&
            target.reason === 'source_container' &&
            target.repairClass === 'decay';
    }), 'maintenance planner should classify source containers through plannedStructures when legacy cityPlan fields are absent');
    assert.strictEqual(getSourceContainerAsset({
        sources: {
            source1: { containerPos: { x: 9, y: 10, roomName: 'W1N1' } }
        }
    }, 'source1'), null, 'legacy adapter should default source-container getters to canonical planned assets only when planned assets are absent');
    assert.strictEqual(getSourceContainerAsset({
        sources: {
            source1: { containerPos: { x: 9, y: 10, roomName: 'W1N1' } }
        }
    }, 'source1', { allowLegacyFallback: true }), null, 'legacy adapter should ignore explicit compat fallback getter requests when only legacy source-container storage exists');
    const legacyOnlySourceMaintenancePlan = maintenancePlanner.buildMaintenancePlan(maintenanceRoom, {
        sources: {
            source1: {
                containerPos: { x: 9, y: 10, roomName: 'W1N1' }
            }
        }
    });
    assert.ok(!legacyOnlySourceMaintenancePlan.targets.some((target) => {
        return target.id === 'sourceContainer1' &&
            (target.reason === 'source_container' || target.reason === 'source_container_link_primary');
    }), 'maintenance planner should not classify legacy-only source containers as canonical source_container assets during strict rollout');
    const retiringMaintenancePlan = maintenancePlanner.buildMaintenancePlan(maintenanceRoom, {
        plannedStructures: [{
            id: 'source1:container',
            role: 'source_container',
            structureType: STRUCTURE_CONTAINER,
            pos: { x: 9, y: 10, roomName: 'W1N1' },
            scope: { sourceId: 'source1' },
            lifecycle: { state: 'retiring', activeFromRcl: 1, activeUntilRcl: 5, replacement: 'source1:link' }
        }]
    });
    assert.ok(retiringMaintenancePlan.targets.some((target) => {
        return target.id === 'sourceContainer1' &&
            target.reason === 'source_container_retiring' &&
            target.targetHits === 225000 &&
            target.repairBelow === 162500;
    }), 'maintenance planner should downgrade retiring source containers instead of keeping them on the active high-priority repair band');
    const linkPrimaryMaintenancePlan = maintenancePlanner.buildMaintenancePlan(maintenanceRoom, {
        plannedStructures: [{
            id: 'source1:container',
            role: 'source_container',
            structureType: STRUCTURE_CONTAINER,
            pos: { x: 9, y: 10, roomName: 'W1N1' },
            scope: { sourceId: 'source1' },
            lifecycle: { state: 'link_primary', activeFromRcl: 1, activeUntilRcl: 5, replacement: 'source1:link' }
        }]
    });
    assert.ok(linkPrimaryMaintenancePlan.targets.some((target) => {
        return target.id === 'sourceContainer1' &&
            target.reason === 'source_container_link_primary' &&
            target.targetHits === 230000 &&
            target.repairBelow === 175000;
    }), 'maintenance planner should keep link-primary source containers on a lighter fallback repair band');
    assert.strictEqual(getMaintenancePolicy({
        plannedStructures: [{
            id: 'source1:container',
            role: 'source_container',
            structureType: STRUCTURE_CONTAINER,
            pos: { x: 9, y: 10, roomName: 'W1N1' },
            scope: { sourceId: 'source1' },
            lifecycle: { state: 'link_primary', activeFromRcl: 1, activeUntilRcl: 5, replacement: 'source1:link' }
        }]
    }, maintenanceStructures.find((structure) => structure.id === 'sourceContainer1')).targetRatio, 0.92, 'city asset policy should expose lighter repair ratios for link-primary source containers');
    const retiredReadyMaintenancePlan = maintenancePlanner.buildMaintenancePlan(maintenanceRoom, {
        plannedStructures: [{
            id: 'source1:container',
            role: 'source_container',
            structureType: STRUCTURE_CONTAINER,
            pos: { x: 9, y: 10, roomName: 'W1N1' },
            scope: { sourceId: 'source1' },
            lifecycle: { state: 'retired_ready', activeFromRcl: 1, activeUntilRcl: 5, replacement: 'source1:link' }
        }]
    });
    assert.ok(!retiredReadyMaintenancePlan.targets.some((target) => target.id === 'sourceContainer1'), 'maintenance planner should stop repairing retired-ready source containers');
    const linkPrimaryControllerMaintenancePlan = maintenancePlanner.buildMaintenancePlan(maintenanceRoom, {
        plannedStructures: [{
            id: 'controller:container',
            role: 'controller_container',
            structureType: STRUCTURE_CONTAINER,
            pos: { x: 24, y: 25, roomName: 'W1N1' },
            lifecycle: { state: 'link_primary', activeFromRcl: 1, replacement: 'controller:link' }
        }]
    });
    assert.ok(linkPrimaryControllerMaintenancePlan.targets.some((target) => {
        return target.id === 'controllerContainer1' &&
            target.reason === 'controller_container_link_primary' &&
            target.targetHits === 230000 &&
            target.repairBelow === 175000;
    }), 'maintenance planner should keep controller containers on a lighter fallback repair band during link-primary transition');
    const legacyOnlyControllerMaintenancePlan = maintenancePlanner.buildMaintenancePlan(maintenanceRoom, {
        controller: {
            containerPos: { x: 24, y: 25, roomName: 'W1N1' }
        }
    });
    assert.ok(!legacyOnlyControllerMaintenancePlan.targets.some((target) => {
        return target.id === 'controllerContainer1' &&
            (target.reason === 'controller_container' || target.reason === 'controller_container_link_primary');
    }), 'maintenance planner should not classify legacy-only controller containers as canonical controller_container assets during strict rollout');
    const retiredReadyControllerMaintenancePlan = maintenancePlanner.buildMaintenancePlan(maintenanceRoom, {
        plannedStructures: [{
            id: 'controller:container',
            role: 'controller_container',
            structureType: STRUCTURE_CONTAINER,
            pos: { x: 24, y: 25, roomName: 'W1N1' },
            lifecycle: { state: 'retired_ready', activeFromRcl: 1, replacement: 'controller:link' }
        }]
    });
    assert.ok(!retiredReadyControllerMaintenancePlan.targets.some((target) => target.id === 'controllerContainer1'), 'maintenance planner should stop repairing retired-ready controller containers');
    const v2AssetMaintenancePlan = maintenancePlanner.buildMaintenancePlan(maintenanceRoom, {
        plannedStructures: [
            {
                id: 'hub:terminal',
                role: 'hub_terminal',
                structureType: STRUCTURE_TERMINAL,
                pos: { x: 20, y: 20, roomName: 'W1N1' },
                phase: 'industry',
                group: 'industry',
                lifecycle: { state: 'planned', activeFromRcl: 6 }
            },
            {
                id: 'mineral:mineral1:extractor',
                role: 'mineral_extractor',
                structureType: STRUCTURE_EXTRACTOR,
                pos: { x: 22, y: 22, roomName: 'W1N1' },
                phase: 'industry',
                group: 'industry',
                lifecycle: { state: 'planned', activeFromRcl: 6 }
            }
        ]
    });
    assert.ok(v2AssetMaintenancePlan.targets.some((target) => {
        return target.id === 'terminal1' &&
            target.reason === 'hub_terminal_damage' &&
            target.repairClass === 'core';
    }), 'maintenance planner should use planned role reasons for hub terminal assets');
    assert.ok(v2AssetMaintenancePlan.targets.some((target) => {
        return target.id === 'extractor1' &&
            target.reason === 'mineral_extractor_damage' &&
            target.repairClass === 'economic';
    }), 'maintenance planner should use planned role reasons for extractor assets');
    assert.ok(v2AssetMaintenancePlan.targets.some((target) => {
        return target.id === 'terminal1' &&
            target.plannedRole === 'hub_terminal' &&
            target.plannedGroup === 'industry' &&
            target.lifecycleState === 'planned';
    }), 'maintenance planner should attach planned metadata to maintenance targets');
    const lowPriorityRoadMaintenancePlan = maintenancePlanner.buildMaintenancePlan(maintenanceRoom, {
        plannedStructures: [{
            id: 'road:logistics:16,15',
            role: 'logistics_road',
            structureType: STRUCTURE_ROAD,
            pos: { x: 16, y: 15, roomName: 'W1N1' },
            phase: 'logistics_link',
            group: 'infrastructure',
            lifecycle: { state: 'low_priority', activeFromRcl: 3 }
        }]
    });
    assert.ok(lowPriorityRoadMaintenancePlan.targets.some((target) => {
        return target.id === 'mainRoad' &&
            target.reason === 'logistics_road_low_priority' &&
            target.targetHits === 3750 &&
            target.repairBelow === 2250;
    }), 'maintenance planner should use a lighter repair band for low-priority logistics roads');
    const retiringRoadMaintenancePlan = maintenancePlanner.buildMaintenancePlan(maintenanceRoom, {
        plannedStructures: [{
            id: 'road:logistics:16,15',
            role: 'logistics_road',
            structureType: STRUCTURE_ROAD,
            pos: { x: 16, y: 15, roomName: 'W1N1' },
            phase: 'logistics_link',
            group: 'infrastructure',
            lifecycle: { state: 'retiring', activeFromRcl: 3 }
        }]
    });
    assert.ok(!retiringRoadMaintenancePlan.targets.some((target) => target.id === 'mainRoad'), 'maintenance planner should stop repairing retiring logistics roads');
    const lowPriorityDefenseMaintenancePlan = maintenancePlanner.buildMaintenancePlan(maintenanceRoom, {
        plannedStructures: [{
            id: 'defense:rampart:0',
            role: 'defense_rampart',
            structureType: STRUCTURE_RAMPART,
            pos: { x: 17, y: 15, roomName: 'W1N1' },
            phase: 'defense_shell',
            group: 'defense',
            lifecycle: { state: 'low_priority', activeFromRcl: 2 }
        }]
    });
    assert.ok(lowPriorityDefenseMaintenancePlan.targets.some((target) => {
        return target.id === 'rampartEmergency' &&
            target.reason === 'defense_rampart_low_priority' &&
            target.targetHits === 25000;
    }), 'maintenance planner should lower target hits for low-priority defense ramparts');
    assert.strictEqual(getMaintenancePolicy({
        plannedStructures: [{
            id: 'defense:rampart:0',
            role: 'defense_rampart',
            structureType: STRUCTURE_RAMPART,
            pos: { x: 17, y: 15, roomName: 'W1N1' },
            phase: 'defense_shell',
            group: 'defense',
            lifecycle: { state: 'low_priority', activeFromRcl: 2 }
        }]
    }, maintenanceStructures.find((structure) => structure.id === 'rampartEmergency')).targetHits, 25000, 'city asset policy should expose reduced defense targets for low-priority ramparts');

    let repairedDefense = null;
    const towerDefense = new TowerDefenseService('TowerDefense');
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true, level: 8 },
        find: (type, opts) => {
            if (type === FIND_MY_STRUCTURES) {
                const structures = [{
                    id: 'tower1',
                    structureType: STRUCTURE_TOWER,
                    store: { getUsedCapacity: () => 1000 },
                    attack: () => OK,
                    heal: () => OK,
                    repair: (target) => {
                        repairedDefense = target.id;
                        return OK;
                    }
                }];
                if (typeof opts === 'object' && opts && opts.filter) return structures.filter(opts.filter);
                return structures;
            }
            if (type === FIND_MY_CREEPS) return [];
            if (type === FIND_STRUCTURES) {
                return [{
                    id: 'rampart1',
                    structureType: STRUCTURE_RAMPART,
                    hits: 10000
                }];
            }
            return [];
        }
    };
    Memory.rooms.W1N1.cityPlan = {
        defense: {
            repairTargets: {
                rampartHits: 5000,
                wallHits: 0
            }
        }
    };
    Memory.rooms.W1N1.maintenancePlan = {
        targets: [
            { id: 'mainRoad', executor: 'repairer', structureType: STRUCTURE_ROAD, priority: 60 },
            { id: 'rampart1', executor: 'tower', structureType: STRUCTURE_RAMPART, priority: 95 }
        ]
    };
    towerDefense.run();
    assert.strictEqual(repairedDefense, 'rampart1', 'tower defense should consume emergency defense targets from the maintenance plan');
    Memory.rooms.W1N1.cityPlan = cityPlan;

    const plannedMiner = {
        name: 'MinerPlanned',
        room: cityRoom,
        memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' },
        pos: { inRangeTo: () => false },
        store: { getFreeCapacity: () => 0 }
    };
    Game.getObjectById = (id) => id === 'source1' ? sourceForPlan : null;
    service.assignMiningTask(plannedMiner);
    assert.deepStrictEqual(plannedMiner.memory.miningPos, cityPlan.workPositions.sources.source1.mining.primary, 'miner should prefer cityPlan source mining work positions');

    Memory.rooms.W1N1.cityPlan = {
        sources: {
            source1: {
                primaryMiningPos: { x: 11, y: 11, roomName: 'W1N1' }
            }
        }
    };
    const legacyOnlyWorkPositionMiner = {
        name: 'MinerLegacyOnlyWorkPosition',
        room: cityRoom,
        memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' },
        pos: { inRangeTo: () => false },
        store: { getFreeCapacity: () => 0 }
    };
    Game.creeps = { MinerLegacyOnlyWorkPosition: legacyOnlyWorkPositionMiner };
    service.assignMiningTask(legacyOnlyWorkPositionMiner);
    assert.deepStrictEqual(legacyOnlyWorkPositionMiner.memory.miningPos, { x: 9, y: 9, roomName: 'W1N1' }, 'miner should ignore legacy-only source mining positions during the second strict work-position rollout');
    Memory.rooms.W1N1.cityPlan = cityPlan;

    const originalPrimaryMiningPos = cityPlan.sources.source1.primaryMiningPos;
    const originalWorkMiningPos = cityPlan.workPositions.sources.source1.mining.primary;
    const originalContainerPos = cityPlan.sources.source1.containerPos;
    const sourceContainerPos = { x: 10, y: 9, roomName: 'W1N1' };
    Memory.rooms.W1N1.cityPlan.sources.source1.primaryMiningPos = { x: 9, y: 10, roomName: 'W1N1' };
    Memory.rooms.W1N1.cityPlan.workPositions.sources.source1.mining.primary = { x: 9, y: 10, roomName: 'W1N1' };
    Memory.rooms.W1N1.cityPlan.sources.source1.containerPos = sourceContainerPos;
    const cityRoomWithContainer = {
        ...cityRoom,
        find: (type) => {
            if (type === FIND_MY_SPAWNS) return [spawnForPlan];
            if (type === FIND_SOURCES) return [sourceForPlan];
            if (type === FIND_CONSTRUCTION_SITES) return [];
            if (type === FIND_STRUCTURES) {
                return [
                    spawnForPlan,
                    {
                        id: 'sourceContainer1',
                        structureType: STRUCTURE_CONTAINER,
                        pos: sourceContainerPos
                    }
                ];
            }
            return [];
        }
    };
    const containerMiner = {
        name: 'MinerOnContainer',
        room: cityRoomWithContainer,
        memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' },
        pos: { inRangeTo: () => false },
        store: { getFreeCapacity: () => 0 }
    };
    Game.creeps = { MinerOnContainer: containerMiner };
    service.assignMiningTask(containerMiner);
    assert.deepStrictEqual(containerMiner.memory.miningPos, Memory.rooms.W1N1.cityPlan.workPositions.sources.source1.mining.primary, 'miner should fall back to source mining work positions when only legacy source container storage exists');
    Memory.rooms.W1N1.cityPlan.sources.source1.primaryMiningPos = { x: 9, y: 10, roomName: 'W1N1' };
    Memory.rooms.W1N1.cityPlan.workPositions.sources.source1.mining.primary = { x: 9, y: 10, roomName: 'W1N1' };
    delete Memory.rooms.W1N1.cityPlan.sources.source1.containerPos;
    Memory.rooms.W1N1.cityPlan.plannedStructures = [{
        id: 'source1:container',
        role: 'source_container',
        structureType: STRUCTURE_CONTAINER,
        pos: sourceContainerPos,
        scope: { sourceId: 'source1' },
        lifecycle: { state: 'active', activeFromRcl: 1 }
    }];
    const plannedAssetContainerMiner = {
        name: 'MinerOnPlannedAssetContainer',
        room: cityRoomWithContainer,
        memory: { role: 'miner', homeRoom: 'W1N1', sourceId: 'source1' },
        pos: { inRangeTo: () => false },
        store: { getFreeCapacity: () => 0 }
    };
    Game.creeps = { MinerOnPlannedAssetContainer: plannedAssetContainerMiner };
    service.assignMiningTask(plannedAssetContainerMiner);
    assert.deepStrictEqual(plannedAssetContainerMiner.memory.miningPos, sourceContainerPos, 'miner should prioritize planned source container assets when legacy container positions are absent');
    Memory.rooms.W1N1.cityPlan.sources.source1.primaryMiningPos = originalPrimaryMiningPos;
    Memory.rooms.W1N1.cityPlan.workPositions.sources.source1.mining.primary = originalWorkMiningPos;
    Memory.rooms.W1N1.cityPlan.sources.source1.containerPos = originalContainerPos;
    delete Memory.rooms.W1N1.cityPlan.plannedStructures;

    const plannedUpgrader = {
        room: cityRoom,
        memory: { role: 'upgrader', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    upgraderService.assignUpgraderTask(plannedUpgrader);
    assert.deepStrictEqual(plannedUpgrader.memory.task, {
        type: 'MOVE_TO',
        pos: cityPlan.workPositions.controller.upgrade.primary,
        range: 0
    }, 'upgrader should move to the planned controller upgrade position before upgrading');
    Memory.rooms.W1N1.cityPlan = {
        controller: {
            primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' }
        }
    };
    const legacyOnlyWorkPositionUpgrader = {
        room: cityRoom,
        memory: { role: 'upgrader', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    upgraderService.assignUpgraderTask(legacyOnlyWorkPositionUpgrader);
    assert.deepStrictEqual(legacyOnlyWorkPositionUpgrader.memory.task, {
        type: 'UPGRADE',
        targetId: 'controller1'
    }, 'upgrader should ignore legacy-only controller upgrade positions during the first strict work-position rollout');
    Memory.rooms.W1N1.cityPlan = cityPlan;

    const repairBuilder = {
        room: {
            name: 'W1N1',
            controller,
            find: () => []
        },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    global.RoomCache.W1N1 = { constructionSites: [] };
    Memory.rooms.W1N1.maintenancePlan = {
        quotas: { urgent: 3, routine: 0, longTerm: 0 },
        targets: [
            { id: 'routineRoad', executor: 'repairer', urgency: 'routine', structureType: STRUCTURE_ROAD, priority: 95, targetHits: 5000 },
            { id: 'urgentContainer', executor: 'repairer', urgency: 'urgent', structureType: STRUCTURE_CONTAINER, priority: 80, targetHits: 250000 }
        ]
    };
    Game.getObjectById = (id) => {
        if (id === 'routineRoad') return { id, hits: 700, hitsMax: 5000, pos: { x: 8, y: 8, roomName: 'W1N1' } };
        if (id === 'urgentContainer') return { id, hits: 50000, hitsMax: 250000, pos: { x: 10, y: 10, roomName: 'W1N1' } };
        if (id === 'controller1') return { id, pos: {} };
        return null;
    };
    Game.map = {
        getRoomTerrain: () => ({
            get: (x, y) => (x === 10 && y === 9 ? TERRAIN_MASK_WALL : 0)
        })
    };
    repairBuilder.room.find = (type) => {
        if (type !== FIND_STRUCTURES) return [];
        return [
            { structureType: STRUCTURE_ROAD, pos: { x: 10, y: 11, roomName: 'W1N1' } },
            { structureType: STRUCTURE_ROAD, pos: { x: 11, y: 10, roomName: 'W1N1' } }
        ];
    };
    builderService.assignBuilderTask(repairBuilder);
    assert.deepStrictEqual(repairBuilder.memory.task, {
        type: 'UPGRADE',
        targetId: 'controller1'
    }, 'builder should no longer consume maintenance targets when no construction sites exist');

    const quotaBlockedBuilder = {
        room: {
            name: 'W1N1',
            controller,
            find: () => []
        },
        memory: { role: 'builder', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    Memory.rooms.W1N1.maintenancePlan = {
        quotas: { urgent: 0, routine: 0, longTerm: 0 },
        targets: [
            { id: 'routineRoad', executor: 'repairer', urgency: 'routine', structureType: STRUCTURE_ROAD, priority: 95, targetHits: 5000 }
        ]
    };
    Game.getObjectById = (id) => {
        if (id === 'routineRoad') return { id, hits: 700, hitsMax: 5000, pos: { x: 8, y: 8, roomName: 'W1N1' } };
        if (id === 'controller1') return { id, pos: {} };
        return null;
    };
    quotaBlockedBuilder.room.find = (type) => {
        if (type !== FIND_STRUCTURES) return [];
        return [{ structureType: STRUCTURE_ROAD, pos: { x: 8, y: 9, roomName: 'W1N1' } }];
    };
    builderService.assignBuilderTask(quotaBlockedBuilder);
    assert.deepStrictEqual(quotaBlockedBuilder.memory.task, {
        type: 'UPGRADE',
        targetId: 'controller1'
    }, 'builder should fall back to upgrading instead of repairing when no construction sites exist');

    const repairerService = new RepairerStrategyService('RepairerStrategy');
    const repairer = {
        room: {
            name: 'W1N1',
            controller,
            find: () => []
        },
        memory: { role: 'repairer', homeRoom: 'W1N1' },
        store: { getUsedCapacity: () => 50 }
    };
    Memory.rooms.W1N1.maintenancePlan = {
        quotas: { urgent: 0, routine: 0, longTerm: 0 },
        targets: [
            { id: 'routineRoad', executor: 'repairer', urgency: 'routine', structureType: STRUCTURE_ROAD, priority: 95, targetHits: 5000 }
        ]
    };
    Game.getObjectById = (id) => {
        if (id === 'routineRoad') return { id, hits: 700, hitsMax: 5000, pos: { x: 8, y: 8, roomName: 'W1N1' } };
        if (id === 'controller1') return { id, pos: {} };
        return null;
    };
    repairer.room.find = quotaBlockedBuilder.room.find;
    repairerService.assignRepairerTask(repairer);
    assert.deepStrictEqual(repairer.memory.task, {
        type: 'REPAIR',
        targetId: 'routineRoad',
        targetHits: 5000,
        workPos: { x: 7, y: 7, roomName: 'W1N1' },
        workPosReservedAt: Game.time
    }, 'repairer should consume maintenance backlog even when builder quotas are exhausted');

    const stalePlanRepairer = {
        room: {
            name: 'W1N1',
            controller: {
                id: 'controller1'
            }
        },
        store: {
            getUsedCapacity: () => 50
        },
        memory: { role: 'repairer', homeRoom: 'W1N1' },
        pos: {}
    };
    Memory.rooms.W1N1.maintenancePlan = {
        targets: [
            { id: 'fullRoad', executor: 'repairer', urgency: 'routine', structureType: STRUCTURE_ROAD, priority: 95, targetHits: 5000 },
            { id: 'damagedRoad', executor: 'repairer', urgency: 'routine', structureType: STRUCTURE_ROAD, priority: 94, targetHits: 5000 }
        ]
    };
    Game.getObjectById = (id) => {
        if (id === 'fullRoad') return { id, hits: 5000, hitsMax: 5000, pos: { x: 5, y: 5, roomName: 'W1N1' } };
        if (id === 'damagedRoad') return { id, hits: 700, hitsMax: 5000, pos: { x: 7, y: 7, roomName: 'W1N1' } };
        if (id === 'controller1') return { id, pos: {} };
        return null;
    };
    stalePlanRepairer.room.find = (type) => {
        if (type !== FIND_STRUCTURES) return [];
        return [{ structureType: STRUCTURE_ROAD, pos: { x: 7, y: 8, roomName: 'W1N1' } }];
    };
    repairerService.assignRepairerTask(stalePlanRepairer);
    assert.deepStrictEqual(stalePlanRepairer.memory.task, {
        type: 'REPAIR',
        targetId: 'damagedRoad',
        targetHits: 5000,
        workPos: { x: 6, y: 6, roomName: 'W1N1' },
        workPosReservedAt: Game.time
    }, 'repairer should skip stale maintenance targets that already meet their targetHits');

    Memory.rooms.W1N1.cityPlan = {
        plannedStructures: [{
            id: 'road:logistics:7,7',
            role: 'logistics_road',
            structureType: STRUCTURE_ROAD,
            pos: { x: 7, y: 7, roomName: 'W1N1' },
            phase: 'logistics_link',
            group: 'infrastructure',
            lifecycle: { state: 'retired_ready', activeFromRcl: 3 }
        }]
    };
    const retiredPlanRepairer = {
        room: {
            name: 'W1N1',
            controller: {
                id: 'controller1'
            },
            find: () => []
        },
        store: {
            getUsedCapacity: () => 50
        },
        memory: { role: 'repairer', homeRoom: 'W1N1' },
        pos: {}
    };
    Memory.rooms.W1N1.maintenancePlan = {
        targets: [
            {
                id: 'damagedRoad',
                executor: 'repairer',
                urgency: 'routine',
                structureType: STRUCTURE_ROAD,
                priority: 94,
                targetHits: 5000,
                plannedRole: 'logistics_road',
                plannedGroup: 'infrastructure',
                lifecycleState: 'retired_ready'
            }
        ]
    };
    Game.getObjectById = (id) => {
        if (id === 'damagedRoad') return { id, hits: 700, hitsMax: 5000, pos: { x: 7, y: 7, roomName: 'W1N1' } };
        if (id === 'controller1') return { id, pos: {} };
        return null;
    };
    repairerService.assignRepairerTask(retiredPlanRepairer);
    assert.deepStrictEqual(retiredPlanRepairer.memory.task, {
        type: 'UPGRADE',
        targetId: 'controller1'
    }, 'repairer should skip retired-ready maintenance targets even if stale plan entries remain');

    const matrixValues = new Map();
    class CostMatrix {
        set(x, y, value) {
            matrixValues.set(`${x},${y}`, value);
        }
        get(x, y) {
            return matrixValues.get(`${x},${y}`) || 0;
        }
    }

    global.PathFinder = {
        CostMatrix,
        search: () => ({
            incomplete: false,
            path: [{ x: 10, y: 9 }, { x: 10, y: 8 }]
        })
    };
    global.RoomPosition = class RoomPosition {
        constructor(x, y, roomName) {
            this.x = x;
            this.y = y;
            this.roomName = roomName;
        }
    };
    Game.map = {
        getRoomTerrain: () => ({
            get: (x, y) => (x === 10 && y === 9 ? TERRAIN_MASK_WALL : 0)
        })
    };
    Game.getObjectById = (id) => {
        if (id === 'source1') return { id, pos: { x: 10, y: 8, roomName: 'W1N1' } };
        if (id === 'controller1') return { id, pos: { x: 12, y: 10, roomName: 'W1N1' } };
        return null;
    };

    const roadPlanner = new RoadPlannerService('RoadPlanner');
    const roadRoom = {
        name: 'W1N1',
        find: (type) => type === FIND_MY_STRUCTURES ? [{
            structureType: STRUCTURE_SPAWN,
            pos: { x: 11, y: 10 }
        }] : []
    };
    const roadNetwork = roadPlanner.planRoads(roadRoom, {
        centerPos: new RoomPosition(10, 10, 'W1N1'),
        sources: ['source1'],
        controller: 'controller1'
    });
    assert.ok(!roadNetwork.includes('10,9'), 'road network should not include wall terrain');
    assert.ok(!roadNetwork.includes('11,10'), 'road network should not place roads on blueprint or structure tiles');

    const roadSites = [];
    const analyzedRoadSites = [];
    global.RoomCache.W1N1 = { isDirty: false };
    global.RoomPosition = class RoomPosition {
        constructor(x, y, roomName) {
            this.x = x;
            this.y = y;
            this.roomName = roomName;
        }
        createConstructionSite(structureType) {
            roadSites.push({ x: this.x, y: this.y, roomName: this.roomName, structureType });
            return OK;
        }
    };
    Game.constructionSites = {};
    roadPlanner.placeRoadSites({ name: 'W1N1' }, ['12,12']);
    assert.strictEqual(global.RoomCache.W1N1.isDirty, true, 'road planner should mark room cache dirty after placing road construction sites');
    assert.strictEqual(roadSites.length, 1, 'road planner should place road construction sites during the dirty-cache test');

    global.RoomPosition = class RoomPosition {
        constructor(x, y, roomName) {
            this.x = x;
            this.y = y;
            this.roomName = roomName;
        }
        createConstructionSite(structureType) {
            analyzedRoadSites.push({ x: this.x, y: this.y, roomName: this.roomName, structureType });
            return OK;
        }
    };
    Game.time = 501;
    Game.constructionSites = {};
    Game.rooms = {
        W1N1: {
            name: 'W1N1',
            controller: { my: true },
            find: () => []
        }
    };
    Memory.rooms.W1N1.roadNetwork = ['13,13'];
    Memory.rooms.W1N1.roadNetworkVersion = 2;
    global.RoomCache.W1N1 = {
        centerPos: new RoomPosition(10, 10, 'W1N1'),
        isDirty: false
    };
    roadPlanner.analyze();
    assert.ok(analyzedRoadSites.length >= 1, 'road planner should refill missing road construction sites between full planning cycles');
    assert.ok(analyzedRoadSites.some((site) => site.x === 13 && site.y === 13), 'road planner should still preserve and refill the stored road network');

    const dynamicRoadSites = [];
    global.RoomPosition = class RoomPosition {
        constructor(x, y, roomName) {
            this.x = x;
            this.y = y;
            this.roomName = roomName;
        }
        createConstructionSite(structureType) {
            dynamicRoadSites.push({ x: this.x, y: this.y, roomName: this.roomName, structureType });
            return OK;
        }
    };
    Game.time = 777;
    Memory.rooms.W1N1.cityPlan = {
        roadAnchors: [
            { x: 10, y: 10, roomName: 'W1N1' },
            { x: 18, y: 18, roomName: 'W1N1' }
        ]
    };
    Memory.rooms.W1N1.roadNetwork = ['13,13'];
    Memory.rooms.W1N1.roadNetworkVersion = 2;
    global.RoomCache.W1N1 = {
        centerPos: new RoomPosition(10, 10, 'W1N1'),
        sources: [],
        controller: null,
        isDirty: false
    };
    Game.rooms = {
        W1N1: {
            name: 'W1N1',
            controller: { my: true },
            find: () => []
        }
    };
    Game.map = {
        getRoomTerrain: () => ({
            get: () => 0
        })
    };
    PathFinder.search = (origin, goal) => {
        if (goal.pos.x === 18 && goal.pos.y === 18) {
            return { incomplete: false, path: [{ x: 14, y: 14 }, { x: 15, y: 15 }, { x: 16, y: 16 }] };
        }
        return { incomplete: false, path: [{ x: 13, y: 13 }] };
    };
    roadPlanner.analyze();
    assert.ok(Memory.rooms.W1N1.roadNetwork.includes('14,14'), 'road planner should rebuild the road network when city road anchors change');
    assert.ok(dynamicRoadSites.some((site) => site.x === 14 && site.y === 14), 'road planner should place roads for newly added city anchors after replanning');
    assert.ok(Memory.rooms.W1N1.cityPlan.plannedStructures.some((entry) => entry.role === 'logistics_road' && entry.group === 'infrastructure' && entry.phase === 'logistics_link'), 'road planner should sync replanned logistics roads into planned structures');
    Memory.rooms.W1N1.cityPlan.plannedStructures.push({
        id: 'road:logistics:19,19',
        role: 'logistics_road',
        structureType: STRUCTURE_ROAD,
        pos: { x: 19, y: 19, roomName: 'W1N1' },
        phase: 'logistics_link',
        group: 'infrastructure',
        lifecycle: { state: 'active', activeFromRcl: 3 }
    });
    roadPlanner.syncRoadPlannedStructures(Memory.rooms.W1N1.cityPlan, ['14,14', '15,15'], Memory.rooms.W1N1.cityPlan.coreRoads);
    const staleRoadPlan = Memory.rooms.W1N1.cityPlan.plannedStructures.find((entry) => entry.id === 'road:logistics:19,19');
    assert.strictEqual(staleRoadPlan.lifecycle.state, 'low_priority', 'road planner should downgrade old logistics roads that disappear from the active network');

    const retirementService = new CreepRetirementService('CreepRetirement');
    const stableStorage = {
        id: 'storage-retire',
        pos: { x: 25, y: 25, roomName: 'W1N1' },
        store: {
            getUsedCapacity: (resourceType) => resourceType === RESOURCE_ENERGY ? 5000 : 0,
            getFreeCapacity: () => 5000
        }
    };
    const idleBuilder = {
        name: 'IdleBuilder',
        room: {
            name: 'W1N1',
            storage: stableStorage,
            terminal: null
        },
        memory: {
            role: 'builder',
            homeRoom: 'W1N1',
            idleTicks: 120
        },
        store: {
            getUsedCapacity: (resourceType) => resourceType === RESOURCE_ENERGY ? 100 : 0
        },
        suicideCalled: false,
        suicide() {
            this.suicideCalled = true;
            return OK;
        }
    };
    global.RoomPhase = {
        W1N1: {
            energyPosture: 'normal'
        }
    };
    Game.creeps = {
        MinerCore: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        HaulerCore: { memory: { role: 'hauler', homeRoom: 'W1N1' } },
        UpgraderCore: { memory: { role: 'upgrader', homeRoom: 'W1N1' } },
        BuilderCore: idleBuilder
    };
    retirementService.analyze();
    assert.deepStrictEqual(idleBuilder.memory.task, {
        type: 'TRANSFER',
        targetId: 'storage-retire',
        resourceType: RESOURCE_ENERGY
    }, 'retirement service should unload carried resources before retiring idle surplus workers');
    idleBuilder.store.getUsedCapacity = () => 0;
    idleBuilder.memory.task = null;
    retirementService.analyze();
    assert.strictEqual(idleBuilder.suicideCalled, true, 'retirement service should suicide idle surplus workers after they unload');

    const lifecycleService = new StructureLifecycleService('StructureLifecycle');
    const lifecycleSourceContainer = {
        id: 'retireNowContainer',
        structureType: STRUCTURE_CONTAINER,
        pos: { x: 11, y: 10, roomName: 'W1N1' },
        store: makeStore({ energy: 0 }, 2000),
        hits: 90000,
        hitsMax: 250000,
        destroyCalled: false,
        destroy() {
            this.destroyCalled = true;
            return OK;
        }
    };
    const lifecycleSourceLink = {
        id: 'sourceLinkRetire',
        structureType: STRUCTURE_LINK,
        pos: { x: 12, y: 10, roomName: 'W1N1' },
        store: makeStore({ energy: 600 }, 800)
    };
    const lifecycleControllerLink = {
        id: 'controllerLinkRetire',
        structureType: STRUCTURE_LINK,
        pos: { x: 24, y: 24, roomName: 'W1N1' },
        store: makeStore({ energy: 400 }, 800)
    };
    Memory.rooms.W1N1 = {
        cityPlan: {
            sourceRuntime: {
                sources: {
                    source1: {
                        preferredOutputRole: 'source_link',
                        deliveryMode: 'link_primary'
                    }
                }
            },
            sources: {
                source1: {
                    linkPos: { x: 12, y: 10, roomName: 'W1N1' },
                    preferredOutputRole: 'source_link',
                    deliveryMode: 'link_primary'
                }
            },
            controller: {
                linkPos: { x: 24, y: 24, roomName: 'W1N1' }
            },
            plannedStructures: [
                {
                    id: 'source1:container',
                    role: 'source_container',
                    structureType: STRUCTURE_CONTAINER,
                    pos: { x: 11, y: 10, roomName: 'W1N1' },
                    scope: { sourceId: 'source1' },
                    lifecycle: { state: 'retiring', activeFromRcl: 1, activeUntilRcl: 5, replacement: 'source1:link' }
                },
                {
                    id: 'source1:link',
                    role: 'source_link',
                    structureType: STRUCTURE_LINK,
                    pos: { x: 12, y: 10, roomName: 'W1N1' },
                    scope: { sourceId: 'source1' },
                    lifecycle: { state: 'planned', activeFromRcl: 5 }
                },
                {
                    id: 'controller:link',
                    role: 'controller_link',
                    structureType: STRUCTURE_LINK,
                    pos: { x: 24, y: 24, roomName: 'W1N1' },
                    lifecycle: { state: 'planned', activeFromRcl: 5 }
                }
            ]
        },
        linkNetwork: {
            updatedAt: 1,
            sources: {
                source1: {
                    mode: 'link_primary',
                    linkId: 'sourceLinkRetire',
                    linkEnergy: 600,
                    lastTransferAt: 1,
                    transferFailures: 0,
                    fallbackContainerUsed: false,
                    stableTicks: 1500
                }
            },
            controller: {
                linkId: 'controllerLinkRetire',
                linkEnergy: 400,
                underfilledTicks: 0
            }
        }
    };
    global.RoomPhase = {
        W1N1: {
            energyPosture: 'normal'
        }
    };
    Game.creeps = {
        StableMiner: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        StableHauler: { memory: { role: 'hauler', homeRoom: 'W1N1' } },
        StableUpgrader: { memory: { role: 'upgrader', homeRoom: 'W1N1' } }
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true, pos: { x: 25, y: 25, roomName: 'W1N1' } },
        find: (type) => {
            if (type === FIND_STRUCTURES) return [lifecycleSourceContainer, lifecycleSourceLink, lifecycleControllerLink];
            return [];
        }
    };
    Game.getObjectById = (id) => {
        if (id === 'retireNowContainer') return lifecycleSourceContainer;
        if (id === 'sourceLinkRetire') return lifecycleSourceLink;
        if (id === 'controllerLinkRetire') return lifecycleControllerLink;
        return null;
    };
    lifecycleService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.plannedStructures[0].lifecycle.state, 'retired_ready', 'structure lifecycle should mark stable empty retiring source containers as retired-ready');
    lifecycleService.run();
    assert.strictEqual(lifecycleSourceContainer.destroyCalled, true, 'structure lifecycle should destroy retired-ready source containers once room safety checks pass');
    lifecycleSourceContainer.destroyCalled = false;
    Memory.rooms.W1N1 = {
        cityPlan: {
            sources: {
                source1: {
                    preferredOutputRole: 'source_link',
                    deliveryMode: 'link_primary'
                }
            },
            controller: {
                linkPos: { x: 24, y: 24, roomName: 'W1N1' }
            },
            plannedStructures: [
                {
                    id: 'source1:container',
                    role: 'source_container',
                    structureType: STRUCTURE_CONTAINER,
                    pos: { x: 11, y: 10, roomName: 'W1N1' },
                    scope: { sourceId: 'source1' },
                    lifecycle: { state: 'retiring', activeFromRcl: 1, replacement: 'source1:link' }
                },
                {
                    id: 'source1:link',
                    role: 'source_link',
                    structureType: STRUCTURE_LINK,
                    pos: { x: 12, y: 10, roomName: 'W1N1' },
                    scope: { sourceId: 'source1' },
                    lifecycle: { state: 'active', activeFromRcl: 5 }
                },
                {
                    id: 'controller:link',
                    role: 'controller_link',
                    structureType: STRUCTURE_LINK,
                    pos: { x: 24, y: 24, roomName: 'W1N1' },
                    lifecycle: { state: 'planned', activeFromRcl: 5 }
                }
            ]
        },
        linkNetwork: {
            updatedAt: 1,
            sources: {
                source1: {
                    mode: 'link_primary',
                    linkId: 'sourceLinkRetire',
                    linkEnergy: 600,
                    lastTransferAt: 1,
                    transferFailures: 0,
                    fallbackContainerUsed: false,
                    stableTicks: 1500
                }
            },
            controller: {
                linkId: 'controllerLinkRetire',
                linkEnergy: 400,
                underfilledTicks: 0,
                stableTicks: 1500
            }
        },
        cityPlanRuntimeObservation: {
            readyStreak: 3,
            readyForRuntimeFallbackDisable: true
        }
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true, pos: { x: 25, y: 25, roomName: 'W1N1' } },
        find: (type) => {
            if (type === FIND_STRUCTURES) return [lifecycleSourceContainer, lifecycleSourceLink, lifecycleControllerLink];
            return [];
        }
    };
    lifecycleService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.plannedStructures[0].lifecycle.state, 'retiring', 'structure lifecycle should ignore legacy-only source runtime once the strict runtime gate is enabled');
    Memory.rooms.W1N1 = {
        cityPlan: {
            sources: {
                source1: {
                    linkPos: { x: 12, y: 10, roomName: 'W1N1' },
                    preferredOutputRole: 'source_link',
                    deliveryMode: 'link_primary'
                }
            },
            controller: {
                linkPos: { x: 24, y: 24, roomName: 'W1N1' }
            },
            plannedStructures: [
                {
                    id: 'source1:container',
                    role: 'source_container',
                    structureType: STRUCTURE_CONTAINER,
                    pos: { x: 11, y: 10, roomName: 'W1N1' },
                    scope: { sourceId: 'source1' },
                    lifecycle: { state: 'retiring', activeFromRcl: 1, replacement: 'source1:link' }
                },
                {
                    id: 'controller:link',
                    role: 'controller_link',
                    structureType: STRUCTURE_LINK,
                    pos: { x: 24, y: 24, roomName: 'W1N1' },
                    lifecycle: { state: 'planned', activeFromRcl: 5 }
                }
            ]
        },
        linkNetwork: {
            updatedAt: 1,
            sources: {
                source1: {
                    mode: 'link_primary',
                    linkId: 'sourceLinkRetire',
                    linkEnergy: 600,
                    lastTransferAt: 1,
                    transferFailures: 0,
                    fallbackContainerUsed: false,
                    stableTicks: 1500
                }
            },
            controller: {
                linkId: 'controllerLinkRetire',
                linkEnergy: 400,
                underfilledTicks: 0,
                stableTicks: 1500
            }
        }
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true, pos: { x: 25, y: 25, roomName: 'W1N1' } },
        find: (type) => {
            if (type === FIND_STRUCTURES) return [lifecycleSourceContainer, lifecycleSourceLink, lifecycleControllerLink];
            return [];
        }
    };
    lifecycleService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.plannedStructures[0].lifecycle.state, 'retiring', 'structure lifecycle should ignore legacy-only source links during strict rollout');
    Memory.rooms.W1N1 = {
        cityPlan: {
            sources: {},
            controller: {
                linkPos: { x: 24, y: 24, roomName: 'W1N1' }
            },
            plannedStructures: [{
                id: 'road:logistics:16,15',
                role: 'logistics_road',
                structureType: STRUCTURE_ROAD,
                pos: { x: 16, y: 15, roomName: 'W1N1' },
                phase: 'logistics_link',
                group: 'infrastructure',
                lifecycle: { state: 'low_priority', activeFromRcl: 3, lastPlannedAt: Game.time - 600, lowPrioritySince: Game.time - 600 }
            }]
        }
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true, pos: { x: 25, y: 25, roomName: 'W1N1' } },
        find: () => []
    };
    Game.creeps = {
        StableMiner: { memory: { role: 'miner', homeRoom: 'W1N1' } },
        StableHauler: { memory: { role: 'hauler', homeRoom: 'W1N1' } },
        StableUpgrader: { memory: { role: 'upgrader', homeRoom: 'W1N1' } }
    };
    lifecycleService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.plannedStructures[0].lifecycle.state, 'retiring', 'structure lifecycle should advance stale low-priority logistics roads into retiring state');
    for (let i = 0; i < 25; i++) {
        recordLifecycleTransitionFailure('W1N1', {
            service: 'TestHarness',
            role: 'logistics_road',
            id: `road:${i}`,
            from: 'low_priority',
            to: 'retiring',
            error: 'synthetic failure'
        });
    }
    assert.strictEqual(Memory.rooms.W1N1.cityPlanTransitionFailures.length, 20, 'city plan debug should cap stored lifecycle transition failures');

    const lifecycleControllerContainer = {
        id: 'retireControllerContainer',
        structureType: STRUCTURE_CONTAINER,
        pos: { x: 24, y: 25, roomName: 'W1N1' },
        store: makeStore({ energy: 0 }, 2000),
        hits: 90000,
        hitsMax: 250000,
        destroyCalled: false,
        destroy() {
            this.destroyCalled = true;
            return OK;
        }
    };
    Memory.rooms.W1N1 = {
        cityPlan: {
            sources: {},
            controller: {
                linkPos: { x: 24, y: 24, roomName: 'W1N1' }
            },
            plannedStructures: [
                {
                    id: 'controller:container',
                    role: 'controller_container',
                    structureType: STRUCTURE_CONTAINER,
                    pos: { x: 24, y: 25, roomName: 'W1N1' },
                    lifecycle: { state: 'retiring', activeFromRcl: 1, replacement: 'controller:link' }
                },
                {
                    id: 'controller:link',
                    role: 'controller_link',
                    structureType: STRUCTURE_LINK,
                    pos: { x: 24, y: 24, roomName: 'W1N1' },
                    lifecycle: { state: 'planned', activeFromRcl: 5 }
                }
            ]
        },
        linkNetwork: {
            updatedAt: 1,
            sources: {},
            controller: {
                linkId: 'controllerLinkRetire',
                linkEnergy: 400,
                underfilledTicks: 0,
                stableTicks: 1500
            }
        }
    };
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true, pos: { x: 25, y: 25, roomName: 'W1N1' } },
        find: (type) => {
            if (type === FIND_STRUCTURES) return [lifecycleControllerContainer, lifecycleControllerLink];
            return [];
        }
    };
    Game.getObjectById = (id) => {
        if (id === 'retireControllerContainer') return lifecycleControllerContainer;
        if (id === 'controllerLinkRetire') return lifecycleControllerLink;
        return null;
    };
    lifecycleService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.plannedStructures[0].lifecycle.state, 'retired_ready', 'structure lifecycle should mark stable empty retiring controller containers as retired-ready');
    lifecycleService.run();
    assert.strictEqual(lifecycleControllerContainer.destroyCalled, true, 'structure lifecycle should destroy retired-ready controller containers once room safety checks pass');
    Memory.rooms.W1N1 = {
        cityPlan: {
            sources: {},
            controller: {
                linkPos: { x: 24, y: 24, roomName: 'W1N1' }
            },
            plannedStructures: [{
                id: 'controller:container',
                role: 'controller_container',
                structureType: STRUCTURE_CONTAINER,
                pos: { x: 24, y: 25, roomName: 'W1N1' },
                lifecycle: { state: 'retiring', activeFromRcl: 1, replacement: 'controller:link' }
            }]
        },
        linkNetwork: {
            updatedAt: 1,
            sources: {},
            controller: {
                linkId: 'controllerLinkRetire',
                linkEnergy: 400,
                underfilledTicks: 0,
                stableTicks: 1500
            }
        }
    };
    lifecycleControllerContainer.destroyCalled = false;
    Game.rooms.W1N1 = {
        name: 'W1N1',
        controller: { my: true, pos: { x: 25, y: 25, roomName: 'W1N1' } },
        find: () => []
    };
    lifecycleService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.plannedStructures[0].lifecycle.state, 'retiring', 'structure lifecycle should ignore legacy-only controller links during strict rollout');

    const cityPlanDebugService = new CityPlanDebugService('CityPlanDebug');
    Game.time = 50;
    Memory.rooms.W1N1 = {
        cityPlan: {
            schemaVersion: CITY_PLAN_SCHEMA_VERSION,
            sources: {
                source1: {
                    preferredOutputRole: 'source_link',
                    deliveryMode: 'link_primary'
                }
            },
            controller: {
                containerPos: { x: 24, y: 25, roomName: 'W1N1' }
            },
            plannedStructures: [
                {
                    id: 'source1:link',
                    role: 'source_link',
                    structureType: STRUCTURE_LINK,
                    pos: { x: 12, y: 10, roomName: 'W1N1' },
                    scope: { sourceId: 'source1' },
                    lifecycle: { state: 'planned', activeFromRcl: 5 }
                },
                {
                    id: 'controller:container',
                    role: 'controller_container',
                    structureType: STRUCTURE_CONTAINER,
                    pos: { x: 24, y: 25, roomName: 'W1N1' },
                    lifecycle: { state: 'active', activeFromRcl: 1 }
                }
            ]
        },
        cityPlanTransitionFailures: [{
            tick: 49,
            service: 'LinkService',
            role: 'source_container',
            id: 'source1:container',
            from: 'low_priority',
            to: 'link_primary',
            error: 'illegal lifecycle transition: low_priority -> link_primary'
        }]
    };
    cityPlanDebugService.analyze();
    assert.ok(Memory.rooms.W1N1.cityPlanDebug, 'city plan debug service should publish room debug summaries');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.validation.valid, true, 'city plan debug service should expose city plan schema validation state');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.assetCountsByRole.source_link, 1, 'city plan debug service should summarize assets by role');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.sourceRuntime.byMode.container, 1, 'city plan debug service should fall back to container-mode source runtime states when canonical runtime storage is missing');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.sourceRuntime.canonical.totalSources, 0, 'city plan debug service should report canonical source runtime storage coverage independently from runtime mode summary');
    assert.deepStrictEqual(Memory.rooms.W1N1.cityPlanDebug.sourceRuntime.canonical.fallbackSources, ['source1'], 'city plan debug service should surface runtime fallback sources while canonical coverage is incomplete');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.sourceOutputPolicies.source1.bodyProfile, 'miner', 'city plan debug service should include defaulted source output policy summaries when only legacy runtime storage exists');
    assert.ok(Memory.rooms.W1N1.cityPlanDebug.transitionFailures.some((failure) => failure.service === 'LinkService'), 'city plan debug service should surface recent transition failures');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.v3Readiness.migrationObserved, false, 'city plan debug service should not fabricate migration observation when no migration occurred');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.v3Readiness.readyForRuntimeFallbackDisable, false, 'city plan debug service should keep runtime fallback disable gated while runtime fallback sources still exist');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanRuntimeObservation.readyStreak, 0, 'city plan debug service should reset runtime readiness streak when runtime fallback disable is not yet allowed');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetFallbackObservation.readyStreak, 1, 'city plan debug service should begin counting consecutive asset-fallback-disable-ready observations when no asset fallback is observed');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetFallbackObservation.readyByRole.controller_container, true, 'city plan debug service should mark controller-container asset fallback readiness true after the first fallback-free observation');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.legacyCleanupReadiness.readyForControllerAssetFieldRemoval, false, 'city plan debug service should keep controller asset-field removal gated before the observation window is satisfied');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.legacyCleanupReadiness.readyForSourceAssetFieldRemoval, false, 'city plan debug service should keep source asset-field removal gated before the observation window is satisfied');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.v3Readiness.assetFallbackObservationStable, false, 'city plan debug service should keep asset fallback observation unstable before the streak threshold is reached');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.v3Readiness.readyForAssetFallbackDisable, false, 'city plan debug service should keep asset fallback disable gated before the streak threshold is reached');
    Memory.rooms.W1N1 = {
        cityPlan: {
            schemaVersion: 2,
            sources: {
                source1: {
                    primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' },
                    containerPos: { x: 9, y: 10, roomName: 'W1N1' }
                }
            },
            controller: {
                primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' },
                containerPos: { x: 24, y: 25, roomName: 'W1N1' }
            }
        }
    };
    cityPlanDebugService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.schemaVersion, 4, 'city plan debug service should migrate legacy city plans to the current schema before publishing debug summaries');
    assert.deepStrictEqual(Memory.rooms.W1N1.cityPlan.workPositions.sources.source1.mining.primary, { x: 9, y: 10, roomName: 'W1N1' }, 'city plan debug service should persist migrated canonical work positions back into room memory');
    assert.ok(Memory.rooms.W1N1.cityPlan.plannedStructures.some((entry) => entry.role === 'source_container'), 'city plan debug service should persist migrated planned assets back into room memory');
    assert.deepStrictEqual(Memory.rooms.W1N1.cityPlan.sourceRuntime.sources.source1, {
        preferredOutputRole: 'source_container',
        deliveryMode: 'container'
    }, 'city plan debug service should persist migrated canonical source runtime storage back into room memory');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanMigration.fromVersion, 2, 'city plan debug service should persist the last observed city plan migration source version');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanMigration.toVersion, 4, 'city plan debug service should persist the last observed city plan migration target version');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanMigration.changed, true, 'city plan debug service should persist whether a migration changed the room city plan');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanMigration.changes.plannedStructuresAdded, 2, 'city plan debug service should persist migration change counts for planned structures');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanMigration.changes.sourceRuntimeEntriesAdded, 1, 'city plan debug service should persist migration change counts for canonical source runtime storage');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanMigration.assetImportReadiness.canonicalCompleteBeforeImport, false, 'city plan debug service should persist migration asset-import readiness metadata');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanMigration.assetImportReadiness.legacyAssetImportUsed, true, 'city plan debug service should persist whether migration regenerated canonical assets from legacy coordinates');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportExecution.consumedMode, 'enabled', 'city plan debug service should record enabled as the consumed asset import mode for default migration execution');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportExecution.rollbackRecommended, true, 'city plan debug service should recommend rollback from disabled rollout when enabled execution still needs legacy asset import');
    assert.ok(Memory.rooms.W1N1.cityPlanAssetImportExecution.rollbackReasons.includes('legacy_asset_import_still_required'), 'city plan debug service should record legacy asset import as a rollback reason when enabled execution still regenerates canonical assets');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRollbackGate.rollbackRecommended, true, 'city plan debug service should mirror enabled execution rollback recommendations into rollback-gate observation state');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRollbackGate.readyForManualRollback, false, 'city plan debug service should not mark manual rollback ready while rollout is currently enabled');
    assert.ok(Memory.rooms.W1N1.cityPlanAssetImportRollbackGate.blockingReasons.includes('rollout_not_currently_disabled'), 'city plan debug service should explain why enabled rollout execution cannot yet become a manual rollback candidate');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportObservation.readyStreak, 0, 'city plan debug service should reset asset import retirement readiness when migration still regenerates canonical assets');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportObservation.readyForAssetImportRemoval, false, 'city plan debug service should keep asset import retirement gated while migration still regenerates canonical assets');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportObservation.legacyAssetImportUsed, true, 'city plan debug service should persist whether the latest migration observation regenerated canonical assets');
    assert.deepStrictEqual(Memory.rooms.W1N1.cityPlanDebug.assetImportObservation.regeneratedAssetRoles.sort(), ['controller_container', 'source_container'], 'city plan debug service should surface regenerated asset roles in room debug output for migration observations');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRehearsal.readyForDisabledAssetImport, true, 'city plan debug service should report disabled-mode rehearsal ready after default migration repairs canonical assets');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRehearsal.disabledModeWouldMissCanonicalAssets, false, 'city plan debug service should report no missing canonical assets in disabled rehearsal after canonical repair has been persisted');
    assert.deepStrictEqual(Memory.rooms.W1N1.cityPlanAssetImportRehearsal.missingCanonicalAssetRoles, [], 'city plan debug service should surface no missing asset roles once persisted canonical assets satisfy disabled rehearsal');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRehearsal.plannedStructuresAdded, 0, 'city plan debug service should keep disabled rehearsal non-mutating for planned asset regeneration');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.assetImportRehearsal.readyForDisabledAssetImport, true, 'city plan debug service should surface disabled-mode rehearsal readiness in debug output');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRetirementGate.readyForDefaultDisabled, false, 'city plan debug service should keep the consolidated default-disabled gate closed before observation stability is established');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRetirementGate.observationReady, false, 'city plan debug service should report observation gate false before the asset import observation streak is stable');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRetirementGate.rehearsalReady, true, 'city plan debug service should report rehearsal gate true once disabled rehearsal shows no missing canonical assets');
    assert.ok(Memory.rooms.W1N1.cityPlanAssetImportRetirementGate.blockingReasons.includes('asset_import_observation_not_stable'), 'city plan debug service should report observation instability as a retirement-gate blocker before the streak is stable');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRollout.requestedMode, 'enabled', 'city plan debug service should default room-level asset import rollout requests to enabled');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRollout.effectiveMode, 'enabled', 'city plan debug service should keep effective room-level asset import rollout enabled by default');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRollout.readyForDisabled, false, 'city plan debug service should keep rollout readiness false while the consolidated retirement gate is closed');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.assetImportRollout.effectiveMode, 'enabled', 'city plan debug service should surface the room-level rollout decision in debug output');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.migration.toVersion, 4, 'city plan debug service should surface the persisted migration summary in debug output');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.sourceRuntime.canonical.totalSources, 1, 'city plan debug service should expose migrated canonical source runtime coverage');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.v3Readiness.migrationObserved, true, 'city plan debug service should mark migration as observed after persisting migration metadata');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.v3Readiness.readyForRuntimeFallbackDisable, true, 'city plan debug service should mark migrated canonical rooms ready for runtime fallback disable');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanRuntimeObservation.readyStreak, 1, 'city plan debug service should begin counting consecutive runtime-fallback-disable-ready observations');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetFallbackObservation.readyStreak, 1, 'city plan debug service should begin a new asset fallback readiness streak when room debug state is rebuilt around a migrated room memory snapshot');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanWorkPositionCleanupObservation.readyStreak, 1, 'city plan debug service should begin a new work-position cleanup readiness streak when canonical work positions are present');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.v3Readiness.assetFallbackObservationStable, false, 'city plan debug service should still keep asset fallback observation unstable before the third consecutive observation');
    Game.time = 100;
    cityPlanDebugService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.cityPlanRuntimeObservation.readyStreak, 2, 'city plan debug service should increment the runtime readiness streak across consecutive ready observations');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetFallbackObservation.readyStreak, 2, 'city plan debug service should keep counting consecutive asset-fallback-disable-ready observations');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportObservation.readyStreak, 1, 'city plan debug service should begin counting consecutive asset-import-retirement-ready observations after regeneration stops');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportObservation.readyForAssetImportRemoval, false, 'city plan debug service should keep asset import retirement gated until the observation window is satisfied');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanWorkPositionCleanupObservation.readyStreak, 2, 'city plan debug service should keep counting consecutive work-position-cleanup-ready observations');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetFallbackObservation.readyForAssetFallbackDisable, false, 'city plan debug service should keep asset fallback disable gated until the third consecutive fallback-free observation is recorded');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetFallbackObservation.readyByRole.source_container, true, 'city plan debug service should keep per-role asset fallback readiness true while fallback remains absent');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.v3Readiness.assetFallbackObservationStable, false, 'city plan debug service should keep asset fallback observation unstable until the third consecutive observation is recorded');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.v3Readiness.readyForAssetFallbackDisable, false, 'city plan debug service should keep rooms gated for asset fallback disable until the third consecutive observation is recorded');
    Game.time = 150;
    cityPlanDebugService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.cityPlanRuntimeObservation.readyStreak, 3, 'city plan debug service should keep counting consecutive runtime-fallback-disable-ready observations');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetFallbackObservation.readyStreak, 3, 'city plan debug service should continue counting stable asset fallback observations until the observation window is satisfied');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetFallbackObservation.readyForAssetFallbackDisable, true, 'city plan debug service should mark asset fallback disable ready after the third consecutive fallback-free observation');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportObservation.readyStreak, 2, 'city plan debug service should continue counting stable asset import retirement observations until the observation window is satisfied');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.assetImportObservation.readyForAssetImportRemoval, false, 'city plan debug service should keep asset import retirement unstable before the third consecutive ready observation');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanWorkPositionCleanupObservation.readyStreak, 3, 'city plan debug service should continue counting stable work-position cleanup observations until the observation window is satisfied');
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.controller.containerPos, undefined, 'city plan debug service should automatically remove legacy controller container compatibility storage once controller cleanup is ready');
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.controller.linkPos, undefined, 'city plan debug service should automatically remove legacy controller link compatibility storage once controller cleanup is ready');
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.sources.source1.containerPos, undefined, 'city plan debug service should automatically remove legacy source container compatibility storage once source cleanup is enabled and ready');
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.sources.source1.linkPos, undefined, 'city plan debug service should automatically remove legacy source link compatibility storage once source cleanup is enabled and ready');
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.controller.primaryUpgradePos, undefined, 'city plan debug service should automatically remove legacy controller upgrade-position compatibility storage once work-position cleanup is ready');
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.sources.source1.primaryMiningPos, undefined, 'city plan debug service should automatically remove legacy source mining-position compatibility storage once work-position cleanup is ready');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.legacyCleanupReadiness.readyForControllerAssetFieldRemoval, true, 'city plan debug service should mark controller asset-field removal ready once controller roles stay fallback-free through the observation window');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.legacyCleanupReadiness.readyForSourceAssetFieldRemoval, true, 'city plan debug service should mark source asset-field removal ready once source roles stay fallback-free through the observation window');
    assert.deepStrictEqual(Memory.rooms.W1N1.cityPlanDebug.legacyCleanupReadiness.readyRoles, ['controller_container', 'controller_link', 'source_container', 'source_link'], 'city plan debug service should surface all asset roles as cleanup-ready once each role satisfies the observation window');
    assert.ok(Memory.rooms.W1N1.cityPlanDebug.legacyCleanupExecution.removedFields.includes('sources.source1.containerPos'), 'city plan debug service should record source container field cleanup in execution metadata');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.legacyCleanupExecution.sourceFieldsRemoved, true, 'city plan debug service should mark source cleanup execution once source compat fields are removed');
    assert.ok(Memory.rooms.W1N1.cityPlanDebug.legacyCleanupExecution.removedFields.includes('sources.source1.primaryMiningPos'), 'city plan debug service should record source mining-position field cleanup in execution metadata');
    assert.ok(Memory.rooms.W1N1.cityPlanDebug.legacyCleanupExecution.removedFields.includes('controller.primaryUpgradePos'), 'city plan debug service should record controller upgrade-position field cleanup in execution metadata');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.legacyCleanupExecution.workPositionFieldsRemoved, true, 'city plan debug service should mark work-position cleanup execution once legacy work-position fields are removed');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.v3Readiness.assetFallbackObservationStable, true, 'city plan debug service should mark asset fallback observation stable once the streak threshold is met');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.v3Readiness.readyForAssetFallbackDisable, true, 'city plan debug service should mark rooms ready for asset fallback disable once snapshot gates and the observation streak are satisfied');
    Game.time = 200;
    cityPlanDebugService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportObservation.readyStreak, 3, 'city plan debug service should mark asset import retirement observation stable after the third consecutive ready observation');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportObservation.readyForAssetImportRemoval, true, 'city plan debug service should mark room-level asset import retirement readiness after the observation window is satisfied');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportObservation.legacyAssetImportUsed, false, 'city plan debug service should clear regeneration state once canonical rooms no longer import legacy assets');
    assert.deepStrictEqual(Memory.rooms.W1N1.cityPlanAssetImportObservation.regeneratedAssetRoles, [], 'city plan debug service should clear regenerated asset role details once migration no longer rebuilds canonical assets');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.assetImportObservation.readyForAssetImportRemoval, true, 'city plan debug service should surface stable asset import retirement readiness in room debug output');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRetirementGate.readyForDefaultDisabled, true, 'city plan debug service should open the consolidated default-disabled gate once observation, rehearsal, and cleanup signals are all ready');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRetirementGate.cleanupComplete, true, 'city plan debug service should report cleanup complete once legacy asset coordinates have been removed');
    assert.deepStrictEqual(Memory.rooms.W1N1.cityPlanAssetImportRetirementGate.blockingReasons, [], 'city plan debug service should clear all retirement gate blockers once default-disabled readiness is satisfied');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.assetImportRetirementGate.readyForDefaultDisabled, true, 'city plan debug service should surface the consolidated asset import retirement gate in debug output');
    Memory.rooms.W1N1.cityPlanAssetImportRollout = {
        requestedMode: 'disabled'
    };
    Game.time = 250;
    cityPlanDebugService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRollout.requestedMode, 'disabled', 'city plan debug service should preserve explicit room-level disabled rollout requests');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRollout.effectiveMode, 'disabled', 'city plan debug service should allow room-level disabled rollout once the retirement gate is ready');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRollout.readyForDisabled, true, 'city plan debug service should mark rollout readiness true once the retirement gate is ready');
    assert.deepStrictEqual(Memory.rooms.W1N1.cityPlanAssetImportRollout.blockedReasons, [], 'city plan debug service should clear rollout blockers once disabled rollout is allowed');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRollout.rollbackMode, 'enabled', 'city plan debug service should record enabled as the room-level rollback mode for asset import rollout');
    Memory.rooms.W2N2 = {
        cityPlan: {
            schemaVersion: 2,
            sources: {
                source1: {
                    primaryMiningPos: { x: 9, y: 10, roomName: 'W2N2' },
                    containerPos: { x: 9, y: 10, roomName: 'W2N2' }
                }
            },
            controller: {
                primaryUpgradePos: { x: 24, y: 25, roomName: 'W2N2' },
                containerPos: { x: 24, y: 25, roomName: 'W2N2' }
            }
        },
        cityPlanAssetImportRollout: {
            requestedMode: 'disabled',
            effectiveMode: 'disabled'
        }
    };
    Game.rooms.W2N2 = { name: 'W2N2' };
    Game.time = 300;
    cityPlanDebugService.analyze();
    assert.strictEqual(Memory.rooms.W2N2.cityPlan.schemaVersion, 4, 'city plan debug service should still migrate legacy room schemas when room-level effective asset import mode is disabled');
    assert.strictEqual(Memory.rooms.W2N2.cityPlan.plannedStructures.length, 0, 'city plan debug service should stop regenerating planned assets when room-level effective asset import mode is disabled');
    assert.strictEqual(Memory.rooms.W2N2.cityPlanMigration.changes.plannedStructuresAdded, 0, 'city plan debug service should report zero regenerated planned assets when room-level effective asset import mode is disabled');
    assert.deepStrictEqual(Memory.rooms.W2N2.cityPlan.workPositions.sources.source1.mining.primary, { x: 9, y: 10, roomName: 'W2N2' }, 'city plan debug service should still migrate canonical work positions when room-level effective asset import mode is disabled');
    assert.strictEqual(Memory.rooms.W2N2.cityPlanAssetImportExecution.consumedMode, 'disabled', 'city plan debug service should record disabled as the consumed asset import mode when room-level rollout is disabled');
    assert.strictEqual(Memory.rooms.W2N2.cityPlanAssetImportExecution.rollbackRecommended, true, 'city plan debug service should recommend rollback when disabled execution leaves canonical planned assets missing');
    assert.ok(Memory.rooms.W2N2.cityPlanAssetImportExecution.rollbackReasons.includes('disabled_mode_missing_canonical_assets'), 'city plan debug service should record missing canonical assets as a rollback reason for disabled execution');
    assert.strictEqual(Memory.rooms.W2N2.cityPlanAssetImportRollbackGate.stableRollbackRecommended, false, 'city plan debug service should keep disabled rollback recommendations unstable on the first failing execution');
    assert.strictEqual(Memory.rooms.W2N2.cityPlanAssetImportRollbackGate.readyForManualRollback, false, 'city plan debug service should not mark manual rollback ready before disabled execution rollback recommendations stabilize');
    Memory.rooms.W3N3 = {
        cityPlan: {
            schemaVersion: 2,
            sources: {
                source1: {
                    primaryMiningPos: { x: 9, y: 10, roomName: 'W3N3' },
                    containerPos: { x: 9, y: 10, roomName: 'W3N3' }
                }
            },
            controller: {
                primaryUpgradePos: { x: 24, y: 25, roomName: 'W3N3' },
                containerPos: { x: 24, y: 25, roomName: 'W3N3' }
            }
        },
        cityPlanAssetImportRollout: {
            requestedMode: 'disabled',
            effectiveMode: 'enabled'
        }
    };
    Game.rooms.W3N3 = { name: 'W3N3' };
    Game.time = 350;
    cityPlanDebugService.analyze();
    assert.ok(Memory.rooms.W3N3.cityPlan.plannedStructures.some((entry) => entry.role === 'source_container'), 'city plan debug service should keep asset import enabled when only the requested rollout mode is disabled');
    assert.strictEqual(Memory.rooms.W3N3.cityPlanMigration.changes.plannedStructuresAdded, 2, 'city plan debug service should still regenerate planned assets when the persisted effective rollout mode remains enabled');
    assert.strictEqual(Memory.rooms.W3N3.cityPlanAssetImportExecution.consumedMode, 'enabled', 'city plan debug service should consume the effective rollout mode rather than the requested rollout mode during migration execution');
    assert.strictEqual(Memory.rooms.W3N3.cityPlanAssetImportExecution.rollbackRecommended, true, 'city plan debug service should still recommend rollback from disabled rollout when enabled execution proves legacy asset import is still required');
    Memory.rooms.W4N4 = {
        cityPlan: {
            schemaVersion: 2,
            sources: {
                source1: {
                    primaryMiningPos: { x: 9, y: 10, roomName: 'W4N4' },
                    containerPos: { x: 9, y: 10, roomName: 'W4N4' }
                }
            },
            controller: {
                primaryUpgradePos: { x: 24, y: 25, roomName: 'W4N4' },
                containerPos: { x: 24, y: 25, roomName: 'W4N4' }
            }
        },
        cityPlanAssetImportRollout: {
            requestedMode: 'disabled',
            effectiveMode: 'disabled'
        },
        cityPlanAssetImportRollbackGate: {
            readyStreak: 1
        }
    };
    Game.rooms.W4N4 = { name: 'W4N4' };
    Game.time = 400;
    cityPlanDebugService.analyze();
    assert.strictEqual(Memory.rooms.W4N4.cityPlanAssetImportRollbackGate.stableRollbackRecommended, true, 'city plan debug service should mark rollback recommendations stable once prior rollback-gate history and a new failing execution satisfy the streak threshold');
    assert.strictEqual(Memory.rooms.W4N4.cityPlanAssetImportRollbackGate.readyForManualRollback, false, 'city plan debug service should keep manual rollback not-ready once rollout has already recovered to enabled');
    assert.strictEqual(Memory.rooms.W4N4.cityPlanAssetImportRollbackGate.recommendedMode, 'enabled', 'city plan debug service should recommend enabled as the rollback target mode once rollback recommendations stabilize');
    assert.ok(Memory.rooms.W4N4.cityPlanAssetImportRollbackGate.blockingReasons.includes('rollout_not_currently_disabled'), 'city plan debug service should explain why stable rollback recommendations do not require manual rollback after rollout recovery');
    assert.ok(Memory.empire.cityPlanAssetImportRollbackSummary.observedRooms.includes('W1N1'), 'city plan debug service should include observed rollback-gate rooms in the empire rollback summary');
    assert.ok(Memory.empire.cityPlanAssetImportRollbackSummary.rollbackRecommendedRooms.includes('W4N4'), 'city plan debug service should summarize rooms with active rollback recommendations at empire scope');
    assert.ok(Memory.empire.cityPlanAssetImportRollbackSummary.stableRollbackRooms.includes('W4N4'), 'city plan debug service should summarize rooms with stable rollback recommendations at empire scope');
    assert.ok(Memory.empire.cityPlanAssetImportRollbackSummary.recoveredRooms.includes('W4N4'), 'city plan debug service should summarize rooms whose rollback recommendations stabilized after rollout recovered to enabled');
    assert.strictEqual(Memory.empire.cityPlanAssetImportRollbackSummary.actionRequired, false, 'city plan debug service should keep empire rollback action status false when no room is manually rollback-ready');
    assert.strictEqual(Memory.empire.cityPlanAssetImportRollbackSummary.rooms.W4N4.recommendedMode, 'enabled', 'city plan debug service should preserve room-level rollback recommendation details inside the empire rollback summary');
    Memory.rooms.W5N5 = {
        cityPlan: {
            schemaVersion: 2,
            sources: {
                source1: {
                    primaryMiningPos: { x: 9, y: 10, roomName: 'W5N5' },
                    containerPos: { x: 9, y: 10, roomName: 'W5N5' }
                }
            },
            controller: {
                primaryUpgradePos: { x: 24, y: 25, roomName: 'W5N5' },
                containerPos: { x: 24, y: 25, roomName: 'W5N5' }
            }
        },
        cityPlanAssetImportRollout: {
            requestedMode: 'disabled',
            effectiveMode: 'disabled'
        },
        cityPlanAssetImportRollbackGate: {
            readyForManualRollback: false
        },
        cityPlanAssetImportRollbackAction: {
            targetMode: 'enabled',
            reason: 'manual_operator_rollback'
        }
    };
    Memory.rooms.W6N6 = {
        cityPlan: {
            schemaVersion: 2,
            sources: {
                source1: {
                    primaryMiningPos: { x: 9, y: 10, roomName: 'W6N6' },
                    containerPos: { x: 9, y: 10, roomName: 'W6N6' }
                }
            },
            controller: {
                primaryUpgradePos: { x: 24, y: 25, roomName: 'W6N6' },
                containerPos: { x: 24, y: 25, roomName: 'W6N6' }
            }
        },
        cityPlanAssetImportRollout: {
            requestedMode: 'disabled',
            effectiveMode: 'disabled'
        },
        cityPlanAssetImportRollbackGate: {
            readyForManualRollback: true
        },
        cityPlanAssetImportRollbackAction: {
            targetMode: 'enabled',
            reason: 'manual_operator_rollback'
        }
    };
    Game.rooms.W5N5 = { name: 'W5N5' };
    Game.rooms.W6N6 = { name: 'W6N6' };
    Game.time = 450;
    cityPlanDebugService.analyze();
    assert.strictEqual(Memory.rooms.W5N5.cityPlanAssetImportRollout.requestedMode, 'disabled', 'city plan debug service should keep rollback-target rollout requested mode unchanged when the manual rollback gate is not ready');
    assert.strictEqual(Memory.rooms.W5N5.cityPlanAssetImportRollbackExecution.applied, false, 'city plan debug service should record a blocked manual rollback execution when the rollback gate is not ready');
    assert.ok(Memory.rooms.W5N5.cityPlanAssetImportRollbackExecution.blockedReasons.includes('rollback_gate_not_ready'), 'city plan debug service should explain why a manual rollback action was blocked');
    assert.strictEqual(Memory.rooms.W6N6.cityPlanAssetImportRollout.requestedMode, 'enabled', 'city plan debug service should switch rollback-target rollout requested mode back to enabled when the manual rollback gate is ready');
    assert.strictEqual(Memory.rooms.W6N6.cityPlanAssetImportRollout.effectiveMode, 'enabled', 'city plan debug service should make the manual rollback action affect migration mode in the same observation cycle');
    assert.strictEqual(Memory.rooms.W6N6.cityPlanMigration.changes.plannedStructuresAdded, 2, 'city plan debug service should re-enable legacy asset import during the same cycle after a manual rollback action is applied');
    assert.strictEqual(Memory.rooms.W6N6.cityPlanAssetImportRollbackExecution.applied, true, 'city plan debug service should persist successful manual rollback execution state');
    assert.strictEqual(Memory.rooms.W6N6.cityPlanAssetImportRollbackAction, undefined, 'city plan debug service should consume a successful manual rollback action once it has been applied');
    Memory.rooms.W7N7 = {
        cityPlan: {
            schemaVersion: 2,
            sources: {
                source1: {
                    primaryMiningPos: { x: 9, y: 10, roomName: 'W7N7' },
                    containerPos: { x: 9, y: 10, roomName: 'W7N7' }
                }
            },
            controller: {
                primaryUpgradePos: { x: 24, y: 25, roomName: 'W7N7' },
                containerPos: { x: 24, y: 25, roomName: 'W7N7' }
            }
        },
        cityPlanAssetImportRollout: {
            requestedMode: 'disabled',
            effectiveMode: 'disabled'
        },
        cityPlanAssetImportRollbackGate: {
            readyForManualRollback: true
        }
    };
    Memory.rooms.W8N8 = {
        cityPlan: {
            schemaVersion: 2,
            sources: {
                source1: {
                    primaryMiningPos: { x: 9, y: 10, roomName: 'W8N8' },
                    containerPos: { x: 9, y: 10, roomName: 'W8N8' }
                }
            },
            controller: {
                primaryUpgradePos: { x: 24, y: 25, roomName: 'W8N8' },
                containerPos: { x: 24, y: 25, roomName: 'W8N8' }
            }
        },
        cityPlanAssetImportRollout: {
            requestedMode: 'disabled',
            effectiveMode: 'disabled'
        },
        cityPlanAssetImportRollbackGate: {
            readyForManualRollback: false
        }
    };
    Memory.rooms.W9N9 = {
        cityPlan: {
            schemaVersion: 2,
            sources: {
                source1: {
                    primaryMiningPos: { x: 9, y: 10, roomName: 'W9N9' },
                    containerPos: { x: 9, y: 10, roomName: 'W9N9' }
                }
            },
            controller: {
                primaryUpgradePos: { x: 24, y: 25, roomName: 'W9N9' },
                containerPos: { x: 24, y: 25, roomName: 'W9N9' }
            }
        },
        cityPlanAssetImportRollout: {
            requestedMode: 'disabled',
            effectiveMode: 'disabled'
        },
        cityPlanAssetImportRollbackGate: {
            readyForManualRollback: true
        },
        cityPlanAssetImportRollbackAction: {
            targetMode: 'enabled',
            reason: 'existing_pending_action'
        }
    };
    Memory.empire.cityPlanAssetImportRollbackAction = {
        targetMode: 'enabled',
        rooms: ['W7N7', 'W8N8', 'W9N9', 'W10N10'],
        reason: 'manual_operator_batch_rollback'
    };
    Game.rooms.W7N7 = { name: 'W7N7' };
    Game.rooms.W8N8 = { name: 'W8N8' };
    Game.rooms.W9N9 = { name: 'W9N9' };
    Game.time = 500;
    cityPlanDebugService.analyze();
    assert.strictEqual(Memory.rooms.W7N7.cityPlanAssetImportRollbackExecution.applied, true, 'city plan debug service should dispatch empire batch rollback actions into room-level execution for ready rooms');
    assert.strictEqual(Memory.rooms.W8N8.cityPlanAssetImportRollbackExecution.applied, false, 'city plan debug service should still route batch-dispatched room actions through room-level rollback gate validation');
    assert.strictEqual(Memory.rooms.W9N9.cityPlanAssetImportRollbackExecution.reason, 'existing_pending_action', 'city plan debug service should not overwrite existing room-level rollback actions when batch dispatch encounters pending work');
    assert.strictEqual(Memory.empire.cityPlanAssetImportRollbackAction, undefined, 'city plan debug service should consume empire-level batch rollback action after dispatch');
    assert.strictEqual(Memory.empire.cityPlanAssetImportRollbackBatchExecution.applied, true, 'city plan debug service should persist successful empire batch rollback dispatch state');
    assert.ok(Memory.empire.cityPlanAssetImportRollbackBatchExecution.dispatchedRooms.includes('W7N7'), 'city plan debug service should report dispatched rooms in empire rollback batch execution state');
    assert.ok(Memory.empire.cityPlanAssetImportRollbackBatchExecution.dispatchedRooms.includes('W8N8'), 'city plan debug service should dispatch room-level rollback actions even when later room-level gate validation blocks execution');
    assert.ok(Memory.empire.cityPlanAssetImportRollbackBatchExecution.skippedRooms.includes('W10N10'), 'city plan debug service should report unknown target rooms as skipped during empire rollback batch dispatch');
    assert.ok(Memory.empire.cityPlanAssetImportRollbackBatchExecution.blockedReasonsByRoom.W9N9.includes('room_action_already_pending'), 'city plan debug service should preserve per-room blocked reasons when batch dispatch encounters pending room-level rollback actions');
    assert.strictEqual(Memory.rooms.W7N7.cityPlanAssetImportRollbackHistory.length, 1, 'city plan debug service should append successful room-level rollback executions into room history');
    assert.strictEqual(Memory.rooms.W7N7.cityPlanAssetImportRollbackHistory[0].applied, true, 'city plan debug service should record applied rollback executions in room history');
    assert.strictEqual(Memory.rooms.W7N7.cityPlanAssetImportRollbackExecution.cooldownUntil, 650, 'city plan debug service should set a cooldown window after successful room-level rollback execution');
    assert.strictEqual(Memory.empire.cityPlanAssetImportRollbackBatchHistory.length, 1, 'city plan debug service should append empire batch dispatch execution into batch history');
    assert.ok(Memory.empire.cityPlanAssetImportRollbackBatchHistory[0].dispatchedRooms.includes('W7N7'), 'city plan debug service should preserve dispatched rooms inside empire rollback batch history');
    Memory.rooms.W7N7.cityPlanAssetImportRollbackAction = {
        targetMode: 'enabled',
        reason: 'retry_during_cooldown'
    };
    Game.time = 550;
    cityPlanDebugService.analyze();
    assert.strictEqual(Memory.rooms.W7N7.cityPlanAssetImportRollbackExecution.applied, false, 'city plan debug service should block repeated room-level rollback actions while cooldown is active');
    assert.ok(Memory.rooms.W7N7.cityPlanAssetImportRollbackExecution.blockedReasons.includes('rollback_action_cooldown_active'), 'city plan debug service should explain repeated rollback blocks through cooldown metadata');
    assert.strictEqual(Memory.rooms.W7N7.cityPlanAssetImportRollbackAction, undefined, 'city plan debug service should consume blocked room-level rollback actions during cooldown');
    assert.strictEqual(Memory.rooms.W7N7.cityPlanAssetImportRollbackHistory.length, 2, 'city plan debug service should append blocked cooldown executions into room rollback history');
    Memory.rooms.W12N12 = {
        cityPlan: {
            schemaVersion: 2,
            sources: {
                source1: {
                    primaryMiningPos: { x: 9, y: 10, roomName: 'W12N12' },
                    containerPos: { x: 9, y: 10, roomName: 'W12N12' }
                }
            },
            controller: {
                primaryUpgradePos: { x: 24, y: 25, roomName: 'W12N12' },
                containerPos: { x: 24, y: 25, roomName: 'W12N12' }
            }
        },
        cityPlanAssetImportRollout: {
            requestedMode: 'disabled',
            effectiveMode: 'disabled'
        },
        cityPlanAssetImportRollbackGate: {
            readyForManualRollback: true
        },
        cityPlanAssetImportRollbackHistory: [
            { updatedAt: 1 }, { updatedAt: 2 }, { updatedAt: 3 }, { updatedAt: 4 }, { updatedAt: 5 }
        ]
    };
    Memory.empire.cityPlanAssetImportRollbackBatchHistory = [
        { updatedAt: 1 }, { updatedAt: 2 }, { updatedAt: 3 }, { updatedAt: 4 }, { updatedAt: 5 }
    ];
    Memory.empire.cityPlanAssetImportRollbackAction = {
        targetMode: 'enabled',
        rooms: ['W12N12'],
        reason: 'history_trim_batch'
    };
    Game.rooms.W12N12 = { name: 'W12N12' };
    Game.time = 700;
    cityPlanDebugService.analyze();
    assert.strictEqual(Memory.rooms.W12N12.cityPlanAssetImportRollbackHistory.length, 5, 'city plan debug service should keep only the most recent room rollback history entries');
    assert.strictEqual(Memory.rooms.W12N12.cityPlanAssetImportRollbackHistory[4].updatedAt, 700, 'city plan debug service should retain the newest room rollback history entry after trimming');
    assert.strictEqual(Memory.empire.cityPlanAssetImportRollbackBatchHistory.length, 5, 'city plan debug service should keep only the most recent empire rollback batch history entries');
    assert.strictEqual(Memory.empire.cityPlanAssetImportRollbackBatchHistory[4].updatedAt, 700, 'city plan debug service should retain the newest empire batch history entry after trimming');
    Memory.rooms.W1N1.cityPlan.plannedStructures = Memory.rooms.W1N1.cityPlan.plannedStructures.filter((entry) => entry.role !== 'controller_container');
    Memory.rooms.W1N1.cityPlan.controller.containerPos = { x: 24, y: 25, roomName: 'W1N1' };
    Memory.rooms.W1N1.cityPlan.sourceRuntime.sources = {};
    Game.time = 200;
    cityPlanDebugService.analyze();
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.v3Readiness.readyForRuntimeFallbackDisable, false, 'city plan debug service should clear runtime fallback-disable readiness when canonical runtime coverage regresses');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanRuntimeObservation.readyStreak, 0, 'city plan debug service should reset the runtime readiness streak when runtime fallback-disable readiness regresses');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.assetFallbackReadiness.controller_container.fallbackCount, 0, 'city plan debug service should stop surfacing compat fallback counts once debug fallback observation is retired');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetFallbackObservation.readyStreak, 13, 'city plan debug service should carry forward fallback-retirement observation when legacy coordinates are reintroduced');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportObservation.readyStreak, 0, 'city plan debug service should reset asset import retirement readiness when canonical planned assets regress and legacy import becomes necessary again');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportObservation.readyForAssetImportRemoval, false, 'city plan debug service should clear asset import retirement readiness when canonical planned assets regress');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRehearsal.readyForDisabledAssetImport, false, 'city plan debug service should report disabled-mode rehearsal not ready when canonical planned assets regress');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRehearsal.disabledModeWouldMissCanonicalAssets, true, 'city plan debug service should report disabled-mode rehearsal risk when canonical planned assets regress');
    assert.deepStrictEqual(Memory.rooms.W1N1.cityPlanAssetImportRehearsal.missingCanonicalAssetRoles, ['controller_container'], 'city plan debug service should surface missing canonical asset roles from disabled-mode rehearsal without mutating room memory');
    assert.strictEqual(Memory.rooms.W1N1.cityPlan.plannedStructures.some((entry) => entry.role === 'controller_container'), false, 'city plan debug service should keep disabled rehearsal non-persistent when current-schema room memory is already missing canonical planned assets');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRetirementGate.readyForDefaultDisabled, false, 'city plan debug service should close the consolidated default-disabled gate when disabled rehearsal detects missing canonical assets');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRetirementGate.rehearsalReady, false, 'city plan debug service should mark rehearsal gate false when disabled mode would miss canonical assets');
    assert.ok(Memory.rooms.W1N1.cityPlanAssetImportRetirementGate.blockingReasons.includes('disabled_rehearsal_missing_canonical_assets'), 'city plan debug service should report disabled rehearsal risk as a retirement-gate blocker when canonical assets regress');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRollout.requestedMode, 'disabled', 'city plan debug service should preserve room-level disabled rollout requests when the gate regresses');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRollout.effectiveMode, 'enabled', 'city plan debug service should force room-level rollout back to enabled when the retirement gate is not ready');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetImportRollout.readyForDisabled, false, 'city plan debug service should clear room-level rollout readiness when the retirement gate regresses');
    assert.ok(Memory.rooms.W1N1.cityPlanAssetImportRollout.blockedReasons.includes('disabled_rehearsal_missing_canonical_assets'), 'city plan debug service should carry retirement-gate blockers into room-level rollout state when disabled rollout is blocked');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanWorkPositionCleanupObservation.readyStreak, 0, 'city plan debug service should reset the work-position cleanup readiness streak when canonical runtime readiness regresses');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanAssetFallbackObservation.readyByRole.controller_container, true, 'city plan debug service should keep adapter-fallback retirement separate from canonical asset completeness');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.legacyCleanupReadiness.readyForControllerAssetFieldRemoval, false, 'city plan debug service should block controller asset-field removal when the canonical controller container is missing');
    assert.ok(Memory.rooms.W1N1.cityPlanDebug.legacyCleanupReadiness.blockedRoles.includes('controller_container'), 'city plan debug service should identify the canonical-missing controller role as cleanup-blocked');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.legacyCleanupReadiness.reasons.controller_container, 'canonical_asset_missing', 'city plan debug service should explain that canonical completeness blocks legacy cleanup');
    assert.deepStrictEqual(Memory.rooms.W1N1.cityPlan.controller.containerPos, { x: 24, y: 25, roomName: 'W1N1' }, 'city plan debug service should preserve the last legacy recovery coordinate when the canonical asset is missing');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.legacyCleanupReadiness.readyForSourceAssetFieldRemoval, true, 'city plan debug service should keep source asset-field removal readiness true when room-level asset cleanup remains complete');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.v3Readiness.assetFallbackObservationStable, true, 'city plan debug service should preserve cleanup-derived asset fallback observation stability once debug fallback observation is retired');
    assert.strictEqual(Memory.rooms.W1N1.cityPlanDebug.v3Readiness.readyForAssetFallbackDisable, true, 'city plan debug service should preserve asset fallback disable readiness once legacy coordinates are handled by cleanup rather than debug fallback observation');

    const controllerOnlyCleanupReady = buildLegacyCleanupReadiness({
        v3Readiness: {
            schemaCurrent: true,
            migrationObserved: true,
            sourceRuntimeValid: true,
            assetFallbackFree: true
        },
        assetFallbackReadiness: {
            controller_container: { fallbackFree: true },
            controller_link: { fallbackFree: true },
            source_container: { fallbackFree: true },
            source_link: { fallbackFree: true }
        }
    }, {
        readyStreak: 3,
        streakByRole: {
            controller_container: 3,
            controller_link: 3,
            source_container: 2,
            source_link: 2
        }
    });
    assert.strictEqual(controllerOnlyCleanupReady.readyForControllerAssetFieldRemoval, true, 'legacy cleanup readiness should allow controller asset-field removal once both controller roles satisfy the streak gate');
    assert.strictEqual(controllerOnlyCleanupReady.readyForSourceAssetFieldRemoval, false, 'legacy cleanup readiness should keep source asset-field removal gated until both source roles satisfy the streak gate');
    assert.ok(controllerOnlyCleanupReady.blockedRoles.includes('source_container'), 'legacy cleanup readiness should report source_container blocked when its streak gate is not yet satisfied');
    const canonicalMissingCleanupReady = buildLegacyCleanupReadiness({
        v3Readiness: {
            schemaCurrent: true,
            migrationObserved: true,
            sourceRuntimeValid: true,
            assetFallbackFree: true
        },
        assetFallbackReadiness: {
            controller_container: { fallbackFree: true },
            controller_link: { fallbackFree: true },
            source_container: { fallbackFree: true },
            source_link: { fallbackFree: true }
        },
        assetImportRehearsal: {
            missingCanonicalAssetRoles: ['controller_container']
        }
    }, {
        readyStreak: 3,
        streakByRole: {
            controller_container: 3,
            controller_link: 3,
            source_container: 3,
            source_link: 3
        }
    });
    assert.strictEqual(canonicalMissingCleanupReady.readyForControllerAssetFieldRemoval, false, 'legacy cleanup readiness should preserve recovery input until every controller canonical asset exists');
    assert.strictEqual(canonicalMissingCleanupReady.reasons.controller_container, 'canonical_asset_missing', 'legacy cleanup readiness should expose canonical completeness as the blocked reason');
    const cleanupExecution = cleanupLegacyAssetFields({
        controller: {
            containerPos: { x: 24, y: 25, roomName: 'W1N1' },
            linkPos: { x: 24, y: 24, roomName: 'W1N1' }
        },
        sources: {
            source1: {
                containerPos: { x: 9, y: 10, roomName: 'W1N1' },
                linkPos: { x: 10, y: 11, roomName: 'W1N1' }
            }
        }
    }, {
        readyForControllerAssetFieldRemoval: true,
        readyForSourceAssetFieldRemoval: true
    });
    assert.strictEqual(cleanupExecution.changed, true, 'legacy cleanup execution should report changes once controller compat fields are removed');
    assert.deepStrictEqual(cleanupExecution.removedFields, ['controller.containerPos', 'controller.linkPos'], 'legacy cleanup execution should only remove controller compat fields during the first cleanup wave');
    assert.strictEqual(cleanupExecution.cityPlan.controller.containerPos, undefined, 'legacy cleanup execution should remove controller container compatibility storage');
    assert.deepStrictEqual(cleanupExecution.cityPlan.sources.source1.containerPos, { x: 9, y: 10, roomName: 'W1N1' }, 'legacy cleanup execution should preserve source compatibility storage during the controller-only wave');
    const sourceCleanupExecution = cleanupLegacyAssetFields({
        controller: {
            containerPos: { x: 24, y: 25, roomName: 'W1N1' },
            linkPos: { x: 24, y: 24, roomName: 'W1N1' }
        },
        sources: {
            source1: {
                containerPos: { x: 9, y: 10, roomName: 'W1N1' },
                linkPos: { x: 10, y: 11, roomName: 'W1N1' }
            }
        }
    }, {
        readyForControllerAssetFieldRemoval: true,
        readyForSourceAssetFieldRemoval: true
    }, {
        cleanupSourceFields: true
    });
    assert.deepStrictEqual(sourceCleanupExecution.removedFields, ['controller.containerPos', 'controller.linkPos', 'sources.source1.containerPos', 'sources.source1.linkPos'], 'legacy cleanup execution should remove source compat fields once source cleanup is enabled');
    assert.strictEqual(sourceCleanupExecution.sourceFieldsRemoved, true, 'legacy cleanup execution should report source field cleanup when source cleanup is enabled');
    const workPositionCleanupReady = buildLegacyWorkPositionCleanupReadiness({
        schemaVersion: CITY_PLAN_SCHEMA_VERSION,
        sources: {
            source1: {
                primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' }
            }
        },
        controller: {
            primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' }
        },
        workPositions: {
            sources: {
                source1: {
                    mining: {
                        primary: { x: 9, y: 10, roomName: 'W1N1' }
                    }
                }
            },
            controller: {
                upgrade: {
                    primary: { x: 24, y: 25, roomName: 'W1N1' }
                }
            }
        }
    }, {
        v3Readiness: {
            schemaCurrent: true,
            migrationObserved: true
        },
        validation: {
            valid: true
        }
    }, {
        readyStreak: 3,
        controllerReadyStreak: 3,
        sourceReadyStreak: 3
    });
    assert.strictEqual(workPositionCleanupReady.readyForControllerWorkPositionFieldRemoval, true, 'work-position cleanup readiness should allow controller cleanup once canonical controller work positions stay stable through the observation window');
    assert.strictEqual(workPositionCleanupReady.readyForSourceWorkPositionFieldRemoval, true, 'work-position cleanup readiness should allow source cleanup once canonical source work positions stay stable through the observation window');
    const blockedWorkPositionCleanup = buildLegacyWorkPositionCleanupReadiness({
        schemaVersion: CITY_PLAN_SCHEMA_VERSION,
        sources: {
            source1: {
                primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' }
            }
        },
        controller: {
            primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' }
        },
        workPositions: {
            sources: {},
            controller: {
                upgrade: {
                    primary: { x: 24, y: 25, roomName: 'W1N1' }
                }
            }
        }
    }, {
        v3Readiness: {
            schemaCurrent: true,
            migrationObserved: true
        },
        validation: {
            valid: true
        }
    }, {
        readyStreak: 3,
        controllerReadyStreak: 3,
        sourceReadyStreak: 3
    });
    assert.strictEqual(blockedWorkPositionCleanup.readyForSourceWorkPositionFieldRemoval, false, 'work-position cleanup readiness should keep source cleanup gated when canonical source mining positions are missing');
    assert.ok(blockedWorkPositionCleanup.blockedFields.includes('sources.source1.primaryMiningPos'), 'work-position cleanup readiness should report legacy source mining fields as blocked when canonical work positions are missing');
    const workPositionCleanupExecution = cleanupLegacyWorkPositionFields({
        sources: {
            source1: {
                primaryMiningPos: { x: 9, y: 10, roomName: 'W1N1' }
            }
        },
        controller: {
            primaryUpgradePos: { x: 24, y: 25, roomName: 'W1N1' }
        }
    }, {
        readyForControllerWorkPositionFieldRemoval: true,
        readyForSourceWorkPositionFieldRemoval: true
    });
    assert.deepStrictEqual(workPositionCleanupExecution.removedFields, ['controller.primaryUpgradePos', 'sources.source1.primaryMiningPos'], 'work-position cleanup execution should remove legacy work-position compatibility fields once cleanup is enabled');
    assert.strictEqual(workPositionCleanupExecution.workPositionFieldsRemoved, true, 'work-position cleanup execution should report work-position cleanup once legacy work-position fields are removed');
}

runBehaviorChecks()
    .then(() => console.log('smoke checks passed'))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
