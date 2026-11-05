import type { LocalDate } from '../days.ts';

/** Someone at the packing station: a name or a team's nickname. */
export interface Worker {
  id: string;
  name: string;
  /** No longer shown to pick from (kept for the log). */
  hidden?: boolean;
}

/** A brand the products are sold under; products are sorted and filtered by it. */
export interface Brand {
  id: string;
  name: string;
  /** A colour for its chips and squares (a CSS colour). */
  color: string;
}

export interface Product {
  id: string;
  name: string;
  brandId: string;
  /** Article number, if the bakery uses one. */
  code?: string;
  /** Boxes on a full pallet, if fixed – lets totals be told in boxes too. */
  boxesPerPallet?: number;
  hidden?: boolean;
}

/** A spell at the packing station by one or more workers together. */
export interface Session {
  id: string;
  workerIds: string[];
  startedAt: number;
  endedAt?: number;
  /** Which device/station it ran on (the name set in Admin). */
  station: string;
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
}
