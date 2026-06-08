import BaseService from '../core/BaseService.js';
import TaskGuard from '../core/TaskGuard.js';
import { clearTaskState } from '../core/TaskMetadata.js';

class TaskGuardService extends BaseService {
    analyze() {
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            const result = TaskGuard.validate(creep, creep.memory && creep.memory.task);
            if (!result.valid) clearTaskState(creep, `task_guard_${result.reason}`);
        }
    }
}

export default TaskGuardService;
