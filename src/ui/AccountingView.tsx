import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import { addDays, isoWeek, mondayOf, todayLocal, type LocalDate } from '../days.ts';
import { db } from '../db.ts';
import { accountingRows, deliveredOrders, profitBy, profitOf, weekStatus, type AccountingRow, type Profit } from '../domain/accounting.ts';
import { accountingWorkbook, explain } from '../domain/accountingSheet.ts';
import { accountingSummary, costOn, orderTotals, priceOn } from '../domain/office.ts';
import type { Product } from '../domain/types.ts';
import { xlsx } from '../xlsx.ts';
import { Card, Notice, Page } from './common.tsx';
import { PrintSheet, Summary, SummaryTable } from './OfficeView.tsx';
import { OrderBook } from './OrderBook.tsx';
import { PriceEditor } from './PriceEditor.tsx';

// Ekonomi (accounting; a device can be set to show only this): a week at a time, in calendar
// order – whether the week's deliveries are complete (every order loaded at the dock, with the
// quantities it reported), what was delivered and what it comes to, each line's calculation
// written out, the week per billing company and customer, and the prices, which accounting sets.
// The week downloads as an Excel file (.xlsx) with the same days and the sums as formulas.

const money = (n: number) => n.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 2 });

export function AccountingView() {
  const { t, admin, askPin, settings } = useApp();
  if (!admin && !settings.productionOpen && !settings.accountingDevice)
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

      <ProfitSection rows={rows} days={days} dayName={dayName} />

      <p className="small muted book-legend">{t('book.legend')}</p>
      <OrderBook monday={monday} orders={orders} mode="accounting" today={today} />

      <section className="card">
        <h2 className="card-title">{t('accounting.summaryTitle')}</h2>
        <p className="small muted">{t('accounting.summaryHint')}</p>
        <Summary summary={summary} />
      </section>

      <section className="card">
        <h2 className="card-title">{t('accounting.pricesAndCosts')}</h2>
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
                    <br />
                    {(() => {
                      const c = costOn(p, today);
                      return c ? t('accounting.costLine', { cost: [c.perPallet !== undefined ? `${money(c.perPallet)}/pall` : '', c.perBox !== undefined ? `${money(c.perBox)}/kart.` : ''].filter(Boolean).join(', ') }) : t('accounting.noCost');
                    })()}
                  </span>
                </span>
                <button type="button" className="button" onClick={() => setPricing(p)}>
                  {t('accounting.setPriceCost')}
                </button>
              </li>
            ))}
        </ul>
      </section>
      {pricing && <PriceEditor product={pricing} onClose={() => setPricing(null)} />}
    </Page>
  );
}

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

const pct = (m?: number) => (m === undefined ? '–' : `${(m * 100).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} %`);
const marginClass = (m?: number) => (m === undefined ? '' : m < 0 ? 'profit-bad' : m < 0.15 ? 'profit-low' : 'profit-ok');

/**
 * Veckans vinst: what was delivered, less what it cost to make – big numbers for the week, each
 * day as a square (green = profit, red = loss), and the week per customer and per product, the
 * most profitable first. Rows without a price or a cost are left out and named.
 */
function ProfitSection({ rows, days, dayName }: { rows: AccountingRow[]; days: LocalDate[]; dayName: (d: LocalDate) => string }) {
  const { t } = useApp();
  const week = profitOf(rows);
  const noCost = [...new Set(rows.filter((r) => r.cost.amount === undefined).map((r) => r.product?.name ?? '?'))];
  const byCustomer = profitBy(rows, (r) => r.customer?.name ?? '?');
  const byProduct = profitBy(rows, (r) => r.product?.name ?? '?');
  const maxDay = Math.max(1, ...days.map((d) => Math.abs(profitOf(rows.filter((r) => r.day === d)).profit)));
  return (
    <section className="card profit-card">
      <div className="cal-focus-head">
        <strong>{t('accounting.profitTitle')}</strong>
        <span className="small muted">{t('accounting.profitSub')}</span>
      </div>
      <div className="cal-numbers profit-numbers">
        <div>
          <strong>{money(week.revenue)}</strong>
          <span className="small muted">{t('accounting.revenue')}</span>
        </div>
        <div>
          <strong>{money(week.cost)}</strong>
          <span className="small muted">{t('accounting.cost')}</span>
        </div>
        <div>
          <strong className={`profit-big ${marginClass(week.margin)}`}>{money(week.profit)}</strong>
          <span className="small muted">{t('accounting.grossProfit')}</span>
        </div>
        <div>
          <strong className={`profit-big ${marginClass(week.margin)}`}>{pct(week.margin)}</strong>
          <span className="small muted">{t('accounting.margin')}</span>
        </div>
      </div>
      {noCost.length > 0 && <p className="small warn-text">{t('accounting.noCostRows', { n: week.incomplete, products: noCost.join(', ') })}</p>}
      <div className="profit-days">
        {days.map((d) => {
          const p = profitOf(rows.filter((r) => r.day === d));
          const has = p.revenue > 0;
          return (
            <span key={d} className={`profit-day ${has ? marginClass(p.margin) : 'profit-none'}`} style={{ ['--h' as string]: `${has ? Math.max(8, (Math.abs(p.profit) / maxDay) * 100) : 0}%` }}>
              <span className="small">{dayName(d).split(' ')[0]}</span>
              <strong>{has ? kr0(p.profit) : '–'}</strong>
              <span className="small">{has ? pct(p.margin) : ''}</span>
            </span>
          );
        })}
      </div>
      <h3 className="prod-sub">{t('accounting.perCustomer')}</h3>
      <ProfitTable groups={byCustomer} first={t('pack.customer')} />
      <h3 className="prod-sub">{t('accounting.perProduct')}</h3>
      <ProfitTable groups={byProduct} first={t('protocol.product')} pallets />
    </section>
  );
}

const kr0 = (n: number) => `${Math.round(n).toLocaleString('sv-SE')} kr`;

function ProfitTable({ groups, first, pallets = false }: { groups: { key: string; profit: Profit }[]; first: string; pallets?: boolean }) {
  const { t } = useApp();
  const best = Math.max(0.0001, ...groups.map((g) => g.profit.margin ?? 0));
  return (
    <div className="proto-scroll">
      <table className="proto-table profit-table">
        <thead>
          <tr>
            <th>{first}</th>
            {pallets && <th className="num">{t('pack.palletsWord')}</th>}
            <th className="num">{t('accounting.revenue')}</th>
            <th className="num">{t('accounting.cost')}</th>
            <th className="num">{t('accounting.grossProfit')}</th>
            <th>{t('accounting.margin')}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key}>
              <td>{g.key}</td>
              {pallets && <td className="num">{g.profit.pallets}</td>}
              <td className="num">{money(g.profit.revenue)}</td>
              <td className="num">{money(g.profit.cost)}</td>
              <td className={`num ${marginClass(g.profit.margin)}`}>
                <strong>{money(g.profit.profit)}</strong>
              </td>
              <td>
                <span className="margin-bar">
                  <i className={marginClass(g.profit.margin)} style={{ width: `${Math.max(0, ((g.profit.margin ?? 0) / best) * 100)}%` }} />
                  <span>{pct(g.profit.margin)}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
