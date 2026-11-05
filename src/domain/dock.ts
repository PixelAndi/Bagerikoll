import { addDays, type LocalDate } from '../days.ts';
import type { Deviation, Order } from './types.ts';

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
