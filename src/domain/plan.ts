import { addDays, type LocalDate } from '../days.ts';
import type { Deviation, DoughCount, Entry, Order, Product, StockCount } from './types.ts';

// Production planning: what is in stock, what a dough usually gives, and how many doughs a day's
// orders need – with how likely that many doughs are to be enough.
//
// Amounts are counted in pallets; boxes count as part of a pallet when the product's boxes per
// pallet is known (otherwise boxes are left out of the pallet sums and shown on their own).

/** A product's pallets plus its boxes as a share of a pallet. */
export const asPallets = (p: Pick<Product, 'boxesPerPallet'> | undefined, pallets: number, boxes: number) =>
  pallets + (p?.boxesPerPallet ? boxes / p.boxesPerPallet : 0);

/** Midnight at the start of a day, on this device's clock. */
export const startOf = (day: LocalDate) => new Date(`${day}T00:00:00`).getTime();

export interface Stock {
  pallets: number;
  boxes: number;
  /** The count it starts from, if stock has ever been counted. */
  countedAt?: number;
}

/**
 * Stock of a product just before `at`, from the count nearest in time: counted before, it is the
 * count + packed since − sent since; counted after (e.g. this morning's count, for the start of
 * the day), it is the count − packed in between + sent in between.
 */
export function stockAt(productId: string, at: number, entries: Entry[], orders: Order[], counts: StockCount[]): Stock {
  const count = counts.filter((c) => c.productId === productId).sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0];
  const forward = !count || count.at < at;
  // The stretch of time between the count and `at`; what happened in it is added (or taken back).
  const [from, to] = !count ? [-Infinity, at] : forward ? [count.at, at] : [at, count.at];
  const inside = (t: number) => t > from && t < to;
  const sign = forward ? 1 : -1;
  let pallets = count?.pallets ?? 0;
  let boxes = count?.boxes ?? 0;
  for (const e of entries)
    if (!e.voided && e.productId === productId && inside(e.at)) {
      if (e.kind === 'pallet') pallets += sign * e.quantity;
      else boxes += sign * e.quantity;
    }
  for (const o of orders)
    if (!o.cancelled && o.shippedAt !== undefined && inside(o.shippedAt))
      for (const l of o.lines)
        if (l.productId === productId) {
          pallets -= sign * l.pallets;
          boxes -= sign * l.boxes;
        }
  return { pallets, boxes, countedAt: count?.at };
}

/** What the orders for a day ask of a product (cancelled orders left out). */
export function orderedOn(productId: string, day: LocalDate, orders: Order[]) {
  let pallets = 0;
  let boxes = 0;
  for (const o of orders)
    if (!o.cancelled && o.day === day)
      for (const l of o.lines)
        if (l.productId === productId) {
          pallets += l.pallets;
          boxes += l.boxes;
        }
  return { pallets, boxes };
}

// ---- What a dough gives ----

export interface YieldDay {
  day: LocalDate;
  doughs: number;
  /** Doughs scrapped that day (left out of the yield). */
  scrapped: number;
  /** Pallets packed that day (boxes as part of a pallet). */
  packed: number;
  /** Pallets per good dough. */
  perDough: number;
  /** The day had a deviation (low yield or other): left out of the usual yield. */
  deviation: boolean;
}

/**
 * Each finished day (before `before`) a product's doughs were counted: what each dough gave.
 * Days with doughs counted but nothing packed on this device are left out and listed in
 * `noPacking` (most likely the packing station's data file hasn't been read in).
 */
export function yieldDays(product: Product, before: LocalDate, doughs: DoughCount[], deviations: Deviation[], entries: Entry[]) {
  const days: YieldDay[] = [];
  const noPacking: LocalDate[] = [];
  const packedOn = new Map<LocalDate, number>();
  for (const e of entries)
    if (!e.voided && e.productId === product.id && e.day < before)
      packedOn.set(e.day, (packedOn.get(e.day) ?? 0) + (e.kind === 'pallet' ? e.quantity : asPallets(product, 0, e.quantity)));
  for (const d of doughs) {
    if (d.productId !== product.id || d.day >= before || d.doughs <= 0) continue;
    const devs = deviations.filter((x) => !x.removed && x.productId === product.id && x.day === d.day);
    const scrapped = Math.min(
      d.doughs,
      devs.filter((x) => x.kind === 'scrapped').reduce((s, x) => s + (x.doughs ?? 0), 0),
    );
    const good = d.doughs - scrapped;
    const packed = packedOn.get(d.day) ?? 0;
    if (good <= 0) continue;
    if (packed <= 0) {
      noPacking.push(d.day);
      continue;
    }
    days.push({ day: d.day, doughs: d.doughs, scrapped, packed, perDough: packed / good, deviation: devs.some((x) => x.kind !== 'scrapped') });
  }
  days.sort((a, b) => (a.day < b.day ? 1 : -1));
  return { days, noPacking: noPacking.sort() };
}

/** Days of history needed before the usual yield is trusted. */
export const MIN_DAYS = 5;
/** How many of the latest normal days the usual yield is taken from. */
export const RECENT_DAYS = 30;

export interface YieldStats {
  /** Pallets per dough, usually. */
  mean: number;
  /** How much it varies from day to day (standard deviation, pallets per dough). */
  sd: number;
  /** Normal days it is taken from. */
  days: number;
  /** Days left out for a deviation (among the recent ones). */
  deviationDays: number;
  /** Enough history to go by; otherwise the expected yield from Admin (or 1) fills in. */
  trusted: boolean;
}

export function yieldStats(product: Product, days: YieldDay[]): YieldStats {
  const recent = days.slice(0, RECENT_DAYS + 10);
  const normal = recent.filter((d) => !d.deviation).slice(0, RECENT_DAYS);
  const deviationDays = recent.filter((d) => d.deviation).length;
  const expected = product.palletsPerDough && product.palletsPerDough > 0 ? product.palletsPerDough : 1;
  if (!normal.length) return { mean: expected, sd: expected * 0.15, days: 0, deviationDays, trusted: false };
  const mean = normal.reduce((s, d) => s + d.perDough, 0) / normal.length;
  const variance = normal.length > 1 ? normal.reduce((s, d) => s + (d.perDough - mean) ** 2, 0) / (normal.length - 1) : 0;
  const trusted = normal.length >= MIN_DAYS;
  // A floor on the spread: a few days that happened to agree don't make it certain.
  const sd = Math.max(Math.sqrt(variance), mean * (trusted ? 0.03 : 0.15));
  return { mean, sd, days: normal.length, deviationDays, trusted };
}

/** The standard normal distribution function. */
export function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26 (error under 1.5e-7).
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** How likely `doughs` doughs are to give at least `need` pallets. */
export function chanceEnough(doughs: number, need: number, stats: YieldStats): number {
  if (need <= 0) return 1;
  if (doughs <= 0) return 0;
  return normalCdf((doughs * stats.mean - need) / (doughs * stats.sd));
}

// ---- The plan for a day ----

export interface PlanRow {
  product: Product;
  ordered: { pallets: number; boxes: number };
  /** Ordered, in pallets (boxes as part of a pallet when known). */
  orderedPallets: number;
  /** In stock for this day's orders after earlier days' orders are taken out; negative = behind. */
  available: number;
  /** Pallets still to make. */
  toMake: number;
  stats: YieldStats;
  /** Recommended doughs: what's needed divided by the usual yield, rounded up. */
  doughs: number;
  /** How likely the recommended doughs are to be enough. */
  chance: number;
  /** One dough more, and how likely that is to be enough. */
  oneMore: { doughs: number; chance: number };
  /** What the recommended doughs give, ± one standard deviation (pallets). */
  expected: { pallets: number; margin: number };
  /** Doughs scrapped on an earlier day, to be made again this day. */
  remakes: { from: LocalDate; doughs: number }[];
}

export interface PlanInput {
  products: Product[];
  entries: Entry[];
  orders: Order[];
  counts: StockCount[];
  doughs: DoughCount[];
  deviations: Deviation[];
  today: LocalDate;
}

/** In stock at the start of `day` for that day's orders, after the open orders of earlier days. */
export function availableFor(product: Product, day: LocalDate, input: PlanInput): number {
  const { entries, orders, counts, today } = input;
  if (day > today) {
    // Earlier days are assumed made in full: what is over carries forward, a shortfall doesn't.
    let carry = availableFor(product, today, input);
    for (let d = today; d < day; d = addDays(d, 1)) {
      const o = orderedOn(product.id, d, orders);
      carry = Math.max(0, carry - asPallets(product, o.pallets, o.boxes));
    }
    return carry;
  }
  const start = startOf(day);
  const s = stockAt(product.id, start, entries, orders, counts);
  let stock = Math.max(0, asPallets(product, s.pallets, s.boxes));
  for (const o of orders)
    if (!o.cancelled && o.day < day && (o.shippedAt === undefined || o.shippedAt >= start))
      for (const l of o.lines) if (l.productId === product.id) stock -= asPallets(product, l.pallets, l.boxes);
  return stock;
}

export function planRow(product: Product, day: LocalDate, input: PlanInput): PlanRow {
  const ordered = orderedOn(product.id, day, input.orders);
  const orderedPallets = asPallets(product, ordered.pallets, ordered.boxes);
  const available = availableFor(product, day, input);
  const toMake = Math.max(0, orderedPallets - available);
  const { days } = yieldDays(product, input.today, input.doughs, input.deviations, input.entries);
  const stats = yieldStats(product, days);
  // A hair under a whole number isn't a reason for one more dough (rounding noise).
  const doughs = toMake > 0 ? Math.ceil(toMake / stats.mean - 1e-9) : 0;
  const remakes = input.deviations
    .filter((x) => !x.removed && x.kind === 'scrapped' && x.productId === product.id && x.remadeOn === day && (x.doughs ?? 0) > 0)
    .map((x) => ({ from: x.day, doughs: x.doughs ?? 0 }));
  return {
    product,
    ordered,
    orderedPallets,
    available,
    toMake,
    stats,
    doughs,
    chance: chanceEnough(doughs, toMake, stats),
    oneMore: { doughs: doughs + 1, chance: chanceEnough(doughs + 1, toMake, stats) },
    expected: { pallets: doughs * stats.mean, margin: doughs * stats.sd },
    remakes,
  };
}

/** A finished day where fewer pallets were packed than the doughs usually give – a pallet may have been missed. */
export interface ShortDay {
  product: Product;
  day: LocalDate;
  packed: number;
  /** The lowest the doughs normally give (two standard deviations under the usual). */
  low: number;
  usual: number;
}

export function shortDays(products: Product[], from: LocalDate, input: PlanInput): ShortDay[] {
  const out: ShortDay[] = [];
  for (const p of products) {
    const { days } = yieldDays(p, input.today, input.doughs, input.deviations, input.entries);
    for (const d of days) {
      if (d.day < from || d.deviation) continue;
      // Judged against the other days, so the day itself doesn't widen what counts as usual.
      const stats = yieldStats(p, days.filter((x) => x !== d));
      if (!stats.trusted) continue;
      const good = d.doughs - d.scrapped;
      const usual = good * stats.mean;
      const low = good * (stats.mean - 2 * stats.sd);
      if (d.packed < low) out.push({ product: p, day: d.day, packed: d.packed, low, usual });
    }
  }
  return out.sort((a, b) => (a.day < b.day ? 1 : -1));
}
