import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import { todayLocal } from '../days.ts';
import { db, newId } from '../db.ts';
import { deliveredDiffers, deliveredLines } from '../domain/accounting.ts';
import { deliveries, type Delivery } from '../domain/dock.ts';
import { orderTotals } from '../domain/office.ts';
import { lineBoxesPerPallet } from '../domain/pallet.ts';
import type { Deviation, Order, Session } from '../domain/types.ts';
import { Field, Modal, Notice, Page } from './common.tsx';
import { Stepper } from './OrderEditor.tsx';
import { PalletBadge } from './PalletIcon.tsx';

// Lastkaj, the loading dock (a tablet that can be locked to it): today's deliveries – with any
// from the last week not loaded yet – to be confirmed loaded, or a deviation reported to the
// managers. The loaders check in like the packers (several at once) and so does the forklift
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
  const loadedPallets = orderTotals(loaded.map((d) => d.order)).pallets;

  return (
    <Page title={t('dock.title')}>
      <div className="pack-layout">
        <div className="pack-main">
          <section className="card cal-focus">
            <div className="cal-focus-head">
              <strong>{t('dock.today')}</strong>
              <span className="small muted">{t('dock.todayDate', { date: new Intl.DateTimeFormat(settings.language === 'sv' ? 'sv-SE' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()) })}</span>
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
          {!list.length && <p className="muted">{t('dock.none')}</p>}
          {list.map((d) => (
            <DeliveryCard key={d.order.id} delivery={d} session={running} now={now} />
          ))}
        </div>
        <div className="pack-side">{running ? <DockCrew session={running} /> : <StartDock />}</div>
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
  const [confirming, setConfirming] = useState(false);
  // The quantities loaded: the ordered ones unless the dock changes them.
  const ordered = order.lines.filter((l) => l.pallets || l.boxes);
  const [qty, setQty] = useState<{ productId: string; pallets: number; boxes: number }[]>([]);
  const startConfirm = () => {
    setQty(ordered.map((l) => ({ productId: l.productId, pallets: l.pallets, boxes: l.boxes })));
    setConfirming(true);
  };
  const differs = qty.some((q) => {
    const o = ordered.find((l) => l.productId === q.productId);
    return !o || o.pallets !== q.pallets || o.boxes !== q.boxes;
  });
  const qtyTotal = qty.reduce((s, q) => s + q.pallets, 0);
  const [reporting, setReporting] = useState(false);
  const customer = customers.find((c) => c.id === order.customerId);
  const total = orderTotals([order]);
  const crew = session ? [...session.workerIds, ...(session.driverId ? [session.driverId] : [])] : [];
  const names = (ids: string[]) => ids.map((id) => workers.find((w) => w.id === id)?.name ?? '?').join(', ');
  const load = async () => {
    if (!session) return;
    await db.orders.update(order.id, { shippedAt: Date.now(), loadedBy: { workerIds: session.workerIds, driverId: session.driverId }, delivered: qty });
    setConfirming(false);
    navigator.vibrate?.(60);
  };
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
        {order.lines
          .filter((l) => l.pallets || l.boxes)
          .map((l) => {
            const p = products.find((x) => x.id === l.productId);
            const per = lineBoxesPerPallet(l, p);
            return (
              <li key={l.productId}>
                <span>
                  <strong>{p?.name ?? '?'}</strong>
                  {p?.code && <span className="muted"> {p.code}</span>}
                  <br />
                  <span className="dock-qty">
                    {[l.pallets ? t('prod.nPallets', { n: l.pallets }) : '', l.boxes ? t('prod.nBoxes', { n: l.boxes }) : ''].filter(Boolean).join(' + ')}
                  </span>
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
          <button type="button" className="button button-primary" disabled={!session} onClick={startConfirm}>
            ✓ {t('dock.load')}
          </button>
        </div>
      )}
      {!session && state !== 'loaded' && <p className="small muted">{t('dock.checkInFirst')}</p>}
      {confirming && (
        <Modal title={t('pack.sure')} onClose={() => setConfirming(false)}>
          <p className="pack-pad-show">{t(differs ? 'dock.askLoadOther' : 'dock.askLoad', { customer: customer?.name ?? '?', pallets: differs ? qtyTotal : total.pallets })}</p>
          <p className="small muted">{t('dock.qtyHint')}</p>
          <ul className="product-rows dock-qty-rows">
            {qty.map((q, i) => {
              const o = ordered.find((l) => l.productId === q.productId)!;
              const p = products.find((x) => x.id === q.productId);
              const changed = o.pallets !== q.pallets || o.boxes !== q.boxes;
              return (
                <li key={q.productId} className={changed ? 'dock-qty-changed' : ''}>
                  <span>
                    <strong>{p?.name ?? '?'}</strong>
                    <br />
                    <span className="small muted">{t('dock.ordered', { what: [o.pallets ? t('prod.nPallets', { n: o.pallets }) : '', o.boxes ? t('prod.nBoxes', { n: o.boxes }) : ''].filter(Boolean).join(' + ') })}</span>
                  </span>
                  <span className="order-steppers">
                    <span className="small muted">{t('pack.palletsWord')}</span>
                    <Stepper value={q.pallets} label={`${p?.name} ${t('pack.palletsWord')}`} onChange={(n) => setQty(qty.map((x, j) => (j === i ? { ...x, pallets: n } : x)))} />
                    {(o.boxes > 0 || q.boxes > 0) && (
                      <>
                        <span className="small muted">{t('pack.boxesWord')}</span>
                        <Stepper value={q.boxes} label={`${p?.name} ${t('pack.boxesWord')}`} onChange={(n) => setQty(qty.map((x, j) => (j === i ? { ...x, boxes: n } : x)))} />
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="small muted">{t('dock.signedBy', { names: names(crew) })}</p>
          <div className="confirm-buttons">
            <button type="button" className="button confirm-no" onClick={() => setConfirming(false)}>
              {t('pack.no')}
            </button>
            <button type="button" className="button button-primary confirm-yes" onClick={() => void load()}>
              {t(differs ? 'dock.yesLoadedOther' : 'dock.yesLoaded')}
            </button>
          </div>
        </Modal>
      )}
      {reporting && session && <LoadingDeviation order={order} crew={crew} onClose={() => setReporting(false)} />}
    </article>
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
