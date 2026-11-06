import { describe, expect, it } from 'vitest';
import { batchRange, canPack, runCount, runGaps, runSigners, testGaps, testState, TEST_EVERY_MS } from './runs.ts';
import type { DetectorTest, Entry, Run } from './types.ts';

// Made-up names and numbers only.
const H = 3600_000;
const pass = (at: number, who = 'w1'): DetectorTest => ({ at, workerIds: [who], ferro: true, nonFerro: true, stainless: true });
const run = (extra: Partial<Run> = {}): Run => ({ id: 'r', day: '2030-01-07', station: 'Pack 1', productId: 'p', startedAt: 0, tests: [], ...extra });
const entry = (kind: 'pallet' | 'box', quantity: number, extra: Partial<Entry> = {}): Entry => ({
  id: Math.random().toString(),
  at: 1,
  day: '2030-01-07',
  kind,
  quantity,
  productId: 'p',
  sessionId: 's',
  workerIds: ['w2'],
  station: 'Pack 1',
  runId: 'r',
  ...extra,
});

describe('metal detector tests', () => {
  it('are needed before anything is packed', () => {
    expect(testState(run(), 0).kind).toBe('needed');
    expect(canPack(run(), 0)).toBe(false);
  });
  it('let packing go on for two hours, warning near the end', () => {
    const r = run({ tests: [pass(0)] });
    expect(canPack(r, H)).toBe(true);
    expect(testState(r, 2 * H - 10 * 60_000)).toMatchObject({ kind: 'ok', soon: true });
    expect(testState(r, TEST_EVERY_MS).kind).toBe('overdue');
    expect(canPack(r, TEST_EVERY_MS)).toBe(false);
  });
  it('stop packing when a test piece is not found, until a test passes', () => {
    const failed = { ...pass(H), stainless: false };
    expect(testState(run({ tests: [pass(0), failed] }), H).kind).toBe('failed');
    expect(canPack(run({ tests: [pass(0), failed, pass(H + 1)] }), H + 2)).toBe(true);
  });
  it('a finished run takes no more packing', () => {
    expect(canPack(run({ tests: [pass(0)], endedAt: 10 }), 20)).toBe(false);
  });
  it('flags packing done while the test was overdue, not a test that was merely late', () => {
    const late = run({ tests: [pass(0), pass(2 * H + 60_000)], endedAt: 3 * H });
    expect(testGaps(late, [entry('pallet', 1, { at: H }), entry('pallet', 1, { at: 2.5 * H })], 0)).toEqual([]);
    expect(testGaps(run({ tests: [pass(0)], endedAt: 3 * H }), [entry('pallet', 1, { at: 2.5 * H })], 0)).toEqual([2 * H]);
    expect(testGaps(run({ tests: [pass(10)], endedAt: H }), [entry('pallet', 1, { at: 5 })], 0)).toEqual([0]);
  });
});

describe('the protocol row', () => {
  it('numbers the boxes from 01, the pallets counted in', () => {
    const entries = [entry('pallet', 1), entry('pallet', 1), entry('pallet', 1), entry('box', 6), entry('pallet', 1, { voided: { at: 2, by: 'worker', reason: 'x' } }), entry('pallet', 1, { runId: 'other' })];
    const c = runCount(run(), entries, { id: 'p', name: 'Testbröd', boxesPerPallet: 20 });
    expect(c).toEqual({ pallets: 3, boxes: 6, totalBoxes: 66 });
    expect(batchRange(c.totalBoxes)).toBe('01–66');
    expect(batchRange(5)).toBe('01–05');
    expect(batchRange(0)).toBe('–');
  });
  it("uses the run's own boxes per pallet (from the order) over the product's", () => {
    expect(runCount(run({ boxesPerPallet: 30 }), [entry('pallet', 2), entry('box', 3)], { id: 'p', name: 'Testbröd', boxesPerPallet: 20 }).totalBoxes).toBe(63);
  });
    it("can't number the boxes without the pallet size", () => {
    expect(runCount(run(), [entry('pallet', 2)], { id: 'p', name: 'Testbröd' }).totalBoxes).toBeUndefined();
  });
  it('is signed by those who packed and those who ticked the checks', () => {
    const r = run({ tests: [pass(0, 'w1')], labels: { at: 5, workerIds: ['w3'] } });
    expect(runSigners(r, [entry('pallet', 1)]).sort()).toEqual(['w1', 'w2', 'w3']);
  });
  it('says what a finished row lacks', () => {
    expect(runGaps(run({ endedAt: 5, tests: [pass(0)] }))).toEqual(['labels', 'cleaned']);
    expect(runGaps(run({ tests: [] }))).toEqual([]);
  });
});

describe('runs for an order: extra boxes and set pallets', async () => {
  const { runCount, runTarget } = await import('./runs.ts');
  const base = { id: 'r', day: '2030-01-07', station: 'S', productId: 'p', startedAt: 0, tests: [] };
  const e = (kind: 'pallet' | 'box', quantity: number, boxesOnPallet?: number) => ({ id: Math.random().toString(), at: 1, day: '2030-01-07', kind, quantity, productId: 'p', sessionId: 's', workerIds: [], station: 'S', runId: 'r', boxesOnPallet });
  it('notes boxes beyond the order as extra (2 pallets of 36 = 72; 73 packed = 1 extra)', () => {
    const run = { ...base, boxesPerPallet: 36, targetBoxes: 72 };
    const c = runCount(run, [e('pallet', 1), e('pallet', 1), e('box', 1)]);
    expect(c.totalBoxes).toBe(73);
    expect(runTarget(run, c)).toEqual({ kind: 'boxes', target: 72, left: 0, extra: 1 });
    expect(runTarget(run, runCount(run, [e('pallet', 1)]))).toMatchObject({ left: 36, extra: 0 });
  });
  it('spread on a set number of pallets: boxes counted per pallet, no extra', () => {
    const run = { ...base, boxesPerPallet: 36, spreadPallets: 2 };
    const c = runCount(run, [e('pallet', 1, 40), e('pallet', 1, 39)]);
    expect(c).toEqual({ pallets: 2, boxes: 0, totalBoxes: 79 });
    expect(runTarget(run, c)).toEqual({ kind: 'spread', pallets: 2, left: 0 });
  });
  it('a run without an order has no target', () => {
    expect(runTarget(base, runCount(base, [e('box', 3)]))).toBeUndefined();
  });
});
