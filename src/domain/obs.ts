import { addDays, isoWeekday, type LocalDate } from '../days.ts';
import type { ObsRequest, Order } from './types.ts';

// OBS – urgent production first thing on the next working day, asked for from the freezer when a
// delivery is short after production. Managers decide; some products can't be made as OBS.

/** The next working day (Monday–Friday) after a day. */
export function nextWorkday(day: LocalDate): LocalDate {
  let d = addDays(day, 1);
  while (isoWeekday(d) > 5) d = addDays(d, 1);
  return d;
}

/** Requests the managers still have to act on (asked for, or short with OBS not allowed), oldest first. */
export const openObs = (list: ObsRequest[]) => list.filter((o) => o.status === 'requested' || o.status === 'notAllowed' || o.status === 'planned').sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.requestedAt - b.requestedAt));

/** A prepared order with nothing missing is ready in the freezer, waiting to be loaded. */
export const readyInFreezer = (order: Order) => !!order.prepared && order.prepared.missing.length === 0 && order.shippedAt === undefined;
