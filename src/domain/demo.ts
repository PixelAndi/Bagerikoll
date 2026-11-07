import { addDays, isoWeekday, mondayOf, type LocalDate } from '../days.ts';
import type { Brand, Customer, Deviation, DoughCount, Entry, HalfBox, ObsRequest, Order, OrderLine, Product, Run, Session, StockCount, Worker } from './types.ts';

// Test data: a bakery's weeks, made up, to see every page filled in. Every record's id starts with
// DEMO_PREFIX, so it can be taken off again – from the server and from every device – without
// touching real data (see removeDemo in db.ts and the server's /api/demo/remove). Names of people,
// customers and companies are invented; amounts and prices are of the kind the paper order book shows.

export const DEMO_PREFIX = 'demo-';

/** The test data's live parts: what a device shown as a station opens (see demoSite.ts). */
export const DEMO_LIVE = {
  packStation: 'Packning 1 (test)',
  dockStation: 'Fryslager (test)',
  packSession: (today: LocalDate) => `${DEMO_PREFIX}s-${today}`,
  dockSession: (today: LocalDate) => `${DEMO_PREFIX}ds-${today}`,
};
export const isDemo = (id: string) => id.startsWith(DEMO_PREFIX);

export interface DemoData {
  workers: Worker[];
  brands: Brand[];
  customers: Customer[];
  products: Product[];
  sessions: Session[];
  entries: Entry[];
  orders: Order[];
  doughs: DoughCount[];
  deviations: Deviation[];
  stockCounts: StockCount[];
  runs: Run[];
  obs: ObsRequest[];
  halfBoxes: HalfBox[];
}

/** A small seeded random generator, so the same day gives the same data. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const id = (kind: string, n: number | string) => `${DEMO_PREFIX}${kind}-${n}`;

/**
 * Three weeks back, this week and next: orders (Mon–Fri), packing with runs and detector tests,
 * loading, doughs, deviations, stock counts, OBS, half and extra boxes – and, on a working day,
 * a packing session going on now. `at(day, hh, mm)` gives a time on a day (the device's time zone).
 */
export function demoData(today: LocalDate, now: number, at: (day: LocalDate, hh: number, mm: number) => number): DemoData {
  const rnd = random(Number(today.replace(/-/g, '')));
  const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)];
  const stamp = now;

  const workers: Worker[] = ['Anna Testsson', 'Bo Provsson', 'Cia Exempel', 'Dan Demo', 'Eva Testsson', 'Filip Provsson', 'Gul Exempel', 'Hassan Demo', 'Ida Testsson', 'Jonas Provsson', 'Karin Exempel', 'Leo Demo'].map((name, i) => ({ id: id('w', i), name, updatedAt: stamp }));
  const W = workers.map((w) => w.id);
  const packers = W.slice(0, 6);
  const upstairs = W.slice(6, 8);
  const loaders = W.slice(8, 11);
  const driver = W[11];

  const brands: Brand[] = [
    { id: id('b', 'be'), name: 'Bageri Exempel AB', code: 'BE', color: '#1d5c87', updatedAt: stamp },
    { id: id('b', 'st'), name: 'Surdegshuset Test AB', code: 'ST', color: '#b5651d', updatedAt: stamp },
  ];
  const [BE, ST] = brands.map((b) => b.id);
  const C = (key: string, name: string, billedBy: string, palletTransfer = false, buysPrice?: number): Customer => ({ id: id('c', key), name, billedBy, palletTransfer: palletTransfer || undefined, buysPallets: buysPrice ? true : undefined, palletPrice: buysPrice, updatedAt: stamp });
  const customers: Customer[] = [
    C('gn', 'Grossist Nord', ST),
    C('gs', 'Grossist Syd', ST),
    C('gv', 'Grossist Väst', ST, true), // pallet transfer (PÖS): loose boxes ship on their own pallet
    C('lk', 'Livskedjan', ST),
    C('ck', 'Cafékedjan', BE),
    C('ss', 'Storkök Service', BE, false, 180), // buys the pallets we send – billed per pallet
    C('hg', 'Hotellgruppen', BE),
    C('rs', 'Restaurang Söder', BE),
  ];
  const c = (key: string) => id('c', key);
  const from = addDays(mondayOf(today), -63);
  type Money = { perBox?: number; perPallet?: number };
  // Weight (g/bread, breads/box) kept apart from the name, for the shipping weight; the name's
  // own weight suffix is dropped so the two don't double up. Packs get explicit figures.
  const packWeight: Record<string, [number, number]> = { k8p: [640, 12] };
  const P = (key: string, name: string, code: string, cust: string[], bpp: number, price: Money, cost: Money, special?: [string, Money]): Product => {
    const m = /\s(\d+)g$/.exec(name);
    const grams = packWeight[key]?.[0] ?? (m ? Number(m[1]) : undefined);
    const breadsPerBox = packWeight[key]?.[1] ?? (grams !== undefined ? (grams <= 65 ? 90 : 70) : undefined);
    return {
      id: id('p', key),
      name: m ? name.slice(0, m.index) : name,
      code,
      customerIds: cust.map(c),
      boxesPerPallet: bpp,
      boxesPerLayer: bpp % 4 === 0 ? 4 : bpp % 5 === 0 ? 5 : 4,
      gramsPerBread: grams,
      breadsPerBox,
      palletsPerDough: key === 'fullk' ? 2 : 1,
      prices: [{ from, ...price }, ...(special ? [{ from, customerId: c(special[0]), ...special[1] }] : [])],
      costs: [{ from, ...cost }],
      obsBlocked: key === 'pumpa' ? true : undefined,
      updatedAt: stamp,
    };
  };
  const products: Product[] = [
    P('ost', 'Ostfralla 70g', '1086', ['gn', 'gs', 'gv'], 20, { perBox: 80 }, { perBox: 52 }),
    P('rosen', 'Rosenbröd 70g', '1045', ['gn', 'gs', 'ck'], 20, { perBox: 95 }, { perBox: 66 }, ['ck', { perBox: 82 }]),
    P('k8p', 'Källarfranska 8-pack', '1085', ['gn', 'gs', 'gv'], 20, { perBox: 120 }, { perBox: 80 }),
    P('kall', 'Källarfranska 80g', '1076', ['gs', 'gv', 'lk', 'ss'], 20, { perBox: 85 }, { perBox: 60 }),
    P('vallmo', 'Vallmobröd 70g', '1099', ['gn', 'gs', 'gv', 'lk'], 20, { perBox: 90 }, { perBox: 58 }),
    P('ljus', 'Ljus surdeg 75g', '1078', ['gs', 'gv', 'ck', 'rs'], 36, { perBox: 88 }, { perBox: 62 }, ['ck', { perBox: 76 }]),
    P('mork', 'Mörk ciabatta 60g', '1079', ['gn', 'gs', 'gv', 'ck'], 20, { perBox: 88 }, { perBox: 63 }, ['ck', { perBox: 76 }]),
    P('russin', 'Russinbröd 60g', '1025', ['gn', 'lk'], 25, { perBox: 92 }, { perBox: 70 }),
    P('pumpa', 'Pumpabröd 70g', '1011', ['ck'], 36, { perPallet: 1960 }, { perPallet: 1380 }),
    P('flerk', 'Flerkornsbröd 60g', '1031', ['lk'], 20, { perBox: 85 }, { perBox: 55 }),
    P('cia40', 'Ciabatta 40g', '1041', ['ss', 'hg'], 36, { perBox: 70 }, { perBox: 52 }),
    P('ekocia', 'Eko ciabatta 50g', '1051', ['ss', 'hg'], 36, { perBox: 105 }, { perBox: 80 }),
    P('kaiser', 'Rund kaiser 50g', '1023', ['hg', 'rs'], 20, { perBox: 72 }, { perBox: 55 }),
    P('fullk', 'Fullkornsbröd 70g', '1061', ['ss'], 20, { perPallet: 2418 }, { perPallet: 1700 }),
  ];
  const prod = (key: string) => products.find((p) => p.id === id('p', key))!;

  // Each customer's usual order: products and pallets (varied a little from week to week).
  const usual: Record<string, [string, number, number?][]> = {
    gn: [['ost', 4], ['rosen', 3], ['k8p', 2], ['russin', 1]],
    gs: [['vallmo', 2], ['kall', 2], ['mork', 2], ['k8p', 2], ['ljus', 2]],
    gv: [['vallmo', 1], ['ljus', 1], ['kall', 1], ['mork', 1], ['ost', 1]],
    lk: [['flerk', 4, 17], ['russin', 3], ['vallmo', 5], ['kall', 6]],
    ck: [['ljus', 6], ['mork', 6], ['pumpa', 4], ['rosen', 1]],
    ss: [['kall', 3], ['cia40', 2], ['ekocia', 2], ['fullk', 2]],
    hg: [['cia40', 1], ['ekocia', 1], ['kaiser', 4]],
    rs: [['kaiser', 2], ['ljus', 1, 12]],
  };
  // Which customers order on which weekday (1 = Monday).
  const days: Record<number, string[]> = { 1: ['gn', 'ck', 'rs'], 2: ['ss', 'gn', 'hg'], 3: ['lk', 'gs', 'rs'], 4: ['ck', 'ss', 'gv', 'hg'], 5: ['gs', 'gn', 'ss'] };

  const orders: Order[] = [];
  const sessions: Session[] = [];
  const runs: Run[] = [];
  const entries: Entry[] = [];
  const doughs: DoughCount[] = [];
  const deviations: Deviation[] = [];
  const halfBoxes: HalfBox[] = [];
  let n = 0;
  let orderNo = 4100;

  const start = addDays(mondayOf(today), -21);
  const end = addDays(mondayOf(today), 11);
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const wd = isoWeekday(day);
    if (wd > 5) continue;
    const past = day < today;
    const isToday = day === today;
    const dayOrders: Order[] = [];
    for (const key of days[wd]) {
      const lines: OrderLine[] = usual[key].map(([p, pallets, boxes = 0]) => ({ productId: id('p', p), pallets: Math.max(1, pallets + (rnd() < 0.3 ? (rnd() < 0.5 ? -1 : 1) : 0)), boxes }));
      const o: Order = { id: id('o', n++), orderNumber: rnd() < 0.7 ? String(orderNo++) : undefined, customerId: c(key), day, lines, createdAt: at(addDays(day, -6), 9, 30), updatedAt: stamp };
      // Planned for production: all lines of past and this week's orders, some of next week's.
      const planned = past || isToday || day < addDays(mondayOf(today), 7) || rnd() < 0.3;
      if (planned) o.lines = o.lines.map((l) => ({ ...l, plannedAt: at(addDays(day, -3), 10, 0) }));
      dayOrders.push(o);
    }
    // A few special cases: a changed order, a set boxes per pallet, "all on N pallets".
    if (wd === 3) {
      const o = dayOrders[0];
      o.firstLines = o.lines.map((l) => ({ ...l }));
      o.lines = o.lines.map((l, i) => (i === 0 ? { ...l, pallets: l.pallets + 2 } : l));
    }
    // A pallet-transfer customer that sometimes orders only a few boxes – shipped on their own pallet.
    if (wd === 2) {
      dayOrders.push({ id: id('o', n++), orderNumber: String(orderNo++), customerId: c('gv'), day, lines: [{ productId: id('p', 'ost'), pallets: 0, boxes: 4, plannedAt: at(addDays(day, -3), 10, 0) }], createdAt: at(addDays(day, -6), 9, 30), updatedAt: stamp });
    }
    if (wd === 4) {
      const o = dayOrders.find((x) => x.customerId === c('ck'))!;
      o.lines = o.lines.map((l) => (l.productId === id('p', 'ljus') ? { ...l, boxesPerPallet: 32 } : l.productId === id('p', 'pumpa') ? { ...l, spreadPallets: true } : l));
    }
    orders.push(...dayOrders);

    // Production: doughs per product for the day's orders.
    const need = new Map<string, number>();
    for (const o of dayOrders) for (const l of o.lines) need.set(l.productId, (need.get(l.productId) ?? 0) + l.pallets + (l.boxes ? 1 : 0));
    if (past || isToday)
      for (const [productId, pallets] of need) {
        const p = products.find((x) => x.id === productId)!;
        doughs.push({ id: `${DEMO_PREFIX}${day}|${productId}`, day, productId, doughs: Math.ceil(pallets / (p.palletsPerDough ?? 1)), updatedAt: stamp });
      }
    if (!past && !isToday) continue;

    // Packing: one session from 05:00, a run per product, detector tests every two hours.
    const team = [pick(packers), pick(packers)].filter((x, i, a) => a.indexOf(x) === i);
    const up = rnd() < 0.8 ? [pick(upstairs)] : [];
    const session: Session = { id: DEMO_LIVE.packSession(day), workerIds: team, throwerIds: up, startedAt: at(day, 5, 0), station: DEMO_LIVE.packStation, updatedAt: stamp };
    sessions.push(session);
    let clock = at(day, 5, 5);
    const cutoff = isToday ? now - 25 * 60_000 : Infinity;
    const productList = [...need.keys()];
    let open: Run | undefined;
    for (const [i, productId] of productList.entries()) {
      const p = products.find((x) => x.id === productId)!;
      const forOrders = dayOrders.filter((o) => o.lines.some((l) => l.productId === productId));
      const order = forOrders[0];
      const line = order.lines.find((l) => l.productId === productId)!;
      const per = line.boxesPerPallet ?? p.boxesPerPallet ?? 20;
      const pallets = forOrders.reduce((s, o) => s + o.lines.find((l) => l.productId === productId)!.pallets, 0);
      const boxes = forOrders.reduce((s, o) => s + o.lines.find((l) => l.productId === productId)!.boxes, 0);
      const run: Run = {
        id: id('r', `${day}-${i}`),
        day,
        station: session.station,
        productId,
        customerId: order.customerId,
        orderId: forOrders.length === 1 ? order.id : undefined,
        boxesPerPallet: line.boxesPerPallet,
        spreadPallets: line.spreadPallets ? line.pallets : undefined,
        targetBoxes: forOrders.length === 1 && !line.spreadPallets ? line.pallets * per + line.boxes : undefined,
        startedAt: clock,
        tests: [{ at: clock + 3 * 60_000, workerIds: team, ferro: true, nonFerro: true, stainless: true }],
        updatedAt: stamp,
      };
      clock += 6 * 60_000;
      const extra = run.targetBoxes !== undefined && rnd() < 0.2 ? 1 + Math.floor(rnd() * 3) : 0;
      // Today's product on the line now (the last one, if all the others are done): half packed so far.
      const live = isToday && (clock + pallets * 9 * 60_000 > cutoff || i === productList.length - 1);
      const palletsNow = live ? Math.max(1, Math.floor(pallets / 2)) : pallets;
      for (let k = 0; k < palletsNow; k++) {
        clock += 7 * 60_000 + Math.floor(rnd() * 5) * 60_000;
        if (clock - run.tests.at(-1)!.at > 110 * 60_000) run.tests.push({ at: clock - 60_000, workerIds: team, ferro: true, nonFerro: true, stainless: true });
        entries.push({ id: id('e', `${run.id}-${k}`), at: Math.min(clock, now - (palletsNow - k) * 3 * 60_000), day, kind: 'pallet', quantity: 1, productId, sessionId: session.id, workerIds: team, throwerIds: up.length ? up : undefined, station: session.station, runId: run.id, boxesOnPallet: run.spreadPallets !== undefined ? per + Math.floor(rnd() * 4) : undefined, updatedAt: stamp });
      }
      if (!live && boxes + extra > 0) {
        clock += 4 * 60_000;
        entries.push({ id: id('e', `${run.id}-b`), at: clock, day, kind: 'box', quantity: boxes + extra, productId, sessionId: session.id, workerIds: team, throwerIds: up.length ? up : undefined, station: session.station, runId: run.id, updatedAt: stamp });
      }
      if (live) {
        // Its latest pallet a few minutes ago, so the station shows as going on.
        const last = entries.at(-1);
        if (last?.runId === run.id) last.at = Math.max(last.at, now - 4 * 60_000);
        if (run.tests.at(-1)!.at < now - 110 * 60_000) run.tests.push({ at: now - 30 * 60_000, workerIds: team, ferro: true, nonFerro: true, stainless: true });
        open = run;
        runs.push(run);
        break;
      }
      clock += 5 * 60_000;
      run.endedAt = clock;
      run.labels = { at: clock, workerIds: team };
      run.cleaned = { at: clock + 2 * 60_000, workerIds: team };
      if (extra) run.surplusBoxes = extra;
      if (extra && (day < addDays(today, -3) || rnd() < 0.3)) run.surplusTaken = { at: clock + 3 * 3600_000, workerIds: loaders.slice(0, 1) };
      clock += 6 * 60_000;
      runs.push(run);
    }
    if (!isToday) session.endedAt = clock + 10 * 60_000;
    else if (!open) session.endedAt = undefined;

    // Half boxes now and then; older ones filled by the next run of the product.
    if (rnd() < 0.35 && productList.length) {
      const productId = pick(productList);
      const filled = !isToday && day < addDays(today, -2);
      halfBoxes.push({ id: id('h', day), productId, quantity: 1 + Math.floor(rnd() * 3), day, at: at(day, 9, 40), station: session.station, workerIds: team, filled: filled ? { at: at(addDays(day, 2), 7, 0), runId: '', workerIds: team } : undefined, updatedAt: stamp });
    }

    // Loading: past days loaded and sent, now and then a box short; today's partly.
    for (const [k, o] of dayOrders.entries()) {
      const loadedToday = isToday && k === 0 && now > at(day, 12, 0);
      if (!past && !loadedToday) {
        if (isToday && k === 1) o.prepared = { at: at(day, 11, 30), workerIds: loaders.slice(0, 2), missing: [] };
        continue;
      }
      const short = rnd() < 0.12 ? o.lines[0] : undefined;
      o.lineChecks = o.lines.map((l) => ({
        productId: l.productId,
        state: short === l ? 'short' : 'ok',
        pallets: short === l ? l.pallets - 1 : l.pallets,
        boxes: short === l ? (products.find((p) => p.id === l.productId)?.boxesPerPallet ?? 20) - 3 + l.boxes : l.boxes,
        missingBoxes: short === l ? 3 : undefined,
        at: at(day, 14, 10),
        workerIds: loaders.slice(0, 2),
      }));
      o.delivered = o.lineChecks.map((x) => ({ productId: x.productId, pallets: x.pallets, boxes: x.boxes }));
      o.shippedAt = at(day, 14, 30);
      o.loadedBy = { workerIds: loaders.slice(0, 2), driverId: driver };
      o.prepared = { at: at(day, 12, 0), workerIds: loaders.slice(0, 1), missing: [] };
      if (short)
        deviations.push({ id: id('d', `load-${o.id}`), day, productId: short.productId, kind: 'loading', loadingKind: 'boxesMissing', orderId: o.id, note: '3 kartonger saknades på sista pallen', at: at(day, 14, 12), workerIds: loaders.slice(0, 2), handled: day < addDays(today, -4) ? { at: at(day, 16, 0) } : undefined, updatedAt: stamp });
    }
  }

  // On a working day, the packing goes on now and the freezer is loading a delivery: the
  // Stationer view, the packing station and Fryslager all show something live.
  if (isoWeekday(today) <= 5) {
    const s = sessions.find((x) => x.id === DEMO_LIVE.packSession(today));
    if (s) s.endedAt = undefined;
    const waiting = orders.filter((o) => o.day === today && !o.shippedAt);
    const loading = waiting[waiting.length - 1];
    if (loading) {
      loading.lineChecks = [{ productId: loading.lines[0].productId, state: 'ok', pallets: loading.lines[0].pallets, boxes: loading.lines[0].boxes, at: now - 6 * 60_000, workerIds: loaders.slice(0, 2) }];
      loading.prepared = { at: now - 50 * 60_000, workerIds: loaders.slice(0, 1), missing: [] };
    }
    sessions.push({ id: DEMO_LIVE.dockSession(today), kind: 'dock', workerIds: loaders.slice(0, 2), driverId: driver, loadingOrderId: loading?.id, startedAt: now - 90 * 60_000, station: DEMO_LIVE.dockStation, updatedAt: stamp });
  }

  // Deviations the managers note: scrapped doughs, a low yield, the station's own.
  const pastDays = [...new Set(runs.map((r) => r.day))].filter((d) => d < today);
  const dayAgo = (k: number) => pastDays[Math.max(0, pastDays.length - k)] ?? today;
  deviations.push(
    { id: id('d', 'scr'), day: dayAgo(4), productId: prod('ost').id, kind: 'scrapped', doughs: 2, remadeOn: dayAgo(3), note: 'Saltet tog slut', at: at(dayAgo(4), 6, 20), updatedAt: stamp },
    { id: id('d', 'low'), day: dayAgo(6), productId: prod('ljus').id, kind: 'lowYield', note: 'Bröden bakade ihop', at: at(dayAgo(6), 8, 45), updatedAt: stamp },
    { id: id('d', 'pack'), day: dayAgo(2), productId: prod('kall').id, kind: 'packing', note: 'Etikettskrivaren stannade, 10 min', at: at(dayAgo(2), 7, 50), runId: runs.find((r) => r.day === dayAgo(2))?.id, workerIds: packers.slice(0, 2), updatedAt: stamp },
    { id: id('d', 'qual'), day: dayAgo(1), productId: prod('vallmo').id, kind: 'quality', note: 'Brända. ca 15 st', at: at(dayAgo(1), 6, 40), runId: runs.find((r) => r.day === dayAgo(1))?.id, workerIds: upstairs.slice(0, 1), updatedAt: stamp },
  );

  // Stock counted in the freezer last Friday.
  const friday = addDays(mondayOf(today), -3);
  const stockCounts: StockCount[] = products.slice(0, 8).map((p, i) => ({ id: id('sc', i), at: at(friday, 15, 0), productId: p.id, pallets: Math.floor(rnd() * 3), boxes: Math.floor(rnd() * 15), workerIds: loaders.slice(0, 1), updatedAt: stamp }));

  // OBS: one asked for (waiting for the managers), one planned.
  const next = addDays(today, isoWeekday(today) >= 5 ? 8 - isoWeekday(today) : 1);
  const obs: ObsRequest[] = [
    { id: id('obs', 1), productId: prod('rosen').id, customerId: c('gn'), pallets: 1, boxes: 0, day: next, requestedAt: now - 40 * 60_000, workerIds: loaders.slice(0, 1), status: 'requested', updatedAt: stamp },
    { id: id('obs', 2), productId: prod('kall').id, customerId: c('gs'), pallets: 0, boxes: 12, day: next, requestedAt: now - 3 * 3600_000, workerIds: loaders.slice(1, 2), status: 'planned', decidedAt: now - 2 * 3600_000, updatedAt: stamp },
  ];

  return { workers, brands, customers, products, sessions, entries, orders, doughs, deviations, stockCounts, runs, obs, halfBoxes };
}
