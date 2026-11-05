import { addDays, type LocalDate } from '../days.ts';
import type { Cell, Sheet } from '../xlsx.ts';
import { accountingRows, deliveredOrders } from './accounting.ts';
import { accountingSummary } from './office.ts';
import type { Brand, Customer, Order, Product } from './types.ts';

// The week for accounting as a spreadsheet, in calendar order: a sheet "Leveranser" with each day
// and its delivered products – quantities, boxes per pallet, the prices and the amount as a
// formula (pallets × pallet price + boxes × box price; a price worked out from the other one is
// a formula too) – a subtotal per day and the week's total; and a sheet "Summering" per billing
// company and customer, summed from the first sheet with SUMIFS. Every figure can be followed.

export interface SheetTexts {
  weekTitle: string;
  dayName: (d: LocalDate) => string;
  noBiller: string;
  notDelivered: string;
}

const HEAD = ['Dag', 'Ordernr', 'Kund', 'Faktureras av', 'Produkt', 'Artikelnr', 'Pall', 'Kart./pall', 'Kartonger', 'Pris/pall', 'Pris/kartong', 'Belopp exkl. moms', 'Uträkning'];
// Column letters, so the formulas read plainly.
const C = { pallets: 'G', per: 'H', boxes: 'I', palletPrice: 'J', boxPrice: 'K', amount: 'L', customer: 'C', biller: 'D' };

export function accountingWorkbook(orders: Order[], products: Product[], customers: Customer[], brands: Brand[], monday: LocalDate, texts: SheetTexts): Sheet[] {
  const sunday = addDays(monday, 6);
  const rows = accountingRows(orders, products, customers, monday, sunday);
  const billerOf = (c?: Customer) => brands.find((b) => b.id === c?.billedBy)?.name ?? texts.noBiller;
  const sheet: Cell[][] = [[{ v: texts.weekTitle, bold: true }], [], HEAD.map((h) => ({ v: h, bold: true }))];
  const dayTotals: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const list = rows.filter((r) => r.day === day);
    if (!list.length) continue;
    sheet.push([{ v: texts.dayName(day), bold: true }]);
    const first = sheet.length + 1;
    for (const r of list) {
      const n = sheet.length + 1;
      const { calc } = r;
      // The price as given, or a formula from the other price and the boxes per pallet.
      const palletPrice: Cell =
        calc.palletFrom === 'pallet' && calc.price?.perPallet !== undefined
          ? { v: calc.price.perPallet, money: true }
          : calc.palletPrice !== undefined
            ? { f: `${C.boxPrice}${n}*${C.per}${n}`, v: calc.palletPrice, money: true }
            : null;
      const boxPrice: Cell =
        calc.boxFrom === 'box' && calc.price?.perBox !== undefined
          ? { v: calc.price.perBox, money: true }
          : calc.boxPrice !== undefined
            ? { f: `${C.palletPrice}${n}/${C.per}${n}`, v: Math.round(calc.boxPrice * 10000) / 10000, money: true }
            : null;
      // Pallets × pallet price + boxes × box price (a part with nothing in it left out).
      const terms = [calc.pallets ? `${C.pallets}${n}*${C.palletPrice}${n}` : '', calc.boxes ? `${C.boxes}${n}*${C.boxPrice}${n}` : ''].filter(Boolean);
      const amount: Cell = calc.amount !== undefined ? { f: terms.join('+') || '0', v: calc.amount, money: true } : null;
      sheet.push([
        r.day,
        r.order.orderNumber ?? '',
        r.customer?.name ?? '?',
        billerOf(r.customer),
        r.product?.name ?? '?',
        r.product?.code ?? '',
        calc.pallets,
        calc.boxesPerPallet ?? '',
        calc.boxes,
        palletPrice,
        boxPrice,
        amount,
        explain(calc.pallets, calc.boxes, calc.boxesPerPallet, calc.palletFrom, calc.boxFrom, calc.price?.perPallet, calc.price?.perBox, calc.missing),
      ]);
    }
    const last = sheet.length;
    const n = sheet.length + 1;
    sheet.push(['', '', '', '', { v: `Summa ${texts.dayName(day)}`, bold: true }, '', { f: `SUM(${C.pallets}${first}:${C.pallets}${last})`, v: list.reduce((s, r) => s + r.calc.pallets, 0), bold: true }, '', { f: `SUM(${C.boxes}${first}:${C.boxes}${last})`, v: list.reduce((s, r) => s + r.calc.boxes, 0), bold: true }, '', '', { f: `SUM(${C.amount}${first}:${C.amount}${last})`, v: round(list.reduce((s, r) => s + (r.calc.amount ?? 0), 0)), bold: true, money: true }]);
    dayTotals.push(`${C.amount}${n}`);
    sheet.push([]);
  }
  if (rows.length) sheet.push(['', '', '', '', { v: 'Summa veckan', bold: true }, '', '', '', '', '', '', { f: dayTotals.join('+'), v: round(rows.reduce((s, r) => s + (r.calc.amount ?? 0), 0)), bold: true, money: true }]);
  else sheet.push([texts.notDelivered]);

  // Per billing company and customer, summed from the first sheet.
  const summary = accountingSummary(deliveredOrders(orders), products, customers, brands, monday, sunday);
  const sum: Cell[][] = [[{ v: texts.weekTitle, bold: true }], [], [{ v: 'Faktureras av', bold: true }, { v: 'Kund', bold: true }, { v: 'Pall', bold: true }, { v: 'Kartonger', bold: true }, { v: 'Belopp exkl. moms', bold: true }]];
  const range = (col: string) => `Leveranser!$${col}$4:$${col}$${sheet.length}`;
  for (const b of summary) {
    const name = b.brand?.name ?? texts.noBiller;
    for (const c of b.customers) {
      const n = sum.length + 1;
      sum.push([
        name,
        c.customer?.name ?? '?',
        { f: `SUMIFS(${range(C.pallets)},${range(C.customer)},B${n},${range(C.biller)},A${n})`, v: c.rows.reduce((s, r) => s + r.pallets, 0) },
        { f: `SUMIFS(${range(C.boxes)},${range(C.customer)},B${n},${range(C.biller)},A${n})`, v: c.rows.reduce((s, r) => s + r.boxes, 0) },
        { f: `SUMIFS(${range(C.amount)},${range(C.customer)},B${n},${range(C.biller)},A${n})`, v: c.amount, money: true },
      ]);
    }
    sum.push([{ v: `Summa ${name}`, bold: true }, '', { f: `SUMIFS(${range(C.pallets)},${range(C.biller)},"${name.replace(/"/g, '""')}")`, v: b.pallets, bold: true }, { f: `SUMIFS(${range(C.boxes)},${range(C.biller)},"${name.replace(/"/g, '""')}")`, v: b.boxes, bold: true }, { f: `SUMIFS(${range(C.amount)},${range(C.biller)},"${name.replace(/"/g, '""')}")`, v: b.amount, bold: true, money: true }]);
    sum.push([]);
  }
  return [
    { name: 'Leveranser', rows: sheet, widths: [12, 9, 22, 18, 24, 9, 7, 10, 10, 12, 12, 16, 44] },
    { name: 'Summering', rows: sum, widths: [22, 24, 8, 11, 18] },
  ];
}

const round = (n: number) => Math.round(n * 100) / 100;
const kr = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ');

/** The calculation in words, e.g. "3 pall × (20 kart. × 95,00 kr) + 4 kart. × 95,00 kr". */
export function explain(pallets: number, boxes: number, per: number | undefined, palletFrom: 'pallet' | 'box' | undefined, boxFrom: 'box' | 'pallet' | undefined, perPallet?: number, perBox?: number, missing?: 'price' | 'boxesPerPallet'): string {
  if (missing === 'price') return 'Pris saknas';
  if (missing === 'boxesPerPallet') return 'Kartonger per pall saknas';
  const parts: string[] = [];
  if (pallets) parts.push(palletFrom === 'pallet' ? `${pallets} pall × ${kr(perPallet!)} kr` : `${pallets} pall × ${per} kart. × ${kr(perBox!)} kr`);
  if (boxes) parts.push(boxFrom === 'box' ? `${boxes} kart. × ${kr(perBox!)} kr` : `${boxes} kart. × (${kr(perPallet!)} kr ÷ ${per} kart.)`);
  return parts.join(' + ');
}
