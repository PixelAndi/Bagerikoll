import { useApp } from '../app-context.ts';
import { addDays, isoWeekday, monthName, todayLocal } from '../days.ts';
import { Page } from './common.tsx';

// Kalender: the year as small squares, this month highlighted – Lönekoll's Kalender, before
// Bagerikoll has anything to colour the days with.

export function CalendarView() {
  const { t, settings } = useApp();
  const today = todayLocal();
  const year = today.slice(0, 4);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}-01`);
  return (
    <Page title={`${t('nav.calendar')} ${year}`}>
      <div className="cal-year">
        {months.map((m) => {
          const days: string[] = [];
          for (let d = m; d.slice(0, 7) === m.slice(0, 7); d = addDays(d, 1)) days.push(d);
          const now = m.slice(0, 7) === today.slice(0, 7);
          return (
            <span key={m} className={`cal-mini ${now ? 'cal-mini-now' : ''} ${m.slice(0, 7) > today.slice(0, 7) ? 'cal-mini-later' : ''}`}>
              <span className="cal-mini-head">
                <strong>{monthName(m, settings.language, 'short')}</strong>
              </span>
              <span className="cal-mini-grid" aria-hidden="true">
                {Array.from({ length: (isoWeekday(m) + 6) % 7 }, (_, i) => (
                  <i key={`b${i}`} />
                ))}
                {days.map((d) => (
                  <i key={d} className={`cal-day ${d > today ? 'cal-future' : ''} ${isoWeekday(d) >= 6 ? 'cal-weekend cal-free' : ''} ${d === today ? 'cal-today' : ''}`} />
                ))}
              </span>
            </span>
          );
        })}
      </div>
      <p className="small muted">{t('cal.note')}</p>
    </Page>
  );
}
