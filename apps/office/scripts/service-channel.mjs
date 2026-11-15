import { createHmac } from 'node:crypto';
import { createServer, request } from 'node:https';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// Mutual proof of the per-launch key before either side sends application data.
// A Windows pipe name and a Unix socket path are addresses, not credentials.
const tls = { minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2', ciphers: 'PSK-AES256-GCM-SHA384' };
const keyOf = (key, name) =>
  createHmac('sha256', key)
    .update('Oddboro ' + name + ' socket')
    .digest();

export function serverProof(key, name) {
  return {
    ...tls,
    pskCallback: (_socket, identity) => (identity === name ? keyOf(key, name) : null)
  };
}

export function clientProof(key, name) {
  return {
    ...tls,
    // A certificate would be an unexpected peer on a pre-shared-key connection.
    checkServerIdentity: (_host, peer) =>
      Object.keys(peer).length
        ? new Error('Unexpected certificate on the local channel.')
        : undefined,
    pskCallback: () => ({ identity: name, psk: keyOf(key, name) })
  };
}
const addressFile = (home) => join(home, 'owner-channel.json');
const ownerConnection = Symbol.for('oddboro.owner.connection');

export async function serveOwner(home, key, port, handler, stop) {
  const windows = process.platform === 'win32';
  const folder = windows ? null : mkdtempSync(join(tmpdir(), 'ob-owner-'));
  const socketPath = windows ? '\\\\.\\pipe\\oddboro-' + randomUUID() : join(folder, 'owner.sock');
  const server = createServer(serverProof(key, 'owner'), (req, res) => {
    if (req.url === '/service/stop' && req.method === 'POST') {
      res.once('finish', stop);
      return res.end('{"stopped":true}');
    }
    if (!req.url?.startsWith('/api/') || req.url.startsWith('//')) {
      res.writeHead(404).end();
      return;
    }
    req[ownerConnection] = true;
    req.headers.host = '127.0.0.1:' + port;
    return handler(req, res, () => res.writeHead(404).end());
  });
  server.on('tlsClientError', () => {
    /* Rejected before the request handler. */
  });
  const clean = () => {
    rmSync(addressFile(home), { force: true });
    if (folder) rmSync(folder, { force: true, recursive: true });
  };
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, () => {
        server.off('error', reject);
        resolve();
      });
    });
    if (!windows) chmodSync(socketPath, 0o600);
    writeFileSync(addressFile(home), JSON.stringify({ socketPath }), { mode: 0o600 });
    process.once('exit', clean);
    server.once('close', () => {
      process.off('exit', clean);
      clean();
    });
    return server;
  } catch (error) {
    server.close();
    clean();
    throw error;
  }
}

export function ownerRequest(home, key, method, path, body, signal) {
  const { socketPath } = JSON.parse(readFileSync(addressFile(home), 'utf8'));
  return new Promise((resolve, reject) => {
    const req = request(
      {
        ...clientProof(key, 'owner'),
        socketPath,
        agent: false,
        method,
        path,
        signal,
        headers: { 'content-type': 'application/json', accept: 'application/json' }
      },
      resolve
    );
    req.once('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
