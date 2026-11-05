import type { DetectorTest, Entry, Product, Run } from './types.ts';

// Runs: the rows of the packing protocol. Each run is one product on the line; its boxes are
// numbered from 01; the metal detector is tested at every product change and every two hours,
// and packing waits until a test has passed.

/** The metal detector is tested at least this often while a product is packed. */
export const TEST_EVERY_MS = 2 * 60 * 60 * 1000;
/** The station starts reminding this long before a test is due. */
export const TEST_WARN_MS = 15 * 60 * 1000;

export const testPassed = (t: DetectorTest) => t.ferro && t.nonFerro && t.stainless;

export type TestState =
  /** No test yet in this run: test before packing. */
  | { kind: 'needed' }
  /** The latest test failed: packing stops until one passes. */
  | { kind: 'failed'; test: DetectorTest }
  /** More than two hours since the last passed test. */
  | { kind: 'overdue'; dueAt: number }
  | { kind: 'ok'; dueAt: number; soon: boolean };

export function testState(run: Run, now: number): TestState {
  const latest = run.tests.at(-1);
  if (!latest) return { kind: 'needed' };
  if (!testPassed(latest)) return { kind: 'failed', test: latest };
  const dueAt = latest.at + TEST_EVERY_MS;
  if (now >= dueAt) return { kind: 'overdue', dueAt };
  return { kind: 'ok', dueAt, soon: dueAt - now <= TEST_WARN_MS };
}

/** Packing may be registered: the run is open and its latest detector test passed, in time. */
export const canPack = (run: Run, now: number) => !run.endedAt && !run.cancelled && testState(run, now).kind === 'ok';

export interface RunCount {
  pallets: number;
  boxes: number;
  /** All boxes, the pallets' included – the box numbers run 01 to this. Undefined if boxes per pallet isn't set. */
  totalBoxes?: number;
}

export function runCount(run: Run, entries: Entry[], product?: Product): RunCount {
  let pallets = 0;
  let boxes = 0;
  for (const e of entries)
    if (e.runId === run.id && !e.voided) {
      if (e.kind === 'pallet') pallets += e.quantity;
      else boxes += e.quantity;
    }
  // The run's own count (set from the order it is packed for), else the product's.
  const per = run.boxesPerPallet ?? product?.boxesPerPallet;
  return { pallets, boxes, totalBoxes: per ? pallets * per + boxes : pallets ? undefined : boxes };
}

/** The batch: box numbers 01 to the last box, as on the paper form. */
export const batchRange = (totalBoxes: number | undefined) =>
  totalBoxes === undefined ? undefined : totalBoxes > 0 ? `01–${String(totalBoxes).padStart(2, '0')}` : '–';

/** Everyone who signs for the run: who packed in it and who ticked its checks. */
export function runSigners(run: Run, entries: Entry[]): string[] {
  const ids = new Set<string>();
  for (const e of entries) if (e.runId === run.id && !e.voided) e.workerIds.forEach((id) => ids.add(id));
  for (const t of run.tests) t.workerIds.forEach((id) => ids.add(id));
  run.labels?.workerIds.forEach((id) => ids.add(id));
  run.cleaned?.workerIds.forEach((id) => ids.add(id));
  return [...ids];
}

/** What a finished row still lacks (an open run lacks nothing yet). */
export function runGaps(run: Run): ('test' | 'labels' | 'cleaned')[] {
  if (!run.endedAt || run.cancelled) return [];
  const gaps: ('test' | 'labels' | 'cleaned')[] = [];
  if (!run.tests.some(testPassed)) gaps.push('test');
  if (!run.labels) gaps.push('labels');
  if (!run.cleaned) gaps.push('cleaned');
  return gaps;
}

/**
 * When something was packed while the detector test was overdue (more than two hours after the
 * last passed test): the times the test fell due. The station blocks packing then, so this only
 * shows if the device's clock or data were changed – the protocol says so if it happens.
 */
export function testGaps(run: Run, entries: Entry[], now: number): number[] {
  const passed = run.tests.filter(testPassed).map((t) => t.at);
  const packed = entries.filter((e) => e.runId === run.id && !e.voided).map((e) => e.at);
  const gaps: number[] = [];
  passed.forEach((at, i) => {
    const due = at + TEST_EVERY_MS;
    const next = passed[i + 1] ?? run.endedAt ?? now;
    if (packed.some((x) => x >= due && x < next)) gaps.push(due);
  });
  // Packed before any test passed.
  if (packed.some((x) => passed[0] === undefined || x < passed[0])) gaps.unshift(run.startedAt);
  return gaps;
}
