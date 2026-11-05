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

/** A brand the products are sold under – for accounting only (in the CSV export); everything else goes by customer. */
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
  /** Boxes on a full pallet, if fixed – lets boxes be counted as part of a pallet. */
  boxesPerPallet?: number;
  /** Pallets one dough usually gives, until there is enough history to go by (default 1). */
  palletsPerDough?: number;
  hidden?: boolean;
  updatedAt?: number;
}

/** A spell at the packing station by one or more workers together. */
export interface Session {
  id: string;
  workerIds: string[];
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
  /** Undone: kept in the log, left out of every total. */
  voided?: { at: number; by: 'worker' | 'admin'; reason: string };
  updatedAt?: number;
}

// Production (managers): orders, doughs, deviations and stock.

/** One product on an order: pallets as a rule, sometimes a few boxes. */
export interface OrderLine {
  productId: string;
  pallets: number;
  boxes: number;
}

/** A customer's order, copied from the paper list, for the day it is produced and packed. */
export interface Order {
  id: string;
  customerId: string;
  day: LocalDate;
  lines: OrderLine[];
  note?: string;
  createdAt: number;
  /** Loaded and sent: from then on it no longer counts in stock. */
  shippedAt?: number;
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
 * - other.
 * A day with a deviation is left out of the product's usual yield, so it doesn't skew it.
 */
export type DeviationKind = 'scrapped' | 'lowYield' | 'other';

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
