import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import { addDays, isoWeek, mondayOf, todayLocal, type LocalDate } from '../days.ts';
import { db } from '../db.ts';
import { accountingRows, deliveredLines, deliveredOrders, profitBy, profitOf, weekStatus, type AccountingRow, type Profit } from '../domain/accounting.ts';
import { accountingWorkbook } from '../domain/accountingSheet.ts';
import { buildOrderbook, orderbookSheets } from '../domain/orderbook.ts';
import { linesWeight, sumWeights } from '../domain/weight.ts';
import { accountingSummary, billerCode, costOn, lineCalc, orderTotals, priceOn } from '../domain/office.ts';
import type { Brand, Customer, Order, Product } from '../domain/types.ts';
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
  const [print, setPrint] = useState<null | 'full' | 'book'>(null);
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
      <PrintSheet
        onBack={() => setPrint(null)}
        pdfName={print === 'full' ? `ekonomi-v${String(week.week).padStart(2, '0')}-${week.year}.pdf` : undefined}
        onPdf={
          print === 'book'
            ? async () => {
                const { saveOrderbookPdf } = await import('../pdf/orderbookPdf.ts');
                await saveOrderbookPdf(buildOrderbook(orders, products, customers, brands, monday, weekLabel, dayName), `orderbok-v${String(week.week).padStart(2, '0')}-${week.year}.pdf`);
              }
            : undefined
        }
        onXlsx={
          print === 'book'
            ? async () => {
                const sheets = orderbookSheets(buildOrderbook(orders, products, customers, brands, monday, weekLabel, dayName));
                const blob = new Blob([xlsx(sheets) as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `orderbok-v${String(week.week).padStart(2, '0')}-${week.year}.xlsx`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 1000);
              }
            : undefined
        }
      >
        <h1 className="print-title">{print === 'book' ? `${t('accounting.orderBookTitle')} – ${weekLabel}` : `Ekonomi – ${weekLabel}`}</h1>
        {print === 'full' && <p className="print-status">{status.complete ? t('accounting.complete') : t('accounting.incomplete', { delivered: status.delivered.length, total: status.orders.length })}</p>}
        <WeekSheet monday={monday} orders={orders} products={products} customers={customers} brands={brands} dayName={dayName} amounts={print === 'full'} />
        {print === 'full' && (
          <>
            <h2 className="print-sub-title">{t('accounting.invoiceBasis')}</h2>
            {summary.map((b) => (
              <section key={b.brand?.id ?? 'none'} className="print-day">
                <h2>
                  {b.brand?.name ?? t('office.noBillerName')} – {money(b.amount)}
                </h2>
                <SummaryTable biller={b} />
              </section>
            ))}
          </>
        )}
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
          <button type="button" className="button" disabled={!rows.length} onClick={() => setPrint('full')}>
            🖨 {t('office.printWeek')}
          </button>
          <button type="button" className="button" disabled={!status.orders.length} onClick={() => setPrint('book')}>
            🖨 {t('accounting.orderBookTitle')}
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


/**
 * The week to print: the days side by side (as on screen), each with its orders – customer,
 * billing mark, order number, the products and their pallets/boxes, whether it was loaded, and
 * the order's amount – with day and week totals. Black on white, thin rules, no fills, for A4
 * landscape with little ink.
 */
function WeekSheet({ monday, orders, products, customers, brands, dayName, amounts = true }: { monday: LocalDate; orders: Order[]; products: Product[]; customers: Customer[]; brands: Brand[]; dayName: (d: LocalDate) => string; amounts?: boolean }) {
  const { t } = useApp();
  const live = orders.filter((o) => !o.cancelled);
  const base = Array.from({ length: 5 }, (_, i) => addDays(monday, i));
  const extra = [addDays(monday, 5), addDays(monday, 6)].filter((d) => live.some((o) => o.day === d));
  const days = [...base, ...extra];
  const byDay = (d: LocalDate) => live.filter((o) => o.day === d).sort((a, b) => (a.orderNumber ?? '').localeCompare(b.orderNumber ?? '', 'sv', { numeric: true }) || a.createdAt - b.createdAt);
  const product = (id: string) => products.find((p) => p.id === id);
  const loaded = (o: Order) => o.shippedAt !== undefined;
  const linesOf = (o: Order) => (amounts && loaded(o) ? deliveredLines(o) : o.lines).filter((l) => l.pallets || l.boxes);
  const orderAmount = (o: Order) => {
    let amount = 0;
    let missing = false;
    for (const l of linesOf(o)) {
      const a = lineCalc(l, product(l.productId), o.day, o.customerId).amount;
      if (a === undefined) missing = true;
      else amount += a;
    }
    return { amount, missing };
  };
  const orderPallets = (o: Order) => orderTotals([{ ...o, lines: linesOf(o) }]).pallets;
  const mark = (o: Order) => {
    const b = brands.find((x) => x.id === customers.find((c) => c.id === o.customerId)?.billedBy);
    return b ? billerCode(b) : '';
  };
  const kg = (n: number) => `${n.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} kg`;
  const pos = (o: Order) => !!customers.find((c) => c.id === o.customerId)?.palletTransfer;
  const weightOf = (o: Order) => linesWeight(linesOf(o), product, { looseOnPallet: pos(o) });
  // The order book is for shipping, so it counts the real (shipping) pallets, PÖS included.
  const palletsOf = (o: Order) => (amounts ? orderPallets(o) : weightOf(o).pallets);
  const weekW = sumWeights(live.map(weightOf));
  const weekAmount = live.reduce((s, o) => s + orderAmount(o).amount, 0);
  const weekPallets = live.reduce((s, o) => s + palletsOf(o), 0);
  // Split the week by billing company over the same orders as the totals (not delivered-only), so it reconciles.
  const billerMap = new Map<string, { brand?: Brand; amount: number }>();
  for (const o of live) {
    const brand = brands.find((x) => x.id === customers.find((c) => c.id === o.customerId)?.billedBy);
    const key = brand?.id ?? 'none';
    const cur = billerMap.get(key) ?? { brand, amount: 0 };
    cur.amount += orderAmount(o).amount;
    billerMap.set(key, cur);
  }
  const billerPallets = new Map<string, number>();
  for (const o of live) {
    const brand = brands.find((x) => x.id === customers.find((c) => c.id === o.customerId)?.billedBy);
    billerPallets.set(brand?.id ?? 'none', (billerPallets.get(brand?.id ?? 'none') ?? 0) + palletsOf(o));
  }
  const billerTotals = [...billerMap.values()].map((b) => ({ ...b, pallets: billerPallets.get(b.brand?.id ?? 'none') ?? 0 })).sort((a, b) => (a.brand?.name ?? 'ÿ').localeCompare(b.brand?.name ?? 'ÿ', 'sv'));

  return (
    <section className={`week-sheet ${amounts ? '' : 'book'}`}>
      <div className="week-cols" style={{ ['--cols' as string]: String(days.length) }}>
        {days.map((d) => {
          const list = byDay(d);
          const pallets = list.reduce((s, o) => s + palletsOf(o), 0);
          const amount = list.reduce((s, o) => s + orderAmount(o).amount, 0);
          const dayW = sumWeights(list.map(weightOf));
          return (
            <div key={d} className="week-day">
              <div className="week-day-head">
                <span className="week-day-name">{dayName(d)}</span>
                <span className="week-day-tot">{amounts ? `${t('office.orderPallets', { pallets })} · ${money(amount)}` : `${t('office.orderPallets', { pallets })} · ${kg(dayW.grossKg)}`}</span>
              </div>
              {!list.length ? (
                <p className="week-empty">{t('office.noOrdersDay')}</p>
              ) : (
                list.map((o) => {
                  const a = orderAmount(o);
                  return (
                    <div key={o.id} className="week-order">
                      <div className="week-order-head">
                        <span className="week-cust">
                          {customers.find((c) => c.id === o.customerId)?.name ?? '?'}
                          {mark(o) && <span className="week-mark">{mark(o)}</span>}
                          {o.orderNumber && <span className="week-ono">#{o.orderNumber}</span>}
                        </span>
                        {amounts && <span className={`week-state ${loaded(o) ? '' : 'week-open'}`}>{loaded(o) ? '✓' : t('accounting.notYet')}</span>}
                      </div>
                      {linesOf(o).map((l) => {
                        const p = product(l.productId);
                        return (
                          <div key={l.productId} className="week-line">
                            <span className="week-line-left">
                              <span className="week-prod">{p?.name ?? '?'}</span>
                              {!amounts && p?.gramsPerBread ? <span className="week-wt">{p.gramsPerBread} g</span> : null}
                            </span>
                            <span className="week-qty">{[l.pallets ? t('office.orderPallets', { pallets: l.pallets }) : '', l.boxes ? `${l.boxes} ${t('pack.boxShort')}` : ''].filter(Boolean).join(' ')}</span>
                          </div>
                        );
                      })}
                      <div className="week-order-foot">
                        <span>{t('office.orderPallets', { pallets: palletsOf(o) })}{!amounts ? ` · ${kg(weightOf(o).grossKg)}` : ''}</span>
                        {amounts && <span>{a.missing ? t('office.noPriceShort') : money(a.amount)}</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
      <div className="week-total">
        <span>
          {t('accounting.weekTotal')}: {t('office.orderPallets', { pallets: weekPallets })}
          {!amounts && ` · ${kg(weekW.grossKg)}`}
        </span>
        <span className="week-total-billers">
          {billerTotals.map((b) => (
            <span key={b.brand?.id ?? 'none'}>
              {b.brand ? billerCode(b.brand) : t('office.noBillerName')} {amounts ? money(b.amount) : t('office.orderPallets', { pallets: b.pallets })}
            </span>
          ))}
          {amounts ? <strong>{money(weekAmount)}</strong> : <strong>{t('accounting.boxesWeight', { kg: kg(weekW.goodsKg) })}{weekW.incomplete ? ' *' : ''}</strong>}
        </span>
      </div>
      {!amounts && weekW.incomplete && <p className="week-note">* {t('accounting.weightMissing')}</p>}
    </section>
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
