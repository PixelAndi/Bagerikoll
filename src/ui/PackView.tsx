import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog, useEntriesOn } from '../data.ts';
import { todayLocal } from '../days.ts';
import { db, newId } from '../db.ts';
import { byProduct, canWorkerUndo, groupByCustomer, sortProducts, total } from '../domain/production.ts';
import type { Entry, EntryKind, Product } from '../domain/types.ts';
import { href } from '../router.ts';
import { Modal, Notice, Page } from './common.tsx';

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
  const [filter, setFilter] = useState<string>();
  const [productId, setProductId] = useState<string>();
  const [boxPad, setBoxPad] = useState(false);
  const [changeWho, setChangeWho] = useState(false);
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
  const customerNames = (p: Product) => (p.customerIds ?? []).map((id) => customers.find((c) => c.id === id)?.name).filter(Boolean).join(', ');
  const product = products.find((p) => p.id === productId);
  const perProduct = byProduct(mine);
  const sessionTotal = total(mine);
  const dayTotal = total(todays);
  const last = [...mine].sort((a, b) => b.at - a.at);

  const register = async (kind: EntryKind, quantity: number) => {
    if (!product || quantity <= 0) return;
    // Pallets are counted one by one: a second tap straight after is taken as a slip, not a pallet.
    if (kind === 'pallet') {
      if (Date.now() - lastPallet.current < PALLET_PAUSE_MS) return;
      lastPallet.current = Date.now();
      setPalletPause(true);
      setTimeout(() => setPalletPause(false), PALLET_PAUSE_MS);
    }
    const e: Entry = { id: newId(), at: Date.now(), day: todayLocal(), kind, quantity, productId: product.id, sessionId, workerIds, station: settings.station };
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
          {byCustomer && <h2 className="pack-group">{g.customer?.name ?? t('pack.noCustomer')}</h2>}
          <div className="pack-products">
            {g.products.map((p) => (
              <ProductTile key={p.id} product={p} on={p.id === productId} count={perProduct.get(p.id)} onPick={() => setProductId(p.id)} />
            ))}
          </div>
        </div>
      ))}

      <section className={`card cal-focus pack-register ${product ? '' : 'pack-register-off'}`}>
        <div className="cal-focus-head">
          <strong className="pack-product-name">{product ? product.name : t('pack.pickProduct')}</strong>
          {product && <span className="small muted">{[product.code, customerNames(product)].filter(Boolean).join(' · ')}</span>}
        </div>
        <button type="button" className={`pack-big pack-pallet ${palletPause ? 'pack-pausing' : ''}`} disabled={!product} aria-disabled={palletPause} onClick={() => void register('pallet', 1)}>
          <span className="pack-plus">{palletPause ? '✓' : '+1'}</span>
          {palletPause ? t('pack.palletDone') : t('pack.pallet')}
        </button>
        <div className="pack-box-buttons" role="group" aria-label={t('pack.boxesWord')}>
          {BOX_STEPS.map((n) => (
            <button key={n} type="button" className="pack-big pack-box" disabled={!product} onClick={() => void register('box', n)}>
              <span className="pack-plus">+{n}</span>
              {t(n === 1 ? 'pack.box' : 'pack.boxes')}
            </button>
          ))}
        </div>
        <button type="button" className="button pack-other-boxes" disabled={!product} onClick={() => setBoxPad(true)}>
          {t('pack.otherBoxes')}
        </button>
      </section>

      {last[0] && <LastEntry entry={last[0]} product={products.find((p) => p.id === last[0].productId)} now={now} onUndo={undo} />}

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
    </>
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
