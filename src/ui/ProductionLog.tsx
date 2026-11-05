import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import { addDays, todayLocal } from '../days.ts';
import { db } from '../db.ts';
import { byProduct, toCsv, total } from '../domain/production.ts';
import type { Entry } from '../domain/types.ts';
import { href } from '../router.ts';
import { Field, Fold, Icon, Page } from './common.tsx';

// Who packed what and when – open to everyone. Only voiding and restoring entries needs admin.

export function LogView() {
  const { t } = useApp();
  return (
    <Page title={t('nav.log')}>
      <a className="card issue-link" href={href({ name: 'protocol' })}>
        <span>
          <strong>{t('protocol.title')}</strong>
          <br />
          <span className="small muted">{t('protocol.linkHint')}</span>
        </span>
        <Icon name="chevronRight" />
      </a>
      <Log />
    </Page>
  );
}

const time = (at: number) => new Date(at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

/** The full log for a day (or a range), every entry with its packers; voiding with a reason. */
/** The log for a day or a range: every entry with its packers and station. Voiding is for admins. */
export function Log() {
  const { t, admin } = useApp();
  const { workers, brands, customers, products } = useCatalog();
  const today = todayLocal();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [customerId, setCustomerId] = useState('');
  const all = useLiveQuery(() => db.entries.where('day').between(from, to, true, true).toArray(), [from, to]) ?? [];
  const customersOf = new Map(products.map((p) => [p.id, p.customerIds ?? []]));
  const entries = all.filter((e) => !customerId || customersOf.get(e.productId)?.includes(customerId)).sort((a, b) => b.at - a.at);
  const sum = total(entries);
  const name = (id: string) => workers.find((w) => w.id === id)?.name ?? '?';
  const voidIt = async (e: Entry) => {
    const reason = prompt(t('admin.voidReason'));
    if (!reason) return;
    await db.entries.update(e.id, { voided: { at: Date.now(), by: 'admin', reason } });
  };
  const exportCsv = () => {
    const blob = new Blob(['﻿' + toCsv(entries, products, brands, workers, customers)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bagerikoll-${from}${to !== from ? `-${to}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <section className="card cal-focus">
      <div className="cal-focus-head">
        <strong>{t('admin.log')}</strong>
        <span className="small muted">{t('admin.logSum', { n: entries.length, pallets: sum.pallets, boxes: sum.boxes })}</span>
      </div>
      <div className="field-row">
        <Field label={t('admin.from')}>
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </Field>
        <Field label={t('admin.to')}>
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </Field>
      </div>
      <div className="cal-chips">
        <button type="button" className="cal-chip" onClick={() => (setFrom(today), setTo(today))}>
          {t('admin.today')}
        </button>
        <button type="button" className="cal-chip" onClick={() => (setFrom(addDays(today, -6)), setTo(today))}>
          {t('admin.last7')}
        </button>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label={t('pack.customer')}>
          <option value="">{t('log.allCustomers')}</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {entries.length === 0 ? (
        <p className="muted">{t('admin.logEmpty')}</p>
      ) : (
        <ul className="log-rows">
          {entries.map((e) => (
            <li key={e.id} className={e.voided ? 'pack-voided' : ''}>
              <span className="log-main">
                <strong>
                  {from !== to && `${e.day} `}
                  {time(e.at)} · {t(e.kind === 'pallet' ? 'pack.nPallets' : 'pack.nBoxes', { n: e.quantity })} · {products.find((p) => p.id === e.productId)?.name ?? '?'}
                </strong>
                <span className="small">
                  {e.workerIds.map(name).join(', ')} · {e.station}
                </span>
                {e.voided && (
                  <span className="small warn-text">
                    {t('admin.voided', { time: time(e.voided.at), by: t(e.voided.by === 'admin' ? 'admin.byAdmin' : 'admin.byPackers'), reason: e.voided.reason })}
                  </span>
                )}
              </span>
              {admin &&
                (e.voided ? (
                  <button type="button" className="link-button small" onClick={() => void db.entries.update(e.id, { voided: undefined })}>
                    {t('admin.restore')}
                  </button>
                ) : (
                  <button type="button" className="link-button small" onClick={() => void voidIt(e)}>
                    {t('admin.void')}
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="button" disabled={!entries.length} onClick={exportCsv}>
        {t('admin.export')}
      </button>
    </section>
  );
}

/** A day per packer (an entry packed by two counts for both). */
export function ByWorker({ day }: { day: string }) {
  const { t } = useApp();
  const { workers, products } = useCatalog();
  const entries = useLiveQuery(() => db.entries.where('day').equals(day).toArray(), [day]) ?? [];
  const rows = useMemo(
    () =>
      workers
        .map((w) => {
          const mine = entries.filter((e) => e.workerIds.includes(w.id));
          return { w, sum: total(mine), per: byProduct(mine) };
        })
        .filter((r) => r.sum.pallets || r.sum.boxes),
    [workers, entries],
  );
  return (
    <Fold title={t('log.byWorker')} sub={t('admin.byWorkerSub', { n: rows.length })} open>
      {rows.length === 0 ? (
        <p className="muted">{t('admin.logEmpty')}</p>
      ) : (
        <ul className="product-rows">
          {rows.map(({ w, sum, per }) => (
            <li key={w.id}>
              <span>
                <strong>{w.name}</strong>
                <br />
                <span className="small muted">
                  {[...per.entries()].map(([id, c]) => `${products.find((p) => p.id === id)?.name ?? '?'} ${c.pallets}/${c.boxes}`).join(' · ')}
                </span>
              </span>
              <span className="product-count">
                <strong>{sum.pallets}</strong> {t('today.palletsShort')} · <strong>{sum.boxes}</strong> {t('today.boxesShortWord')}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">{t('admin.byWorkerNote')}</p>
    </Fold>
  );
}

