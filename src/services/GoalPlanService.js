import BaseService from '../core/BaseService.js';
import { ensureEmpireControl } from '../config/EmpirePolicy.js';
import { collectGoalPlanFacts } from '../governance/GoalPlanFacts.js';
import { validGoalPlanningPolicy } from '../governance/GoalPlanModel.js';
import { reconcileGoalPlanRegistry } from '../governance/GoalPlanRegistry.js';

class GoalPlanService extends BaseService {
    init() {
        global.GoalPlan = { tick: Game.time, status: 'inactive', summary: {
            goalCount: 0, planCount: 0, achievedCount: 0, readyCount: 0, blockedCount: 0, reasonCodes: []
        } };
    }

    analyze() {
        const control = ensureEmpireControl();
        const policy = control.policy.goalPlanning;
        if (!validGoalPlanningPolicy(policy) || !policy.enabled) {
            if (control.goalPlanningState?.schemaVersion === 1) control.goalPlanningState.needsFreshEvidence = true;
            if (!validGoalPlanningPolicy(policy)) {
                global.GoalPlan.status = 'blocked';
                global.GoalPlan.summary.reasonCodes = ['invalid_policy'];
            }
            return;
        }
        if (Game.time % policy.interval !== 0) {
            global.GoalPlan.status = 'deferred';
            return;
        }
        const registry = {
            goals: control.goals === undefined ? {} : control.goals,
            plans: control.plans === undefined ? {} : control.plans,
            meta: control.goalPlanningState
        };
        const goalRecords = registry.goals && typeof registry.goals === 'object' && !Array.isArray(registry.goals) ? Object.values(registry.goals) : [];
        const definitions = goalRecords.map(goal => goal?.definition);
        const roomNames = [...new Set(definitions.map(definition => definition?.roomName).filter(name => typeof name === 'string'))];
        const facts = collectGoalPlanFacts({ roomNames, now: Game.time,
            codeVersion: global.EmpireTelemetry?.codeVersion || global.EmpireServicesVersion });
        const result = reconcileGoalPlanRegistry(registry, definitions, facts, Game.time, policy);
        if (result.registry !== registry) {
            control.goals = result.registry.goals;
            control.plans = result.registry.plans;
            control.goalPlanningState = result.registry.meta;
        }
        global.GoalPlan = {
            tick: Game.time, evaluatedAt: Game.time,
            status: result.errors.length ? 'blocked' : 'evaluated', summary: result.summary,
            errors: result.errors,
            goals: Object.values(result.registry.goals || {}).filter(goal => goal && typeof goal === 'object')
                .slice(0, policy.maxGoals).map(goal => ({
                    id: goal.definition?.id, status: goal.state?.status,
                    currentReadiness: result.registry === registry ? null : goal.state?.currentReadiness ?
                        { ...goal.state.currentReadiness, reasons: goal.state.currentReadiness.reasons.slice() } : null
                }))
        };
    }
}

export default GoalPlanService;
