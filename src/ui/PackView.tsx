import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog, useEntriesOn } from '../data.ts';
import { todayLocal } from '../days.ts';
import { db, newId } from '../db.ts';
import { byProduct, canWorkerUndo, groupByCustomer, sortProducts, total } from '../domain/production.ts';
import { lineBoxesPerPallet, palletLayers } from '../domain/pallet.ts';
import { batchRange, canPack, runCount, runTarget, testPassed, testState } from '../domain/runs.ts';
import { halfCount, openHalves } from '../domain/halves.ts';
import type { DetectorTest, Entry, EntryKind, HalfBox, Product, Run } from '../domain/types.ts';
import { href } from '../router.ts';
import { Field, Modal, Notice, Page } from './common.tsx';
import { PalletBadge, PalletIcon } from './PalletIcon.tsx';
import { NeedsName } from './DeviceName.tsx';

// The packing station: who is packing, which product (under its customer), a big pallet button
// and box buttons in steps.
// Every registration is tied to the workers of the session. At a glance: what this session and
// today have packed. A mistake is undone (voided) on the spot, never deleted.

export function PackView() {
  const { t, settings } = useApp();
  const session = useLiveQuery(() => (settings.sessionId ? db.sessions.get(settings.sessionId) : undefined), [settings.sessionId]);
  const running = session && !session.endedAt ? session : undefined;
  return <Page title={t('pack.title')}>{running ? <Packing sessionId={running.id} workerIds={running.workerIds} throwerIds={running.throwerIds ?? []} /> : <StartSession />}</Page>;
}

/** Who is packing: tap the names (or the team's nickname), then start. */
function StartSession() {
  const { t, settings, save, admin } = useApp();
  const { workers, products } = useCatalog();
  const [chosen, setChosen] = useState<string[]>([]);
  const [upstairs, setUpstairs] = useState<string[]>([]);
  const shown = workers.filter((w) => !w.hidden);
  const toggle = (id: string) => {
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
    setUpstairs((u) => u.filter((x) => x !== id));
  };
  const toggleUp = (id: string) => setUpstairs((u) => (u.includes(id) ? u.filter((x) => x !== id) : [...u, id]));
  const start = async () => {
    const id = newId();
    await db.sessions.put({ id, workerIds: chosen, throwerIds: upstairs.filter((x) => !chosen.includes(x)), startedAt: Date.now(), station: settings.station });
    save({ sessionId: id });
  };
  if (!shown.length || !products.some((p) => !p.hidden))
    return (
      <Notice kind="info">
        {t('pack.setupFirst')} {!settings.locked && <a href={href({ name: 'admin' })}>{admin ? t('nav.admin') : t('pack.toAdmin')} ›</a>}
      </Notice>
    );
  return (
    <>
      <h2 className="pack-question">{t('pack.who')}</h2>
      <div className="pack-names">
        {shown.map((w) => (
          <button key={w.id} type="button" className={`pack-name ${chosen.includes(w.id) ? 'on' : ''}`} aria-pressed={chosen.includes(w.id)} onClick={() => toggle(w.id)}>
            {chosen.includes(w.id) && <span aria-hidden="true">✓ </span>}
            {w.name}
          </button>
        ))}
      </div>
      {chosen.length > 0 && (
        <>
          <h2 className="pack-question">{t('upstairs.who')}</h2>
          <p className="small muted">{t('upstairs.whoHint')}</p>
          <div className="pack-names">
            {shown
              .filter((w) => !chosen.includes(w.id))
              .map((w) => (
                <button key={w.id} type="button" className={`pack-name pack-name-up ${upstairs.includes(w.id) ? 'on' : ''}`} aria-pressed={upstairs.includes(w.id)} onClick={() => toggleUp(w.id)}>
                  {upstairs.includes(w.id) && <span aria-hidden="true">✓ </span>}
                  {w.name}
                </button>
              ))}
          </div>
        </>
      )}
      {!settings.station && <NeedsName />}
      <button type="button" className="button button-primary pack-start" disabled={!chosen.length || !settings.station} onClick={() => void start()}>
        {chosen.length ? t('pack.start', { names: chosen.map((id) => workers.find((w) => w.id === id)?.name).join(', ') }) : t('pack.pickNames')}
      </button>
    </>
  );
}

function Packing({ sessionId, workerIds, throwerIds }: { sessionId: string; workerIds: string[]; throwerIds: string[] }) {
  const { t, settings, save } = useApp();
  const { customers, products } = useCatalog();
  const today = todayLocal();
  const todays = useEntriesOn(today);
  const mine = useMemo(() => todays.filter((e) => e.sessionId === sessionId), [todays, sessionId]);
  const stored = useLiveQuery(() => (settings.runId ? db.runs.get(settings.runId) : undefined), [settings.runId]);
  const run = stored && !stored.endedAt ? stored : undefined;
  const runEntries = useLiveQuery(() => (run ? db.entries.where('runId').equals(run.id).toArray() : []), [run?.id]) ?? [];
  const [filter, setFilter] = useState<string>();
  const [boxPad, setBoxPad] = useState(false);
  const [palletPad, setPalletPad] = useState(false);
  const [halfPad, setHalfPad] = useState(false);
  const halves = useLiveQuery(() => (run ? db.halfBoxes.where('productId').equals(run.productId).toArray() : []), [run?.productId]) ?? [];
  const [starting, setStarting] = useState<Product | null>(null);
  const [ending, setEnding] = useState<{ then?: Product } | null>(null);
  const [reporting, setReporting] = useState(false);
  const [palletPause, setPalletPause] = useState(false);
  // "Dra av" mode: the pallet and box buttons take away from the count instead of adding.
  const [subtracting, setSubtracting] = useState(false);
  const lastPallet = useRef(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  // Products under the customer they are made for (brand is for accounting only).
  const shownCustomers = customers.filter((c) => !c.hidden);
  const byCustomer = shownCustomers.length > 0;
  const groups = byCustomer ? groupByCustomer(products, customers, filter) : [{ products: sortProducts(products) }];
  const product = run ? products.find((p) => p.id === run.productId) : undefined;
  const perProduct = byProduct(mine);
  const sessionTotal = total(mine);
  const dayTotal = total(todays);
  const last = [...mine].sort((a, b) => b.at - a.at);
  const open = run ? canPack(run, now) : false;

  const register = async (kind: EntryKind, quantity: number, boxesOnPallet?: number) => {
    if (!run || !product || quantity <= 0 || !canPack(run, Date.now())) return;
    // Spread on a set number of pallets: each pallet's boxes are counted first.
    if (kind === 'pallet' && run.spreadPallets !== undefined && boxesOnPallet === undefined) return setPalletPad(true);
    // Pallets are counted one by one: a second tap straight after is taken as a slip, not a pallet.
    if (kind === 'pallet') {
      if (Date.now() - lastPallet.current < PALLET_PAUSE_MS) return;
      lastPallet.current = Date.now();
      setPalletPause(true);
      setTimeout(() => setPalletPause(false), PALLET_PAUSE_MS);
    }
    const e: Entry = { id: newId(), at: Date.now(), day: todayLocal(), kind, quantity, boxesOnPallet, productId: product.id, sessionId, workerIds, throwerIds: throwerIds.length ? throwerIds : undefined, station: settings.station, runId: run.id };
    await db.entries.put(e);
    navigator.vibrate?.(kind === 'pallet' ? 80 : 40);
    setNow(Date.now());
  };
  // Take pallets or boxes off this run's count (a miscount). Recorded as a correction entry, never
  // below zero; in spread mode a pallet is removed with the boxes the last one had.
  const subtract = async (kind: EntryKind, n: number) => {
    if (!run || !product || n <= 0 || !canPack(run, Date.now())) return;
    const c = runCount(run, runEntries, product);
    let quantity: number;
    let boxesOnPallet: number | undefined;
    if (kind === 'pallet') {
      if (c.pallets <= 0) return;
      quantity = -1;
      if (run.spreadPallets !== undefined) {
        if (Date.now() - lastPallet.current < PALLET_PAUSE_MS) return;
        lastPallet.current = Date.now();
        setPalletPause(true);
        setTimeout(() => setPalletPause(false), PALLET_PAUSE_MS);
        const lastAdded = [...runEntries].filter((e) => e.runId === run.id && !e.voided && e.kind === 'pallet' && e.quantity > 0 && e.boxesOnPallet !== undefined).sort((a, b) => b.at - a.at)[0];
        boxesOnPallet = lastAdded?.boxesOnPallet;
      }
    } else {
      quantity = -Math.min(n, c.boxes); // never take the loose-box count below zero
      if (quantity === 0) return;
    }
    await db.entries.put({ id: newId(), at: Date.now(), day: todayLocal(), kind, quantity, boxesOnPallet, productId: product.id, sessionId, workerIds, throwerIds: throwerIds.length ? throwerIds : undefined, station: settings.station, runId: run.id });
    navigator.vibrate?.(30);
    setNow(Date.now());
  };
  const addHalves = async (n: number) => {
    if (!run || n <= 0) return;
    await db.halfBoxes.put({ id: newId(), productId: run.productId, quantity: n, day: todayLocal(), at: Date.now(), runId: run.id, station: settings.station, workerIds });
    setHalfPad(false);
  };
  // Half boxes from earlier, filled with this production: they count as boxes of this run.
  const fillHalves = async (list: HalfBox[]) => {
    if (!run || !list.length || !canPack(run, Date.now())) return;
    const at = Date.now();
    await db.transaction('rw', db.entries, db.halfBoxes, async () => {
      await db.entries.put({ id: newId(), at, day: todayLocal(), kind: 'box', quantity: halfCount(list), productId: run.productId, sessionId, workerIds, throwerIds: throwerIds.length ? throwerIds : undefined, station: settings.station, runId: run.id });
      for (const h of list) await db.halfBoxes.update(h.id, { filled: { at, runId: run.id, workerIds } });
    });
  };
  const undo = (e: Entry) => db.entries.update(e.id, { voided: { at: Date.now(), by: 'worker', reason: t('pack.undoReason') } });
  const end = async () => {
    await db.sessions.update(sessionId, { endedAt: Date.now() });
    save({ sessionId: undefined });
  };
  // Tapping a product: start a run with it – after the run on the line is finished.
  const pick = (p: Product) => {
    if (run?.productId === p.id) return;
    if (run) setEnding({ then: p });
    else setStarting(p);
  };

  return (
    <div className="pack-layout">
      {/* Left (landscape): what is packed now – the buttons, and what was just registered, never scrolled away. */}
      <div className="pack-main">
        {run && product ? (
          <section className="card cal-focus pack-register">
            <RunHead run={run} product={product} entries={runEntries} now={now} />
            {open ? (
              <div className={subtracting ? 'pack-subtracting' : ''}>
                {/* Add, or take away from the count (a miscount). */}
                <div className="pack-mode" role="group" aria-label={t('pack.mode')}>
                  <button type="button" className={`pack-mode-btn ${!subtracting ? 'on' : ''}`} aria-pressed={!subtracting} onClick={() => setSubtracting(false)}>
                    ＋ {t('pack.modeAdd')}
                  </button>
                  <button type="button" className={`pack-mode-btn pack-mode-sub ${subtracting ? 'on' : ''}`} aria-pressed={subtracting} onClick={() => setSubtracting(true)}>
                    － {t('pack.modeSubtract')}
                  </button>
                </div>
                <button type="button" className={`pack-big pack-pallet ${palletPause ? 'pack-pausing' : ''}`} aria-disabled={palletPause} onClick={() => void (subtracting ? subtract('pallet', 1) : register('pallet', 1))}>
                  <span className="pack-plus">{palletPause ? '✓' : subtracting ? '−1' : '+1'}</span>
                  {palletPause ? t('pack.palletDone') : t('pack.pallet')}
                </button>
                <div className="pack-box-buttons" role="group" aria-label={t('pack.boxesWord')}>
                  {BOX_STEPS.map((n) => (
                    <button key={n} type="button" className="pack-big pack-box" onClick={() => void (subtracting ? subtract('box', n) : register('box', n))}>
                      <span className="pack-plus">{subtracting ? '−' : '+'}{n}</span>
                      {t(n === 1 ? 'pack.box' : 'pack.boxes')}
                    </button>
                  ))}
                </div>
                <div className="pack-extra-buttons">
                  <button type="button" className="button pack-other-boxes" onClick={() => setBoxPad(true)}>
                    {subtracting ? t('pack.otherBoxesSub') : t('pack.otherBoxes')}
                  </button>
                  {!subtracting && (
                    <button type="button" className="button pack-other-boxes pack-half-button" onClick={() => setHalfPad(true)}>
                      ½ {t('half.button')}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <DetectorTestCard run={run} product={product} workerIds={workerIds} now={now} />
            )}
          </section>
        ) : (
          <section className="card cal-focus">
            <strong className="pack-product-name">{t('run.pickProduct')}</strong>
            <p className="small muted">{t('run.pickProductHint')}</p>
          </section>
        )}
        {run && product && <HalvesCard run={run} product={product} halves={halves} open={open} now={now} onFill={(l) => void fillHalves(l)} />}
        {last[0] && <LastEntry entry={last[0]} product={products.find((p) => p.id === last[0].productId)} now={now} onUndo={undo} />}
      </div>

      {/* Right (landscape): who is packing, the run's other actions, changing product, totals. */}
      <div className="pack-side">
        <Packers sessionId={sessionId} workerIds={workerIds} throwerIds={throwerIds} onEnd={() => void end()} />
        <UpstairsLink throwerIds={throwerIds} />

        {run && (
          <div className="pack-run-buttons">
            <button type="button" className="button" onClick={() => setReporting(true)}>
              {t('run.deviation')}
            </button>
            <button type="button" className="button button-primary" onClick={() => setEnding({})}>
              {t('run.end')}
            </button>
          </div>
        )}

        <section className="card pack-choose">
          <h2 className="card-title">{run ? t('run.changeProduct') : t('run.which')}</h2>
          {byCustomer && (
            <div className="cal-chips pack-brands" role="group" aria-label={t('pack.customer')}>
              <button type="button" className={`cal-chip ${!filter ? 'pack-chip-on' : ''}`} onClick={() => setFilter(undefined)}>
                {t('pack.allBrands')}
              </button>
              {shownCustomers.map((c) => (
                <button key={c.id} type="button" className={`cal-chip ${filter === c.id ? 'pack-chip-on' : ''}`} onClick={() => setFilter(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
          {groups.map((g, i) => (
            <div key={g.customer?.id ?? `none-${i}`}>
              {byCustomer && <h3 className="pack-group">{g.customer?.name ?? t('pack.noCustomer')}</h3>}
              <div className="pack-products">
                {g.products.map((p) => (
                  <ProductTile key={p.id} product={p} on={p.id === run?.productId} count={perProduct.get(p.id)} onPick={() => pick(p)} />
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="cal-numbers">
            <div>
              <strong className="pack-figure">{sessionTotal.pallets}</strong>
              <span className="small muted">{t('pack.sessionPallets')}</span>
            </div>
            <div>
              <strong className="pack-figure">{sessionTotal.boxes}</strong>
              <span className="small muted">{t('pack.sessionBoxes')}</span>
            </div>
          </div>
          <p className="small muted">{t('pack.todayLine', { pallets: dayTotal.pallets, boxes: dayTotal.boxes, station: settings.station })}</p>
          <a className="button" href={href({ name: 'protocol' })}>
            {t('protocol.open')}
          </a>
        </section>

        {last.length > 1 && (
          <section className="card">
            <h2 className="card-title">{t('pack.recent')}</h2>
            <ul className="pack-recent">
              {last.slice(1, 6).map((e) => (
                <RecentRow key={e.id} entry={e} product={products.find((p) => p.id === e.productId)} now={now} onUndo={undo} />
              ))}
            </ul>
          </section>
        )}
      </div>

      {boxPad && product && <QuantityPad kind="box" product={product} title={subtracting ? t('pack.otherBoxesSub') : undefined} onClose={() => setBoxPad(false)} onDone={(n) => void (subtracting ? subtract('box', n) : register('box', n)).then(() => setBoxPad(false))} />}
      {palletPad && product && run && (
        <QuantityPad
          kind="pallet"
          product={product}
          title={t('spread.palletTitle', { n: runCount(run, runEntries, product).pallets + 1, of: run.spreadPallets ?? 0 })}
          hint={t('spread.palletHint')}
          unit={t('pack.boxesWord')}
          onClose={() => setPalletPad(false)}
          onDone={(n) => {
            setPalletPad(false);
            void register('pallet', 1, n);
          }}
        />
      )}
      {halfPad && product && <QuantityPad kind="box" product={product} title={t('half.title')} hint={t('half.hint')} unit={t('half.word')} onClose={() => setHalfPad(false)} onDone={(n) => void addHalves(n)} />}
      {starting && <StartRun product={starting} onClose={() => setStarting(null)} />}
      {ending && run && product && (
        <EndRun
          run={run}
          product={product}
          entries={runEntries}
          workerIds={workerIds}
          onClose={() => setEnding(null)}
          onEnded={() => {
            const next = ending.then;
            setEnding(null);
            if (next) setStarting(next);
          }}
        />
      )}
      {reporting && run && <PackDeviation run={run} workerIds={workerIds} onClose={() => setReporting(false)} />}
    </div>
  );
}

const clock = (at: number) => new Date(at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

/** The run on the line: product, customer, box numbers so far, and when the detector is next tested. */
function RunHead({ run, product, entries, now }: { run: Run; product: Product; entries: Entry[]; now: number }) {
  const { t } = useApp();
  const { customers } = useCatalog();
  const c = runCount(run, entries, product);
  const state = testState(run, now);
  const range = batchRange(c.totalBoxes);
  const target = runTarget(run, c);
  const per = run.spreadPallets !== undefined ? undefined : (run.boxesPerPallet ?? product.boxesPerPallet);
  return (
    <div className="run-head">
      <div className="run-head-text">
      <div className="cal-focus-head">
        <strong className="pack-product-name">{product.name}</strong>
        <span className="small muted">{[product.code, customers.find((x) => x.id === run.customerId)?.name].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="cal-chips">
        <span className="cal-chip">{t('run.since', { time: clock(run.startedAt) })}</span>
        <span className="cal-chip">{t('run.count', { pallets: c.pallets, boxes: c.boxes })}</span>
        <span className={`cal-chip ${range ? '' : 'cal-chip-warn'}`}>{range ? t('run.batch', { range }) : t('run.noBoxesPerPallet')}</span>
        {state.kind === 'ok' && <span className={`cal-chip ${state.soon ? 'cal-chip-warn' : 'cal-chip-ok'}`}>{t(state.soon ? 'run.testSoon' : 'run.testOk', { time: clock(state.dueAt) })}</span>}
        {target?.kind === 'boxes' && (target.extra > 0 ? <span className="cal-chip cal-chip-warn">{t('target.extra', { n: target.extra })}</span> : <span className="cal-chip">{t('target.left', { n: target.left, of: target.target })}</span>)}
      </div>
      {target?.kind === 'spread' && <p className="spread-order">{t('spread.instruction', { n: target.pallets, left: target.left })}</p>}
      </div>
      {/* How high to stack: the boxes per pallet for this order, as a picture. */}
      {per ? (
        <div className={`run-pallet ${run.boxesPerPallet && run.boxesPerPallet !== product.boxesPerPallet ? 'run-pallet-special' : ''}`}>
          <PalletIcon boxes={per} perLayer={product.boxesPerLayer} unit={0.62} title={t('pallet.label', { boxes: per, layers: palletLayers(per, product.boxesPerLayer).layers })} />
          <span>
            <strong className="run-pallet-n">{per}</strong> {t('pallet.perPallet')}
            <br />
            <span className="small">{t('pallet.layers', { layers: palletLayers(per, product.boxesPerLayer).layers })}</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** The metal detector test: each test piece run through, found (passed) or not. Packing waits for it. */
function DetectorTestCard({ run, product, workerIds, now }: { run: Run; product: Product; workerIds: string[]; now: number }) {
  const { t } = useApp();
  const state = testState(run, now);
  const [result, setResult] = useState<Partial<Record<TestPiece, boolean>>>({});
  const done = TEST_PIECES.every((k) => result[k] !== undefined);
  const lastPassed = [...run.tests].reverse().find(testPassed);
  const saveIt = async () => {
    if (!done) return;
    const test: DetectorTest = { at: Date.now(), workerIds, ferro: !!result.ferro, nonFerro: !!result.nonFerro, stainless: !!result.stainless };
    if (!testPassed(test)) {
      if (!confirm(t('test.failConfirm'))) return;
      await db.deviations.put({
        id: newId(),
        day: todayLocal(),
        productId: product.id,
        kind: 'detector',
        note: t('test.failNote', { pieces: TEST_PIECES.filter((k) => !result[k]).map((k) => t(`test.${k}`)).join(', ') }),
        at: test.at,
        runId: run.id,
        workerIds,
      });
    }
    await db.runs.update(run.id, { tests: [...run.tests, test] });
    setResult({});
  };
  return (
    <div className={`test-card ${state.kind === 'failed' ? 'test-failed' : ''}`}>
      <strong className="test-title">
        {state.kind === 'needed' ? t('test.needed') : state.kind === 'overdue' ? t('test.overdue') : t('test.failedTitle')}
      </strong>
      {state.kind === 'failed' && (
        <p className="test-stop">{t('test.stop', { time: lastPassed ? clock(lastPassed.at) : t('test.runStart') })}</p>
      )}
      <p className="small muted">{t('test.hint')}</p>
      {TEST_PIECES.map((k) => (
        <div key={k} className="test-row">
          <strong>{t(`test.${k}`)}</strong>
          <span className="test-choices">
            <button type="button" className={`test-choice ${result[k] === true ? 'on-ok' : ''}`} aria-pressed={result[k] === true} onClick={() => setResult({ ...result, [k]: true })}>
              ✓ {t('test.pass')}
            </button>
            <button type="button" className={`test-choice ${result[k] === false ? 'on-bad' : ''}`} aria-pressed={result[k] === false} onClick={() => setResult({ ...result, [k]: false })}>
              ✗ {t('test.fail')}
            </button>
          </span>
        </div>
      ))}
      <button type="button" className="button button-primary pack-start" disabled={!done} onClick={() => void saveIt()}>
        {t('test.save')}
      </button>
    </div>
  );
}

type TestPiece = 'ferro' | 'nonFerro' | 'stainless';
const TEST_PIECES: TestPiece[] = ['ferro', 'nonFerro', 'stainless'];

/** Start a run: the product (and its customer, if it has more than one). */
function StartRun({ product, onClose }: { product: Product; onClose: () => void }) {
  const { t, settings, save } = useApp();
  const { customers } = useCatalog();
  const own = customers.filter((c) => product.customerIds?.includes(c.id));
  // Today's orders with this product: packing for one of them takes its customer and its boxes per pallet.
  const today = todayLocal();
  const todays = (useLiveQuery(() => db.orders.where('day').equals(today).toArray(), [today]) ?? []).filter((o) => !o.cancelled && o.lines.some((l) => l.productId === product.id && l.pallets + l.boxes > 0));
  const [orderId, setOrderId] = useState<string>();
  const chosenOrder = todays.find((o) => o.id === orderId) ?? (todays.length === 1 && orderId === undefined ? todays[0] : undefined);
  const [chosen, setChosen] = useState('');
  // One customer: it is that one (worked out on each render: the customer list may load after the dialog opens).
  const customerId = chosen || (own.length === 1 ? own[0].id : '') || product.customerIds?.[0] || '';
  const setCustomerId = setChosen;
  const start = async () => {
    const id = newId();
    const line = chosenOrder?.lines.find((l) => l.productId === product.id);
    // What earlier runs packed for the same order and product: this run packs what is left.
    let target: Pick<Run, 'spreadPallets' | 'targetBoxes'> = {};
    if (chosenOrder && line) {
      const earlier = await db.runs.filter((r) => r.orderId === chosenOrder.id && r.productId === product.id && !r.cancelled).toArray();
      const ids = new Set(earlier.map((r) => r.id));
      const packed = earlier.length ? await db.entries.filter((e) => !!e.runId && ids.has(e.runId)).toArray() : [];
      const counts = earlier.map((r) => runCount(r, packed, product));
      const per = lineBoxesPerPallet(line, product);
      if (line.spreadPallets) target = { spreadPallets: Math.max(0, line.pallets - counts.reduce((n, c) => n + c.pallets, 0)) };
      else if (per) target = { targetBoxes: Math.max(0, line.pallets * per + line.boxes - counts.reduce((n, c) => n + (c.totalBoxes ?? 0), 0)) };
    }
    await db.runs.put({
      ...target,
      id,
      day: todayLocal(),
      station: settings.station,
      productId: product.id,
      customerId: chosenOrder?.customerId ?? (customerId || undefined),
      orderId: chosenOrder?.id,
      boxesPerPallet: line ? lineBoxesPerPallet(line, product) : undefined,
      startedAt: Date.now(),
      tests: [],
    });
    save({ runId: id });
    onClose();
  };
  return (
    <Modal title={t('run.startTitle')} onClose={onClose}>
      <p className="pack-pad-show">
        <strong>{product.name}</strong> {product.code && <span className="muted">· {product.code}</span>}
      </p>
      {todays.length > 0 && (
        <div className="field">
          <span className="field-label">{t('run.forOrder')}</span>
          <div className="run-orders">
            {todays.map((o) => {
              const line = o.lines.find((l) => l.productId === product.id)!;
              const per = lineBoxesPerPallet(line, product);
              return (
                <button key={o.id} type="button" className={`pack-name run-order ${chosenOrder?.id === o.id ? 'on' : ''}`} aria-pressed={chosenOrder?.id === o.id} onClick={() => setOrderId(o.id)}>
                  <span>
                    {customers.find((c) => c.id === o.customerId)?.name ?? '?'}
                    {o.orderNumber && <span className="muted"> #{o.orderNumber}</span>}
                    <br />
                    <span className="small">{t('prod.nPallets', { n: line.pallets })}</span>
                    {line.spreadPallets && (
                      <>
                        <br />
                        <strong className="small spread-order-inline">{t('spread.short', { n: line.pallets })}</strong>
                      </>
                    )}
                  </span>
                  {per && !line.spreadPallets && <PalletBadge boxes={per} perLayer={product.boxesPerLayer} label={t('pallet.short', { boxes: per })} unit={0.4} />}
                </button>
              );
            })}
            <button type="button" className={`pack-name run-order ${orderId === '' || (!chosenOrder && todays.length > 1) ? 'on' : ''}`} onClick={() => setOrderId('')}>
              {t('run.noOrder')}
            </button>
          </div>
        </div>
      )}
      {own.length > 1 && !chosenOrder && (
        <div className="field">
          <span className="field-label">{t('run.forCustomer')}</span>
          <div className="pack-names">
            {own.map((c) => (
              <button key={c.id} type="button" className={`pack-name ${customerId === c.id ? 'on' : ''}`} aria-pressed={customerId === c.id} onClick={() => setCustomerId(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {!product.boxesPerPallet && !(chosenOrder && lineBoxesPerPallet(chosenOrder.lines.find((l) => l.productId === product.id)!, product)) && <Notice kind="warn">{t('run.noBoxesPerPalletLong')}</Notice>}
      <p className="small muted">{t('run.startHint')}</p>
      <button type="button" className="button button-primary pack-start" disabled={(own.length > 1 && !chosen && !chosenOrder) || (todays.length > 1 && orderId === undefined)} onClick={() => void start()}>
        {t('run.start', { product: product.name })}
      </button>
    </Modal>
  );
}

/** Finish a run: all boxes labelled (checked last), the machine cleaned before the next product. */
function EndRun({ run, product, entries, workerIds, onClose, onEnded }: { run: Run; product: Product; entries: Entry[]; workerIds: string[]; onClose: () => void; onEnded: () => void }) {
  const { t, save } = useApp();
  const [labels, setLabels] = useState(false);
  const [cleaned, setCleaned] = useState(false);
  const c = runCount(run, entries, product);
  const target = runTarget(run, c);
  const nothing = !c.pallets && !c.boxes && !run.tests.length;
  const finish = async () => {
    const at = Date.now();
    await db.runs.update(run.id, { endedAt: at, labels: { at, workerIds }, cleaned: { at, workerIds }, surplusBoxes: target?.kind === 'boxes' && target.extra ? target.extra : undefined });
    save({ runId: undefined });
    onEnded();
  };
  const cancel = async () => {
    await db.runs.update(run.id, { endedAt: Date.now(), cancelled: true });
    save({ runId: undefined });
    onEnded();
  };
  return (
    <Modal title={t('run.endTitle', { product: product.name })} onClose={onClose}>
      <p className="pack-pad-show">
        <strong>{t('run.count', { pallets: c.pallets, boxes: c.boxes })}</strong>
        {batchRange(c.totalBoxes) && <span className="muted"> · {t('run.batch', { range: batchRange(c.totalBoxes)! })}</span>}
      </p>
      {target?.kind === 'boxes' && target.extra > 0 && <Notice kind="warn">{t('target.extraEnd', { n: target.extra })}</Notice>}
      {target?.kind === 'boxes' && target.left > 0 && <Notice kind="info">{t('target.shortEnd', { n: target.left })}</Notice>}
      {target?.kind === 'spread' && c.pallets !== target.pallets && <Notice kind="info">{t('spread.endDiffers', { n: c.pallets, of: target.pallets })}</Notice>}
      <label className="check-row big-check">
        <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />
        <span>
          <strong>{t('run.labels')}</strong>
          <br />
          <span className="small muted">{t('run.labelsHint')}</span>
        </span>
      </label>
      <label className="check-row big-check">
        <input type="checkbox" checked={cleaned} onChange={(e) => setCleaned(e.target.checked)} />
        <span>
          <strong>{t('run.cleaned')}</strong>
          <br />
          <span className="small muted">{t('run.cleanedHint')}</span>
        </span>
      </label>
      <button type="button" className="button button-primary pack-start" disabled={!labels || !cleaned} onClick={() => void finish()}>
        {t('run.endButton')}
      </button>
      {nothing && (
        <button type="button" className="link-button" onClick={() => void cancel()}>
          {t('run.cancel')}
        </button>
      )}
    </Modal>
  );
}

/** Something to note at the packing: tied to the run (the product being packed) and the time. */
function PackDeviation({ run, workerIds, onClose }: { run: Run; workerIds: string[]; onClose: () => void }) {
  const { t } = useApp();
  const [note, setNote] = useState('');
  const saveIt = async () => {
    if (!note.trim()) return;
    await db.deviations.put({ id: newId(), day: todayLocal(), productId: run.productId, kind: 'packing', note: note.trim(), at: Date.now(), runId: run.id, workerIds });
    onClose();
  };
  return (
    <Modal title={t('run.deviation')} onClose={onClose}>
      <p className="small muted">{t('run.deviationHint')}</p>
      <Field label={t('prod.note')}>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <button type="button" className="button button-primary pack-start" disabled={!note.trim()} onClick={() => void saveIt()}>
        {t('admin.save')}
      </button>
    </Modal>
  );
}

/** Boxes go in steps; pallets one at a time. */
const BOX_STEPS = [1, 5, 10];
/** After a pallet, the pallet button rests this long (a double tap isn't two pallets). */
const PALLET_PAUSE_MS = 1500;

/**
 * Who is packing: everyone's name, the active ones highlighted. Anyone can make a name active or
 * inactive – one tap, then "Är du säker?". Several can be active at once; what is registered is
 * on all the active ones. The last active packer can't be taken off (finish the session instead).
 */
function Packers({ sessionId, workerIds, throwerIds, onEnd }: { sessionId: string; workerIds: string[]; throwerIds: string[]; onEnd: () => void }) {
  const { t } = useApp();
  const { workers } = useCatalog();
  const [asking, setAsking] = useState<{ id: string; on: boolean } | null>(null);
  const [ending, setEnding] = useState(false);
  const active = workerIds.map((id) => workers.find((w) => w.id === id)).filter((w): w is NonNullable<typeof w> => !!w);
  const inactive = workers.filter((w) => !w.hidden && !workerIds.includes(w.id));
  const name = (id: string) => workers.find((w) => w.id === id)?.name ?? '?';
  const apply = async () => {
    if (!asking) return;
    const next = asking.on ? [...workerIds, asking.id] : workerIds.filter((x) => x !== asking.id);
    // Someone who comes down to pack is no longer upstairs.
    if (next.length) await db.sessions.update(sessionId, { workerIds: next, throwerIds: throwerIds.filter((x) => x !== asking.id) });
    setAsking(null);
  };
  const lastOne = asking && !asking.on && workerIds.length === 1;
  return (
    <section className="card pack-packers">
      <div className="cal-focus-head">
        <strong>{t('pack.packing')}</strong>
        <button type="button" className="link-button small" onClick={() => setEnding(true)}>
          {t('pack.end')}
        </button>
      </div>
      <div className="packer-chips" role="group" aria-label={t('pack.packing')}>
        {active.map((w) => (
          <button key={w.id} type="button" className="packer-chip on" aria-pressed="true" onClick={() => setAsking({ id: w.id, on: false })}>
            ✓ {w.name}
          </button>
        ))}
      </div>
      {inactive.length > 0 && (
        <>
          <span className="small muted">{t('pack.notPacking')}</span>
          <div className="packer-chips">
            {inactive.map((w) => (
              <button key={w.id} type="button" className="packer-chip" aria-pressed="false" onClick={() => setAsking({ id: w.id, on: true })}>
                + {w.name}
              </button>
            ))}
          </div>
        </>
      )}
      {ending && (
        <Modal title={t('pack.sure')} onClose={() => setEnding(false)}>
          <p className="pack-pad-show">{t('pack.endConfirm')}</p>
          <div className="confirm-buttons">
            <button type="button" className="button confirm-no" onClick={() => setEnding(false)}>
              {t('pack.no')}
            </button>
            <button
              type="button"
              className="button button-primary confirm-yes"
              onClick={() => {
                setEnding(false);
                onEnd();
              }}
            >
              {t('pack.endYes')}
            </button>
          </div>
        </Modal>
      )}
      {asking && (
        <Modal title={t('pack.sure')} onClose={() => setAsking(null)}>
          {lastOne ? (
            <>
              <p className="pack-pad-show">{t('pack.lastPacker', { name: name(asking.id) })}</p>
              <div className="confirm-buttons">
                <button type="button" className="button confirm-no" onClick={() => setAsking(null)}>
                  {t('pack.keep')}
                </button>
                <button
                  type="button"
                  className="button button-primary confirm-yes"
                  onClick={() => {
                    setAsking(null);
                    setEnding(true);
                  }}
                >
                  {t('pack.end')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="pack-pad-show">
                <strong>{name(asking.id)}</strong> {t(asking.on ? 'pack.makeActive' : 'pack.makeInactive')}
              </p>
              <p className="small muted">{t('pack.changeWhoHint')}</p>
              <div className="confirm-buttons">
                <button type="button" className="button confirm-no" onClick={() => setAsking(null)}>
                  {t('pack.no')}
                </button>
                <button type="button" className="button button-primary confirm-yes" onClick={() => void apply()}>
                  {t(asking.on ? 'pack.yesAdd' : 'pack.yesRemove')}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}

/**
 * Upstairs: who moves the bread from the trays onto the belt and checks its quality. Optional –
 * when no one is there, the packers do both. Changed like the packers: one tap, "Är du säker?".
 */
export function Upstairs({ sessionId, workerIds, throwerIds }: { sessionId: string; workerIds: string[]; throwerIds: string[] }) {
  const { t } = useApp();
  const { workers } = useCatalog();
  const [asking, setAsking] = useState<{ id: string; on: boolean } | null>(null);
  const active = throwerIds.map((id) => workers.find((w) => w.id === id)).filter((w): w is NonNullable<typeof w> => !!w);
  const others = workers.filter((w) => !w.hidden && !throwerIds.includes(w.id) && !workerIds.includes(w.id));
  const name = (id: string) => workers.find((w) => w.id === id)?.name ?? '?';
  const apply = async () => {
    if (!asking) return;
    await db.sessions.update(sessionId, { throwerIds: asking.on ? [...throwerIds, asking.id] : throwerIds.filter((x) => x !== asking.id) });
    setAsking(null);
  };
  return (
    <section className="card pack-packers pack-upstairs">
      <div className="cal-focus-head">
        <strong>{t('upstairs.title')}</strong>
        <span className="small muted">{t('upstairs.role')}</span>
      </div>
      {active.length ? (
        <div className="packer-chips" role="group" aria-label={t('upstairs.title')}>
          {active.map((w) => (
            <button key={w.id} type="button" className="packer-chip on" aria-pressed="true" onClick={() => setAsking({ id: w.id, on: false })}>
              ✓ {w.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="small muted">{t('upstairs.none')}</p>
      )}
      {others.length > 0 && (
        <details className="upstairs-more" open={!active.length}>
          <summary className="small">{t(active.length ? 'upstairs.addMore' : 'upstairs.pick')}</summary>
          <div className="packer-chips">
            {others.map((w) => (
              <button key={w.id} type="button" className="packer-chip" aria-pressed="false" onClick={() => setAsking({ id: w.id, on: true })}>
                + {w.name}
              </button>
            ))}
          </div>
        </details>
      )}
      {asking && (
        <Modal title={t('pack.sure')} onClose={() => setAsking(null)}>
          <p className="pack-pad-show">
            <strong>{name(asking.id)}</strong> {t(asking.on ? 'upstairs.makeActive' : 'upstairs.makeInactive')}
          </p>
          <p className="small muted">{t('upstairs.changeHint')}</p>
          <div className="confirm-buttons">
            <button type="button" className="button confirm-no" onClick={() => setAsking(null)}>
              {t('pack.no')}
            </button>
            <button type="button" className="button button-primary confirm-yes" onClick={() => void apply()}>
              {t(asking.on ? 'pack.yesAdd' : 'pack.yesRemove')}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** On the packing page: who is upstairs, and the way to the Uppe tab where it is changed. */
function UpstairsLink({ throwerIds }: { throwerIds: string[] }) {
  const { t } = useApp();
  const { workers } = useCatalog();
  const names = throwerIds.map((id) => workers.find((w) => w.id === id)?.name ?? '?');
  return (
    <a className="card upstairs-link" href={href({ name: 'upstairs' })}>
      <span>
        <span className="small muted">{t('upstairs.title')}</span>
        <br />
        <strong>{names.length ? names.join(', ') : t('upstairs.noneShort')}</strong>
      </span>
      <span className="upstairs-link-go">{t('upstairs.open')} ›</span>
    </a>
  );
}

/**
 * Half boxes: those registered in this run (undo for 2 minutes), and those waiting from earlier
 * productions of the product – filled now, they count as boxes of this run.
 */
function HalvesCard({ run, product, halves, open, now, onFill }: { run: Run; product: Product; halves: HalfBox[]; open: boolean; now: number; onFill: (list: HalfBox[]) => void }) {
  const { t } = useApp();
  const waiting = openHalves(halves).filter((h) => h.runId !== run.id);
  const mine = openHalves(halves).filter((h) => h.runId === run.id);
  if (!waiting.length && !mine.length) return null;
  const day = (d: string) => new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  return (
    <section className="card cal-check halves-card">
      {waiting.length > 0 && (
        <>
          <strong>{t('half.waiting', { n: halfCount(waiting), product: product.name })}</strong>
          <p className="small muted">{t('half.waitingFrom', { days: [...new Set(waiting.map((h) => day(h.day)))].join(', ') })}</p>
          <button type="button" className="button button-primary" disabled={!open} onClick={() => onFill(waiting)}>
            {t('half.fill', { n: halfCount(waiting) })}
          </button>
        </>
      )}
      {mine.length > 0 && (
        <p className="small">
          {t('half.thisRun', { n: halfCount(mine) })}{' '}
          {mine
            .filter((h) => now - h.at < 2 * 60 * 1000)
            .map((h) => (
              <button key={h.id} type="button" className="link-button" onClick={() => void db.halfBoxes.update(h.id, { voided: { at: Date.now(), by: 'worker' } })}>
                {t('pack.undo')} ({h.quantity})
              </button>
            ))}
        </p>
      )}
    </section>
  );
}

function ProductTile({ product, on, count, onPick }: { product: Product; on: boolean; count?: { pallets: number; boxes: number }; onPick: () => void }) {
  const { t } = useApp();
  return (
    <button type="button" className={`pack-product ${on ? 'on' : ''}`} aria-pressed={on} onClick={onPick}>
      <strong>{product.name}</strong>
      {product.code && <span className="small muted">{product.code}</span>}
      <span className="pack-product-count small">{count && (count.pallets || count.boxes) ? t('pack.tileCount', { pallets: count.pallets, boxes: count.boxes }) : ' '}</span>
    </button>
  );
}

/** What was just registered, big, so a wrong tap is seen at once – with the way to undo it. */
function LastEntry({ entry, product, now, onUndo }: { entry: Entry; product?: Product; now: number; onUndo: (e: Entry) => void }) {
  const { t } = useApp();
  const sub = entry.quantity < 0;
  const what = t(entry.kind === 'pallet' ? 'pack.nPallets' : 'pack.nBoxes', { n: Math.abs(entry.quantity) });
  return (
    <section className={`card pack-last ${entry.voided ? 'pack-last-voided' : ''} ${sub ? 'pack-last-sub' : ''}`} aria-live="polite">
      <span>
        <strong>{entry.voided ? t('pack.undone') : sub ? '−' : '✓'} {what} · {product?.name ?? '?'}{sub && !entry.voided ? ` · ${t('pack.subtracted')}` : ''}</strong>
        <span className="small muted">{new Date(entry.at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}</span>
      </span>
      {canWorkerUndo(entry, now) && (
        <button type="button" className="button" onClick={() => onUndo(entry)}>
          {t('pack.undo')}
        </button>
      )}
    </section>
  );
}

function RecentRow({ entry, product, now, onUndo }: { entry: Entry; product?: Product; now: number; onUndo: (e: Entry) => void }) {
  const { t } = useApp();
  return (
    <li className={entry.voided ? 'pack-voided' : ''}>
      <span>
        {new Date(entry.at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} · {entry.quantity < 0 ? '−' : ''}{t(entry.kind === 'pallet' ? 'pack.nPallets' : 'pack.nBoxes', { n: Math.abs(entry.quantity) })} · {product?.name ?? '?'}
        {entry.quantity < 0 && !entry.voided && ` · ${t('pack.subtracted')}`}
        {entry.voided && ` · ${t('pack.undone')}`}
      </span>
      {canWorkerUndo(entry, now) && (
        <button type="button" className="link-button" onClick={() => onUndo(entry)}>
          {t('pack.undo')}
        </button>
      )}
    </li>
  );
}

/** Another number than one: a big number pad, the result shown before it is saved. */
function QuantityPad({ kind, product, title, hint, unit, onClose, onDone }: { kind: EntryKind; product: Product; title?: string; hint?: string; unit?: string; onClose: () => void; onDone: (n: number) => void }) {
  const { t } = useApp();
  const [text, setText] = useState('');
  const n = Number(text || '0');
  const press = (k: string) => setText((s) => (k === '⌫' ? s.slice(0, -1) : (s + k).replace(/^0+/, '').slice(0, 3)));
  return (
    <Modal title={title ?? t(kind === 'pallet' ? 'pack.otherPallets' : 'pack.otherBoxes')} onClose={onClose}>
      {hint && <p className="small muted">{hint}</p>}
      <p className="pack-pad-show">
        <strong>{text || '0'}</strong> {unit ?? t(kind === 'pallet' ? 'pack.palletsWord' : 'pack.boxesWord')} · {product.name}
      </p>
      <div className="pack-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
          k ? (
            <button key={i} type="button" className="button" onClick={() => press(k)}>
              {k}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      <button type="button" className="button button-primary pack-start" disabled={n <= 0} onClick={() => onDone(n)}>
        {t('pack.register', { n, what: unit ?? t(kind === 'pallet' ? 'pack.palletsWord' : 'pack.boxesWord') })}
      </button>
    </Modal>
  );
}
