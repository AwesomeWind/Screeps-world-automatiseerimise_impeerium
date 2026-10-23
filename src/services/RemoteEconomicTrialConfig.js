export function economicTrialConfigFingerprint(config, policy, targetRoom) {
    return config && JSON.stringify({
        baseRoom: config.baseRoom, targetRoom, sourceId: config.sourceId, containerId: config.containerId,
        containerPos: config.containerPos, receiverIds: config.homeDeliveryTargetIds,
        allowContainerBuild: config.allowContainerBuild, reserveController: config.reserveController,
        roleLimits: policy.roleLimits, bodyEnergyLimits: policy.bodyEnergyLimits,
        spawnEnergyLimit: policy.spawnEnergyLimit, infrastructureEnergyLimit: policy.infrastructureEnergyLimit,
        windowTicks: policy.windowTicks, safeStreakTicks: policy.safeStreakTicks,
        maxLegTicks: policy.maxLegTicks, reconCooldownTicks: policy.reconCooldownTicks
    });
}
