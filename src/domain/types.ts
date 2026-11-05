import type { LocalDate } from '../days.ts';

// Every record that can change carries `updatedAt` (set by db.ts on each write), so a data file
// from another device can be merged in: the newer copy of a record wins.

/** Someone at the packing station: a name or a team's nickname. */
export interface Worker {
  id: string;
  name: string;
  /** No longer shown to pick from (kept for the log). */
  hidden?: boolean;
  updatedAt?: number;
}

/**
 * A brand / company the bakery bills under – for accounting only. Each customer is billed by
 * one of them (the weekly accounting summary is split by it); everything else goes by customer.
 */
export interface Brand {
  id: string;
  name: string;
  /** A colour for its chips and squares (a CSS colour). */
  color: string;
  updatedAt?: number;
}

/** Who the products are made for. A product usually has one customer; more are allowed. */
export interface Customer {
  id: string;
  name: string;
  /** The brand (company) that bills this customer. */
  billedBy?: string;
  hidden?: boolean;
  updatedAt?: number;
}

export interface Product {
  id: string;
  name: string;
  /** For accounting only; may be empty. */
  brandId?: string;
  /** Article number, if the bakery uses one. */
  code?: string;
  /** The customers it is made for (usually one). */
  customerIds?: string[];
  /** Boxes on a full pallet as a rule (an order line can say otherwise). */
  boxesPerPallet?: number;
  /** Boxes in one layer on the pallet (for the pallet picture; default 4). */
  boxesPerLayer?: number;
  /** Pallets one dough usually gives, until there is enough history to go by (default 1). */
  palletsPerDough?: number;
  /** Prices for accounting, each from a day on (the one in force on an order's day is used). */
  prices?: Price[];
  hidden?: boolean;
  updatedAt?: number;
}

/**
 * A spell at a station: at the packing station one or more packers together; at the loading dock
 * (kind 'dock') the loaders in `workerIds` and at most one forklift driver.
 */
export interface Session {
  id: string;
  kind?: 'pack' | 'dock';
  workerIds: string[];
  /** The forklift driver (loading dock only; one at a time). */
  driverId?: string;
  startedAt: number;
  endedAt?: number;
  /** Which device/station it ran on (the name set in Admin). */
  station: string;
  updatedAt?: number;
}

export type EntryKind = 'pallet' | 'box';

/** One registration: pallets or boxes of a product, tied to the workers of the session. */
export interface Entry {
  id: string;
  at: number;
  day: LocalDate;
  kind: EntryKind;
  quantity: number;
  productId: string;
  sessionId: string;
  workerIds: string[];
  station: string;
  /** The run (one product at a time on the line) it was packed in. */
  runId?: string;
  /** Undone: kept in the log, left out of every total. */
  voided?: { at: number; by: 'worker' | 'admin'; reason: string };
  updatedAt?: number;
}

// Production (managers): orders, doughs, deviations and stock.

/**
 * A product's price from a day on, in kronor excluding VAT: per pallet and/or per box. Prices
 * differ per customer: a price with `customerId` is that customer's; one without is the
 * standard price, used for customers who have none of their own.
 */
export interface Price {
  from: LocalDate;
  customerId?: string;
  perPallet?: number;
  perBox?: number;
}

/** One product on an order: pallets as a rule, sometimes a few boxes. */
export interface OrderLine {
  productId: string;
  pallets: number;
  boxes: number;
  /** Ticked in the office as planned for production. */
  plannedAt?: number;
  /** Boxes per pallet for this order, set while planning (e.g. by where it is delivered); else the product's. */
  boxesPerPallet?: number;
}

/** A customer's order, copied from the paper list, on the day it is to be picked up. */
export interface Order {
  id: string;
  /** The order number on the paper order. */
  orderNumber?: string;
  customerId: string;
  /** The pickup day (also the day it is produced and packed). */
  day: LocalDate;
  lines: OrderLine[];
  note?: string;
  createdAt: number;
  /** Loaded and sent: from then on it no longer counts in stock. */
  shippedAt?: number;
  /** Who confirmed it loaded at the loading dock. */
  loadedBy?: { workerIds: string[]; driverId?: string };
  /** The quantities the loading dock reported as delivered (when confirmed); accounting bills these. */
  delivered?: { productId: string; pallets: number; boxes: number }[];
  /** Called off: kept, but counted nowhere. */
  cancelled?: boolean;
  updatedAt?: number;
}

/** How many doughs of a product were made on a day (one record per day and product). */
export interface DoughCount {
  /** `${day}|${productId}` – one per day and product. */
  id: string;
  day: LocalDate;
  productId: string;
  doughs: number;
  updatedAt?: number;
}

/**
 * Something that went wrong with a day's doughs:
 * - scrapped: doughs thrown away (e.g. an ingredient missing), often made again early the next day;
 * - lowYield: fewer pallets than usual with no known cause (bread baked together etc.);
 * - other;
 * and from the packing station, tied to the run (the product being packed) and the time:
 * - detector: a metal detector test piece not found;
 * - packing: anything else noted at the packing;
 * and from the loading dock, tied to the delivery (order):
 * - loading: something wrong when loading (wrong count, damage, missing …).
 * A day with a low-yield or other deviation is left out of the product's usual yield.
 */
export type DeviationKind = 'scrapped' | 'lowYield' | 'other' | 'detector' | 'packing' | 'loading';

export interface Deviation {
  id: string;
  day: LocalDate;
  productId: string;
  kind: DeviationKind;
  /** Doughs scrapped (scrapped only). */
  doughs?: number;
  /** The day the scrapped doughs are made again. */
  remadeOn?: LocalDate;
  note: string;
  at: number;
  /** The run it happened in (packing station deviations). */
  runId?: string;
  /** The delivery it concerns (loading dock deviations). */
  orderId?: string;
  /** What went wrong at the loading dock. */
  loadingKind?: 'count' | 'damaged' | 'missing' | 'other';
  /** A manager has seen to it. */
  handled?: { at: number; note?: string };
  /** Who reported it. */
  workerIds?: string[];
  /** Taken back (a mistake): kept, counted nowhere. */
  removed?: boolean;
  updatedAt?: number;
}

/** A count of what is in stock of a product; stock after it = this + packed − sent. */
export interface StockCount {
  id: string;
  at: number;
  productId: string;
  pallets: number;
  boxes: number;
  updatedAt?: number;
}

// The packing protocol: what the paper form held, one row per run.

/** A metal detector test: each test piece passed (found and rejected) or not. */
export interface DetectorTest {
  at: number;
  workerIds: string[];
  /** Ferro 3.5 mm. */
  ferro: boolean;
  /** Non-ferro 4.5 mm. */
  nonFerro: boolean;
  /** Stainless steel 4.0 mm. */
  stainless: boolean;
}

/** A tick on the protocol: when, and who ticked it. */
export interface Tick {
  at: number;
  workerIds: string[];
}

/**
 * A run: one product packed on the line, from the product change to the next. Its boxes are
 * numbered from 01 up; the detector is tested at the start and every two hours; at the end every
 * box is checked to have its label and the machine is cleaned before the next product.
 */
export interface Run {
  id: string;
  day: LocalDate;
  station: string;
  productId: string;
  /** Who it is packed for (the product's customer, or the one chosen if it has several). */
  customerId?: string;
  /** The order it is packed for, when chosen at the start. */
  orderId?: string;
  /** Boxes per pallet in this run (from the order); else the product's. */
  boxesPerPallet?: number;
  startedAt: number;
  endedAt?: number;
  tests: DetectorTest[];
  /** "Alla kartonger har etikett" – checked last. */
  labels?: Tick;
  /** "Städat maskin efter brödbyte" – after the product, before the next is started. */
  cleaned?: Tick;
  /** Started by mistake (nothing packed): kept, shown as such. */
  cancelled?: boolean;
  updatedAt?: number;
}
