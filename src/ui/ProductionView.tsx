import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import { addDays, todayLocal, type LocalDate } from '../days.ts';
import { db, newId } from '../db.ts';
import { asPallets, planRow, shortDays, stockAt, yieldDays, yieldStats, type PlanInput, type PlanRow } from '../domain/plan.ts';
import { sortProducts } from '../domain/production.ts';
import type { Deviation, DeviationKind, Order, Product } from '../domain/types.ts';
import { Card, Field, Fold, Modal, Notice, Page } from './common.tsx';
import { LoadingDeviations } from './LoadingDeviations.tsx';
import { OrderEditor, Stepper } from './OrderEditor.tsx';

// Produktion (managers, made for a phone): the day's plan at a glance – how many doughs each
// product needs for the day's orders, how likely that is to be enough – then the orders (copied
// from the paper list), the doughs made and what went wrong with them, stock, and what a dough
// usually gives. The production day is the packing day.

export function ProductionView() {
  const { t, admin, askPin, settings } = useApp();
  if (!admin && !settings.productionOpen)
    return (
      <Page title={t('prod.title')}>
        <Notice kind="info">{t('prod.locked')}</Notice>
        <button type="button" className="button button-primary pack-start" onClick={() => askPin()}>
          🔒 {t('prod.open')}
        </button>
      </Page>
    );
  return <Production />;
}

function useProductionData() {
  const entries = useLiveQuery(() => db.entries.toArray(), []);
  const orders = useLiveQuery(() => db.orders.toArray(), []);
  const counts = useLiveQuery(() => db.stockCounts.toArray(), []);
  const doughs = useLiveQuery(() => db.doughs.toArray(), []);
  const deviations = useLiveQuery(() => db.deviations.toArray(), []);
  if (!entries || !orders || !counts || !doughs || !deviations) return null;
  return { entries, orders, counts, doughs, deviations };
}

function Production() {
  const { t, settings } = useApp();
  const today = todayLocal();
  const [day, setDay] = useState(today);
  const catalog = useCatalog();
  const data = useProductionData();
  const [orderEdit, setOrderEdit] = useState<Order | 'new' | null>(null);
  const [deviationFor, setDeviationFor] = useState<{ productId?: string; day: LocalDate } | null>(null);
  const [countFor, setCountFor] = useState<Product | null>(null);
  const lang = settings.language;
  const dayName = (d: LocalDate, style: 'long' | 'short' = 'long') =>
    new Intl.DateTimeFormat(lang, { weekday: style, day: 'numeric', month: style === 'long' ? 'long' : 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  const products = useMemo(() => sortProducts(catalog.products), [catalog.products]);
  if (!data) return <Page title={t('prod.title')}>{null}</Page>;
  const input: PlanInput = { products, ...data, today };
  const dayOrders = data.orders.filter((o) => o.day === day).sort((a, b) => a.createdAt - b.createdAt);
  const dayDoughs = data.doughs.filter((d) => d.day === day && d.doughs > 0);
  const relevant = products.filter(
    (p) =>
      dayOrders.some((o) => !o.cancelled && o.lines.some((l) => l.productId === p.id)) ||
      dayDoughs.some((d) => d.productId === p.id) ||
      data.deviations.some((x) => !x.removed && x.kind === 'scrapped' && x.remadeOn === day && x.productId === p.id),
  );
  const rows = relevant.map((p) => planRow(p, day, input));
  const totalDoughs = rows.reduce((s, r) => s + r.doughs, 0);
  const totalOrdered = rows.reduce((s, r) => s + r.orderedPallets, 0);

  return (
    <Page
      title={t('prod.title')}
      actions={
        <span className="cal-year-nav">
          <button type="button" className="link-inline" onClick={() => setDay(addDays(day, -1))} aria-label={t('common.previous')}>
            ‹
          </button>
          <button type="button" className="link-inline" onClick={() => setDay(addDays(day, 1))} aria-label={t('common.next')}>
            ›
          </button>
        </span>
      }
    >
      <div className="cal-chips prod-days">
        {[-1, 0, 1, 2].map((n) => {
          const d = addDays(today, n);
          return (
            <button key={n} type="button" className={`cal-chip ${d === day ? 'pack-chip-on' : ''}`} onClick={() => setDay(d)}>
              {n === 0 ? t('prod.today') : n === 1 ? t('prod.tomorrow') : n === -1 ? t('prod.yesterday') : dayName(d, 'short')}
            </button>
          );
        })}
        <input type="date" value={day} aria-label={t('prod.day')} onChange={(e) => e.target.value && setDay(e.target.value)} />
      </div>

      <section className="card cal-focus">
        <div className="cal-focus-head">
          <strong>{t('prod.planFor', { day: dayName(day) })}</strong>
        </div>
        <div className="cal-numbers">
          <div>
            <strong className="pack-figure">{fmt(totalOrdered, lang)}</strong>
            <span className="small muted">{t('prod.orderedPallets')}</span>
          </div>
          <div>
            <strong className="pack-figure">{totalDoughs}</strong>
            <span className="small muted">{t('prod.doughsToMake')}</span>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="muted">{t('prod.noOrders')}</p>
        ) : (
          <ul className="plan-rows">
            {rows.map((r) => (
              <PlanRowView key={r.product.id} row={r} dayName={dayName} />
            ))}
          </ul>
        )}
        <p className="small muted">{t('prod.planKey')}</p>
      </section>

      <LoadingDeviations />

      <ToCheck input={input} products={products} onDeviation={(productId, d) => setDeviationFor({ productId, day: d })} dayName={dayName} />

      <section className="card">
        <div className="cal-focus-head">
          <strong>{t('prod.orders', { day: dayName(day, 'short') })}</strong>
          <button type="button" className="button button-primary" onClick={() => setOrderEdit('new')}>
            + {t('prod.newOrder')}
          </button>
        </div>
        {dayOrders.length === 0 ? <p className="muted small">{t('prod.noOrdersYet')}</p> : <OrderList orders={dayOrders} onEdit={setOrderEdit} />}
      </section>

      <Doughs day={day} input={input} products={products} onDeviation={(productId) => setDeviationFor({ productId, day })} dayName={dayName} />

      <Fold title={t('prod.stock')} sub={t('prod.stockSub')}>
        <StockList input={input} products={products} onCount={setCountFor} />
      </Fold>

      <Fold title={t('prod.history')} sub={t('prod.historySub')}>
        <History input={input} products={products} />
      </Fold>

      {orderEdit && <OrderEditor order={orderEdit === 'new' ? undefined : orderEdit} day={day} onClose={() => setOrderEdit(null)} />}
      {deviationFor && <DeviationEditor productId={deviationFor.productId} day={deviationFor.day} products={products} onClose={() => setDeviationFor(null)} />}
      {countFor && <StockCountEditor product={countFor} input={input} onClose={() => setCountFor(null)} />}
    </Page>
  );
}

const fmt = (n: number, lang: string) => n.toLocaleString(lang === 'sv' ? 'sv-SE' : 'en-GB', { maximumFractionDigits: 1 });
const pct = (p: number) => (p >= 0.995 ? '>99 %' : p < 0.01 ? '<1 %' : `${Math.round(p * 100)} %`);
const chanceClass = (p: number) => (p >= 0.9 ? 'cal-chip-ok' : p >= 0.7 ? 'cal-chip-warn' : 'cal-chip-bad');

/** One product's line in the plan: the recommended doughs big, how likely they are to be enough. */
function PlanRowView({ row: r, dayName }: { row: PlanRow; dayName: (d: LocalDate, s?: 'long' | 'short') => string }) {
  const { t, settings } = useApp();
  const lang = settings.language;
  return (
    <li>
      <div className="plan-head">
        <span>
          <strong>{r.product.name}</strong>
          <span className="small muted">
            {t('prod.rowLine', {
              ordered: fmt(r.ordered.pallets, lang),
              boxes: r.ordered.boxes ? t('prod.plusBoxes', { n: r.ordered.boxes }) : '',
              stock: fmt(Math.max(0, r.available), lang),
              make: fmt(r.toMake, lang),
            })}
          </span>
        </span>
        <span className="plan-doughs">
          <strong>{r.doughs}</strong>
          <span className="small">{t('prod.doughsWord')}</span>
        </span>
      </div>
      <div className="cal-chips">
        {r.toMake <= 0 ? (
          <span className="cal-chip cal-chip-ok">✓ {t('prod.stockCovers')}</span>
        ) : (
          <>
            <span className={`cal-chip ${chanceClass(r.chance)}`}>{t('prod.chance', { p: pct(r.chance) })}</span>
            {r.chance < 0.9 && <span className={`cal-chip ${chanceClass(r.oneMore.chance)}`}>{t('prod.oneMore', { n: r.oneMore.doughs, p: pct(r.oneMore.chance) })}</span>}
          </>
        )}
        {!r.stats.trusted && <span className="cal-chip cal-chip-warn">{t('prod.fewDays', { n: r.stats.days })}</span>}
      </div>
      {r.toMake > 0 && (
        <p className="small muted">
          {t('prod.gives', { pallets: fmt(r.expected.pallets, lang), margin: fmt(r.expected.margin, lang), per: fmt(r.stats.mean, lang) })}
          {!r.stats.trusted && ` ${t('prod.expectedUsed')}`}
        </p>
      )}
      {r.ordered.boxes > 0 && !r.product.boxesPerPallet && <p className="small warn-text">{t('prod.boxesNotCounted')}</p>}
      {r.remakes.map((m, i) => (
        <p key={i} className="small warn-text">
          {t('prod.remake', { n: m.doughs, day: dayName(m.from, 'short') })}
        </p>
      ))}
    </li>
  );
}

/** What needs a look: days that gave less than usual (a missed pallet?), doughs without packing data, orders not marked loaded. */
function ToCheck({ input, products, onDeviation, dayName }: { input: PlanInput; products: Product[]; onDeviation: (productId: string, day: LocalDate) => void; dayName: (d: LocalDate, s?: 'long' | 'short') => string }) {
  const { t, settings } = useApp();
  const { customers } = useCatalog();
  const lang = settings.language;
  const from = addDays(input.today, -14);
  const short = shortDays(products, from, input);
  const noPacking = products.flatMap((p) => yieldDays(p, input.today, input.doughs, input.deviations, input.entries).noPacking.filter((d) => d >= from).map((d) => ({ p, d })));
  const open = input.orders.filter((o) => !o.cancelled && o.shippedAt === undefined && o.day < input.today).sort((a, b) => (a.day < b.day ? -1 : 1));
  if (!short.length && !noPacking.length && !open.length) return null;
  return (
    <Card title={t('prod.toCheck')} className="cal-check">
      <ul className="cal-check-list prod-check">
        {short.map((s) => (
          <li key={`s${s.product.id}${s.day}`}>
            <span>{t('prod.shortDay', { product: s.product.name, day: dayName(s.day, 'short'), packed: fmt(s.packed, lang), usual: fmt(s.usual, lang) })}</span>
            <button type="button" className="link-button small" onClick={() => onDeviation(s.product.id, s.day)}>
              {t('prod.report')}
            </button>
          </li>
        ))}
        {noPacking.map(({ p, d }) => (
          <li key={`n${p.id}${d}`}>
            <span>{t('prod.noPacking', { product: p.name, day: dayName(d, 'short') })}</span>
          </li>
        ))}
        {open.map((o) => (
          <li key={o.id}>
            <span>{t('prod.notShipped', { customer: customers.find((c) => c.id === o.customerId)?.name ?? '?', day: dayName(o.day, 'short') })}</span>
            <button type="button" className="link-button small" onClick={() => void db.orders.update(o.id, { shippedAt: Date.now() })}>
              {t('prod.markShipped')}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function OrderList({ orders, onEdit }: { orders: Order[]; onEdit: (o: Order) => void }) {
  const { t } = useApp();
  const { customers, products } = useCatalog();
  const time = (at: number) => new Date(at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  return (
    <ul className="product-rows">
      {orders.map((o) => (
        <li key={o.id} className={o.cancelled ? 'pack-voided' : ''}>
          <span>
            <strong>{customers.find((c) => c.id === o.customerId)?.name ?? '?'}</strong>{' '}
            {o.cancelled ? (
              <span className="cal-chip">{t('prod.cancelled')}</span>
            ) : o.shippedAt ? (
              <span className="cal-chip cal-chip-ok">✓ {t('prod.shippedAt', { time: time(o.shippedAt) })}</span>
            ) : (
              <span className="cal-chip">{t('prod.openOrder')}</span>
            )}
            <br />
            <span className="small muted">
              {o.lines
                .map((l) => `${products.find((p) => p.id === l.productId)?.name ?? '?'}: ${[l.pallets ? t('prod.nPallets', { n: l.pallets }) : '', l.boxes ? t('prod.nBoxes', { n: l.boxes }) : ''].filter(Boolean).join(' + ')}`)
                .join(' · ')}
            </span>
            {o.note && <span className="small muted"> · {o.note}</span>}
          </span>
          <span className="prod-order-buttons">
            {!o.cancelled &&
              (o.shippedAt ? (
                <button type="button" className="link-button small" onClick={() => void db.orders.update(o.id, { shippedAt: undefined })}>
                  {t('prod.unship')}
                </button>
              ) : (
                <button type="button" className="button" onClick={() => void db.orders.update(o.id, { shippedAt: Date.now() })}>
                  {t('prod.markShipped')}
                </button>
              ))}
            <button type="button" className="link-button small" onClick={() => onEdit(o)}>
              {t('admin.edit')}
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The doughs made on the day, per product, against what was packed – and deviations. */
function Doughs({ day, input, products, onDeviation, dayName }: { day: LocalDate; input: PlanInput; products: Product[]; onDeviation: (productId?: string) => void; dayName: (d: LocalDate, s?: 'long' | 'short') => string }) {
  const { t, settings } = useApp();
  const lang = settings.language;
  const [extra, setExtra] = useState<string[]>([]);
  const counted = input.doughs.filter((d) => d.day === day);
  const planned = new Set(
    input.orders.filter((o) => !o.cancelled && o.day === day).flatMap((o) => o.lines.map((l) => l.productId)),
  );
  const shown = products.filter((p) => planned.has(p.id) || counted.some((d) => d.productId === p.id && d.doughs > 0) || extra.includes(p.id));
  const others = products.filter((p) => !shown.includes(p));
  const deviations = input.deviations.filter((x) => x.day === day && !x.removed);
  const setDoughs = (productId: string, doughs: number) => db.doughs.put({ id: `${day}|${productId}`, day, productId, doughs });
  return (
    <section className="card">
      <div className="cal-focus-head">
        <strong>{t('prod.doughs', { day: dayName(day, 'short') })}</strong>
        <button type="button" className="button" onClick={() => onDeviation()}>
          {t('prod.reportDeviation')}
        </button>
      </div>
      <p className="small muted">{t('prod.doughsHint')}</p>
      <ul className="product-rows">
        {shown.map((p) => {
          const n = counted.find((d) => d.productId === p.id)?.doughs ?? 0;
          const packed = input.entries.filter((e) => !e.voided && e.day === day && e.productId === p.id);
          const pallets = packed.reduce((s, e) => s + (e.kind === 'pallet' ? e.quantity : asPallets(p, 0, e.quantity)), 0);
          const stats = yieldStats(p, yieldDays(p, input.today, input.doughs, input.deviations, input.entries).days);
          const scrapped = deviations.filter((x) => x.productId === p.id && x.kind === 'scrapped').reduce((s, x) => s + (x.doughs ?? 0), 0);
          const good = Math.max(0, n - scrapped);
          return (
            <li key={p.id}>
              <span>
                <strong>{p.name}</strong>
                <br />
                <span className="small muted">
                  {n > 0
                    ? t('prod.packedVsUsual', { packed: fmt(pallets, lang), low: fmt(Math.max(0, good * (stats.mean - stats.sd)), lang), high: fmt(good * (stats.mean + stats.sd), lang) })
                    : t('prod.packedOnly', { packed: fmt(pallets, lang) })}
                  {scrapped > 0 && ` · ${t('prod.scrappedN', { n: scrapped })}`}
                </span>
              </span>
              <Stepper value={n} label={`${p.name} ${t('prod.doughsWord')}`} onChange={(v) => void setDoughs(p.id, v)} />
            </li>
          );
        })}
      </ul>
      {others.length > 0 && (
        <select value="" aria-label={t('prod.otherProduct')} onChange={(e) => e.target.value && setExtra((x) => [...x, e.target.value])}>
          <option value="">+ {t('prod.otherProduct')}</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      {deviations.length > 0 && (
        <>
          <h3 className="prod-sub">{t('prod.deviations')}</h3>
          <ul className="product-rows">
            {deviations.map((x) => (
              <li key={x.id}>
                <span>
                  <strong>{products.find((p) => p.id === x.productId)?.name ?? '?'}</strong> · {t(`dev.${x.kind}`)}
                  {x.kind === 'scrapped' && x.doughs ? ` · ${t('prod.scrappedN', { n: x.doughs })}` : ''}
                  {x.remadeOn && ` · ${t('prod.remadeOn', { day: dayName(x.remadeOn, 'short') })}`}
                  {x.note && (
                    <>
                      <br />
                      <span className="small muted">{x.note}</span>
                    </>
                  )}
                </span>
                {/* Deviations from the packing station are part of its protocol: they stay. */}
                {!x.runId && (
                  <button type="button" className="link-button small" onClick={() => confirm(t('prod.removeDeviationConfirm')) && void db.deviations.update(x.id, { removed: true })}>
                    {t('prod.removeDeviation')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function DeviationEditor({ productId, day, products, onClose }: { productId?: string; day: LocalDate; products: Product[]; onClose: () => void }) {
  const { t } = useApp();
  const [product, setProduct] = useState(productId ?? '');
  const [kind, setKind] = useState<DeviationKind>('scrapped');
  const [doughs, setDoughs] = useState(1);
  const [remake, setRemake] = useState(true);
  const [remadeOn, setRemadeOn] = useState(addDays(day, 1));
  const [note, setNote] = useState('');
  const ok = product && (kind !== 'scrapped' || doughs > 0) && (kind === 'scrapped' || note.trim() || kind === 'lowYield');
  const saveIt = async () => {
    if (!ok) return;
    const x: Deviation = { id: newId(), day, productId: product, kind, note: note.trim(), at: Date.now() };
    if (kind === 'scrapped') {
      x.doughs = doughs;
      if (remake) x.remadeOn = remadeOn;
    }
    await db.deviations.put(x);
    onClose();
  };
  return (
    <Modal title={t('prod.reportDeviation')} onClose={onClose}>
      <Field label={t('prod.product')}>
        <select value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="">–</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="field">
        <span className="field-label">{t('prod.whatHappened')}</span>
        <div className="dev-kinds">
          {(['scrapped', 'lowYield', 'other'] as const).map((k) => (
            <button key={k} type="button" className={`pack-name ${kind === k ? 'on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {t(`dev.${k}`)}
              <span className="small muted">{t(`dev.${k}Hint`)}</span>
            </button>
          ))}
        </div>
      </div>
      {kind === 'scrapped' && (
        <>
          <div className="field">
            <span className="field-label">{t('prod.scrappedHow')}</span>
            <Stepper value={doughs} label={t('prod.scrappedHow')} onChange={setDoughs} />
          </div>
          <label className="check-row">
            <input type="checkbox" checked={remake} onChange={(e) => setRemake(e.target.checked)} />
            <span>{t('prod.remakeOn')}</span>
          </label>
          {remake && <input type="date" value={remadeOn} aria-label={t('prod.remakeOn')} onChange={(e) => e.target.value && setRemadeOn(e.target.value)} />}
        </>
      )}
      <Field label={t('prod.note')} hint={t(kind === 'other' ? 'prod.noteNeeded' : 'prod.noteHint')}>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <p className="small muted">{t('prod.deviationEffect')}</p>
      <button type="button" className="button button-primary pack-start" disabled={!ok} onClick={() => void saveIt()}>
        {t('admin.save')}
      </button>
    </Modal>
  );
}

function StockList({ input, products, onCount }: { input: PlanInput; products: Product[]; onCount: (p: Product) => void }) {
  const { t, settings } = useApp();
  const now = Date.now();
  return (
    <>
      <p className="small muted">{t('prod.stockHint')}</p>
      <ul className="product-rows">
        {products.map((p) => {
          const s = stockAt(p.id, now, input.entries, input.orders, input.counts);
          return (
            <li key={p.id}>
              <span>
                <strong>{p.name}</strong>
                <br />
                <span className="small muted">
                  {(s.pallets < 0 || s.boxes < 0) && <span className="warn-text">{t('prod.belowZero')} </span>}
                  {s.countedAt ? t('prod.countedAt', { when: new Date(s.countedAt).toLocaleString(settings.language === 'sv' ? 'sv-SE' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }) : t('prod.neverCounted')}
                </span>
              </span>
              <span className={`product-count ${s.pallets < 0 || s.boxes < 0 ? 'warn-text' : ''}`} title={s.pallets < 0 || s.boxes < 0 ? t('prod.belowZero') : undefined}>
                <strong>{s.pallets}</strong> {t('today.palletsShort')} · <strong>{s.boxes}</strong> {t('today.boxesShortWord')}
              </span>
              <button type="button" className="link-button small" onClick={() => onCount(p)}>
                {t('prod.count')}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function StockCountEditor({ product, input, onClose }: { product: Product; input: PlanInput; onClose: () => void }) {
  const { t } = useApp();
  const now = stockAt(product.id, Date.now(), input.entries, input.orders, input.counts);
  const [pallets, setPallets] = useState(Math.max(0, now.pallets));
  const [boxes, setBoxes] = useState(Math.max(0, now.boxes));
  const saveIt = async () => {
    await db.stockCounts.put({ id: newId(), at: Date.now(), productId: product.id, pallets, boxes });
    onClose();
  };
  return (
    <Modal title={t('prod.countTitle', { product: product.name })} onClose={onClose}>
      <p className="small muted">{t('prod.countHint')}</p>
      <div className="field">
        <span className="field-label">{t('pack.palletsWord')}</span>
        <Stepper value={pallets} label={t('pack.palletsWord')} onChange={setPallets} />
      </div>
      <div className="field">
        <span className="field-label">{t('pack.boxesWord')}</span>
        <Stepper value={boxes} label={t('pack.boxesWord')} onChange={setBoxes} />
      </div>
      <button type="button" className="button button-primary pack-start" onClick={() => void saveIt()}>
        {t('prod.saveCount')}
      </button>
    </Modal>
  );
}

/** What each product's dough usually gives, from the history (days with a deviation left out). */
function History({ input, products }: { input: PlanInput; products: Product[] }) {
  const { t, settings } = useApp();
  const lang = settings.language;
  return (
    <>
      <p className="small muted">{t('prod.historyHint')}</p>
      <ul className="product-rows">
        {products.map((p) => {
          const { days } = yieldDays(p, input.today, input.doughs, input.deviations, input.entries);
          const s = yieldStats(p, days);
          return (
            <li key={p.id}>
              <span>
                <strong>{p.name}</strong>
                <br />
                <span className="small muted">
                  {s.days ? t('prod.historyLine', { days: s.days, dev: s.deviationDays }) : t('prod.noHistory', { n: fmt(s.mean, lang) })}
                </span>
              </span>
              <span className="product-count">
                <strong>{fmt(s.mean, lang)}</strong> ± {fmt(s.sd, lang)} {t('prod.perDough')}{' '}
                <span className={`cal-chip ${s.trusted ? 'cal-chip-ok' : 'cal-chip-warn'}`}>{s.trusted ? '✓' : t('prod.few')}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
