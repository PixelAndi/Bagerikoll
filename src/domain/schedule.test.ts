import { describe, expect, it } from 'vitest';
import { daySchedule } from './schedule.ts';
import type { Order, Product } from './types.ts';

const P = (id: string, name: string): Product => ({ id, name });
const products = [P('a', 'Fralla'), P('b', 'Bulle'), P('c', 'Limpa')];
const order = (over: Partial<Order>): Order => ({ id: Math.random().toString(), customerId: 'k', day: '2030-01-07', lines: [], createdAt: 1, ...over });
const line = (productId: string, pallets: number, boxes = 0, planned = true) => ({ productId, pallets, boxes, plannedAt: planned ? 1 : undefined });

describe('daySchedule', () => {
  it('sums the planned lines per product for the day, in product order', () => {
    const orders = [
      order({ lines: [line('a', 2), line('b', 1)] }),
      order({ lines: [line('a', 3), line('c', 1, 4)] }),
      order({ day: '2030-01-08', lines: [line('a', 9)] }), // another day: left out
    ];
    const s = daySchedule(orders, products, '2030-01-07');
    expect(s.map((x) => x.product.id)).toEqual(['b', 'a', 'c']); // sortProducts orders by name: Bulle, Fralla, Limpa
    expect(s.find((x) => x.product.id === 'a')).toMatchObject({ pallets: 5, boxes: 0, orders: 2 });
    expect(s.find((x) => x.product.id === 'c')).toMatchObject({ pallets: 1, boxes: 4, orders: 1 });
  });
  it('leaves out lines that were not planned, and cancelled orders', () => {
    const orders = [order({ lines: [line('a', 2, 0, false)] }), order({ cancelled: true, lines: [line('b', 1)] })];
    expect(daySchedule(orders, products, '2030-01-07')).toEqual([]);
  });
});
