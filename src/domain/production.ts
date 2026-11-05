import type { Brand, Customer, Entry, EntryKind, Product } from './types.ts';

// Counting what was packed: per product, per brand, per day – voided entries left out.

export interface Count {
  pallets: number;
  boxes: number;
}

export const emptyCount = (): Count => ({ pallets: 0, boxes: 0 });

export function add(c: Count, kind: EntryKind, quantity: number): Count {
  return kind === 'pallet' ? { ...c, pallets: c.pallets + quantity } : { ...c, boxes: c.boxes + quantity };
}

/** Entries that count (not voided). */
export const counted = (entries: Entry[]) => entries.filter((e) => !e.voided);

export function total(entries: Entry[]): Count {
  return counted(entries).reduce((c, e) => add(c, e.kind, e.quantity), emptyCount());
}

/** Totals per product. */
export function byProduct(entries: Entry[]): Map<string, Count> {
  const out = new Map<string, Count>();
  for (const e of counted(entries)) out.set(e.productId, add(out.get(e.productId) ?? emptyCount(), e.kind, e.quantity));
  return out;
}

/** Totals per brand (products without a known brand under ""). */
export function byBrand(entries: Entry[], products: Product[]): Map<string, Count> {
  const brandOf = new Map(products.map((p) => [p.id, p.brandId]));
  const out = new Map<string, Count>();
  for (const e of counted(entries)) {
    const b = brandOf.get(e.productId) ?? '';
    out.set(b, add(out.get(b) ?? emptyCount(), e.kind, e.quantity));
  }
  return out;
}

/** Totals per day. */
export function byDay(entries: Entry[]): Map<string, Count> {
  const out = new Map<string, Count>();
  for (const e of counted(entries)) out.set(e.day, add(out.get(e.day) ?? emptyCount(), e.kind, e.quantity));
  return out;
}

/** Products sorted by brand (in the brands' order), then by name; a brand filter keeps only its own. */
export function sortProducts(products: Product[], brands: Brand[], brandId?: string): Product[] {
  const order = new Map(brands.map((b, i) => [b.id, i]));
  return products
    .filter((p) => !p.hidden && (!brandId || p.brandId === brandId))
    .sort((a, b) => (order.get(a.brandId) ?? 99) - (order.get(b.brandId) ?? 99) || a.name.localeCompare(b.name, 'sv'));
}

export interface CustomerGroup {
  /** Undefined: products with no customer set. */
  customer?: Customer;
  products: Product[];
}

/**
 * Products under their customers (a product made for two customers is under both), each group
 * sorted by brand then name; products without a customer last. With `customerId`, only that one.
 */
export function groupByCustomer(products: Product[], customers: Customer[], brands: Brand[], customerId?: string): CustomerGroup[] {
  const sorted = sortProducts(products, brands);
  const known = new Set(customers.map((c) => c.id));
  const groups: CustomerGroup[] = customers
    .filter((c) => !c.hidden && (!customerId || c.id === customerId))
    .map((c) => ({ customer: c, products: sorted.filter((p) => p.customerIds?.includes(c.id)) }));
  if (!customerId) groups.push({ products: sorted.filter((p) => !p.customerIds?.some((id) => known.has(id))) });
  return groups.filter((g) => g.products.length);
}

/** How long after registering an entry the workers themselves may undo it; later, only an admin can. */
export const UNDO_MS = 2 * 60 * 1000;

export const canWorkerUndo = (e: Entry, now: number) => !e.voided && now - e.at <= UNDO_MS;

/** The log as CSV (semicolon-separated, as Swedish Excel opens it). */
export function toCsv(entries: Entry[], products: Product[], brands: Brand[], workers: { id: string; name: string }[], customers: Customer[] = []): string {
  const p = new Map(products.map((x) => [x.id, x]));
  const b = new Map(brands.map((x) => [x.id, x.name]));
  const c = new Map(customers.map((x) => [x.id, x.name]));
  const w = new Map(workers.map((x) => [x.id, x.name]));
  const cell = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [['Tid', 'Dag', 'Varumärke', 'Kund', 'Produkt', 'Artikelnr', 'Typ', 'Antal', 'Packare', 'Station', 'Ångrad', 'Orsak']];
  for (const e of [...entries].sort((x, y) => x.at - y.at)) {
    const prod = p.get(e.productId);
    rows.push([
      new Date(e.at).toLocaleString('sv-SE'),
      e.day,
      prod ? (b.get(prod.brandId) ?? '') : '',
      (prod?.customerIds ?? []).map((id) => c.get(id) ?? '').filter(Boolean).join(', '),
      prod?.name ?? '',
      prod?.code ?? '',
      e.kind === 'pallet' ? 'Pall' : 'Kartong',
      String(e.quantity),
      e.workerIds.map((id) => w.get(id) ?? '?').join(', '),
      e.station,
      e.voided ? new Date(e.voided.at).toLocaleString('sv-SE') : '',
      e.voided?.reason ?? '',
    ]);
  }
  return rows.map((r) => r.map(cell).join(';')).join('\r\n');
}
