import Dexie, { type Table } from 'dexie';
import type { Brand, Entry, Product, Session, Worker } from './domain/types.ts';

// Everything is kept on this device (IndexedDB). Nothing is ever deleted from the
// production log: a mistake is voided, with who and when, so the log stays whole.

export interface KeyValue {
  key: string;
  value: unknown;
}

class BagerikollDB extends Dexie {
  workers!: Table<Worker, string>;
  brands!: Table<Brand, string>;
  products!: Table<Product, string>;
  sessions!: Table<Session, string>;
  entries!: Table<Entry, string>;
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
  }
}

export const db = new BagerikollDB();

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
