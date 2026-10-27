import {HTTP_LIMITS, MEMORY_PATH, validateDecodeOptions, decodeMemoryResponse} from './decoder.mjs';
import {HOME_MEMORY_PATH, validateHomeDecodeOptions, decodeHomeMemoryResponse} from './home-decoder.mjs';
import {EvidenceReadError} from './memory-envelope.mjs';

const error = code => new EvidenceReadError(code);
const allowedOptions = ['allowNetwork', 'expectedVersion', 'expectedIdentity', 'tokenProvider', 'fetchImpl',
    'expectedWindowId', 'now', 'deadlineMs', 'setTimer', 'clearTimer'];
const profiles = Object.freeze({
    economic_trial_v1: {path: MEMORY_PATH, validate: validateDecodeOptions, decode: decodeMemoryResponse},
    home_natural_v1: {path: HOME_MEMORY_PATH, validate: validateHomeDecodeOptions, decode: decodeHomeMemoryResponse}
});

/** A single-use GET. Creating/importing it does not read credentials or open any connection. */
export function createProfileReader(profileId, options = {}) {
    if (!Object.hasOwn(profiles, profileId)) throw error('INVALID_PROFILE');
    if (!options || Object.keys(options).some(key => !allowedOptions.includes(key))) throw error('INVALID_OPTIONS');
    if (profileId === 'economic_trial_v1' && Object.hasOwn(options, 'expectedWindowId') ||
        profileId === 'home_natural_v1' && Object.hasOwn(options, 'expectedIdentity')) throw error('INVALID_OPTIONS');
    const profile = profiles[profileId];
    const MEMORY_URL = 'https://screeps.com/api/user/memory?shard=shard3&path=' + profile.path;
    const expected = profile.validate(options);
    const {allowNetwork = false, tokenProvider, fetchImpl = globalThis.fetch, now = Date.now,
        deadlineMs, setTimer = setTimeout, clearTimer = clearTimeout} = options;
    let consumed = false;

    async function read(input = {}) {
        if (consumed) throw error('READER_CONSUMED');
        consumed = true;
        if (allowNetwork !== true) throw error('ONLINE_NOT_AUTHORIZED');
        if (profileId === 'home_natural_v1' && expected.expectedVersion === undefined) throw error('INVALID_EXPECTATION');
        if (!input || Object.keys(input).some(key => key !== 'signal')) throw error('INVALID_READ');
        const {signal} = input;
        if (signal && !(signal instanceof AbortSignal)) throw error('INVALID_READ');
        if (typeof tokenProvider !== 'function' || typeof fetchImpl !== 'function' || typeof now !== 'function') throw error('INVALID_OPTIONS');

        const startedAtMs = now();
        if (!Number.isSafeInteger(startedAtMs) || startedAtMs < 0 || (deadlineMs !== undefined &&
            (!Number.isSafeInteger(deadlineMs) || deadlineMs <= startedAtMs || deadlineMs - startedAtMs > HTTP_LIMITS.totalMs))) throw error('INVALID_DEADLINE');
        const stopAtMs = Math.min(startedAtMs + HTTP_LIMITS.requestMs, deadlineMs ?? Infinity);
        const controller = new AbortController();
        let stopped = null, rejectStop, timer, streamReader, response;
        let lastMs = startedAtMs;
        const stopPromise = new Promise((_resolve, reject) => {rejectStop = reject;});
        stopPromise.catch(() => {});
        const stop = code => {
            if (stopped) return;
            stopped = error(code);
            controller.abort();
            rejectStop(stopped);
        };
        const cancel = () => stop('CANCELLED');
        const check = () => {
            if (stopped) throw stopped;
            const value = now();
            if (!Number.isSafeInteger(value) || value < lastMs) throw error('INVALID_CLOCK');
            lastMs = value;
            if (value >= stopAtMs) {stop('DEADLINE'); throw stopped;}
            return value;
        };
        const bounded = async operation => {
            check();
            const result = await Promise.race([Promise.resolve().then(() => {check(); return operation();}), stopPromise]);
            check();
            return result;
        };

        try {
            signal?.addEventListener('abort', cancel, {once: true});
            if (signal?.aborted) cancel();
            timer = setTimer(() => stop('DEADLINE'), stopAtMs - startedAtMs);
            const token = await bounded(() => tokenProvider({signal: controller.signal, deadlineMs: stopAtMs}));
            if (typeof token !== 'string' || !token || /[\r\n]/.test(token) || token.length > 4096) throw error('INVALID_TOKEN');
            response = await bounded(async () => {
                const received = await fetchImpl(MEMORY_URL, {
                    method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
                    headers: {'X-Token': token, Accept: 'application/json'}, signal: controller.signal
                });
                response = received;
                if (controller.signal.aborted) {
                    try {Promise.resolve(received?.body?.cancel()).catch(() => {});} catch {}
                }
                return received;
            });
            if (!response || !Number.isInteger(response.status)) throw error('INVALID_RESPONSE');
            if (response.status !== 200) throw error('HTTP_' + response.status);
            if (response.redirected || (response.url && response.url !== MEMORY_URL)) throw error('UNEXPECTED_URL');
            const declared = response.headers?.get('content-length');
            if (declared !== null && declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > HTTP_LIMITS.wireBytes)) throw error('WIRE_TOO_LARGE');
            const contentType = response.headers?.get('content-type');
            if (contentType && !/^application\/json(?:\s*;|$)/i.test(contentType)) throw error('INVALID_CONTENT_TYPE');
            if (!response.body || typeof response.body.getReader !== 'function') throw error('INVALID_RESPONSE');
            streamReader = response.body.getReader();
            const chunks = [];
            let bytes = 0;
            while (true) {
                const chunk = await bounded(() => streamReader.read());
                if (chunk.done) break;
                if (!(chunk.value instanceof Uint8Array)) throw error('INVALID_RESPONSE');
                bytes += chunk.value.byteLength;
                if (bytes > HTTP_LIMITS.wireBytes) throw error('WIRE_TOO_LARGE');
                chunks.push(Buffer.from(chunk.value));
            }
            const raw = Buffer.concat(chunks, bytes);
            const decoded = profile.decode(raw, expected);
            const completedAtMs = check();
            return {raw, decoded, metadata: {schemaVersion: 1, method: 'GET', url: MEMORY_URL, shard: 'shard3',
                memoryPath: profile.path, httpStatus: 200, attempts: 1, startedAtMs, completedAtMs,
                elapsedMs: completedAtMs - startedAtMs, wireBytes: bytes, runtimeAcceptance: 'not_performed'}};
        } catch (failure) {
            // SDK/network errors may contain headers or request objects. Never return their text/cause.
            if (stopped) throw stopped;
            if (failure instanceof EvidenceReadError) throw failure;
            throw error('TRANSPORT_FAILED');
        } finally {
            clearTimer(timer);
            signal?.removeEventListener('abort', cancel);
            controller.abort();
            // Cleanup does not acquire a new deadline or delay the caller after a hung stream.
            try {
                const cleanup = streamReader ? streamReader.cancel() : response?.body?.cancel();
                Promise.resolve(cleanup).catch(() => {});
            } catch {}
        }
    }
    return Object.freeze({read});
}

export const createHomeMemoryReader = options => createProfileReader('home_natural_v1', options);
