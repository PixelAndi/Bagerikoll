import { DATA_TABLES, db, whileReading } from './db.ts';
import { asDataFile, FILE_KIND, FILE_VERSION, mergeRecords, type DataFile } from './domain/datafile.ts';

// Saving and reading data files (see domain/datafile.ts).

export async function saveDataFile(station: string): Promise<'shared' | 'saved'> {
  const tables: DataFile['tables'] = {};
  for (const name of DATA_TABLES) tables[name] = await db.table(name).toArray();
  const file: DataFile = { kind: FILE_KIND, version: FILE_VERSION, savedAt: Date.now(), from: station, tables };
  const stamp = new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-').slice(0, 16);
  const safe = station.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'enhet';
  const name = `bagerikoll-${safe}-${stamp}.json`;
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  // On a phone or tablet: the share sheet (mail, Drive, a chat …); otherwise a download.
  const asFile = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [asFile] })) {
    try {
      await navigator.share({ files: [asFile], title: name });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return 'saved';
}

export interface ReadResult {
  from: string;
  savedAt: number;
  added: number;
  updated: number;
}

/** Reads a data file in; throws 'not-a-data-file' if it isn't one. */
export async function readDataFile(file: File): Promise<ReadResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('not-a-data-file');
  }
  const data = asDataFile(parsed);
  if (!data) throw new Error('not-a-data-file');
  let added = 0;
  let updated = 0;
  await whileReading(() =>
    db.transaction('rw', DATA_TABLES.map((n) => db.table(n)), async () => {
      for (const name of DATA_TABLES) {
        const incoming = data.tables[name];
        if (!incoming?.length) continue;
        const table = db.table(name);
        const r = mergeRecords(await table.toArray(), incoming);
        if (r.write.length) await table.bulkPut(r.write);
        added += r.added;
        updated += r.updated;
      }
    }),
  );
  return { from: data.from, savedAt: data.savedAt, added, updated };
}
