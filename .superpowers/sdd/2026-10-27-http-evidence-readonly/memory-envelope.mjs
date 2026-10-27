import {gunzipSync} from 'node:zlib';
import {TextDecoder} from 'node:util';

export const WIRE_HTTP_LIMITS = Object.freeze({wireBytes: 2 * 1024 * 1024, requestMs: 15000, totalMs: 60000});
export class EvidenceReadError extends Error {
    constructor(code) {super('EVIDENCE_' + code); this.name = 'EvidenceReadError';}
}
const fail = code => {throw new EvidenceReadError(code);};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function utf8(bytes) {
    try {return new TextDecoder('utf-8', {fatal: true}).decode(bytes);}
    catch {fail('INVALID_UTF8');}
}
function parse(text, code) {
    try {return JSON.parse(text);}
    catch {fail(code);}
}

/** Shared wire codec only; a caller must still validate its own profile/schema. */
export function decodeRawMemoryEnvelope(body, limits) {
    if (!(body instanceof Uint8Array)) fail('INVALID_BODY');
    if (body.byteLength > limits.wireBytes) fail('WIRE_TOO_LARGE');
    const envelope = parse(utf8(body), 'INVALID_HTTP_JSON');
    if (!record(envelope) || envelope.ok !== 1 || Object.hasOwn(envelope, 'error')) fail('INVALID_HTTP_ENVELOPE');
    if (envelope.data == null) return {status: 'missing', value: null};
    if (typeof envelope.data !== 'string') fail('INVALID_HTTP_DATA');
    let text = envelope.data;
    if (text.startsWith('gz:')) {
        const base64 = text.slice(3);
        if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) fail('INVALID_BASE64');
        const bytes = Buffer.from(base64, 'base64');
        if (bytes.toString('base64') !== base64) fail('INVALID_BASE64');
        let output;
        try {output = gunzipSync(bytes, {maxOutputLength: limits.decodedBytes});}
        catch (error) {fail(error.code === 'ERR_BUFFER_TOO_LARGE' ? 'DECODE_TOO_LARGE' : 'INVALID_GZIP');}
        text = utf8(output);
    }
    if (text.length > limits.storeChars) fail('STORE_TOO_LARGE');
    const value = parse(text, 'INVALID_MEMORY_JSON');
    return {status: value === null ? 'missing' : 'present', value};
}
