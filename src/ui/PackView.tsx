import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog, useEntriesOn } from '../data.ts';
import { todayLocal } from '../days.ts';
import { db, newId } from '../db.ts';
import { byProduct, canWorkerUndo, sortProducts, total } from '../domain/production.ts';
import type { Entry, EntryKind, Product } from '../domain/types.ts';
import { href } from '../router.ts';
import { Modal, Notice, Page } from './common.tsx';

// The packing station: who is packing, which product, and two big buttons – a pallet, a box.
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
  const { workers, brands, products } = useCatalog();
  const today = todayLocal();
  const todays = useEntriesOn(today);
  const mine = useMemo(() => todays.filter((e) => e.sessionId === sessionId), [todays, sessionId]);
  const [brandId, setBrandId] = useState<string>();
  const [productId, setProductId] = useState<string>();
  const [other, setOther] = useState<EntryKind | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const names = workerIds.map((id) => workers.find((w) => w.id === id)?.name ?? '?');
  const list = sortProducts(products, brands, brandId);
  const product = products.find((p) => p.id === productId);
  const perProduct = byProduct(mine);
  const sessionTotal = total(mine);
  const dayTotal = total(todays);
  const last = [...mine].sort((a, b) => b.at - a.at);

  const register = async (kind: EntryKind, quantity: number) => {
    if (!product || quantity <= 0) return;
    const e: Entry = { id: newId(), at: Date.now(), day: todayLocal(), kind, quantity, productId: product.id, sessionId, workerIds, station: settings.station };
    await db.entries.put(e);
    navigator.vibrate?.(40);
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
        <button type="button" className="button" onClick={() => void end()}>
          {t('pack.end')}
        </button>
      </section>

      <div className="cal-chips pack-brands" role="group" aria-label={t('pack.brand')}>
        <button type="button" className={`cal-chip ${!brandId ? 'pack-chip-on' : ''}`} onClick={() => setBrandId(undefined)}>
          {t('pack.allBrands')}
        </button>
        {brands.map((b) => (
          <button key={b.id} type="button" className={`cal-chip ${brandId === b.id ? 'pack-chip-on' : ''}`} style={{ ['--brand' as string]: b.color }} onClick={() => setBrandId(b.id)}>
            <i className="brand-dot" /> {b.name}
          </button>
        ))}
      </div>

      <div className="pack-products">
        {list.map((p) => (
          <ProductTile key={p.id} product={p} color={brands.find((b) => b.id === p.brandId)?.color} on={p.id === productId} count={perProduct.get(p.id)} onPick={() => setProductId(p.id)} />
        ))}
      </div>

      <section className={`card cal-focus pack-register ${product ? '' : 'pack-register-off'}`}>
        <div className="cal-focus-head">
          <strong className="pack-product-name">{product ? product.name : t('pack.pickProduct')}</strong>
          {product && <span className="small muted">{brands.find((b) => b.id === product.brandId)?.name}</span>}
        </div>
        <div className="pack-buttons">
          <button type="button" className="pack-big pack-pallet" disabled={!product} onClick={() => void register('pallet', 1)}>
            <span className="pack-plus">+1</span>
            {t('pack.pallet')}
          </button>
          <button type="button" className="pack-big pack-box" disabled={!product} onClick={() => void register('box', 1)}>
            <span className="pack-plus">+1</span>
            {t('pack.box')}
          </button>
        </div>
        <div className="pack-other">
          <button type="button" className="link-button" disabled={!product} onClick={() => setOther('pallet')}>
            {t('pack.otherPallets')}
          </button>
          <button type="button" className="link-button" disabled={!product} onClick={() => setOther('box')}>
            {t('pack.otherBoxes')}
          </button>
        </div>
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

      {other && product && <QuantityPad kind={other} product={product} onClose={() => setOther(null)} onDone={(n) => void register(other, n).then(() => setOther(null))} />}
    </>
  );
}

function ProductTile({ product, color, on, count, onPick }: { product: Product; color?: string; on: boolean; count?: { pallets: number; boxes: number }; onPick: () => void }) {
  const { t } = useApp();
  return (
    <button type="button" className={`pack-product ${on ? 'on' : ''}`} style={{ ['--brand' as string]: color ?? 'var(--border)' }} aria-pressed={on} onClick={onPick}>
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
