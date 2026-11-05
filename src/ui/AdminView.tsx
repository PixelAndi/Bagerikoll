import { useState } from 'react';
import { useApp } from '../app-context.ts';
import { BRAND_COLORS, useCatalog } from '../data.ts';
import { db, newId } from '../db.ts';
import { hashPin } from '../domain/pin.ts';
import type { Product } from '../domain/types.ts';
import { Card, Field, Fold, Modal, Notice, Page } from './common.tsx';

// Admin (behind the PIN): the managerial controls – names, customers, products and brands (for
// accounting), this device's
// station name and workstation lock, the PIN – and voiding entries in the log. Everything else,
// including who packed what and when, is open to everyone (the owner's decision).

export function AdminView() {
  const { t, admin, askPin, closeAdmin } = useApp();
  if (!admin)
    return (
      <Page title={t('nav.admin')}>
        <Notice kind="info">{t('admin.locked')}</Notice>
        <button type="button" className="button button-primary pack-start" onClick={() => askPin()}>
          🔒 {t('admin.open')}
        </button>
      </Page>
    );
  return (
    <Page
      title={t('nav.admin')}
      actions={
        <button type="button" className="button" onClick={closeAdmin}>
          🔒 {t('admin.close')}
        </button>
      }
    >
      <Notice kind="info">{t('admin.intro')}</Notice>
      <Workers />
      <Customers />
      <Products />
      <Brands />
      <Station />
      <ChangePin />
    </Page>
  );
}

function Workers() {
  const { t } = useApp();
  const { workers } = useCatalog();
  const [name, setName] = useState('');
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    setName('');
    await db.workers.put({ id: newId(), name: n });
  };
  return (
    <Fold title={t('admin.workers')} sub={t('admin.count', { n: workers.filter((w) => !w.hidden).length })}>
      <p className="small muted">{t('admin.workersHint')}</p>
      <ul className="edit-rows">
        {workers.map((w) => (
          <li key={w.id} className={w.hidden ? 'pack-voided' : ''}>
            <input type="text" defaultValue={w.name} aria-label={t('admin.name')} onBlur={(e) => e.target.value.trim() && void db.workers.update(w.id, { name: e.target.value.trim() })} />
            <button type="button" className="link-button small" onClick={() => void db.workers.update(w.id, { hidden: !w.hidden })}>
              {w.hidden ? t('admin.show') : t('admin.hide')}
            </button>
          </li>
        ))}
      </ul>
      <div className="add-row">
        <input type="text" value={name} placeholder={t('admin.newWorker')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
        <button type="button" className="button button-primary" disabled={!name.trim()} onClick={() => void add()}>
          {t('admin.add')}
        </button>
      </div>
    </Fold>
  );
}

function Brands() {
  const { t } = useApp();
  const { brands } = useCatalog();
  const [name, setName] = useState('');
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    setName('');
    await db.brands.put({ id: newId(), name: n, color: BRAND_COLORS[brands.length % BRAND_COLORS.length] });
  };
  return (
    <Fold title={t('admin.brands')} sub={brands.map((b) => b.name).join(', ') || t('admin.none')}>
      <p className="small muted">{t('admin.brandsHint')}</p>
      <ul className="edit-rows">
        {brands.map((b) => (
          <li key={b.id}>
            <input type="text" defaultValue={b.name} aria-label={t('admin.name')} onBlur={(e) => e.target.value.trim() && void db.brands.update(b.id, { name: e.target.value.trim() })} />
          </li>
        ))}
      </ul>
      <div className="add-row">
        <input type="text" value={name} placeholder={t('admin.newBrand')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
        <button type="button" className="button button-primary" disabled={!name.trim()} onClick={() => void add()}>
          {t('admin.add')}
        </button>
      </div>
    </Fold>
  );
}

function Customers() {
  const { t } = useApp();
  const { customers } = useCatalog();
  const [name, setName] = useState('');
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    setName('');
    await db.customers.put({ id: newId(), name: n });
  };
  return (
    <Fold title={t('admin.customers')} sub={customers.filter((c) => !c.hidden).map((c) => c.name).join(', ') || t('admin.none')}>
      <p className="small muted">{t('admin.customersHint')}</p>
      <ul className="edit-rows">
        {customers.map((c) => (
          <li key={c.id} className={c.hidden ? 'pack-voided' : ''}>
            <input type="text" defaultValue={c.name} aria-label={t('admin.name')} onBlur={(e) => e.target.value.trim() && void db.customers.update(c.id, { name: e.target.value.trim() })} />
            <button type="button" className="link-button small" onClick={() => void db.customers.update(c.id, { hidden: !c.hidden })}>
              {c.hidden ? t('admin.show') : t('admin.hide')}
            </button>
          </li>
        ))}
      </ul>
      <div className="add-row">
        <input type="text" value={name} placeholder={t('admin.newCustomer')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
        <button type="button" className="button button-primary" disabled={!name.trim()} onClick={() => void add()}>
          {t('admin.add')}
        </button>
      </div>
    </Fold>
  );
}

function Products() {
  const { t } = useApp();
  const { brands, customers, products } = useCatalog();
  const [name, setName] = useState('');
  const [brandId, setBrandId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState<string>();
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    const c = code.trim();
    setName('');
    setCode('');
    await db.products.put({ id: newId(), name: n, brandId: brandId || undefined, code: c || undefined, customerIds: customerId ? [customerId] : [] });
  };
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const firstCustomer = (p: Product) => customerName.get(p.customerIds?.[0] ?? '') ?? '\uffff';
  const sorted = [...products].sort((a, b) => firstCustomer(a).localeCompare(firstCustomer(b), 'sv') || a.name.localeCompare(b.name, 'sv', { numeric: true }));
  const product = products.find((p) => p.id === editing);
  return (
    <Fold title={t('admin.products')} sub={t('admin.count', { n: products.filter((p) => !p.hidden).length })}>
      <ul className="product-rows">
        {sorted.map((p) => (
          <li key={p.id} className={p.hidden ? 'pack-voided' : ''}>
            <span>
              <strong>{p.name}</strong>
              {p.code && <span className="muted"> · {p.code}</span>}
              <br />
              <span className="small muted">
                {[(p.customerIds ?? []).map((id) => customerName.get(id)).filter(Boolean).join(', ') || t('admin.noCustomer'), p.brandId ? brandName.get(p.brandId) : '', p.palletsPerDough ? t('admin.perDoughShort', { n: p.palletsPerDough }) : '', p.boxesPerPallet ? t('admin.perPalletShort', { n: p.boxesPerPallet }) : '']
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <button type="button" className="button" onClick={() => setEditing(p.id)}>
              {t('admin.edit')}
            </button>
          </li>
        ))}
      </ul>
      <div className="add-row">
        {customers.length > 0 && (
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label={t('pack.customer')}>
            <option value="">{t('admin.noCustomer')}</option>
            {customers
              .filter((c) => !c.hidden)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        )}
        <input type="text" value={name} placeholder={t('admin.newProduct')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
        <input type="text" className="code-input" value={code} placeholder={t('admin.code')} onChange={(e) => setCode(e.target.value)} />
        {brands.length > 0 && (
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} aria-label={t('pack.brand')}>
            <option value="">{t('admin.noBrand')}</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="button button-primary" disabled={!name.trim()} onClick={() => void add()}>
          {t('admin.add')}
        </button>
      </div>
      {product && <ProductEditor product={product} onClose={() => setEditing(undefined)} />}
    </Fold>
  );
}

/** One product: name, article number, brand, customers, and the numbers production plans with. */
function ProductEditor({ product, onClose }: { product: Product; onClose: () => void }) {
  const { t } = useApp();
  const { brands, customers } = useCatalog();
  const [p, setP] = useState(product);
  const num = (v: string) => {
    const n = Number(v.replace(',', '.'));
    return v.trim() && n > 0 ? n : undefined;
  };
  const toggleCustomer = (id: string) => setP((x) => ({ ...x, customerIds: x.customerIds?.includes(id) ? x.customerIds.filter((c) => c !== id) : [...(x.customerIds ?? []), id] }));
  const saveIt = async () => {
    if (!p.name.trim()) return;
    await db.products.update(p.id, { name: p.name.trim(), code: p.code?.trim() || undefined, brandId: p.brandId || undefined, customerIds: p.customerIds ?? [], boxesPerPallet: p.boxesPerPallet, palletsPerDough: p.palletsPerDough, hidden: p.hidden });
    onClose();
  };
  return (
    <Modal title={product.name} onClose={onClose}>
      <Field label={t('admin.name')}>
        <input type="text" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
      </Field>
      <div className="field-row">
        <Field label={t('admin.code')}>
          <input type="text" value={p.code ?? ''} onChange={(e) => setP({ ...p, code: e.target.value })} />
        </Field>
        <Field label={t('pack.brand')}>
          <select value={p.brandId ?? ''} onChange={(e) => setP({ ...p, brandId: e.target.value })}>
            <option value="">{t('admin.noBrand')}</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="field">
        <span className="field-label">{t('admin.productCustomers')}</span>
        <div className="cal-chips pack-brands">
          {customers
            .filter((c) => !c.hidden || p.customerIds?.includes(c.id))
            .map((c) => (
              <button key={c.id} type="button" className={`cal-chip ${p.customerIds?.includes(c.id) ? 'pack-chip-on' : ''}`} aria-pressed={!!p.customerIds?.includes(c.id)} onClick={() => toggleCustomer(c.id)}>
                {p.customerIds?.includes(c.id) ? '✓ ' : ''}
                {c.name}
              </button>
            ))}
        </div>
        <span className="field-hint">{customers.length ? t('admin.productCustomersHint') : t('admin.customersFirst')}</span>
      </div>
      <div className="field-row">
        <Field label={t('admin.palletsPerDough')} hint={t('admin.palletsPerDoughHint')}>
          <input type="text" inputMode="decimal" defaultValue={p.palletsPerDough ?? ''} placeholder="1" onChange={(e) => setP({ ...p, palletsPerDough: num(e.target.value) })} />
        </Field>
        <Field label={t('admin.boxesPerPallet')} hint={t('admin.boxesPerPalletHint')}>
          <input type="text" inputMode="numeric" defaultValue={p.boxesPerPallet ?? ''} onChange={(e) => setP({ ...p, boxesPerPallet: num(e.target.value) })} />
        </Field>
      </div>
      <div className="button-row">
        <button type="button" className="button button-primary" disabled={!p.name.trim()} onClick={() => void saveIt()}>
          {t('admin.save')}
        </button>
        <button type="button" className="button" onClick={() => setP({ ...p, hidden: !p.hidden })}>
          {p.hidden ? t('admin.show') : t('admin.hide')}
        </button>
      </div>
      {p.hidden && <p className="small muted">{t('admin.hiddenProduct')}</p>}
    </Modal>
  );
}

/** This device: its station name in the log, and locking it to the packing view. */
function Station() {
  const { t, settings, save, closeAdmin } = useApp();
  return (
    <Card title={t('admin.station')}>
      <Field label={t('admin.stationName')} hint={t('admin.stationNameHint')}>
        <input type="text" defaultValue={settings.station} onBlur={(e) => e.target.value.trim() && save({ station: e.target.value.trim() })} />
      </Field>
      <label className="check-row">
        <input type="checkbox" checked={!!settings.productionOpen} onChange={(e) => save({ productionOpen: e.target.checked })} />
        <span>
          <strong>{t('admin.managerPhone')}</strong>
          <br />
          <span className="small muted">{t('admin.managerPhoneHint')}</span>
        </span>
      </label>
      <p className="small muted">{t('admin.lockHint')}</p>
      <button
        type="button"
        className="button button-primary"
        onClick={() => {
          save({ locked: true, productionOpen: false });
          closeAdmin();
          location.hash = '#/';
        }}
      >
        🔒 {t('admin.lock')}
      </button>
    </Card>
  );
}

function ChangePin() {
  const { t, save } = useApp();
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [done, setDone] = useState(false);
  const ok = /^\d{4,8}$/.test(pin) && pin === again;
  return (
    <Fold title={t('admin.pin')}>
      <p className="small muted">{t('admin.pinHint')}</p>
      <div className="field-row">
        <Field label={t('admin.newPin')}>
          <input type="password" inputMode="numeric" value={pin} onChange={(e) => (setPin(e.target.value), setDone(false))} />
        </Field>
        <Field label={t('admin.newPinAgain')}>
          <input type="password" inputMode="numeric" value={again} onChange={(e) => (setAgain(e.target.value), setDone(false))} />
        </Field>
      </div>
      <button
        type="button"
        className="button"
        disabled={!ok}
        onClick={async () => {
          save({ pinHash: await hashPin(pin), pinLength: pin.length });
          setPin('');
          setAgain('');
          setDone(true);
        }}
      >
        {t('admin.savePin')}
      </button>
      {done && <p className="ok small">✓ {t('admin.pinSaved')}</p>}
    </Fold>
  );
}
