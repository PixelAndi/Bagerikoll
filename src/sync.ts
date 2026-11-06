import { useEffect, useState } from 'react';
import { DATA_TABLES, db, localWrites, whileReading } from './db.ts';
import { mergeRecords } from './domain/datafile.ts';

// Sync with Bagerikoll's server (server/), when the app is opened from it. Every device keeps all
// the data and works offline as before; when it reaches the server it sends what changed here
// since its last send and fetches what changed elsewhere since its last fetch. The newer copy of a
// record wins, nothing is deleted (as with data files). Opened from anywhere else (e.g. GitHub
// Pages) there is no server and sync stays off. Behind Cloudflare Access, an expired login shows
// as "log in again".

export type SyncState = 'off' | 'checking' | 'syncing' | 'ok' | 'offline' | 'login' | 'error';
export interface SyncStatus {
  state: SyncState;
  /** The last successful sync. */
  at?: number;
  /** Records fetched in the last sync. */
  received?: number;
  error?: string;
}

let status: SyncStatus = { state: 'checking' };
const listeners = new Set<(s: SyncStatus) => void>();
const setStatus = (s: Partial<SyncStatus>) => {
  status = { ...status, ...s };
  listeners.forEach((f) => f(status));
};

export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState(status);
  useEffect(() => {
    listeners.add(setS);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

const meta = async <T,>(key: string, fallback: T): Promise<T> => ((await db.meta.get(key))?.value as T | undefined) ?? fallback;
const setMeta = (key: string, value: unknown) => db.meta.put({ key, value });

/** A JSON answer from our server – anything else (a login page, an error page) is not. */
async function api(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'manual',
  });
  // Cloudflare Access answers an expired login with a redirect (or its login page).
  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) throw new Error('login');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) throw new Error('login');
  return res.json();
}

let enabled = false;
let running: Promise<void> | null = null;
let again = false;

/** One sync round: send, fetch (page by page), merge. */
async function round(device: string) {
  const started = Date.now();
  const pushedAt = await meta('sync.pushedAt', 0);
  let since = await meta('sync.seq', 0);
  // What changed here since the last send (a little overlap, so nothing slips between).
  const records: Record<string, unknown[]> = {};
  for (const name of DATA_TABLES) {
    const changed = await db.table(name).filter((r: { updatedAt?: number }) => (r.updatedAt ?? 0) >= pushedAt - 120_000).toArray();
    if (changed.length) records[name] = changed;
  }
  let received = 0;
  let first = true;
  for (;;) {
    const answer = (await api('api/sync', { since, records: first ? records : {}, device })) as { seq: number; records: Record<string, { id: string; updatedAt?: number }[]>; more: boolean };
    first = false;
    await whileReading(() =>
      db.transaction('rw', DATA_TABLES.map((n) => db.table(n)), async () => {
        for (const name of DATA_TABLES) {
          const incoming = answer.records[name];
          if (!incoming?.length) continue;
          const table = db.table(name);
          const ids = incoming.map((r) => r.id);
          const mine = (await table.bulkGet(ids)).filter(Boolean) as { id: string; updatedAt?: number }[];
          const r = mergeRecords(mine, incoming);
          if (r.write.length) await table.bulkPut(r.write);
          received += r.added + r.updated;
        }
      }),
    );
    since = answer.seq;
    await setMeta('sync.seq', since);
    if (!answer.more) break;
  }
  await setMeta('sync.pushedAt', started);
  setStatus({ state: 'ok', at: Date.now(), received, error: undefined });
}

/** Sync now (or as soon as the round running now is done). */
export function syncNow(device: string): Promise<void> {
  if (!enabled) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  if (!navigator.onLine) {
    setStatus({ state: 'offline' });
    return Promise.resolve();
  }
  setStatus({ state: 'syncing' });
  running = round(device)
    .catch((e: Error) => setStatus({ state: e.message === 'login' ? 'login' : navigator.onLine ? 'error' : 'offline', error: e.message }))
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        void syncNow(device);
      }
    });
  return running;
}

/** Find out whether the app was opened from Bagerikoll's server, and if so keep it in sync. */
export async function startSync(device: () => string) {
  try {
    const health = (await api('api/health')) as { app?: string };
    enabled = health.app === 'bagerikoll';
  } catch (e) {
    // Behind Access with an expired login the health check is refused too: still our server.
    enabled = (e as Error).message === 'login' && location.hostname !== 'localhost' && !location.hostname.endsWith('github.io');
    if (enabled) setStatus({ state: 'login' });
  }
  if (!enabled) return setStatus({ state: 'off' });
  // Ask the browser to keep this device's copy (it is a backup too).
  void navigator.storage?.persist?.();
  const go = () => void syncNow(device());
  let timer: number | undefined;
  localWrites.add(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(go, 1500);
  });
  window.addEventListener('online', go);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && go());
  window.setInterval(go, 20_000);
  go();
}
