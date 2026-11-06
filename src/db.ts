import Dexie, { type Table } from 'dexie';
import type { Brand, Customer, Deviation, DoughCount, Entry, ObsRequest, Order, Product, Run, Session, StockCount, Worker, HalfBox } from './domain/types.ts';

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
  runs!: Table<Run, string>;
  obs!: Table<ObsRequest, string>;
  halfBoxes!: Table<HalfBox, string>;
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
    this.version(3).stores({
      entries: 'id, at, day, productId, sessionId, runId',
      runs: 'id, day, startedAt',
    });
    this.version(4).stores({
      obs: 'id, day, status, productId',
    });
    this.version(5).stores({
      halfBoxes: 'id, day, productId',
    });
  }
}

export const db = new BagerikollDB();

/** The tables a data file carries (not `meta`, and never this device's settings or PIN). */
export const DATA_TABLES = ['workers', 'brands', 'customers', 'products', 'sessions', 'entries', 'orders', 'doughs', 'deviations', 'stockCounts', 'runs', 'obs', 'halfBoxes'] as const;
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
/** Called after a change made on this device (not one read in) – sync sends it soon after. */
export const localWrites = new Set<() => void>();
const wrote = () => setTimeout(() => localWrites.forEach((f) => f()), 0);
for (const name of DATA_TABLES) {
  const table = db.table(name);
  table.hook('creating', (_key, obj: { updatedAt?: number }) => {
    if (!reading) {
      obj.updatedAt = Date.now();
      wrote();
    }
  });
  table.hook('updating', () => {
    if (reading) return undefined;
    wrote();
    return { updatedAt: Date.now() };
  });
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const DEMO = 'demo-';
/** Test data on this device (src/domain/demo.ts): how many records. */
export async function demoCount(): Promise<number> {
  let n = 0;
  for (const name of DATA_TABLES) n += await db.table(name).where(':id').startsWith(DEMO).count();
  return n;
}
/** Takes the test data off this device (real data is never touched: test ids start with "demo-"). */
export async function removeDemoLocal(): Promise<number> {
  let n = 0;
  await db.transaction('rw', DATA_TABLES.map((t) => db.table(t)), async () => {
    for (const name of DATA_TABLES) n += await db.table(name).where(':id').startsWith(DEMO).delete();
  });
  return n;
}
