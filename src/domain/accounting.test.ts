import { describe, expect, it } from 'vitest';
import { accountingRows, deliveredDiffers, deliveredLines, deliveredOrders, profitBy, profitOf, weekStatus } from './accounting.ts';
import { lineCalc } from './office.ts';
import type { Order, Product } from './types.ts';

// Made-up names and prices only.
const bun: Product = { id: 'p', name: 'Testbulle', boxesPerPallet: 20, prices: [{ from: '2030-01-01', perBox: 10 }] };
const loaf: Product = { id: 'q', name: 'Testlimpa', boxesPerPallet: 25, prices: [{ from: '2030-01-01', perPallet: 1000 }] };
const order = (id: string, day: string, extra: Partial<Order> = {}): Order => ({ id, customerId: 'k', day, createdAt: 0, lines: [{ productId: 'p', pallets: 3, boxes: 0 }], ...extra });

describe('the calculation', () => {
  it("prices a pallet from the box price with the order's boxes per pallet", () => {
    expect(lineCalc({ pallets: 2, boxes: 0, boxesPerPallet: 30 }, bun, '2030-01-05')).toMatchObject({ palletPrice: 300, palletFrom: 'box', amount: 600 });
    expect(lineCalc({ pallets: 2, boxes: 0 }, bun, '2030-01-05').amount).toBe(400);
  });
  it('prices boxes from the pallet price and says what is missing', () => {
    expect(lineCalc({ pallets: 1, boxes: 5 }, loaf, '2030-01-05')).toMatchObject({ boxPrice: 40, boxFrom: 'pallet', amount: 1200 });
    expect(lineCalc({ pallets: 1, boxes: 0 }, { id: 'x', name: 'Utan' }, '2030-01-05').missing).toBe('price');
    expect(lineCalc({ pallets: 0, boxes: 2 }, { ...loaf, boxesPerPallet: undefined }, '2030-01-05').missing).toBe('boxesPerPallet');
  });
});

describe('delivered', () => {
  it('bills what the dock reported, keeping the order’s boxes per pallet', () => {
    const o = order('a', '2030-01-07', { lines: [{ productId: 'p', pallets: 3, boxes: 0, boxesPerPallet: 30 }], delivered: [{ productId: 'p', pallets: 2, boxes: 4 }], shippedAt: 1 });
    expect(deliveredLines(o)).toEqual([{ productId: 'p', pallets: 2, boxes: 4, boxesPerPallet: 30 }]);
    expect(deliveredDiffers(o)).toBe(true);
    expect(deliveredDiffers({ ...o, delivered: [{ productId: 'p', pallets: 3, boxes: 0 }] })).toBe(false);
  });
  it('a week is complete when every order in it is loaded', () => {
    const orders = [order('a', '2030-01-07', { shippedAt: 1 }), order('b', '2030-01-08'), order('c', '2030-01-09', { cancelled: true }), order('d', '2030-01-15')];
    const w = weekStatus(orders, '2030-01-07', '2030-01-13');
    expect([w.orders.length, w.delivered.length, w.open.map((o) => o.id), w.complete]).toEqual([2, 1, ['b'], false]);
    expect(weekStatus([orders[0]], '2030-01-07', '2030-01-13').complete).toBe(true);
    expect(weekStatus([], '2030-01-07', '2030-01-13').complete).toBe(false);
    expect(deliveredOrders(orders).map((o) => o.id)).toEqual(['a']);
  });
  it('lists the rows in calendar order', () => {
    const orders = [
      order('b', '2030-01-08', { orderNumber: '2', shippedAt: 1 }),
      order('a', '2030-01-07', { orderNumber: '9', shippedAt: 1, lines: [{ productId: 'p', pallets: 1, boxes: 0 }, { productId: 'q', pallets: 2, boxes: 0 }] }),
      order('c', '2030-01-07', { orderNumber: '3', shippedAt: 1 }),
    ];
    const rows = accountingRows(orders, [bun, loaf], [], '2030-01-07', '2030-01-13');
    expect(rows.map((r) => `${r.day} ${r.order.orderNumber} ${r.line.productId} ${r.calc.amount}`)).toEqual(['2030-01-07 3 p 600', '2030-01-07 9 p 200', '2030-01-07 9 q 2000', '2030-01-08 2 p 600']);
  });
});

describe('profit', () => {
  const withCost: Product[] = [
    { ...bun, costs: [{ from: '2030-01-01', perBox: 6 }] },
    { ...loaf, costs: [{ from: '2030-01-01', perPallet: 700 }, { from: '2030-01-08', perPallet: 800 }] },
  ];
  const orders = [
    order('a', '2030-01-07', { shippedAt: 1, customerId: 'k1', lines: [{ productId: 'p', pallets: 2, boxes: 0 }, { productId: 'q', pallets: 1, boxes: 0 }] }),
    order('b', '2030-01-08', { shippedAt: 1, customerId: 'k2', lines: [{ productId: 'q', pallets: 2, boxes: 0 }] }),
  ];
  const rows = accountingRows(orders, withCost, [], '2030-01-07', '2030-01-13');
  it('is revenue less what it cost to make, with the cost in force on the day', () => {
    // revenue: 2 × 20 × 10 + 1000 + 2 × 1000 = 3400; cost: 2 × 20 × 6 + 700 + 2 × 800 = 2540
    expect(profitOf(rows)).toMatchObject({ revenue: 3400, cost: 2540, profit: 860, pallets: 5, incomplete: 0 });
    expect(profitOf(rows).margin).toBeCloseTo(860 / 3400, 6);
  });
  it('splits by customer, the most profitable first, and leaves out rows without a cost', () => {
    expect(profitBy(rows, (r) => r.order.customerId).map((g) => [g.key, g.profit.profit])).toEqual([['k1', 460], ['k2', 400]]);
    const partial = accountingRows(orders, [withCost[0], loaf], [], '2030-01-07', '2030-01-13');
    expect(profitOf(partial)).toMatchObject({ revenue: 400, incomplete: 2 });
  });
});
