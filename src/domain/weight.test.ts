import { describe, expect, it } from 'vitest';
import { boxGoodsKg, linesWeight, ordersWeight, PALLET_TARE_KG } from './weight.ts';
import type { OrderLine, Product } from './types.ts';

const P = (id: string, over: Partial<Product>): Product => ({ id, name: id, ...over });
const products = [
  P('ost', { gramsPerBread: 70, breadsPerBox: 70, boxesPerPallet: 20 }), // 4.9 kg/box
  P('kal', { gramsPerBread: 60, breadsPerBox: 90, boxesPerPallet: 20 }), // 5.4 kg/box
  P('nope', { boxesPerPallet: 20 }), // no weight
];
const prod = (id: string) => products.find((p) => p.id === id);
const line = (productId: string, pallets: number, boxes = 0, boxesPerPallet?: number): OrderLine => ({ productId, pallets, boxes, boxesPerPallet });

describe('shipping weight', () => {
  it('a box is grams × breads', () => {
    expect(boxGoodsKg(products[0])).toBeCloseTo(4.9);
    expect(boxGoodsKg(products[2])).toBeUndefined();
  });
  it('net = boxes weight, gross adds the pallet tare', () => {
    // 1 pallet of 20 boxes + 3 loose boxes of Ostfralla = 23 × 4.9 = 112.7 kg net
    const w = linesWeight([line('ost', 1, 3)], prod);
    expect(w.boxes).toBe(23);
    expect(w.goodsKg).toBeCloseTo(112.7);
    expect(w.grossKg).toBeCloseTo(112.7 + PALLET_TARE_KG);
    expect(w.incomplete).toBe(false);
  });
  it('pallet transfer: loose boxes count as a pallet for the tare', () => {
    // 4 loose boxes of Ostfralla, PÖS → one pallet's tare on top
    const plain = linesWeight([line('ost', 0, 4)], prod);
    expect(plain.pallets).toBe(0);
    expect(plain.grossKg).toBeCloseTo(plain.goodsKg);
    const pos = linesWeight([line('ost', 0, 4)], prod, { looseOnPallet: true });
    expect(pos.pallets).toBe(1);
    expect(pos.grossKg).toBeCloseTo(pos.goodsKg + PALLET_TARE_KG);
  });
  it('sums several orders and flags a missing weight', () => {
    const w = ordersWeight([{ lines: [line('kal', 2)] }, { lines: [line('nope', 1)] }], prod);
    // kal: 2×20×5.4 = 216 kg net; nope has no weight → incomplete, not added
    expect(w.goodsKg).toBeCloseTo(216);
    expect(w.pallets).toBe(3);
    expect(w.grossKg).toBeCloseTo(216 + 3 * PALLET_TARE_KG);
    expect(w.incomplete).toBe(true);
  });
});
