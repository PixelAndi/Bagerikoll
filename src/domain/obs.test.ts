import { describe, expect, it } from 'vitest';
import { nextWorkday, openObs, readyInFreezer } from './obs.ts';
import type { ObsRequest, Order } from './types.ts';

const req = (id: string, status: ObsRequest['status'], day = '2030-01-08', at = 1): ObsRequest => ({ id, productId: 'p', pallets: 1, boxes: 0, day, requestedAt: at, workerIds: ['w'], status });

describe('OBS', () => {
  it('asks for the next working day', () => {
    expect(nextWorkday('2030-01-07')).toBe('2030-01-08'); // Monday → Tuesday
    expect(nextWorkday('2030-01-11')).toBe('2030-01-14'); // Friday → Monday
    expect(nextWorkday('2030-01-12')).toBe('2030-01-14'); // Saturday → Monday
  });
  it('lists what the managers still have to act on, oldest first', () => {
    const list = [req('done', 'done'), req('b', 'requested', '2030-01-09'), req('a', 'notAllowed', '2030-01-08', 5), req('c', 'planned', '2030-01-08', 2), req('x', 'refused')];
    expect(openObs(list).map((o) => o.id)).toEqual(['c', 'a', 'b']);
  });
  it('a prepared order with nothing missing is ready in the freezer until loaded', () => {
    const o: Order = { id: 'o', customerId: 'k', day: '2030-01-07', createdAt: 0, lines: [], prepared: { at: 1, workerIds: [], missing: [] } };
    expect(readyInFreezer(o)).toBe(true);
    expect(readyInFreezer({ ...o, prepared: { at: 1, workerIds: [], missing: [{ productId: 'p', pallets: 1, boxes: 0 }] } })).toBe(false);
    expect(readyInFreezer({ ...o, shippedAt: 5 })).toBe(false);
  });
});
