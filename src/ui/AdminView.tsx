import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useApp } from '../app-context.ts';
import { BRAND_COLORS, useCatalog } from '../data.ts';
import { DATA_TABLES, db, demoCount, newId } from '../db.ts';
import { todayLocal } from '../days.ts';
import { demoData } from '../domain/demo.ts';
import { removeDemoEverywhere, syncEnabled } from '../sync.ts';
import { hashPin } from '../domain/pin.ts';
import type { Product } from '../domain/types.ts';
import { palletLayers } from '../domain/pallet.ts';
import { Card, Field, Fold, Modal, Notice, Page } from './common.tsx';
import { countLink } from './DockView.tsx';
import { PalletBadge } from './PalletIcon.tsx';
import { QrCode } from './QrCode.tsx';

// Admin (behind the PIN): the managerial controls – names, customers, products and brands (for
// accounting), this device's
// station name and workstation lock, the PIN – and voiding entries in the log. Everything else,
// including who packed what and when, is open to everyone (the owner's decision).

export function AdminView() {
  const { t, admin, askPin, closeAdmin, settings } = useApp();
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
      {settings.locked && <Station />}
      <Workers />
      <Customers />
      <Products />
      <Brands />
      {!settings.locked && <Station />}
      <CountQrSettings />
      <ChangePin />
      <TestData />
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
            <input type="color" value={b.color} aria-label={t('admin.color')} onChange={(e) => void db.brands.update(b.id, { color: e.target.value })} />
            <input type="text" className="code-input" defaultValue={b.code ?? ''} placeholder={t('admin.brandCode')} aria-label={t('admin.brandCode')} maxLength={5} onBlur={(e) => void db.brands.update(b.id, { code: e.target.value.trim().toUpperCase() || undefined })} />
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
  const { customers, brands } = useCatalog();
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
            <select value={c.billedBy ?? ''} aria-label={t('office.billedBy')} onChange={(e) => void db.customers.update(c.id, { billedBy: e.target.value || undefined })}>
              <option value="">{t('admin.billedByNone')}</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {t('admin.billedByOption', { name: b.name })}
                </option>
              ))}
            </select>
            <label className="check-inline" title={t('admin.palletTransferHint')}>
              <input type="checkbox" checked={!!c.palletTransfer} onChange={(e) => void db.customers.update(c.id, { palletTransfer: e.target.checked || undefined })} /> {t('admin.palletTransfer')}
            </label>
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
    const prices = (p.prices ?? []).filter((x) => x.from && (x.perPallet !== undefined || x.perBox !== undefined)).sort((a, b) => (a.customerId ?? '').localeCompare(b.customerId ?? '') || (a.from < b.from ? -1 : 1));
    await db.products.update(p.id, { name: p.name.trim(), code: p.code?.trim() || undefined, brandId: p.brandId || undefined, customerIds: p.customerIds ?? [], boxesPerPallet: p.boxesPerPallet, boxesPerLayer: p.boxesPerLayer, gramsPerBread: p.gramsPerBread, breadsPerBox: p.breadsPerBox, palletsPerDough: p.palletsPerDough, prices, hidden: p.hidden });
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
      <div className="field-row admin-layer-row">
        <Field label={t('admin.boxesPerLayer')} hint={t('admin.boxesPerLayerHint')}>
          <input type="text" inputMode="numeric" defaultValue={p.boxesPerLayer ?? ''} placeholder="4" onChange={(e) => setP({ ...p, boxesPerLayer: num(e.target.value) })} />
        </Field>
        <Field label={t('admin.gramsPerBread')} hint={t('admin.gramsPerBreadHint')}>
          <input type="text" inputMode="numeric" defaultValue={p.gramsPerBread ?? ''} placeholder="60" onChange={(e) => setP({ ...p, gramsPerBread: num(e.target.value) })} />
        </Field>
        <Field label={t('admin.breadsPerBox')} hint={t('admin.breadsPerBoxHint')}>
          <input type="text" inputMode="numeric" defaultValue={p.breadsPerBox ?? ''} placeholder="90" onChange={(e) => setP({ ...p, breadsPerBox: num(e.target.value) })} />
        </Field>
        {p.boxesPerPallet ? <PalletBadge boxes={p.boxesPerPallet} perLayer={p.boxesPerLayer} label={t('pallet.label', { boxes: p.boxesPerPallet, layers: palletLayers(p.boxesPerPallet, p.boxesPerLayer).layers })} unit={0.5} /> : null}
      </div>
      <p className="small muted">💰 {t('admin.pricesInAccounting')}</p>
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
      {settings.locked && (
        <div className="kiosk-leave">
          <p>
            <strong>{t('admin.inKiosk', { station: t(settings.lockedTo === 'dock' ? 'nav.dock' : 'pack.title') })}</strong>
          </p>
          <button
            type="button"
            className="button button-primary pack-start"
            onClick={() => {
              save({ locked: false });
              closeAdmin();
              location.hash = '#/';
            }}
          >
            🔓 {t('admin.leaveKiosk')}
          </button>
        </div>
      )}
      <Field label={t('admin.stationName')} hint={t('admin.stationNameHint')}>
        <input type="text" defaultValue={settings.station} onBlur={(e) => e.target.value.trim() && save({ station: e.target.value.trim() })} />
      </Field>
      {/* What this device is: an ordinary one (the stations, Idag, Logg), a manager's, or accounting's. */}
      <span className="field-label">{t('admin.deviceKind')}</span>
      {(['ordinary', 'manager', 'accounting'] as const).map((kind) => {
        const on = kind === 'manager' ? !!settings.productionOpen : kind === 'accounting' ? !settings.productionOpen && !!settings.accountingDevice : !settings.productionOpen && !settings.accountingDevice;
        return (
          <label key={kind} className="check-row">
            <input type="radio" name="device-kind" checked={on} onChange={() => save({ productionOpen: kind === 'manager', accountingDevice: kind === 'accounting' })} />
            <span>
              <strong>{t(`admin.device.${kind}`)}</strong>
              <br />
              <span className="small muted">{t(`admin.device.${kind}Hint`)}</span>
            </span>
          </label>
        );
      })}
      <p className="small muted">{t('admin.lockHint')}</p>
      <div className="button-row">
        {(['pack', 'dock'] as const).map((to) => (
          <button
            key={to}
            type="button"
            className="button button-primary"
            onClick={() => {
              save({ locked: true, lockedTo: to, productionOpen: false, accountingDevice: false });
              closeAdmin();
              location.hash = `#/${to}`;
            }}
          >
            🔒 {t(to === 'dock' ? 'admin.lockDock' : 'admin.lock')}
          </button>
        ))}
      </div>
    </Card>
  );
}

/**
 * Test data: a few made-up weeks to see every page filled in (src/domain/demo.ts), and the way to
 * take it off again – from the server and so from every device, real data untouched.
 */
function TestData() {
  const { t, settings } = useApp();
  const count = useLiveQuery(() => demoCount(), []) ?? 0;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const add = async () => {
    if (!confirm(t('demo.addConfirm'))) return;
    setBusy(true);
    const data = demoData(todayLocal(), Date.now(), (day, hh, mm) => new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`).getTime());
    await db.transaction('rw', DATA_TABLES.map((n) => db.table(n)), async () => {
      for (const [name, rows] of Object.entries(data)) await db.table(name).bulkPut(rows);
    });
    setBusy(false);
    setDone(t('demo.added'));
  };
  const remove = async () => {
    if (!confirm(t('demo.removeConfirm'))) return;
    setBusy(true);
    try {
      await removeDemoEverywhere(settings.station);
      setDone(t(syncEnabled() ? 'demo.removedEverywhere' : 'demo.removedHere'));
    } catch {
      setDone(t('demo.removeFailed'));
    }
    setBusy(false);
  };
  return (
    <Card title={t('demo.title')}>
      <p className="small muted">{t('demo.hint')}</p>
      <p>{count ? t('demo.count', { n: count }) : t('demo.none')}</p>
      <div className="button-row">
        <button type="button" className="button" disabled={busy} onClick={() => void add()}>
          {t(count ? 'demo.addAgain' : 'demo.add')}
        </button>
        <button type="button" className="button" disabled={busy || (!count && !syncEnabled())} onClick={() => void remove()}>
          🗑 {t('demo.remove')}
        </button>
      </div>
      {done && <p className="small">{done}</p>}
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

/** The freezer's QR code for counting with a phone: the link it opens and how long it shows. */
function CountQrSettings() {
  const { t, settings, save } = useApp();
  const link = countLink(settings.qrLink);
  return (
    <Fold title={t('count.qrSettings')} sub={t('count.qrSettingsSub', { s: settings.qrSeconds ?? 30 })}>
      <p className="small muted">{t('count.qrSettingsHint')}</p>
      <Field label={t('count.qrLinkLabel')} hint={t('count.qrLinkHint')}>
        <input type="url" defaultValue={settings.qrLink ?? ''} placeholder={countLink()} onBlur={(e) => save({ qrLink: e.target.value.trim() || undefined })} />
      </Field>
      <Field label={t('count.qrSecondsLabel')}>
        <input type="number" min={5} max={600} defaultValue={settings.qrSeconds ?? 30} onBlur={(e) => save({ qrSeconds: Math.min(600, Math.max(5, Number(e.target.value) || 30)) })} />
      </Field>
      <div className="qr-admin">
        <QrCode text={link} size={120} title={link} />
        <span className="small">
          {t('count.qrNow')}
          <br />
          <a href={link}>{link}</a>
        </span>
      </div>
    </Fold>
  );
}
