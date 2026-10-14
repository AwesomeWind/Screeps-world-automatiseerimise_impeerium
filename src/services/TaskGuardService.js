import BaseService from '../core/BaseService.js';
import TaskGuard from '../core/TaskGuard.js';
import { clearTaskState } from '../core/TaskMetadata.js';
import { recoveryAllowsTask } from './RoomRecoveryPolicy.js';

class TaskGuardService extends BaseService {
    analyze() {
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            const result = TaskGuard.validate(creep, creep.memory && creep.memory.task);
            if (!result.valid) clearTaskState(creep, `task_guard_${result.reason}`);
            else if (!recoveryAllowsTask(creep, creep.memory.task)) clearTaskState(creep, 'task_guard_recovery_limited');
        }
    }
}

export default TaskGuardService;
