import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useApp } from '../app-context.ts';
import { useCatalog } from '../data.ts';
import { addDays, todayLocal } from '../days.ts';
import { db } from '../db.ts';
import { loadProgress } from '../domain/dock.ts';
import { dockNow, packedDays, packingNow, STALE_MS, type DockNow, type PackingNow } from '../domain/overview.ts';
import { batchRange, runCount, testState } from '../domain/runs.ts';
import { href } from '../router.ts';
import { useSyncStatus } from '../sync.ts';
import { Fold, Notice } from './common.tsx';

// The managers' view of the stations (their Stationer tab): what each packing station and the
// freezer is doing right now – who works there, upstairs included, the product, the count, the
// detector test and the last registration – then the days before, each leading to its protocol
// (who packed what, run by run) and the log. As fresh as the stations' last sync.

const clock = (at: number) => new Date(at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

export function OverviewView() {
  const { t } = useApp();
  const sync = useSyncStatus();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const today = todayLocal();
  const from = addDays(today, -13);
  const data = useLiveQuery(async () => {
    const since = Date.now() - 2 * STALE_MS;
    const [sessions, runs, recent, orders] = await Promise.all([
      db.sessions.where('startedAt').aboveOrEqual(since - STALE_MS).toArray(),
      db.runs.where('day').between(from, today, true, true).toArray(),
      db.entries.where('day').between(from, today, true, true).toArray(),
      db.orders.where('day').equals(today).toArray(),
    ]);
    // A session started long ago that still registers: fetch it too.
    const missing = [...new Set(recent.filter((e) => e.at > since && !sessions.some((s) => s.id === e.sessionId)).map((e) => e.sessionId))];
    const more = missing.length ? ((await db.sessions.bulkGet(missing)).filter(Boolean) as typeof sessions) : [];
    return { sessions: [...sessions, ...more], runs, entries: recent, orders };
  }, [from, today]);
  if (!data) return null;
  const packing = packingNow(data.sessions, data.runs, data.entries, now);
  const dock = dockNow(data.sessions, data.orders, now);
  const days = packedDays(data.entries, data.runs);
  const todayDone = days.find((d) => d.day === today);

  return (
    <>
      {sync.state === 'off' ? (
        <Notice kind="info">{t('overview.local')}</Notice>
      ) : (
        <p className="small muted">{sync.at ? t('overview.fresh', { time: clock(sync.at) }) : t('sync.syncing')}</p>
      )}

      <h2 className="card-title">{t('overview.now')}</h2>
      {!packing.length && !dock.length && <p className="muted">{t('overview.nothing')}</p>}
      <div className="overview-grid">
        {packing.map((p) => (
          <PackingCard key={p.station} now={now} p={p} entries={data.entries} />
        ))}
        {dock.map((d) => (
          <DockCard key={d.station} d={d} />
        ))}
      </div>

      <section className="card">
        <div className="cal-numbers">
          <div>
            <strong className="pack-figure">{todayDone?.count.pallets ?? 0}</strong>
            <span className="small muted">{t('overview.palletsToday')}</span>
          </div>
          <div>
            <strong className="pack-figure">{todayDone?.count.boxes ?? 0}</strong>
            <span className="small muted">{t('overview.boxesToday')}</span>
          </div>
          <div>
            <strong className="pack-figure">{todayDone?.runs ?? 0}</strong>
            <span className="small muted">{t('overview.runsToday')}</span>
          </div>
        </div>
        <div className="button-row">
          <a className="button button-primary" href={href({ name: 'protocol', day: today })}>
            {t('overview.protocolToday')}
          </a>
          <a className="button" href={href({ name: 'today' })}>
            {t('overview.todayDetail')}
          </a>
          <a className="button" href={href({ name: 'log' })}>
            {t('overview.log')}
          </a>
        </div>
      </section>

      <Fold title={t('overview.history')} sub={t('overview.historySub')}>
        <HistoryList days={days.filter((d) => d.day !== today)} />
      </Fold>
    </>
  );
}

function PackingCard({ p, entries, now }: { p: PackingNow; entries: import('../domain/types.ts').Entry[]; now: number }) {
  const { t } = useApp();
  const { workers, products, customers } = useCatalog();
  const name = (id: string) => workers.find((w) => w.id === id)?.name ?? '?';
  const product = p.run ? products.find((x) => x.id === p.run!.productId) : undefined;
  const c = p.run ? runCount(p.run, entries, product) : undefined;
  const test = p.run ? testState(p.run, now) : undefined;
  const throwers = p.session?.throwerIds ?? [];
  const lastProduct = p.last ? products.find((x) => x.id === p.last!.productId) : undefined;
  return (
    <section className={`card ${p.quiet ? '' : 'cal-focus'} overview-card`}>
      <div className="cal-focus-head">
        <strong>📦 {p.station || t('device.unnamed')}</strong>
        <span className={`cal-chip ${p.quiet ? 'cal-chip-warn' : 'cal-chip-ok'}`}>{p.quiet ? t('overview.quiet', { time: clock(p.lastAt) }) : t('overview.active')}</span>
      </div>
      {p.session && (
        <p className="overview-people">
          <span className="small muted">{t('pack.packing')}:</span> <strong>{p.session.workerIds.map(name).join(', ')}</strong>
          <br />
          <span className="small muted">{t('upstairs.title')}:</span> {throwers.length ? <strong>{throwers.map(name).join(', ')}</strong> : <span className="muted">{t('upstairs.noneShort')}</span>}
        </p>
      )}
      {p.run && product ? (
        <>
          <p>
            <strong>{product.name}</strong>
            <span className="small muted"> {[product.code, customers.find((x) => x.id === p.run!.customerId)?.name].filter(Boolean).join(' · ')}</span>
          </p>
          <div className="cal-chips">
            <span className="cal-chip">{t('run.since', { time: clock(p.run.startedAt) })}</span>
            {c && <span className="cal-chip">{t('run.count', { pallets: c.pallets, boxes: c.boxes })}</span>}
            {c && batchRange(c.totalBoxes) && <span className="cal-chip">{t('run.batch', { range: batchRange(c.totalBoxes)! })}</span>}
            {test?.kind === 'ok' && <span className={`cal-chip ${test.soon ? 'cal-chip-warn' : 'cal-chip-ok'}`}>{t(test.soon ? 'run.testSoon' : 'run.testOk', { time: clock(test.dueAt) })}</span>}
            {test?.kind === 'needed' && <span className="cal-chip cal-chip-warn">{t('test.needed')}</span>}
            {test?.kind === 'overdue' && <span className="cal-chip cal-chip-bad">{t('test.overdue')}</span>}
            {test?.kind === 'failed' && <span className="cal-chip cal-chip-bad">{t('test.failedTitle')}</span>}
          </div>
        </>
      ) : (
        <p className="small muted">{t('overview.noRun')}</p>
      )}
      <p className="small muted">
        {t('overview.sessionCount', { pallets: p.count.pallets, boxes: p.count.boxes })}
        {p.last && lastProduct && ` · ${t('overview.last', { time: clock(p.last.at), what: t(p.last.kind === 'pallet' ? 'pack.nPallets' : 'pack.nBoxes', { n: p.last.quantity }), product: lastProduct.name })}`}
      </p>
    </section>
  );
}

function DockCard({ d }: { d: DockNow }) {
  const { t } = useApp();
  const { workers, customers } = useCatalog();
  const name = (id: string) => workers.find((w) => w.id === id)?.name ?? '?';
  const progress = d.loading ? loadProgress(d.loading) : undefined;
  return (
    <section className="card cal-focus overview-card">
      <div className="cal-focus-head">
        <strong>🚚 {d.station || t('device.unnamed')}</strong>
        <span className="cal-chip cal-chip-ok">{t('overview.active')}</span>
      </div>
      <p className="overview-people">
        <span className="small muted">{t('dock.loaders')}:</span> <strong>{d.session.workerIds.map(name).join(', ') || '–'}</strong>
        <br />
        <span className="small muted">{t('dock.driver')}:</span> {d.session.driverId ? <strong>{name(d.session.driverId)}</strong> : <span className="muted">–</span>}
      </p>
      {d.loading && progress ? (
        <p>
          {t('overview.loading', { customer: customers.find((c) => c.id === d.loading!.customerId)?.name ?? '?' })}{' '}
          <span className="small muted">{t('overview.loadProgress', { checked: progress.checked, total: progress.total })}</span>
        </p>
      ) : (
        <p className="small muted">{t('overview.notLoading')}</p>
      )}
    </section>
  );
}

function HistoryList({ days }: { days: ReturnType<typeof packedDays> }) {
  const { t } = useApp();
  const { workers } = useCatalog();
  const name = (id: string) => workers.find((w) => w.id === id)?.name ?? '?';
  const dayText = (d: string) => new Intl.DateTimeFormat('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  if (!days.length) return <p className="muted">{t('overview.noHistory')}</p>;
  return (
    <ul className="product-rows">
      {days.map((d) => (
        <li key={d.day}>
          <a href={href({ name: 'protocol', day: d.day })} className="overview-day">
            <strong>{dayText(d.day)}</strong>
            <span>{t('overview.dayLine', { pallets: d.count.pallets, boxes: d.count.boxes, runs: d.runs })}</span>
            <span className="small muted">{d.workerIds.map(name).join(', ')}</span>
          </a>
        </li>
      ))}
      <li>
        <span className="small muted">{t('overview.olderHint')}</span>
      </li>
    </ul>
  );
}
