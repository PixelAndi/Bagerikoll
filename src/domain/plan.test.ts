import { describe, expect, it } from 'vitest';
import { mergeRecords, asDataFile } from './datafile.ts';
import { asPallets, availableFor, chanceEnough, normalCdf, planRow, shortDays, startOf, stockAt, yieldDays, yieldStats, type PlanInput } from './plan.ts';
import type { Deviation, DoughCount, Entry, Order, Product, StockCount } from './types.ts';

// Made-up products and numbers only.
const roll: Product = { id: 'roll', name: 'Testfralla', brandId: 'b', boxesPerPallet: 40 };
const big: Product = { id: 'big', name: 'Halvbakad testfralla', brandId: 'b', palletsPerDough: 2 };

const at = (day: string, hour = 10) => startOf(day) + hour * 3600_000;
let n = 0;
const entry = (day: string, productId: string, kind: 'pallet' | 'box', quantity: number, extra: Partial<Entry> = {}): Entry => ({
  id: `e${n++}`,
  at: at(day),
  day,
  kind,
  quantity,
  productId,
  sessionId: 's',
  workerIds: ['w'],
  station: 'Pack 1',
  ...extra,
});
const dough = (day: string, productId: string, doughs: number): DoughCount => ({ id: `${day}|${productId}`, day, productId, doughs });
const order = (day: string, lines: Order['lines'], extra: Partial<Order> = {}): Order => ({ id: `o${n++}`, customerId: 'c', day, lines, createdAt: 0, ...extra });

describe('stock', () => {
  it('is the last count plus what was packed since, less what was sent since', () => {
    const counts: StockCount[] = [{ id: 'k', at: at('2030-01-07', 6), productId: 'roll', pallets: 3, boxes: 5 }];
    const entries = [
      entry('2030-01-06', 'roll', 'pallet', 9), // before the count: already in it
      entry('2030-01-07', 'roll', 'pallet', 2),
      entry('2030-01-07', 'roll', 'box', 4),
      entry('2030-01-07', 'roll', 'pallet', 1, { voided: { at: 0, by: 'worker', reason: 'x' } }),
    ];
    const orders = [
      order('2030-01-07', [{ productId: 'roll', pallets: 4, boxes: 0 }], { shippedAt: at('2030-01-07', 14) }),
      order('2030-01-08', [{ productId: 'roll', pallets: 1, boxes: 0 }]), // not sent yet
    ];
    expect(stockAt('roll', at('2030-01-08'), entries, orders, counts)).toEqual({ pallets: 1, boxes: 9, countedAt: counts[0].at });
  });

  it('works back from a count made later (a count this morning gives the stock at midnight)', () => {
    const counts: StockCount[] = [{ id: 'k', at: at('2030-01-07', 9), productId: 'roll', pallets: 4, boxes: 0 }];
    const entries = [entry('2030-01-07', 'roll', 'pallet', 1, { at: at('2030-01-07', 7) })];
    const orders = [order('2030-01-06', [{ productId: 'roll', pallets: 2, boxes: 0 }], { shippedAt: at('2030-01-07', 8) })];
    // At midnight: 4 counted − 1 packed since + 2 sent since.
    expect(stockAt('roll', startOf('2030-01-07'), entries, orders, counts)).toMatchObject({ pallets: 5, boxes: 0 });
  });

  it('counts boxes as part of a pallet when the pallet size is known', () => {
    expect(asPallets(roll, 2, 20)).toBe(2.5);
    expect(asPallets(big, 2, 20)).toBe(2);
  });
});

describe('the usual yield', () => {
  const doughs = ['2030-01-07', '2030-01-08', '2030-01-09', '2030-01-10', '2030-01-11', '2030-01-14'].map((d) => dough(d, 'roll', 10));
  const entries = [
    entry('2030-01-07', 'roll', 'pallet', 10),
    entry('2030-01-08', 'roll', 'pallet', 11),
    entry('2030-01-09', 'roll', 'pallet', 9),
    entry('2030-01-10', 'roll', 'pallet', 10),
    entry('2030-01-11', 'roll', 'pallet', 6), // low yield, reported
    entry('2030-01-14', 'roll', 'pallet', 8), // two doughs scrapped
  ];
  const deviations: Deviation[] = [
    { id: 'd1', day: '2030-01-11', productId: 'roll', kind: 'lowYield', note: '', at: 0 },
    { id: 'd2', day: '2030-01-14', productId: 'roll', kind: 'scrapped', doughs: 2, remadeOn: '2030-01-15', note: '', at: 0 },
  ];

  it('leaves scrapped doughs out, and days with a deviation out of the average', () => {
    const { days } = yieldDays(roll, '2030-01-15', doughs, deviations, entries);
    expect(days.find((d) => d.day === '2030-01-14')?.perDough).toBe(1); // 8 pallets from 8 good doughs
    const stats = yieldStats(roll, days);
    expect(stats.days).toBe(5);
    expect(stats.deviationDays).toBe(1);
    expect(stats.mean).toBeCloseTo(1, 5);
    expect(stats.trusted).toBe(true);
  });

  it('lists days with doughs but nothing packed (the station data not read in)', () => {
    const { noPacking } = yieldDays(roll, '2030-01-20', [...doughs, dough('2030-01-15', 'roll', 9)], deviations, entries);
    expect(noPacking).toEqual(['2030-01-15']);
  });

  it('goes by the expected yield until there is enough history', () => {
    const stats = yieldStats(big, []);
    expect(stats).toMatchObject({ mean: 2, trusted: false, days: 0 });
  });

  it('flags a finished day that gave clearly less than usual (a pallet may be missing)', () => {
    const input: PlanInput = { products: [roll], entries: [...entries, entry('2030-01-15', 'roll', 'pallet', 7)], orders: [], counts: [], doughs: [...doughs, dough('2030-01-15', 'roll', 10)], deviations, today: '2030-01-16' };
    const short = shortDays([roll], '2030-01-01', input);
    expect(short.map((s) => s.day)).toEqual(['2030-01-15']);
  });
});

describe('chance of enough', () => {
  it('is a normal distribution', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
  it('rises with each dough', () => {
    const stats = { mean: 1, sd: 0.1, days: 10, deviationDays: 0, trusted: true };
    expect(chanceEnough(10, 10, stats)).toBeCloseTo(0.5, 5);
    expect(chanceEnough(11, 10, stats)).toBeGreaterThan(0.75);
    expect(chanceEnough(0, 0, stats)).toBe(1);
  });
});

describe('the plan for a day', () => {
  const base: PlanInput = { products: [roll, big], entries: [], orders: [], counts: [], doughs: [], deviations: [], today: '2030-01-07' };

  it('rounds the doughs up and says how likely they are to be enough', () => {
    const input = { ...base, orders: [order('2030-01-07', [{ productId: 'big', pallets: 7, boxes: 0 }])] };
    const row = planRow(big, '2030-01-07', input);
    expect(row.toMake).toBe(7);
    expect(row.doughs).toBe(4); // 7 / 2 = 3.5 → 4
    expect(row.chance).toBeGreaterThan(0.5);
    expect(row.oneMore.chance).toBeGreaterThan(row.chance);
  });

  it('takes stock off, after the open orders of earlier days', () => {
    const input: PlanInput = {
      ...base,
      counts: [{ id: 'k', at: at('2030-01-06'), productId: 'roll', pallets: 5, boxes: 0 }],
      orders: [order('2030-01-06', [{ productId: 'roll', pallets: 2, boxes: 0 }]), order('2030-01-07', [{ productId: 'roll', pallets: 6, boxes: 20 }])],
    };
    expect(availableFor(roll, '2030-01-07', input)).toBe(3);
    const row = planRow(roll, '2030-01-07', input);
    expect(row.orderedPallets).toBe(6.5);
    expect(row.toMake).toBe(3.5);
    expect(row.doughs).toBe(4);
  });

  it('carries what is over into later days, but not a shortfall', () => {
    const input: PlanInput = {
      ...base,
      counts: [{ id: 'k', at: at('2030-01-06'), productId: 'roll', pallets: 5, boxes: 0 }],
      orders: [order('2030-01-07', [{ productId: 'roll', pallets: 2, boxes: 0 }]), order('2030-01-08', [{ productId: 'roll', pallets: 9, boxes: 0 }])],
    };
    expect(availableFor(roll, '2030-01-08', input)).toBe(3);
    expect(availableFor(roll, '2030-01-09', input)).toBe(0);
  });

  it('names scrapped doughs to be made again on the day', () => {
    const input = { ...base, deviations: [{ id: 'd', day: '2030-01-06', productId: 'roll', kind: 'scrapped', doughs: 2, remadeOn: '2030-01-07', note: '', at: 0 } as Deviation] };
    expect(planRow(roll, '2030-01-07', input).remakes).toEqual([{ from: '2030-01-06', doughs: 2 }]);
  });
});

describe('data files', () => {
  it('adds new records and takes the newer copy of one both have', () => {
    const mine = [
      { id: 'a', name: 'x', updatedAt: 5 },
      { id: 'b', name: 'y', updatedAt: 9 },
    ];
    const theirs = [
      { id: 'a', name: 'x2', updatedAt: 7 },
      { id: 'b', name: 'old', updatedAt: 3 },
      { id: 'c', name: 'z', updatedAt: 1 },
    ];
    const r = mergeRecords(mine, theirs);
    expect(r.write.map((x) => x.id)).toEqual(['a', 'c']);
    expect(r).toMatchObject({ added: 1, updated: 1 });
  });

  it('refuses a file that is not a data file', () => {
    expect(asDataFile({ hello: 1 })).toBeNull();
    expect(asDataFile({ kind: 'bagerikoll-data', version: 1, tables: { entries: 'no' } })).toBeNull();
    expect(asDataFile({ kind: 'bagerikoll-data', version: 1, savedAt: 0, from: 'x', tables: { entries: [] } })).not.toBeNull();
  });
});
