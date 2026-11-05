// A data file: everything this device holds, saved as one JSON file, to be read in on another
// device (the packing tablet's log onto a manager's phone, and back). There is no shared server
// yet, so this is how devices exchange data. Reading a file in never deletes anything: records
// are joined by id, and where both have one, the copy changed last wins.

export const FILE_KIND = 'bagerikoll-data';
export const FILE_VERSION = 1;

export interface DataFile {
  kind: typeof FILE_KIND;
  version: number;
  savedAt: number;
  /** The station name of the device that saved it. */
  from: string;
  tables: Record<string, { id: string; updatedAt?: number }[]>;
}

export interface MergeResult<T> {
  /** Records to write (new ones and newer copies). */
  write: T[];
  added: number;
  updated: number;
}

/** What to write when `incoming` is merged into `existing` (both lists of records with an id). */
export function mergeRecords<T extends { id: string; updatedAt?: number }>(existing: T[], incoming: T[]): MergeResult<T> {
  const have = new Map(existing.map((r) => [r.id, r]));
  const write: T[] = [];
  let added = 0;
  let updated = 0;
  for (const r of incoming) {
    if (!r || typeof r.id !== 'string') continue;
    const mine = have.get(r.id);
    if (!mine) {
      write.push(r);
      added++;
    } else if ((r.updatedAt ?? 0) > (mine.updatedAt ?? 0)) {
      write.push(r);
      updated++;
    }
  }
  return { write, added, updated };
}

/** Checks a parsed file; returns it, or null if it isn't a Bagerikoll data file. */
export function asDataFile(x: unknown): DataFile | null {
  const f = x as Partial<DataFile> | null;
  if (!f || f.kind !== FILE_KIND || typeof f.tables !== 'object' || !f.tables) return null;
  if ((f.version ?? 0) > FILE_VERSION) return null;
  for (const v of Object.values(f.tables)) if (!Array.isArray(v)) return null;
  return f as DataFile;
}
