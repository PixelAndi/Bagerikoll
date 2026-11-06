import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import { todayLocal } from '../days.ts';
import { db, newId } from '../db.ts';
import { deliveredDiffers, deliveredLines } from '../domain/accounting.ts';
import { checkOf, deliveredFromChecks, deliveries, loadLines, loadProgress, shortLoaded, withCheck, type Delivery } from '../domain/dock.ts';
import { orderTotals } from '../domain/office.ts';
import { lineBoxesPerPallet, stackPlan } from '../domain/pallet.ts';
import type { Deviation, Order, Session } from '../domain/types.ts';
import { Field, Modal, Notice, Page } from './common.tsx';
import { Stepper } from './OrderEditor.tsx';
import { PalletBadge } from './PalletIcon.tsx';

// Lastkaj, the loading dock (a tablet in kiosk mode): "Lastas just nu" – the delivery being
// loaded, its customer and pallets big, each product ticked off or reported missing – and below it
// today's deliveries (with any from the last week not loaded yet), each started with "Börja lasta".
// Problems and other deviations go to the managers. The loaders check in like the packers (several at once) and so does the forklift
// driver (one at a time). Every confirmation and deviation carries who was on the dock.

/** How long the dock may take back a "loaded" by itself; later only a manager can. */
const UNDO_MS = 2 * 60 * 1000;
const clock = (at: number) => new Date(at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

export function DockView() {
  const { t, settings } = useApp();
  const session = useLiveQuery(() => (settings.dockSessionId ? db.sessions.get(settings.dockSessionId) : undefined), [settings.dockSessionId]);
  const running = session && !session.endedAt ? session : undefined;
  const today = todayLocal();
  const orders = useLiveQuery(() => db.orders.toArray(), []) ?? [];
  const deviations = useLiveQuery(() => db.deviations.where('day').aboveOrEqual('2000-01-01').toArray(), []) ?? [];
  const list = deliveries(orders, deviations, today);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const loaded = list.filter((d) => d.state === 'loaded');
  const pallets = orderTotals(list.map((d) => d.order)).pallets;
  // What actually went on the trucks (the dock's reported counts).
  const loadedPallets = orderTotals(loaded.map((d) => ({ ...d.order, lines: deliveredLines(d.order) }))).pallets;
  // The delivery being loaded now (until it is finished).
  const loading = running?.loadingOrderId ? orders.find((o) => o.id === running.loadingOrderId && o.shippedAt === undefined && !o.cancelled) : undefined;

  return (
    <Page title={t('dock.title')}>
      <div className="pack-layout">
        <div className="pack-main">
          {loading ? (
            <NowLoading order={loading} session={running!} deviations={deviations} />
          ) : (
            <section className="card dock-idle">
              <strong>{t('dock.nowLoading')}</strong>
              <p className="muted">{running ? t('dock.pickNext') : t('dock.checkInFirst')}</p>
            </section>
          )}
          {!list.length && <p className="muted">{t('dock.none')}</p>}
          {list
            .filter((d) => d.order.id !== loading?.id)
            .map((d) => (
              <DeliveryCard key={d.order.id} delivery={d} session={running} now={now} />
            ))}
        </div>
        <div className="pack-side">
          {running ? <DockCrew session={running} /> : <StartDock />}
          <section className="card">
            <div className="cal-focus-head">
              <strong>{t('dock.today')}</strong>
              <span className="small muted">{new Intl.DateTimeFormat(settings.language === 'sv' ? 'sv-SE' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span>
            </div>
            <div className="cal-numbers">
              <div>
                <strong className="pack-figure">
                  {loaded.length}/{list.length}
                </strong>
                <span className="small muted">{t('dock.deliveriesLoaded')}</span>
              </div>
              <div>
                <strong className="pack-figure">
                  {loadedPallets}/{pallets}
                </strong>
                <span className="small muted">{t('dock.palletsLoaded')}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </Page>
  );
}

/** Check in: the loaders (several) and the forklift driver (one). */
function StartDock() {
  const { t, settings, save } = useApp();
  const { workers } = useCatalog();
  const [loaders, setLoaders] = useState<string[]>([]);
  const [driver, setDriver] = useState<string>();
  const shown = workers.filter((w) => !w.hidden);
  const start = async () => {
    const id = newId();
    await db.sessions.put({ id, kind: 'dock', workerIds: loaders, driverId: driver, startedAt: Date.now(), station: settings.station });
    save({ dockSessionId: id });
  };
  if (!shown.length) return <Notice kind="info">{t('pack.setupFirst')}</Notice>;
  return (
    <section className="card">
      <h2 className="card-title">{t('dock.checkIn')}</h2>
      <p className="small muted">{t('dock.checkInHint')}</p>
      <span className="field-label">{t('dock.loaders')}</span>
      <div className="packer-chips">
        {shown.map((w) => (
          <button
            key={w.id}
            type="button"
            className={`packer-chip ${loaders.includes(w.id) ? 'on' : ''}`}
            aria-pressed={loaders.includes(w.id)}
            onClick={() => {
              setLoaders((l) => (l.includes(w.id) ? l.filter((x) => x !== w.id) : [...l, w.id]));
              if (driver === w.id) setDriver(undefined);
            }}
          >
            {loaders.includes(w.id) ? '✓ ' : '+ '}
            {w.name}
          </button>
        ))}
      </div>
      <span className="field-label">{t('dock.driver')}</span>
      <div className="packer-chips">
        {shown
          .filter((w) => !loaders.includes(w.id))
          .map((w) => (
            <button key={w.id} type="button" className={`packer-chip driver-chip ${driver === w.id ? 'on' : ''}`} aria-pressed={driver === w.id} onClick={() => setDriver(driver === w.id ? undefined : w.id)}>
              {driver === w.id ? '🚜 ' : ''}
              {w.name}
            </button>
          ))}
      </div>
      <button type="button" className="button button-primary pack-start" disabled={!loaders.length && !driver} onClick={() => void start()}>
        {t('dock.start')}
      </button>
    </section>
  );
}

/** Who is on the dock now: loaders added or taken off, the driver changed – each with "Är du säker?". */
function DockCrew({ session }: { session: Session }) {
  const { t, save } = useApp();
  const { workers } = useCatalog();
  const [asking, setAsking] = useState<{ kind: 'addLoader' | 'removeLoader' | 'driver' | 'noDriver' | 'end'; id?: string } | null>(null);
  const name = (id?: string) => workers.find((w) => w.id === id)?.name ?? '?';
  const loaders = session.workerIds;
  const others = workers.filter((w) => !w.hidden && !loaders.includes(w.id) && w.id !== session.driverId);
  const apply = async () => {
    if (!asking) return;
    const { kind, id } = asking;
    if (kind === 'end') {
      await db.sessions.update(session.id, { endedAt: Date.now() });
      save({ dockSessionId: undefined });
    } else if (kind === 'addLoader' && id) await db.sessions.update(session.id, { workerIds: [...loaders, id], driverId: session.driverId === id ? undefined : session.driverId });
    else if (kind === 'removeLoader' && id) await db.sessions.update(session.id, { workerIds: loaders.filter((x) => x !== id) });
    else if (kind === 'driver' && id) await db.sessions.update(session.id, { driverId: id, workerIds: loaders.filter((x) => x !== id) });
    else if (kind === 'noDriver') await db.sessions.update(session.id, { driverId: undefined });
    setAsking(null);
  };
  // Someone must stay checked in: the last one can't leave (finish the session instead).
  const lastOne = asking && ((asking.kind === 'removeLoader' && loaders.length === 1 && !session.driverId) || (asking.kind === 'noDriver' && !loaders.length));
  const question = !asking
    ? ''
    : asking.kind === 'end'
      ? t('dock.endConfirm')
      : asking.kind === 'addLoader'
        ? t('dock.askAddLoader', { name: name(asking.id) })
        : asking.kind === 'removeLoader'
          ? t('dock.askRemoveLoader', { name: name(asking.id) })
          : asking.kind === 'driver'
            ? session.driverId
              ? t('dock.askSwapDriver', { name: name(asking.id), old: name(session.driverId) })
              : t('dock.askDriver', { name: name(asking.id) })
            : t('dock.askNoDriver', { name: name(session.driverId) });
  return (
    <section className="card pack-packers">
      <div className="cal-focus-head">
        <strong>{t('dock.onDock')}</strong>
        <button type="button" className="link-button small" onClick={() => setAsking({ kind: 'end' })}>
          {t('pack.end')}
        </button>
      </div>
      <span className="field-label">{t('dock.driver')}</span>
      <div className="packer-chips">
        {session.driverId ? (
          <button type="button" className="packer-chip driver-chip on" onClick={() => setAsking({ kind: 'noDriver' })}>
            🚜 {name(session.driverId)}
          </button>
        ) : (
          <span className="small muted">{t('dock.noDriver')}</span>
        )}
      </div>
      <span className="field-label">{t('dock.loaders')}</span>
      <div className="packer-chips">
        {loaders.map((id) => (
          <button key={id} type="button" className="packer-chip on" onClick={() => setAsking({ kind: 'removeLoader', id })}>
            ✓ {name(id)}
          </button>
        ))}
        {!loaders.length && <span className="small muted">{t('dock.noLoaders')}</span>}
      </div>
      {others.length > 0 && (
        <>
          <span className="small muted">{t('dock.othersHint')}</span>
          {others.map((w) => (
            <div key={w.id} className="dock-other">
              <span>{w.name}</span>
              <span>
                <button type="button" className="button button-small" onClick={() => setAsking({ kind: 'addLoader', id: w.id })}>
                  + {t('dock.asLoader')}
                </button>
                <button type="button" className="button button-small" onClick={() => setAsking({ kind: 'driver', id: w.id })}>
                  🚜 {t('dock.asDriver')}
                </button>
              </span>
            </div>
          ))}
        </>
      )}
      {asking && (
        <Modal title={t('pack.sure')} onClose={() => setAsking(null)}>
          <p className="pack-pad-show">{lastOne ? t('dock.lastOne') : question}</p>
          <div className="confirm-buttons">
            <button type="button" className="button confirm-no" onClick={() => setAsking(null)}>
              {t('pack.no')}
            </button>
            <button type="button" className="button button-primary confirm-yes" onClick={() => (lastOne ? setAsking({ kind: 'end' }) : void apply())}>
              {lastOne ? t('pack.end') : t('dock.yes')}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** One delivery: who it is for, its pallets per product (with the pallet's height), and what to do. */
function DeliveryCard({ delivery, session, now }: { delivery: Delivery; session?: Session; now: number }) {
  const { t } = useApp();
  const { customers, products, workers } = useCatalog();
  const { order, state, late, deviations } = delivery;
  const [reporting, setReporting] = useState(false);
  const customer = customers.find((c) => c.id === order.customerId);
  const total = orderTotals([order]);
  const crew = session ? [...session.workerIds, ...(session.driverId ? [session.driverId] : [])] : [];
  const names = (ids: string[]) => ids.map((id) => workers.find((w) => w.id === id)?.name ?? '?').join(', ');
  const progress = loadProgress(order);
  const canUndo = state === 'loaded' && order.shippedAt !== undefined && now - order.shippedAt < UNDO_MS && order.loadedBy;
  return (
    <article className={`card dock-delivery dock-${state}`}>
      <div className="cal-focus-head">
        <span>
          <strong className="dock-customer">{customer?.name ?? '?'}</strong>
          {order.orderNumber && <span className="muted"> · #{order.orderNumber}</span>}
          {late && <span className="cal-chip cal-chip-warn"> {t('dock.late', { day: order.day })}</span>}
        </span>
        <strong className="dock-total">{t('office.orderPallets', { pallets: total.pallets })}</strong>
      </div>
      <ul className="dock-lines">
        {loadLines(order).map((l) => {
          const p = products.find((x) => x.id === l.productId);
          const per = lineBoxesPerPallet(l, p);
          return (
            <li key={l.productId}>
              <span>
                <strong>{p?.name ?? '?'}</strong>
                {p?.code && <span className="muted"> {p.code}</span>}
                <br />
                <span className="dock-qty">{qtyText(t, l.pallets, l.boxes)}</span>
              </span>
              {per && l.pallets > 0 && <PalletBadge boxes={per} perLayer={p?.boxesPerLayer} label={t('pallet.short', { boxes: per })} unit={0.38} />}
            </li>
          );
        })}
      </ul>
      {order.note && <p className="small muted">{order.note}</p>}
      {deviations.map((x) => (
        <p key={x.id} className={`small ${x.handled ? 'muted' : 'warn-text'}`}>
          ⚠ {clock(x.at)} {t(`dock.kind.${x.loadingKind ?? 'other'}`)}: {x.note} – {names(x.workerIds ?? [])}
          {x.handled && ` · ${t('dock.handled')}`}
        </p>
      ))}
      {state === 'loaded' ? (
        <div className="dock-done">
          <span>
            ✓ {t('dock.loadedAt', { time: clock(order.shippedAt!) })}
            {order.loadedBy && (
              <span className="small muted">
                {' '}
                · {names(order.loadedBy.workerIds)}
                {order.loadedBy.driverId && ` · 🚜 ${names([order.loadedBy.driverId])}`}
              </span>
            )}
            {deliveredDiffers(order) && (
              <span className="small warn-text">
                <br />
                {t('dock.deliveredOther', { pallets: orderTotals([{ ...order, lines: deliveredLines(order) }]).pallets })}
              </span>
            )}
          </span>
          {canUndo && (
            <button type="button" className="link-button" onClick={() => void db.orders.update(order.id, { shippedAt: undefined, loadedBy: undefined, delivered: undefined })}>
              {t('pack.undo')}
            </button>
          )}
        </div>
      ) : (
        <div className="dock-buttons">
          <button type="button" className="button" disabled={!session} onClick={() => setReporting(true)}>
            ⚠ {t('run.deviation')}
          </button>
          <button type="button" className="button button-primary" disabled={!session} onClick={() => session && void db.sessions.update(session.id, { loadingOrderId: order.id })}>
            ▶ {progress.checked ? t('dock.continueLoading', { checked: progress.checked, total: progress.total }) : t('dock.startLoading')}
          </button>
        </div>
      )}
      {!session && state !== 'loaded' && <p className="small muted">{t('dock.checkInFirst')}</p>}
      {reporting && session && <LoadingDeviation order={order} crew={crew} onClose={() => setReporting(false)} />}
    </article>
  );
}

const qtyText = (t: ReturnType<typeof useApp>['t'], pallets: number, boxes: number) =>
  [pallets ? t('prod.nPallets', { n: pallets }) : '', boxes ? t('prod.nBoxes', { n: boxes }) : ''].filter(Boolean).join(' + ') || t('dock.nothing');

/**
 * Lastas just nu: the delivery on its way onto the truck – the customer and pallets big, and each
 * product to tick off as loaded, or report as not delivered or with boxes missing. "Klar" (when
 * every product is checked) marks the delivery loaded with what was actually loaded; each problem
 * goes to the managers as a deviation.
 */
function NowLoading({ order, session, deviations }: { order: Order; session: Session; deviations: Deviation[] }) {
  const { t } = useApp();
  const { customers, products, workers } = useCatalog();
  const [problemFor, setProblemFor] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const customer = customers.find((c) => c.id === order.customerId);
  const total = orderTotals([order]);
  const progress = loadProgress(order);
  const crew = [...session.workerIds, ...(session.driverId ? [session.driverId] : [])];
  const names = (ids: string[]) => ids.map((id) => workers.find((w) => w.id === id)?.name ?? '?').join(', ');
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '?';
  const own = deviations.filter((x) => !x.removed && x.orderId === order.id && x.kind === 'loading');
  const tick = (productId: string) => {
    const l = order.lines.find((x) => x.productId === productId)!;
    return db.orders.update(order.id, { lineChecks: withCheck(order, { productId, state: 'ok', pallets: l.pallets, boxes: l.boxes, at: Date.now(), workerIds: crew }) });
  };
  const untick = (productId: string) => db.orders.update(order.id, { lineChecks: (order.lineChecks ?? []).filter((c) => c.productId !== productId) });
  const finish = async () => {
    const at = Date.now();
    // Each problem becomes a deviation for the managers.
    for (const c of progress.problems)
      await db.deviations.put({
        id: newId(),
        day: todayLocal(),
        productId: c.productId,
        kind: 'loading',
        loadingKind: c.state === 'notDelivered' ? 'notDelivered' : 'boxesMissing',
        note: [productName(c.productId), c.state === 'short' ? t('dock.boxesMissingN', { n: c.missingBoxes ?? 0 }) : t('dock.notDeliveredShort'), c.note].filter(Boolean).join(' – '),
        at,
        orderId: order.id,
        workerIds: crew,
      });
    await db.orders.update(order.id, { shippedAt: at, loadedBy: { workerIds: session.workerIds, driverId: session.driverId }, delivered: deliveredFromChecks(order) });
    await db.sessions.update(session.id, { loadingOrderId: undefined });
    setFinishing(false);
    navigator.vibrate?.(80);
  };
  return (
    <section className="card dock-now">
      <div className="dock-now-band">
        <span>▶ {t('dock.nowLoading')}</span>
        <span>{t('dock.progress', { checked: progress.checked, total: progress.total })}</span>
      </div>
      <div className="dock-now-head">
        <span>
          <strong className="dock-now-customer">{customer?.name ?? '?'}</strong>
          {order.orderNumber && <span className="dock-now-number"> #{order.orderNumber}</span>}
        </span>
        <span className="dock-now-total">
          <strong>{total.pallets}</strong> {t('dock.palletsWord')}
          {total.boxes > 0 && <span className="small"> + {t('prod.nBoxes', { n: total.boxes })}</span>}
        </span>
      </div>
      <ul className="dock-now-lines">
        {loadLines(order).map((l) => {
          const p = products.find((x) => x.id === l.productId);
          const per = lineBoxesPerPallet(l, p);
          const c = checkOf(order, l.productId);
          return (
            <li key={l.productId} className={c ? (c.state === 'ok' ? 'dock-line-ok' : 'dock-line-problem') : ''}>
              <span className="dock-now-product">
                <strong>{p?.name ?? '?'}</strong>
                {p?.code && <span className="muted"> {p.code}</span>}
                <span className="dock-now-qty">{qtyText(t, l.pallets, l.boxes)}</span>
                {c && c.state !== 'ok' && (
                  <span className="dock-now-problem">
                    ⚠ {c.state === 'notDelivered' ? t('dock.notDeliveredShort') : t('dock.shortLine', { n: c.missingBoxes ?? 0, loaded: qtyText(t, c.pallets, c.boxes) })}
                    {c.note && ` – ${c.note}`}
                  </span>
                )}
              </span>
              {per && l.pallets > 0 ? <StackBadge pallets={l.pallets} per={per} perLayer={p?.boxesPerLayer} /> : <span />}
              <span className="dock-now-actions">
                {c ? (
                  <>
                    <span className={`dock-now-state ${c.state === 'ok' ? 'ok' : 'warn-text'}`}>{c.state === 'ok' ? `✓ ${t('dock.lineLoaded')}` : `⚠ ${t('dock.lineProblem')}`}</span>
                    <button type="button" className="link-button small" onClick={() => void untick(l.productId)}>
                      {t('admin.edit')}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="button dock-line-yes" onClick={() => void tick(l.productId)}>
                      ✓ {t('dock.lineLoaded')}
                    </button>
                    <button type="button" className="button dock-line-no" onClick={() => setProblemFor(l.productId)}>
                      ⚠ {t('dock.lineMissing')}
                    </button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {own.map((x) => (
        <p key={x.id} className="small warn-text">
          ⚠ {clock(x.at)} {t(`dock.kind.${x.loadingKind ?? 'other'}`)}: {x.note}
        </p>
      ))}
      <div className="dock-now-foot">
        <button type="button" className="button" onClick={() => setReporting(true)}>
          ⚠ {t('dock.otherDeviation')}
        </button>
        <button type="button" className="button" onClick={() => void db.sessions.update(session.id, { loadingOrderId: undefined })}>
          {t('dock.pause')}
        </button>
        <button type="button" className="button button-primary dock-finish" disabled={!progress.done} onClick={() => setFinishing(true)}>
          ✓ {progress.done ? t('dock.finish') : t('dock.finishLeft', { n: progress.total - progress.checked })}
        </button>
      </div>
      {problemFor && <LineProblem order={order} productId={problemFor} crew={crew} onClose={() => setProblemFor(null)} />}
      {reporting && <LoadingDeviation order={order} crew={crew} onClose={() => setReporting(false)} />}
      {finishing && (
        <Modal title={t('pack.sure')} onClose={() => setFinishing(false)}>
          <p className="pack-pad-show">
            {progress.problems.length
              ? t('dock.finishAskProblems', { customer: customer?.name ?? '?', pallets: orderTotals([{ ...order, lines: deliveredFromChecks(order).map((d) => ({ ...d })) }]).pallets })
              : t('dock.askLoad', { customer: customer?.name ?? '?', pallets: total.pallets })}
          </p>
          {progress.problems.length > 0 && (
            <ul className="cal-check-list">
              {progress.problems.map((c) => (
                <li key={c.productId} className="warn-text">
                  ⚠ {productName(c.productId)}: {c.state === 'notDelivered' ? t('dock.notDeliveredShort') : t('dock.shortLine', { n: c.missingBoxes ?? 0, loaded: qtyText(t, c.pallets, c.boxes) })}
                </li>
              ))}
            </ul>
          )}
          <p className="small muted">{t('dock.signedBy', { names: names(crew) })}</p>
          <div className="confirm-buttons">
            <button type="button" className="button confirm-no" onClick={() => setFinishing(false)}>
              {t('pack.no')}
            </button>
            <button type="button" className="button button-primary confirm-yes" onClick={() => void finish()}>
              {t('dock.yesLoaded')}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** A product that didn't go on the truck as ordered: not at all, or with boxes missing. */
function LineProblem({ order, productId, crew, onClose }: { order: Order; productId: string; crew: string[]; onClose: () => void }) {
  const { t } = useApp();
  const { products } = useCatalog();
  const line = order.lines.find((l) => l.productId === productId)!;
  const product = products.find((p) => p.id === productId);
  const [kind, setKind] = useState<'notDelivered' | 'short'>();
  const [missing, setMissing] = useState(1);
  const [note, setNote] = useState('');
  const loaded = shortLoaded(line, product, missing);
  const saveIt = async () => {
    if (!kind) return;
    const check =
      kind === 'notDelivered'
        ? { productId, state: kind, pallets: 0, boxes: 0, note: note.trim() || undefined, at: Date.now(), workerIds: crew }
        : { productId, state: kind, pallets: loaded.pallets, boxes: loaded.boxes, missingBoxes: missing, note: note.trim() || undefined, at: Date.now(), workerIds: crew };
    await db.orders.update(order.id, { lineChecks: withCheck(order, check) });
    onClose();
  };
  return (
    <Modal title={t('dock.problemTitle', { product: product?.name ?? '?' })} onClose={onClose}>
      <p className="small muted">{t('dock.orderedLine', { what: qtyText(t, line.pallets, line.boxes) })}</p>
      <div className="dev-kinds">
        <button type="button" className={`pack-name ${kind === 'notDelivered' ? 'on' : ''}`} aria-pressed={kind === 'notDelivered'} onClick={() => setKind('notDelivered')}>
          {t('dock.kind.notDelivered')}
          <span className="small muted">{t('dock.notDeliveredHint')}</span>
        </button>
        <button type="button" className={`pack-name ${kind === 'short' ? 'on' : ''}`} aria-pressed={kind === 'short'} onClick={() => setKind('short')}>
          {t('dock.kind.boxesMissing')}
          <span className="small muted">{t('dock.boxesMissingHint')}</span>
        </button>
      </div>
      {kind === 'short' && (
        <div className="field">
          <span className="field-label">{t('dock.howManyMissing')}</span>
          <Stepper value={missing} label={t('dock.howManyMissing')} onChange={(n) => setMissing(Math.max(1, n))} />
          <span className="field-hint">
            <strong>{t('dock.loadedWillBe', { what: qtyText(t, loaded.pallets, loaded.boxes) })}</strong>
          </span>
        </div>
      )}
      <Field label={t('prod.note')}>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <button type="button" className="button button-primary pack-start" disabled={!kind} onClick={() => void saveIt()}>
        {t('admin.save')}
      </button>
    </Modal>
  );
}

const KINDS = ['count', 'damaged', 'missing', 'other'] as const;

function LoadingDeviation({ order, crew, onClose }: { order: Order; crew: string[]; onClose: () => void }) {
  const { t } = useApp();
  const [kind, setKind] = useState<(typeof KINDS)[number]>();
  const [note, setNote] = useState('');
  const ok = kind && (kind !== 'other' || note.trim());
  const saveIt = async () => {
    if (!ok) return;
    const x: Deviation = { id: newId(), day: todayLocal(), productId: '', kind: 'loading', loadingKind: kind, note: note.trim(), at: Date.now(), orderId: order.id, workerIds: crew };
    await db.deviations.put(x);
    onClose();
  };
  return (
    <Modal title={t('dock.deviationTitle')} onClose={onClose}>
      <p className="small muted">{t('dock.deviationHint')}</p>
      <div className="dev-kinds">
        {KINDS.map((k) => (
          <button key={k} type="button" className={`pack-name ${kind === k ? 'on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t(`dock.kind.${k}`)}
          </button>
        ))}
      </div>
      <Field label={t('prod.note')} hint={kind === 'other' ? t('prod.noteNeeded') : t('dock.noteHint')}>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <button type="button" className="button button-primary pack-start" disabled={!ok} onClick={() => void saveIt()}>
        {t('dock.report')}
      </button>
    </Modal>
  );
}

/** How a product's pallets go on the truck: the picture of a stack of two (or one) and "3 × 2 staplade + 1". */
function StackBadge({ pallets, per, perLayer }: { pallets: number; per: number; perLayer?: number }) {
  const { t } = useApp();
  const plan = stackPlan(pallets, per, perLayer);
  const label = plan.pairs ? [t('pallet.pairs', { n: plan.pairs }), plan.singles ? t('pallet.singles', { n: plan.singles }) : ''].filter(Boolean).join(' + ') : t('pallet.short', { boxes: per });
  return (
    <span className="dock-stack">
      <PalletBadge boxes={per} perLayer={perLayer} stacked={plan.pairs ? 2 : 1} label={label} unit={plan.pairs ? 0.36 : 0.42} />
      {plan.pairs > 0 && <span className="small muted">{t('pallet.short', { boxes: per })}</span>}
    </span>
  );
}
