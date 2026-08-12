const assert = require('assert');
const fs = require('fs');
const path = require('path');

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
        resolveCapabilityMode,
        validateCapabilityControlPolicy
    } = await import('../config/EmpirePolicy.js');

    assert.ok(DEFAULT_EMPIRE_POLICY.roomGovernor, 'room governor policy defaults should exist');
    assert.strictEqual(DEFAULT_EMPIRE_POLICY.roomGovernor.shadow, true, 'room governor should default to shadow mode');
    assert.strictEqual(DEFAULT_EMPIRE_POLICY.roomGovernor.thresholds.sourceWorkPerSource, 5, 'room governor should expose initial capability thresholds through policy');
    assert.strictEqual(DEFAULT_EMPIRE_POLICY.capabilityControl.capabilities.upgradeWork.defaultMode, 'shadow', 'upgrade work should default to shadow mode');
    assert.strictEqual(DEFAULT_EMPIRE_POLICY.capabilityControl.readiness.minSamples, 50, 'capability readiness should require enough samples by default');
    assert.deepStrictEqual(validateCapabilityControlPolicy(DEFAULT_EMPIRE_POLICY.capabilityControl), [], 'the default capability policy should satisfy the centralized validator');
    for (const [label, policyOverride, expectedBlocker] of [
        ['string enabled flag', { enabled: 'false' }, 'invalid_capability_control_enabled'],
        ['string emergency flag', { emergencyDisable: 'true' }, 'invalid_capability_control_emergency_disable'],
        ['negative controller threshold', { controllerEmergencyTicks: -1 }, 'invalid_controller_emergency_ticks'],
        ['fractional fallback threshold', { fallbackSuspendCount: 2.5 }, 'invalid_fallback_suspend_count'],
        ['negative readiness sample threshold', { readiness: { ...DEFAULT_EMPIRE_POLICY.capabilityControl.readiness, minSamples: -1 } }, 'invalid_readiness_policy'],
        ['readiness ratio above one', { readiness: { ...DEFAULT_EMPIRE_POLICY.capabilityControl.readiness, minKnownRatio: 1.1 } }, 'invalid_readiness_policy'],
        ['negative readiness snapshot age', { readiness: { ...DEFAULT_EMPIRE_POLICY.capabilityControl.readiness, maxSnapshotAge: -1 } }, 'invalid_readiness_policy']
    ]) {
        const invalidPolicy = {
            ...DEFAULT_EMPIRE_POLICY.capabilityControl,
            ...policyOverride
        };
        assert.ok(validateCapabilityControlPolicy(invalidPolicy).includes(expectedBlocker), `${label} should be rejected without coercion`);
    }

    const {
        CAPABILITY_ROLLOUT_FIELDS,
        appendCapabilitySample,
        evaluateCapabilityReadiness
    } = await import('../governance/CapabilityRolloutReadiness.js');
    const {
        arbitrateUpgradeWork,
        advanceUpgradeWorkControl
    } = await import('../governance/SpawnCapabilityArbiter.js');

    const legacyUpgradeIntent = {
        role: 'upgrader',
        quotaKey: 'upgrader:W1N1:controller',
        priority: 35,
        body: ['work', 'carry', 'move'],
        memory: { role: 'upgrader', homeRoom: 'W1N1' }
    };
    const legacyHaulerIntent = {
        role: 'hauler',
        quotaKey: 'hauler:W1N1:source1',
        priority: 45,
        body: ['carry', 'move']
    };
    const governorUpgradeCandidate = {
        role: 'upgrader',
        quotaKey: 'upgrader:W1N1:controller',
        priority: 36,
        body: ['work', 'work', 'carry', 'move'],
        memory: { role: 'upgrader', homeRoom: 'W1N1', source: 'governor' }
    };
    const safeArbitrationInput = {
        roomName: 'W1N1',
        legacyIntents: [legacyHaulerIntent, legacyUpgradeIntent],
        governorCandidate: governorUpgradeCandidate,
        governorDecision: {
            gap: 2,
            budgetBlocked: false,
            priority: 36,
            current: 1,
            spawning: 0,
            reasons: ['upgrade_gap']
        },
        readiness: { ready: true, blockers: [] },
        safety: {
            emergencyDisable: false,
            snapshotPresent: true,
            snapshotFresh: true,
            coreHealthy: true,
            lifecycleEligible: true,
            cpuMode: 'normal',
            controllerEmergency: false,
            autoSuspended: false
        },
        requestedMode: 'active'
    };
    const shadowArbitration = arbitrateUpgradeWork({
        ...safeArbitrationInput,
        requestedMode: 'shadow'
    });
    assert.strictEqual(shadowArbitration.action, 'keep', 'shadow arbitration should keep legacy intents');
    assert.strictEqual(shadowArbitration.adoptedSource, 'legacy', 'shadow arbitration should adopt the legacy source');
    assert.strictEqual(shadowArbitration.effectiveMode, 'shadow', 'shadow arbitration should remain in shadow mode');
    assert.deepStrictEqual(shadowArbitration.intents, safeArbitrationInput.legacyIntents, 'shadow arbitration should return the complete legacy intents');
    assert.notStrictEqual(shadowArbitration.intents, safeArbitrationInput.legacyIntents, 'shadow arbitration should return a new intents array');
    const malformedShadowArbitration = arbitrateUpgradeWork({
        ...safeArbitrationInput,
        legacyIntents: null,
        requestedMode: 'shadow'
    });
    assert.strictEqual(malformedShadowArbitration.action, 'keep', 'shadow arbitration should remain a safe no-op for a malformed legacy intent list');
    assert.deepStrictEqual(malformedShadowArbitration.intents, [], 'shadow arbitration should normalize a malformed legacy intent list to an empty list');
    assert.ok(malformedShadowArbitration.reasons.includes('invalid_legacy_intents'), 'shadow arbitration should explain a malformed legacy intent list without throwing');

    const externalUpgradeIntent = {
        role: 'upgrader',
        quotaKey: 'upgrader:W2N2:controller',
        priority: 34,
        body: ['work', 'carry', 'move']
    };
    const secondLocalUpgradeIntent = {
        ...legacyUpgradeIntent,
        priority: 33,
        marker: 'duplicate-local-quota'
    };
    const replaceLegacyIntents = [legacyHaulerIntent, legacyUpgradeIntent, externalUpgradeIntent, secondLocalUpgradeIntent];
    const replaceArbitration = arbitrateUpgradeWork({
        ...safeArbitrationInput,
        legacyIntents: replaceLegacyIntents
    });
    assert.strictEqual(replaceArbitration.action, 'replace', 'safe active arbitration should replace the target quota when a gap exists');
    assert.strictEqual(replaceArbitration.adoptedSource, 'governor', 'safe active replacement should adopt the governor source');
    assert.strictEqual(replaceArbitration.effectiveMode, 'active', 'safe active replacement should remain active');
    assert.deepStrictEqual(replaceArbitration.intents, [legacyHaulerIntent, governorUpgradeCandidate, externalUpgradeIntent], 'replacement should occupy the first target position and preserve all non-target intent order');
    assert.strictEqual(replaceArbitration.intents[0], legacyHaulerIntent, 'replacement should preserve unrelated intent objects');
    assert.strictEqual(replaceArbitration.intents[2], externalUpgradeIntent, 'replacement should preserve external upgrader demand');

    const suppressLegacyIntents = [legacyUpgradeIntent, legacyHaulerIntent, externalUpgradeIntent, secondLocalUpgradeIntent];
    const budgetSuppressArbitration = arbitrateUpgradeWork({
        ...safeArbitrationInput,
        legacyIntents: suppressLegacyIntents,
        governorDecision: { ...safeArbitrationInput.governorDecision, budgetBlocked: true }
    });
    assert.strictEqual(budgetSuppressArbitration.action, 'suppress', 'a blocked upgrade budget should suppress the target quota');
    assert.strictEqual(budgetSuppressArbitration.adoptedSource, 'governor', 'safe suppression should adopt the governor decision');
    assert.deepStrictEqual(budgetSuppressArbitration.intents, [legacyHaulerIntent, externalUpgradeIntent], 'budget suppression should remove only the exact target quota');
    const nullCandidateBudgetSuppressArbitration = arbitrateUpgradeWork({
        ...safeArbitrationInput,
        legacyIntents: suppressLegacyIntents,
        governorCandidate: null,
        governorDecision: { ...safeArbitrationInput.governorDecision, budgetBlocked: true }
    });
    assert.strictEqual(nullCandidateBudgetSuppressArbitration.action, 'suppress', 'budget suppression must not require a governor candidate');
    assert.deepStrictEqual(nullCandidateBudgetSuppressArbitration.intents, [legacyHaulerIntent, externalUpgradeIntent], 'candidate-free budget suppression should still preserve unrelated intents');
    const coveredSuppressArbitration = arbitrateUpgradeWork({
        ...safeArbitrationInput,
        legacyIntents: suppressLegacyIntents,
        governorDecision: { ...safeArbitrationInput.governorDecision, gap: 0 }
    });
    assert.strictEqual(coveredSuppressArbitration.action, 'suppress', 'a covered upgrade capability should suppress the target quota');
    assert.deepStrictEqual(coveredSuppressArbitration.intents, [legacyHaulerIntent, externalUpgradeIntent], 'covered capability suppression should preserve unrelated intent order');
    const nullCandidateCoveredSuppressArbitration = arbitrateUpgradeWork({
        ...safeArbitrationInput,
        legacyIntents: [legacyHaulerIntent, externalUpgradeIntent],
        governorCandidate: null,
        governorDecision: { ...safeArbitrationInput.governorDecision, gap: 0 }
    });
    assert.strictEqual(nullCandidateCoveredSuppressArbitration.action, 'suppress', 'an empty covered quota should be a safe candidate-free suppression no-op');
    assert.deepStrictEqual(nullCandidateCoveredSuppressArbitration.intents, [legacyHaulerIntent, externalUpgradeIntent], 'an empty covered quota should retain all unrelated intents');

    const fallbackCases = [
        ['null gap', { governorDecision: { ...safeArbitrationInput.governorDecision, gap: null } }],
        ['missing snapshot', { safety: { ...safeArbitrationInput.safety, snapshotPresent: false } }],
        ['stale snapshot', { safety: { ...safeArbitrationInput.safety, snapshotFresh: false } }],
        ['core critical', { safety: { ...safeArbitrationInput.safety, coreHealthy: false } }],
        ['ineligible lifecycle', { safety: { ...safeArbitrationInput.safety, lifecycleEligible: false } }],
        ['critical CPU', { safety: { ...safeArbitrationInput.safety, cpuMode: 'critical' } }],
        ['not ready', { readiness: { ready: false, blockers: ['insufficient_samples'] } }],
        ['automatic suspension', { safety: { ...safeArbitrationInput.safety, autoSuspended: true } }],
        ['invalid decision field', { governorDecision: { ...safeArbitrationInput.governorDecision, current: -1 } }],
        ['empty candidate body', { governorCandidate: { ...governorUpgradeCandidate, body: [] } }],
        ['null candidate body part', { governorCandidate: { ...governorUpgradeCandidate, body: [null] } }],
        ['empty candidate body part', { governorCandidate: { ...governorUpgradeCandidate, body: [''] } }],
        ['unknown candidate body part', { governorCandidate: { ...governorUpgradeCandidate, body: ['boosted_work'] } }],
        ['missing object body type', { governorCandidate: { ...governorUpgradeCandidate, body: [{}] } }],
        ['unknown object body type', { governorCandidate: { ...governorUpgradeCandidate, body: [{ type: 'boosted_work' }] } }],
        ['missing candidate memory', { governorCandidate: { ...governorUpgradeCandidate, memory: undefined } }],
        ['candidate priority mismatch', { governorCandidate: { ...governorUpgradeCandidate, priority: 37 } }]
    ];
    for (const [label, override] of fallbackCases) {
        const fallbackArbitration = arbitrateUpgradeWork({
            ...safeArbitrationInput,
            ...override
        });
        assert.strictEqual(fallbackArbitration.action, 'fallback', `${label} should fall back`);
        assert.strictEqual(fallbackArbitration.effectiveMode, 'shadow', `${label} should expose shadow as the effective fallback mode`);
        assert.strictEqual(fallbackArbitration.adoptedSource, 'legacy', `${label} should adopt the legacy source`);
        assert.deepStrictEqual(fallbackArbitration.intents, safeArbitrationInput.legacyIntents, `${label} should return the complete legacy intents`);
        assert.notStrictEqual(fallbackArbitration.intents, safeArbitrationInput.legacyIntents, `${label} should return a new intents array`);
        assert.ok(fallbackArbitration.reasons.length > 0, `${label} should explain the fallback`);
    }

    const globalHoldArbitration = arbitrateUpgradeWork({
        ...safeArbitrationInput,
        safety: { ...safeArbitrationInput.safety, emergencyDisable: true }
    });
    assert.strictEqual(globalHoldArbitration.action, 'keep', 'a global hold should be a legacy no-op rather than an ordinary fallback');
    assert.strictEqual(globalHoldArbitration.effectiveMode, 'shadow', 'a global hold should force the effective mode to shadow');
    assert.strictEqual(globalHoldArbitration.requestedMode, 'active', 'a global hold should retain the active request');
    assert.deepStrictEqual(globalHoldArbitration.intents, safeArbitrationInput.legacyIntents, 'a global hold should preserve the complete legacy intents');
    assert.ok(globalHoldArbitration.reasons.includes('capability_control_hold'), 'a global hold should expose its distinct reason');

    const standardBodyCandidate = {
        ...governorUpgradeCandidate,
        body: ['move', 'work', 'carry', 'attack', 'ranged_attack', 'heal', 'claim', 'tough', { type: 'work' }]
    };
    const standardBodyArbitration = arbitrateUpgradeWork({
        ...safeArbitrationInput,
        governorCandidate: standardBodyCandidate
    });
    assert.strictEqual(standardBodyArbitration.action, 'replace', 'all standard string and object body parts should be valid candidate parts');

    const emergencyKeepArbitration = arbitrateUpgradeWork({
        ...safeArbitrationInput,
        governorDecision: { ...safeArbitrationInput.governorDecision, gap: 0 },
        safety: { ...safeArbitrationInput.safety, controllerEmergency: true }
    });
    assert.strictEqual(emergencyKeepArbitration.action, 'keep', 'controller emergency should keep a legacy upgrader instead of suppressing it');
    assert.strictEqual(emergencyKeepArbitration.adoptedSource, 'legacy', 'controller emergency keep should adopt legacy');
    assert.deepStrictEqual(emergencyKeepArbitration.intents, safeArbitrationInput.legacyIntents, 'controller emergency keep should preserve the complete legacy list');
    assert.ok(emergencyKeepArbitration.reasons.includes('controller_emergency_keep_legacy'), 'controller emergency keep should expose its safety reason');
    const nullCandidateEmergencyKeepArbitration = arbitrateUpgradeWork({
        ...safeArbitrationInput,
        governorCandidate: null,
        governorDecision: { ...safeArbitrationInput.governorDecision, gap: 0 },
        safety: { ...safeArbitrationInput.safety, controllerEmergency: true }
    });
    assert.strictEqual(nullCandidateEmergencyKeepArbitration.action, 'keep', 'controller emergency legacy keep must not require a governor candidate');

    const emergencyReplaceArbitration = arbitrateUpgradeWork({
        ...safeArbitrationInput,
        legacyIntents: [legacyHaulerIntent],
        governorDecision: {
            ...safeArbitrationInput.governorDecision,
            gap: 0,
            budgetBlocked: true,
            current: 0,
            spawning: 0
        },
        safety: { ...safeArbitrationInput.safety, controllerEmergency: true }
    });
    assert.strictEqual(emergencyReplaceArbitration.action, 'replace', 'an uncovered controller emergency should allow a valid governor candidate');
    assert.strictEqual(emergencyReplaceArbitration.adoptedSource, 'governor', 'an uncovered controller emergency should adopt the governor candidate');
    assert.deepStrictEqual(emergencyReplaceArbitration.intents, [legacyHaulerIntent, governorUpgradeCandidate], 'an emergency candidate should append when no target quota exists');

    const fallbackDecision = {
        requestedMode: 'active',
        effectiveMode: 'shadow',
        adoptedSource: 'legacy',
        action: 'fallback',
        reasons: ['snapshot_stale']
    };
    const activeDecision = {
        requestedMode: 'active',
        effectiveMode: 'active',
        adoptedSource: 'governor',
        action: 'replace',
        reasons: ['upgrade_gap']
    };
    const fallbackControl1 = advanceUpgradeWorkControl({
        previous: null,
        requestedMode: 'active',
        decision: fallbackDecision,
        fallbackSuspendCount: 3,
        tick: 100
    });
    assert.strictEqual(fallbackControl1.fallbackCount, 1, 'the first consecutive fallback should set the fallback count to one');
    assert.strictEqual(fallbackControl1.autoSuspended, false, 'the first fallback should not suspend control');
    const fallbackControl2 = advanceUpgradeWorkControl({
        previous: fallbackControl1,
        requestedMode: 'active',
        decision: fallbackDecision,
        fallbackSuspendCount: 3,
        tick: 101
    });
    assert.strictEqual(fallbackControl2.fallbackCount, 2, 'the second consecutive fallback should increment the fallback count');
    const heldControl = advanceUpgradeWorkControl({
        previous: fallbackControl2,
        requestedMode: 'active',
        decision: globalHoldArbitration,
        fallbackSuspendCount: 3,
        tick: 102
    });
    assert.strictEqual(heldControl.fallbackCount, 2, 'a global hold should preserve an existing fallback count');
    assert.strictEqual(heldControl.autoSuspended, false, 'a global hold must not turn a prior fallback count into automatic suspension');
    assert.strictEqual(heldControl.fallbackReason, 'snapshot_stale', 'a global hold should preserve the prior fallback reason');
    assert.deepStrictEqual(heldControl.transitionEvents, [], 'a global hold should not emit fallback or suspension transitions');

    const nullDecisionControl = advanceUpgradeWorkControl({
        previous: fallbackControl1,
        requestedMode: 'active',
        decision: null,
        fallbackSuspendCount: 3,
        tick: 101
    });
    assert.strictEqual(nullDecisionControl.action, 'fallback', 'a null control decision should become a synthetic fallback');
    assert.strictEqual(nullDecisionControl.effectiveMode, 'shadow', 'a synthetic fallback should use shadow as its effective mode');
    assert.strictEqual(nullDecisionControl.adoptedSource, 'legacy', 'a synthetic fallback should retain the legacy source');
    assert.ok(nullDecisionControl.reasons.includes('invalid_control_decision'), 'a synthetic fallback should explain the invalid control decision');
    assert.strictEqual(nullDecisionControl.fallbackCount, 2, 'a null control decision should continue the prior fallback count');
    assert.strictEqual(nullDecisionControl.autoSuspended, false, 'a second fallback from an invalid decision should not suspend early');

    const invalidControlDecisions = [
        ['unknown action', { ...activeDecision, action: 'pause' }],
        ['unknown effective mode', { ...activeDecision, effectiveMode: 'fallback' }],
        ['unknown adopted source', { ...activeDecision, adoptedSource: 'mixed' }],
        ['inconsistent fallback', { ...fallbackDecision, effectiveMode: 'active' }],
        ['inconsistent replace', { ...activeDecision, effectiveMode: 'shadow' }],
        ['inconsistent suppress', { ...activeDecision, action: 'suppress', adoptedSource: 'legacy' }],
        ['inconsistent keep', { ...activeDecision, action: 'keep' }],
        ['invalid reasons', { ...activeDecision, reasons: 'upgrade_gap' }]
    ];
    for (const [label, invalidDecision] of invalidControlDecisions) {
        const invalidDecisionControl = advanceUpgradeWorkControl({
            previous: fallbackControl2,
            requestedMode: 'active',
            decision: invalidDecision,
            fallbackSuspendCount: 3,
            tick: 102
        });
        assert.strictEqual(invalidDecisionControl.action, 'fallback', `${label} should become a synthetic fallback`);
        assert.strictEqual(invalidDecisionControl.effectiveMode, 'shadow', `${label} should fall back to shadow mode`);
        assert.strictEqual(invalidDecisionControl.adoptedSource, 'legacy', `${label} should fall back to legacy`);
        assert.ok(invalidDecisionControl.reasons.includes('invalid_control_decision'), `${label} should explain the synthetic fallback`);
        assert.strictEqual(invalidDecisionControl.fallbackCount, 3, `${label} should not clear the previous fallback count`);
        assert.strictEqual(invalidDecisionControl.autoSuspended, true, `${label} should suspend at the third consecutive fallback`);
    }
    for (const [label, validDecision] of [
        ['active governor suppress', budgetSuppressArbitration],
        ['active legacy keep', emergencyKeepArbitration],
        ['shadow legacy keep', shadowArbitration]
    ]) {
        const validDecisionControl = advanceUpgradeWorkControl({
            previous: fallbackControl2,
            requestedMode: validDecision.requestedMode,
            decision: validDecision,
            fallbackSuspendCount: 3,
            tick: 102
        });
        assert.strictEqual(validDecisionControl.action, validDecision.action, `${label} should remain a valid control decision`);
        assert.strictEqual(validDecisionControl.reasons.includes('invalid_control_decision'), false, `${label} should not become a synthetic fallback`);
        assert.strictEqual(validDecisionControl.fallbackCount, 0, `${label} should clear the consecutive fallback count`);
    }
    const fallbackControl3 = advanceUpgradeWorkControl({
        previous: fallbackControl2,
        requestedMode: 'active',
        decision: fallbackDecision,
        fallbackSuspendCount: 3,
        tick: 102
    });
    assert.strictEqual(fallbackControl3.fallbackCount, 3, 'the third consecutive fallback should increment the fallback count');
    assert.strictEqual(fallbackControl3.fallbackReason, 'snapshot_stale', 'fallback control should retain the leading fallback reason');
    assert.strictEqual(fallbackControl3.autoSuspended, true, 'the third consecutive fallback should automatically suspend active control');
    assert.strictEqual(fallbackControl3.suspendedAt, 102, 'automatic suspension should record the transition tick');
    assert.deepStrictEqual(fallbackControl3.transitionEvents.map((event) => event.type), ['upgrade_work_auto_suspended'], 'automatic suspension should expose one transition event');

    const nanThresholdControl = advanceUpgradeWorkControl({
        previous: fallbackControl2,
        requestedMode: 'active',
        decision: fallbackDecision,
        fallbackSuspendCount: NaN,
        tick: 102
    });
    assert.strictEqual(nanThresholdControl.autoSuspended, true, 'NaN fallback thresholds should use the default threshold of three');
    const negativeThresholdControl = advanceUpgradeWorkControl({
        previous: null,
        requestedMode: 'active',
        decision: fallbackDecision,
        fallbackSuspendCount: -1,
        tick: 100
    });
    assert.strictEqual(negativeThresholdControl.autoSuspended, false, 'negative fallback thresholds should not suspend before the default threshold');
    const stringThresholdControl = advanceUpgradeWorkControl({
        previous: null,
        requestedMode: 'active',
        decision: fallbackDecision,
        fallbackSuspendCount: '1',
        tick: 100
    });
    assert.strictEqual(stringThresholdControl.autoSuspended, false, 'string fallback thresholds should not be coerced into a suspension threshold');
    assert.deepStrictEqual(Object.keys(fallbackControl3).sort(), [
        'action',
        'adoptedSource',
        'autoSuspended',
        'effectiveMode',
        'fallbackCount',
        'fallbackReason',
        'lastDecisionAt',
        'rearmed',
        'reasons',
        'requestedMode',
        'suspendedAt',
        'transitionEvents'
    ], 'upgrade work control should expose only the fixed persistence schema plus transition outputs');

    const recoveredActiveControl = advanceUpgradeWorkControl({
        previous: fallbackControl2,
        requestedMode: 'active',
        decision: activeDecision,
        fallbackSuspendCount: 3,
        tick: 102
    });
    assert.strictEqual(recoveredActiveControl.fallbackCount, 0, 'one safe active decision should clear the consecutive fallback count');
    assert.strictEqual(recoveredActiveControl.fallbackReason, null, 'one safe active decision should clear the fallback reason');
    assert.strictEqual(recoveredActiveControl.autoSuspended, false, 'a safe active decision before the threshold should remain unsuspended');

    const stillSuspendedControl = advanceUpgradeWorkControl({
        previous: fallbackControl3,
        requestedMode: 'active',
        decision: activeDecision,
        fallbackSuspendCount: 3,
        tick: 103
    });
    assert.strictEqual(stillSuspendedControl.autoSuspended, true, 'an active request should remain paused after automatic suspension');
    assert.strictEqual(stillSuspendedControl.fallbackCount, 3, 'an active request should not erase the fallback count while paused');
    assert.strictEqual(stillSuspendedControl.fallbackReason, 'snapshot_stale', 'an active request should retain the suspension reason while paused');
    assert.strictEqual(stillSuspendedControl.suspendedAt, 102, 'an active request should retain the original suspension tick');
    assert.strictEqual(stillSuspendedControl.rearmed, false, 'a repeated active request should not rearm control');

    const shadowDecision = {
        requestedMode: 'shadow',
        effectiveMode: 'shadow',
        adoptedSource: 'legacy',
        action: 'keep',
        reasons: []
    };
    const suspendedShadowControl = advanceUpgradeWorkControl({
        previous: stillSuspendedControl,
        requestedMode: 'shadow',
        decision: shadowDecision,
        fallbackSuspendCount: 3,
        tick: 104
    });
    assert.strictEqual(suspendedShadowControl.requestedMode, 'shadow', 'a suspended control should record the explicit shadow request');
    assert.strictEqual(suspendedShadowControl.autoSuspended, true, 'one shadow tick should not clear automatic suspension');
    assert.strictEqual(suspendedShadowControl.fallbackCount, 3, 'one shadow tick should retain the suspension count');
    assert.strictEqual(suspendedShadowControl.fallbackReason, 'snapshot_stale', 'one shadow tick should retain the suspension reason');
    assert.strictEqual(suspendedShadowControl.suspendedAt, 102, 'one shadow tick should retain the suspension tick');
    assert.strictEqual(suspendedShadowControl.rearmed, false, 'a shadow request alone should not report rearming');
    assert.deepStrictEqual(suspendedShadowControl.transitionEvents, [], 'a shadow request alone should not emit a transition event');

    const rearmedActiveControl = advanceUpgradeWorkControl({
        previous: suspendedShadowControl,
        requestedMode: 'active',
        decision: activeDecision,
        fallbackSuspendCount: 3,
        tick: 105
    });
    assert.strictEqual(rearmedActiveControl.requestedMode, 'active', 'the rearmed control should record the active request');
    assert.strictEqual(rearmedActiveControl.autoSuspended, false, 'an explicit shadow to active transition should clear automatic suspension');
    assert.strictEqual(rearmedActiveControl.fallbackCount, 0, 'rearming with a safe active decision should clear fallback count');
    assert.strictEqual(rearmedActiveControl.fallbackReason, null, 'rearming should clear the stored fallback reason');
    assert.strictEqual(rearmedActiveControl.suspendedAt, null, 'rearming should clear the suspension tick');
    assert.strictEqual(rearmedActiveControl.rearmed, true, 'an explicit shadow to active transition should report rearming');
    assert.deepStrictEqual(rearmedActiveControl.transitionEvents.map((event) => event.type), ['upgrade_work_rearmed'], 'rearming should expose exactly one transition event');

    const rearmedFallbackControl = advanceUpgradeWorkControl({
        previous: suspendedShadowControl,
        requestedMode: 'active',
        decision: fallbackDecision,
        fallbackSuspendCount: 3,
        tick: 105
    });
    assert.strictEqual(rearmedFallbackControl.fallbackCount, 1, 'a fallback on the rearm tick should count from a cleared suspension history');
    assert.strictEqual(rearmedFallbackControl.fallbackReason, 'snapshot_stale', 'a fallback on the rearm tick should retain the current fallback reason');
    assert.strictEqual(rearmedFallbackControl.autoSuspended, false, 'one fallback on the rearm tick should not immediately suspend control again');
    assert.strictEqual(rearmedFallbackControl.suspendedAt, null, 'a fallback on the rearm tick should clear the old suspension tick');
    assert.strictEqual(rearmedFallbackControl.rearmed, true, 'a fallback decision should not hide the explicit rearm transition');
    assert.deepStrictEqual(rearmedFallbackControl.transitionEvents.map((event) => event.type), ['upgrade_work_rearmed'], 'a fallback on the rearm tick should emit only the rearm event');

    const thresholdOneRearmedFallback = advanceUpgradeWorkControl({
        previous: suspendedShadowControl,
        requestedMode: 'active',
        decision: fallbackDecision,
        fallbackSuspendCount: 1,
        tick: 105
    });
    assert.strictEqual(thresholdOneRearmedFallback.fallbackCount, 1, 'a threshold-one fallback on the rearm tick should count the current fallback once');
    assert.strictEqual(thresholdOneRearmedFallback.autoSuspended, false, 'a rearm tick should never immediately suspend even when the fallback threshold is one');
    assert.strictEqual(thresholdOneRearmedFallback.rearmed, true, 'a threshold-one fallback should retain the rearm transition');
    assert.deepStrictEqual(thresholdOneRearmedFallback.transitionEvents.map((event) => event.type), ['upgrade_work_rearmed'], 'a threshold-one fallback on the rearm tick should emit only rearmed');

    const thresholdOneNextFallback = advanceUpgradeWorkControl({
        previous: thresholdOneRearmedFallback,
        requestedMode: 'active',
        decision: fallbackDecision,
        fallbackSuspendCount: 1,
        tick: 106
    });
    assert.strictEqual(thresholdOneNextFallback.fallbackCount, 2, 'the next fallback after rearming should continue the new fallback sequence');
    assert.strictEqual(thresholdOneNextFallback.autoSuspended, true, 'the next fallback after rearming should apply the configured threshold');
    assert.strictEqual(thresholdOneNextFallback.rearmed, false, 'the next active fallback should not report another rearm');
    assert.deepStrictEqual(thresholdOneNextFallback.transitionEvents.map((event) => event.type), ['upgrade_work_auto_suspended'], 'the next fallback after rearming should emit the suspension transition');

    const frozenLegacyIntents = Object.freeze([
        Object.freeze({ ...legacyHaulerIntent, body: Object.freeze([...legacyHaulerIntent.body]) }),
        Object.freeze({
            ...legacyUpgradeIntent,
            body: Object.freeze([...legacyUpgradeIntent.body]),
            memory: Object.freeze({ ...legacyUpgradeIntent.memory })
        })
    ]);
    const frozenGovernorCandidate = Object.freeze({
        ...governorUpgradeCandidate,
        body: Object.freeze([...governorUpgradeCandidate.body]),
        memory: Object.freeze({ ...governorUpgradeCandidate.memory })
    });
    const frozenGovernorDecision = Object.freeze({
        ...safeArbitrationInput.governorDecision,
        reasons: Object.freeze([...safeArbitrationInput.governorDecision.reasons])
    });
    const frozenReadiness = Object.freeze({ ready: true, blockers: Object.freeze([]) });
    const frozenSafety = Object.freeze({ ...safeArbitrationInput.safety });
    const frozenArbitrationInput = Object.freeze({
        ...safeArbitrationInput,
        legacyIntents: frozenLegacyIntents,
        governorCandidate: frozenGovernorCandidate,
        governorDecision: frozenGovernorDecision,
        readiness: frozenReadiness,
        safety: frozenSafety
    });
    const frozenInputSnapshot = JSON.stringify(frozenArbitrationInput);
    const frozenArbitration = arbitrateUpgradeWork(frozenArbitrationInput);
    assert.strictEqual(JSON.stringify(frozenArbitrationInput), frozenInputSnapshot, 'arbitration should not mutate deeply frozen input objects');
    assert.notStrictEqual(frozenArbitration.intents, frozenLegacyIntents, 'arbitration should return a new intents array for frozen input');
    assert.notStrictEqual(frozenArbitration.reasons, frozenGovernorDecision.reasons, 'arbitration should return a new reasons array for frozen input');

    const frozenPreviousControl = Object.freeze({
        ...fallbackControl2,
        reasons: Object.freeze([...fallbackControl2.reasons]),
        transitionEvents: Object.freeze([...fallbackControl2.transitionEvents])
    });
    const frozenActiveDecision = Object.freeze({
        ...activeDecision,
        reasons: Object.freeze([...activeDecision.reasons])
    });
    const frozenControlSnapshot = JSON.stringify({ frozenPreviousControl, frozenActiveDecision });
    const frozenAdvancedControl = advanceUpgradeWorkControl({
        previous: frozenPreviousControl,
        requestedMode: 'active',
        decision: frozenActiveDecision,
        fallbackSuspendCount: 3,
        tick: 106
    });
    assert.strictEqual(JSON.stringify({ frozenPreviousControl, frozenActiveDecision }), frozenControlSnapshot, 'control advancement should not mutate deeply frozen inputs');
    assert.notStrictEqual(frozenAdvancedControl.reasons, frozenActiveDecision.reasons, 'control advancement should return a new reasons array');
    assert.notStrictEqual(frozenAdvancedControl.transitionEvents, frozenPreviousControl.transitionEvents, 'control advancement should return a new transition event array');

    const forbiddenCapabilityDependency = /\b(Game|Memory|global|EventBus)\b|REQ_SPAWN|\.spawnCreep\s*\(/;
    for (const sourceFile of ['SpawnCapabilityArbiter.js', 'CapabilityRolloutReadiness.js']) {
        const sourceText = fs.readFileSync(path.join(__dirname, '..', 'governance', sourceFile), 'utf8');
        assert.strictEqual(forbiddenCapabilityDependency.test(sourceText), false, `${sourceFile} should remain independent of runtime and spawn side effects`);
    }
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

    const storedReadyRollout = { ...healthyRollout, ready: true, blockers: [] };
    const invalidSampleRollout = appendCapabilitySample(storedReadyRollout, {
        known: true,
        critical: false
    });
    assert.strictEqual(invalidSampleRollout.sampleCount, storedReadyRollout.sampleCount, 'samples missing required fields should not increase sample counts');
    assert.strictEqual(invalidSampleRollout.knownSampleCount, storedReadyRollout.knownSampleCount, 'invalid samples should not increase component counts');
    assert.strictEqual(invalidSampleRollout.ready, false, 'invalid samples should reset rollout readiness');
    assert.ok(invalidSampleRollout.blockers.includes('invalid_sample'), 'invalid samples should record their reason without adding state fields');
    assert.strictEqual(evaluateCapabilityReadiness(invalidSampleRollout, readinessCurrent, readinessPolicy, 200).ready, false, 'invalid samples should make the current readiness result not ready');

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
    assert.strictEqual(evaluateCapabilityReadiness({ ...healthyRollout, knownSampleCount: 51 }, readinessCurrent, readinessPolicy, 200).ready, false, 'component counts above sample counts should never be ready');
    assert.strictEqual(evaluateCapabilityReadiness({ ...healthyRollout, recommendationPresentCount: 49.5 }, readinessCurrent, readinessPolicy, 200).ready, false, 'fractional rollout counts should never be ready');
    assert.strictEqual(evaluateCapabilityReadiness({ ...healthyRollout, recommendationFlipCount: 50 }, readinessCurrent, readinessPolicy, 200).ready, false, 'flip counts above the possible transition count should never be ready');
    assert.strictEqual(evaluateCapabilityReadiness({ ...healthyRollout, legacyMatchCount: 26, legacyMissingCount: 25 }, readinessCurrent, readinessPolicy, 200).ready, false, 'legacy totals above sample counts should never be ready');
    assert.strictEqual(evaluateCapabilityReadiness({ ...healthyRollout, lastSampleAt: null }, readinessCurrent, readinessPolicy, 200).ready, false, 'sampled rollouts missing their last sample tick should never be ready');
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
    first.policy.overrides.rooms.W1N1['capability:upgradeWork'] = {
        value: 'active',
        reason: '   '
    };
    assert.deepStrictEqual(resolveCapabilityMode('W1N1', 'upgradeWork').blockers, [
        'invalid_capability_override_reason'
    ], 'active capability overrides must include a non-empty reason');
    first.policy.overrides.rooms.W1N1['capability:upgradeWork'] = {
        value: 'active',
        reason: 'negative_expiry',
        expiresAt: -1
    };
    assert.deepStrictEqual(resolveCapabilityMode('W1N1', 'upgradeWork').blockers, [
        'invalid_capability_override_expires_at'
    ], 'negative capability override expiry ticks must be rejected instead of treated as expired');
    first.policy.overrides.rooms.W1N1['capability:upgradeWork'] = {
        value: 'active',
        reason: 'single_room_pilot',
        expiresAt: 150
    };
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
            controller: { my: true, level: 4, ticksToDowngrade: 12345 },
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
        global.SpawnBureau = { W1N1: { intents: [], legacyIntents: [] } };
    };

    const governorControl = ensureEmpireControl();
    governorControl.rooms = {};
    governorControl.events = [];
    governorControl.runtime.cpuMode = 'normal';
    governorControl.policy.roomGovernor = JSON.parse(JSON.stringify(DEFAULT_EMPIRE_POLICY.roomGovernor));
    governorControl.policy.capabilityControl.readiness = {
        ...DEFAULT_EMPIRE_POLICY.capabilityControl.readiness,
        minSamples: 1,
        minKnownRatio: 0,
        maxCriticalRatio: 1,
        maxFlipRatio: 1
    };

    setHealthyGovernorWorld(700);
    delete Game.creeps.UpgraderHealthy;
    global.SpawnBureau = {
        W1N1: {
            intents: [],
            legacyIntents: [{
                role: 'upgrader',
                quotaKey: 'upgrader:W1N1:controller',
                priority: 35,
                body: [WORK, MOVE]
            }]
        }
    };
    roomGovernorService.analyze();
    roomGovernorService.cleanup();
    assert.strictEqual(
        governorControl.rooms.W1N1.capabilityRollout.upgradeWork.sampleCount,
        1
    );
    assert.strictEqual(
        governorControl.rooms.W1N1.capabilityRollout.upgradeWork.legacyMatchCount,
        1
    );
    assert.strictEqual(governorControl.rooms.W1N1.shadow.controllerTicksToDowngrade, 12345, 'full evaluation should persist the controller downgrade tick beside the governor snapshot');
    assert.strictEqual(global.RoomGovernor.W1N1.controllerTicksToDowngrade, 12345, 'global governor snapshots should expose the persisted controller downgrade tick');
    assert.strictEqual(global.RoomGovernor.W1N1.capabilityRollout.upgradeWork.ready, true, 'a healthy first sample should publish compact readiness without changing recommendations');
    assert.strictEqual(governorControl.events.filter((event) => event.type === 'capability_rollout_ready').length, 1, 'the first readiness transition should emit one rollout-ready event');

    roomGovernorService.cleanup();
    assert.strictEqual(governorControl.rooms.W1N1.capabilityRollout.upgradeWork.sampleCount, 1, 'cleanup should not sample the same evaluated tick twice');
    assert.strictEqual(governorControl.events.filter((event) => event.type === 'capability_rollout_ready').length, 1, 'duplicate cleanup should not duplicate the rollout-ready event');

    Game.time = 701;
    roomGovernorService.analyze();
    roomGovernorService.cleanup();
    assert.strictEqual(governorControl.rooms.W1N1.capabilityRollout.upgradeWork.sampleCount, 1, 'a non-evaluation tick should not be sampled');

    Game.time = 710;
    governorControl.runtime.cpuMode = 'critical';
    roomGovernorService.analyze();
    roomGovernorService.cleanup();
    assert.strictEqual(governorControl.rooms.W1N1.capabilityRollout.upgradeWork.sampleCount, 1, 'a CPU-critical deferred tick should not be sampled');
    assert.strictEqual(global.RoomGovernor.W1N1.deferred, true, 'a CPU-critical due tick should defer the governor snapshot');
    governorControl.runtime.cpuMode = 'normal';

    setHealthyGovernorWorld(720);
    global.SpawnBureau = {};
    roomGovernorService.analyze();
    roomGovernorService.cleanup();
    assert.strictEqual(governorControl.rooms.W1N1.capabilityRollout.upgradeWork.sampleCount, 1, 'a full evaluation without a SpawnBureau snapshot should not be sampled');

    setHealthyGovernorWorld(730);
    global.SpawnBureau = { W1N1: { intents: [{ role: 'upgrader', quotaKey: 'upgrader:W1N1:controller', body: [WORK, MOVE] }] } };
    roomGovernorService.analyze();
    roomGovernorService.cleanup();
    assert.strictEqual(governorControl.rooms.W1N1.capabilityRollout.upgradeWork.sampleCount, 1, 'a bureau without legacyIntents must not use final intents for rollout sampling');

    setHealthyGovernorWorld(740);
    delete Game.creeps.UpgraderHealthy;
    global.SpawnBureau = {
        W1N1: {
            intents: [],
            legacyIntents: [{
                role: 'upgrader',
                quotaKey: 'upgrader:W2N2:controller',
                body: [WORK, MOVE]
            }]
        }
    };
    roomGovernorService.analyze();
    roomGovernorService.cleanup();
    assert.strictEqual(governorControl.rooms.W1N1.capabilityRollout.upgradeWork.legacyMatchCount, 1, 'a remote upgrader demand must not match the local controller quota');
    assert.strictEqual(governorControl.rooms.W1N1.capabilityRollout.upgradeWork.legacyMissingCount, 1, 'a remote upgrader demand must be recorded as missing the local controller quota');

    setHealthyGovernorWorld(750);
    Game.rooms.W1N1.controller.ticksToDowngrade = 12000;
    global.RoomCache.W1N1.sources = null;
    roomGovernorService.analyze();
    roomGovernorService.cleanup();
    assert.strictEqual(governorControl.rooms.W1N1.capabilityRollout.upgradeWork.sampleCount, 3, 'a complete evaluation with a bureau should still record an unknown-health sample');
    assert.strictEqual(governorControl.rooms.W1N1.capabilityRollout.upgradeWork.knownSampleCount, 2, 'an unknown core health dimension should not increase known samples');

    setHealthyGovernorWorld(760);
    delete Game.creeps.MinerHealthy;
    roomGovernorService.analyze();
    roomGovernorService.cleanup();
    assert.strictEqual(governorControl.rooms.W1N1.capabilityRollout.upgradeWork.criticalSampleCount, 1, 'a critical core health dimension should increase critical samples');

    setHealthyGovernorWorld(771);
    Game.rooms.W1N1.storage = { store: { getUsedCapacity: () => { throw new Error('broken rollout facts'); } } };
    roomGovernorService.analyze();
    assert.strictEqual(governorControl.rooms.W1N1.capabilityRollout.upgradeWork.lastErrorAt, 771, 'a governor error should persist its tick on the rollout');
    assert.strictEqual(governorControl.rooms.W1N1.capabilityRollout.upgradeWork.ready, false, 'a recent governor error should block readiness');
    assert.ok(governorControl.rooms.W1N1.capabilityRollout.upgradeWork.blockers.includes('recent_governor_error'), 'the persisted readiness blockers should explain the recent governor error');

    setHealthyGovernorWorld(801);
    Game.rooms.W1N1.storage = { store: { getUsedCapacity: () => { throw new Error('second broken rollout facts'); } } };
    roomGovernorService.analyze();
    assert.strictEqual(governorControl.rooms.W1N1.capabilityRollout.upgradeWork.lastErrorAt, 801, 'a second governor error inside event cooldown must refresh rollout error time');
    assert.ok(governorControl.rooms.W1N1.capabilityRollout.upgradeWork.blockers.includes('recent_governor_error'), 'a second governor error inside event cooldown must keep readiness blocked');

    governorControl.rooms = {};
    governorControl.events = [];
    governorControl.runtime.cpuMode = 'normal';
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
            capabilities: {
                upgradeWork: { current: 1, spawning: 0, required: 3, gap: 2 }
            },
            spawnRecommendations: [{ capability: 'upgradeWork', priority: 36, reasons: ['upgrade_gap'] }],
            comparison: {
                matched: [{ capability: 'harvestWork' }],
                missing: [{ capability: 'logisticsCarry' }],
                excess: [],
                priorityMismatches: [],
                bodyProfileMismatches: []
            }
        }
    };
    global.SpawnBureau = {
        W1N1: {
            legacyIntents: [{
                role: 'upgrader',
                quotaKey: 'upgrader:W1N1:controller',
                body: ['work', 'carry', 'move'],
                memory: { role: 'upgrader', homeRoom: 'W1N1' }
            }],
            intents: [{ role: 'upgrader', quotaKey: 'upgrader:W1N1:controller', body: ['work', 'work', 'carry', 'move'] }],
            arbitration: {
                upgradeWork: {
                    adoptedSource: 'governor',
                    action: 'replace',
                    blockers: ['not_persisted_in_metrics']
                }
            }
        }
    };
    governorControl.rooms.W1N1 = {
        ...governorControl.rooms.W1N1,
        capabilityControl: {
            upgradeWork: {
                fallbackCount: 0,
                autoSuspended: false,
                blockers: ['not_persisted_in_metrics']
            }
        },
        capabilityRollout: {
            upgradeWork: { samples: [{ tick: Game.time, known: true }] }
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
    assert.deepStrictEqual(metricSnapshot.upgradeWorkControl, {
        legacyIntentPresent: true,
        governorRecommended: true,
        adoptedSource: 'governor',
        action: 'replace',
        current: 1,
        spawning: 0,
        required: 3,
        gap: 2,
        fallbackCount: 0,
        autoSuspended: false
    }, 'metrics should retain only the fixed compact upgradeWork control summary');
    assert.deepStrictEqual(Object.keys(metricSnapshot.upgradeWorkControl).sort(), [
        'action',
        'adoptedSource',
        'autoSuspended',
        'current',
        'fallbackCount',
        'gap',
        'governorRecommended',
        'legacyIntentPresent',
        'required',
        'spawning'
    ], 'upgradeWork metrics must not copy intent bodies, full intents, blocker history, or rollout samples');
    global.SpawnBureau.W1N1 = {
        legacyIntents: [{ role: 'upgrader', quotaKey: 'upgrader:W1N1:external', body: ['work', 'move'] }]
    };
    global.RoomGovernor.W1N1 = {
        lifecycle: 'mature',
        health: { overall: { status: 'healthy', score: 100 } },
        staleFor: 0,
        comparison: global.RoomGovernor.W1N1.comparison
    };
    governorControl.rooms.W1N1 = { marker: 'metrics-missing-control' };
    Game.time += 1;
    new EmpireMetricsService('EmpireMetrics').cleanup();
    assert.deepStrictEqual(governorControl.metrics.rooms.W1N1.upgradeWorkControl, {
        legacyIntentPresent: false,
        governorRecommended: null,
        adoptedSource: null,
        action: null,
        current: null,
        spawning: null,
        required: null,
        gap: null,
        fallbackCount: null,
        autoSuspended: null
    }, 'metrics should use the exact legacy economic quota and retain null for unavailable values instead of guessing zero');

    const { default: SpawnBureauService } = await import('../services/SpawnBureauService.js');
    global.CLAIM = 'claim';
    global.ATTACK = 'attack';
    global.RANGED_ATTACK = 'ranged_attack';
    global.HEAL = 'heal';
    global.TOUGH = 'tough';
    global.BODYPART_COST = { work: 100, carry: 50, move: 50, claim: 600, attack: 80, ranged_attack: 150, heal: 250, tough: 10 };
    global.FIND_SOURCES = 3;
    global.FIND_STRUCTURES = 4;
    global.FIND_CONSTRUCTION_SITES = 5;
    global.STRUCTURE_CONTAINER = 'container';
    const integrationRoom = (name) => ({
        name,
        controller: { my: true, ticksToDowngrade: 12000, pos: { x: 25, y: 25, roomName: name } },
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        find: (type) => type === FIND_CONSTRUCTION_SITES ? [{ id: `${name}:site` }] : []
    });
    const setupSpawnBureauIntegrationWorld = () => {
        Game.time = 1000;
        Game.rooms = { W1N1: integrationRoom('W1N1'), W2N2: integrationRoom('W2N2') };
        Game.creeps = {
            W1Miner: { memory: { role: 'miner', homeRoom: 'W1N1' }, body: [{ type: WORK }, { type: MOVE }] },
            W1Hauler: { memory: { role: 'hauler', homeRoom: 'W1N1' }, body: [{ type: CARRY }, { type: MOVE }] },
            W2Miner: { memory: { role: 'miner', homeRoom: 'W2N2' }, body: [{ type: WORK }, { type: MOVE }] },
            W2Hauler: { memory: { role: 'hauler', homeRoom: 'W2N2' }, body: [{ type: CARRY }, { type: MOVE }] }
        };
        Game.getObjectById = () => null;
        global.RoomCache = { W1N1: { sources: [] }, W2N2: { sources: [] } };
        global.RoomPhase = {
            W1N1: { phase: 'early', hasStorage: false },
            W2N2: { phase: 'early', hasStorage: false }
        };
        global.SpawnDemands = {
            W1N1: [{
                role: 'upgrader',
                quotaKey: 'upgrader:W1N1:external',
                priority: 83,
                bodyProfile: 'upgrader',
                memory: { role: 'upgrader', homeRoom: 'W1N1', quotaKey: 'upgrader:W1N1:external', owner: 'external' },
                reason: 'external_upgrade'
            }]
        };
        global.Memory = {
            creeps: {},
            rooms: {
                W1N1: {
                    maintenancePlan: {
                        quotas: { urgent: 0, routine: 0, longTerm: 0 },
                        targets: [{ executor: 'repairer', urgency: 'urgent' }]
                    }
                },
                W2N2: {
                    maintenancePlan: {
                        quotas: { urgent: 0, routine: 0, longTerm: 0 },
                        targets: [{ executor: 'repairer', urgency: 'urgent' }]
                    }
                }
            },
            empire: {
                spawningCreeps: {},
                control: {
                    policy: {
                        capabilityControl: {
                            enabled: true,
                            controllerEmergencyTicks: 5000,
                            emergencyDisable: false,
                            fallbackSuspendCount: 3,
                            readiness: {
                                minSamples: 50,
                                minKnownRatio: 0.95,
                                maxCriticalRatio: 0.05,
                                maxFlipRatio: 0.10,
                                maxSnapshotAge: 20
                            },
                            capabilities: { upgradeWork: { defaultMode: 'shadow' } }
                        },
                        overrides: { empire: {}, rooms: {} }
                    },
                    runtime: { cpuMode: 'normal' },
                    rooms: {}
                }
            }
        };
        global.RoomGovernor = {};
        EventBus.topics = {};
    };
    const readyRolloutAt = (tick) => ({
        sampleCount: 50,
        knownSampleCount: 50,
        criticalSampleCount: 0,
        recommendationPresentCount: 50,
        recommendationFlipCount: 0,
        legacyMatchCount: 50,
        legacyMissingCount: 0,
        lastRecommendationPresent: true,
        lastSampleAt: tick,
        lastErrorAt: null,
        ready: true,
        blockers: []
    });
    const serializedSpawnRequests = () => (EventBus.topics.REQ_SPAWN || []).map((event) => ({
        priority: event.priority,
        data: event.data
    }));
    const bureauIntegration = new SpawnBureauService('SpawnBureau');
    const expectedW1ShadowIntents = [
        {
            roomName: 'W1N1', role: 'upgrader', quotaKey: 'upgrader:W1N1:external', priority: 83,
            bodyProfile: 'upgrader', body: [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE],
            memory: { role: 'upgrader', homeRoom: 'W1N1', quotaKey: 'upgrader:W1N1:external', owner: 'external' },
            reason: 'external_upgrade'
        },
        {
            roomName: 'W1N1', role: 'upgrader', quotaKey: 'upgrader:W1N1:controller', priority: 60,
            bodyProfile: 'upgrader', body: [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE],
            memory: { role: 'upgrader', homeRoom: 'W1N1', quotaKey: 'upgrader:W1N1:controller' },
            reason: 'controller_progress'
        },
        {
            roomName: 'W1N1', role: 'repairer', quotaKey: 'repairer:W1N1:maintenance', priority: 58,
            bodyProfile: 'repairer', body: [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE],
            memory: { role: 'repairer', homeRoom: 'W1N1', quotaKey: 'repairer:W1N1:maintenance' },
            reason: 'maintenance_coverage'
        },
        {
            roomName: 'W1N1', role: 'builder', quotaKey: 'builder:W1N1:construction', priority: 55,
            bodyProfile: 'mobile_builder', body: [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE],
            memory: { role: 'builder', homeRoom: 'W1N1', quotaKey: 'builder:W1N1:construction' },
            reason: 'construction'
        },
        {
            roomName: 'W1N1', role: 'hauler', quotaKey: 'hauler:W1N1:core', priority: 45,
            bodyProfile: 'hauler', body: [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE],
            memory: { role: 'hauler', homeRoom: 'W1N1', quotaKey: 'hauler:W1N1:core' },
            reason: 'hauler_capacity'
        }
    ];
    const expectedW2ShadowIntents = [
        {
            roomName: 'W2N2', role: 'upgrader', quotaKey: 'upgrader:W2N2:controller', priority: 60,
            bodyProfile: 'upgrader', body: [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE],
            memory: { role: 'upgrader', homeRoom: 'W2N2', quotaKey: 'upgrader:W2N2:controller' },
            reason: 'controller_progress'
        },
        {
            roomName: 'W2N2', role: 'repairer', quotaKey: 'repairer:W2N2:maintenance', priority: 58,
            bodyProfile: 'repairer', body: [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE],
            memory: { role: 'repairer', homeRoom: 'W2N2', quotaKey: 'repairer:W2N2:maintenance' },
            reason: 'maintenance_coverage'
        },
        {
            roomName: 'W2N2', role: 'builder', quotaKey: 'builder:W2N2:construction', priority: 55,
            bodyProfile: 'mobile_builder', body: [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE],
            memory: { role: 'builder', homeRoom: 'W2N2', quotaKey: 'builder:W2N2:construction' },
            reason: 'construction'
        },
        {
            roomName: 'W2N2', role: 'hauler', quotaKey: 'hauler:W2N2:core', priority: 45,
            bodyProfile: 'hauler', body: [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE],
            memory: { role: 'hauler', homeRoom: 'W2N2', quotaKey: 'hauler:W2N2:core' },
            reason: 'hauler_capacity'
        }
    ];
    const setActiveGovernorSnapshot = (override = {}) => {
        Memory.empire.control.policy.overrides.rooms.W1N1 = {
            'capability:upgradeWork': { value: 'active', reason: 'test_pilot', expiresAt: 1100 }
        };
        Memory.empire.control.rooms.W1N1 = {
            ...(Memory.empire.control.rooms.W1N1 || {}),
            capabilityRollout: { upgradeWork: readyRolloutAt(Game.time) }
        };
        const base = {
            evaluatedAt: Game.time,
            staleFor: 0,
            lifecycle: 'self_sufficient',
            health: {
                survival: { status: 'healthy' },
                harvest: { status: 'healthy' },
                logistics: { status: 'healthy' }
            },
            budgets: { upgrade: { blocked: false } },
            capabilities: { upgradeWork: { gap: 1, current: 0, spawning: 0 } },
            controllerTicksToDowngrade: 12000,
            spawnRecommendations: [{ capability: 'upgradeWork', priority: 77, reasons: ['upgradeWork_gap'] }]
        };
        global.RoomGovernor = { W1N1: { ...base, ...override } };
    };

    setupSpawnBureauIntegrationWorld();
    bureauIntegration.analyze();
    const shadowW1 = global.SpawnBureau.W1N1;
    const shadowW2 = global.SpawnBureau.W2N2;
    assert.deepStrictEqual(shadowW1.legacyIntents, expectedW1ShadowIntents, 'default shadow should retain the fixed W1N1 old economic intents field by field');
    assert.deepStrictEqual(shadowW2.legacyIntents, expectedW2ShadowIntents, 'default shadow should retain the fixed W2N2 old economic intents field by field');
    assert.deepStrictEqual(shadowW1.intents, expectedW1ShadowIntents, 'default shadow must retain the complete W1N1 legacy intents');
    assert.deepStrictEqual(shadowW2.intents, expectedW2ShadowIntents, 'default shadow must retain the complete W2N2 legacy intents');
    assert.deepStrictEqual(serializedSpawnRequests(), [
        ...expectedW1ShadowIntents,
        ...expectedW2ShadowIntents
    ].map((intent) => ({
        priority: intent.priority,
        data: { roomName: intent.roomName, role: intent.role, body: intent.body, memory: intent.memory }
    })), 'default shadow must publish the legacy request order and contents unchanged');
    assert.strictEqual(shadowW1.blockedDemands.length, 0, 'default shadow must not add candidate-build blocked demand side effects');

    setupSpawnBureauIntegrationWorld();
    setActiveGovernorSnapshot();
    bureauIntegration.analyze();
    const activeW1 = global.SpawnBureau.W1N1;
    const activeW2 = global.SpawnBureau.W2N2;
    const targetQuota = 'upgrader:W1N1:controller';
    const activeCandidate = activeW1.intents.find((intent) => intent.quotaKey === targetQuota);
    const legacyCandidate = activeW1.legacyIntents.find((intent) => intent.quotaKey === targetQuota);
    assert.strictEqual(activeW1.arbitration.upgradeWork.action, 'replace', 'a ready and safe active room should expose its replacement arbitration this tick');
    assert.strictEqual(activeCandidate.priority, 77, 'active replacement should use the governor recommendation priority');
    assert.strictEqual(activeCandidate.bodyProfile, bureauIntegration.upgraderBodyProfile(Game.rooms.W1N1), 'active replacement should retain the established upgrader body profile');
    assert.deepStrictEqual(activeCandidate.body, legacyCandidate.body, 'active replacement should keep BodyBuilder output for the established upgrader profile');
    assert.deepStrictEqual(activeCandidate.memory, legacyCandidate.memory, 'active replacement should keep the established upgrader memory and quota key');
    assert.strictEqual(activeW1.intents.filter((intent) => intent.quotaKey === targetQuota).length, 1, 'active arbitration should leave at most one economic upgrader intent');
    assert.deepStrictEqual(
        activeW1.intents.find((intent) => intent.quotaKey === 'upgrader:W1N1:external'),
        activeW1.legacyIntents.find((intent) => intent.quotaKey === 'upgrader:W1N1:external'),
        'active arbitration should preserve external upgrader demands'
    );
    assert.deepStrictEqual(activeW2.intents, activeW2.legacyIntents, 'rooms without an active override must remain in shadow');
    for (const role of ['miner', 'hauler', 'builder', 'repairer']) {
        assert.deepStrictEqual(
            activeW1.intents.filter((intent) => intent.role === role),
            activeW1.legacyIntents.filter((intent) => intent.role === role),
            `active arbitration should not alter ${role} intents`
        );
    }
    assert.strictEqual(Object.prototype.hasOwnProperty.call(Memory.empire.control.rooms.W1N1.capabilityControl.upgradeWork, 'rearmed'), false, 'persisted capability control must strip the transient rearmed flag');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(Memory.empire.control.rooms.W1N1.capabilityControl.upgradeWork, 'transitionEvents'), false, 'persisted capability control must strip transient transition events');

    setupSpawnBureauIntegrationWorld();
    setActiveGovernorSnapshot();
    bureauIntegration.analyze();
    Memory.empire.spawningCreeps.W1Upgrade = {
        memory: { role: 'upgrader', homeRoom: 'W1N1', quotaKey: 'upgrader:W1N1:controller' },
        expireAt: 1200
    };
    Game.time = 1001;
    global.RoomGovernor.W1N1.staleFor = 1;
    bureauIntegration.analyze();
    assert.strictEqual(global.SpawnBureau.W1N1.arbitration.upgradeWork.action, 'suppress', 'live spawning coverage must prevent a second replacement from the same Governor snapshot');
    assert.ok(global.SpawnBureau.W1N1.arbitration.upgradeWork.reasons.includes('controller_quota_already_covered'), 'fulfillment protection should explain why the stale positive gap was suppressed');
    assert.strictEqual(global.SpawnBureau.W1N1.intents.filter((intent) => intent.quotaKey === 'upgrader:W1N1:controller').length, 0, 'a spawning controller quota must not receive another economic intent');

    for (const [label, snapshotOverride] of [
        ['covered gap', {
            capabilities: { upgradeWork: { gap: 0, current: 1, spawning: 0 } },
            spawnRecommendations: []
        }],
        ['blocked budget', {
            budgets: { upgrade: { blocked: true } },
            capabilities: { upgradeWork: { gap: 1, current: 1, spawning: 0 } },
            spawnRecommendations: []
        }]
    ]) {
        setupSpawnBureauIntegrationWorld();
        Game.creeps.W1Upgrader = {
            memory: { role: 'upgrader', homeRoom: 'W1N1', quotaKey: 'upgrader:W1N1:controller' },
            body: [{ type: WORK }, { type: CARRY }, { type: MOVE }]
        };
        setActiveGovernorSnapshot(snapshotOverride);
        for (let tick = 1000; tick < 1004; tick++) {
            Game.time = tick;
            global.RoomGovernor.W1N1.evaluatedAt = tick;
            global.RoomGovernor.W1N1.staleFor = 0;
            bureauIntegration.analyze();
            const controlState = Memory.empire.control.rooms.W1N1.capabilityControl.upgradeWork;
            assert.strictEqual(global.SpawnBureau.W1N1.arbitration.upgradeWork.action, 'suppress', `${label} should stay a normal no-op without a candidate on tick ${tick}`);
            assert.strictEqual(controlState.fallbackCount, 0, `${label} should not accumulate fallback count on tick ${tick}`);
            assert.strictEqual(controlState.autoSuspended, false, `${label} should not auto-suspend on tick ${tick}`);
        }
    }

    setupSpawnBureauIntegrationWorld();
    const neutralRoom = integrationRoom('W9N9');
    delete neutralRoom.controller;
    Game.rooms.W9N9 = neutralRoom;
    global.RoomCache.W9N9 = { sources: [] };
    global.RoomPhase.W9N9 = { phase: 'early', hasStorage: false };
    bureauIntegration.analyze();
    assert.ok(global.SpawnBureau.W9N9, 'rooms without a controller should retain their pre-existing SpawnBureau processing');
    assert.strictEqual(Memory.empire.control.rooms.W9N9, undefined, 'capability control must not be persisted for rooms without an owned controller');

    for (const [label, rolloutMutation] of [
        ['legacy readiness schema', () => ({ ready: true, blockers: [] })],
        ['missing readiness field', () => {
            const rollout = readyRolloutAt(Game.time);
            delete rollout.lastErrorAt;
            return rollout;
        }],
        ['invalid readiness count', () => ({ ...readyRolloutAt(Game.time), knownSampleCount: -1 })]
    ]) {
        setupSpawnBureauIntegrationWorld();
        setActiveGovernorSnapshot();
        Memory.empire.control.rooms.W1N1.capabilityRollout.upgradeWork = rolloutMutation();
        bureauIntegration.analyze();
        assert.strictEqual(global.SpawnBureau.W1N1.arbitration.upgradeWork.action, 'fallback', `${label} must not authorize active takeover`);
        assert.ok(global.SpawnBureau.W1N1.arbitration.upgradeWork.reasons.includes('invalid_input'), `${label} should expose the readiness validation failure`);
        assert.deepStrictEqual(global.SpawnBureau.W1N1.intents, expectedW1ShadowIntents, `${label} must retain the complete legacy intents`);
    }

    setupSpawnBureauIntegrationWorld();
    setActiveGovernorSnapshot();
    Memory.empire.control.policy.capabilityControl.readiness.minSamples = 51;
    bureauIntegration.analyze();
    assert.strictEqual(global.SpawnBureau.W1N1.arbitration.upgradeWork.action, 'fallback', 'a readiness policy threshold change must be re-evaluated on the current tick');
    assert.ok(global.SpawnBureau.W1N1.arbitration.upgradeWork.reasons.includes('insufficient_samples'), 'a changed sample threshold should explain why the stored rollout is no longer ready');

    for (const [label, configure, expectedReason] of [
        ['empty active override reason', () => {
            Memory.empire.control.policy.overrides.rooms.W1N1['capability:upgradeWork'].reason = '   ';
        }, 'invalid_capability_override_reason'],
        ['negative active override expiry', () => {
            Memory.empire.control.policy.overrides.rooms.W1N1['capability:upgradeWork'].expiresAt = -1;
        }, 'invalid_capability_override_expires_at'],
        ['string enabled flag', () => {
            Memory.empire.control.policy.capabilityControl.enabled = 'false';
        }, 'invalid_capability_control_enabled'],
        ['string emergency flag', () => {
            Memory.empire.control.policy.capabilityControl.emergencyDisable = 'true';
        }, 'invalid_capability_control_emergency_disable'],
        ['invalid enabled flag masked by emergency hold', () => {
            Memory.empire.control.policy.capabilityControl.enabled = 'false';
            Memory.empire.control.policy.capabilityControl.emergencyDisable = true;
        }, 'invalid_capability_control_enabled'],
        ['negative controller threshold', () => {
            Memory.empire.control.policy.capabilityControl.controllerEmergencyTicks = -1;
        }, 'invalid_controller_emergency_ticks'],
        ['negative readiness threshold', () => {
            Memory.empire.control.policy.capabilityControl.readiness.maxSnapshotAge = -1;
        }, 'invalid_readiness_policy']
    ]) {
        setupSpawnBureauIntegrationWorld();
        setActiveGovernorSnapshot();
        configure();
        bureauIntegration.analyze();
        assert.strictEqual(global.SpawnBureau.W1N1.arbitration.upgradeWork.action, 'fallback', `${label} must force a safe fallback`);
        assert.ok(global.SpawnBureau.W1N1.arbitration.upgradeWork.reasons.includes(expectedReason), `${label} should expose its configuration reason`);
        assert.deepStrictEqual(global.SpawnBureau.W1N1.intents, expectedW1ShadowIntents, `${label} must preserve complete legacy intents`);
    }

    setupSpawnBureauIntegrationWorld();
    Memory.empire.control.policy.capabilityControl.enabled = 'false';
    bureauIntegration.analyze();
    assert.strictEqual(global.SpawnBureau.W1N1.arbitration.upgradeWork.effectiveMode, 'shadow', 'invalid capability policy should remain safely shadow without an active override');
    assert.ok(global.SpawnBureau.W1N1.arbitration.upgradeWork.reasons.includes('invalid_capability_control_enabled'), 'invalid capability policy in shadow mode should remain explicitly diagnosable');

    setupSpawnBureauIntegrationWorld();
    setActiveGovernorSnapshot({
        capabilities: { upgradeWork: { gap: 0, current: 1, spawning: 0 } },
        spawnRecommendations: []
    });
    bureauIntegration.analyze();
    assert.strictEqual(global.SpawnBureau.W1N1.arbitration.upgradeWork.action, 'suppress', 'a covered upgrade capability without a recommendation should suppress the local controller quota');
    assert.ok(!global.SpawnBureau.W1N1.intents.some((intent) => intent.quotaKey === 'upgrader:W1N1:controller'), 'covered active control should remove only the local economic controller intent');

    setupSpawnBureauIntegrationWorld();
    setActiveGovernorSnapshot({
        budgets: { upgrade: { blocked: true } },
        capabilities: { upgradeWork: { gap: 1, current: 0, spawning: 0 } },
        spawnRecommendations: []
    });
    bureauIntegration.analyze();
    assert.strictEqual(global.SpawnBureau.W1N1.arbitration.upgradeWork.action, 'suppress', 'a budget-blocked upgrade capability without a recommendation should suppress the local controller quota');

    setupSpawnBureauIntegrationWorld();
    setActiveGovernorSnapshot({ spawnRecommendations: [] });
    bureauIntegration.analyze();
    assert.strictEqual(global.SpawnBureau.W1N1.arbitration.upgradeWork.action, 'fallback', 'a positive gap without a governor recommendation should fall back instead of inventing a priority');
    assert.deepStrictEqual(global.SpawnBureau.W1N1.intents, expectedW1ShadowIntents, 'a missing positive-gap recommendation must retain the complete legacy intents');

    setupSpawnBureauIntegrationWorld();
    setActiveGovernorSnapshot({
        health: {
            survival: { status: 'healthy' },
            harvest: {},
            logistics: { status: 'healthy' }
        }
    });
    bureauIntegration.analyze();
    assert.strictEqual(global.SpawnBureau.W1N1.arbitration.upgradeWork.action, 'fallback', 'a missing core health status must fall back rather than be treated as healthy');
    assert.deepStrictEqual(global.SpawnBureau.W1N1.intents, expectedW1ShadowIntents, 'an incomplete core health snapshot must retain the complete legacy intents');

    setupSpawnBureauIntegrationWorld();
    setActiveGovernorSnapshot();
    Game.rooms.W1N1.energyAvailable = 0;
    Game.rooms.W1N1.energyCapacityAvailable = 0;
    const invalidCandidateState = {
        intents: expectedW1ShadowIntents.map((intent) => ({ ...intent, body: [...intent.body], memory: { ...intent.memory } })),
        legacyIntents: expectedW1ShadowIntents.map((intent) => ({ ...intent, body: [...intent.body], memory: { ...intent.memory } })),
        blockedDemands: []
    };
    bureauIntegration.applyUpgradeWorkArbitration(Game.rooms.W1N1, invalidCandidateState);
    assert.strictEqual(invalidCandidateState.arbitration.upgradeWork.action, 'fallback', 'an unbuildable active governor candidate must fall back');
    assert.deepStrictEqual(invalidCandidateState.intents, expectedW1ShadowIntents, 'an unbuildable candidate must leave the complete legacy intent list intact');

    const duplicateBlockedState = {
        intents: expectedW1ShadowIntents.map((intent) => ({ ...intent, body: [...intent.body], memory: { ...intent.memory } })),
        legacyIntents: expectedW1ShadowIntents.map((intent) => ({ ...intent, body: [...intent.body], memory: { ...intent.memory } })),
        blockedDemands: [{ role: 'upgrader', quotaKey: 'upgrader:W1N1:controller', reason: 'no_valid_body' }]
    };
    bureauIntegration.applyUpgradeWorkArbitration(Game.rooms.W1N1, duplicateBlockedState);
    assert.strictEqual(duplicateBlockedState.blockedDemands.filter((entry) => entry.quotaKey === 'upgrader:W1N1:controller').length, 1, 'candidate build failure should deduplicate blocked demand records for the same quota');

    setupSpawnBureauIntegrationWorld();
    setActiveGovernorSnapshot({ spawnRecommendations: [] });
    Memory.empire.control.policy.telemetry = { eventLimit: 10 };
    Memory.empire.control.rooms.W1N1.preservedRoomField = 'preserve';
    Memory.empire.control.policy.overrides.rooms.W2N2 = {
        'capability:upgradeWork': { value: 'active', reason: 'independent_room', expiresAt: 1100 }
    };
    Memory.empire.control.rooms.W2N2 = {
        capabilityRollout: { upgradeWork: readyRolloutAt(Game.time) }
    };
    global.RoomGovernor.W2N2 = {
        ...global.RoomGovernor.W1N1,
        spawnRecommendations: [{ capability: 'upgradeWork', priority: 77, reasons: ['upgradeWork_gap'] }]
    };

    bureauIntegration.analyze();
    let persistedW1Control = Memory.empire.control.rooms.W1N1.capabilityControl.upgradeWork;
    assert.strictEqual(persistedW1Control.fallbackCount, 1, 'the first persisted active fallback should start at one');
    assert.strictEqual(persistedW1Control.autoSuspended, false, 'the first persisted active fallback should not suspend control');
    assert.deepStrictEqual(global.SpawnBureau.W1N1.intents, expectedW1ShadowIntents, 'a persisted fallback must retain the complete legacy intents');
    assert.strictEqual(Memory.empire.control.rooms.W1N1.preservedRoomField, 'preserve', 'persisting capability control must retain unrelated room control fields');
    assert.strictEqual(global.SpawnBureau.W2N2.arbitration.upgradeWork.action, 'replace', 'a W1N1 fallback must not prevent W2N2 active arbitration');

    Game.time += 1;
    bureauIntegration.analyze();
    persistedW1Control = Memory.empire.control.rooms.W1N1.capabilityControl.upgradeWork;
    assert.strictEqual(persistedW1Control.fallbackCount, 2, 'the second persisted fallback should increment consecutively');

    Game.time += 1;
    bureauIntegration.analyze();
    persistedW1Control = Memory.empire.control.rooms.W1N1.capabilityControl.upgradeWork;
    assert.strictEqual(persistedW1Control.autoSuspended, true, 'the third persisted fallback should automatically suspend the room');
    assert.strictEqual(persistedW1Control.suspendedAt, Game.time, 'automatic suspension should record the current tick');

    setActiveGovernorSnapshot();
    global.RoomGovernor.W2N2 = {
        ...global.RoomGovernor.W1N1,
        spawnRecommendations: [{ capability: 'upgradeWork', priority: 77, reasons: ['upgradeWork_gap'] }]
    };
    Game.time += 1;
    bureauIntegration.analyze();
    persistedW1Control = Memory.empire.control.rooms.W1N1.capabilityControl.upgradeWork;
    assert.strictEqual(persistedW1Control.autoSuspended, true, 'a safe active request must remain suspended until it is explicitly rearmed');
    assert.strictEqual(global.SpawnBureau.W1N1.arbitration.upgradeWork.action, 'fallback', 'a suspended active request must continue to use legacy intents');
    assert.deepStrictEqual(global.SpawnBureau.W1N1.intents, expectedW1ShadowIntents, 'a suspended active request must retain complete legacy intents');

    Memory.empire.control.policy.overrides.rooms.W1N1['capability:upgradeWork'].value = 'shadow';
    Game.time += 1;
    bureauIntegration.analyze();
    persistedW1Control = Memory.empire.control.rooms.W1N1.capabilityControl.upgradeWork;
    assert.strictEqual(persistedW1Control.autoSuspended, true, 'a shadow request alone must not clear suspension');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(persistedW1Control, 'rearmed'), false, 'the shadow request should not persist the transient rearmed flag');

    Memory.empire.control.policy.overrides.rooms.W1N1['capability:upgradeWork'].value = 'active';
    Game.time += 1;
    bureauIntegration.analyze();
    persistedW1Control = Memory.empire.control.rooms.W1N1.capabilityControl.upgradeWork;
    assert.strictEqual(persistedW1Control.autoSuspended, false, 'a shadow-to-active request should rearm the suspended room');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(persistedW1Control, 'rearmed'), false, 'a rearmed room should not persist the transient transition flag');
    assert.strictEqual(global.SpawnBureau.W1N1.arbitration.upgradeWork.control.rearmed, true, 'a rearmed room should expose the transient transition in this tick global state');
    assert.strictEqual(persistedW1Control.fallbackCount, 0, 'a safe rearmed active decision should reset fallback counting');
    assert.strictEqual(global.SpawnBureau.W1N1.arbitration.upgradeWork.action, 'replace', 'a safe rearmed request should resume active replacement');
    const capabilityEvents = Memory.empire.control.events.filter((event) => event.data.capability === 'upgradeWork' && event.data.roomName === 'W1N1');
    assert.deepStrictEqual(capabilityEvents.map((event) => event.type), [
        'capability_control_fallback',
        'capability_control_suspended',
        'capability_control_rearmed',
        'capability_control_activated'
    ], 'capability events should be emitted only at fallback, suspension, rearm, and activation edges');
    assert.ok(capabilityEvents.every((event) => event.data.roomName === 'W1N1' && event.data.requestedMode && event.data.effectiveMode && Array.isArray(event.data.reasons)), 'capability events should include the bounded transition context');

    Memory.empire.control.policy.telemetry.eventLimit = 4;
    Game.time += 1;
    setActiveGovernorSnapshot({ spawnRecommendations: [] });
    global.RoomGovernor.W2N2 = {
        ...global.RoomGovernor.W1N1,
        spawnRecommendations: [{ capability: 'upgradeWork', priority: 77, reasons: ['upgradeWork_gap'] }]
    };
    bureauIntegration.analyze();
    persistedW1Control = Memory.empire.control.rooms.W1N1.capabilityControl.upgradeWork;
    assert.strictEqual(persistedW1Control.fallbackCount, 1, 'a fallback after one safe active tick must restart counting at one');
    assert.ok(Memory.empire.control.events.length <= 4, 'capability transition events must respect telemetry eventLimit');

    for (const [label, engageHold, releaseHold] of [
        ['globally disabled capability control', () => {
            Memory.empire.control.policy.capabilityControl.enabled = false;
        }, () => {
            Memory.empire.control.policy.capabilityControl.enabled = true;
        }],
        ['emergency disable', () => {
            Memory.empire.control.policy.capabilityControl.emergencyDisable = true;
        }, () => {
            Memory.empire.control.policy.capabilityControl.emergencyDisable = false;
        }]
    ]) {
        setupSpawnBureauIntegrationWorld();
        setActiveGovernorSnapshot();
        Memory.empire.control.policy.telemetry = { eventLimit: 50 };
        engageHold();
        for (let tick = 1000; tick < 1004; tick++) {
            Game.time = tick;
            global.RoomGovernor.W1N1.evaluatedAt = tick;
            global.RoomGovernor.W1N1.staleFor = 0;
            bureauIntegration.analyze();
            const heldState = Memory.empire.control.rooms.W1N1.capabilityControl.upgradeWork;
            assert.strictEqual(global.SpawnBureau.W1N1.arbitration.upgradeWork.action, 'keep', `${label} should remain a legacy hold on tick ${tick}`);
            assert.strictEqual(global.SpawnBureau.W1N1.arbitration.upgradeWork.effectiveMode, 'shadow', `${label} must force shadow mode on tick ${tick}`);
            assert.deepStrictEqual(global.SpawnBureau.W1N1.intents, expectedW1ShadowIntents, `${label} must preserve complete legacy intents on tick ${tick}`);
            assert.strictEqual(heldState.requestedMode, 'active', `${label} must retain the active request on tick ${tick}`);
            assert.strictEqual(heldState.fallbackCount, 0, `${label} must not accumulate fallback count on tick ${tick}`);
            assert.strictEqual(heldState.autoSuspended, false, `${label} must not auto-suspend on tick ${tick}`);
        }
        const holdEvents = Memory.empire.control.events || [];
        assert.strictEqual(holdEvents.some((event) => event.type === 'capability_control_fallback' || event.type === 'capability_control_suspended'), false, `${label} must not emit ordinary fallback or suspension events`);
        assert.strictEqual(Memory.empire.control.policy.overrides.rooms.W1N1['capability:upgradeWork'].value, 'active', `${label} must retain the active override request`);

        releaseHold();
        Game.time = 1004;
        global.RoomGovernor.W1N1.evaluatedAt = Game.time;
        global.RoomGovernor.W1N1.staleFor = 0;
        bureauIntegration.analyze();
        const releasedState = Memory.empire.control.rooms.W1N1.capabilityControl.upgradeWork;
        assert.strictEqual(global.SpawnBureau.W1N1.arbitration.upgradeWork.action, 'replace', `${label} release should re-arbitrate the retained active request immediately`);
        assert.strictEqual(releasedState.autoSuspended, false, `${label} release should not require a shadow-to-active rearm`);
        assert.strictEqual((Memory.empire.control.events || []).some((event) => event.type === 'capability_control_rearmed'), false, `${label} release should not emit a rearm event`);
    }

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
