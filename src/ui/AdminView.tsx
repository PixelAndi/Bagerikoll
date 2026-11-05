import { useState } from 'react';
import { useApp } from '../app-context.ts';
import { BRAND_COLORS, useCatalog } from '../data.ts';
import { db, newId } from '../db.ts';
import { hashPin } from '../domain/pin.ts';
import { Card, Field, Fold, Notice, Page } from './common.tsx';

// Admin (behind the PIN): the managerial controls – names, brands and products, this device's
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
      <Brands />
      <Products />
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
    await db.workers.put({ id: newId(), name: n });
    setName('');
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
    await db.brands.put({ id: newId(), name: n, color: BRAND_COLORS[brands.length % BRAND_COLORS.length] });
    setName('');
  };
  return (
    <Fold title={t('admin.brands')} sub={brands.map((b) => b.name).join(', ') || t('admin.none')}>
      <p className="small muted">{t('admin.brandsHint')}</p>
      <ul className="edit-rows">
        {brands.map((b) => (
          <li key={b.id}>
            <input type="color" value={b.color} aria-label={t('admin.color')} onChange={(e) => void db.brands.update(b.id, { color: e.target.value })} />
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

function Products() {
  const { t } = useApp();
  const { brands, products } = useCatalog();
  const [name, setName] = useState('');
  const [brandId, setBrandId] = useState('');
  const [code, setCode] = useState('');
  const brand = brandId || brands[0]?.id || '';
  const add = async () => {
    const n = name.trim();
    if (!n || !brand) return;
    await db.products.put({ id: newId(), name: n, brandId: brand, code: code.trim() || undefined });
    setName('');
    setCode('');
  };
  const sorted = [...products].sort((a, b) => a.brandId.localeCompare(b.brandId) || a.name.localeCompare(b.name, 'sv'));
  return (
    <Fold title={t('admin.products')} sub={t('admin.count', { n: products.filter((p) => !p.hidden).length })}>
      {!brands.length && <Notice kind="warn">{t('admin.brandFirst')}</Notice>}
      <ul className="edit-rows">
        {sorted.map((p) => (
          <li key={p.id} className={p.hidden ? 'pack-voided' : ''}>
            <select value={p.brandId} aria-label={t('pack.brand')} onChange={(e) => void db.products.update(p.id, { brandId: e.target.value })}>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <input type="text" defaultValue={p.name} aria-label={t('admin.name')} onBlur={(e) => e.target.value.trim() && void db.products.update(p.id, { name: e.target.value.trim() })} />
            <input type="text" className="code-input" defaultValue={p.code ?? ''} placeholder={t('admin.code')} aria-label={t('admin.code')} onBlur={(e) => void db.products.update(p.id, { code: e.target.value.trim() || undefined })} />
            <button type="button" className="link-button small" onClick={() => void db.products.update(p.id, { hidden: !p.hidden })}>
              {p.hidden ? t('admin.show') : t('admin.hide')}
            </button>
          </li>
        ))}
      </ul>
      {brands.length > 0 && (
        <div className="add-row">
          <select value={brand} onChange={(e) => setBrandId(e.target.value)} aria-label={t('pack.brand')}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input type="text" value={name} placeholder={t('admin.newProduct')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
          <input type="text" className="code-input" value={code} placeholder={t('admin.code')} onChange={(e) => setCode(e.target.value)} />
          <button type="button" className="button button-primary" disabled={!name.trim()} onClick={() => void add()}>
            {t('admin.add')}
          </button>
        </div>
      )}
    </Fold>
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
      <p className="small muted">{t('admin.lockHint')}</p>
      <button
        type="button"
        className="button button-primary"
        onClick={() => {
          save({ locked: true });
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
