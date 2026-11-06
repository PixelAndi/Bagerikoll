import type { HalfBox, Run } from './types.ts';

// Half boxes and extra boxes – what waits in the freezer beside the orders.

/** Half boxes not yet filled (or undone), oldest first; of one product if given. */
export const openHalves = (halves: HalfBox[], productId?: string) =>
  halves.filter((h) => !h.filled && !h.voided && (!productId || h.productId === productId)).sort((a, b) => a.at - b.at);

export const halfCount = (halves: HalfBox[]) => halves.reduce((n, h) => n + h.quantity, 0);

/** Runs whose extra boxes are still in the freezer, newest first. */
export const extraInFreezer = (runs: Run[]) => runs.filter((r) => (r.surplusBoxes ?? 0) > 0 && !r.surplusTaken && !r.cancelled).sort((a, b) => b.startedAt - a.startedAt);
