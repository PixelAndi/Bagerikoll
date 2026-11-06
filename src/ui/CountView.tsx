import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import { db, newId } from '../db.ts';
import { stockAt } from '../domain/plan.ts';
import { groupByCustomer, sortProducts } from '../domain/production.ts';
import type { Product } from '../domain/types.ts';
import { Notice, Page } from './common.tsx';
import { Stepper } from './OrderEditor.tsx';

// Inventera (the freezer stock): count what is in the freezer, product by product – on the
// freezer's tablet, or on a phone that scanned the tablet's QR code. Each count is saved with the
// time and who counted; stock afterwards = the count + packed − loaded (as Produktion reads it).
// Open to everyone (nothing here is admin-only). Without a shared server, a count made on a phone
// stays on that phone until its data file is read in elsewhere – the page says so.

export function CountView() {
  const { t, settings } = useApp();
  const { workers, customers, products } = useCatalog();
  const entries = useLiveQuery(() => db.entries.toArray(), []) ?? [];
  const orders = useLiveQuery(() => db.orders.toArray(), []) ?? [];
  const counts = useLiveQuery(() => db.stockCounts.toArray(), []) ?? [];
  const [who, setWho] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>();
  const shownCustomers = customers.filter((c) => !c.hidden);
  const groups = shownCustomers.length ? groupByCustomer(products, customers, filter) : [{ products: sortProducts(products) }];
  const seen = new Set<string>();
  return (
    <Page title={t('count.title')}>
      {settings.locked && settings.lockedTo === 'dock' && (
        <a className="small" href="#/dock">
          ‹ {t('count.back')}
        </a>
      )}
      <Notice kind="info">{t('count.intro')}</Notice>
      <section className="card">
        <span className="field-label">{t('count.who')}</span>
        <div className="packer-chips">
          {workers
            .filter((w) => !w.hidden)
            .map((w) => (
              <button key={w.id} type="button" className={`packer-chip ${who.includes(w.id) ? 'on' : ''}`} aria-pressed={who.includes(w.id)} onClick={() => setWho(who.includes(w.id) ? who.filter((x) => x !== w.id) : [...who, w.id])}>
                {who.includes(w.id) ? '✓ ' : '+ '}
                {w.name}
              </button>
            ))}
        </div>
        {!who.length && <p className="small warn-text">{t('count.pickWho')}</p>}
      </section>
      {shownCustomers.length > 0 && (
        <div className="cal-chips pack-brands">
          <button type="button" className={`cal-chip ${!filter ? 'pack-chip-on' : ''}`} onClick={() => setFilter(undefined)}>
            {t('pack.allBrands')}
          </button>
          {shownCustomers.map((c) => (
            <button key={c.id} type="button" className={`cal-chip ${filter === c.id ? 'pack-chip-on' : ''}`} onClick={() => setFilter(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {groups.map((g, i) => (
        <section key={g.customer?.id ?? `none-${i}`} className="card">
          {shownCustomers.length > 0 && <h2 className="card-title">{g.customer?.name ?? t('pack.noCustomer')}</h2>}
          <ul className="product-rows count-rows">
            {g.products
              .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
              .map((p) => (
                <CountRow key={p.id} product={p} who={who} stock={stockAt(p.id, Date.now(), entries, orders, counts)} last={counts.filter((c) => c.productId === p.id).sort((a, b) => b.at - a.at)[0]} names={workers} />
              ))}
          </ul>
        </section>
      ))}
    </Page>
  );
}

function CountRow({ product, who, stock, last, names }: { product: Product; who: string[]; stock: { pallets: number; boxes: number }; last?: { at: number; workerIds?: string[] }; names: { id: string; name: string }[] }) {
  const { t } = useApp();
  const [pallets, setPallets] = useState<number | null>(null);
  const [boxes, setBoxes] = useState(0);
  const [saved, setSaved] = useState(false);
  const counting = pallets !== null;
  const save = async () => {
    if (pallets === null || !who.length) return;
    await db.stockCounts.put({ id: newId(), at: Date.now(), productId: product.id, pallets, boxes, workerIds: who });
    setPallets(null);
    setBoxes(0);
    setSaved(true);
  };
  const time = (at: number) => new Date(at).toLocaleString('sv-SE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <li className={`count-row ${saved ? 'count-saved' : ''}`}>
      <span>
        <strong>{product.name}</strong> <span className="muted">{product.code}</span>
        <br />
        <span className="small muted">
          {t('count.inStock', { pallets: Math.max(0, stock.pallets), boxes: Math.max(0, stock.boxes) })}
          {last && ` · ${t('count.lastCount', { when: time(last.at), who: (last.workerIds ?? []).map((id) => names.find((n) => n.id === id)?.name ?? '?').join(', ') })}`}
        </span>
      </span>
      {counting ? (
        <span className="count-input">
          <span className="small muted">{t('pack.palletsWord')}</span>
          <Stepper value={pallets} label={`${product.name} ${t('pack.palletsWord')}`} onChange={setPallets} />
          <span className="small muted">{t('pack.boxesWord')}</span>
          <Stepper value={boxes} label={`${product.name} ${t('pack.boxesWord')}`} onChange={setBoxes} />
          <button type="button" className="button button-primary" disabled={!who.length} onClick={() => void save()}>
            ✓ {t('count.save')}
          </button>
        </span>
      ) : (
        <button type="button" className="button" onClick={() => (setPallets(Math.max(0, stock.pallets)), setBoxes(Math.max(0, stock.boxes)), setSaved(false))}>
          {saved ? `✓ ${t('count.saved')}` : t('count.count')}
        </button>
      )}
    </li>
  );
}
