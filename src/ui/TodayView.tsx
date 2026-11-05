import { useApp } from '../app-context.ts';
import { addDays, isoWeekday, todayLocal } from '../days.ts';
import { Card, Page } from './common.tsx';

// Idag: the everyday page. For now a welcome and this week as squares, laid out as in Lönekoll.

export function TodayView() {
  const { t, settings } = useApp();
  const today = todayLocal();
  const monday = addDays(today, 1 - isoWeekday(today));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekday = (d: string) => new Intl.DateTimeFormat(settings.language, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  return (
    <Page title={t('nav.today')}>
      <section className="card">
        <div className="cal-focus-head">
          <strong>{t('today.week')}</strong>
        </div>
        <div className="cal-grid">
          {week.map((d) => (
            <span key={d} className={`cal-day ${d === today ? 'cal-today' : d > today ? 'cal-future' : 'cal-free'} ${isoWeekday(d) >= 6 ? 'cal-weekend' : ''}`}>
              <span className="cal-mark">{weekday(d)}</span>
              <span className="cal-num">{Number(d.slice(8))}</span>
              <span className="cal-label" />
            </span>
          ))}
        </div>
      </section>
      <Card title={t('today.welcome')} className="cal-focus">
        <p>{t('today.building')}</p>
      </Card>
    </Page>
  );
}
