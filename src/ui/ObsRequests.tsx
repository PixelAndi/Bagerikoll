import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import { db } from '../db.ts';
import { openObs } from '../domain/obs.ts';
import { sortProducts } from '../domain/production.ts';
import type { ObsRequest } from '../domain/types.ts';
import { Card, Fold } from './common.tsx';

// OBS for the managers (Produktion and Kontor): urgent production asked for from the freezer when
// a delivery was short – plan it, mark it done, or refuse it. A shortage of a product blocked
// from OBS shows here too, so a manager can decide what to do.

const day = (d: string) => new Intl.DateTimeFormat('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const time = (at: number) => new Date(at).toLocaleString('sv-SE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

export function ObsRequests() {
  const { t } = useApp();
  const { products, customers, workers } = useCatalog();
  const all = useLiveQuery(() => db.obs.toArray(), []) ?? [];
  const orders = useLiveQuery(() => db.orders.toArray(), []) ?? [];
  const list = openObs(all);
  if (!list.length) return null;
  const set = (o: ObsRequest, status: ObsRequest['status']) => db.obs.update(o.id, { status, decidedAt: Date.now() });
  return (
    <Card title={t('obs.title', { n: list.length })} className="cal-check obs-card">
      <ul className="cal-check-list obs-list">
        {list.map((o) => {
          const p = products.find((x) => x.id === o.productId);
          const order = orders.find((x) => x.id === o.orderId);
          const amount = [o.pallets ? t('prod.nPallets', { n: o.pallets }) : '', o.boxes ? t('prod.nBoxes', { n: o.boxes }) : ''].filter(Boolean).join(' + ');
          return (
            <li key={o.id} className={`obs-${o.status}`}>
              <span>
                <strong>
                  {day(o.day)} · {p?.name ?? '?'} {p?.code && <span className="muted">{p.code}</span>} · {amount}
                </strong>
                <br />
                <span className="small">
                  {customers.find((c) => c.id === (o.customerId ?? order?.customerId))?.name ?? ''}
                  {order?.orderNumber && ` #${order.orderNumber}`} · {t('obs.askedBy', { who: o.workerIds.map((id) => workers.find((w) => w.id === id)?.name ?? '?').join(', '), when: time(o.requestedAt) })}
                </span>
                <br />
                <span className={`cal-chip ${o.status === 'planned' ? 'cal-chip-ok' : o.status === 'notAllowed' ? '' : 'cal-chip-warn'}`}>{t(`obs.status.${o.status}`)}</span>
              </span>
              <span className="obs-buttons">
                {o.status === 'requested' && (
                  <>
                    <button type="button" className="button button-small button-primary" onClick={() => void set(o, 'planned')}>
                      {t('obs.plan')}
                    </button>
                    <button type="button" className="button button-small" onClick={() => void set(o, 'refused')}>
                      {t('obs.refuse')}
                    </button>
                  </>
                )}
                {o.status === 'notAllowed' && (
                  <>
                    <button type="button" className="button button-small" onClick={() => void set(o, 'planned')}>
                      {t('obs.planAnyway')}
                    </button>
                    <button type="button" className="button button-small" onClick={() => void set(o, 'refused')}>
                      {t('obs.seen')}
                    </button>
                  </>
                )}
                {o.status === 'planned' && (
                  <button type="button" className="button button-small button-primary" onClick={() => void set(o, 'done')}>
                    ✓ {t('obs.done')}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Which products may be made as OBS (a manager's decision: some need more people than are in early). */
export function ObsAllowList() {
  const { t } = useApp();
  const { products } = useCatalog();
  const list = sortProducts(products);
  const blocked = list.filter((p) => p.obsBlocked).length;
  return (
    <Fold title={t('obs.allowTitle')} sub={blocked ? t('obs.allowSubBlocked', { n: blocked }) : t('obs.allowSubAll')}>
      <p className="small muted">{t('obs.allowHint')}</p>
      <ul className="product-rows">
        {list.map((p) => (
          <li key={p.id}>
            <span>
              <strong>{p.name}</strong> <span className="muted">{p.code}</span>
            </span>
            <label className="check-row obs-allow">
              <input type="checkbox" checked={!p.obsBlocked} onChange={(e) => void db.products.update(p.id, { obsBlocked: !e.target.checked || undefined })} />
              <span className={p.obsBlocked ? 'warn-text' : 'ok'}>{p.obsBlocked ? t('obs.blocked') : t('obs.allowed')}</span>
            </label>
          </li>
        ))}
      </ul>
    </Fold>
  );
}
