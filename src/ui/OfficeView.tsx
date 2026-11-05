import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import { addDays, isoWeek, mondayOf, todayLocal, type LocalDate } from '../days.ts';
import { db } from '../db.ts';
import { accountingSummary, duplicateNumbers, lineAmount, orderTotals, planState, priceOn, summaryCsv, type BillerSummary } from '../domain/office.ts';
import type { Order } from '../domain/types.ts';
import { Card, Modal, Notice, Page } from './common.tsx';
import { OrderEditor } from './OrderEditor.tsx';

// Kontor (managers; a computer, tablet or phone): the paper orders entered on the day they are
// picked up, a week at a time. Each product on an order is ticked as planned for production; an
// order with every product ticked is marked fully planned. Orders can be moved to another day
// (a button, or dragged on a computer). A week – or a day – prints as a list, and the week's
// summary for accounting is split by the company that bills each customer, priced from Admin.

export function OfficeView() {
  const { t, admin, askPin, settings } = useApp();
  if (!admin && !settings.productionOpen)
    return (
      <Page title={t('office.title')}>
        <Notice kind="info">{t('office.locked')}</Notice>
        <button type="button" className="button button-primary pack-start" onClick={() => askPin()}>
          🔒 {t('office.open')}
        </button>
      </Page>
    );
  return <Office />;
}

type Print = { kind: 'week' } | { kind: 'day'; day: LocalDate } | { kind: 'summary' };

const money = (n: number) => n.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 2 });

function Office() {
  const { t, settings } = useApp();
  const today = todayLocal();
  const [monday, setMonday] = useState(mondayOf(today));
  const [editing, setEditing] = useState<Order | { newOn: LocalDate } | null>(null);
  const [moving, setMoving] = useState<Order | null>(null);
  const [print, setPrint] = useState<Print | null>(null);
  const { customers, products, brands } = useCatalog();
  const sunday = addDays(monday, 6);
  const orders = useLiveQuery(() => db.orders.where('day').between(monday, sunday, true, true).toArray(), [monday]) ?? [];
  const allOrders = useLiveQuery(() => db.orders.toArray(), []) ?? [];
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const week = isoWeek(monday);
  const lang = settings.language === 'sv' ? 'sv-SE' : 'en-GB';
  const dayName = (d: LocalDate, style: 'long' | 'short' = 'long') => new Intl.DateTimeFormat(lang, { weekday: style, day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  const range = `${new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${monday}T00:00:00Z`))} – ${new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${sunday}T00:00:00Z`))}`;
  const live = orders.filter((o) => !o.cancelled);
  const full = live.filter((o) => planState(o).full).length;
  const summary = accountingSummary(orders, products, customers, brands, monday, sunday);
  const weekAmount = summary.reduce((s, b) => s + b.amount, 0);
  const missingPrice = summary.some((b) => b.missingPrice);
  const dupes = duplicateNumbers(allOrders);
  const byDay = (d: LocalDate) => orders.filter((o) => o.day === d).sort((a, b) => (a.orderNumber ?? '').localeCompare(b.orderNumber ?? '', 'sv', { numeric: true }) || a.createdAt - b.createdAt);
  const weekLabel = t('office.week', { week: week.week, year: week.year });

  if (print)
    return (
      <PrintSheet onBack={() => setPrint(null)}>
        {print.kind === 'summary' ? (
          <SummarySheet summary={summary} title={t('office.summaryTitle', { week: weekLabel, range })} />
        ) : (
          <OrdersSheet title={print.kind === 'day' ? dayName(print.day) : `${weekLabel} · ${range}`} days={print.kind === 'day' ? [print.day] : days} byDay={byDay} dayName={dayName} />
        )}
      </PrintSheet>
    );

  // Undated checks: lines not planned for orders picked up today or tomorrow, duplicate numbers,
  // customers without a billing company, products this week without a price.
  const soon = live.filter((o) => (o.day === today || o.day === addDays(today, 1)) && !planState(o).full);
  const noBiller = [...new Set(live.map((o) => o.customerId))].map((id) => customers.find((c) => c.id === id)).filter((c) => c && (!c.billedBy || !brands.some((b) => b.id === c.billedBy)));
  const noPrice = [...new Set(live.flatMap((o) => o.lines.filter((l) => !priceOn(products.find((p) => p.id === l.productId), o.day)).map((l) => l.productId)))].map((id) => products.find((p) => p.id === id)?.name ?? '?');
  const weekDupes = live.filter((o) => o.orderNumber && dupes.has(o.orderNumber)).map((o) => o.orderNumber!);

  return (
    <Page
      title={t('office.title')}
      actions={
        <span className="cal-year-nav">
          <button type="button" className="link-inline" onClick={() => setMonday(addDays(monday, -7))} aria-label={t('common.previous')}>
            ‹
          </button>
          <button type="button" className="link-inline" onClick={() => setMonday(addDays(monday, 7))} aria-label={t('common.next')}>
            ›
          </button>
        </span>
      }
    >
      <section className="card cal-focus">
        <div className="cal-focus-head">
          <strong>
            {weekLabel} · {range}
          </strong>
          {monday !== mondayOf(today) && (
            <button type="button" className="link-button small" onClick={() => setMonday(mondayOf(today))}>
              {t('office.thisWeek')}
            </button>
          )}
        </div>
        <div className="cal-numbers office-numbers">
          <div>
            <strong className="pack-figure">{orderTotals(orders).pallets}</strong>
            <span className="small muted">{t('office.palletsWeek', { boxes: orderTotals(orders).boxes })}</span>
          </div>
          <div>
            <strong className="pack-figure">{live.length}</strong>
            <span className="small muted">{t('office.orders')}</span>
          </div>
          <div>
            <strong className="pack-figure">
              {full}/{live.length}
            </strong>
            <span className="small muted">{t('office.fullyPlanned')}</span>
          </div>
          <div>
            <strong className="pack-figure">{money(weekAmount)}</strong>
            <span className="small muted">{missingPrice ? t('office.amountMissing') : t('office.amount')}</span>
          </div>
        </div>
        {summary.length > 0 && (
          <div className="cal-chips">
            {summary.map((b) => (
              <span key={b.brand?.id ?? 'none'} className="cal-chip">
                {t('office.billerPallets', { biller: b.brand?.name ?? t('office.noBillerName'), pallets: b.pallets })}
              </span>
            ))}
          </div>
        )}
        <div className="button-row">
          <button type="button" className="button button-primary" onClick={() => setEditing({ newOn: monday <= today && today <= sunday ? today : monday })}>
            + {t('prod.newOrder')}
          </button>
          <button type="button" className="button" onClick={() => setPrint({ kind: 'week' })}>
            🖨 {t('office.printWeek')}
          </button>
          <a className="button" href="#office-summary">
            {t('office.toSummary')}
          </a>
        </div>
      </section>

      {(soon.length > 0 || noBiller.length > 0 || noPrice.length > 0 || weekDupes.length > 0) && (
        <Card title={t('prod.toCheck')} className="cal-check">
          <ul className="cal-check-list">
            {soon.map((o) => (
              <li key={o.id}>
                {t('office.notPlannedSoon', { number: o.orderNumber ? `#${o.orderNumber} ` : '', customer: customers.find((c) => c.id === o.customerId)?.name ?? '?', day: dayName(o.day, 'short') })}
              </li>
            ))}
            {weekDupes.length > 0 && <li>{t('office.dupes', { numbers: [...new Set(weekDupes)].join(', ') })}</li>}
            {noBiller.length > 0 && <li>{t('office.noBiller', { customers: noBiller.map((c) => c!.name).join(', ') })}</li>}
            {noPrice.length > 0 && <li>{t('office.noPrice', { products: noPrice.join(', ') })}</li>}
          </ul>
        </Card>
      )}

      <div className="office-week">
        {days.map((d) => (
          <DayColumn key={d} day={d} label={dayName(d)} today={d === today} orders={byDay(d)} dupes={dupes} onNew={() => setEditing({ newOn: d })} onEdit={setEditing} onMove={setMoving} onPrint={() => setPrint({ kind: 'day', day: d })} />
        ))}
      </div>

      <section className="card" id="office-summary">
        <div className="cal-focus-head">
          <strong>{t('office.summaryTitle', { week: weekLabel, range })}</strong>
        </div>
        <p className="small muted">{t('office.summaryHint')}</p>
        <Summary summary={summary} />
        <div className="button-row">
          <button type="button" className="button button-primary" disabled={!summary.length} onClick={() => setPrint({ kind: 'summary' })}>
            🖨 {t('office.printSummary')}
          </button>
          <button
            type="button"
            className="button"
            disabled={!summary.length}
            onClick={() => {
              const blob = new Blob(['﻿' + summaryCsv(summary, weekLabel, t('office.noBillerName'))], { type: 'text/csv;charset=utf-8' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `ekonomi-v${week.week}-${week.year}.csv`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            {t('admin.export')}
          </button>
        </div>
      </section>

      {editing && <OrderEditor order={'newOn' in editing ? undefined : editing} day={'newOn' in editing ? editing.newOn : editing.day} onClose={() => setEditing(null)} />}
      {moving && <MoveOrder order={moving} onClose={() => setMoving(null)} dayName={dayName} />}
    </Page>
  );
}

/** A day of the week: its orders; a computer can drop a dragged order here to move it. */
function DayColumn({ day, label, today, orders, dupes, onNew, onEdit, onMove, onPrint }: { day: LocalDate; label: string; today: boolean; orders: Order[]; dupes: Set<string>; onNew: () => void; onEdit: (o: Order) => void; onMove: (o: Order) => void; onPrint: () => void }) {
  const { t } = useApp();
  const [over, setOver] = useState(false);
  const live = orders.filter((o) => !o.cancelled);
  return (
    <section
      className={`office-day ${today ? 'office-today' : ''} ${over ? 'office-drop' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData('text/plain');
        if (id) void db.orders.update(id, { day });
      }}
    >
      <header className="office-day-head">
        <span>
          <strong>{label}</strong>
          <span className="small muted"> · {t(live.length === 1 ? 'office.dayCountOne' : 'office.dayCount', { n: live.length })}</span>
        </span>
        <span className="office-day-pallets" title={t('office.dayPallets')}>
          {orderTotals(orders).pallets}
          <span className="small"> {t('today.palletsShort')}</span>
        </span>
      </header>
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} duplicate={!!o.orderNumber && dupes.has(o.orderNumber)} onEdit={() => onEdit(o)} onMove={() => onMove(o)} />
      ))}
      <div className="office-day-buttons">
        <button type="button" className="button button-small" onClick={onNew}>
          + {t('office.order')}
        </button>
        {live.length > 0 && (
          <button type="button" className="link-button small" onClick={onPrint}>
            🖨 {t('office.printDay')}
          </button>
        )}
      </div>
    </section>
  );
}

/** One order: number, customer, billing company, each product with its "planned" tick. */
function OrderCard({ order, duplicate, onEdit, onMove }: { order: Order; duplicate: boolean; onEdit: () => void; onMove: () => void }) {
  const { t } = useApp();
  const { customers, products, brands } = useCatalog();
  const customer = customers.find((c) => c.id === order.customerId);
  const biller = brands.find((b) => b.id === customer?.billedBy);
  const state = planState(order);
  const toggle = (productId: string) =>
    db.orders.update(order.id, { lines: order.lines.map((l) => (l.productId === productId ? { ...l, plannedAt: l.plannedAt ? undefined : Date.now() } : l)) });
  const amount = order.lines.reduce<number | undefined>((s, l) => {
    const a = lineAmount(l, products.find((p) => p.id === l.productId), order.day);
    return s === undefined || a === undefined ? undefined : s + a;
  }, 0);
  return (
    <article
      className={`office-order ${order.cancelled ? 'office-cancelled' : state.full ? 'office-full' : state.planned ? 'office-partly' : ''}`}
      draggable={!order.cancelled}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', order.id)}
    >
      <div className="office-order-head">
        <span>
          {order.orderNumber && <strong className={duplicate ? 'warn-text' : ''}>#{order.orderNumber} </strong>}
          <strong>{customer?.name ?? '?'}</strong>
          {biller && <span className="small muted"> · {biller.name}</span>}
        </span>
        {order.cancelled ? (
          <span className="cal-chip">{t('prod.cancelled')}</span>
        ) : state.full ? (
          <span className="cal-chip cal-chip-ok">✓ {t('office.full')}</span>
        ) : (
          <span className="cal-chip cal-chip-warn">{t('office.partly', { planned: state.planned, total: state.total })}</span>
        )}
      </div>
      <ul className="office-lines">
        {order.lines
          .filter((l) => l.pallets || l.boxes)
          .map((l) => {
            const p = products.find((x) => x.id === l.productId);
            return (
              <li key={l.productId}>
                <label className={`office-line ${l.plannedAt ? 'on' : ''}`}>
                  <input type="checkbox" checked={!!l.plannedAt} disabled={order.cancelled} onChange={() => void toggle(l.productId)} />
                  <span className="office-line-text">
                    <span className="office-line-name">
                      {p?.name ?? '?'}
                      {p?.code && <span className="muted"> {p.code}</span>}
                    </span>
                    <strong className="office-line-qty">{[l.pallets ? t('prod.nPallets', { n: l.pallets }) : '', l.boxes ? t('prod.nBoxes', { n: l.boxes }) : ''].filter(Boolean).join(' + ')}</strong>
                  </span>
                </label>
              </li>
            );
          })}
      </ul>
      {order.note && <p className="small muted">{order.note}</p>}
      <div className="office-order-foot">
        <span className="small">
          <strong>{t('office.orderPallets', { pallets: orderTotals([order]).pallets })}</strong>
          {orderTotals([order]).boxes > 0 && ` + ${t('prod.nBoxes', { n: orderTotals([order]).boxes })}`}
          <span className="muted"> · {amount === undefined ? t('office.noPriceShort') : money(amount)}</span>
        </span>
        <span>
          <button type="button" className="link-button small" onClick={onMove} disabled={order.cancelled}>
            {t('office.move')}
          </button>
          <button type="button" className="link-button small" onClick={onEdit}>
            {t('admin.edit')}
          </button>
        </span>
      </div>
    </article>
  );
}

function MoveOrder({ order, onClose, dayName }: { order: Order; onClose: () => void; dayName: (d: LocalDate, s?: 'long' | 'short') => string }) {
  const { t } = useApp();
  const [day, setDay] = useState(order.day);
  const move = async () => {
    await db.orders.update(order.id, { day });
    onClose();
  };
  return (
    <Modal title={t('office.moveTitle', { order: order.orderNumber ? `#${order.orderNumber}` : '' })} onClose={onClose}>
      <p className="small muted">{t('office.moveFrom', { day: dayName(order.day) })}</p>
      <div className="cal-chips pack-brands">
        {[-1, 1, 2, 7].map((n) => (
          <button key={n} type="button" className={`cal-chip ${day === addDays(order.day, n) ? 'pack-chip-on' : ''}`} onClick={() => setDay(addDays(order.day, n))}>
            {n === -1 ? t('office.dayBefore') : n === 1 ? t('office.dayAfter') : n === 7 ? t('office.weekAfter') : dayName(addDays(order.day, n), 'short')}
          </button>
        ))}
      </div>
      <input type="date" value={day} aria-label={t('office.pickupDay')} onChange={(e) => e.target.value && setDay(e.target.value)} />
      <button type="button" className="button button-primary pack-start" disabled={day === order.day} onClick={() => void move()}>
        {t('office.moveTo', { day: dayName(day) })}
      </button>
    </Modal>
  );
}

/** The accounting summary on screen: per billing company, per customer, per product. */
function Summary({ summary }: { summary: BillerSummary[] }) {
  const { t } = useApp();
  if (!summary.length) return <p className="muted">{t('office.noOrdersWeek')}</p>;
  return (
    <div className="office-summary">
      {summary.map((b) => (
        <section key={b.brand?.id ?? 'none'} className="office-biller">
          <div className="cal-focus-head">
            <strong>
              {b.brand?.name ?? t('office.noBillerName')} <span className="muted">· {t('office.billerTotals', { pallets: b.pallets, boxes: b.boxes })}</span>
            </strong>
            <strong className="office-biller-sum">{money(b.amount)}</strong>
          </div>
          {b.missingPrice && <p className="small warn-text">{t('office.missingInBiller')}</p>}
          <SummaryTable biller={b} />
        </section>
      ))}
    </div>
  );
}

function SummaryTable({ biller }: { biller: BillerSummary }) {
  const { t } = useApp();
  return (
    <div className="proto-scroll">
      <table className="proto-table office-table">
        <thead>
          <tr>
            <th>{t('pack.customer')}</th>
            <th>{t('protocol.product')}</th>
            <th className="num">{t('pack.palletsWord')}</th>
            <th className="num">{t('pack.boxesWord')}</th>
            <th className="num">{t('office.amountExVat')}</th>
          </tr>
        </thead>
        <tbody>
          {biller.customers.flatMap((c) => [
            ...c.rows.map((r, i) => (
              <tr key={`${c.customerId}-${r.productId}`}>
                <td>{i === 0 ? <strong>{c.customer?.name ?? '?'}</strong> : ''}</td>
                <td>
                  {r.product?.name ?? '?'}
                  {r.product?.code && <span className="muted"> {r.product.code}</span>}
                </td>
                <td className="num">{r.pallets}</td>
                <td className="num">{r.boxes}</td>
                <td className="num">{r.amount === undefined ? <span className="proto-bad">{t('office.noPriceShort')}</span> : money(r.amount)}</td>
              </tr>
            )),
            <tr key={`${c.customerId}-sum`} className="office-subtotal">
              <td colSpan={4}>{t('office.customerTotal', { customer: c.customer?.name ?? '?', orders: t(c.orders === 1 ? 'office.dayCountOne' : 'office.dayCount', { n: c.orders }) })}</td>
              <td className="num">
                <strong>{money(c.amount)}</strong>
                {c.missingPrice && ' *'}
              </td>
            </tr>,
          ])}
        </tbody>
      </table>
    </div>
  );
}

/** A page to print: only the sheet, with a way back; the print dialog opens by itself. */
function PrintSheet({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const { t } = useApp();
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main className="page print-sheet">
      <div className="button-row no-print">
        <button type="button" className="button" onClick={onBack}>
          ‹ {t('common.back')}
        </button>
        <button type="button" className="button button-primary" onClick={() => window.print()}>
          🖨 {t('protocol.print')}
        </button>
      </div>
      {children}
    </main>
  );
}

function OrdersSheet({ title, days, byDay, dayName }: { title: string; days: LocalDate[]; byDay: (d: LocalDate) => Order[]; dayName: (d: LocalDate, s?: 'long' | 'short') => string }) {
  const { t } = useApp();
  const { customers, products, brands } = useCatalog();
  return (
    <>
      <h1 className="print-title">{t('office.ordersTitle', { what: title })}</h1>
      {days.map((d) => {
        const list = byDay(d).filter((o) => !o.cancelled);
        if (!list.length && days.length > 1) return null;
        return (
          <section key={d} className="print-day">
            <h2>
              {dayName(d)}
              {list.length > 0 && ` – ${t('office.billerTotals', orderTotals(list))}`}
            </h2>
            {!list.length ? (
              <p>{t('office.noOrdersDay')}</p>
            ) : (
              <table className="proto-table">
                <thead>
                  <tr>
                    <th>{t('office.orderNumber')}</th>
                    <th>{t('pack.customer')}</th>
                    <th>{t('office.billedBy')}</th>
                    <th>{t('protocol.product')}</th>
                    <th className="num">{t('pack.palletsWord')}</th>
                    <th className="num">{t('pack.boxesWord')}</th>
                    <th>{t('office.plannedCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.flatMap((o) => {
                    const c = customers.find((x) => x.id === o.customerId);
                    const lines = o.lines.filter((l) => l.pallets || l.boxes);
                    return lines.map((l, i) => {
                      const p = products.find((x) => x.id === l.productId);
                      return (
                        <tr key={`${o.id}-${l.productId}`} className={i === 0 ? 'print-order-start' : ''}>
                          <td>{i === 0 && o.orderNumber ? `#${o.orderNumber}` : ''}</td>
                          <td>{i === 0 ? c?.name : ''}</td>
                          <td>{i === 0 ? (brands.find((b) => b.id === c?.billedBy)?.name ?? '') : ''}</td>
                          <td>
                            {p?.name ?? '?'} {p?.code && <span className="muted">{p.code}</span>}
                          </td>
                          <td className="num">{l.pallets || ''}</td>
                          <td className="num">{l.boxes || ''}</td>
                          <td>{l.plannedAt ? '✓' : '☐'}</td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </>
  );
}

function SummarySheet({ summary, title }: { summary: BillerSummary[]; title: string }) {
  const { t } = useApp();
  return (
    <>
      <h1 className="print-title">{title}</h1>
      {summary.map((b) => (
        <section key={b.brand?.id ?? 'none'} className="print-day">
          <h2>
            {b.brand?.name ?? t('office.noBillerName')} – {t('office.billerTotals', { pallets: b.pallets, boxes: b.boxes })} – {money(b.amount)}
          </h2>
          <SummaryTable biller={b} />
          {b.missingPrice && <p className="small">{t('office.missingInBiller')}</p>}
        </section>
      ))}
      <p className="small">{t('office.printedAt', { when: new Date().toLocaleString('sv-SE') })}</p>
    </>
  );
}
