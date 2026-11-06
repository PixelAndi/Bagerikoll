import { describe, expect, it } from 'vitest';
import { isoWeekday } from '../days.ts';
import { accountingRows, profitOf } from './accounting.ts';
import { demoData, isDemo } from './demo.ts';

const at = (day: string, hh: number, mm: number) => Date.parse(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);

describe('test data', () => {
  const today = '2030-01-09'; // a Wednesday
  const now = at(today, 10, 0);
  const d = demoData(today, now, at);

  it('is all marked as test data, and the same for the same day', () => {
    for (const rows of Object.values(d)) for (const r of rows as { id: string }[]) expect(isDemo(r.id)).toBe(true);
    expect(JSON.stringify(demoData(today, now, at))).toBe(JSON.stringify(d));
  });

  it('fills weeks of orders, Monday to Friday, packed and loaded until today', () => {
    expect(d.orders.length).toBeGreaterThan(50);
    expect(d.orders.every((o) => isoWeekday(o.day) <= 5)).toBe(true);
    expect(d.orders.filter((o) => o.day < today).every((o) => o.shippedAt && o.delivered)).toBe(true);
    expect(d.orders.filter((o) => o.day > today).some((o) => o.shippedAt)).toBe(false);
    expect(d.runs.length).toBeGreaterThan(40);
    expect(d.entries.every((e) => d.runs.some((r) => r.id === e.runId))).toBe(true);
  });

  it('has a packing session going on now', () => {
    const open = d.sessions.filter((s) => !s.endedAt);
    expect(open.map((s) => s.kind ?? 'pack').sort()).toEqual(['dock', 'pack']);
    expect(open.find((s) => s.kind === 'dock')?.loadingOrderId).toBeTruthy();
    expect(d.runs.filter((r) => !r.endedAt)).toHaveLength(1);
  });

  it('gives Ekonomi a week with prices, costs and a profit', () => {
    const rows = accountingRows(d.orders, d.products, d.customers, '2030-01-07', '2030-01-13');
    expect(rows.length).toBeGreaterThan(0);
    const p = profitOf(rows);
    expect(p.revenue).toBeGreaterThan(0);
    expect(p.cost).toBeGreaterThan(0);
  });
});
