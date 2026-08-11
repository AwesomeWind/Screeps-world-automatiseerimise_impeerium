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
- Canonical `cityPlan.sourceRuntime` storage now exists, execution consumers use default strict source-runtime reads or readiness-gated strict reads, and debug now summarizes canonical state plus cleanup metadata without actively resolving compat asset fallback.

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

- `CityPlanLegacyAdapter` may still resolve canonical planned assets for shared callers, but it should no longer read legacy asset coordinates after adapter hard retirement.
- `CityPlanDebug` may still summarize canonical asset/runtime state, migration metadata, and cleanup execution/readiness, but it should not actively resolve compat asset fallback.
- migration may still preserve/import legacy asset coordinates when upgrading pre-v3 room memory.
- adapter fallback should require explicit opt-in while execution callers stay strict by default.
- there should be no remaining active compat asset fallback activation points in production reads; execution services, strategies, and debug should stay on strict reads and never opt back into legacy asset fallback directly.
- `CityPlanMigration` remains the only import boundary for legacy asset-position storage when pre-v3 room memory still needs canonical regeneration.

### Remaining Cleanup

- decide when legacy asset position compatibility fields can stop being read by compat-only modules such as migration/adapter/cleanup boundaries.
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

### Allowed: Adapter / Debug Metadata

These modules own the remaining compatibility and observability surface:

- [CityPlanLegacyAdapter.js](/D:/MyCode/screeps_world/automatiseerimise_impeerium/src/planning/CityPlanLegacyAdapter.js:40)
- [CityPlanDebug.js](/D:/MyCode/screeps_world/automatiseerimise_impeerium/src/planning/CityPlanDebug.js:85)

`CityPlanLegacyAdapter` is now the canonical planned-asset lookup helper for shared callers. `CityPlanDebug` should only summarize canonical state, migration results, and cleanup metadata after fallback retirement.

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
- compatibility read ownership for work positions now belongs to `CityPlanMigration` import and `CityPlanLegacyCleanup` deletion only.
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

- `CityPlanDebug.assetFallbackReadiness` and cleanup metadata have remained stable long enough to justify keeping production reads strict.
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

For asset-position compatibility cleanup, the same continuous observation window should be applied per asset role before disabling fallback or deleting legacy `containerPos / linkPos` storage.

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

This phase should not switch any execution service to strict mode yet. At this stage, `CityPlanDebug` was still using compat reads so `legacyFallbackSummary` could act as the fallback observation channel.

### V3.2c First Strict Consumer

The first execution-layer strict read should be limited to `LinkService.setControllerContainerLifecycle()`.

- the target asset is `controller_container`.
- the resolver call should use `resolveControllerContainerAsset(cityPlan, { allowLegacyFallback: false })`.
- legacy-only controller container storage should no longer participate in lifecycle transitions through `LinkService`.
- at that stage, `CityPlanDebug` remained on compat reads so fallback observation stayed available while only one consumer had switched.

The next candidate should be `SpawnBureauService`, but only after the single-consumer `controller_container` strict path has been observed without rollback signals.

### V3.2d controller_container strict rollout

The next rollout step should treat `controller_container` as a unified execution-layer migration target instead of splitting each consumer into a separate phase.

- execution-layer `controller_container` consumers should use strict canonical reads.
- `SpawnBureauService`, `MaintenancePlannerService`, and `ResourceMarketService` should read controller container assets with `getControllerContainerAsset(cityPlan, { allowLegacyFallback: false })`.
- legacy `controller.containerPos` should remain available for migration input, debug fallback observation, and rollback compatibility only.
- at that stage, `CityPlanDebug` still used compat reads so `legacyFallbackSummary` reported rooms that relied on legacy controller container storage.

After this rollout, `controller_container` execution reads should be strict across the main runtime services, while other asset types remain staged for later phases.

### V3.2e controller_link strict rollout

The next rollout step should treat `controller_link` as a unified execution-layer migration target.

- execution-layer `controller_link` consumers should use strict canonical reads.
- `LinkService`, `UpgraderStrategyService`, and `StructureLifecycleService` should read controller link assets with `getControllerLinkAsset(cityPlan, { allowLegacyFallback: false })`.
- legacy `controller.linkPos` should remain available for migration input, debug fallback observation, and rollback compatibility only.
- at that stage, `CityPlanDebug` still used compat reads so `legacyFallbackSummary` showed rooms that relied on legacy controller link storage.

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
- at that stage, `CityPlanDebug` still used compat reads so `legacyFallbackSummary` reported rooms that relied on legacy source-container storage.
- `MaintenancePlannerService`, `ResourceMarketService`, `MinerStrategyService`, and `BuilderStrategyService` should remain deferred to later source-side rollout phases.

### V3.2h source_container maintenance strict rollout

The next source-side execution rollout should stay limited to `MaintenancePlannerService`.

- `getSourceContainerAsset(cityPlan, sourceId, options = {})` should support strict reads for source-container consumers that only need the asset.
- `MaintenancePlannerService` should read `getSourceContainerAsset(cityPlan, sourceId, { allowLegacyFallback: false })` when classifying container repair roles.
- legacy-only `sources[sourceId].containerPos` should no longer classify a structure as canonical `source_container` inside maintenance planning.
- canonical planned `source_container` assets should keep their current maintenance policy, including `link_primary` fallback repair bands.
- at that stage, `CityPlanDebug` still used compat reads so `legacyFallbackSummary` reported rooms that relied on legacy source-container storage.
- `ResourceMarketService`, `MinerStrategyService`, and `BuilderStrategyService` should remain deferred to later source-side rollout phases.

### V3.2i source_container resource-market strict rollout

The next source-side execution rollout should stay limited to `ResourceMarketService`.

- `isSourceContainerAsset(cityPlan, structure, sourceId, options = {})` should support strict reads for source-container structure classification.
- `ResourceMarketService.addStoreDemand()` should read `isSourceContainerAsset(cityPlan, structure, null, { allowLegacyFallback: false })` before suppressing generic container demand generation.
- legacy-only `sources[sourceId].containerPos` should no longer make `ResourceMarketService` treat a container as canonical `source_container`.
- canonical planned `source_container` assets should keep their current resource-market behavior, including skipping generic `storage_balance` sink demand.
- legacy-only source containers should fall back to generic container market behavior so `storage_balance` demand is still available when no canonical asset exists.
- at that stage, `CityPlanDebug` still used compat reads so `legacyFallbackSummary` reported rooms that relied on legacy source-container storage.
- `MinerStrategyService` and `BuilderStrategyService` should remain deferred to later source-side rollout phases.

### V3.2j source_container builder strict rollout

The next source-side execution rollout should stay limited to `BuilderStrategyService`.

- `BuilderStrategyService.isCriticalContainerSite()` should read `isSourceContainerAsset(cityPlan, site, null, { allowLegacyFallback: false })` when deciding whether a construction site is a canonical `source_container`.
- legacy-only `sources[sourceId].containerPos` should no longer make builder construction priority treat a container site as canonical `source_container`.
- canonical planned `source_container` construction sites should keep their current critical-container priority.
- controller-container critical construction should stay on its existing path in this phase.
- at that stage, `CityPlanDebug` still used compat reads so `legacyFallbackSummary` reported rooms that relied on legacy source-container storage.
- `MinerStrategyService` should remain deferred to the next source-side rollout phase.

### V3.2k source_container miner strict rollout

The next source-side execution rollout should stay limited to `MinerStrategyService`.

- `MinerStrategyService.getPlannedSourceContainerPos()` should read `getSourceContainerAsset(cityPlan, sourceId, { allowLegacyFallback: false })`.
- legacy-only `sources[sourceId].containerPos` should no longer influence miner `miningPos` selection.
- legacy-only `sources[sourceId].containerPos` should no longer let miner fallback-transfer logic treat a container as canonical planned source-container support.
- canonical planned `source_container` assets should keep their current mining-position priority and blocked-link fallback transfer behavior.
- at that stage, `CityPlanDebug` still used compat reads so `legacyFallbackSummary` reported rooms that relied on legacy source-container storage.
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
- at that stage, `CityPlanDebug` still used compat reads so legacy-only source-link fallback remained observable during the staged rollout.

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
- `CityPlanDebug` no longer observes compat asset fallback and now only summarizes canonical source runtime state, migration results, and cleanup metadata.
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

### V3.9 deletion-gate plan

The next execution phase should establish deletion gates before removing any remaining legacy asset-position storage:

- add a pure readiness helper that consumes `CityPlanDebug.v3Readiness`, `assetFallbackReadiness`, and `cityPlanAssetFallbackObservation`
- expose explicit cleanup gates for controller-side removal and source-side removal separately
- require the same continuous observation window for field deletion that is already required for fallback-disable readiness
- keep actual field deletion out of this phase so rollback remains a data-only concern rather than a behavior rollback

Recommended gate semantics:

- `readyForControllerAssetFieldRemoval` should require room-level readiness plus stable fallback-free observations for `controller_container` and `controller_link`
- `readyForSourceAssetFieldRemoval` should require room-level readiness plus stable fallback-free observations for `source_container` and `source_link`
- each role must also have a canonical `plannedStructures` asset before its legacy recovery coordinate can be deleted; adapter-fallback retirement alone is not proof of canonical completeness
- room-level readiness should continue to require `schemaCurrent`, `migrationObserved`, `sourceRuntimeValid`, and `assetFallbackFree`
- blocked roles should remain visible so the first deletion wave can target controller fields before source fields if observation maturity diverges

After V3.9 lands, the follow-up phase can remove legacy controller asset-position fields first, then handle source asset-position fields in a separate pass once the same deletion gate remains stable.

### V3.10 controller-only cleanup wave

The first automatic cleanup wave should stay narrow:

- execute cleanup only after `readyForControllerAssetFieldRemoval` becomes true
- remove only `cityPlan.controller.containerPos` and `cityPlan.controller.linkPos`
- keep `cityPlan.sources[sourceId].containerPos / linkPos` intact even if source-side readiness is also true
- persist cleanup execution metadata so rollback and audit can distinguish "room is ready" from "controller compat fields were already removed"

This keeps the first deletion wave aligned with the smallest blast radius while source compatibility storage continues to serve as a rollback and observation boundary for the later source-specific cleanup pass.

### V3.11 source cleanup wave

After controller cleanup has proven stable, the next automatic cleanup wave can enable source-side field removal:

- execute source cleanup only after `readyForSourceAssetFieldRemoval` becomes true
- preserve each legacy source coordinate when disabled-mode rehearsal reports that the corresponding canonical planned asset is missing
- keep `CityPlanMigration` as the only compatibility import boundary for legacy source asset coordinates
- enable source cleanup at the service layer so the helper can still support controller-only execution in narrower callers or tests
- persist source cleanup execution metadata with per-source removed fields so rollback and audit can verify which rooms have already dropped compat storage
- `cityPlanLegacyCleanup` metadata should remain visible so the compat-boundary audit can distinguish readiness, execution, and rollback state per room

This phase completes the asset-position compatibility cleanup while leaving migration and debug observation responsible for handling genuinely old room memory snapshots.

### V3.13 work-position cleanup wave

After asset-position cleanup has stabilized, the next cleanup wave should remove legacy work-position storage:

- execute work-position cleanup only after canonical `workPositions` remain stable through the same three-observation window
- remove `cityPlan.controller.primaryUpgradePos` only when `workPositions.controller.upgrade.primary` is present and stable
- remove `cityPlan.sources[sourceId].primaryMiningPos` only when `workPositions.sources[sourceId].mining.primary` is present and stable
- keep `CityPlanMigration` as the only import boundary for legacy work-position coordinates in genuinely old room memory
- persist work-position cleanup execution metadata alongside existing `cityPlanLegacyCleanup` output

This wave finishes the transition from legacy work-position storage to canonical `workPositions` without reintroducing fallback reads into execution consumers.

### V3.14 final legacy cleanup boundary audit

At this point the remaining compatibility boundaries should be explicit and narrow:

- asset-position compatibility read ownership is now limited to `CityPlanMigration` and `CityPlanLegacyCleanup`.
- work-position compatibility read ownership is now limited to `CityPlanMigration` and `CityPlanLegacyCleanup`.
- execution services and strategies should continue using strict canonical reads and should not opt back into legacy fallback.
- before `V3.15`, `CityPlanDebug` was the final active compat asset fallback activation point while rollback visibility was still required.
- `cityPlanLegacyCleanup` metadata should remain the audit trail for readiness, execution, and rollback state per room.

This audit phase is not a behavior change by itself. It exists to freeze the final allowed compatibility surface before any later removal of debug fallback observation or adapter legacy fallback support.

### V3.15 debug fallback retirement

After the final cleanup boundary audit is complete, `CityPlanDebug` should stop actively observing legacy asset fallback:

- there should be no remaining active compat asset fallback activation points in production reads
- `CityPlanDebug` should summarize canonical asset/runtime state and cleanup metadata only
- reintroduced legacy asset coordinates should be handled by `CityPlanLegacyCleanup` rather than reported as debug fallback usage
- before `V3.16b`, `CityPlanLegacyAdapter` still retained explicit fallback capability for transitional tests and removal planning, but `CityPlanDebug` no longer called it

This phase retires debug-side asset fallback observation while keeping migration import and cleanup execution available as the last compatibility boundaries.

### V3.16b adapter fallback retirement

After debug fallback retirement is stable, `CityPlanLegacyAdapter` should stop returning legacy asset records even for explicit compat fallback requests:

- `CityPlanLegacyAdapter` should no longer return legacy asset records even when compat fallback is requested explicitly
- canonical planned assets should still resolve as `planned`
- legacy-only asset coordinates should now resolve as `missing` rather than `legacy`
- getter helpers should return `null` for legacy-only asset coordinates regardless of fallback options
- migration import and cleanup execution remain the only compatibility boundaries that still consume legacy asset coordinates directly

This phase retired adapter-side asset fallback while temporarily preserving the `missing` diagnostic that distinguished legacy-only room memory from rooms with no asset record at all.

### V3.16c adapter legacy-read retirement

After adapter fallback retirement is stable, `CityPlanLegacyAdapter` should stop reading legacy asset coordinates entirely:

- `CityPlanLegacyAdapter` should no longer read legacy asset coordinates or return legacy-derived missing diagnostics
- canonical planned assets should still resolve as `planned`
- legacy-only controller/source container or link coordinates should now resolve as `none`
- structure-classification helpers should match canonical planned assets only
- asset-position compatibility read ownership should now be limited to `CityPlanMigration` import and `CityPlanLegacyCleanup` deletion

This phase completes adapter-side withdrawal from legacy asset-position compatibility. Remaining legacy asset coordinate ownership now lives only in migration import and cleanup execution.

### V3.17a migration import retirement plan

After adapter legacy-read retirement is stable, the next phase should plan when `CityPlanMigration` can stop regenerating canonical asset structures from legacy coordinates without changing runtime behavior yet:

- `CityPlanMigration` should remain the last canonical asset-regeneration boundary for genuinely old room memory until migration retirement gates are satisfied
- asset-position migration import should not be removed until canonical `plannedStructures` remain complete without regeneration
- cleanup execution should have already removed reintroduced legacy asset coordinates in steady-state room memory before migration import retirement begins
- work-position migration import should be planned separately from asset-position migration import so rollback stays narrow
- test coverage should explicitly include pre-canonical room memory migration, canonical-only room memory migration, and post-cleanup steady-state room memory

Recommended migration retirement gates:

- migrated room memory should already carry complete canonical `plannedStructures` for controller and source container/link assets before migration import removal
- `CityPlanLegacyCleanup` should continue proving that legacy asset coordinates are deleted during steady-state execution, rather than merely ignored
- migration change metadata should show that regenerated planned assets have stopped appearing in steady-state rooms
- rollback should be defined in terms of restoring migration import only, without reopening adapter/debug fallback behavior

This phase is planning-only. It keeps migration import intact while defining the exact readiness gates, rollback surface, and test scope required before any later removal of legacy asset-position regeneration.

### V3.17b migration asset import dry-run readiness

Before removing asset-position import from `CityPlanMigration`, the migration result should expose dry-run readiness metadata without changing import behavior yet:

- migration metadata should explicitly report whether canonical planned assets were already complete before legacy asset import ran
- migration metadata should report whether legacy asset coordinates regenerated any canonical controller/source container or link planned structures
- migration metadata should list which canonical asset roles were missing before import and which roles were regenerated during import
- steady-state canonical rooms should report ready for asset import removal only when migration no longer regenerates any controller/source container or link planned structures
- debug-service migration snapshots should persist the same readiness metadata so room-level observation can distinguish genuinely old room memory from already-canonical steady-state rooms

This phase is still non-destructive. It adds the observability needed to prove that migration asset import is inactive in steady-state rooms before any later retirement of legacy asset-position regeneration.

### V3.17c asset import readiness observation

After migration dry-run readiness metadata exists, room-level observation should track whether asset-position import retirement remains stable across real ticks:

- `CityPlanDebugService` should persist room-level `cityPlanAssetImportObservation` state derived from migration readiness metadata
- three consecutive migration observations should be required before a room reports ready for asset import removal
- legacy asset import regeneration should reset the readiness streak
- room-level observation should retain the latest canonical completeness and regenerated-role details so audit output can distinguish genuinely old room memory from steady-state canonical rooms
- debug summaries should surface the same asset import observation state for per-room inspection without changing migration behavior

This phase is still observability-only. It does not disable migration import, but it defines the stable room-level signal required before any later retirement switch is introduced.

### V3.18a migration asset import controlled-disable path

After room-level readiness observation is available, the next step should make migration asset import explicitly switchable without changing the default behavior:

- asset-position import should be switchable between enabled and disabled modes without changing the default migration behavior
- default migration should continue running with asset import enabled so genuinely old room memory still self-heals
- disabled mode should stop regenerating controller/source container and link planned structures from legacy coordinates while preserving readiness diagnostics
- disabled mode should still continue schema upgrade, canonical source-runtime backfill, and work-position migration so the retirement rehearsal stays narrowly scoped to asset import only
- rollback should consist of restoring enabled mode, without reopening adapter or debug fallback paths

This phase introduces the controlled-disable code path but does not flip production defaults. It exists to make later retirement testing explicit, reversible, and narrowly scoped.

### V3.18b asset import disabled rehearsal observation

After the controlled-disable path exists, debug observation should rehearse the disabled mode without changing persisted migration behavior:

- default migration should remain enabled while rehearsal observes disabled-mode readiness
- `CityPlanDebugService` should run a disabled-mode rehearsal against room memory without writing the rehearsal result back into `cityPlan`
- disabled rehearsal should not mutate room memory
- rehearsal output should report whether disabled mode would miss canonical controller/source container or link planned assets
- rehearsal output should remain visible in room-level debug state so retirement readiness can be evaluated before any production default changes

This phase is still observational. It proves whether disabled asset import would be safe on current room memory while preserving the existing self-healing migration path for genuinely old snapshots.

### V3.18c asset import retirement gate consolidation

After disabled-mode rehearsal observation is available, the next step should consolidate all retirement signals into one explicit gate for future default-disable rollout:

- `CityPlanDebugService` should persist a consolidated `cityPlanAssetImportRetirementGate` state per room
- `readyForDefaultDisabled` should only become true when observation stability, disabled rehearsal, and legacy asset cleanup are all complete
- `blockingReasons` should remain explicit so rollout blockers can be distinguished without re-reading raw migration or cleanup metadata
- missing canonical asset roles from disabled rehearsal should remain attached to the consolidated gate for targeted diagnosis
- this gate should remain observational only and must not change the default migration mode by itself

This phase turns scattered retirement signals into one auditable default-disable gate. It still does not switch production migration behavior, but it defines the exact room-level condition required before any future default change is considered.

### V3.19 room-level default-disabled rollout decision

After the retirement gate exists, the next step should make room-level rollout intent explicit without switching migration behavior yet:

- `CityPlanDebugService` should persist room-level `cityPlanAssetImportRollout` state per room
- `requestedMode` should represent whether rollout wants `enabled` or `disabled` migration asset import for that room
- `effectiveMode` should remain `enabled` until the consolidated retirement gate reports `readyForDefaultDisabled`
- `blockedReasons` should carry forward retirement-gate blockers when `requestedMode` is `disabled` but the room is not yet eligible
- `rollbackMode` should remain `enabled` so rollback is explicit before any later behavior switch is introduced

This phase is still decision-only. It records per-room rollout intent and eligibility, but it does not make `CityPlanMigration` consume that rollout state yet.

### V3.20 controlled migration-mode consumption

After room-level rollout decision state exists, the next step should let debug-managed migration consume the persisted effective rollout mode in a narrowly scoped way:

- `CityPlanDebugService` should choose migration asset import mode from the persisted room-level `effectiveMode`
- effective rollout mode should only take effect on a later observation cycle after it has already been persisted
- requested rollout mode alone should not change migration behavior unless the persisted effective mode is already disabled
- default migration behavior outside the debug-managed room-memory path should remain unchanged
- rollback should continue to mean restoring room-level effective mode to `enabled`

This phase is the first behavior switch for asset import retirement, but it remains narrowly scoped to the debug-managed migration entrypoint. It does not globalize the rollout decision or change the pure migration API defaults.

### V3.21 rollout execution observation

After debug-managed migration begins consuming persisted rollout state, the next step should record what actually executed so rollback decisions are based on observed behavior rather than intended state:

- `CityPlanDebugService` should persist room-level `cityPlanAssetImportExecution` state per room
- `consumedMode` should record the asset import mode actually passed into migration for that tick
- execution observation should retain `requestedMode` and `effectiveMode` so rollout intent can be compared against what was consumed
- execution observation should expose `rollbackRecommended` and explicit `rollbackReasons` for room-level rollback guidance
- disabled execution should recommend rollback when canonical planned asset roles are still missing after migration
- enabled execution should recommend rollback when migration still had to regenerate canonical planned assets from legacy coordinates
- rollback reasons should remain explicit so rollout reversions can be audited without re-reading raw migration readiness metadata

This phase is observational again. It does not change rollout selection by itself, but it closes the loop between rollout decision and migration behavior so the next retirement steps can use real execution evidence.

### V3.22 rollback gate observation

After rollout execution observation is available, the next step should accumulate rollback evidence into an explicit room-level gate without mutating rollout state:

- `CityPlanDebugService` should persist room-level `cityPlanAssetImportRollbackGate` state per room
- rollback gate should mirror the latest execution-level `rollbackRecommended` and explicit `rollbackReasons`
- rollback gate should track `readyStreak` and expose `stableRollbackRecommended` after consecutive rollback recommendations
- rollback gate should expose `readyForManualRollback` only when rollback evidence is stable and the room is still currently running disabled rollout
- rollback gate should retain `consumedMode`, `requestedMode`, and `effectiveMode` so rollback evidence can be compared against rollout intent and current state
- blocking reasons should remain explicit, including unstable rollback observation and rooms that have already recovered to enabled rollout

This phase remains observational. It does not perform rollback, but it defines a stable, auditable gate for whether manual rollback is still relevant after execution evidence has accumulated.

### V3.23 rollback summary convergence

After room-level rollback gate observation exists, the next step should converge those room signals into one empire-level operational summary:

- `CityPlanDebugService` should persist empire-level `cityPlanAssetImportRollbackSummary`
- summary should enumerate `observedRooms`, `rollbackRecommendedRooms`, `stableRollbackRooms`, and `readyForManualRollbackRooms`
- summary should expose `recoveredRooms` for rooms whose rollback evidence stayed stable after rollout had already returned to `enabled`
- summary should preserve room-level recommendation details so operators do not need to reopen each room memory entry to understand rollback causes
- summary should expose explicit `actionRequired` when any room remains manually rollback-ready

This phase is still observational. It does not execute rollback, but it gives the migration rollout a single empire-level surface for pending rollback attention and recovered rooms.

### V3.24 controlled manual rollback action

After empire-level rollback summary exists, the next step should add a controlled room-level operator action for re-enabling migration asset import:

- `CityPlanDebugService` should consume room-level `cityPlanAssetImportRollbackAction`
- action should only accept rollback target mode `enabled`
- action should only apply when `cityPlanAssetImportRollbackGate.readyForManualRollback` is already true for that room
- applied actions should switch room-level rollout back to `requestedMode: enabled` and `effectiveMode: enabled` before that tick's migration consumes rollout state
- `CityPlanDebugService` should persist room-level `cityPlanAssetImportRollbackExecution` with `applied`, previous rollout state, and explicit `blockedReasons`

This phase is execution-scoped but still controlled. It does not introduce automatic rollback; it only adds a testable and auditable operator entrypoint for re-enabling migration asset import per room.

### V3.25 empire batch rollback action

After controlled room-level rollback action exists, the next step should add an empire-level batching layer that distributes the same rollback intent across multiple rooms:

- `CityPlanDebugService` should consume empire-level `cityPlanAssetImportRollbackAction`
- batch action should only distribute rollback target mode `enabled`
- batch dispatch should write room-level `cityPlanAssetImportRollbackAction` records and let existing room-level execution continue to own validation and rollout mutation
- batch dispatch should not overwrite rooms that already have pending room-level rollback actions
- `CityPlanDebugService` should persist empire-level `cityPlanAssetImportRollbackBatchExecution` with dispatched rooms, skipped rooms, and per-room blocked reasons

This phase extends operator control width, not rollback behavior depth. It reuses the existing room-level rollback execution path and keeps automatic rollback out of scope.

### V3.26 rollback action history and cooldown

After room-level and empire-level rollback actions exist, the next step should preserve execution history and prevent repeated rollback triggers from firing again immediately:

- `CityPlanDebugService` should persist room-level `cityPlanAssetImportRollbackHistory`
- `CityPlanDebugService` should persist empire-level `cityPlanAssetImportRollbackBatchHistory`
- successful room-level rollback execution should set `cooldownUntil` and block repeated rollback actions until the cooldown window expires
- blocked cooldown executions should remain visible in room-level rollback history so operators can distinguish validation failures from repeated-trigger suppression
- room-level and empire-level rollback histories should keep only a bounded number of recent entries

This phase is still operational hardening, not new rollback behavior. It keeps manual and batch rollback flows auditable while preventing rapid repeated execution of the same rollback intent.
