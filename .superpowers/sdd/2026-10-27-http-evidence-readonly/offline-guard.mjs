import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import {syncBuiltinESMExports} from 'node:module';

const readFileSync = fs.readFileSync.bind(fs);
const readFile = fs.readFile.bind(fs);
const promiseRead = fs.promises.readFile.bind(fs.promises);
function credentialPath(path) {
    return /(?:^|[\\/])\.secret\.json$/i.test(String(path));
}
function deny(kind) {
    fs.appendFileSync(new URL('./forbidden-attempts.txt', import.meta.url), kind + '\n');
    throw new Error('OFFLINE_' + kind + '_FORBIDDEN');
}
fs.readFileSync = (path, ...args) => credentialPath(path) ? deny('CREDENTIAL') : readFileSync(path, ...args);
fs.readFile = (path, ...args) => credentialPath(path) ? deny('CREDENTIAL') : readFile(path, ...args);
fs.promises.readFile = (path, ...args) => credentialPath(path) ? deny('CREDENTIAL') : promiseRead(path, ...args);
http.request = http.get = https.request = https.get = () => deny('NETWORK');
net.connect = net.createConnection = tls.connect = () => deny('NETWORK');
globalThis.fetch = () => deny('NETWORK');
syncBuiltinESMExports();
