import { useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import { todayLocal } from '../days.ts';
import { db } from '../db.ts';
import type { Product } from '../domain/types.ts';
import { Modal } from './common.tsx';

// A product's prices, set by accounting: per customer (or the standard price for customers
// without their own), per pallet and/or per box, each from a date – older orders keep the price
// of their day.

export function PriceEditor({ product, onClose }: { product: Product; onClose: () => void }) {
  const { t } = useApp();
  const { customers } = useCatalog();
  const [p, setP] = useState(product);
  const num = (v: string) => {
    const n = Number(v.replace(',', '.').replace(/\s/g, ''));
    return v.trim() && n > 0 ? n : undefined;
  };
  const saveIt = async () => {
    const prices = (p.prices ?? []).filter((x) => x.from && (x.perPallet !== undefined || x.perBox !== undefined)).sort((a, b) => (a.customerId ?? '').localeCompare(b.customerId ?? '') || (a.from < b.from ? -1 : 1));
    await db.products.update(product.id, { prices });
    onClose();
  };
  return (
    <Modal title={t('accounting.pricesFor', { product: product.name })} onClose={onClose}>
      <div className="field">
        <span className="field-label">{t('admin.prices')}</span>
        <span className="field-hint">{t('admin.pricesHint')}</span>
        {(p.prices ?? []).map((x, i) => (
          <div key={i} className="price-row">
            <label className="price-customer">
              <span className="small muted">{t('pack.customer')}</span>
              <select value={x.customerId ?? ''} onChange={(e) => setP({ ...p, prices: p.prices!.map((y, j) => (j === i ? { ...y, customerId: e.target.value || undefined } : y)) })}>
                <option value="">{t('admin.priceStandard')}</option>
                {[...customers.filter((c) => p.customerIds?.includes(c.id)), ...customers.filter((c) => !p.customerIds?.includes(c.id) && !c.hidden)].map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="small muted">{t('admin.priceFrom')}</span>
              <input type="date" value={x.from} onChange={(e) => setP({ ...p, prices: p.prices!.map((y, j) => (j === i ? { ...y, from: e.target.value } : y)) })} />
            </label>
            <label>
              <span className="small muted">{t('admin.perPallet')}</span>
              <input type="text" inputMode="decimal" defaultValue={x.perPallet ?? ''} onChange={(e) => setP({ ...p, prices: p.prices!.map((y, j) => (j === i ? { ...y, perPallet: num(e.target.value) } : y)) })} />
            </label>
            <label>
              <span className="small muted">{t('admin.perBox')}</span>
              <input type="text" inputMode="decimal" defaultValue={x.perBox ?? ''} onChange={(e) => setP({ ...p, prices: p.prices!.map((y, j) => (j === i ? { ...y, perBox: num(e.target.value) } : y)) })} />
            </label>
            <button type="button" className="link-button small" onClick={() => setP({ ...p, prices: p.prices!.filter((_, j) => j !== i) })}>
              {t('prod.removeDeviation')}
            </button>
          </div>
        ))}
        <button type="button" className="button button-small" onClick={() => setP({ ...p, prices: [...(p.prices ?? []), { from: todayLocal(), customerId: p.customerIds?.length === 1 ? p.customerIds[0] : undefined }] })}>
          + {t('admin.newPrice')}
        </button>
      </div>
      <button type="button" className="button button-primary pack-start" onClick={() => void saveIt()}>
        {t('admin.save')}
      </button>
    </Modal>
  );
}
