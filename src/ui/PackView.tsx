import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog, useEntriesOn } from '../data.ts';
import { todayLocal } from '../days.ts';
import { db, newId } from '../db.ts';
import { byProduct, canWorkerUndo, groupByCustomer, sortProducts, total } from '../domain/production.ts';
import { batchRange, canPack, runCount, testPassed, testState } from '../domain/runs.ts';
import type { DetectorTest, Entry, EntryKind, Product, Run } from '../domain/types.ts';
import { href } from '../router.ts';
import { Field, Modal, Notice, Page } from './common.tsx';

// The packing station: who is packing, which product (under its customer), a big pallet button
// and box buttons in steps.
// Every registration is tied to the workers of the session. At a glance: what this session and
// today have packed. A mistake is undone (voided) on the spot, never deleted.

export function PackView() {
  const { t, settings } = useApp();
  const session = useLiveQuery(() => (settings.sessionId ? db.sessions.get(settings.sessionId) : undefined), [settings.sessionId]);
  const running = session && !session.endedAt ? session : undefined;
  return <Page title={t('pack.title')}>{running ? <Packing sessionId={running.id} workerIds={running.workerIds} /> : <StartSession />}</Page>;
}

/** Who is packing: tap the names (or the team's nickname), then start. */
function StartSession() {
  const { t, settings, save, admin } = useApp();
  const { workers, products } = useCatalog();
  const [chosen, setChosen] = useState<string[]>([]);
  const shown = workers.filter((w) => !w.hidden);
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const start = async () => {
    const id = newId();
    await db.sessions.put({ id, workerIds: chosen, startedAt: Date.now(), station: settings.station });
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
      <button type="button" className="button button-primary pack-start" disabled={!chosen.length} onClick={() => void start()}>
        {chosen.length ? t('pack.start', { names: chosen.map((id) => workers.find((w) => w.id === id)?.name).join(', ') }) : t('pack.pickNames')}
      </button>
    </>
  );
}

function Packing({ sessionId, workerIds }: { sessionId: string; workerIds: string[] }) {
  const { t, settings, save } = useApp();
  const { workers, customers, products } = useCatalog();
  const today = todayLocal();
  const todays = useEntriesOn(today);
  const mine = useMemo(() => todays.filter((e) => e.sessionId === sessionId), [todays, sessionId]);
  const stored = useLiveQuery(() => (settings.runId ? db.runs.get(settings.runId) : undefined), [settings.runId]);
  const run = stored && !stored.endedAt ? stored : undefined;
  const runEntries = useLiveQuery(() => (run ? db.entries.where('runId').equals(run.id).toArray() : []), [run?.id]) ?? [];
  const [filter, setFilter] = useState<string>();
  const [boxPad, setBoxPad] = useState(false);
  const [changeWho, setChangeWho] = useState(false);
  const [starting, setStarting] = useState<Product | null>(null);
  const [ending, setEnding] = useState<{ then?: Product } | null>(null);
  const [reporting, setReporting] = useState(false);
  const [palletPause, setPalletPause] = useState(false);
  const lastPallet = useRef(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const names = workerIds.map((id) => workers.find((w) => w.id === id)?.name ?? '?');
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

  const register = async (kind: EntryKind, quantity: number) => {
    if (!run || !product || quantity <= 0 || !canPack(run, Date.now())) return;
    // Pallets are counted one by one: a second tap straight after is taken as a slip, not a pallet.
    if (kind === 'pallet') {
      if (Date.now() - lastPallet.current < PALLET_PAUSE_MS) return;
      lastPallet.current = Date.now();
      setPalletPause(true);
      setTimeout(() => setPalletPause(false), PALLET_PAUSE_MS);
    }
    const e: Entry = { id: newId(), at: Date.now(), day: todayLocal(), kind, quantity, productId: product.id, sessionId, workerIds, station: settings.station, runId: run.id };
    await db.entries.put(e);
    navigator.vibrate?.(kind === 'pallet' ? 80 : 40);
    setNow(Date.now());
  };
  const undo = (e: Entry) => db.entries.update(e.id, { voided: { at: Date.now(), by: 'worker', reason: t('pack.undoReason') } });
  const end = async () => {
    if (!confirm(t('pack.endConfirm'))) return;
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
    <>
      <section className="card pack-who">
        <span>
          <span className="muted small">{t('pack.packing')}</span>
          <strong>{names.join(', ')}</strong>
        </span>
        <span className="pack-who-buttons">
          <button type="button" className="button" onClick={() => setChangeWho(true)}>
            {t('pack.changeWho')}
          </button>
          <button type="button" className="button" onClick={() => void end()}>
            {t('pack.end')}
          </button>
        </span>
      </section>

      {run && product ? (
        <section className="card cal-focus pack-register">
          <RunHead run={run} product={product} entries={runEntries} now={now} />
          {open ? (
            <>
              <button type="button" className={`pack-big pack-pallet ${palletPause ? 'pack-pausing' : ''}`} aria-disabled={palletPause} onClick={() => void register('pallet', 1)}>
                <span className="pack-plus">{palletPause ? '✓' : '+1'}</span>
                {palletPause ? t('pack.palletDone') : t('pack.pallet')}
              </button>
              <div className="pack-box-buttons" role="group" aria-label={t('pack.boxesWord')}>
                {BOX_STEPS.map((n) => (
                  <button key={n} type="button" className="pack-big pack-box" onClick={() => void register('box', n)}>
                    <span className="pack-plus">+{n}</span>
                    {t(n === 1 ? 'pack.box' : 'pack.boxes')}
                  </button>
                ))}
              </div>
              <button type="button" className="button pack-other-boxes" onClick={() => setBoxPad(true)}>
                {t('pack.otherBoxes')}
              </button>
            </>
          ) : (
            <DetectorTestCard run={run} product={product} workerIds={workerIds} now={now} />
          )}
          <div className="pack-run-buttons">
            <button type="button" className="button" onClick={() => setReporting(true)}>
              {t('run.deviation')}
            </button>
            <button type="button" className="button button-primary" onClick={() => setEnding({})}>
              {t('run.end')}
            </button>
          </div>
        </section>
      ) : (
        <section className="card cal-focus">
          <strong className="pack-product-name">{t('run.pickProduct')}</strong>
          <p className="small muted">{t('run.pickProductHint')}</p>
        </section>
      )}

      {last[0] && <LastEntry entry={last[0]} product={products.find((p) => p.id === last[0].productId)} now={now} onUndo={undo} />}

      <h2 className="pack-question">{run ? t('run.changeProduct') : t('run.which')}</h2>
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

      {boxPad && product && <QuantityPad kind="box" product={product} onClose={() => setBoxPad(false)} onDone={(n) => void register('box', n).then(() => setBoxPad(false))} />}
      {changeWho && <ChangeWho sessionId={sessionId} workerIds={workerIds} onClose={() => setChangeWho(false)} />}
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
    </>
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
  return (
    <>
      <div className="cal-focus-head">
        <strong className="pack-product-name">{product.name}</strong>
        <span className="small muted">{[product.code, customers.find((x) => x.id === run.customerId)?.name].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="cal-chips">
        <span className="cal-chip">{t('run.since', { time: clock(run.startedAt) })}</span>
        <span className="cal-chip">{t('run.count', { pallets: c.pallets, boxes: c.boxes })}</span>
        <span className={`cal-chip ${range ? '' : 'cal-chip-warn'}`}>{range ? t('run.batch', { range }) : t('run.noBoxesPerPallet')}</span>
        {state.kind === 'ok' && <span className={`cal-chip ${state.soon ? 'cal-chip-warn' : 'cal-chip-ok'}`}>{t(state.soon ? 'run.testSoon' : 'run.testOk', { time: clock(state.dueAt) })}</span>}
      </div>
    </>
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
  const [chosen, setChosen] = useState('');
  // One customer: it is that one (worked out on each render: the customer list may load after the dialog opens).
  const customerId = chosen || (own.length === 1 ? own[0].id : '') || product.customerIds?.[0] || '';
  const setCustomerId = setChosen;
  const start = async () => {
    const id = newId();
    await db.runs.put({ id, day: todayLocal(), station: settings.station, productId: product.id, customerId: customerId || undefined, startedAt: Date.now(), tests: [] });
    save({ runId: id });
    onClose();
  };
  return (
    <Modal title={t('run.startTitle')} onClose={onClose}>
      <p className="pack-pad-show">
        <strong>{product.name}</strong> {product.code && <span className="muted">· {product.code}</span>}
      </p>
      {own.length > 1 && (
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
      {!product.boxesPerPallet && <Notice kind="warn">{t('run.noBoxesPerPalletLong')}</Notice>}
      <p className="small muted">{t('run.startHint')}</p>
      <button type="button" className="button button-primary pack-start" disabled={own.length > 1 && !chosen} onClick={() => void start()}>
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
  const nothing = !c.pallets && !c.boxes && !run.tests.length;
  const finish = async () => {
    const at = Date.now();
    await db.runs.update(run.id, { endedAt: at, labels: { at, workerIds }, cleaned: { at, workerIds } });
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

/** Anyone at the station can add or take off who is packing now; from then on, entries are theirs. */
function ChangeWho({ sessionId, workerIds, onClose }: { sessionId: string; workerIds: string[]; onClose: () => void }) {
  const { t } = useApp();
  const { workers } = useCatalog();
  const [chosen, setChosen] = useState(workerIds);
  const shown = workers.filter((w) => !w.hidden || workerIds.includes(w.id));
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const done = async () => {
    await db.sessions.update(sessionId, { workerIds: chosen });
    onClose();
  };
  return (
    <Modal title={t('pack.changeWho')} onClose={onClose}>
      <p className="small muted">{t('pack.changeWhoHint')}</p>
      <div className="pack-names">
        {shown.map((w) => (
          <button key={w.id} type="button" className={`pack-name ${chosen.includes(w.id) ? 'on' : ''}`} aria-pressed={chosen.includes(w.id)} onClick={() => toggle(w.id)}>
            {chosen.includes(w.id) && <span aria-hidden="true">✓ </span>}
            {w.name}
          </button>
        ))}
      </div>
      <button type="button" className="button button-primary pack-start" disabled={!chosen.length} onClick={() => void done()}>
        {chosen.length ? t('pack.whoDone', { names: chosen.map((id) => workers.find((w) => w.id === id)?.name).join(', ') }) : t('pack.pickNames')}
      </button>
    </Modal>
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
  const what = t(entry.kind === 'pallet' ? 'pack.nPallets' : 'pack.nBoxes', { n: entry.quantity });
  return (
    <section className={`card pack-last ${entry.voided ? 'pack-last-voided' : ''}`} aria-live="polite">
      <span>
        <strong>{entry.voided ? t('pack.undone') : '✓'} {what} · {product?.name ?? '?'}</strong>
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
        {new Date(entry.at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} · {t(entry.kind === 'pallet' ? 'pack.nPallets' : 'pack.nBoxes', { n: entry.quantity })} · {product?.name ?? '?'}
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
function QuantityPad({ kind, product, onClose, onDone }: { kind: EntryKind; product: Product; onClose: () => void; onDone: (n: number) => void }) {
  const { t } = useApp();
  const [text, setText] = useState('');
  const n = Number(text || '0');
  const press = (k: string) => setText((s) => (k === '⌫' ? s.slice(0, -1) : (s + k).replace(/^0+/, '').slice(0, 3)));
  return (
    <Modal title={t(kind === 'pallet' ? 'pack.otherPallets' : 'pack.otherBoxes')} onClose={onClose}>
      <p className="pack-pad-show">
        <strong>{text || '0'}</strong> {t(kind === 'pallet' ? 'pack.palletsWord' : 'pack.boxesWord')} · {product.name}
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
        {t('pack.register', { n, what: t(kind === 'pallet' ? 'pack.palletsWord' : 'pack.boxesWord') })}
      </button>
    </Modal>
  );
}
