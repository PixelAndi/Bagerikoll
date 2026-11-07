import { addDays, type LocalDate } from '../days.ts';
import { billerCode } from './office.ts';
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
}
export interface ObDay {
  day: LocalDate;
  label: string;
  pallets: number;
  grossKg: number;
  orders: ObOrder[];
}
export interface Orderbook {
  weekLabel: string;
  days: ObDay[];
  totalPallets: number;
  totalGrossKg: number;
  totalGoodsKg: number;
  billers: { code: string; pallets: number }[];
  incomplete: boolean;
}

export function buildOrderbook(orders: Order[], products: Product[], customers: Customer[], brands: Brand[], monday: LocalDate, weekLabel: string, dayLabel: (d: LocalDate) => string): Orderbook {
  const product = (id: string) => products.find((p) => p.id === id);
  const live = orders.filter((o) => !o.cancelled && o.day >= monday && o.day <= addDays(monday, 6));
  const base = Array.from({ length: 5 }, (_, i) => addDays(monday, i));
  const extra = [addDays(monday, 5), addDays(monday, 6)].filter((d) => live.some((o) => o.day === d));
  const dayList = [...base, ...extra];
  const pos = (o: Order) => !!customers.find((c) => c.id === o.customerId)?.palletTransfer;
  const linesOf = (o: Order) => o.lines.filter((l) => l.pallets || l.boxes);
  const weightOf = (o: Order) => linesWeight(linesOf(o), product, { looseOnPallet: pos(o) });
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
      orders: list.map((o) => ({
        customer: customers.find((c) => c.id === o.customerId)?.name ?? '?',
        mark: markOf(o),
        orderNumber: o.orderNumber,
        lines: linesOf(o).map((l) => {
          const p = product(l.productId);
          return { name: p?.name ?? '?', code: p?.code, grams: p?.gramsPerBread, pallets: l.pallets, boxes: l.boxes };
        }),
        pallets: weightOf(o).pallets,
        grossKg: weightOf(o).grossKg,
      })),
    };
  });

  const weekW = sumWeights(live.map(weightOf));
  const billerMap = new Map<string, { code: string; pallets: number }>();
  for (const o of live) {
    const b = brands.find((x) => x.id === customers.find((c) => c.id === o.customerId)?.billedBy);
    const code = b ? billerCode(b) : '–';
    const cur = billerMap.get(code) ?? { code, pallets: 0 };
    cur.pallets += weightOf(o).pallets;
    billerMap.set(code, cur);
  }
  return {
    weekLabel,
    days,
    totalPallets: live.reduce((s, o) => s + weightOf(o).pallets, 0),
    totalGrossKg: weekW.grossKg,
    totalGoodsKg: weekW.goodsKg,
    billers: [...billerMap.values()].sort((a, b) => a.code.localeCompare(b.code, 'sv')),
    incomplete: weekW.incomplete,
  };
}

/** The order book as Excel sheets (admins open it outside the app). Swedish headers, like the log CSV. */
export function orderbookSheets(ob: Orderbook): Sheet[] {
  const B = (v: string | number) => ({ v, bold: true });
  // One row per product line – the data admins can filter and pivot.
  const lineRows: Sheet['rows'] = [[B('Dag'), B('Kund'), B('Märkning'), B('Ordernr'), B('Produkt'), B('Art.nr'), B('Vikt (g)'), B('Pall'), B('Kartonger')]];
  for (const d of ob.days)
    for (const o of d.orders)
      for (const l of o.lines) lineRows.push([d.label, o.customer, o.mark, o.orderNumber ?? '', l.name, l.code ?? '', l.grams ?? '', l.pallets || '', l.boxes || '']);

  // One row per order – the shipping figures (for Nshift).
  const orderRows: Sheet['rows'] = [[B('Dag'), B('Kund'), B('Märkning'), B('Ordernr'), B('Pallar (frakt)'), B('Bruttovikt (kg)')]];
  for (const d of ob.days) {
    for (const o of d.orders) orderRows.push([d.label, o.customer, o.mark, o.orderNumber ?? '', o.pallets, o.grossKg]);
    orderRows.push([B(`Summa ${d.label}`), '', '', '', B(d.pallets), B(d.grossKg)]);
  }
  orderRows.push([B('Totalt vecka'), '', '', '', B(ob.totalPallets), B(ob.totalGrossKg)]);

  // A short summary.
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
