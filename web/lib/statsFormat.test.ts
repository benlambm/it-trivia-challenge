import { describe, expect, it } from 'vitest';
import {
  dailyBars,
  formatCents,
  formatDay,
  formatInt,
  formatMonth,
  formatPct,
  formatSeconds,
  formatUsd,
  isoToLocalDate,
  niceTicks,
} from './statsFormat';
import type { PublicStats } from '../types';

describe('formatters', () => {
  it('formats counts, shares, money and time', () => {
    expect(formatInt(1234.4)).toBe('1,234');
    expect(formatInt(null)).toBe('—');
    expect(formatPct(0.725)).toBe('73%');
    expect(formatPct(null)).toBe('—');
    expect(formatUsd(24.5)).toBe('$24.50');
    expect(formatUsd(null)).toBe('—');
    expect(formatCents(0.0141)).toBe('1.4¢');
    expect(formatCents(null)).toBe('—');
    expect(formatSeconds(21_400)).toBe('21 s');
    expect(formatSeconds(null)).toBe('—');
    expect(formatMonth('2026-11')).toBe('Nov 2026');
    expect(formatDay('2026-10-03')).toBe('Oct 3, 2026');
    expect(formatDay('2026-10-03', false)).toBe('Oct 3');
  });

  it('converts timestamps to Eastern calendar dates', () => {
    expect(isoToLocalDate('2026-11-01T02:00:00Z')).toBe('2026-10-31');
  });

  it('builds clean axis ticks', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(22)).toEqual([0, 5, 10, 15, 20, 25]);
  });
});

function statsWithDays(days: Array<{ date: string; quizzes: number; completed: number }>): PublicStats {
  return { daily: days } as unknown as PublicStats;
}

describe('dailyBars', () => {
  it('fills quiet days with zeros up to today', () => {
    const { bars, unit } = dailyBars(
      statsWithDays([
        { date: '2026-10-30', quizzes: 3, completed: 2 },
        { date: '2026-11-01', quizzes: 1, completed: 1 },
      ]),
      '2026-11-03',
    );
    expect(unit).toBe('day');
    expect(bars.map((b) => [b.key, b.quizzes, b.completed, b.notCompleted])).toEqual([
      ['2026-10-30', 3, 2, 1],
      ['2026-10-31', 0, 0, 0],
      ['2026-11-01', 1, 1, 0],
      ['2026-11-02', 0, 0, 0],
      ['2026-11-03', 0, 0, 0],
    ]);
  });

  it('groups into weeks once the range passes about four months', () => {
    const { bars, unit } = dailyBars(statsWithDays([{ date: '2026-01-01', quizzes: 7, completed: 7 }]), '2026-06-30');
    expect(unit).toBe('week');
    expect(bars[0]).toMatchObject({ key: '2026-01-01', label: 'Week of Jan 1, 2026', quizzes: 7 });
    expect(bars.length).toBe(26);
  });

  it('returns nothing when there is no history', () => {
    expect(dailyBars(statsWithDays([]), '2026-11-03')).toEqual({ bars: [], unit: 'day' });
  });
});
