import { describe, expect, it } from 'vitest';
import { extraInFreezer, halfCount, openHalves } from './halves.ts';
import type { HalfBox, Run } from './types.ts';

const half = (over: Partial<HalfBox>): HalfBox => ({ id: Math.random().toString(), productId: 'p1', quantity: 1, day: '2030-01-07', at: 1, station: 'S', workerIds: [], ...over });

describe('half boxes and extra boxes', () => {
  it('counts the half boxes still waiting for a product', () => {
    const list = [half({ quantity: 2, at: 5 }), half({ at: 3 }), half({ filled: { at: 9, runId: 'r', workerIds: [] } }), half({ voided: { at: 2, by: 'worker' } }), half({ productId: 'p2' })];
    expect(openHalves(list, 'p1').map((h) => h.at)).toEqual([3, 5]);
    expect(halfCount(openHalves(list, 'p1'))).toBe(3);
    expect(openHalves(list)).toHaveLength(3);
  });
  it('lists the runs whose extra boxes are still in the freezer', () => {
    const run = (over: Partial<Run>): Run => ({ id: Math.random().toString(), day: '2030-01-07', station: 'S', productId: 'p', startedAt: 1, tests: [], ...over });
    const list = [run({ surplusBoxes: 1 }), run({ surplusBoxes: 2, surplusTaken: { at: 1, workerIds: [] } }), run({}), run({ surplusBoxes: 3, startedAt: 9 })];
    expect(extraInFreezer(list).map((r) => r.surplusBoxes)).toEqual([3, 1]);
  });
});
