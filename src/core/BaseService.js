class BaseService {
    constructor(serviceName) {
        this.name = serviceName;
    }

    // 读取 Game/Memory/global 状态；不要在这里发布需求或改 creep 任务。
    init() {}

    // 分析局势、发布 EventBus 需求、写入策略层任务。
    analyze() {}

    // 执行已经确定的动作，例如 spawn、tower、lab、market API。
    run() {}

    // 清理过期状态和失效 Memory。
    cleanup() {}
}

export default BaseService;
