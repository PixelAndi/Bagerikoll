import { todayLocal } from './days.ts';
import { DATA_TABLES, db, removeDemoLocal } from './db.ts';
import { DEMO_LIVE, demoData } from './domain/demo.ts';
import type { Settings } from './settings.ts';

// The public test site (GitHub Pages) is the demo: it shows the app filled with made-up data, to
// show what it looks like in use. The data is made fresh each day, so "now" is always live, and a
// bar at the top lets the viewer switch between what a device is (manager, packing station,
// freezer, accounting) without the PIN. The bakery's own server is never a demo.

export const DEMO_SITE = typeof location !== 'undefined' && /(^|\.)github\.io$/.test(location.hostname);

const at = (day: string, hh: number, mm: number) => new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`).getTime();

/** Puts in fresh test data, replacing the earlier test data (real data is not touched). */
export async function resetDemo(): Promise<void> {
  const today = todayLocal();
  const data = demoData(today, Date.now(), at);
  await removeDemoLocal();
  await db.transaction('rw', [...DATA_TABLES.map((n) => db.table(n)), db.meta], async () => {
    for (const [name, rows] of Object.entries(data)) await db.table(name).bulkPut(rows);
    await db.meta.put({ key: 'demo.madeOn', value: today });
  });
}

/** On the demo site: test data for today, made once a day. */
export async function ensureDemo(): Promise<boolean> {
  if ((await db.meta.get('demo.madeOn'))?.value === todayLocal()) return false;
  await resetDemo();
  return true;
}

export type DemoRole = 'manager' | 'pack' | 'dock' | 'accounting';

/** What a device shown as each role is set to, and the page it opens. */
export function demoRole(role: DemoRole): { settings: Partial<Settings>; hash: string } {
  const today = todayLocal();
  const plain = { locked: false, lockedTo: undefined, productionOpen: false, accountingDevice: false };
  switch (role) {
    case 'pack':
      return { settings: { ...plain, locked: true, lockedTo: 'pack', station: DEMO_LIVE.packStation, sessionId: DEMO_LIVE.packSession(today), runId: undefined }, hash: '#/pack' };
    case 'dock':
      return { settings: { ...plain, locked: true, lockedTo: 'dock', station: DEMO_LIVE.dockStation, dockSessionId: DEMO_LIVE.dockSession(today) }, hash: '#/dock' };
    case 'accounting':
      return { settings: { ...plain, accountingDevice: true, station: 'Ekonomi (test)' }, hash: '#/accounting' };
    default:
      return { settings: { ...plain, productionOpen: true, station: 'Chefens telefon (test)' }, hash: '#/' };
  }
}

/** The run on the line at the demo's packing station (to open it on the station). */
export async function demoLiveRun(): Promise<string | undefined> {
  const today = todayLocal();
  const runs = await db.runs.where('day').equals(today).toArray();
  return runs.find((r) => r.id.startsWith('demo-') && !r.endedAt && !r.cancelled)?.id;
}

export function currentRole(s: Settings): DemoRole {
  if (s.locked) return s.lockedTo === 'dock' ? 'dock' : 'pack';
  if (s.accountingDevice) return 'accounting';
  return 'manager';
}
