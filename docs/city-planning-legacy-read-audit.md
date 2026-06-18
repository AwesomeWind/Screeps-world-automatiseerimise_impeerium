# City Planning Legacy Read Audit

## Scope

This audit covers remaining legacy `cityPlan` field reads after the staged convergence work that moved core structure-asset consumers toward:

- `plannedStructures`
- `CityPlanLegacyAdapter`
- `CityAssetPolicy`
- `CityPlanSchema`

The purpose of this document is to separate acceptable compatibility reads from remaining execution-path reads that still block eventual legacy field deletion.

## Summary

The current system is in a mixed but controlled state:

- Structure asset reads for `container/link` have largely been converged onto `plannedStructures + adapter`.
- Remaining high-value convergence work is concentrated in source runtime state, not raw structure positions.
- Work-position fields have now been converged onto `cityPlan.workPositions + CityWorkPositionPolicy`.
- Planner producers and adapter/debug modules are expected to keep reading legacy fields for now.
- Canonical `cityPlan.sourceRuntime` storage now exists, execution consumers use default strict source-runtime reads or readiness-gated strict reads, and debug intentionally retains compat observation.

## Current Snapshot

### Completed

- execution reads for `controller_container`, `controller_link`, `source_container`, and `source_link` are now anchored on `plannedStructures + CityPlanLegacyAdapter` rather than direct legacy coordinate reads.
- execution reads for creep work positions are now anchored on `cityPlan.workPositions + CityWorkPositionPolicy`.
- canonical `cityPlan.sourceRuntime.sources[sourceId]` storage is now the only source-runtime model used by migration, runtime helpers, and debug summaries.
- planning producers now emit canonical source runtime through `cityPlan.sourceRuntime.sources[sourceId]` and no longer write legacy `preferredOutputRole / deliveryMode` compatibility fields.
- planning producers now emit canonical work positions through `cityPlan.workPositions` and no longer write legacy `primaryMiningPos / primaryUpgradePos` compatibility fields.
- `CityPlannerService` no longer publishes legacy source/controller asset-position compatibility storage in new city plans; source/container/link coordinates are now internal planner layout input that only feeds canonical `plannedStructures`.
- planner-owned container/link placement now resolves target coordinates from canonical `plannedStructures` rather than direct legacy `containerPos / linkPos` reads.
- defense asset protection now resolves controller/source container positions through `plannedStructures + CityPlanLegacyAdapter` rather than direct legacy container coordinate reads.
- `CityAssetPolicy.getSourceOutputPolicy()` now defaults to strict source-runtime reads.
- `LinkService`, `StructureLifecycleService`, `SpawnBureauService`, and `MinerStrategyService` now share the same runtime readiness gate through `RuntimeReadiness.shouldUseStrictSourceRuntime(roomMemory)`.

### Allowed To Remain

- `CityPlanLegacyAdapter` may still read legacy fields because it is the explicit compat boundary.
- `CityPlanDebug` may still read compat asset fallback state because it is the explicit observability boundary for rollback and migration readiness.
- migration may still preserve/import legacy asset coordinates when upgrading pre-v3 room memory.

### Remaining Cleanup

- decide when legacy asset position compatibility fields can stop being read by compat-only modules such as migration/adapter/debug fallback.
- decide when legacy work-position fallback reads can stop being supported in policy/migration paths.
- keep debug visibility for fallback sources and migration regressions until field deletion is complete.

### Document Use

- the staged rollout sections below are now historical rollout records plus remaining cleanup guidance.
- the active question is no longer how to tighten execution consumers; it is how to remove compatibility storage without losing rollback visibility.

## Classification

### Allowed: Planning Producers

Planning producers no longer need to publish legacy source/controller asset-position compatibility storage in newly generated city plans.

Remaining compatibility storage is limited to:

- migrated legacy room memory
- compat fallback paths in adapter/debug tooling

### Allowed: Adapter / Debug

These modules are expected to read legacy fields because they are the compatibility and observability layer:

- [CityPlanLegacyAdapter.js](/D:/MyCode/screeps_world/automatiseerimise_impeerium/src/planning/CityPlanLegacyAdapter.js:40)
- [CityPlanDebug.js](/D:/MyCode/screeps_world/automatiseerimise_impeerium/src/planning/CityPlanDebug.js:85)

This is the correct place for `planned-first / legacy-fallback` logic.

### Converged: Work Position Fields

These fields now have a dedicated model and execution entrypoint:

- [CityWorkPositionPolicy.js](/D:/MyCode/screeps_world/automatiseerimise_impeerium/src/planning/CityWorkPositionPolicy.js:1)
- [MinerStrategyService.js](/D:/MyCode/screeps_world/automatiseerimise_impeerium/src/strategies/MinerStrategyService.js:267)
- [UpgraderStrategyService.js](/D:/MyCode/screeps_world/automatiseerimise_impeerium/src/strategies/UpgraderStrategyService.js:148)

Current state:

- `primaryMiningPos` and `primaryUpgradePos` are creep work positions.
- They do not belong in `plannedStructures`.
- `cityPlan.workPositions` is now the primary model.
- `CityWorkPositionPolicy` is the execution-layer read entrypoint.
- Legacy `primaryMiningPos / primaryUpgradePos` now remain only as migration input for canonical `workPositions` regeneration.
- compatibility read ownership for work positions now belongs to `CityPlanMigration` only.
- `UpgraderStrategyService` is now the first strict work-position consumer and no longer uses legacy-only controller upgrade positions when canonical `workPositions.controller.upgrade.primary` is absent.
- `MinerStrategyService` is now the second strict work-position consumer and no longer uses legacy-only source mining positions when canonical `workPositions.sources[sourceId].mining.primary` is absent.

Remaining follow-up:

- schema/debug coverage for `workPositions` is complete
- keep migration import until legacy room memory is provably unnecessary

## Execution Reads Requiring Convergence

### P1: Source Runtime Consumer Tightening

These are the most important remaining execution-path dependencies. They do not read raw structure positions anymore, and the source runtime boundary is established. The remaining work is consumer tightening around policy/runtime-mode usage and compatibility observation.

#### LinkService

- [LinkService.js](/D:/MyCode/screeps_world/automatiseerimise_impeerium/src/services/LinkService.js:54)
- [LinkService.js](/D:/MyCode/screeps_world/automatiseerimise_impeerium/src/services/LinkService.js:111)

Current direct runtime writes:

- `SourceRuntimeState.promoteSourceToLinkPrimary(cityPlan, sourceId)`
- `SourceRuntimeState.transitionSourceRuntimeState(cityPlan, sourceId, event)`

Why this matters:

- `LinkService` is now the main source-logistics state transition owner.
- Runtime state storage is still legacy-backed, but write intent is now routed through a semantic helper instead of direct field patches.
- The runtime helper surface now also covers named transition/container-output semantics, not only link-primary promotion.
- The source runtime boundary is established through canonical runtime modes, named events, and debug visibility for invalid combinations.
- Remaining tightening is about keeping `linkNetwork.sources[sourceId].mode` aligned with shared runtime-mode constants and policy outputs.

#### StructureLifecycleService

- [StructureLifecycleService.js](/D:/MyCode/screeps_world/automatiseerimise_impeerium/src/services/StructureLifecycleService.js:40)

Why this matters:

- It already derives source-runtime meaning through `getSourceOutputPolicy(...)`.
- Remaining tightening is about using shared runtime mode constants for mirrored `linkNetwork` state checks.

#### MinerStrategyService

- [MinerStrategyService.js](/D:/MyCode/screeps_world/automatiseerimise_impeerium/src/strategies/MinerStrategyService.js:312)
- [MinerStrategyService.js](/D:/MyCode/screeps_world/automatiseerimise_impeerium/src/strategies/MinerStrategyService.js:332)

Why this matters:

- Structure-asset lookup has already been converged.
- Miner behavior already flows through `getSourceOutputPolicy(...)`.
- Remaining miner coupling is now mostly about keeping policy-only consumption stable while legacy-backed runtime storage remains in place.

#### CityAssetPolicy

- [CityAssetPolicy.js](/D:/MyCode/screeps_world/automatiseerimise_impeerium/src/planning/CityAssetPolicy.js:163)

Current runtime interpretation lives here:

- `preferredOutputRole`
- `deliveryMode`

This is acceptable for now because policy is the correct convergence target. It is not a bug, but it marks where the runtime-state model currently lives.

### P2: Controller Compatibility Reads

These are lower priority than source runtime state, but still worth noting.

#### SpawnBureauService

- [SpawnBureauService.js](/D:/MyCode/screeps_world/automatiseerimise_impeerium/src/services/SpawnBureauService.js:1)

Current state:

- controller-container presence is now resolved through `CityPlanLegacyAdapter`
- upgrader body/desired-count decisions no longer need to read `cityPlan.controller.containerPos` directly

This leaves controller compatibility as a much smaller concern than source runtime state.

### P3: Compatibility Iteration Reads

These reads are still in execution services, but they mainly enumerate existing source/controller collections rather than directly reading raw structure positions:

- [LinkService.js](/D:/MyCode/screeps_world/automatiseerimise_impeerium/src/services/LinkService.js:35)
- [StructureLifecycleService.js](/D:/MyCode/screeps_world/automatiseerimise_impeerium/src/services/StructureLifecycleService.js:37)

These do not block the current structure-asset model, but they show that `cityPlan.sources` is still the runtime state container.

## Fields Already Effectively Converged

The following are no longer primary execution-path problems:

- `source container` structure lookup
- `source link` structure lookup
- `controller container` structure lookup
- `controller link` structure lookup

These are now largely handled through:

- `CityPlanLegacyAdapter`
- `plannedStructures`
- service-local adapter-based structure resolution

This means the next convergence phase should focus on removing legacy compatibility storage/reads rather than reworking planner-side placement again.

## Priority

### Next Highest Priority

1. Keep tightening source runtime consumers in:
   - `LinkService`
   - `StructureLifecycleService`
   - `MinerStrategyService`

2. Keep source runtime meaning anchored in the unified policy/helper layer instead of letting services drift back toward direct field interpretation.

3. Prepare the final asset-position compatibility cleanup by converging remaining legacy readers:
   - `CityPlanMigration`
   - `CityPlanLegacyAdapter`

### Deferred

1. Controller compatibility cleanup outside spawn logic, if any direct reads remain

### Not Recommended Yet

1. Deleting legacy city plan fields
2. Adding static whitelist tests for every remaining legacy read
3. Forcing work positions into `plannedStructures`

## CityPlan v3 Readiness

The legacy execution-read convergence stage is effectively complete. The next stage should be `CityPlan v3` readiness, not immediate legacy field deletion.

### Canonical Models

The v3 target should treat these as canonical models:

- `plannedStructures` for planned structure assets, lifecycle, role, group, phase, and scope.
- `workPositions` for creep work positions such as source mining and controller upgrading.
- source runtime boundary through `SourceRuntimeState`, `CityAssetPolicy.getSourceOutputPolicy(...)`, source runtime modes, and source runtime events.

### Legacy Compatibility Storage

These fields remain legacy compatibility storage until a v3 migration and observation window proves they are safe to stop producing:

- `cityPlan.sources[sourceId].containerPos`
- `cityPlan.sources[sourceId].linkPos`
- `cityPlan.sources[sourceId].primaryMiningPos`
- `cityPlan.sources[sourceId].preferredOutputRole`
- `cityPlan.sources[sourceId].deliveryMode`
- `cityPlan.controller.containerPos`
- `cityPlan.controller.linkPos`
- `cityPlan.controller.primaryUpgradePos`

They are allowed in planning producers, adapters, debug summaries, tests, and migration code. They should not reappear as direct execution-path interpretation.

### Readiness Checklist

Before a schema-version bump, the following should be true:

- `CityPlanDebug.legacyFallbacks` has been observed in live rooms long enough to identify which fallbacks are still active.
- `CityPlanDebug.sourceRuntime.byMode` shows expected `container`, `link_transition`, and `link_primary` distribution.
- `CityPlanDebug.sourceRuntime.invalidSources` is empty or understood before migration.
- execution services continue consuming structure assets through adapters/policies, work positions through `CityWorkPositionPolicy`, and source runtime through `SourceRuntimeState + CityAssetPolicy`.
- migration rules can regenerate canonical models from legacy compatibility storage without changing behavior.

### Staged Rollout

Recommended rollout:

- `v3.0`: introduce schema/migration that regenerates canonical models while preserving legacy compatibility storage.
- `v3.1`: observe fallback usage through debug summaries and keep all execution paths on canonical models or policy/helper boundaries.
- `v3.2`: stop execution-layer fallback where debug data shows it is safe.
- `v3.3`: stop producing selected legacy fields after a stable observation period and clear rollback criteria.

The v3 work should start with migration design and rollback behavior, not field deletion.

### v3.1 Implementation Target

The `v3.1` phase should focus on observability rather than behavior change:

- record the last observed city plan migration result in room debug memory.
- summarize legacy fallback usage by role and source so fallback-free rooms can be identified.
- expose explicit `v3Readiness` flags for schema currency, migration observation, fallback freedom, and source runtime validity.
- keep fallback enabled until the debug summaries show it is safe to tighten execution paths in `v3.2`.

### V3.2a Fallback Disable Readiness

The first `v3.2` step should remain planning-only. `V3.2a` should define readiness and rollback rules before any execution-layer fallback is disabled.

The minimum readiness gate should be:

- `schemaCurrent === true`
- `migrationObserved === true`
- `legacyFallbackSummary.total === 0`
- `sourceRuntimeValid === true`
- `readyForFallbackDisable === true`

The observation window should require three consecutive debug updates with the readiness gate satisfied before a room is considered eligible for fallback disable. With the current `CityPlanDebugService` cadence, that means at least 150 ticks of stable observation.

The rollback criteria should be defined before implementation:

- any room reports `legacyFallbackSummary.total > 0` again.
- any room reports non-empty `sourceRuntime.invalidSources`.
- migration warnings appear that affect canonical model regeneration.
- an execution service reports missing planned assets or work positions after fallback tightening.

The first implementation after `V3.2a` should be narrow:

- `V3.2b`: add strict-versus-compat resolver control in the adapter layer without switching consumers.
- `V3.2c`: switch one low-risk consumer for `controller_container` only after the readiness gate has been observed long enough.

### V3.2b Adapter Strict Mode

The `V3.2b` phase should add explicit strict-versus-compat control to the resolver layer while preserving current runtime behavior for all existing consumers.

The resolver contract should remain stable:

- default calls stay in compat mode and may still use legacy fallback.
- strict calls pass `allowLegacyFallback: false`.
- strict resolution should return planned assets when canonical entries exist.
- strict resolution should return `{ asset: null, source: 'missing', legacyFallbackUsed: false }` when only legacy storage exists.

This phase should not switch any execution service to strict mode yet. `CityPlanDebug` should continue using compat reads so `legacyFallbackSummary` remains an honest observation channel for fallback usage.

### V3.2c First Strict Consumer

The first execution-layer strict read should be limited to `LinkService.setControllerContainerLifecycle()`.

- the target asset is `controller_container`.
- the resolver call should use `resolveControllerContainerAsset(cityPlan, { allowLegacyFallback: false })`.
- legacy-only controller container storage should no longer participate in lifecycle transitions through `LinkService`.
- `CityPlanDebug` should remain on compat reads so fallback observation stays available while only one consumer has switched.

The next candidate should be `SpawnBureauService`, but only after the single-consumer `controller_container` strict path has been observed without rollback signals.

### V3.2d controller_container strict rollout

The next rollout step should treat `controller_container` as a unified execution-layer migration target instead of splitting each consumer into a separate phase.

- execution-layer `controller_container` consumers should use strict canonical reads.
- `SpawnBureauService`, `MaintenancePlannerService`, and `ResourceMarketService` should read controller container assets with `getControllerContainerAsset(cityPlan, { allowLegacyFallback: false })`.
- legacy `controller.containerPos` should remain available for migration input, debug fallback observation, and rollback compatibility only.
- `CityPlanDebug` should continue using compat reads so `legacyFallbackSummary` still reports rooms that rely on legacy controller container storage.

After this rollout, `controller_container` execution reads should be strict across the main runtime services, while other asset types remain staged for later phases.

### V3.2e controller_link strict rollout

The next rollout step should treat `controller_link` as a unified execution-layer migration target.

- execution-layer `controller_link` consumers should use strict canonical reads.
- `LinkService`, `UpgraderStrategyService`, and `StructureLifecycleService` should read controller link assets with `getControllerLinkAsset(cityPlan, { allowLegacyFallback: false })`.
- legacy `controller.linkPos` should remain available for migration input, debug fallback observation, and rollback compatibility only.
- `CityPlanDebug` should continue using compat reads so `legacyFallbackSummary` still shows rooms that rely on legacy controller link storage.

After this rollout, `controller_link` execution reads should be strict across the main runtime services, while source asset types remain staged for later phases.

### V3.2f source_container strict rollout plan

The next phase should plan `source_container` rollout before changing runtime behavior. This asset type affects mining, builder prioritization, maintenance, and logistics, so the execution-layer migration should be split by risk instead of switched everywhere at once.

Recommended rollout batches:

- low-risk batch: `LinkService.setSourceContainerLifecycle()`
- medium-risk batch: `MaintenancePlannerService`
- high-risk batch: `ResourceMarketService`
- deferred batch: `MinerStrategyService`
- deferred batch: `BuilderStrategyService`

Rationale:

- `LinkService.setSourceContainerLifecycle()` already only mutates planned assets, so strict source-container resolution is mostly an explicit form of existing intent.
- `MaintenancePlannerService` can follow once strict source-container role detection is covered by tests.
- `ResourceMarketService` will change supply and demand semantics when legacy-only source containers are no longer treated as canonical source buffers.
- `MinerStrategyService` should remain deferred until source runtime, fallback delivery, and source-link promotion paths are observed together.
- `BuilderStrategyService` should remain deferred until early-room construction priority is validated without relying on legacy-only source container positions.

Test planning for later implementation should cover:

- strict `getSourceContainerAsset(cityPlan, sourceId, { allowLegacyFallback: false })`
- `LinkService.setSourceContainerLifecycle()` legacy-only source containers do not transition
- canonical source containers keep lifecycle transitions
- maintenance classification stops treating legacy-only source containers as canonical
- resource-market supply and demand behavior is updated intentionally rather than incidentally
- miner and builder workflows are left unchanged until their deferred phase begins

This phase should not change runtime logic. It should only define rollout order, testing scope, and rollback boundaries for the later `source_container` execution rollout.

### V3.2g source_container first strict consumer

The first execution-layer `source_container` strict rollout should stay limited to `LinkService.setSourceContainerLifecycle()`.

- `LinkService.setSourceContainerLifecycle()` should read `resolveSourceContainerAsset(cityPlan, sourceId, { allowLegacyFallback: false })`.
- legacy-only `sources[sourceId].containerPos` should no longer participate in source-container lifecycle transitions inside `LinkService`.
- canonical planned `source_container` assets should keep the existing `link_primary` and `retiring` transition behavior.
- `CityPlanDebug` should continue using compat reads so `legacyFallbackSummary` still reports rooms that rely on legacy source-container storage.
- `MaintenancePlannerService`, `ResourceMarketService`, `MinerStrategyService`, and `BuilderStrategyService` should remain deferred to later source-side rollout phases.

### V3.2h source_container maintenance strict rollout

The next source-side execution rollout should stay limited to `MaintenancePlannerService`.

- `getSourceContainerAsset(cityPlan, sourceId, options = {})` should support strict reads for source-container consumers that only need the asset.
- `MaintenancePlannerService` should read `getSourceContainerAsset(cityPlan, sourceId, { allowLegacyFallback: false })` when classifying container repair roles.
- legacy-only `sources[sourceId].containerPos` should no longer classify a structure as canonical `source_container` inside maintenance planning.
- canonical planned `source_container` assets should keep their current maintenance policy, including `link_primary` fallback repair bands.
- `CityPlanDebug` should continue using compat reads so `legacyFallbackSummary` still reports rooms that rely on legacy source-container storage.
- `ResourceMarketService`, `MinerStrategyService`, and `BuilderStrategyService` should remain deferred to later source-side rollout phases.

### V3.2i source_container resource-market strict rollout

The next source-side execution rollout should stay limited to `ResourceMarketService`.

- `isSourceContainerAsset(cityPlan, structure, sourceId, options = {})` should support strict reads for source-container structure classification.
- `ResourceMarketService.addStoreDemand()` should read `isSourceContainerAsset(cityPlan, structure, null, { allowLegacyFallback: false })` before suppressing generic container demand generation.
- legacy-only `sources[sourceId].containerPos` should no longer make `ResourceMarketService` treat a container as canonical `source_container`.
- canonical planned `source_container` assets should keep their current resource-market behavior, including skipping generic `storage_balance` sink demand.
- legacy-only source containers should fall back to generic container market behavior so `storage_balance` demand is still available when no canonical asset exists.
- `CityPlanDebug` should continue using compat reads so `legacyFallbackSummary` still reports rooms that rely on legacy source-container storage.
- `MinerStrategyService` and `BuilderStrategyService` should remain deferred to later source-side rollout phases.

### V3.2j source_container builder strict rollout

The next source-side execution rollout should stay limited to `BuilderStrategyService`.

- `BuilderStrategyService.isCriticalContainerSite()` should read `isSourceContainerAsset(cityPlan, site, null, { allowLegacyFallback: false })` when deciding whether a construction site is a canonical `source_container`.
- legacy-only `sources[sourceId].containerPos` should no longer make builder construction priority treat a container site as canonical `source_container`.
- canonical planned `source_container` construction sites should keep their current critical-container priority.
- controller-container critical construction should stay on its existing path in this phase.
- `CityPlanDebug` should continue using compat reads so `legacyFallbackSummary` still reports rooms that rely on legacy source-container storage.
- `MinerStrategyService` should remain deferred to the next source-side rollout phase.

### V3.2k source_container miner strict rollout

The next source-side execution rollout should stay limited to `MinerStrategyService`.

- `MinerStrategyService.getPlannedSourceContainerPos()` should read `getSourceContainerAsset(cityPlan, sourceId, { allowLegacyFallback: false })`.
- legacy-only `sources[sourceId].containerPos` should no longer influence miner `miningPos` selection.
- legacy-only `sources[sourceId].containerPos` should no longer let miner fallback-transfer logic treat a container as canonical planned source-container support.
- canonical planned `source_container` assets should keep their current mining-position priority and blocked-link fallback transfer behavior.
- `CityPlanDebug` should continue using compat reads so `legacyFallbackSummary` still reports rooms that rely on legacy source-container storage.
- source-container execution reads should now be strict across the main runtime consumers; `source_link` remains a later rollout.

### V3.2l source_link strict rollout plan

The next phase should plan `source_link` rollout before changing runtime behavior. Source links are more coupled than source containers because they influence source output policy, miner transfer behavior, link-network online detection, and lifecycle retirement readiness.

Recommended rollout batches:

- low-risk batch: `LinkService.findSourceLink()`
- medium-risk batch: `StructureLifecycleService.findSourceLink()`
- high-risk batch: `MinerStrategyService.findPlannedSourceLink()`
- deferred highest-risk batch: `CityAssetPolicy.getSourceOutputPolicy()`

Rationale:

- `LinkService.findSourceLink()` should eventually read strict canonical source-link assets so link-network state is not promoted from legacy-only `sources[sourceId].linkPos`.
- `StructureLifecycleService.findSourceLink()` should follow after link-network strict behavior is covered, because retirement readiness depends on recognizing the replacement source link.
- `MinerStrategyService.findPlannedSourceLink()` should remain later because miner transfer targets and blocked-link fallback behavior must stay aligned with source runtime state.
- `CityAssetPolicy.getSourceOutputPolicy()` should be the final source-link strict consumer because it reports canonical source-link output assets while also shaping `usesLinkOutput`, `bodyProfile`, `runtimeMode`, and source output semantics for other services.
- `CityPlanDebug` should continue using compat reads so legacy-only source-link fallback remains observable during the staged rollout.

Test planning for later implementation should cover:

- strict `getSourceLinkAsset(cityPlan, sourceId, { allowLegacyFallback: false })`
- legacy-only source links do not become link-network source links in `LinkService`
- canonical planned `source_link` assets keep existing link-network behavior
- legacy-only source links do not make source containers retire in `StructureLifecycleService`
- canonical planned `source_link` assets keep retirement readiness behavior
- miner transfer behavior stops targeting legacy-only source links only in the miner rollout phase
- `CityAssetPolicy.getSourceOutputPolicy()` stops treating legacy-only source links as canonical output assets only in the final policy rollout phase, while source runtime intent remains governed by `SourceRuntimeState`
- debug summaries keep reporting compat fallback usage for source links until legacy fields are deliberately removed

This phase should not change runtime logic. It should only define rollout order, testing scope, and rollback boundaries for the later `source_link` execution rollout.

### V3.3a source runtime canonical model plan

The next phase should plan a canonical storage model for source runtime without changing execution behavior yet. Structure-asset execution reads are now largely strict, but source runtime intent still lives in legacy-backed `cityPlan.sources[sourceId].preferredOutputRole` and `cityPlan.sources[sourceId].deliveryMode`.

The canonical target should be:

```js
cityPlan.sourceRuntime = {
  sources: {
    [sourceId]: {
      preferredOutputRole,
      deliveryMode
    }
  }
}
```

Runtime derivation should stay centralized:

- `SourceRuntimeState.resolveSourceRuntimeMode(preferredOutputRole, deliveryMode)` should remain the only place that derives `runtimeMode`, `valid`, and `error`.
- `runtimeMode` should stay derived rather than persisted in `cityPlan`.
- legacy `cityPlan.sources[sourceId].preferredOutputRole` and `cityPlan.sources[sourceId].deliveryMode` should remain compatibility storage until migration observation proves they are safe to stop reading and writing.

Recommended rollout sequence:

- `V3.3b`: migration and debug support canonical `cityPlan.sourceRuntime` while keeping all runtime consumers on current behavior
- `V3.3c`: `SourceRuntimeState.getSourceRuntimeState()` becomes canonical-first with legacy fallback
- `V3.3d`: `SourceRuntimeState.setSourceRuntimeState()` dual-writes canonical runtime storage and legacy compatibility fields
- `V3.3e`: observe fallback usage and invalid runtime combinations through debug summaries
- `V3.3f`: start disabling legacy runtime reads only after the observation window is satisfied

Test planning for later implementation should cover:

- migration backfills canonical `cityPlan.sourceRuntime.sources[sourceId]` without changing current runtime meaning
- `getSourceRuntimeState()` returns the same `preferredOutputRole`, `deliveryMode`, and derived `runtimeMode` during the dual-read phase
- `setSourceRuntimeState()` preserves compatibility for existing services during the dual-write phase
- `CityPlanDebug.sourceRuntime` and `v3Readiness` keep exposing invalid runtime combinations and fallback freedom during the migration window
- runtime consumer behavior remains stable while canonical storage is introduced behind the helper boundary

This phase should not change runtime logic. It should only define canonical runtime storage, migration order, observability requirements, and rollback boundaries for later source-runtime convergence.

### V3.3 completion status

The V3.3 source-runtime convergence work is now largely complete:

- `V3.3b` through `V3.3e` landed canonical runtime storage, migration coverage, compatibility observation, and the helper boundary for source runtime ownership.
- `V3.3f` introduced strict canonical-only runtime reads behind an explicit gate after the readiness window is satisfied.
- `V3.4a` stopped dual-writing legacy source runtime fields from `SourceRuntimeState.setSourceRuntimeState(...)`.
- `V3.4b` reduced legacy runtime fields to migration-import and debug-observation inputs; canonical/legacy mismatch stopped blocking runtime fallback-disable readiness.
- `V3.4c` removed legacy source runtime fields from migration import, runtime fallback, and debug mismatch observation. Missing canonical runtime now falls back only to default container semantics in non-strict reads.
- execution consumers now tighten source runtime through the readiness gate in `LinkService`, `StructureLifecycleService`, `SpawnBureauService`, and `MinerStrategyService`.
- `CityAssetPolicy.getSourceOutputPolicy()` now defaults to default strict source-runtime reads, while compat callers must explicitly pass `sourceRuntimeAllowLegacyFallback: true`.
- `CityPlanDebug` still observes compat asset fallback, but no longer compares canonical source runtime against legacy runtime fields.
- `RuntimeReadiness.shouldUseStrictSourceRuntime(roomMemory)` now centralizes the execution-layer readiness gate so all strict consumers share the same threshold and observation semantics.

## Recommended Next Step

The source runtime boundary is now fully canonical from planner output through runtime consumption. The remaining gap is compatibility storage cleanup outside source runtime itself.

Current boundary:

```js
{
  outputRole,
  bodyProfile,
  preferredOutputRole,
  deliveryMode,
  runtimeMode,
  usesLinkOutput,
  linkPrimary,
  shouldRetireSourceContainer
}
```

The runtime helper surface now provides:

- `setSourceLinkOutputTransition(cityPlan, sourceId)`
- `setSourceContainerOutput(cityPlan, sourceId)`
- `promoteSourceToLinkPrimary(cityPlan, sourceId)`
- `transitionSourceRuntimeState(cityPlan, sourceId, event)`

The next reasonable planning step is compat-only boundary hardening and legacy fallback observation cleanup:

1. keep `SourceRuntimeState.resolveSourceRuntimeMode(...)` as the single derivation point for runtime semantics
2. keep legacy work-position import limited to `CityPlanMigration` while old room memory is still expected
3. decide when compat-only readers such as migration/adapter/debug no longer need legacy asset-position fallback support
4. sequence compatibility-field deletion separately from unrelated structure-asset cleanup so rollback remains narrow

After that, the next phase should focus on legacy asset-position compatibility readers in narrow passes while preserving fallback debug visibility for rollback.
