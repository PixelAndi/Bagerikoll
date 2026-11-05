// Dates as "YYYY-MM-DD", worked out in UTC so a day is always a day.

export type LocalDate = string;

export const todayLocal = (): LocalDate => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function addDays(date: LocalDate, n: number): LocalDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday = 1 … Sunday = 7. */
export const isoWeekday = (date: LocalDate) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

export const monthName = (date: LocalDate, lang: string, style: 'long' | 'short' = 'long') =>
  new Intl.DateTimeFormat(lang, { month: style, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

/** The Monday of a date's week. */
export const mondayOf = (date: LocalDate): LocalDate => addDays(date, 1 - isoWeekday(date));

/** ISO week number (weeks start on Monday; week 1 holds the year's first Thursday). */
export function isoWeek(date: LocalDate): { year: number; week: number } {
  const thursday = addDays(date, 4 - isoWeekday(date));
  const year = Number(thursday.slice(0, 4));
  const jan1 = `${year}-01-01`;
  const days = Math.round((Date.parse(`${thursday}T00:00:00Z`) - Date.parse(`${jan1}T00:00:00Z`)) / 86400000);
  return { year, week: Math.floor(days / 7) + 1 };
}
