const CoreLayout = [
    ' E.T.E ',
    'E.E.E.E',
    '.E.S.E.',
    'T.E.O.T',
    '.E.S.E.',
    'E.E.E.E',
    ' E.T.E '
];

function parseBlueprint(layout, centerX, centerY) {
    const blueprint = {};
    blueprint[STRUCTURE_SPAWN] = [];
    blueprint[STRUCTURE_EXTENSION] = [];
    blueprint[STRUCTURE_TOWER] = [];
    blueprint[STRUCTURE_ROAD] = [];
    blueprint[STRUCTURE_STORAGE] = [];

    for (let y = 0; y < layout.length; y++) {
        for (let x = 0; x < layout[y].length; x++) {
            const dx = x - centerX;
            const dy = y - centerY;
            const char = layout[y][x];
            if (char === 'S') blueprint[STRUCTURE_SPAWN].push({ dx, dy });
            if (char === 'E') blueprint[STRUCTURE_EXTENSION].push({ dx, dy });
            if (char === 'T') blueprint[STRUCTURE_TOWER].push({ dx, dy });
            if (char === '.') blueprint[STRUCTURE_ROAD].push({ dx, dy });
            if (char === 'O') blueprint[STRUCTURE_STORAGE].push({ dx, dy });
        }
    }

    return blueprint;
}

const parsedCoreBlueprint = parseBlueprint(CoreLayout, 3, 3);

export {
    CoreLayout,
    parsedCoreBlueprint
};
