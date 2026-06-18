function shouldUseStrictSourceRuntime(roomMemory) {
    const observation = roomMemory && roomMemory.cityPlanRuntimeObservation;
    return !!(observation &&
        observation.readyForRuntimeFallbackDisable &&
        typeof observation.readyStreak === 'number' &&
        observation.readyStreak >= 3);
}

export {
    shouldUseStrictSourceRuntime
};
