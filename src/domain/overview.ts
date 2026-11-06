import type { LocalDate } from '../days.ts';
import { counted, total, type Count } from './production.ts';
import type { Entry, Order, Run, Session } from './types.ts';

// The managers' view of the stations: what each one is doing now, from the sessions, runs and
// registrations the devices sync (as fresh as the last sync). A session or run left open on a
// device for longer than a shift is not taken as going on.

/** Older than this (with nothing registered since), an open session or run is left out. */
export const STALE_MS = 14 * 60 * 60 * 1000;
/** Nothing registered for this long: the station is shown as quiet. */
export const QUIET_MS = 30 * 60 * 1000;

export interface PackingNow {
  station: string;
  session?: Session;
  run?: Run;
  /** The session's registrations (all of them, voided included). */
  entries: Entry[];
  count: Count;
  last?: Entry;
  /** The last thing that happened: a registration, a test, the run's or session's start. */
  lastAt: number;
  quiet: boolean;
}

const latest = <T extends { startedAt: number }>(list: T[]) => [...list].sort((a, b) => b.startedAt - a.startedAt)[0];

/** Each packing station with an open session or run, newest activity first. */
export function packingNow(sessions: Session[], runs: Run[], entries: Entry[], now: number): PackingNow[] {
  const lastEntryOf = (pred: (e: Entry) => boolean) => Math.max(0, ...entries.filter(pred).map((e) => e.at));
  const alive = (startedAt: number, lastAt: number) => now - Math.max(startedAt, lastAt) < STALE_MS;
  const openSessions = sessions.filter((s) => s.kind !== 'dock' && !s.endedAt && alive(s.startedAt, lastEntryOf((e) => e.sessionId === s.id)));
  const openRuns = runs.filter((r) => !r.endedAt && !r.cancelled && alive(r.startedAt, Math.max(lastEntryOf((e) => e.runId === r.id), ...r.tests.map((x) => x.at))));
  const stations = [...new Set([...openSessions.map((s) => s.station), ...openRuns.map((r) => r.station)])];
  return stations
    .map((station) => {
      const session = latest(openSessions.filter((s) => s.station === station));
      const run = latest(openRuns.filter((r) => r.station === station));
      const mine = session ? entries.filter((e) => e.sessionId === session.id) : [];
      const last = [...counted(mine)].sort((a, b) => b.at - a.at)[0];
      const lastAt = Math.max(session?.startedAt ?? 0, run?.startedAt ?? 0, last?.at ?? 0, ...(run?.tests.map((x) => x.at) ?? []));
      return { station, session, run, entries: mine, count: total(mine), last, lastAt, quiet: now - lastAt > QUIET_MS };
    })
    .sort((a, b) => b.lastAt - a.lastAt);
}

export interface DockNow {
  station: string;
  session: Session;
  loading?: Order;
}

/** Each freezer device with loaders checked in now. */
export function dockNow(sessions: Session[], orders: Order[], now: number): DockNow[] {
  const open = sessions.filter((s) => s.kind === 'dock' && !s.endedAt && now - s.startedAt < STALE_MS);
  const stations = [...new Set(open.map((s) => s.station))];
  return stations.map((station) => {
    const session = latest(open.filter((s) => s.station === station));
    return { station, session, loading: session.loadingOrderId ? orders.find((o) => o.id === session.loadingOrderId) : undefined };
  });
}

export interface DayDone {
  day: LocalDate;
  count: Count;
  runs: number;
  /** Everyone who packed or worked upstairs that day. */
  workerIds: string[];
}

/** The days with packing, newest first: what was packed, in how many runs, by whom. */
export function packedDays(entries: Entry[], runs: Run[]): DayDone[] {
  const days = new Map<LocalDate, Entry[]>();
  for (const e of counted(entries)) days.set(e.day, [...(days.get(e.day) ?? []), e]);
  for (const r of runs) if (!r.cancelled && !days.has(r.day)) days.set(r.day, []);
  return [...days.entries()]
    .map(([day, list]) => ({
      day,
      count: total(list),
      runs: runs.filter((r) => r.day === day && !r.cancelled).length,
      workerIds: [...new Set(list.flatMap((e) => [...e.workerIds, ...(e.throwerIds ?? [])]))],
    }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}
