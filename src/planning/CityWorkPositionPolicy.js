function getCityWorkPositions(cityPlan = {}) {
    return cityPlan.workPositions || {};
}

function getSourceMiningWorkPosition(cityPlan = {}, sourceId) {
    const workPositions = getCityWorkPositions(cityPlan);
    const plannedPos = workPositions.sources &&
        workPositions.sources[sourceId] &&
        workPositions.sources[sourceId].mining &&
        workPositions.sources[sourceId].mining.primary;
    return plannedPos || null;
}

function getControllerUpgradeWorkPosition(cityPlan = {}) {
    const workPositions = getCityWorkPositions(cityPlan);
    const plannedPos = workPositions.controller &&
        workPositions.controller.upgrade &&
        workPositions.controller.upgrade.primary;
    return plannedPos || null;
}

export {
    getCityWorkPositions,
    getSourceMiningWorkPosition,
    getControllerUpgradeWorkPosition
};
