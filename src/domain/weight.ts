import { lineBoxesPerPallet } from './pallet.ts';
import type { OrderLine, Product } from './types.ts';

// The goods weight for booking shipping (Nshift): grams per bread × breads per box = a box's
// weight (no packaging counted). The boxes' weight without the pallet is the net goods weight; the
// EUR pallet adds a tare on top for the gross pallet weight. Tare counts whole pallets only.

export const PALLET_TARE_KG = 25;

/** A box's goods weight in kg, or undefined when the product lacks the weight or the count. */
export const boxGoodsKg = (p?: Pick<Product, 'gramsPerBread' | 'breadsPerBox'>): number | undefined =>
  p?.gramsPerBread && p?.breadsPerBox ? (p.gramsPerBread * p.breadsPerBox) / 1000 : undefined;

export interface Weight {
  /** The boxes' weight without the pallet (net). */
  goodsKg: number;
  /** Net plus the pallets' tare (gross, for whole pallets). */
  grossKg: number;
  pallets: number;
  boxes: number;
  /** Some product lacked a weight (or a box count for a pallet): the kg are too low. */
  incomplete: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The weight of a set of order lines. */
export function linesWeight(lines: OrderLine[], product: (id: string) => Product | undefined): Weight {
  let goods = 0;
  let pallets = 0;
  let boxes = 0;
  let incomplete = false;
  for (const l of lines) {
    if (!l.pallets && !l.boxes) continue;
    const p = product(l.productId);
    const bpp = lineBoxesPerPallet(l, p);
    const totalBoxes = (bpp ? l.pallets * bpp : 0) + l.boxes;
    boxes += totalBoxes;
    pallets += l.pallets;
    const w = boxGoodsKg(p);
    if (w === undefined || (l.pallets && !bpp)) incomplete = true;
    else goods += totalBoxes * w;
  }
  return { goodsKg: round1(goods), grossKg: round1(goods + pallets * PALLET_TARE_KG), pallets, boxes, incomplete };
}

/** The weight of several orders together (flattening their lines). */
export const ordersWeight = (orders: { lines: OrderLine[] }[], product: (id: string) => Product | undefined): Weight => linesWeight(orders.flatMap((o) => o.lines), product);
