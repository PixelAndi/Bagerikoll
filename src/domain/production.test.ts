import { describe, expect, it } from 'vitest';
import { byBrand, byProduct, canWorkerUndo, sortProducts, toCsv, total, UNDO_MS } from './production.ts';
import { checkPin, hashPin } from './pin.ts';
import type { Brand, Entry, Product } from './types.ts';

const brands: Brand[] = [
  { id: 'a', name: 'Märke A', color: '#123' },
  { id: 'b', name: 'Märke B', color: '#456' },
];
const products: Product[] = [
  { id: 'p1', name: 'Limpa', brandId: 'a' },
  { id: 'p2', name: 'Bulle', brandId: 'a' },
  { id: 'p3', name: 'Bröd', brandId: 'b' },
  { id: 'p4', name: 'Gammal', brandId: 'b', hidden: true },
];
const entry = (id: string, productId: string, kind: 'pallet' | 'box', quantity: number, extra: Partial<Entry> = {}): Entry => ({
  id,
  at: 1000,
  day: '2030-01-07',
  kind,
  quantity,
  productId,
  sessionId: 's',
  workerIds: ['w1', 'w2'],
  station: 'Pack 1',
  ...extra,
});

describe('production totals', () => {
  const entries = [
    entry('1', 'p1', 'pallet', 2),
    entry('2', 'p1', 'box', 5),
    entry('3', 'p3', 'pallet', 1),
    entry('4', 'p3', 'box', 9, { voided: { at: 2000, by: 'worker', reason: 'fel' } }),
  ];
  it('leaves voided entries out', () => {
    expect(total(entries)).toEqual({ pallets: 3, boxes: 5 });
  });
  it('counts per product and per brand', () => {
    expect(byProduct(entries).get('p3')).toEqual({ pallets: 1, boxes: 0 });
    expect(byBrand(entries, products).get('a')).toEqual({ pallets: 2, boxes: 5 });
    expect(byBrand(entries, products).get('b')).toEqual({ pallets: 1, boxes: 0 });
  });
  it('sorts products by brand then name, hides hidden ones, filters by brand', () => {
    expect(sortProducts(products, brands).map((p) => p.id)).toEqual(['p2', 'p1', 'p3']);
    expect(sortProducts(products, brands, 'b').map((p) => p.id)).toEqual(['p3']);
  });
  it('lets workers undo only recent entries', () => {
    expect(canWorkerUndo(entry('x', 'p1', 'box', 1, { at: 0 }), UNDO_MS)).toBe(true);
    expect(canWorkerUndo(entry('x', 'p1', 'box', 1, { at: 0 }), UNDO_MS + 1)).toBe(false);
  });
  it('writes every entry to CSV with its packers, voided ones marked', () => {
    const csv = toCsv(entries, products, brands, [
      { id: 'w1', name: 'Anna' },
      { id: 'w2', name: 'Team Natt' },
    ]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(5);
    expect(lines[1]).toContain('Märke A;Limpa;;Pall;2;Anna, Team Natt;Pack 1;;');
    expect(lines[4]).toContain(';fel');
  });
});

describe('admin PIN', () => {
  it('accepts the default PIN and nothing else', async () => {
    expect(await checkPin('9922', undefined)).toBe(true);
    expect(await checkPin('1234', undefined)).toBe(false);
  });
  it('uses a changed PIN instead', async () => {
    const h = await hashPin('5678');
    expect(await checkPin('5678', h)).toBe(true);
    expect(await checkPin('9922', h)).toBe(false);
  });
});
