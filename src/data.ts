import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db.ts';
import type { Brand, Customer, Entry, Product, Worker } from './domain/types.ts';

// The lists most screens need, kept live.

export function useCatalog() {
  const workers = useLiveQuery(() => db.workers.orderBy('name').toArray(), []) ?? [];
  const brands = useLiveQuery(() => db.brands.orderBy('name').toArray(), []) ?? [];
  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray(), []) ?? [];
  const products = useLiveQuery(() => db.products.toArray(), []) ?? [];
  return { workers, brands, customers, products };
}

export function useEntriesOn(day: string): Entry[] {
  return useLiveQuery(() => db.entries.where('day').equals(day).toArray(), [day]) ?? [];
}

export function useEntriesBetween(from: string, to: string): Entry[] {
  return useLiveQuery(() => db.entries.where('day').between(from, to, true, true).toArray(), [from, to]) ?? [];
}

export const nameMap = (list: (Worker | Brand | Customer | Product)[]) => new Map(list.map((x) => [x.id, x.name]));

/** Brand colours, picked in turn for a new brand. */
export const BRAND_COLORS = ['#1d5c87', '#b5651d', '#2f9e5b', '#7c5bd1', '#c0392b', '#c98a06'];
