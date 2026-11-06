import { addDays, type LocalDate } from '../days.ts';
import type { Deviation, LineCheck, Order, OrderLine, Product } from './types.ts';

// The loading dock: today's deliveries – what is to be loaded, what has been, what went wrong.

export type DeliveryState = 'loaded' | 'deviation' | 'toLoad';

export interface Delivery {
  order: Order;
  state: DeliveryState;
  /** Picked up on an earlier day but not loaded yet. */
  late: boolean;
  deviations: Deviation[];
}

/** The deliveries for a day: its orders, plus earlier ones from the last week not yet loaded. To load first. */
export function deliveries(orders: Order[], deviations: Deviation[], day: LocalDate): Delivery[] {
  const from = addDays(day, -7);
  const list = orders
    .filter((o) => !o.cancelled && (o.day === day || (o.day < day && o.day >= from && o.shippedAt === undefined)))
    .map((order) => {
      const devs = deviations.filter((x) => !x.removed && x.orderId === order.id && x.kind === 'loading');
      const state: DeliveryState = order.shippedAt !== undefined ? 'loaded' : devs.some((x) => !x.handled) ? 'deviation' : 'toLoad';
      return { order, state, late: order.day < day, deviations: devs };
    });
  const rank = { deviation: 0, toLoad: 1, loaded: 2 };
  return list.sort((a, b) => rank[a.state] - rank[b.state] || (a.order.day < b.order.day ? -1 : a.order.day > b.order.day ? 1 : 0) || (a.order.orderNumber ?? '').localeCompare(b.order.orderNumber ?? '', 'sv', { numeric: true }));
}

/** Loading deviations a manager hasn't seen to yet. */
export const openLoadingDeviations = (deviations: Deviation[]) => deviations.filter((x) => x.kind === 'loading' && !x.removed && !x.handled).sort((a, b) => b.at - a.at);

// ---- Loading one delivery, product by product ----

/** The products on an order that have anything on them. */
export const loadLines = (order: Order) => order.lines.filter((l) => l.pallets || l.boxes);

export const checkOf = (order: Order, productId: string) => order.lineChecks?.find((c) => c.productId === productId);

/** How far the loading of an order has come. */
export function loadProgress(order: Order) {
  const lines = loadLines(order);
  const checked = lines.filter((l) => checkOf(order, l.productId)).length;
  const problems = (order.lineChecks ?? []).filter((c) => c.state !== 'ok' && lines.some((l) => l.productId === c.productId));
  return { total: lines.length, checked, done: lines.length > 0 && checked === lines.length, problems };
}

/**
 * A product with boxes missing: what was loaded. Missing boxes come off the extra boxes first,
 * then off whole pallets (a pallet with boxes missing counts as a part pallet: its boxes).
 */
export function shortLoaded(line: Pick<OrderLine, 'pallets' | 'boxes' | 'boxesPerPallet'>, product: Pick<Product, 'boxesPerPallet'> | undefined, missingBoxes: number): { pallets: number; boxes: number } {
  const per = line.boxesPerPallet ?? product?.boxesPerPallet;
  const missing = Math.max(0, Math.round(missingBoxes));
  if (missing <= line.boxes || !per) return { pallets: line.pallets, boxes: Math.max(0, line.boxes - missing) };
  const all = line.pallets * per + line.boxes - missing;
  if (all <= 0) return { pallets: 0, boxes: 0 };
  return { pallets: Math.floor(all / per), boxes: all % per };
}

/** The quantities delivered, from the checks: as ordered, nothing, or what was loaded of a short product. */
export function deliveredFromChecks(order: Order): { productId: string; pallets: number; boxes: number }[] {
  return loadLines(order).map((l) => {
    const c = checkOf(order, l.productId);
    if (!c || c.state === 'ok') return { productId: l.productId, pallets: l.pallets, boxes: l.boxes };
    if (c.state === 'notDelivered') return { productId: l.productId, pallets: 0, boxes: 0 };
    return { productId: l.productId, pallets: c.pallets, boxes: c.boxes };
  });
}

/** Replace (or add) a product's check. */
export const withCheck = (order: Order, check: LineCheck): LineCheck[] => [...(order.lineChecks ?? []).filter((c) => c.productId !== check.productId), check];
