import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import { todayLocal } from '../days.ts';
import { db, newId } from '../db.ts';
import { href } from '../router.ts';
import { Field, Modal, Notice, Page } from './common.tsx';
import { Upstairs } from './PackView.tsx';

// Uppe vid bandet – its own tab at the packing station, kept apart from the packing itself. There
// is no device upstairs (and phones are restricted there), so it is run from downstairs: who is
// upstairs now, and the quality problems they call down, saved as quality deviations tied to the
// product on the line and signed by those upstairs.

const REASONS = ['burnt', 'pale', 'size', 'shape', 'damaged', 'other'] as const;

export function UpstairsView() {
  const { t, settings } = useApp();
  const { products } = useCatalog();
  const session = useLiveQuery(() => (settings.sessionId ? db.sessions.get(settings.sessionId) : undefined), [settings.sessionId]);
  const running = session && !session.endedAt ? session : undefined;
  const run = useLiveQuery(() => (settings.runId ? db.runs.get(settings.runId) : undefined), [settings.runId]);
  const onLine = run && !run.endedAt ? run : undefined;
  const product = onLine ? products.find((p) => p.id === onLine.productId) : undefined;
  const today = todayLocal();
  const reports = (useLiveQuery(() => db.deviations.where('day').equals(today).toArray(), [today]) ?? []).filter((x) => x.kind === 'quality' && !x.removed).sort((a, b) => b.at - a.at);
  const [reporting, setReporting] = useState(false);
  const throwerIds = running?.throwerIds ?? [];
  const { workers } = useCatalog();
  const name = (id: string) => workers.find((w) => w.id === id)?.name ?? '?';

  return (
    <Page title={t('upstairs.title')}>
      <p className="muted">{t('upstairs.intro')}</p>
      {!running ? (
        <Notice kind="info">
          {t('upstairs.noSession')} <a href={href({ name: 'pack' })}>{t('pack.title')} ›</a>
        </Notice>
      ) : (
        <div className="pack-layout">
          <div className="pack-main">
            <Upstairs sessionId={running.id} workerIds={running.workerIds} throwerIds={throwerIds} />
          </div>
          <div className="pack-side">
            <section className="card cal-focus">
              <strong>{t('quality.title')}</strong>
              <p className="small muted">{product ? t('quality.onLine', { product: product.name }) : t('quality.noRun')}</p>
              <button type="button" className="button button-primary pack-start" disabled={!onLine} onClick={() => setReporting(true)}>
                {t('quality.report')}
              </button>
            </section>
            {reports.length > 0 && (
              <section className="card">
                <h2 className="card-title">{t('quality.today')}</h2>
                <ul className="product-rows">
                  {reports.map((x) => (
                    <li key={x.id}>
                      <span>
                        <strong>
                          {new Date(x.at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} · {products.find((p) => p.id === x.productId)?.name ?? '?'}
                        </strong>
                        <br />
                        {x.note}
                        {x.workerIds?.length ? <span className="muted"> – {x.workerIds.map(name).join(', ')}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}
      {reporting && onLine && running && (
        <QualityReport
          onClose={() => setReporting(false)}
          onSave={async (note) => {
            await db.deviations.put({ id: newId(), day: todayLocal(), productId: onLine.productId, kind: 'quality', note, at: Date.now(), runId: onLine.id, workerIds: throwerIds.length ? throwerIds : running.workerIds });
            setReporting(false);
          }}
        />
      )}
    </Page>
  );
}

function QualityReport({ onClose, onSave }: { onClose: () => void; onSave: (note: string) => Promise<void> }) {
  const { t } = useApp();
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const text = [...picked.map((r) => t(`quality.${r}` as 'quality.burnt')), note.trim()].filter(Boolean).join('. ');
  return (
    <Modal title={t('quality.report')} onClose={onClose}>
      <div className="pack-names">
        {REASONS.map((r) => (
          <button key={r} type="button" className={`pack-name ${picked.includes(r) ? 'on' : ''}`} aria-pressed={picked.includes(r)} onClick={() => setPicked((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]))}>
            {t(`quality.${r}`)}
          </button>
        ))}
      </div>
      <Field label={t('prod.note')} hint={t('quality.noteHint')}>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <button type="button" className="button button-primary pack-start" disabled={!text || (picked.includes('other') && !note.trim())} onClick={() => void onSave(text)}>
        {t('admin.save')}
      </button>
    </Modal>
  );
}
