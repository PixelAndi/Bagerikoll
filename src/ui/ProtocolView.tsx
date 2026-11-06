import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import { saveDataFile } from '../datafile.ts';
import { addDays, todayLocal, type LocalDate } from '../days.ts';
import { db } from '../db.ts';
import { batchRange, runCount, runGaps, runSigners, runThrowers, testGaps } from '../domain/runs.ts';
import type { DetectorTest, Run } from '../domain/types.ts';
import { href } from '../router.ts';
import { Notice, Page } from './common.tsx';

// The packing protocol for a day – the paper form, filled in by the app: one row per run (product
// change), with the box numbers, pallets and extra boxes, customer, the metal detector tests,
// labels checked, machine cleaned, and who signs for it; deviations below, each tied to its time
// and the product being packed. Open to everyone; printed (or saved as PDF) from the browser.

const clock = (at: number) => new Date(at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

export function ProtocolView({ day: asked }: { day?: string }) {
  const { t, settings } = useApp();
  const today = todayLocal();
  const day: LocalDate = asked ?? today;
  const go = (d: LocalDate) => (location.hash = href({ name: 'protocol', day: d }));
  const { workers, customers, products } = useCatalog();
  // The day's runs and everything packed in them, read together so the table never shows a run
  // without its count (a run can go on past midnight, so entries are read from its start).
  const data = useLiveQuery(async () => {
    const runs = await db.runs.where('day').equals(day).sortBy('startedAt');
    const ids = new Set(runs.map((r) => r.id));
    const entries = runs.length ? await db.entries.where('at').aboveOrEqual(runs[0].startedAt).filter((e) => !!e.runId && ids.has(e.runId)).toArray() : [];
    return { runs, entries };
  }, [day]);
  const runs = data?.runs;
  const entries = data?.entries ?? [];
  const loose = useLiveQuery(() => db.entries.where('day').equals(day).filter((e) => !e.runId && !e.voided).count(), [day]) ?? 0;
  const deviations = (useLiveQuery(() => db.deviations.where('day').equals(day).toArray(), [day]) ?? []).filter((x) => !x.removed && (x.kind === 'detector' || x.kind === 'packing')).sort((a, b) => a.at - b.at);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const name = (id: string) => workers.find((w) => w.id === id)?.name ?? '?';
  const stations = [...new Set((runs ?? []).map((r) => r.station))].join(', ');
  const dateText = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
  const tests = (r: Run, piece: keyof Pick<DetectorTest, 'ferro' | 'nonFerro' | 'stainless'>) =>
    r.tests.map((x, i) => (
      <span key={i} className={x[piece] ? 'proto-ok' : 'proto-bad'}>
        {x[piece] ? '✓' : '✗'} {clock(x.at)}
      </span>
    ));

  return (
    <Page
      title={t('protocol.title')}
      actions={
        <span className="cal-year-nav no-print">
          <button type="button" className="link-inline" onClick={() => go(addDays(day, -1))} aria-label={t('common.previous')}>
            ‹
          </button>
          <button type="button" className="link-inline" disabled={day >= today} onClick={() => go(addDays(day, 1))} aria-label={t('common.next')}>
            ›
          </button>
        </span>
      }
    >
      {settings.locked && (
        <a className="small no-print" href={href({ name: 'pack' })}>
          ‹ {t('protocol.backToStation')}
        </a>
      )}
      <div className="proto-head">
        <strong>{t('protocol.heading', { date: dateText })}</strong>
        <span>{stations && t('protocol.station', { stations })}</span>
      </div>

      {!runs?.length ? (
        <p className="muted">{t('protocol.empty')}</p>
      ) : (
        <div className="proto-scroll">
          <table className="proto-table">
            <thead>
              <tr>
                <th>{t('protocol.time')}</th>
                <th>{t('protocol.product')}</th>
                <th>{t('protocol.batch')}</th>
                <th>{t('protocol.count')}</th>
                <th>{t('protocol.customer')}</th>
                <th>{t('test.ferro')}</th>
                <th>{t('test.nonFerro')}</th>
                <th>{t('test.stainless')}</th>
                <th>{t('protocol.labels')}</th>
                <th>{t('protocol.cleaned')}</th>
                <th>{t('protocol.signature')}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const p = products.find((x) => x.id === r.productId);
                const c = runCount(r, entries, p);
                const gaps = runGaps(r);
                const late = testGaps(r, entries, now);
                return (
                  <tr key={r.id} className={r.cancelled ? 'proto-cancelled' : ''}>
                    <td>
                      {clock(r.startedAt)}
                      {r.endedAt ? `–${clock(r.endedAt)}` : <span className="proto-open"> {t('protocol.ongoing')}</span>}
                    </td>
                    <td>
                      {p?.name ?? '?'}
                      {p?.code && <span className="muted"> {p.code}</span>}
                      {r.cancelled && <span className="muted"> ({t('protocol.cancelled')})</span>}
                    </td>
                    <td>{batchRange(c.totalBoxes) ?? <span className="proto-bad">{t('protocol.noBatch')}</span>}</td>
                    <td>{t('run.count', { pallets: c.pallets, boxes: c.boxes })}</td>
                    <td>{customers.find((x) => x.id === (r.customerId ?? p?.customerIds?.[0]))?.name ?? ''}</td>
                    <td className="proto-tests">{tests(r, 'ferro')}</td>
                    <td className="proto-tests">{tests(r, 'nonFerro')}</td>
                    <td className="proto-tests">{tests(r, 'stainless')}</td>
                    <td>{r.labels ? <span className="proto-ok">✓ {clock(r.labels.at)}</span> : gaps.includes('labels') && <span className="proto-bad">{t('protocol.missing')}</span>}</td>
                    <td>{r.cleaned ? <span className="proto-ok">✓ {clock(r.cleaned.at)}</span> : gaps.includes('cleaned') && <span className="proto-bad">{t('protocol.missing')}</span>}</td>
                    <td>
                      {runSigners(r, entries).map(name).join(', ')}
                      {runThrowers(r, entries).length > 0 && (
                        <span className="muted">
                          <br />
                          {t('upstairs.short')}: {runThrowers(r, entries).map(name).join(', ')}
                        </span>
                      )}
                      {late.map((at) => (
                        <span key={at} className="proto-bad">
                          <br />
                          {t('protocol.testLate', { time: clock(at) })}
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="card-title">{t('protocol.deviations')}</h2>
      {deviations.length === 0 ? (
        <p className="muted">{t('protocol.noDeviations')}</p>
      ) : (
        <ul className="product-rows">
          {deviations.map((x) => (
            <li key={x.id}>
              <span>
                <strong>
                  {clock(x.at)} · {products.find((p) => p.id === x.productId)?.name ?? '?'} · {t(`dev.${x.kind}`)}
                </strong>
                <br />
                {x.note}
                {x.workerIds?.length ? <span className="muted"> – {x.workerIds.map(name).join(', ')}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {loose > 0 && <Notice kind="warn">{t('protocol.loose', { n: loose })}</Notice>}
      <p className="small muted">{t('protocol.footer', { when: new Date(now).toLocaleString('sv-SE') })}</p>

      <div className="button-row no-print">
        <button type="button" className="button button-primary" onClick={() => window.print()}>
          {t('protocol.print')}
        </button>
        <button type="button" className="button" onClick={() => void saveDataFile(settings.station).catch(() => undefined)}>
          {t('data.save')}
        </button>
      </div>
      <p className="small muted no-print">{t('protocol.keepHint')}</p>
    </Page>
  );
}
