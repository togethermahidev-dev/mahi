/**
 * The streak calendar's logic: which days a month shows, and what colour each day is.
 * Shared by the own-profile panel (RestDaysStreakPanel) and other people's (StreakGridPanel).
 */

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Monday-first, matching the grid's columns. */
export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export type MonthBlock = {
  label: string;
  year: number;
  /** 0-6: empty cells before the 1st, Monday-first. */
  leadingBlanks: number;
  /** YYYY-MM-DD for each day, up to today in the current month. */
  days: string[];
};

export type CellKind = 'posted' | 'today' | 'missed' | 'rest';

/** YYYY-MM-DD for a Date, in local time. */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 12 months, from 11 months ago through the current month (which stops at today). */
export function buildMonthGrid(todayStr: string): MonthBlock[] {
  const today = new Date(todayStr + 'T00:00:00');
  const months: MonthBlock[] = [];

  for (let offset = 11; offset >= 0; offset--) {
    const first = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    // Sun=0 → 6, Mon=1 → 0, Tue=2 → 1, ...
    const leadingBlanks = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const lastDay = offset === 0 ? today.getDate() : daysInMonth;

    const days: string[] = [];
    for (let d = 1; d <= lastDay; d++) {
      days.push(toDateStr(new Date(first.getFullYear(), first.getMonth(), d)));
    }

    months.push({ label: MONTH_NAMES[first.getMonth()], year: first.getFullYear(), leadingBlanks, days });
  }

  return months;
}

/**
 * What a day cell shows. `weekdayIndex` is its column, 0 = Monday. With no training days set,
 * every past day without a post counts as missed.
 */
export function cellKind(
  dateStr: string,
  weekdayIndex: number,
  ctx: { todayStr: string; postDates: Set<string>; trainingDays: Set<string> | null }
): CellKind {
  if (ctx.postDates.has(dateStr)) return 'posted';
  if (dateStr === ctx.todayStr) return 'today';
  if (dateStr > ctx.todayStr) return 'rest';
  const isRestDay = ctx.trainingDays ? !ctx.trainingDays.has(WEEKDAY_NAMES[weekdayIndex]) : false;
  return isRestDay ? 'rest' : 'missed';
}

/** A live streak: a positive count and a last upload today or yesterday. */
export function isOnStreak(current: number, lastUploadDate: string | null, todayStr: string): boolean {
  if (!lastUploadDate || current <= 0) return false;
  const yesterday = new Date(todayStr + 'T00:00:00');
  yesterday.setDate(yesterday.getDate() - 1);
  return lastUploadDate === todayStr || lastUploadDate === toDateStr(yesterday);
}
