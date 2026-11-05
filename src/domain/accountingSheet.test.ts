import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { xlsx } from '../xlsx.ts';
import { accountingWorkbook, explain } from './accountingSheet.ts';
import type { Brand, Customer, Order, Product } from './types.ts';

// Made-up names and prices only.
const brands: Brand[] = [{ id: 'b1', name: 'Bolag Ett', color: '#000' }];
const customers: Customer[] = [{ id: 'k1', name: 'Kund Ett', billedBy: 'b1' }, { id: 'k2', name: 'Kund Två' }];
const products: Product[] = [
  { id: 'p', name: 'Testbulle', code: '11', boxesPerPallet: 20, prices: [{ from: '2030-01-01', perBox: 10 }] },
  { id: 'q', name: 'Testlimpa', code: '12', boxesPerPallet: 25, prices: [{ from: '2030-01-01', perPallet: 1000 }] },
];
const order = (id: string, day: string, customerId: string, lines: Order['lines'], extra: Partial<Order> = {}): Order => ({ id, day, customerId, lines, createdAt: 0, shippedAt: 1, ...extra });
const orders = [
  order('a', '2030-01-07', 'k1', [{ productId: 'p', pallets: 2, boxes: 3, boxesPerPallet: 30 }], { orderNumber: '7' }),
  order('b', '2030-01-08', 'k2', [{ productId: 'q', pallets: 1, boxes: 5 }]),
  order('c', '2030-01-08', 'k1', [{ productId: 'q', pallets: 4, boxes: 0 }], { shippedAt: undefined }), // not delivered
];
const texts = { weekTitle: 'Vecka 2', dayName: (d: string) => d, noBiller: 'Inget bolag', notDelivered: 'Inget levererat' };

describe('the accounting workbook', () => {
  const [deliveries, summary] = accountingWorkbook(orders, products, customers, brands, '2030-01-07', texts);
  it('lists delivered products by day, with the amount as a formula', () => {
    const row = deliveries.rows.find((r) => r[0] === '2030-01-07')!;
    expect(row.slice(1, 9)).toEqual(['7', 'Kund Ett', 'Bolag Ett', 'Testbulle', '11', 2, 30, 3]);
    expect(row[9]).toEqual({ f: 'K5*H5', v: 300, money: true }); // pallet price from box price × 30
    expect(row[11]).toEqual({ f: 'G5*J5+I5*K5', v: 630, money: true });
    expect(row[12]).toBe('2 pall × 30 kart. × 10,00 kr + 3 kart. × 10,00 kr');
    expect(deliveries.rows.some((r) => r[2] === 'Kund Ett' && r[4] === 'Testlimpa')).toBe(false); // not delivered
  });
  it('sums per day and per customer with formulas', () => {
    const last = deliveries.rows.at(-1)!;
    expect(last[11]).toMatchObject({ v: 630 + 1200 });
    expect(summary.rows.map((r) => (typeof r[0] === 'object' && r[0] ? r[0].v : r[0]) ?? '')).toContain('Summa Bolag Ett');
  });
  it('explains a box priced from the pallet price', () => {
    expect(explain(0, 5, 25, 'pallet', 'pallet', 1000)).toBe('5 kart. × (1 000,00 kr ÷ 25 kart.)');
  });
  it('writes a file that opens (checked with LibreOffice when VERIFY_XLSX is set)', () => {
    const bytes = xlsx([deliveries, summary]);
    expect(bytes[0]).toBe(0x50); // "PK"
    if (process.env.VERIFY_XLSX) writeFileSync(process.env.VERIFY_XLSX, bytes);
  });
});
