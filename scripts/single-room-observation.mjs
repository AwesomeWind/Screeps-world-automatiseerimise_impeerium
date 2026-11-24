import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { projectPilotProof, pilotControlDifferences } from './single-room-pilot-review.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i];
    if (key === '--help') {
        console.log('node single-room-observation.mjs [--shard shard3] [--room W49N41] [--output relative.jsonl] [--target-ticks 10000 --expected-main-sha SHA256] [--expected-pilot-room W49N41 --expected-map-sha SHA256] [--verify-closed-pilot-room W49N41 --expected-main-sha SHA256 --expected-map-sha SHA256] [--transport-module relative.mjs]');
        process.exit(0);
    }
    if (!['--shard', '--room', '--output', '--target-ticks', '--expected-main-sha', '--expected-pilot-room', '--expected-map-sha', '--verify-closed-pilot-room', '--transport-module'].includes(key) || !process.argv[i + 1]) throw new Error('Invalid observation argument');
    args.set(key, process.argv[++i]);
}

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const boundedHistory = history => Array.isArray(history) ? history.slice(-50) : [];

async function openTransport(target) {
    const requested = args.get('--transport-module');
    if (requested) {
        const file = fs.realpathSync(path.resolve(root, requested));
        if (!file.startsWith(fs.realpathSync(root) + path.sep)) throw new Error('Observation transport must be inside the workspace');
        const module = await import(pathToFileURL(file));
        return module.createObservationTransport(target);
    }

    const config = JSON.parse(fs.readFileSync(path.join(root, '.secret.json'), 'utf8')).main;
    if (!config || config.hostname !== 'screeps.com' || typeof config.token !== 'string') throw new Error('Expected the configured screeps.com token account');
    return {branch: config.branch || 'default', async get(endpoint) {
        const response = await fetch(new URL(endpoint, 'https://screeps.com'), {
            method: 'GET', headers: { 'X-Token': config.token }, signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error('Read HTTP ' + response.status);
        const result = await response.json();
        if (!result.ok) throw new Error('Read operation did not succeed');
        return result;
    }};
}

function observationOutput() {
    const output = path.resolve(root, args.get('--output') || `docs/superpowers/evidence/readonly-${Date.now()}.jsonl`);
    if (!output.startsWith(root + path.sep) || path.extname(output) !== '.jsonl') throw new Error('Observation output must be a new workspace JSONL file');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    if (!fs.realpathSync(path.dirname(output)).startsWith(fs.realpathSync(root) + path.sep)) throw new Error('Output directory resolves outside the workspace');
    return output;
}

function safeFailure(error) {
    const code = /^[A-Z0-9_]{1,80}$/.test(error?.code || '') ? error.code : null;
    return {
        code,
        stage: error?.observation?.stage ?? null,
        abortSource: error?.observation?.abortSource ?? null,
        causeRequestId: error?.observation?.causeRequestId ?? null
    };
}

function observationOptions(roomName) {
    const targetTicks = Number(args.get('--target-ticks') || 0);
    const pilotRoom = args.get('--expected-pilot-room');
    const closedPilotRoom = args.get('--verify-closed-pilot-room');
    const orderedPilot = Boolean(pilotRoom || closedPilotRoom);
    const expectedMapSha256 = args.get('--expected-map-sha');
    if (pilotRoom && (pilotRoom !== roomName || targetTicks !== 10000 ||
        !/^[a-f0-9]{64}$/.test(expectedMapSha256 || ''))) {
        throw new Error('Pilot review requires the same room, a 10000-tick window and an explicit map SHA-256');
    }
    if (closedPilotRoom && (pilotRoom || closedPilotRoom !== roomName || targetTicks !== 0 ||
        !/^[a-f0-9]{64}$/.test(expectedMapSha256 || ''))) {
        throw new Error('Closed pilot verification requires the same room, one snapshot and an explicit map SHA-256');
    }
    if (![0, 10000].includes(targetTicks)) throw new Error('The bounded acceptance collector supports 10000 ticks or one snapshot');
    const expectedHash = args.get('--expected-main-sha') || (fs.existsSync(path.join(root, 'dist/main.js')) ? hash(fs.readFileSync(path.join(root, 'dist/main.js'))) : null);
    if ((targetTicks || closedPilotRoom) && !args.has('--expected-main-sha')) throw new Error('An explicit verified deployment SHA-256 is required');
    if (expectedHash && !/^[a-f0-9]{64}$/i.test(expectedHash)) throw new Error('Invalid expected SHA-256');
    return {targetTicks, pilotRoom, closedPilotRoom, orderedPilot, expectedMapSha256, expectedHash};
}

async function main() {
    const output = observationOutput();
    const fd = fs.openSync(output, 'wx');
    let evidence;
    let transport;
    let evidenceFailures = 0;
    let evidenceRecords = 0;
    const runId = crypto.randomUUID();
    const started = performance.now();
    let requestSequence = 0;
    let primaryFailure = null;
    function recordRequest(entry) {
        if (++evidenceRecords > 65000) {
            evidenceFailures++;
            return;
        }
        try {
            fs.writeSync(evidence, JSON.stringify({
                ...entry, runId, observedAt: new Date().toISOString(),
                elapsedMs: Math.round(performance.now() - started)
            }) + '\n');
        } catch {
            evidenceFailures++;
        }
    }

    let summary = {snapshots: 0, startTick: null, lastTick: null, observedTicks: 0, stopReason: 'read_failed'};
    try {
        evidence = fs.openSync(output + '.requests.jsonl', 'wx');
        const target = {shard: args.get('--shard') || 'shard3', roomName: args.get('--room') || 'W49N41'};
        const options = observationOptions(target.roomName);
        transport = await openTransport({...target, recordRequest});
        const get = async (endpoint, pollId, pair) => {
            const requestId = [runId, pollId, ++requestSequence].join('-');
            const identity = {requestId, pollId, endpoint};
            recordRequest({...identity, event: 'read_started'});
            try {
                const data = await transport.get(endpoint, {...identity, signal: pair?.signal});
                pair?.signal.throwIfAborted();
                recordRequest({...identity, event: 'read_complete'});
                return {data, requestId};
            } catch (error) {
                const failure = {...identity, ...safeFailure(error)};
                const cause = pair?.signal?.reason;
                if (cause?.code === 'SIBLING_CANCELED' && cause.causeRequestId !== requestId &&
                    (error === cause || failure.abortSource === 'sibling_after_failure')) {
                    failure.abortSource = 'sibling_after_failure';
                    failure.causeRequestId = cause.causeRequestId;
                }
                primaryFailure ??= failure;
                recordRequest({...failure, event: 'read_failed'});
                pair?.abort(Object.assign(new Error('Paired read failed'), {code: 'SIBLING_CANCELED', causeRequestId: requestId}));
                throw error;
            }
        };
        summary = await observe({get, branch: transport.branch, fd, runId, recordRequest}, target, options);
    } catch (error) {
        primaryFailure ??= safeFailure(error);
        console.error('Observation failed: ' + (safeFailure(error).code || 'OBSERVATION_FAILED'));
        process.exitCode = 1;
    } finally {
        const emitSummary = () => console.log(JSON.stringify({
            output, runId, ...summary, primaryFailure, evidenceFailures, acceptancePassed: false
        }));
        const summaryEmitted = primaryFailure !== null;
        if (summaryEmitted) emitSummary();
        let timer;
        try {
            const cleanup = await Promise.race([
                Promise.resolve().then(() => transport?.close?.()).then(() => 'closed'),
                new Promise(resolve => {timer = setTimeout(() => resolve('deadline'), 150);})
            ]);
            if (cleanup === 'deadline') {
                recordRequest({event: 'cleanup_deadline'});
                process.exitCode = 1;
                summary.stopReason = 'cleanup_failed';
            }
        } catch (error) {
            primaryFailure ??= safeFailure(error);
            summary.stopReason = 'cleanup_failed';
            process.exitCode = 1;
        } finally {
            clearTimeout(timer);
            if (evidence !== undefined) fs.closeSync(evidence);
            fs.closeSync(fd);
        }
        if (!summaryEmitted) emitSummary();
    }
}

async function observe({get, branch, fd, runId, recordRequest}, {shard, roomName},
    {targetTicks, pilotRoom, closedPilotRoom, orderedPilot, expectedMapSha256, expectedHash}) {
    let count = 0;
    let startTick = null;
    let lastSavedTick = null;
    let version = null;
    let lastTick = null;
    let stopReason = 'single_snapshot';
    try {
        const {data: code} = await get(`/api/user/code?branch=${encodeURIComponent(branch)}`, 0);
        if (typeof code.modules?.main !== 'string') throw new Error('The selected branch has no main module');
        const deployedHash = hash(code.modules.main);
        const deployedMapSha256 = typeof code.modules['main.js.map'] === 'string' ? hash(code.modules['main.js.map']) : null;
        if (orderedPilot && deployedMapSha256 !== expectedMapSha256) throw new Error('Expected deployment map does not match the game branch');
        const deployedVersion = code.modules.main.match(/\bconst SERVICE_VERSION\s*=\s*['"]([^'"]+)['"]/);
        if ((targetTicks || closedPilotRoom) && deployedHash !== expectedHash) throw new Error('Expected deployment fingerprint does not match the game branch');
        const snapshotLimit = pilotRoom ? 4000 : 251;
        const memoryPath = '/api/user/memory?shard=' + encodeURIComponent(shard);
        const clockPath = '/api/game/time?shard=' + encodeURIComponent(shard);
        for (let reads = 0; reads < 4000 && count < snapshotLimit; reads++) {
            const pair = new AbortController();
            const pollId = reads + 1;
            const pendingMemory = get(memoryPath, pollId, pair);
            let memoryRead;
            let clockRead;
            if (orderedPilot) memoryRead = await pendingMemory;
            else [memoryRead, clockRead] = await Promise.all([pendingMemory, get(clockPath, pollId, pair)]);

            const data = memoryRead.data;
            let raw, memory;
            try {
                raw = data.data.startsWith('gz:') ? zlib.gunzipSync(Buffer.from(data.data.slice(3), 'base64')).toString('utf8') : data.data;
                memory = JSON.parse(raw);
            } catch {
                recordRequest({event: 'pair_rejected', pollId, requestId: memoryRead.requestId, reason: 'memory_decode_failed'});
                throw Object.assign(new Error('Memory read could not be decoded'), {code: 'PILOT_MEMORY_DECODE_FAILED'});
            }
            const control = memory?.empire?.control || {};
            const room = control.metrics?.rooms?.[roomName] || null;
            const clocks = [control.telemetry?.updatedAt, room?.capturedAt];
            const roomVersionMatches = room?.codeVersion === control.telemetry?.codeVersion;
            const hasComparableClocks = roomVersionMatches && clocks.every(Number.isSafeInteger);
            if (orderedPilot && hasComparableClocks) clockRead = await get(clockPath, pollId, pair);
            const tick = clockRead?.data.time;
            if (clockRead && !Number.isSafeInteger(tick)) throw new Error('The game clock is unavailable');
            if (orderedPilot && (!hasComparableClocks || clocks.some(clock => clock > tick || tick - clock > 10))) {
                recordRequest({event: 'pair_rejected', pollId, gameTime: tick ?? null,
                    telemetryTick: clocks[0] ?? null, roomTick: clocks[1] ?? null, roomVersionMatches});
                stopReason = 'sample_pair_inconsistent';
                process.exitCode = 1;
                break;
            }
            const codeVersion = control.telemetry?.codeVersion || null;
            if (pilotRoom && lastTick !== null && tick < lastTick) { stopReason = 'world_clock_regressed'; break; }
            if (startTick === null) { startTick = tick; version = codeVersion; }
            if ((targetTicks || closedPilotRoom) && (!version || codeVersion !== version || !deployedVersion || codeVersion !== deployedVersion[1])) {
                stopReason = 'version_missing_or_changed';
                if (closedPilotRoom) process.exitCode = 1;
                break;
            }
            const proof = orderedPilot ? projectPilotProof(memory, roomName, {tick, nowMs: Date.now()}) : null;
            const pilotFaults = proof ? pilotControlDifferences({controls: proof.controls,
                governorShadow: control.policy?.roomGovernor?.shadow,
                schedulerEnforce: control.policy?.scheduler?.enforce}, pilotRoom ?? null) : [];
            if (closedPilotRoom && pilotFaults.length) {
                recordRequest({event: 'pair_rejected', pollId, gameTime: tick, pilotFaults});
                stopReason = 'pilot_controls_missing_or_changed';
                process.exitCode = 1;
                break;
            }
            const reached = tick - startTick >= targetTicks;
            if (lastSavedTick === null || tick - lastSavedTick >= (pilotRoom ? 1 : 50) || reached || pilotFaults.length) {
                const upgradeControl = control.rooms?.[roomName]?.capabilityControl?.upgradeWork;
                const sample = {
                    schemaVersion: 2, runId, pollId: reads + 1,
                    pair: {memoryRequestId: memoryRead.requestId, timeRequestId: clockRead.requestId},
                    readOnly: true, observedAt: new Date().toISOString(), shard, roomName, branch,
                    deployedMainSha256: deployedHash, expectedMainSha256: expectedHash, artifactMatches: deployedHash === expectedHash,
                    deployedServiceVersion: deployedVersion ? deployedVersion[1] : null,
                    gameTime: tick, codeVersion, runtimeTick: control.runtime?.cpuModeEvaluatedAt || null,
                    memoryBytes: Buffer.byteLength(raw), cpuBucket: control.runtime?.cpuBucket ?? null,
                    cpuEwma: control.telemetry?.totalCpuEwma ?? null, cpuP95: control.telemetry?.totalCpuP95 ?? null,
                    cpuHistory: boundedHistory(control.telemetry?.history),
                    schedulerEnforce: control.policy?.scheduler?.enforce ?? null,
                    governorShadow: control.policy?.roomGovernor?.shadow ?? null,
                    capabilityControl: upgradeControl ? {
                        requestedMode: upgradeControl.requestedMode, effectiveMode: upgradeControl.effectiveMode,
                        adoptedSource: upgradeControl.adoptedSource, action: upgradeControl.action,
                        fallbackCount: upgradeControl.fallbackCount, autoSuspended: upgradeControl.autoSuspended
                    } : null,
                    room, roomHistory: boundedHistory(control.metrics?.histories?.[roomName]?.samples),
                    metricsAge: room && Number.isFinite(room.capturedAt) ? tick - room.capturedAt : null,
                    ...(proof ? {pilotProof: proof, deployedMapSha256} : {}),
                    acceptancePassed: false
                };
                fs.writeSync(fd, JSON.stringify(sample) + '\n');
                count++;
                lastSavedTick = tick;
            }
            lastTick = tick;
            if (!targetTicks) {
                if (closedPilotRoom) stopReason = 'closed_pilot_snapshot';
                break;
            }
            if (pilotFaults.length) { stopReason = 'pilot_controls_missing_or_changed'; break; }
            if (reached) {
                if (pilotRoom) {
                    const {data: endCode} = await get('/api/user/code?branch=' + encodeURIComponent(branch), reads + 2);
                    const modules = endCode.modules || {};
                    if (typeof modules.main !== 'string' || hash(modules.main) !== deployedHash ||
                        typeof modules['main.js.map'] !== 'string' || hash(modules['main.js.map']) !== expectedMapSha256) {
                        stopReason = 'end_deployment_fingerprint_mismatch';
                        break;
                    }
                }
                stopReason = 'window_reached_review_required';
                break;
            }
            stopReason = 'read_or_snapshot_limit';
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    } catch (error) {
        stopReason = 'read_failed';
        console.error('Observation failed: ' + (safeFailure(error).code || 'OBSERVATION_FAILED'));
        process.exitCode = 1;
    }
    return {snapshots: count, startTick, lastTick, observedTicks: lastTick === null ? 0 : lastTick - startTick, stopReason};
}

main().catch(error => { console.error(`Observation failed: ${error.message}`); process.exitCode = 1; });
