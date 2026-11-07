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

/** How a line's amount is worked out – shown to accounting and written to the spreadsheet. */
export interface LineCalc {
  pallets: number;
  boxes: number;
  /** Boxes per pallet on this line (the order's, else the product's). */
  boxesPerPallet?: number;
  /** The price used. */
  price?: Price;
  /** Price of one pallet: per pallet, or per box × boxes per pallet. */
  palletPrice?: number;
  palletFrom?: 'pallet' | 'box';
  /** Price of one box: per box, or per pallet ÷ boxes per pallet. */
  boxPrice?: number;
  boxFrom?: 'box' | 'pallet';
  /** Undefined when something needed is missing. */
  amount?: number;
  missing?: 'price' | 'boxesPerPallet';
}

export function lineCalc(line: Pick<OrderLine, 'pallets' | 'boxes' | 'boxesPerPallet'>, product: Product | undefined, day: LocalDate, customerId?: string): LineCalc {
  return calcWith(line, product, priceOn(product, day, customerId));
}

/** The cost in force on a day (the latest one from that day or before; costs are the same for every customer). */
export function costOn(product: Product | undefined, day: LocalDate): Price | undefined {
  return (product?.costs ?? []).filter((p) => p.from <= day).sort((a, b) => (a.from < b.from ? 1 : -1))[0];
}

/** What a line costs the bakery to make, worked out as the amount is (pallets and boxes). */
export function lineCost(line: Pick<OrderLine, 'pallets' | 'boxes' | 'boxesPerPallet'>, product: Product | undefined, day: LocalDate): LineCalc {
  return calcWith(line, product, costOn(product, day));
}

function calcWith(line: Pick<OrderLine, 'pallets' | 'boxes' | 'boxesPerPallet'>, product: Product | undefined, price: Price | undefined): LineCalc {
  const per = line.boxesPerPallet ?? product?.boxesPerPallet;
  const base: LineCalc = { pallets: line.pallets, boxes: line.boxes, boxesPerPallet: per, price };
  if (!line.pallets && !line.boxes) return { ...base, amount: 0 };
  if (!price) return { ...base, missing: 'price' };
  const palletPrice = price.perPallet ?? (price.perBox !== undefined && per ? price.perBox * per : undefined);
  const boxPrice = price.perBox ?? (price.perPallet !== undefined && per ? price.perPallet / per : undefined);
  const calc: LineCalc = {
    ...base,
    palletPrice,
    palletFrom: price.perPallet !== undefined ? 'pallet' : 'box',
    boxPrice,
    boxFrom: price.perBox !== undefined ? 'box' : 'pallet',
  };
  if ((line.pallets && palletPrice === undefined) || (line.boxes && boxPrice === undefined)) return { ...calc, missing: 'boxesPerPallet' };
  return { ...calc, amount: Math.round(((line.pallets ? line.pallets * palletPrice! : 0) + (line.boxes ? line.boxes * boxPrice! : 0)) * 100) / 100 };
}

/**
 * What a line costs. A pallet is priced per pallet, or per box × boxes per pallet (the order's
 * count when one was set); a box per box, or per pallet ÷ boxes per pallet. Undefined if there is
 * no price (or count) to go by.
 */
export function lineAmount(line: Pick<OrderLine, 'pallets' | 'boxes' | 'boxesPerPallet'>, product: Product | undefined, day: LocalDate, customerId?: string): number | undefined {
  return lineCalc(line, product, day, customerId).amount;
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
  /** Pallets we send (billed when the customer buys them): whole pallets + one for loose boxes. */
  palletCount?: number;
  /** What those pallets come to (palletCount × the customer's pallet price). */
  palletAmount?: number;
}

export interface BillerSummary {
  /** Undefined: customers with no billing company set. */
  brand?: Brand;
  customers: CustomerSummary[];
  amount: number;
  /** Pallets billed (customers who buy them) and what they come to. */
  palletCount?: number;
  palletAmount?: number;
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
    if (c.customer?.buysPallets) {
      const whole = o.lines.reduce((t, l) => t + l.pallets, 0);
      const loose = o.lines.reduce((t, l) => t + l.boxes, 0);
      c.palletCount = (c.palletCount ?? 0) + whole + (loose > 0 ? 1 : 0);
    }
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
    for (const c of list) {
      c.rows.sort((a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? '', 'sv', { numeric: true }));
      if (c.customer?.buysPallets && c.customer.palletPrice && c.palletCount) c.palletAmount = round2(c.palletCount * c.customer.palletPrice);
    }
    if (list.length) {
      const palletAmount = round2(list.reduce((s, c) => s + (c.palletAmount ?? 0), 0));
      out.push({
        brand,
        customers: list,
        amount: round2(list.reduce((s, c) => s + c.amount + (c.palletAmount ?? 0), 0)),
        pallets: list.reduce((s, c) => s + c.rows.reduce((t, r) => t + r.pallets, 0), 0),
        boxes: list.reduce((s, c) => s + c.rows.reduce((t, r) => t + r.boxes, 0), 0),
        missingPrice: list.some((c) => c.missingPrice),
        palletCount: list.reduce((s, c) => s + (c.palletCount ?? 0), 0) || undefined,
        palletAmount: palletAmount || undefined,
      });
    }
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

/** A billing company's short marking: its code, else its capitals ("Bageri Exempel" → "BE"), else its first three letters. */
export function billerCode(brand: Pick<Brand, 'name' | 'code'>): string {
  if (brand.code?.trim()) return brand.code.trim().toUpperCase();
  const caps = brand.name.match(/\p{Lu}/gu) ?? [];
  return caps.length >= 2 ? caps.join('') : brand.name.slice(0, 3).toUpperCase();
}

export interface LineChange {
  /** Edited after it was first entered: what it was then. */
  was?: { pallets: number; boxes: number };
  /** Added after the order was first entered. */
  added?: boolean;
  /** The loading dock loaded something else: what was loaded. */
  delivered?: { pallets: number; boxes: number };
}

/** What changed about one product on an order: in the office after entry, and at the loading dock. */
export function lineChange(order: Order, productId: string): LineChange {
  const now = order.lines.find((l) => l.productId === productId);
  const first = order.firstLines?.find((l) => l.productId === productId && (l.pallets || l.boxes));
  const change: LineChange = {};
  if (order.firstLines && now) {
    if (!first) change.added = true;
    else if (first.pallets !== now.pallets || first.boxes !== now.boxes) change.was = { pallets: first.pallets, boxes: first.boxes };
  }
  const d = order.delivered?.find((x) => x.productId === productId);
  if (order.delivered && now && (now.pallets || now.boxes)) {
    const got = d ?? { pallets: 0, boxes: 0 };
    if (got.pallets !== now.pallets || got.boxes !== now.boxes) change.delivered = { pallets: got.pallets, boxes: got.boxes };
  }
  return change;
}

/** Products that were on the order when first entered but have been taken off since. */
export const removedLines = (order: Order): OrderLine[] =>
  (order.firstLines ?? []).filter((f) => (f.pallets || f.boxes) && !order.lines.some((l) => l.productId === f.productId && (l.pallets || l.boxes)));

/** The lines to store after an edit, and what the order looked like first (kept on the first real change). */
export function editedOrder(order: Order, lines: OrderLine[]): { lines: OrderLine[]; firstLines?: OrderLine[] } {
  const kept = keepPlanned(order.lines, lines);
  const same = (a: OrderLine[], b: OrderLine[]) => {
    const live = (x: OrderLine[]) => x.filter((l) => l.pallets || l.boxes);
    return live(a).length === live(b).length && live(a).every((l) => live(b).some((m) => m.productId === l.productId && m.pallets === l.pallets && m.boxes === l.boxes));
  };
  if (same(order.lines, kept)) return { lines: kept, firstLines: order.firstLines };
  return { lines: kept, firstLines: order.firstLines ?? order.lines.map(({ productId, pallets, boxes, boxesPerPallet }) => ({ productId, pallets, boxes, boxesPerPallet })) };
}
