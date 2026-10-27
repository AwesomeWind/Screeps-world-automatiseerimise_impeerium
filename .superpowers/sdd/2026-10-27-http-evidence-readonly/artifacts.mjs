import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodeMemoryResponse, EvidenceReadError} from './decoder.mjs';
import {decodeHomeMemoryResponse} from './home-decoder.mjs';

/** Local imports are always labeled offline; this manifest does not certify a server download. */
export function writeEvidenceBundle(raw, directory, options = {}) {
    return writeBundle(raw, directory, decodeMemoryResponse(raw, options));
}
export function writeHomeEvidenceBundle(raw, directory, options = {}) {
    return writeBundle(raw, directory, decodeHomeMemoryResponse(raw, options));
}
function writeBundle(raw, directory, decoded) {
    try {fs.mkdirSync(directory, {mode: 0o700});}
    catch (failure) {throw new EvidenceReadError(failure.code === 'EEXIST' ? 'OUTPUT_EXISTS' : 'OUTPUT_CREATE_FAILED');}
    const {store, ...report} = decoded;
    const files = {
        'response.json': Buffer.from(raw),
        'store.json': Buffer.from(JSON.stringify(store, null, 2)),
        'report.json': Buffer.from(JSON.stringify(report, null, 2))
    };
    const manifest = {schemaVersion: 1, origin: 'offline_import', status: decoded.status,
        runtimeAcceptance: 'not_performed', networkEvidence: 'not_asserted', files: {}};
    try {
        for (const [name, bytes] of Object.entries(files)) {
            fs.writeFileSync(path.join(directory, name), bytes, {flag: 'wx', mode: 0o600});
            manifest.files[name] = {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
        }
        // This last file is the completion marker. A failed export is never rolled back or overwritten.
        fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), {flag: 'wx', mode: 0o600});
    } catch {throw new EvidenceReadError('OUTPUT_WRITE_FAILED');}
    return manifest;
}
