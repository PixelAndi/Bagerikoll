import { useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog, useEntriesBetween } from '../data.ts';
import { addDays, isoWeekday, todayLocal } from '../days.ts';
import { byCustomer, byDay, byProduct, groupByCustomer, total } from '../domain/production.ts';
import { Page } from './common.tsx';
import { ByWorker } from './ProductionLog.tsx';

// Idag: what has been packed, readable at a glance – the day's pallets and boxes big, each customer
// as a chip, the week as squares (darker = more pallets), and each customer's products below.
// Who packed what is shown below, and every entry in Logg.

export function TodayView() {
  const { t, settings } = useApp();
  const today = todayLocal();
  const [day, setDay] = useState(today);
  const monday = addDays(day, 1 - isoWeekday(day));
  const week = useEntriesBetween(monday, addDays(monday, 6));
  const { customers, products } = useCatalog();
  const entries = week.filter((e) => e.day === day);
  const sum = total(entries);
  const perCustomer = byCustomer(entries, products);
  const shownCustomers = customers.filter((c) => !c.hidden || perCustomer.has(c.id));
  const perProduct = byProduct(entries);
  const perDay = byDay(week);
  const most = Math.max(1, ...[...perDay.values()].map((c) => c.pallets));
  const dayName = (d: string, style: 'long' | 'short') =>
    new Intl.DateTimeFormat(settings.language, { weekday: style, day: 'numeric', month: style === 'long' ? 'long' : undefined, timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

  return (
    <Page
      title={day === today ? t('today.title') : dayName(day, 'long')}
      actions={
        <span className="cal-year-nav">
          <button type="button" className="link-inline" onClick={() => setDay(addDays(day, -1))} aria-label={t('common.previous')}>
            ‹
          </button>
          <button type="button" className="link-inline" disabled={day >= today} onClick={() => setDay(addDays(day, 1))} aria-label={t('common.next')}>
            ›
          </button>
        </span>
      }
    >
      <section className="card cal-focus">
        <div className="cal-focus-head">
          <strong>{day === today ? t('today.packedToday') : t('today.packedOn', { day: dayName(day, 'long') })}</strong>
        </div>
        <div className="cal-numbers">
          <div>
            <strong className="pack-figure">{sum.pallets}</strong>
            <span className="small muted">{t('today.pallets')}</span>
          </div>
          <div>
            <strong className="pack-figure">{sum.boxes}</strong>
            <span className="small muted">{t('today.boxes')}</span>
          </div>
        </div>
        {shownCustomers.length > 0 && (
          <div className="cal-chips">
            {shownCustomers.map((k) => {
              const c = perCustomer.get(k.id);
              return (
                <span key={k.id} className={`cal-chip ${c ? 'cal-chip-ok' : ''}`}>
                  {k.name}: {t('today.chipCount', { pallets: c?.pallets ?? 0, boxes: c?.boxes ?? 0 })}
                </span>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <div className="cal-focus-head">
          <strong>{t('today.week')}</strong>
          <span className="small muted">{t('today.weekSum', { pallets: total(week).pallets, boxes: total(week).boxes })}</span>
        </div>
        <div className="week-squares">
          {Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((d) => {
            const c = perDay.get(d);
            const level = c ? Math.ceil((4 * c.pallets) / most) : 0;
            return (
              <button key={d} type="button" className={`week-sq week-l${level} ${d === day ? 'on' : ''} ${d > today ? 'later' : ''}`} disabled={d > today} onClick={() => setDay(d)}>
                <span className="small">{dayName(d, 'short')}</span>
                <strong>{c?.pallets ?? (d > today ? '' : 0)}</strong>
                <span className="small">{c && c.boxes ? t('today.boxesShort', { n: c.boxes }) : ' '}</span>
              </button>
            );
          })}
        </div>
        <p className="small muted">{t('today.weekKey')}</p>
      </section>

      {entries.length === 0 && <p className="muted">{t('today.nothing')}</p>}
      {entries.length > 0 && <ByWorker day={day} />}
      {groupByCustomer(
        // Counted once, under its first customer (as the chips are), and shown even if hidden since.
        products.map((p) => ({ ...p, customerIds: p.customerIds?.slice(0, 1), hidden: p.hidden && !perProduct.has(p.id) })),
        customers.map((c) => (c.hidden && perCustomer.has(c.id) ? { ...c, hidden: false } : c)),
      ).map((g) => {
        const done = g.products.filter((p) => perProduct.has(p.id));
        if (!done.length) return null;
        return (
          <section key={g.customer?.id ?? 'none'} className="card">
            <h2 className="card-title">{g.customer?.name ?? t('pack.noCustomer')}</h2>
            <ul className="product-rows">
              {done.map((p) => {
                const c = perProduct.get(p.id)!;
                return (
                  <li key={p.id}>
                    <span>
                      {p.name}
                      {p.code && <span className="small muted"> · {p.code}</span>}
                    </span>
                    <span className="product-count">
                      <strong>{c.pallets}</strong> {t('today.palletsShort')} · <strong>{c.boxes}</strong> {t('today.boxesShortWord')}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </Page>
  );
}
