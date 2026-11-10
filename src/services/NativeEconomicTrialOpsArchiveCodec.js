import { nativeOpsRecord as record } from './NativeEconomicTrialOpsProfile.js';

export const NATIVE_ARCHIVE_LIMIT = 49152;
export const NATIVE_STATE_LIMIT = 65536;
const MAX_DEPTH = 64;
const MAX_REFERENCES = 256;
const REFERENCE_KEY = '$ref';
const compound = value => value !== null && typeof value === 'object';

export function packNativeEvidence(value) {
    const counts = new Map();
    function count(item, depth) {
        if (depth > MAX_DEPTH) throw Error('archive_depth');
        if (!compound(item)) return;
        if (Object.hasOwn(item, REFERENCE_KEY)) throw Error('archive_reference_collision');
        const key = JSON.stringify(item);
        if (key.length >= 80) counts.set(key, (counts.get(key) || 0) + 1);
        for (const child of Object.values(item)) count(child, depth + 1);
    }
    if (JSON.stringify(value).length > NATIVE_STATE_LIMIT) throw Error('archive_expansion');
    count(value, 0);
    const ids = new Map(), table = [];
    function encode(item, share = true) {
        if (!compound(item)) return item;
        const key = JSON.stringify(item);
        if (share && counts.get(key) > 1 && (ids.has(key) || table.length < MAX_REFERENCES)) {
            if (!ids.has(key)) {
                const id = table.length;
                ids.set(key, id);
                table.push(null);
                table[id] = encode(item, false);
            }
            return {[REFERENCE_KEY]: ids.get(key)};
        }
        if (Array.isArray(item)) return item.map(child => encode(child));
        return Object.fromEntries(Object.entries(item).map(([k, child]) => [k, encode(child)]));
    }
    const packed = {format: 1, data: encode(value), table};
    if (JSON.stringify(packed).length > NATIVE_ARCHIVE_LIMIT) throw Error('history_capacity');
    return packed;
}

export function unpackNativeEvidence(packed) {
    if (!record(packed) || packed.format !== 1 || Object.keys(packed).length !== 3 ||
        !Object.hasOwn(packed, 'data') || !Array.isArray(packed.table) || packed.table.length > MAX_REFERENCES ||
        JSON.stringify(packed).length > NATIVE_ARCHIVE_LIMIT)
        throw Error('archive_format');
    let remaining = NATIVE_STATE_LIMIT;
    const active = new Set(), used = new Set();
    function spend(amount) {
        remaining -= amount;
        if (remaining < 0) throw Error('archive_expansion');
    }
    function decode(item, depth) {
        if (depth > MAX_DEPTH) throw Error('archive_depth');
        if (!compound(item)) {
            spend(JSON.stringify(item).length);
            return item;
        }
        if (record(item) && Object.hasOwn(item, REFERENCE_KEY)) {
            const id = item[REFERENCE_KEY];
            if (Object.keys(item).length !== 1 || !Number.isSafeInteger(id) || id < 0 ||
                !Object.hasOwn(packed.table, id) || active.has(id))
                throw Error('archive_reference');
            active.add(id);
            used.add(id);
            const value = decode(packed.table[id], depth + 1);
            active.delete(id);
            return value;
        }
        const keys = Object.keys(item);
        spend(2 + Math.max(0, keys.length - 1));
        if (Array.isArray(item)) return item.map(child => decode(child, depth + 1));
        return Object.fromEntries(keys.map(key => {
            spend(JSON.stringify(key).length + 1);
            return [key, decode(item[key], depth + 1)];
        }));
    }
    const result = decode(packed.data, 0);
    if (used.size !== packed.table.length) throw Error('archive_unused_reference');
    return result;
}
