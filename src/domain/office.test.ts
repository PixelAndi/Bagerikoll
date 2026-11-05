import { describe, expect, it } from 'vitest';
import { isoWeek, mondayOf } from '../days.ts';
import { accountingSummary, duplicateNumbers, orderTotals, keepPlanned, lineAmount, planState, priceOn, summaryCsv } from './office.ts';
import type { Brand, Customer, Order, Product } from './types.ts';

// Made-up names and prices only.
const brands: Brand[] = [
  { id: 'b1', name: 'Bolag Ett', color: '#000' },
  { id: 'b2', name: 'Bolag Två', color: '#000' },
];
const customers: Customer[] = [
  { id: 'k1', name: 'Kund Ett', billedBy: 'b1' },
  { id: 'k2', name: 'Kund Två', billedBy: 'b2' },
  { id: 'k3', name: 'Kund Tre' },
];
const bread: Product = { id: 'p1', name: 'Testbröd', boxesPerPallet: 20, prices: [{ from: '2030-01-01', perBox: 50 }, { from: '2030-02-01', perBox: 60 }] };
const roll: Product = { id: 'p2', name: 'Testfralla', prices: [{ from: '2030-01-01', perPallet: 1200 }] };
const odd: Product = { id: 'p3', name: 'Utan pris' };
const order = (day: string, customerId: string, lines: Order['lines'], extra: Partial<Order> = {}): Order => ({ id: Math.random().toString(), customerId, day, lines, createdAt: 0, ...extra });

describe('weeks', () => {
  it('numbers ISO weeks', () => {
    expect(isoWeek('2026-11-09')).toEqual({ year: 2026, week: 46 });
    expect(isoWeek('2027-01-01')).toEqual({ year: 2026, week: 53 });
    expect(isoWeek('2026-01-01')).toEqual({ year: 2026, week: 1 });
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
  });
});

describe('planning', () => {
  it('is full when every line is ticked', () => {
    const o = order('2030-01-07', 'k1', [{ productId: 'p1', pallets: 2, boxes: 0, plannedAt: 1 }, { productId: 'p2', pallets: 1, boxes: 0 }]);
    expect(planState(o)).toEqual({ planned: 1, total: 2, full: false });
    o.lines[1].plannedAt = 2;
    expect(planState(o).full).toBe(true);
  });
  it('unticks a line whose amount was edited, keeps the others', () => {
    const before = [{ productId: 'p1', pallets: 2, boxes: 0, plannedAt: 1 }, { productId: 'p2', pallets: 1, boxes: 0, plannedAt: 1 }];
    const after = keepPlanned(before, [{ productId: 'p1', pallets: 3, boxes: 0 }, { productId: 'p2', pallets: 1, boxes: 0 }]);
    expect(after.map((l) => l.plannedAt)).toEqual([undefined, 1]);
  });
  it('finds order numbers used twice', () => {
    expect([...duplicateNumbers([order('d', 'k1', [], { orderNumber: '7' }), order('d', 'k2', [], { orderNumber: '7' }), order('d', 'k2', [], { orderNumber: '8' })])]).toEqual(['7']);
  });
});

describe('prices', () => {
  it('uses the price in force on the order day', () => {
    expect(priceOn(bread, '2030-01-31')?.perBox).toBe(50);
    expect(priceOn(bread, '2030-02-01')?.perBox).toBe(60);
    expect(priceOn(bread, '2029-12-31')).toBeUndefined();
  });
  it('prices pallets from the box price and boxes from the pallet price when needed', () => {
    expect(lineAmount({ pallets: 2, boxes: 3 }, bread, '2030-01-10')).toBe(2 * 20 * 50 + 3 * 50);
    expect(lineAmount({ pallets: 1, boxes: 0 }, roll, '2030-01-10')).toBe(1200);
    expect(lineAmount({ pallets: 0, boxes: 2 }, roll, '2030-01-10')).toBeUndefined(); // no box count per pallet
    expect(lineAmount({ pallets: 1, boxes: 0 }, odd, '2030-01-10')).toBeUndefined();
  });
});

describe('the weekly summary for accounting', () => {
  const orders = [
    order('2030-01-07', 'k1', [{ productId: 'p1', pallets: 1, boxes: 0 }]),
    order('2030-01-08', 'k1', [{ productId: 'p1', pallets: 0, boxes: 4 }]),
    order('2030-01-08', 'k2', [{ productId: 'p2', pallets: 2, boxes: 0 }]),
    order('2030-01-09', 'k3', [{ productId: 'p3', pallets: 1, boxes: 0 }]),
    order('2030-01-09', 'k2', [{ productId: 'p2', pallets: 5, boxes: 0 }], { cancelled: true }),
    order('2030-01-14', 'k1', [{ productId: 'p1', pallets: 9, boxes: 0 }]), // next week
  ];
  const s = accountingSummary(orders, [bread, roll, odd], customers, brands, '2030-01-07', '2030-01-13');
  it('splits by the company that bills each customer', () => {
    expect(s.map((b) => b.brand?.name)).toEqual(['Bolag Ett', 'Bolag Två', undefined]);
    expect(s[0].customers[0]).toMatchObject({ orders: 2, amount: 1000 + 200 });
    expect(s[0].customers[0].rows[0]).toMatchObject({ pallets: 1, boxes: 4, amount: 1200 });
    expect(s[1].amount).toBe(2400);
    expect(s[0]).toMatchObject({ pallets: 1, boxes: 4 });
    expect(orderTotals(orders)).toEqual({ pallets: 13, boxes: 4 });
  });
  it('says where a price is missing', () => {
    expect(s[2]).toMatchObject({ missingPrice: true, amount: 0 });
    expect(s[2].customers[0].rows[0].amount).toBeUndefined();
  });
  it('exports CSV with decimal commas', () => {
    const csv = summaryCsv(s, 'v. 2', 'Inget bolag').split('\r\n');
    expect(csv[1]).toBe('v. 2;Bolag Ett;Kund Ett;Testbröd;;1;4;1200,00');
    expect(csv[3]).toBe('v. 2;Inget bolag;Kund Tre;Utan pris;;1;0;');
  });
});
