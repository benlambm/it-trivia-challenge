import type { PublicStats } from '../types';

export function formatInt(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : Math.round(value).toLocaleString('en-US');
}

export function formatPct(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`;
}

// Dollars: cents for totals, a tenth of a cent for per-game figures.
export function formatUsd(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '—';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function formatCents(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const cents = value * 100;
  return `${cents.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}¢`;
}

export function formatSeconds(ms: number | null | undefined): string {
  return ms === null || ms === undefined ? '—' : `${Math.round(ms / 1000)} s`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${year}`;
}

// 'YYYY-MM-DD' -> 'Oct 3, 2026' (dates are already local to Brightpoint).
export function formatDay(date: string, withYear = true): string {
  const [year, m, d] = date.split('-').map(Number);
  return withYear ? `${MONTHS[m - 1]} ${d}, ${year}` : `${MONTHS[m - 1]} ${d}`;
}

// ISO timestamp -> local calendar date in the stats time zone.
export function isoToLocalDate(iso: string, timeZone = 'America/New_York'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );
}

function addDays(date: string, days: number): string {
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

export interface DayBar {
  key: string; // first day of the bucket
  label: string;
  completed: number;
  notCompleted: number;
  quizzes: number;
}

// Every day from the first recorded day to `today`, zeros included, so quiet
// days show as gaps. Past ~4 months the bars get too thin, so group by week.
export function dailyBars(stats: PublicStats, today: string): { bars: DayBar[]; unit: 'day' | 'week' } {
  if (stats.daily.length === 0) return { bars: [], unit: 'day' };
  const byDate = new Map(stats.daily.map((d) => [d.date, d]));
  const first = stats.daily[0].date;
  const last = today > stats.daily[stats.daily.length - 1].date ? today : stats.daily[stats.daily.length - 1].date;
  const days: DayBar[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    const d = byDate.get(date);
    const quizzes = d?.quizzes ?? 0;
    const completed = Math.min(d?.completed ?? 0, quizzes);
    days.push({ key: date, label: formatDay(date), completed, notCompleted: quizzes - completed, quizzes });
    if (days.length > 4000) break;
  }
  if (days.length <= 120) return { bars: days, unit: 'day' };
  const weeks: DayBar[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    const quizzes = chunk.reduce((sum, d) => sum + d.quizzes, 0);
    const completed = chunk.reduce((sum, d) => sum + d.completed, 0);
    weeks.push({
      key: chunk[0].key,
      label: `Week of ${formatDay(chunk[0].key)}`,
      completed,
      notCompleted: quizzes - completed,
      quizzes,
    });
  }
  return { bars: weeks, unit: 'week' };
}

// Clean axis ticks (0, 2, 4 ... or 0, 5, 10 ...) covering `max`.
// Counts only, so steps are whole numbers: the smallest 1/2/5 x 10^n step
// that needs at most target + 1 intervals.
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  let exponent = Math.floor(Math.log10(max / (target + 1)));
  for (let guard = 0; guard < 20; guard++, exponent++) {
    for (const m of [1, 2, 5]) {
      const step = Math.max(1, m * 10 ** exponent);
      const intervals = Math.ceil(max / step);
      if (intervals <= target + 1) return Array.from({ length: intervals + 1 }, (_, i) => i * step);
    }
  }
  return [0, max];
}
