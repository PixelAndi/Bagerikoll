import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { backup, exportAll, openStore, PAGE, sync } from './store.mjs';

// Made-up records only.
const fresh = () => openStore(':memory:');

describe('the server store', () => {
  it('adds new records, keeps the newer copy, and answers with what changed since', () => {
    const db = fresh();
    const a = sync(db, { since: 0, records: { workers: [{ id: 'w1', name: 'Anna Test', updatedAt: 5 }] } });
    expect(a).toMatchObject({ accepted: 1, more: false });
    expect(a.records.workers).toEqual([{ id: 'w1', name: 'Anna Test', updatedAt: 5 }]);
    // An older copy is ignored; a newer one wins.
    expect(sync(db, { since: a.seq, records: { workers: [{ id: 'w1', name: 'Gammal', updatedAt: 3 }] } }).accepted).toBe(0);
    const b = sync(db, { since: a.seq, records: { workers: [{ id: 'w1', name: 'Anna Ny', updatedAt: 9 }] } });
    expect(b.records.workers).toEqual([{ id: 'w1', name: 'Anna Ny', updatedAt: 9 }]);
    // A second device asking from the start gets the latest copy only.
    expect(sync(db, { since: 0 }).records.workers).toEqual([{ id: 'w1', name: 'Anna Ny', updatedAt: 9 }]);
  });
  it('ignores unknown tables and broken records', () => {
    const db = fresh();
    const r = sync(db, { records: { secrets: [{ id: 'x' }], orders: [null, { name: 'no id' }, { id: '' }, { id: 'o1', updatedAt: 1 }] } });
    expect(r.accepted).toBe(1);
    expect(Object.keys(r.records)).toEqual(['orders']);
  });
  it('pages a large answer', () => {
    const db = fresh();
    const many = Array.from({ length: PAGE + 5 }, (_, i) => ({ id: `e${i}`, updatedAt: 1 }));
    sync(db, { records: { entries: many } });
    const first = sync(db, { since: 0 });
    expect(first.more).toBe(true);
    expect(first.records.entries).toHaveLength(PAGE);
    const rest = sync(db, { since: first.seq });
    expect(rest.more).toBe(false);
    expect(rest.records.entries).toHaveLength(5);
  });
  it('exports a data file and keeps dated backups', () => {
    const db = fresh();
    sync(db, { records: { products: [{ id: 'p1', name: 'Testbröd', updatedAt: 1 }] } });
    expect(exportAll(db)).toMatchObject({ kind: 'bagerikoll-data', tables: { products: [{ id: 'p1' }] } });
    const dir = mkdtempSync(join(tmpdir(), 'bk-'));
    for (let d = 1; d <= 4; d++) backup(db, dir, 2, new Date(`2030-01-0${d}T03:00:00Z`));
    expect(readdirSync(dir).sort()).toEqual(['bagerikoll-2030-01-03.json', 'bagerikoll-2030-01-04.json']);
  });
});

describe('test data', async () => {
  const { removeDemo } = await import('./store.mjs');
  it('removes only test records, and keeps old ones from coming back', () => {
    const db = openStore(':memory:');
    sync(db, { records: { workers: [{ id: 'demo-w-1', name: 'Test', updatedAt: 100 }, { id: 'w-real', name: 'Riktig', updatedAt: 100 }] } });
    expect(removeDemo(db, 200)).toEqual({ removed: 1, demoRemovedAt: 200 });
    // An offline device sends its old copy: refused. New test data later: welcome.
    const a = sync(db, { records: { workers: [{ id: 'demo-w-1', name: 'Test', updatedAt: 150 }] } });
    expect(a.accepted).toBe(0);
    expect(a.demoRemovedAt).toBe(200);
    expect(sync(db, { records: { workers: [{ id: 'demo-w-2', name: 'Ny test', updatedAt: 300 }] } }).accepted).toBe(1);
    expect(exportAll(db).tables.workers.map((w) => w.id).sort()).toEqual(['demo-w-2', 'w-real']);
  });
});
