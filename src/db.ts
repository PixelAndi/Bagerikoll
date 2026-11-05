import Dexie, { type Table } from 'dexie';
import type { Brand, Customer, Deviation, DoughCount, Entry, Order, Product, Session, StockCount, Worker } from './domain/types.ts';

// Everything is kept on this device (IndexedDB). Nothing is ever deleted from the
// production log: a mistake is voided, with who and when, so the log stays whole.

export interface KeyValue {
  key: string;
  value: unknown;
}

class BagerikollDB extends Dexie {
  workers!: Table<Worker, string>;
  brands!: Table<Brand, string>;
  customers!: Table<Customer, string>;
  products!: Table<Product, string>;
  sessions!: Table<Session, string>;
  entries!: Table<Entry, string>;
  orders!: Table<Order, string>;
  doughs!: Table<DoughCount, string>;
  deviations!: Table<Deviation, string>;
  stockCounts!: Table<StockCount, string>;
  meta!: Table<KeyValue, string>;

  constructor() {
    super('bagerikoll');
    this.version(1).stores({
      workers: 'id, name',
      brands: 'id, name',
      products: 'id, brandId, name',
      sessions: 'id, startedAt',
      entries: 'id, at, day, productId, sessionId',
      meta: 'key',
    });
    this.version(2).stores({
      customers: 'id, name',
      orders: 'id, day, customerId',
      doughs: 'id, day, productId',
      deviations: 'id, day, productId',
      stockCounts: 'id, at, productId',
    });
  }
}

export const db = new BagerikollDB();

/** The tables a data file carries (not `meta`, and never this device's settings or PIN). */
export const DATA_TABLES = ['workers', 'brands', 'customers', 'products', 'sessions', 'entries', 'orders', 'doughs', 'deviations', 'stockCounts'] as const;
export type DataTable = (typeof DATA_TABLES)[number];

// Each write stamps the record with when it changed, so merging a data file from another device
// keeps the newer copy. While a data file is read in, the file's own stamps are kept.
let reading = false;
export async function whileReading<T>(work: () => Promise<T>): Promise<T> {
  reading = true;
  try {
    return await work();
  } finally {
    reading = false;
  }
}
for (const name of DATA_TABLES) {
  const table = db.table(name);
  table.hook('creating', (_key, obj: { updatedAt?: number }) => {
    if (!reading) obj.updatedAt = Date.now();
  });
  table.hook('updating', () => (reading ? undefined : { updatedAt: Date.now() }));
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
