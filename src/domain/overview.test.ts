import { describe, expect, it } from 'vitest';
import { dockNow, packedDays, packingNow, QUIET_MS, STALE_MS } from './overview.ts';
import { runThrowers } from './runs.ts';
import type { Entry, Order, Run, Session } from './types.ts';

const NOW = Date.UTC(2026, 10, 6, 10, 0);
const min = 60_000;
const entry = (over: Partial<Entry>): Entry => ({ id: Math.random().toString(36), at: NOW - 5 * min, day: '2026-11-06', kind: 'pallet', quantity: 1, productId: 'p1', sessionId: 's1', workerIds: ['w1'], station: 'Packning 1', ...over });
const run = (over: Partial<Run>): Run => ({ id: 'r1', day: '2026-11-06', station: 'Packning 1', productId: 'p1', startedAt: NOW - 60 * min, tests: [], ...over });
const session = (over: Partial<Session>): Session => ({ id: 's1', workerIds: ['w1'], startedAt: NOW - 90 * min, station: 'Packning 1', ...over });

describe('packingNow', () => {
  it('shows the open session, its run and what it has packed', () => {
    const s = session({ throwerIds: ['w2'] });
    const r = run({});
    const es = [entry({ runId: 'r1' }), entry({ kind: 'box', quantity: 5, runId: 'r1', at: NOW - 2 * min }), entry({ voided: { at: NOW, by: 'worker', reason: 'x' } })];
    const [now] = packingNow([s], [r], es, NOW);
    expect(now.station).toBe('Packning 1');
    expect(now.session?.throwerIds).toEqual(['w2']);
    expect(now.run?.id).toBe('r1');
    expect(now.count).toEqual({ pallets: 1, boxes: 5 });
    expect(now.last?.at).toBe(NOW - 2 * min);
    expect(now.quiet).toBe(false);
  });

  it('leaves out ended and forgotten sessions, and marks a quiet station', () => {
    const ended = session({ id: 'a', endedAt: NOW - min });
    const forgotten = session({ id: 'b', station: 'Packning 2', startedAt: NOW - STALE_MS - min });
    const quiet = session({ id: 'c', station: 'Packning 3', startedAt: NOW - QUIET_MS - min });
    const list = packingNow([ended, forgotten, quiet], [], [], NOW);
    expect(list.map((x) => x.station)).toEqual(['Packning 3']);
    expect(list[0].quiet).toBe(true);
  });

  it('keeps a long session going while it still registers', () => {
    const long = session({ startedAt: NOW - STALE_MS - 60 * min });
    expect(packingNow([long], [], [entry({ at: NOW - min })], NOW)).toHaveLength(1);
  });

  it('leaves the freezer out', () => {
    expect(packingNow([session({ kind: 'dock' })], [], [], NOW)).toEqual([]);
  });
});

describe('dockNow', () => {
  it('shows who is loading which delivery', () => {
    const o = { id: 'o1', customerId: 'c1', day: '2026-11-06', lines: [] } as unknown as Order;
    const [d] = dockNow([session({ kind: 'dock', station: 'Frys', driverId: 'w3', loadingOrderId: 'o1' })], [o], NOW);
    expect(d.station).toBe('Frys');
    expect(d.loading?.id).toBe('o1');
  });
});

describe('packedDays and runThrowers', () => {
  it('sums each day and names everyone, upstairs included', () => {
    const es = [entry({ throwerIds: ['w9'], runId: 'r1' }), entry({ day: '2026-11-05', workerIds: ['w2'] })];
    const days = packedDays(es, [run({})]);
    expect(days.map((d) => d.day)).toEqual(['2026-11-06', '2026-11-05']);
    expect(days[0]).toMatchObject({ count: { pallets: 1, boxes: 0 }, runs: 1, workerIds: ['w1', 'w9'] });
    expect(runThrowers(run({}), es)).toEqual(['w9']);
  });
});
