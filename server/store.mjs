// The server's store: every record of every table in one SQLite table, each with the time it last
// changed (`updatedAt`, set by the devices) and a running number (`seq`) so a device can ask for
// "everything since I last asked". Merging works as on the devices (src/domain/datafile.ts): a
// record the server doesn't have is added, a newer copy replaces an older one, nothing is deleted.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The tables the app syncs (the same as DATA_TABLES in src/db.ts). */
export const TABLES = ['workers', 'brands', 'customers', 'products', 'sessions', 'entries', 'orders', 'doughs', 'deviations', 'stockCounts', 'runs', 'obs', 'halfBoxes'];
/** The most records sent back in one answer; the device asks again for the rest. */
export const PAGE = 2000;

export function openStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS records (
      tbl TEXT NOT NULL,
      id TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (tbl, id)
    );
    CREATE INDEX IF NOT EXISTS records_seq ON records (seq);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  return db;
}

const currentSeq = (db) => Number(db.prepare(`SELECT value FROM meta WHERE key = 'seq'`).get()?.value ?? 0);
const metaNumber = (db, key) => Number(db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key)?.value ?? 0);
const setMeta = (db, key, value) => db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(key, String(value));

/** Test data (src/domain/demo.ts): every record's id starts with this. */
export const DEMO_PREFIX = 'demo-';

/**
 * Takes the test data off: deletes every test record and notes when, so each device deletes its
 * copies at its next sync (`demoRemovedAt` in the answer) and test records an offline device still
 * holds are not taken back in. Test data made after this is welcome again.
 */
export function removeDemo(db, now = Date.now()) {
  const removed = db.prepare(`DELETE FROM records WHERE substr(id, 1, ${DEMO_PREFIX.length}) = ?`).run(DEMO_PREFIX).changes;
  setMeta(db, 'demoRemovedAt', now);
  return { removed: Number(removed), demoRemovedAt: now };
}

/**
 * One sync: take what the device sends (records per table), keep the newer copies, and answer with
 * everything changed since `since` (at most PAGE records; `more` says if there is more to fetch).
 */
export function sync(db, { since = 0, records = {} } = {}) {
  const get = db.prepare(`SELECT updated_at FROM records WHERE tbl = ? AND id = ?`);
  const put = db.prepare(`INSERT INTO records (tbl, id, updated_at, seq, data) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (tbl, id) DO UPDATE SET updated_at = excluded.updated_at, seq = excluded.seq, data = excluded.data`);
  let seq = currentSeq(db);
  let accepted = 0;
  const demoRemovedAt = metaNumber(db, 'demoRemovedAt');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const tbl of TABLES) {
      const list = records[tbl];
      if (!Array.isArray(list)) continue;
      for (const r of list) {
        if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || r.id.length > 200) continue;
        const updated = Number.isFinite(r.updatedAt) ? Math.trunc(r.updatedAt) : 0;
        if (demoRemovedAt && updated <= demoRemovedAt && r.id.startsWith(DEMO_PREFIX)) continue;
        const have = get.get(tbl, r.id);
        if (have && updated <= have.updated_at) continue;
        seq += 1;
        put.run(tbl, r.id, updated, seq, JSON.stringify(r));
        accepted += 1;
      }
    }
    db.prepare(`INSERT INTO meta (key, value) VALUES ('seq', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(String(seq));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  const rows = db.prepare(`SELECT tbl, seq, data FROM records WHERE seq > ? ORDER BY seq LIMIT ?`).all(Number(since) || 0, PAGE + 1);
  const more = rows.length > PAGE;
  const page = more ? rows.slice(0, PAGE) : rows;
  const out = {};
  for (const row of page) (out[row.tbl] ??= []).push(JSON.parse(row.data));
  return { seq: page.length ? page[page.length - 1].seq : Math.max(Number(since) || 0, 0) || seq, records: out, more, accepted, demoRemovedAt: demoRemovedAt || undefined };
}

/** Everything as a data file (the app's format), to download or to keep as a backup. */
export function exportAll(db) {
  const tables = Object.fromEntries(TABLES.map((t) => [t, []]));
  for (const row of db.prepare(`SELECT tbl, data FROM records ORDER BY tbl, id`).all()) if (tables[row.tbl]) tables[row.tbl].push(JSON.parse(row.data));
  return { kind: 'bagerikoll-data', version: 1, savedAt: Date.now(), from: 'server', tables };
}

/** A dated backup file in `dir`, keeping the latest `keep` (one per day). */
export function backup(db, dir, keep = 30, now = new Date()) {
  mkdirSync(dir, { recursive: true });
  const day = now.toISOString().slice(0, 10);
  writeFileSync(join(dir, `bagerikoll-${day}.json`), JSON.stringify(exportAll(db)));
  const files = readdirSync(dir).filter((f) => /^bagerikoll-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - keep))) rmSync(join(dir, f));
  return day;
}
