import type { LocalDate } from '../days.ts';
import { lineCalc, type LineCalc } from './office.ts';
import type { Customer, Order, OrderLine, Product } from './types.ts';

// Accounting: what was actually delivered in a week, priced. An order counts once it is loaded
// at the loading dock; its quantities are those the dock reported (else the ordered ones). The
// week is complete when every order picked up in it has been loaded.

/** What was delivered on an order: the quantities reported at the dock, else those ordered. */
export function deliveredLines(order: Order): OrderLine[] {
  if (!order.delivered) return order.lines;
  // The dock reports quantities only; the order's boxes per pallet still apply.
  return order.delivered.map((d) => ({ ...order.lines.find((l) => l.productId === d.productId), ...d }));
}

/** The dock reported other quantities than ordered. */
export const deliveredDiffers = (order: Order) =>
  !!order.delivered &&
  (order.delivered.some((d) => {
    const o = order.lines.find((l) => l.productId === d.productId);
    return !o || o.pallets !== d.pallets || o.boxes !== d.boxes;
  }) ||
    order.lines.some((l) => (l.pallets || l.boxes) && !order.delivered!.some((d) => d.productId === l.productId)));

export interface WeekStatus {
  /** Orders picked up in the week (cancelled left out). */
  orders: Order[];
  delivered: Order[];
  open: Order[];
  /** Every order loaded (and the week has orders). */
  complete: boolean;
}

export function weekStatus(orders: Order[], from: LocalDate, to: LocalDate): WeekStatus {
  const week = orders.filter((o) => !o.cancelled && o.day >= from && o.day <= to);
  const delivered = week.filter((o) => o.shippedAt !== undefined);
  const open = week.filter((o) => o.shippedAt === undefined);
  return { orders: week, delivered, open, complete: week.length > 0 && open.length === 0 };
}

/** The week's delivered orders with their delivered quantities, for pricing (as accountingSummary takes them). */
export const deliveredOrders = (orders: Order[]) => orders.filter((o) => !o.cancelled && o.shippedAt !== undefined).map((o) => ({ ...o, lines: deliveredLines(o) }));

export interface AccountingRow {
  day: LocalDate;
  order: Order;
  customer?: Customer;
  product?: Product;
  line: OrderLine;
  calc: LineCalc;
}

/** One row per delivered product, in calendar order (day, then order number). */
export function accountingRows(orders: Order[], products: Product[], customers: Customer[], from: LocalDate, to: LocalDate): AccountingRow[] {
  const rows: AccountingRow[] = [];
  const list = deliveredOrders(orders)
    .filter((o) => o.day >= from && o.day <= to)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : (a.orderNumber ?? '').localeCompare(b.orderNumber ?? '', 'sv', { numeric: true }) || a.createdAt - b.createdAt));
  for (const order of list)
    for (const line of order.lines) {
      if (!line.pallets && !line.boxes) continue;
      const product = products.find((p) => p.id === line.productId);
      rows.push({ day: order.day, order, customer: customers.find((c) => c.id === order.customerId), product, line, calc: lineCalc(line, product, order.day, order.customerId) });
    }
  return rows;
}
