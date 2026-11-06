import type { LocalDate } from '../days.ts';
import { lineCalc, lineCost, type LineCalc } from './office.ts';
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
  /** What it cost to make (from the product's costs). */
  cost: LineCalc;
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
      rows.push({ day: order.day, order, customer: customers.find((c) => c.id === order.customerId), product, line, calc: lineCalc(line, product, order.day, order.customerId), cost: lineCost(line, product, order.day) });
    }
  return rows;
}

// ---- Profit: what was delivered, less what it cost to make ----

export interface Profit {
  revenue: number;
  cost: number;
  profit: number;
  /** Profit as a share of revenue (0–1); undefined with no revenue. */
  margin?: number;
  pallets: number;
  /** Rows left out because their price or cost is missing. */
  incomplete: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Revenue, cost and gross profit of some rows; a row counts only when both its price and its cost are known. */
export function profitOf(rows: AccountingRow[]): Profit {
  let revenue = 0;
  let cost = 0;
  let pallets = 0;
  let incomplete = 0;
  for (const r of rows) {
    if (r.calc.amount === undefined || r.cost.amount === undefined) {
      incomplete++;
      continue;
    }
    revenue += r.calc.amount;
    cost += r.cost.amount;
    pallets += r.line.pallets;
  }
  return { revenue: r2(revenue), cost: r2(cost), profit: r2(revenue - cost), margin: revenue ? (revenue - cost) / revenue : undefined, pallets, incomplete };
}

/** Profit per key (customer, product, day …), the most profitable first. */
export function profitBy(rows: AccountingRow[], key: (r: AccountingRow) => string): { key: string; rows: AccountingRow[]; profit: Profit }[] {
  const groups = new Map<string, AccountingRow[]>();
  for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  return [...groups].map(([k, list]) => ({ key: k, rows: list, profit: profitOf(list) })).sort((a, b) => b.profit.profit - a.profit.profit);
}
