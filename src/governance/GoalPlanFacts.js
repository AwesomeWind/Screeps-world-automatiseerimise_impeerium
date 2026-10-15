function finiteNonNegative(value) {
    return Number.isFinite(value) && value >= 0 ? value : null;
}

function terminalFacts(room) {
    const terminal = room.terminal;
    if (!terminal) return { known: true, present: false, owned: null, id: null, freeCapacity: null };
    return {
        known: true,
        present: true,
        owned: typeof terminal.my === 'boolean' && terminal.structureType === STRUCTURE_TERMINAL &&
            terminal.pos?.roomName === room.name ? terminal.my : null,
        id: typeof terminal.id === 'string' && terminal.id.length > 0 && terminal.id.length <= 96 ? terminal.id : null,
        freeCapacity: typeof terminal.store?.getFreeCapacity === 'function' ? finiteNonNegative(terminal.store.getFreeCapacity()) : null
    };
}

function siteFacts(room) {
    if (typeof room.find !== 'function') return { known: false, id: null, progress: null, total: null };
    const site = room.find(FIND_MY_CONSTRUCTION_SITES).find(candidate => candidate.structureType === STRUCTURE_TERMINAL);
    return {
        known: true,
        id: site?.id || null,
        progress: site ? finiteNonNegative(site.progress) : null,
        total: site ? finiteNonNegative(site.progressTotal) : null
    };
}

export function collectGoalPlanFacts({ roomNames, now, codeVersion }) {
    const capturedAt = typeof Game !== 'undefined' && Number.isSafeInteger(Game.time) ? Game.time : null;
    const result = { capturedAt, codeVersion: typeof codeVersion === 'string' && codeVersion.length > 0 ? codeVersion : null, rooms: {}, errors: {} };
    if (capturedAt === null || now !== capturedAt) {
        result.errors.input = 'clock_mismatch';
        return result;
    }
    if (!Array.isArray(roomNames) || roomNames.length > 20) {
        result.errors.input = 'invalid_room_names';
        return result;
    }
    for (const roomName of new Set(roomNames)) {
        if (typeof roomName !== 'string' || roomName.length > 32 || !/^[WE]\d+[NS]\d+$/.test(roomName)) {
            result.errors.input = 'invalid_room_names';
            continue;
        }
        const room = Game.rooms[roomName];
        if (!room) {
            result.rooms[roomName] = { roomName, visible: false, owned: null };
            continue;
        }
        try {
            const recovery = global.RoomPhase?.[roomName]?.recovery;
            result.rooms[roomName] = {
                roomName,
                visible: true,
                owned: typeof room.controller?.my === 'boolean' ? room.controller.my : null,
                terminal: terminalFacts(room),
                site: siteFacts(room),
                recovery: {
                    mode: typeof recovery?.mode === 'string' ? recovery.mode : null,
                    evaluatedAt: Number.isSafeInteger(recovery?.evaluatedAt) ? recovery.evaluatedAt : null
                }
            };
        } catch {
            result.errors[roomName] = 'room_facts_unavailable';
        }
    }
    return result;
}
