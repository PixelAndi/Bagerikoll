import { addDays, type LocalDate } from '../days.ts';
import { deliveredLines } from './accounting.ts';
import { billerCode, lineCalc } from './office.ts';
import type { Sheet } from '../xlsx.ts';
import type { Brand, Customer, Order, Product } from './types.ts';
import { linesWeight, sumWeights } from './weight.ts';

// The order book of a week as one structured dataset, so the same numbers feed the on-screen
// sheet, a selectable-text PDF and an Excel file. Quantities are the ordered ones (what is
// produced), not the delivered ones; pallets are the shipping pallets (PÖS loose-box pallet
// included), the weights the shipping weights (see domain/weight.ts).

export interface ObLine {
  name: string;
  code?: string;
  grams?: number;
  pallets: number;
  boxes: number;
}
export interface ObOrder {
  customer: string;
  mark: string;
  orderNumber?: string;
  lines: ObLine[];
  pallets: number;
  grossKg: number;
  /** Price (kr excl. VAT); undefined when some line has no price. */
  amount?: number;
}
export interface ObDay {
  day: LocalDate;
  label: string;
  pallets: number;
  grossKg: number;
  amount: number;
  orders: ObOrder[];
}
export interface Orderbook {
  weekLabel: string;
  days: ObDay[];
  totalPallets: number;
  totalGrossKg: number;
  totalGoodsKg: number;
  totalAmount: number;
  /** A line somewhere had no price, so the prices are too low. */
  missingPrice: boolean;
  billers: { code: string; pallets: number; amount: number }[];
  incomplete: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildOrderbook(orders: Order[], products: Product[], customers: Customer[], brands: Brand[], monday: LocalDate, weekLabel: string, dayLabel: (d: LocalDate) => string, mode: 'book' | 'accounting' = 'book'): Orderbook {
  const product = (id: string) => products.find((p) => p.id === id);
  const live = orders.filter((o) => !o.cancelled && o.day >= monday && o.day <= addDays(monday, 6));
  const base = Array.from({ length: 5 }, (_, i) => addDays(monday, i));
  const extra = [addDays(monday, 5), addDays(monday, 6)].filter((d) => live.some((o) => o.day === d));
  const dayList = [...base, ...extra];
  const pos = (o: Order) => !!customers.find((c) => c.id === o.customerId)?.palletTransfer;
  const linesOf = (o: Order) => (mode === 'accounting' && o.shippedAt !== undefined ? deliveredLines(o) : o.lines).filter((l) => l.pallets || l.boxes);
  const weightOf = (o: Order) => linesWeight(linesOf(o), product, { looseOnPallet: pos(o) });
  const amountOf = (o: Order) => {
    let amount = 0;
    let missing = false;
    for (const l of linesOf(o)) {
      const a = lineCalc(l, product(l.productId), o.day, o.customerId).amount;
      if (a === undefined) missing = true;
      else amount += a;
    }
    return { amount, missing };
  };
  const markOf = (o: Order) => {
    const b = brands.find((x) => x.id === customers.find((c) => c.id === o.customerId)?.billedBy);
    return b ? billerCode(b) : '';
  };
  const byDay = (d: LocalDate) => live.filter((o) => o.day === d).sort((a, b) => (a.orderNumber ?? '').localeCompare(b.orderNumber ?? '', 'sv', { numeric: true }) || a.createdAt - b.createdAt);

  const days: ObDay[] = dayList.map((d) => {
    const list = byDay(d);
    const w = sumWeights(list.map(weightOf));
    return {
      day: d,
      label: dayLabel(d),
      pallets: list.reduce((s, o) => s + weightOf(o).pallets, 0),
      grossKg: w.grossKg,
      amount: round2(list.reduce((s, o) => s + amountOf(o).amount, 0)),
      orders: list.map((o) => {
        const a = amountOf(o);
        return {
          customer: customers.find((c) => c.id === o.customerId)?.name ?? '?',
          mark: markOf(o),
          orderNumber: o.orderNumber,
          lines: linesOf(o).map((l) => {
            const p = product(l.productId);
            return { name: p?.name ?? '?', code: p?.code, grams: p?.gramsPerBread, pallets: l.pallets, boxes: l.boxes };
          }),
          pallets: weightOf(o).pallets,
          grossKg: weightOf(o).grossKg,
          amount: a.missing ? undefined : round2(a.amount),
        };
      }),
    };
  });

  const weekW = sumWeights(live.map(weightOf));
  const billerMap = new Map<string, { code: string; pallets: number; amount: number }>();
  let missingPrice = false;
  for (const o of live) {
    const b = brands.find((x) => x.id === customers.find((c) => c.id === o.customerId)?.billedBy);
    const code = b ? billerCode(b) : '–';
    const cur = billerMap.get(code) ?? { code, pallets: 0, amount: 0 };
    cur.pallets += weightOf(o).pallets;
    const a = amountOf(o);
    if (a.missing) missingPrice = true;
    else cur.amount += a.amount;
    billerMap.set(code, cur);
  }
  return {
    weekLabel,
    days,
    totalPallets: live.reduce((s, o) => s + weightOf(o).pallets, 0),
    totalGrossKg: weekW.grossKg,
    totalGoodsKg: weekW.goodsKg,
    totalAmount: round2([...billerMap.values()].reduce((s, b) => s + b.amount, 0)),
    missingPrice,
    billers: [...billerMap.values()].map((b) => ({ ...b, amount: round2(b.amount) })).sort((a, b) => a.code.localeCompare(b.code, 'sv')),
    incomplete: weekW.incomplete,
  };
}

/**
 * The order book as Excel sheets (admins open it outside the app; Swedish headers, like the log
 * CSV). mode "book" shows the shipping figures (pallets, weight); "accounting" shows the prices.
 */
export function orderbookSheets(ob: Orderbook, mode: 'book' | 'accounting' = 'book'): Sheet[] {
  const B = (v: string | number) => ({ v, bold: true });
  const kr = (n?: number) => (n === undefined ? 'pris saknas' : { v: n, money: true });
  const krB = (n?: number) => (n === undefined ? B('pris saknas') : { v: n, money: true, bold: true });
  const accounting = mode === 'accounting';

  if (accounting) {
    // Lines (quantities, for reference – no price per line).
    const lineRows: Sheet['rows'] = [[B('Dag'), B('Kund'), B('Märkning'), B('Ordernr'), B('Produkt'), B('Art.nr'), B('Pall'), B('Kartonger')]];
    for (const d of ob.days) for (const o of d.orders) for (const l of o.lines) lineRows.push([d.label, o.customer, o.mark, o.orderNumber ?? '', l.name, l.code ?? '', l.pallets || '', l.boxes || '']);
    // One row per order – the price.
    const orderRows: Sheet['rows'] = [[B('Dag'), B('Kund'), B('Märkning'), B('Ordernr'), B('Belopp (kr)')]];
    for (const d of ob.days) {
      for (const o of d.orders) orderRows.push([d.label, o.customer, o.mark, o.orderNumber ?? '', kr(o.amount)]);
      orderRows.push([B(`Summa ${d.label}`), '', '', '', krB(d.amount)]);
    }
    orderRows.push([B('Totalt vecka'), '', '', '', krB(ob.totalAmount)]);
    const sumRows: Sheet['rows'] = [
      [B('Vecka'), ob.weekLabel],
      [B('Summa (kr exkl. moms)'), krB(ob.totalAmount)],
      ...(ob.missingPrice ? [[B('Obs'), 'pris saknas för någon rad – summan är för låg'] as Sheet['rows'][number]] : []),
      [],
      [B('Per fakturerande bolag'), ''],
      ...ob.billers.map((x) => [x.code, kr(x.amount)] as Sheet['rows'][number]),
    ];
    return [
      { name: 'Sammanfattning', rows: sumRows, widths: [26, 16] },
      { name: 'Order', rows: orderRows, widths: [14, 22, 10, 10, 14] },
      { name: 'Rader', rows: lineRows, widths: [14, 22, 10, 10, 26, 10, 7, 10] },
    ];
  }

  // Shipping (book).
  const lineRows: Sheet['rows'] = [[B('Dag'), B('Kund'), B('Märkning'), B('Ordernr'), B('Produkt'), B('Art.nr'), B('Vikt (g)'), B('Pall'), B('Kartonger')]];
  for (const d of ob.days) for (const o of d.orders) for (const l of o.lines) lineRows.push([d.label, o.customer, o.mark, o.orderNumber ?? '', l.name, l.code ?? '', l.grams ?? '', l.pallets || '', l.boxes || '']);
  const orderRows: Sheet['rows'] = [[B('Dag'), B('Kund'), B('Märkning'), B('Ordernr'), B('Pallar (frakt)'), B('Bruttovikt (kg)')]];
  for (const d of ob.days) {
    for (const o of d.orders) orderRows.push([d.label, o.customer, o.mark, o.orderNumber ?? '', o.pallets, o.grossKg]);
    orderRows.push([B(`Summa ${d.label}`), '', '', '', B(d.pallets), B(d.grossKg)]);
  }
  orderRows.push([B('Totalt vecka'), '', '', '', B(ob.totalPallets), B(ob.totalGrossKg)]);
  const sumRows: Sheet['rows'] = [
    [B('Vecka'), ob.weekLabel],
    [B('Pallar (frakt)'), ob.totalPallets],
    [B('Bruttovikt (kg)'), ob.totalGrossKg],
    [B('Kartongvikt utan pall (kg)'), ob.totalGoodsKg],
    [],
    [B('Pallar per märkning'), ''],
    ...ob.billers.map((x) => [x.code, x.pallets]),
  ];
  return [
    { name: 'Sammanfattning', rows: sumRows, widths: [26, 16] },
    { name: 'Order', rows: orderRows, widths: [14, 22, 10, 10, 13, 15] },
    { name: 'Rader', rows: lineRows, widths: [14, 22, 10, 10, 26, 10, 9, 7, 10] },
  ];
}
