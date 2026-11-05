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
