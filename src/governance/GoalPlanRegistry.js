import { evaluateGoalPlan, observationPlanId, validGoalDefinition, validGoalState, validGoalPlanningPolicy } from './GoalPlanModel.js';

const copy = value => JSON.parse(JSON.stringify(value));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function definitionFields(definition) {
    const result = {};
    for (const key of ['id', 'kind', 'roomName', 'priority', 'requiredFreeCapacity', 'createdAt', 'expiresAt']) {
        if (definition[key] !== undefined) result[key] = definition[key];
    }
    return result;
}

export function summarizeGoalPlans(registry) {
    const goals = record(registry?.goals) ? Object.values(registry.goals).filter(record) : [];
    return {
        goalCount: goals.length,
        planCount: record(registry?.plans) ? Object.keys(registry.plans).length : 0,
        achievedCount: goals.filter(goal => goal.state?.status === 'achieved').length,
        readyCount: goals.filter(goal => goal.state?.currentReadiness?.ready === true).length,
        blockedCount: goals.filter(goal => ['blocked', 'unknown'].includes(goal.state?.currentReadiness?.status)).length,
        reasonCodes: [...new Set(goals.flatMap(goal => Array.isArray(goal.state?.reasonCodes) ? goal.state.reasonCodes : []))].slice(0, 8)
    };
}

export function reconcileGoalPlanRegistry(registry, definitions, facts, now, policy) {
    const source = registry || {};
    const refused = reason => ({ registry: source, summary: { ...summarizeGoalPlans(source), readyCount: 0, reasonCodes: [reason] }, errors: [reason] });
    if (!validGoalPlanningPolicy(policy)) return refused('invalid_policy');
    if (!record(source) || source.goals !== undefined && !record(source.goals) ||
        source.plans !== undefined && !record(source.plans) || source.meta !== undefined && !record(source.meta)) return refused('invalid_registry');
    if (source.meta?.schemaVersion !== undefined && source.meta.schemaVersion !== 1 ||
        source.meta?.schemaVersion === undefined && (Object.keys(source.goals || {}).length || Object.keys(source.plans || {}).length)) return refused('unsupported_schema');
    if (Object.keys(source.goals || {}).length > policy.maxGoals || Object.keys(source.plans || {}).length > policy.maxPlans) return refused('registry_full');
    if (!Array.isArray(definitions)) return refused('invalid_definitions');
    if (Number.isSafeInteger(source.meta?.lastEvaluatedAt) && now < source.meta.lastEvaluatedAt) return refused('clock_regressed');
    for (const [id, goal] of Object.entries(source.goals || {})) {
        if (!record(goal) || id !== goal.definition?.id || !validGoalDefinition(goal.definition, now) ||
            goal.state !== undefined && !validGoalState(goal.state)) return refused('invalid_registry');
    }
    for (const [id, plan] of Object.entries(source.plans || {})) {
        if (!record(plan) || id !== observationPlanId(plan.goalId) || !source.goals?.[plan.goalId] ||
            plan.revision !== 1 || plan.budgetAllocated !== 0 || plan.retryCount !== 0) return refused('invalid_registry');
    }
    if (!policy.enabled) return { registry: source, summary: { ...summarizeGoalPlans(source), readyCount: 0 }, errors: [] };
    const next = {
        goals: copy(source.goals || {}), plans: copy(source.plans || {}),
        meta: { schemaVersion: 1, events: Array.isArray(source.meta?.events) ? copy(source.meta.events.slice(-policy.eventLimit)) : [] }
    };
    const errors = [];
    for (const definition of definitions.slice(0, policy.maxGoals + 1)) {
        if (!validGoalDefinition(definition, now)) { errors.push('invalid_goal_definition'); continue; }
        const normalized = definitionFields(definition);
        const existing = next.goals[definition.id];
        if (existing) {
            if (JSON.stringify(definitionFields(existing.definition)) !== JSON.stringify(normalized)) errors.push('definition_conflict');
            continue;
        }
        if (Object.keys(next.goals).length >= policy.maxGoals || Object.keys(next.plans).length >= policy.maxPlans) {
            errors.push('registry_full');
            continue;
        }
        next.goals[definition.id] = { definition: normalized, state: { status: 'proposed' } };
        // Reserve the plan slot before accepting another goal in this same evaluation.
        next.plans[observationPlanId(definition.id)] = {
            id: observationPlanId(definition.id), goalId: definition.id, revision: 1,
            phase: 'waiting_structure', status: 'watching', budgetProposal: null, budgetAllocated: 0, retryCount: 0
        };
    }
    if (definitions.length > policy.maxGoals + 1) errors.push('registry_full');
    for (const [id, goal] of Object.entries(next.goals)) {
        const planId = observationPlanId(id);
        if (!next.plans[planId] && Object.keys(next.plans).length >= policy.maxPlans) {
            errors.push('registry_full');
            continue;
        }
        if (source.meta?.needsFreshEvidence && goal.state) {
            goal.state.readyCount = 0;
            goal.state.lastReadyEvidenceAt = null;
        }
        const result = evaluateGoalPlan({ goal, plan: next.plans[planId], facts, now, policy });
        next.goals[id] = result.goal;
        next.plans[planId] = result.plan;
        next.meta.events.push(...result.events);
    }
    next.meta.events = next.meta.events.slice(-policy.eventLimit);
    next.meta.lastEvaluatedAt = now;
    next.meta.codeVersion = facts?.codeVersion || null;
    next.meta.needsFreshEvidence = false;
    return { registry: next, summary: summarizeGoalPlans(next), errors: [...new Set(errors)].slice(0, 8) };
}
