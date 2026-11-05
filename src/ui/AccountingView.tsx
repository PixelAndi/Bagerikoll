import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import { addDays, isoWeek, mondayOf, todayLocal, type LocalDate } from '../days.ts';
import { db } from '../db.ts';
import { accountingRows, deliveredDiffers, deliveredOrders, weekStatus, type AccountingRow } from '../domain/accounting.ts';
import { accountingWorkbook, explain } from '../domain/accountingSheet.ts';
import { accountingSummary, orderTotals, priceOn } from '../domain/office.ts';
import type { Product } from '../domain/types.ts';
import { xlsx } from '../xlsx.ts';
import { Card, Notice, Page } from './common.tsx';
import { PrintSheet, Summary, SummaryTable } from './OfficeView.tsx';
import { PriceEditor } from './PriceEditor.tsx';

// Ekonomi (accounting; a device can be set to show only this): a week at a time, in calendar
// order – whether the week's deliveries are complete (every order loaded at the dock, with the
// quantities it reported), what was delivered and what it comes to, each line's calculation
// written out, the week per billing company and customer, and the prices, which accounting sets.
// The week downloads as an Excel file (.xlsx) with the same days and the sums as formulas.

const money = (n: number) => n.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 2 });

export function AccountingView() {
  const { t, admin, askPin, settings } = useApp();
  if (!admin && !settings.productionOpen && !(settings.locked && settings.lockedTo === 'accounting'))
    return (
      <Page title={t('nav.accounting')}>
        <Notice kind="info">{t('accounting.locked')}</Notice>
        <button type="button" className="button button-primary pack-start" onClick={() => askPin()}>
          🔒 {t('accounting.open')}
        </button>
      </Page>
    );
  return <Accounting />;
}

function Accounting() {
  const { t, settings } = useApp();
  const today = todayLocal();
  const [monday, setMonday] = useState(mondayOf(addDays(today, -1)));
  const [print, setPrint] = useState(false);
  const [pricing, setPricing] = useState<Product | null>(null);
  const { customers, products, brands } = useCatalog();
  const sunday = addDays(monday, 6);
  const orders = useLiveQuery(() => db.orders.where('day').between(monday, sunday, true, true).toArray(), [monday]) ?? [];
  const lang = settings.language === 'sv' ? 'sv-SE' : 'en-GB';
  const dayName = (d: LocalDate) => new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  const short = (d: LocalDate) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  const week = isoWeek(monday);
  const weekLabel = `${t('office.week', { week: week.week, year: week.year })} · ${short(monday)} – ${short(sunday)}`;
  const status = weekStatus(orders, monday, sunday);
  const rows = accountingRows(orders, products, customers, monday, sunday);
  const summary = accountingSummary(deliveredOrders(orders), products, customers, brands, monday, sunday);
  const total = rows.reduce((s, r) => s + (r.calc.amount ?? 0), 0);
  const missing = rows.filter((r) => r.calc.amount === undefined);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const download = () => {
    const sheets = accountingWorkbook(orders, products, customers, brands, monday, { weekTitle: `Ekonomi – ${weekLabel}`, dayName, noBiller: t('office.noBillerName'), notDelivered: t('accounting.nothingDelivered') });
    const blob = new Blob([xlsx(sheets) as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ekonomi-v${String(week.week).padStart(2, '0')}-${week.year}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  if (print)
    return (
      <PrintSheet onBack={() => setPrint(false)}>
        <h1 className="print-title">Ekonomi – {weekLabel}</h1>
        <p>{status.complete ? t('accounting.complete') : t('accounting.incomplete', { delivered: status.delivered.length, total: status.orders.length })}</p>
        <RowsTable rows={rows} dayName={dayName} />
        {summary.map((b) => (
          <section key={b.brand?.id ?? 'none'} className="print-day">
            <h2>
              {b.brand?.name ?? t('office.noBillerName')} – {money(b.amount)}
            </h2>
            <SummaryTable biller={b} />
          </section>
        ))}
      </PrintSheet>
    );

  return (
    <Page
      title={t('nav.accounting')}
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
      <section className={`card cal-focus ${status.complete ? 'acc-complete' : ''}`}>
        <div className="cal-focus-head">
          <strong>{weekLabel}</strong>
          {monday !== mondayOf(today) && (
            <button type="button" className="link-button small" onClick={() => setMonday(mondayOf(today))}>
              {t('office.thisWeek')}
            </button>
          )}
        </div>
        <p className="acc-status">
          {!status.orders.length ? (
            <span className="cal-chip">{t('office.noOrdersWeek')}</span>
          ) : status.complete ? (
            <span className="cal-chip cal-chip-ok">✓ {t('accounting.complete')}</span>
          ) : (
            <span className="cal-chip cal-chip-warn">{t('accounting.incomplete', { delivered: status.delivered.length, total: status.orders.length })}</span>
          )}
        </p>
        <div className="cal-numbers office-numbers">
          <div>
            <strong className="pack-figure">{money(total)}</strong>
            <span className="small muted">{missing.length ? t('accounting.deliveredValueMissing') : t('accounting.deliveredValue')}</span>
          </div>
          <div>
            <strong className="pack-figure">{orderTotals(deliveredOrders(orders)).pallets}</strong>
            <span className="small muted">{t('accounting.palletsDelivered')}</span>
          </div>
          <div>
            <strong className="pack-figure">
              {status.delivered.length}/{status.orders.length}
            </strong>
            <span className="small muted">{t('accounting.deliveriesDone')}</span>
          </div>
        </div>
        {summary.length > 0 && (
          <div className="cal-chips">
            {summary.map((b) => (
              <span key={b.brand?.id ?? 'none'} className="cal-chip">
                {b.brand?.name ?? t('office.noBillerName')}: {money(b.amount)}
              </span>
            ))}
          </div>
        )}
        <div className="button-row">
          <button type="button" className="button button-primary" disabled={!rows.length} onClick={download}>
            ⬇ {t('accounting.excel')}
          </button>
          <button type="button" className="button" disabled={!rows.length} onClick={() => setPrint(true)}>
            🖨 {t('protocol.print')}
          </button>
        </div>
        {status.complete || !status.orders.length ? null : <p className="small muted">{t('accounting.excelEarly')}</p>}
      </section>

      {(status.open.length > 0 || missing.length > 0) && (
        <Card title={t('prod.toCheck')} className="cal-check">
          <ul className="cal-check-list">
            {status.open.map((o) => (
              <li key={o.id}>
                {t('accounting.notDelivered', { customer: customers.find((c) => c.id === o.customerId)?.name ?? '?', number: o.orderNumber ? ` #${o.orderNumber}` : '', day: dayName(o.day) })}
              </li>
            ))}
            {[...new Set(missing.map((r) => r.product?.name ?? '?'))].map((name) => (
              <li key={name}>{t('accounting.missingPrice', { product: name })}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="office-week acc-week">
        {days.map((d) => {
          const list = rows.filter((r) => r.day === d);
          const open = status.open.filter((o) => o.day === d);
          return (
            <section key={d} className={`office-day ${d === today ? 'office-today' : ''}`}>
              <header className="office-day-head">
                <strong>{dayName(d)}</strong>
                <span className="small">{money(list.reduce((s, r) => s + (r.calc.amount ?? 0), 0))}</span>
              </header>
              {groupByOrder(list).map((g) => (
                <article key={g[0].order.id} className="office-order office-full acc-order">
                  <div className="office-order-head">
                    <span>
                      {g[0].order.orderNumber && <strong>#{g[0].order.orderNumber} </strong>}
                      <strong>{g[0].customer?.name ?? '?'}</strong>
                    </span>
                    <span className="cal-chip cal-chip-ok">✓ {t('accounting.delivered')}</span>
                  </div>
                  {deliveredDiffers(g[0].order) && <p className="small warn-text">{t('accounting.otherQty')}</p>}
                  <ul className="acc-lines">
                    {g.map((r) => (
                      <li key={r.line.productId}>
                        <span>
                          {r.product?.name ?? '?'} <span className="muted">{r.product?.code}</span>
                        </span>
                        <span className="small acc-calc">{explain(r.calc.pallets, r.calc.boxes, r.calc.boxesPerPallet, r.calc.palletFrom, r.calc.boxFrom, r.calc.price?.perPallet, r.calc.price?.perBox, r.calc.missing)}</span>
                        <strong className={r.calc.amount === undefined ? 'proto-bad' : ''}>{r.calc.amount === undefined ? '–' : money(r.calc.amount)}</strong>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
              {open.map((o) => (
                <article key={o.id} className="office-order office-partly acc-order">
                  <div className="office-order-head">
                    <span>
                      {o.orderNumber && <strong>#{o.orderNumber} </strong>}
                      <strong>{customers.find((c) => c.id === o.customerId)?.name ?? '?'}</strong>
                    </span>
                    <span className="cal-chip cal-chip-warn">{t('accounting.notYet')}</span>
                  </div>
                  <p className="small muted">{t('office.orderPallets', { pallets: orderTotals([o]).pallets })}</p>
                </article>
              ))}
            </section>
          );
        })}
      </div>

      <section className="card">
        <h2 className="card-title">{t('accounting.summaryTitle')}</h2>
        <p className="small muted">{t('accounting.summaryHint')}</p>
        <Summary summary={summary} />
      </section>

      <section className="card">
        <h2 className="card-title">{t('accounting.prices')}</h2>
        <p className="small muted">{t('admin.pricesHint')}</p>
        <ul className="product-rows">
          {[...products]
            .filter((p) => !p.hidden)
            .sort((a, b) => a.name.localeCompare(b.name, 'sv', { numeric: true }))
            .map((p) => (
              <li key={p.id}>
                <span>
                  <strong>{p.name}</strong> <span className="muted">{p.code}</span>
                  <br />
                  <span className="small muted">
                    {(p.customerIds ?? []).length
                      ? (p.customerIds ?? []).map((cid) => {
                          const price = priceOn(p, today, cid);
                          const name = customers.find((c) => c.id === cid)?.name ?? '?';
                          return `${name}: ${price ? [price.perPallet !== undefined ? `${money(price.perPallet)}/pall` : '', price.perBox !== undefined ? `${money(price.perBox)}/kart.` : ''].filter(Boolean).join(', ') + (price.customerId ? '' : ` (${t('pallet.standard')})`) : t('office.noPriceShort')}`;
                        }).join(' · ')
                      : t('admin.noCustomer')}
                  </span>
                </span>
                <button type="button" className="button" onClick={() => setPricing(p)}>
                  {t('accounting.setPrice')}
                </button>
              </li>
            ))}
        </ul>
      </section>
      {pricing && <PriceEditor product={pricing} onClose={() => setPricing(null)} />}
    </Page>
  );
}

const groupByOrder = (rows: AccountingRow[]) => {
  const groups: AccountingRow[][] = [];
  for (const r of rows) {
    const g = groups.find((x) => x[0].order.id === r.order.id);
    if (g) g.push(r);
    else groups.push([r]);
  }
  return groups;
};

/** The delivered rows with their calculation, as on the spreadsheet (for printing). */
function RowsTable({ rows, dayName }: { rows: AccountingRow[]; dayName: (d: LocalDate) => string }) {
  const { t } = useApp();
  return (
    <table className="proto-table">
      <thead>
        <tr>
          <th>{t('protocol.time')}</th>
          <th>{t('office.orderNumber')}</th>
          <th>{t('pack.customer')}</th>
          <th>{t('protocol.product')}</th>
          <th>{t('accounting.calculation')}</th>
          <th className="num">{t('office.amountExVat')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.order.id + r.line.productId}>
            <td>{dayName(r.day)}</td>
            <td>{r.order.orderNumber ?? ''}</td>
            <td>{r.customer?.name ?? '?'}</td>
            <td>{r.product?.name ?? '?'}</td>
            <td>{explain(r.calc.pallets, r.calc.boxes, r.calc.boxesPerPallet, r.calc.palletFrom, r.calc.boxFrom, r.calc.price?.perPallet, r.calc.price?.perBox, r.calc.missing)}</td>
            <td className="num">{r.calc.amount === undefined ? '–' : money(r.calc.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
