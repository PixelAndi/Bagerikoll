import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import { db } from '../db.ts';
import { openLoadingDeviations } from '../domain/dock.ts';
import { Card, Field, Modal } from './common.tsx';

// Deviations reported at the loading dock, for the managers (Kontor and Produktion): each with the
// delivery, what went wrong, who reported it and when, until a manager marks it handled.

export function LoadingDeviations() {
  const { t } = useApp();
  const { customers, workers } = useCatalog();
  const deviations = useLiveQuery(() => db.deviations.where('day').aboveOrEqual('2000-01-01').toArray(), []) ?? [];
  const orders = useLiveQuery(() => db.orders.toArray(), []) ?? [];
  const [handling, setHandling] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const open = openLoadingDeviations(deviations);
  if (!open.length) return null;
  const names = (ids: string[] = []) => ids.map((id) => workers.find((w) => w.id === id)?.name ?? '?').join(', ');
  const when = (at: number) => new Date(at).toLocaleString('sv-SE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <Card title={t('dock.managerTitle', { n: open.length })} className="cal-check">
      <ul className="cal-check-list">
        {open.map((x) => {
          const o = orders.find((y) => y.id === x.orderId);
          return (
            <li key={x.id}>
              <span>
                <strong>
                  {customers.find((c) => c.id === o?.customerId)?.name ?? '?'}
                  {o?.orderNumber && ` #${o.orderNumber}`}
                </strong>{' '}
                · {t(`dock.kind.${x.loadingKind ?? 'other'}`)}
                {x.note && `: ${x.note}`}
                <br />
                <span className="small muted">
                  {when(x.at)} · {names(x.workerIds)}
                </span>
              </span>
              <button type="button" className="link-button small" onClick={() => (setHandling(x.id), setNote(''))}>
                {t('dock.markHandled')}
              </button>
            </li>
          );
        })}
      </ul>
      {handling && (
        <Modal title={t('dock.markHandled')} onClose={() => setHandling(null)}>
          <Field label={t('prod.note')} hint={t('dock.handledHint')}>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <button
            type="button"
            className="button button-primary pack-start"
            onClick={() => void db.deviations.update(handling, { handled: { at: Date.now(), note: note.trim() || undefined } }).then(() => setHandling(null))}
          >
            {t('dock.markHandled')}
          </button>
        </Modal>
      )}
    </Card>
  );
}
