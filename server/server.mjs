// Bagerikoll's server: serves the app itself and the sync, and keeps a daily backup file.
// Runs in a container (server/Dockerfile) as the TrueNAS `apps` user; its data lives in DATA_DIR
// (the encrypted dataset). It is never exposed directly: only the Cloudflare tunnel reaches it,
// with Cloudflare Access (login) in front.

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { backup, exportAll, openStore, sync } from './store.mjs';

const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? '/data';
const PUBLIC_DIR = process.env.PUBLIC_DIR ?? '/app/public';
const MAX_BODY = 25 * 1024 * 1024;

const db = openStore(join(DATA_DIR, 'bagerikoll.sqlite'));
const backups = join(DATA_DIR, 'backups');

// A backup at start and then every day.
const daily = () => {
  try {
    console.log(`backup ${backup(db, backups)}`);
  } catch (e) {
    console.error('backup failed', e);
  }
};
daily();
setInterval(daily, 24 * 60 * 60 * 1000).unref();

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveFile(req, res) {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = normalize(join(PUBLIC_DIR, path === '/' ? 'index.html' : path));
  if (!file.startsWith(normalize(PUBLIC_DIR) + sep) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'Not found', 'text/plain');
  // Hashed build files never change; the page, the service worker and the manifest are always fetched fresh.
  const fresh = /index\.html$|sw\.js$|\.webmanifest$/.test(file);
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': fresh ? 'no-cache' : 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  createReadStream(file).pipe(res);
}

createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/api/health') return send(res, 200, { ok: true, app: 'bagerikoll' });
    if (path === '/api/sync' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const result = sync(db, body);
      if (result.accepted) console.log(`sync ${body.device ?? '?'}: ${result.accepted} in`);
      return send(res, 200, result);
    }
    if (path === '/api/export' && req.method === 'GET') {
      res.setHeader('Content-Disposition', `attachment; filename="bagerikoll-server-${new Date().toISOString().slice(0, 10)}.json"`);
      return send(res, 200, exportAll(db));
    }
    if (path.startsWith('/api/')) return send(res, 404, { error: 'not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method' });
    return serveFile(req, res);
  } catch (e) {
    console.error(e);
    return send(res, 400, { error: String(e.message ?? e) });
  }
}).listen(PORT, () => console.log(`bagerikoll listening on ${PORT}, data in ${DATA_DIR}`));

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => (db.close(), process.exit(0)));
