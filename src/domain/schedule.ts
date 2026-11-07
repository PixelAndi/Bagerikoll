import type { LocalDate } from '../days.ts';
import { sortProducts } from './production.ts';
import type { Order, Product } from './types.ts';

// The day's packing list: the managers plan the orders the day before (each line ticked "planned
// for production"). Those planned lines, summed per product, are what the bakery packs today. The
// packers see every product and the amount; they choose the order to pack them in themselves.

export interface ScheduleItem {
  product: Product;
  pallets: number;
  boxes: number;
  /** How many orders include this product (for context). */
  orders: number;
}

/** Today's planned products, summed across orders, in the usual product order. */
export function daySchedule(orders: Order[], products: Product[], day: LocalDate): ScheduleItem[] {
  const by = new Map<string, ScheduleItem>();
  for (const o of orders) {
    if (o.cancelled || o.day !== day) continue;
    for (const l of o.lines) {
      if (!l.plannedAt || (!l.pallets && !l.boxes)) continue;
      const product = products.find((p) => p.id === l.productId);
      if (!product) continue;
      const it = by.get(l.productId) ?? { product, pallets: 0, boxes: 0, orders: 0 };
      it.pallets += l.pallets;
      it.boxes += l.boxes;
      it.orders += 1;
      by.set(l.productId, it);
    }
  }
  return sortProducts([...by.values()].map((i) => i.product)).map((p) => by.get(p.id)!);
}
