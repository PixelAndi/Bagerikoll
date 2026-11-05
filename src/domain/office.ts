import type { LocalDate } from '../days.ts';
import type { Brand, Customer, Order, OrderLine, Price, Product } from './types.ts';

// The office: orders on their pickup day, each line ticked as planned for production, and the
// weekly summary for accounting – split by the company that bills each customer, with amounts
// from the price in force on the order's day.

export interface PlanState {
  planned: number;
  total: number;
  /** Every line is planned. */
  full: boolean;
}

export function planState(order: Order): PlanState {
  const lines = order.lines.filter((l) => l.pallets > 0 || l.boxes > 0);
  const planned = lines.filter((l) => l.plannedAt !== undefined).length;
  return { planned, total: lines.length, full: lines.length > 0 && planned === lines.length };
}

/**
 * The lines after an edit: a line whose amounts changed is no longer planned (production must
 * see the new amount); unchanged lines keep their tick.
 */
export function keepPlanned(before: OrderLine[], after: OrderLine[]): OrderLine[] {
  return after.map((l) => {
    const old = before.find((b) => b.productId === l.productId);
    const same = old && old.pallets === l.pallets && old.boxes === l.boxes;
    return same && old.plannedAt !== undefined ? { ...l, plannedAt: old.plannedAt } : { ...l, plannedAt: undefined };
  });
}

/**
 * The price in force for a customer on a day: the customer's own latest price from that day or
 * before; if it has none, the standard price (no customer) in force then.
 */
export function priceOn(product: Product | undefined, day: LocalDate, customerId?: string): Price | undefined {
  const latest = (list: Price[]) => list.filter((p) => p.from <= day).sort((a, b) => (a.from < b.from ? 1 : -1))[0];
  const prices = product?.prices ?? [];
  return (customerId ? latest(prices.filter((p) => p.customerId === customerId)) : undefined) ?? latest(prices.filter((p) => !p.customerId));
}

/**
 * What a line costs. A pallet is priced per pallet, or per box × boxes per pallet; a box per box,
 * or per pallet ÷ boxes per pallet. Undefined if there is no price to go by.
 */
export function lineAmount(line: Pick<OrderLine, 'pallets' | 'boxes'>, product: Product | undefined, day: LocalDate, customerId?: string): number | undefined {
  const price = priceOn(product, day, customerId);
  if (!price) return line.pallets || line.boxes ? undefined : 0;
  const per = product?.boxesPerPallet;
  const pallet = price.perPallet ?? (price.perBox !== undefined && per ? price.perBox * per : undefined);
  const box = price.perBox ?? (price.perPallet !== undefined && per ? price.perPallet / per : undefined);
  if ((line.pallets && pallet === undefined) || (line.boxes && box === undefined)) return undefined;
  return Math.round(((line.pallets ? line.pallets * pallet! : 0) + (line.boxes ? line.boxes * box! : 0)) * 100) / 100;
}

export interface SummaryRow {
  product: Product | undefined;
  productId: string;
  pallets: number;
  boxes: number;
  /** Undefined when a price is missing for some of it. */
  amount?: number;
}

export interface CustomerSummary {
  customer: Customer | undefined;
  customerId: string;
  orders: number;
  rows: SummaryRow[];
  amount: number;
  /** Some lines had no price: the amount is too low by those. */
  missingPrice: boolean;
}

export interface BillerSummary {
  /** Undefined: customers with no billing company set. */
  brand?: Brand;
  customers: CustomerSummary[];
  amount: number;
  /** Pallets and boxes ordered from it (as the paper order book sums them up each week). */
  pallets: number;
  boxes: number;
  missingPrice: boolean;
}

/** Pallets and boxes on orders (cancelled ones left out). */
export function orderTotals(orders: Order[]): { pallets: number; boxes: number } {
  let pallets = 0;
  let boxes = 0;
  for (const o of orders)
    if (!o.cancelled)
      for (const l of o.lines) {
        pallets += l.pallets;
        boxes += l.boxes;
      }
  return { pallets, boxes };
}

/** The accounting summary for the orders picked up from `from` to `to` (cancelled ones left out). */
export function accountingSummary(orders: Order[], products: Product[], customers: Customer[], brands: Brand[], from: LocalDate, to: LocalDate): BillerSummary[] {
  const byCustomer = new Map<string, CustomerSummary>();
  for (const o of orders) {
    if (o.cancelled || o.day < from || o.day > to) continue;
    let c = byCustomer.get(o.customerId);
    if (!c) {
      c = { customer: customers.find((x) => x.id === o.customerId), customerId: o.customerId, orders: 0, rows: [], amount: 0, missingPrice: false };
      byCustomer.set(o.customerId, c);
    }
    c.orders++;
    for (const l of o.lines) {
      if (!l.pallets && !l.boxes) continue;
      const product = products.find((p) => p.id === l.productId);
      let row = c.rows.find((r) => r.productId === l.productId);
      if (!row) {
        row = { product, productId: l.productId, pallets: 0, boxes: 0, amount: 0 };
        c.rows.push(row);
      }
      row.pallets += l.pallets;
      row.boxes += l.boxes;
      const amount = lineAmount(l, product, o.day, o.customerId);
      if (amount === undefined) {
        row.amount = undefined;
        c.missingPrice = true;
      } else {
        if (row.amount !== undefined) row.amount += amount;
        c.amount += amount;
      }
    }
  }
  const out: BillerSummary[] = [];
  const known = new Set(brands.map((b) => b.id));
  for (const brand of [...brands, undefined]) {
    const list = [...byCustomer.values()]
      .filter((c) => (brand ? c.customer?.billedBy === brand.id : !c.customer?.billedBy || !known.has(c.customer.billedBy)))
      .sort((a, b) => (a.customer?.name ?? '').localeCompare(b.customer?.name ?? '', 'sv'));
    for (const c of list) c.rows.sort((a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? '', 'sv', { numeric: true }));
    if (list.length)
      out.push({
        brand,
        customers: list,
        amount: round2(list.reduce((s, c) => s + c.amount, 0)),
        pallets: list.reduce((s, c) => s + c.rows.reduce((t, r) => t + r.pallets, 0), 0),
        boxes: list.reduce((s, c) => s + c.rows.reduce((t, r) => t + r.boxes, 0), 0),
        missingPrice: list.some((c) => c.missingPrice),
      });
  }
  for (const b of out) for (const c of b.customers) c.amount = round2(c.amount);
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Order numbers used by more than one (not cancelled) order. */
export function duplicateNumbers(orders: Order[]): Set<string> {
  const seen = new Map<string, number>();
  for (const o of orders) if (!o.cancelled && o.orderNumber) seen.set(o.orderNumber, (seen.get(o.orderNumber) ?? 0) + 1);
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
}

/** The summary as CSV for accounting (semicolon-separated, decimal comma, as Swedish Excel opens it). */
export function summaryCsv(summary: BillerSummary[], label: string, noBiller: string): string {
  const money = (n: number | undefined) => (n === undefined ? '' : n.toFixed(2).replace('.', ','));
  const cell = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [['Period', 'Faktureras av', 'Kund', 'Produkt', 'Artikelnr', 'Pall', 'Kartonger', 'Belopp exkl. moms']];
  for (const b of summary)
    for (const c of b.customers)
      for (const r of c.rows) rows.push([label, b.brand?.name ?? noBiller, c.customer?.name ?? '?', r.product?.name ?? '?', r.product?.code ?? '', String(r.pallets), String(r.boxes), money(r.amount)]);
  return rows.map((r) => r.map(cell).join(';')).join('\r\n');
}
