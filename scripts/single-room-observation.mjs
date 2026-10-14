import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i];
    if (key === '--help') {
        console.log('node single-room-observation.mjs [--shard shard3] [--room W49N41] [--output relative.jsonl] [--target-ticks 10000 --expected-main-sha SHA256]');
        process.exit(0);
    }
    if (!['--shard', '--room', '--output', '--target-ticks', '--expected-main-sha'].includes(key) || !process.argv[i + 1]) throw new Error('Invalid observation argument');
    args.set(key, process.argv[++i]);
}

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const boundedHistory = history => Array.isArray(history) ? history.slice(-50) : [];

async function main() {
    const config = JSON.parse(fs.readFileSync(path.join(root, '.secret.json'), 'utf8')).main;
    if (!config || config.hostname !== 'screeps.com' || typeof config.token !== 'string') throw new Error('Expected the configured screeps.com token account');
    const shard = args.get('--shard') || 'shard3';
    const roomName = args.get('--room') || 'W49N41';
    const branch = config.branch || 'default';
    const targetTicks = Number(args.get('--target-ticks') || 0);
    if (![0, 10000].includes(targetTicks)) throw new Error('The bounded acceptance collector supports 10000 ticks or one snapshot');
    const expectedHash = args.get('--expected-main-sha') || (fs.existsSync(path.join(root, 'dist/main.js')) ? hash(fs.readFileSync(path.join(root, 'dist/main.js'))) : null);
    if (targetTicks && !args.has('--expected-main-sha')) throw new Error('A window requires the explicitly verified deployment SHA-256');
    if (expectedHash && !/^[a-f0-9]{64}$/i.test(expectedHash)) throw new Error('Invalid expected SHA-256');
    const output = path.resolve(root, args.get('--output') || `docs/superpowers/evidence/readonly-${Date.now()}.jsonl`);
    if (!output.startsWith(root + path.sep) || path.extname(output) !== '.jsonl') throw new Error('Observation output must be a new workspace JSONL file');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    if (!fs.realpathSync(path.dirname(output)).startsWith(fs.realpathSync(root) + path.sep)) throw new Error('Output directory resolves outside the workspace');
    const get = async endpoint => {
        const response = await fetch(new URL(endpoint, 'https://screeps.com'), {
            method: 'GET', headers: { 'X-Token': config.token }, signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error(`Read HTTP ${response.status}`);
        const result = await response.json();
        if (!result.ok) throw new Error('Read operation did not succeed');
        return result;
    };
    const code = await get(`/api/user/code?branch=${encodeURIComponent(branch)}`);
    if (typeof code.modules?.main !== 'string') throw new Error('The selected branch has no main module');
    const deployedHash = hash(code.modules.main);
    const deployedVersion = code.modules.main.match(/\bconst SERVICE_VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (targetTicks && deployedHash !== expectedHash) throw new Error('Expected deployment fingerprint does not match the game branch');
    const fd = fs.openSync(output, 'wx');
    let count = 0;
    let startTick = null;
    let lastSavedTick = null;
    let version = null;
    let lastTick = null;
    let stopReason = 'single_snapshot';
    try {
        for (let reads = 0; reads < 4000 && count < 251; reads++) {
            const [data, time] = await Promise.all([
                get(`/api/user/memory?shard=${encodeURIComponent(shard)}`),
                get(`/api/game/time?shard=${encodeURIComponent(shard)}`)
            ]);
            const raw = data.data.startsWith('gz:') ? zlib.gunzipSync(Buffer.from(data.data.slice(3), 'base64')).toString('utf8') : data.data;
            const memory = JSON.parse(raw);
            const control = memory.empire?.control || {};
            const tick = time.time;
            if (!Number.isSafeInteger(tick)) throw new Error('The game clock is unavailable');
            const codeVersion = control.telemetry?.codeVersion || null;
            if (startTick === null) { startTick = tick; version = codeVersion; }
            if (targetTicks && (!version || codeVersion !== version || !deployedVersion || codeVersion !== deployedVersion[1])) { stopReason = 'version_missing_or_changed'; break; }
            const reached = tick - startTick >= targetTicks;
            if (lastSavedTick === null || tick - lastSavedTick >= 50 || reached) {
                const room = control.metrics?.rooms?.[roomName] || null;
                const upgradeControl = control.rooms?.[roomName]?.capabilityControl?.upgradeWork;
                const sample = {
                    schemaVersion: 1, readOnly: true, observedAt: new Date().toISOString(), shard, roomName, branch,
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
                    acceptancePassed: false
                };
                fs.writeSync(fd, JSON.stringify(sample) + '\n');
                count++;
                lastSavedTick = tick;
            }
            lastTick = tick;
            if (!targetTicks) break;
            if (reached) { stopReason = 'window_reached_review_required'; break; }
            stopReason = 'read_or_snapshot_limit';
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    } finally {
        fs.closeSync(fd);
    }
    console.log(JSON.stringify({ output, snapshots: count, startTick, lastTick, observedTicks: lastTick === null ? 0 : lastTick - startTick, stopReason, acceptancePassed: false }));
}

main().catch(error => { console.error(`Observation failed: ${error.message}`); process.exitCode = 1; });
