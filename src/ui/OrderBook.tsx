import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import { addDays, type LocalDate } from '../days.ts';
import { db } from '../db.ts';
import { deliveredLines } from '../domain/accounting.ts';
import { billerCode, lineCalc, lineChange, orderTotals, planState, removedLines } from '../domain/office.ts';
import { boxCountOptions, lineBoxesPerPallet, palletLayers } from '../domain/pallet.ts';
import type { Order, OrderLine, Product } from '../domain/types.ts';
import { Field, Modal } from './common.tsx';
import { PalletBadge } from './PalletIcon.tsx';

// The order book – the paper book, digital: Monday to Friday left to right (Saturday and Sunday
// only when they have orders), each order as the book writes it: the customer, the billing
// company's marking (e.g. "AB") and the order number; under it each product by name, article
// number and amount, marked when it was changed after it was entered, or loaded otherwise at the
// dock. The same book for the managers (Kontor: tick products as planned, boxes per pallet, edit,
// move, drag to another day) and for accounting (Ekonomi: read only, delivered or not, amounts).

const money = (n: number) => n.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 2 });
const qty = (t: ReturnType<typeof useApp>['t'], l: { pallets: number; boxes: number }) =>
  [l.pallets ? t('prod.nPallets', { n: l.pallets }) : '', l.boxes ? t('prod.nBoxes', { n: l.boxes }) : ''].filter(Boolean).join(' + ') || t('dock.nothing');

export interface OrderBookProps {
  monday: LocalDate;
  orders: Order[];
  mode: 'office' | 'accounting';
  today: LocalDate;
  dupes?: Set<string>;
  onNew?: (day: LocalDate) => void;
  onEdit?: (o: Order) => void;
  onMove?: (o: Order) => void;
  onPrintDay?: (day: LocalDate) => void;
}

export function OrderBook(props: OrderBookProps) {
  const { monday, orders } = props;
  const { settings } = useApp();
  const lang = settings.language === 'sv' ? 'sv-SE' : 'en-GB';
  const all = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  // Monday to Friday; the weekend only when something is ordered on it.
  const days = all.filter((d, i) => i < 5 || orders.some((o) => o.day === d && !o.cancelled));
  const dayName = (d: LocalDate) => new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  const byDay = (d: LocalDate) => orders.filter((o) => o.day === d).sort((a, b) => (a.orderNumber ?? '').localeCompare(b.orderNumber ?? '', 'sv', { numeric: true }) || a.createdAt - b.createdAt);
  const { t } = useApp();
  const [allOpen, setAllOpen] = useState(false);
  return (
    <>
      <div className="book-toolbar">
        <button type="button" className="button button-small" aria-pressed={allOpen} onClick={() => setAllOpen(!allOpen)}>
          {allOpen ? `▴ ${t('book.lessDetails')}` : `▾ ${t('book.allDetails')}`}
        </button>
      </div>
      <div className={`office-week order-book ${props.mode}`} style={{ ['--days' as string]: days.length }}>
        {days.map((d) => (
          <DayColumn key={d} {...props} day={d} label={dayName(d)} orders={byDay(d)} allOpen={allOpen} />
        ))}
      </div>
    </>
  );
}

function DayColumn({ day, label, orders, mode, today, dupes, onNew, onEdit, onMove, onPrintDay, allOpen }: OrderBookProps & { day: LocalDate; label: string; allOpen: boolean }) {
  const { t } = useApp();
  const { products } = useCatalog();
  const [over, setOver] = useState(false);
  const live = orders.filter((o) => !o.cancelled);
  const office = mode === 'office';
  const dayAmount = live.reduce((s, o) => s + orderAmount(o, products, mode).amount, 0);
  return (
    <section
      className={`office-day ${day === today ? 'office-today' : ''} ${over ? 'office-drop' : ''}`}
      onDragOver={
        office
          ? (e) => {
              e.preventDefault();
              setOver(true);
            }
          : undefined
      }
      onDragLeave={office ? () => setOver(false) : undefined}
      onDrop={
        office
          ? (e) => {
              e.preventDefault();
              setOver(false);
              const id = e.dataTransfer.getData('text/plain');
              if (id) void db.orders.update(id, { day });
            }
          : undefined
      }
    >
      <header className="office-day-head">
        <span>
          <strong className="book-day">{label}</strong>
          <span className="small muted"> · {t(live.length === 1 ? 'office.dayCountOne' : 'office.dayCount', { n: live.length })}</span>
        </span>
        <span className="office-day-pallets" title={t('office.dayPallets')}>
          {orderTotals(live).pallets}
          <span className="small"> {t('today.palletsShort')}</span>
        </span>
        {!office && live.length > 0 && <span className="small book-day-amount">{money(dayAmount)}</span>}
      </header>
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} mode={mode} duplicate={!!o.orderNumber && !!dupes?.has(o.orderNumber)} onEdit={onEdit} onMove={onMove} allOpen={allOpen} />
      ))}
      {office && (
        <div className="office-day-buttons">
          <button type="button" className="button button-small" onClick={() => onNew?.(day)}>
            + {t('office.order')}
          </button>
          {live.length > 0 && (
            <button type="button" className="link-button small" onClick={() => onPrintDay?.(day)}>
              🖨 {t('office.printDay')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** What an order comes to: accounting counts what was delivered once it is loaded. */
function orderAmount(order: Order, products: Product[], mode: 'office' | 'accounting') {
  const lines = mode === 'accounting' && order.shippedAt !== undefined ? deliveredLines(order) : order.lines;
  let amount = 0;
  let missing = false;
  for (const l of lines) {
    const a = lineCalc(l, products.find((p) => p.id === l.productId), order.day, order.customerId).amount;
    if (a === undefined) missing = true;
    else amount += a;
  }
  return { amount: Math.round(amount * 100) / 100, missing };
}

/** One order as the book writes it: customer, billing marking, order number – then its products. */
function OrderCard({ order, mode, duplicate, onEdit, onMove, allOpen }: { order: Order; mode: 'office' | 'accounting'; duplicate: boolean; onEdit?: (o: Order) => void; onMove?: (o: Order) => void; allOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const expanded = open || allOpen;
  const { t } = useApp();
  const { customers, products, brands } = useCatalog();
  const office = mode === 'office';
  const customer = customers.find((c) => c.id === order.customerId);
  const biller = brands.find((b) => b.id === customer?.billedBy);
  const state = planState(order);
  const [picking, setPicking] = useState<string | null>(null);
  const pickProduct = products.find((p) => p.id === picking);
  const loaded = order.shippedAt !== undefined;
  const toggle = (productId: string) =>
    db.orders.update(order.id, { lines: order.lines.map((l) => (l.productId === productId ? { ...l, plannedAt: l.plannedAt ? undefined : Date.now() } : l)) });
  const total = orderAmount(order, products, mode);
  const removed = removedLines(order);
  const status = office
    ? order.cancelled
      ? 'office-cancelled'
      : state.full
        ? 'office-full'
        : state.planned
          ? 'office-partly'
          : ''
    : order.cancelled
      ? 'office-cancelled'
      : loaded
        ? 'office-full'
        : 'office-partly';
  const head = (
    <div className="book-order-head">
      <strong className="book-customer">{customer?.name ?? '?'}</strong>
      {biller && (
        <span className="biller-badge" style={{ ['--brand' as string]: biller.color }} title={biller.name}>
          {billerCode(biller)}
        </span>
      )}
      {order.orderNumber && <strong className={`book-number ${duplicate ? 'warn-text' : ''}`}>{order.orderNumber}</strong>}
      <button type="button" className="book-toggle" aria-expanded={expanded} aria-label={t(expanded ? 'book.lessDetails' : 'book.details')} onClick={() => setOpen(!open)} disabled={allOpen}>
        {expanded ? '▴' : '▾'}
      </button>
    </div>
  );
  // At a glance: one short line per product – the tick (Kontor), name, article number and pallets –
  // a ✎ or 🚚 where something changed; the rest opens with ▾.
  if (!expanded) {
    const shownTotal = orderTotals([!office && loaded ? { ...order, lines: deliveredLines(order) } : order]);
    return (
      <article className={`office-order book-order book-compact ${status}`} draggable={office && !order.cancelled} onDragStart={office ? (e) => e.dataTransfer.setData('text/plain', order.id) : undefined}>
        {head}
        <ul className="book-mini">
          {order.lines
            .filter((l) => l.pallets || l.boxes)
            .map((l) => {
              const p = products.find((x) => x.id === l.productId);
              const ch = lineChange(order, l.productId);
              const shown = !office && loaded && ch.delivered ? ch.delivered : l;
              return (
                <li key={l.productId} className={ch.was || ch.added || ch.delivered ? 'book-changed' : ''} title={[ch.was ? t('book.was', { what: qty(t, ch.was) }) : '', ch.added ? t('book.added') : '', ch.delivered ? t('book.delivered', { what: qty(t, ch.delivered) }) : ''].filter(Boolean).join(' · ') || undefined}>
                  {office && <input type="checkbox" checked={!!l.plannedAt} disabled={order.cancelled} onChange={() => void toggle(l.productId)} aria-label={`${p?.name ?? ''} ${t('office.plannedCol')}`} />}
                  <span className="mini-name">{p?.name ?? '?'}</span>
                  <span className="mini-code">{p?.code}</span>
                  <strong className="mini-qty">
                    {shown.pallets ? `${shown.pallets} p` : ''}
                    {shown.boxes ? `${shown.pallets ? '+' : ''}${shown.boxes} k` : ''}
                    {!shown.pallets && !shown.boxes ? '0' : ''}
                  </strong>
                  <span className="mini-mark">{ch.delivered ? '🚚' : ch.was || ch.added ? '✎' : ''}</span>
                </li>
              );
            })}
          {removed.length > 0 && <li className="book-changed mini-removed">✎ {t('book.removedN', { n: removed.length })}</li>}
        </ul>
        <div className="book-mini-foot">
          <span>
            <strong>{shownTotal.pallets} p</strong>
            {shownTotal.boxes > 0 && ` + ${shownTotal.boxes} k`}
            {!office && <span> · {total.missing ? t('office.noPriceShort') : money(total.amount)}</span>}
          </span>
          {office ? (
            order.cancelled ? (
              <span className="cal-chip">{t('prod.cancelled')}</span>
            ) : (
              <span className={`mini-state ${state.full ? 'ok' : 'warn-text'}`}>{state.full ? `✓ ${t('book.planned')}` : `${state.planned}/${state.total} ${t('book.plannedShort')}`}</span>
            )
          ) : order.cancelled ? (
            <span className="cal-chip">{t('prod.cancelled')}</span>
          ) : (
            <span className={`mini-state ${loaded ? 'ok' : 'warn-text'}`}>{loaded ? `✓ ${t('accounting.delivered')}` : t('accounting.notYet')}</span>
          )}
        </div>
      </article>
    );
  }
  return (
    <article className={`office-order book-order ${status}`} draggable={office && !order.cancelled} onDragStart={office ? (e) => e.dataTransfer.setData('text/plain', order.id) : undefined}>
      {head}
      <div className="book-status">
        {order.cancelled ? (
          <span className="cal-chip">{t('prod.cancelled')}</span>
        ) : office ? (
          state.full ? (
            <span className="cal-chip cal-chip-ok">✓ {t('office.full')}</span>
          ) : (
            <span className="cal-chip cal-chip-warn">{t('office.partly', { planned: state.planned, total: state.total })}</span>
          )
        ) : loaded ? (
          <span className="cal-chip cal-chip-ok">✓ {t('accounting.delivered')}</span>
        ) : (
          <span className="cal-chip cal-chip-warn">{t('accounting.notYet')}</span>
        )}
        {office && loaded && <span className="cal-chip cal-chip-ok">🚚 {t('dock.loadedAt', { time: new Date(order.shippedAt!).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) })}</span>}
      </div>
      <ul className="office-lines book-lines">
        {order.lines
          .filter((l) => l.pallets || l.boxes)
          .map((l) => {
            const p = products.find((x) => x.id === l.productId);
            const ch = lineChange(order, l.productId);
            const changed = !!(ch.was || ch.added || ch.delivered);
            const shown: OrderLine = !office && loaded && ch.delivered ? { ...l, ...ch.delivered } : l;
            const amount = !office ? lineCalc(shown, p, order.day, order.customerId).amount : undefined;
            const name = (
              <span className="office-line-text">
                <span className="office-line-name">
                  {p?.name ?? '?'} {p?.code && <span className="book-code">{p.code}</span>}
                </span>
                <strong className="office-line-qty">{qty(t, l)}</strong>
              </span>
            );
            return (
              <li key={l.productId} className={changed ? 'book-changed' : ''}>
                {office ? (
                  <label className={`office-line ${l.plannedAt ? 'on' : ''}`}>
                    <input type="checkbox" checked={!!l.plannedAt} disabled={order.cancelled} onChange={() => void toggle(l.productId)} aria-label={t('office.plannedCol')} />
                    {name}
                  </label>
                ) : (
                  <div className="office-line">{name}</div>
                )}
                {ch.was && <span className="book-mark">✎ {t('book.was', { what: qty(t, ch.was) })}</span>}
                {ch.added && <span className="book-mark">✎ {t('book.added')}</span>}
                {ch.delivered && <span className="book-mark book-mark-dock">🚚 {t('book.delivered', { what: qty(t, ch.delivered) })}</span>}
                {!office && <span className="book-amount">{amount === undefined ? t('office.noPriceShort') : money(amount)}</span>}
                {office && p && l.pallets > 0 && (
                  <button type="button" className={`bpp-chip ${l.spreadPallets || lineBoxesPerPallet(l, p) ? '' : 'bpp-missing'} ${l.spreadPallets || (l.boxesPerPallet && l.boxesPerPallet !== p.boxesPerPallet) ? 'bpp-set' : ''}`} disabled={order.cancelled} onClick={() => setPicking(l.productId)}>
                    {l.spreadPallets ? t('spread.short', { n: l.pallets }) : lineBoxesPerPallet(l, p) ? t('pallet.short', { boxes: lineBoxesPerPallet(l, p)! }) : t('pallet.unknown')}
                  </button>
                )}
              </li>
            );
          })}
        {removed.map((l) => {
          const p = products.find((x) => x.id === l.productId);
          return (
            <li key={`removed-${l.productId}`} className="book-changed book-removed">
              <div className="office-line">
                <span className="office-line-text">
                  <span className="office-line-name">
                    {p?.name ?? '?'} {p?.code && <span className="book-code">{p.code}</span>}
                  </span>
                  <strong className="office-line-qty">{qty(t, l)}</strong>
                </span>
              </div>
              <span className="book-mark">✎ {t('book.removed')}</span>
            </li>
          );
        })}
      </ul>
      {order.note && <p className="small muted">{order.note}</p>}
      {picking && pickProduct && <BoxCountPicker order={order} product={pickProduct} onClose={() => setPicking(null)} />}
      <div className="office-order-foot">
        <span className="small">
          <strong>{t('office.orderPallets', { pallets: orderTotals([!office && loaded ? { ...order, lines: deliveredLines(order) } : order]).pallets })}</strong>
          <span className="muted"> · {total.missing ? t('office.noPriceShort') : money(total.amount)}</span>
        </span>
        {office && (
          <span>
            <button type="button" className="link-button small" onClick={() => onMove?.(order)} disabled={order.cancelled}>
              {t('office.move')}
            </button>
            <button type="button" className="link-button small" onClick={() => onEdit?.(order)}>
              {t('admin.edit')}
            </button>
          </span>
        )}
      </div>
    </article>
  );
}

/**
 * Boxes per pallet for one product on an order, chosen while planning (it can differ by where the
 * order is delivered): the product's standard and the counts used before, each with its pallet,
 * or another number. The packers see it when they start the run.
 */
function BoxCountPicker({ order, product, onClose }: { order: Order; product: Product; onClose: () => void }) {
  const { t } = useApp();
  const allOrders = useLiveQuery(() => db.orders.toArray(), []) ?? [];
  const line = order.lines.find((l) => l.productId === product.id)!;
  const current = lineBoxesPerPallet(line, product);
  const options = boxCountOptions(product, allOrders, order.customerId);
  const [custom, setCustom] = useState(current && !options.includes(current) ? String(current) : '');
  const choose = async (n: number | undefined) => {
    // The product's own standard is stored as "not set", so a later change of the standard applies.
    const value = n && n !== product.boxesPerPallet ? n : undefined;
    await db.orders.update(order.id, { lines: order.lines.map((l) => (l.productId === product.id ? { ...l, boxesPerPallet: value, spreadPallets: undefined } : l)) });
    onClose();
  };
  // The manager's instruction: all of it on the order's pallets, however many boxes come out.
  const spread = async () => {
    await db.orders.update(order.id, { lines: order.lines.map((l) => (l.productId === product.id ? { ...l, spreadPallets: true } : l)) });
    onClose();
  };
  const customN = Number(custom);
  return (
    <Modal title={t('pallet.pickTitle', { product: product.name })} onClose={onClose}>
      <p className="small muted">{t('pallet.pickHint')}</p>
      {line.pallets > 0 && (
        <button type="button" className={`card spread-choice ${line.spreadPallets ? 'on' : ''}`} aria-pressed={!!line.spreadPallets} onClick={() => void spread()}>
          <strong>{t('spread.choose', { n: line.pallets })}</strong>
          <span className="small muted">{t('spread.chooseHint')}</span>
        </button>
      )}
      <p className="small muted">{t('spread.orFixed')}</p>
      <div className="bpp-options">
        {options.map((n) => (
          <button key={n} type="button" className={`bpp-option ${n === current && !line.spreadPallets ? 'on' : ''}`} aria-pressed={n === current && !line.spreadPallets} onClick={() => void choose(n)}>
            <PalletBadge boxes={n} perLayer={product.boxesPerLayer} label={t('pallet.label', { boxes: n, layers: palletLayers(n, product.boxesPerLayer).layers })} unit={0.55} />
            {n === product.boxesPerPallet && <span className="small muted">{t('pallet.standard')}</span>}
          </button>
        ))}
      </div>
      <div className="bpp-custom">
        <Field label={t('pallet.other')}>
          <input type="text" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        </Field>
        {customN > 0 && <PalletBadge boxes={customN} perLayer={product.boxesPerLayer} label={t('pallet.label', { boxes: customN, layers: palletLayers(customN, product.boxesPerLayer).layers })} unit={0.55} />}
        <button type="button" className="button button-primary" disabled={!(customN > 0)} onClick={() => void choose(customN)}>
          {t('admin.save')}
        </button>
      </div>
    </Modal>
  );
}
