import fs from 'node:fs';
import path from 'node:path';
import {HTTP_LIMITS, MEMORY_PATH, EXPECTED_VERSION, EvidenceReadError} from './decoder.mjs';
import {writeEvidenceBundle, writeHomeEvidenceBundle} from './artifacts.mjs';

try {
    const args = process.argv.slice(2);
    if (args.length === 0 || (args.length === 1 && args[0] === '--check')) {
        console.log(JSON.stringify({scope: 'local_only', memoryPath: MEMORY_PATH,
            expectedVersion: EXPECTED_VERSION, limits: HTTP_LIMITS, httpReaderImplemented: true,
            onlineExecutionAuthorized: false, onlineCliIncluded: false, credentialReads: 0,
            networkCalls: 0, realGameSamples: 0, runtimeAcceptance: 'not_performed'}));
    } else if ([4, 6, 8].includes(args.length) && args[0] === '--decode' && args[2] === '--out') {
        const extra = {};
        for (let index = 4; index < args.length; index += 2) {
            if (!['--profile', '--expected-version'].includes(args[index]) || Object.hasOwn(extra, args[index])) throw new EvidenceReadError('INVALID_PROFILE');
            extra[args[index]] = args[index + 1];
        }
        const profile = extra['--profile'] ?? 'economic_trial_v1';
        if (!['economic_trial_v1', 'home_natural_v1'].includes(profile)) throw new EvidenceReadError('INVALID_PROFILE');
        if (profile !== 'home_natural_v1' && Object.hasOwn(extra, '--expected-version')) throw new EvidenceReadError('INVALID_OPTIONS');
        const input = path.resolve(args[1]);
        if (/(?:^|[\\/])\.secret\.json$/i.test(input)) throw new EvidenceReadError('CREDENTIAL_INPUT_FORBIDDEN');
        let descriptor;
        try {
            descriptor = fs.openSync(input, 'r');
            if (!fs.fstatSync(descriptor).isFile()) throw new EvidenceReadError('INVALID_INPUT_FILE');
            const buffer = Buffer.alloc(HTTP_LIMITS.wireBytes + 1);
            let length = 0;
            while (length < buffer.length) {
                const bytes = fs.readSync(descriptor, buffer, length, buffer.length - length, null);
                if (!bytes) break;
                length += bytes;
            }
            if (length > HTTP_LIMITS.wireBytes) throw new EvidenceReadError('WIRE_TOO_LARGE');
            const writer = profile === 'home_natural_v1' ? writeHomeEvidenceBundle : writeEvidenceBundle;
            const manifest = writer(buffer.subarray(0, length), path.resolve(args[3]),
                extra['--expected-version'] === undefined ? {} : {expectedVersion: extra['--expected-version']});
            console.log(JSON.stringify({status: manifest.status, origin: manifest.origin,
                runtimeAcceptance: manifest.runtimeAcceptance, profile, networkCalls: 0}));
        } finally {if (descriptor !== undefined) fs.closeSync(descriptor);}
    } else {
        throw new EvidenceReadError('ONLINE_NOT_AUTHORIZED');
    }
} catch (failure) {
    console.error(failure instanceof EvidenceReadError ? failure.message : 'EVIDENCE_LOCAL_OPERATION_FAILED');
    process.exitCode = 1;
}
