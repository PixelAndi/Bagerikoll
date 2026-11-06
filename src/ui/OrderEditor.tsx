import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import type { LocalDate } from '../days.ts';
import { db, newId } from '../db.ts';
import { editedOrder } from '../domain/office.ts';
import { sortProducts } from '../domain/production.ts';
import type { Order, OrderLine } from '../domain/types.ts';
import { Field, Modal, Notice } from './common.tsx';

// Entering an order from the paper: order number, customer, pickup day, pallets (and if need be
// boxes) per product. Used in the office (Kontor) and in Produktion.

/** − n + with big buttons. */
export function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" className="button" aria-label="−" disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>
        −
      </button>
      <input type="text" inputMode="numeric" value={value} aria-label={label} onChange={(e) => onChange(Math.max(0, Math.min(999, Number(e.target.value.replace(/\D/g, '')) || 0)))} />
      <button type="button" className="button" aria-label="+" onClick={() => onChange(Math.min(999, value + 1))}>
        +
      </button>
    </span>
  );
}

/** A new or changed order: the customer, then pallets (and if need be boxes) per product. */
export function OrderEditor({ order, day, onClose }: { order?: Order; day: LocalDate; onClose: () => void }) {
  const { t } = useApp();
  const { customers, products } = useCatalog();
  const [customerId, setCustomerId] = useState(order?.customerId ?? '');
  const [orderNumber, setOrderNumber] = useState(order?.orderNumber ?? '');
  const others = useLiveQuery(() => db.orders.toArray(), []) ?? [];
  const taken = orderNumber.trim() && others.some((o) => o.id !== order?.id && !o.cancelled && o.orderNumber === orderNumber.trim());
  const [orderDay, setOrderDay] = useState(order?.day ?? day);
  const [lines, setLines] = useState<OrderLine[]>(order?.lines ?? []);
  const [note, setNote] = useState(order?.note ?? '');
  const [all, setAll] = useState(false);
  const [boxesFor, setBoxesFor] = useState<string[]>(order?.lines.filter((l) => l.boxes).map((l) => l.productId) ?? []);
  const shownCustomers = customers.filter((c) => !c.hidden || c.id === customerId);
  const sorted = sortProducts(products);
  const list = all || !customerId ? sorted : sorted.filter((p) => p.customerIds?.includes(customerId) || lines.some((l) => l.productId === p.id));
  const line = (id: string) => lines.find((l) => l.productId === id) ?? { productId: id, pallets: 0, boxes: 0 };
  const setLine = (id: string, patch: Partial<OrderLine>) => setLines((ls) => [...ls.filter((l) => l.productId !== id), { ...line(id), ...patch }]);
  const kept = lines.filter((l) => l.pallets > 0 || l.boxes > 0);
  const saveIt = async () => {
    if (!customerId || !kept.length) return;
    // Keep the products in the catalogue's order (also those hidden since).
    const ordered = [...sorted.map((p) => kept.find((l) => l.productId === p.id)), ...kept.filter((l) => !sorted.some((p) => p.id === l.productId))].filter((l): l is OrderLine => !!l);
    const fields = { orderNumber: orderNumber.trim() || undefined, customerId, day: orderDay, note: note.trim() || undefined };
    // A line whose amount changed is planned again from scratch; the others keep their tick.
    // A changed order keeps how it was first entered, so the change shows (to managers and accounting).
    if (order) await db.orders.update(order.id, { ...fields, ...editedOrder(order, ordered) });
    else await db.orders.put({ id: newId(), ...fields, lines: ordered, createdAt: Date.now() });
    onClose();
  };
  return (
    <Modal title={order ? t('prod.editOrder') : t('prod.newOrder')} onClose={onClose}>
      {!customers.length && <Notice kind="warn">{t('prod.customersFirst')}</Notice>}
      <div className="cal-chips pack-brands" role="group" aria-label={t('pack.customer')}>
        {shownCustomers.map((c) => (
          <button key={c.id} type="button" className={`cal-chip ${customerId === c.id ? 'pack-chip-on' : ''}`} aria-pressed={customerId === c.id} onClick={() => setCustomerId(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="field-row">
        <Field label={t('office.orderNumber')} hint={taken ? <span className="warn-text">{t('office.numberTaken')}</span> : undefined}>
          <input type="text" inputMode="numeric" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
        </Field>
        <Field label={t('office.pickupDay')}>
          <input type="date" value={orderDay} onChange={(e) => e.target.value && setOrderDay(e.target.value)} />
        </Field>
      </div>
      {customerId && (
        <>
          {order?.lines.some((l) => l.plannedAt) && <p className="small muted">{t('office.editUnplans')}</p>}
          <ul className="product-rows order-lines">
            {list.map((p) => {
              const l = line(p.id);
              const boxes = boxesFor.includes(p.id);
              return (
                <li key={p.id}>
                  <span>
                    <strong>{p.name}</strong>
                    {p.code && <span className="small muted"> · {p.code}</span>}
                    <br />
                    {!boxes && (
                      <button type="button" className="link-button small" onClick={() => setBoxesFor((b) => [...b, p.id])}>
                        + {t('prod.addBoxes')}
                      </button>
                    )}
                  </span>
                  <span className="order-steppers">
                    <span className="small muted">{t('pack.palletsWord')}</span>
                    <Stepper value={l.pallets} label={`${p.name} ${t('pack.palletsWord')}`} onChange={(n) => setLine(p.id, { pallets: n })} />
                    {boxes && (
                      <>
                        <span className="small muted">{t('pack.boxesWord')}</span>
                        <Stepper value={l.boxes} label={`${p.name} ${t('pack.boxesWord')}`} onChange={(n) => setLine(p.id, { boxes: n })} />
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <button type="button" className="link-button small" onClick={() => setAll(!all)}>
            {all ? t('prod.customerProducts') : t('prod.allProducts')}
          </button>
          <Field label={t('prod.note')}>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      )}
      <div className="button-row">
        <button type="button" className="button button-primary" disabled={!customerId || !kept.length} onClick={() => void saveIt()}>
          {t('admin.save')}
        </button>
        {order && !order.cancelled && (
          <button
            type="button"
            className="button button-danger"
            onClick={() => {
              if (confirm(t('prod.cancelConfirm'))) void db.orders.update(order.id, { cancelled: true }).then(onClose);
            }}
          >
            {t('prod.cancelOrder')}
          </button>
        )}
        {order?.cancelled && (
          <button type="button" className="button" onClick={() => void db.orders.update(order.id, { cancelled: false }).then(onClose)}>
            {t('prod.restoreOrder')}
          </button>
        )}
      </div>
    </Modal>
  );
}

