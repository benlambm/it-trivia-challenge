import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StatsPage from './StatsPage';
import type { PublicStats, StatsPeriod } from '../types';

function period(extra: Partial<StatsPeriod>): StatsPeriod {
  return {
    quizzes: 0,
    completed: 0,
    abandoned: 0,
    failed: 0,
    devices: 0,
    geminiCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cachedTokens: 0,
    costWebUsd: 0,
    costOtherUsd: 0,
    costUsd: 0,
    costTracked: true,
    ...extra,
  };
}

export const fixtureStats: PublicStats = {
  generatedAt: '2026-11-10T15:00:00.000Z',
  timeZone: 'America/New_York',
  firstEventAt: '2026-10-03T20:42:09.000Z',
  trackingStartedAt: '2026-11-03T21:00:00.000Z',
  backfill: {
    source: 'nginx access logs',
    from: '2026-10-03T20:42:09.000Z',
    to: '2026-11-03T20:05:08.000Z',
    quizzes: 38,
    completed: 14,
    note: 'Counts only',
  },
  players: {
    quizzes: 1234,
    completed: 987,
    completionRate: 0.8,
    abandoned: 3,
    failed: 1,
    devices: 42,
    sessions: 60,
    replaySessions: 30,
    replayRate: 0.5,
    avgGamesPerSession: 2.1,
    scoredGames: 900,
    avgScorePct: 0.72,
  },
  generation: { samples: 1000, p50Ms: 21_400, p95Ms: 38_000 },
  gemini: {
    calls: 2300,
    failedCalls: 12,
    retries: 10,
    inputTokens: 600_000,
    outputTokens: 2_800_000,
    thinkingTokens: 3_500_000,
    cachedTokens: 0,
    costUsd: 24.56,
    costBySource: { web: 23.1, script: 1.2, test: 0.26 },
    costByFlow: { questions: 20, results: 4.56 },
    costPerQuizUsd: 0.0141,
    costPerCompletedGameUsd: 0.0234,
  },
  difficulty: [
    { difficulty: 'much_easier', label: 'Much Easier', quizzes: 50, completed: 40, avgScorePct: 0.9 },
    { difficulty: 'easier', label: 'Easier', quizzes: 700, completed: 600, avgScorePct: 0.78 },
    { difficulty: 'normal', label: 'Normal', quizzes: 300, completed: 250, avgScorePct: 0.66 },
    { difficulty: 'harder', label: 'Harder', quizzes: 100, completed: 80, avgScorePct: 0.55 },
    { difficulty: 'much_harder', label: 'Much Harder', quizzes: 0, completed: 0, avgScorePct: null },
  ],
  moves: { easier: 5, same: 20, harder: 15 },
  scoreBuckets: [
    { label: '0–19%', count: 10 },
    { label: '20–39%', count: 40 },
    { label: '40–59%', count: 150 },
    { label: '60–79%', count: 350 },
    { label: '80–99%', count: 300 },
    { label: '100%', count: 50 },
  ],
  daily: [
    { date: '2026-10-03', ...period({ quizzes: 2, completed: 0, costTracked: false }) },
    { date: '2026-11-04', ...period({ quizzes: 30, completed: 25, geminiCalls: 55, costWebUsd: 0.7, costUsd: 0.7 }) },
  ],
  monthly: [
    { month: '2026-10', ...period({ quizzes: 38, completed: 14, costTracked: false }) },
    {
      month: '2026-11',
      ...period({
        quizzes: 1196,
        completed: 973,
        geminiCalls: 2300,
        inputTokens: 600_000,
        outputTokens: 2_800_000,
        thinkingTokens: 3_500_000,
        costWebUsd: 23.1,
        costOtherUsd: 1.46,
        costUsd: 24.56,
      }),
    },
  ],
  pricing: {
    model: 'gemini-3.8-flash',
    inputPerMillion: 0.75,
    outputPerMillion: 3.75,
    since: '2026-01-01',
    next: { from: '2027-01-01', inputPerMillion: 1.5, outputPerMillion: 7.5 },
    source: 'https://aistudio.google.com/docs/pricing',
  },
};

function stubStats(stats: PublicStats | null) {
  vi.stubGlobal(
    'fetch',
    stats
      ? vi.fn().mockResolvedValue({ ok: true, json: async () => stats })
      : vi.fn().mockResolvedValue({ ok: false, status: 503 }),
  );
}

describe('StatsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('leads with quizzes played and the headline tiles', async () => {
    stubStats(fixtureStats);
    render(<StatsPage />);
    expect(await screen.findByTestId('hero-quizzes')).toHaveTextContent('1,234');
    expect(screen.getByText('Games completed').parentElement).toHaveTextContent('98780% of quizzes');
    expect(screen.getByText('Cost per quiz').parentElement).toHaveTextContent('1.4¢');
    expect(screen.getByText(/Counting since Oct 3, 2026/)).toBeInTheDocument();
  });

  it('shows monthly cost with untracked months marked, and the January price rise', async () => {
    stubStats(fixtureStats);
    render(<StatsPage />);
    const table = await screen.findByRole('table', { name: /gemini cost by month/i });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Oct 2026');
    expect(rows[1]).toHaveTextContent('not tracked');
    expect(rows[2]).toHaveTextContent('Nov 2026');
    expect(rows[2]).toHaveTextContent('$24.56');
    expect(screen.getByText(/rises to \$1.50 and \$7.50 on Jan 1, 2027/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /download daily csv/i })).toHaveAttribute('href', '/api/stats/daily.csv');
  });

  it('explains the imported history and how devices are counted', async () => {
    stubStats(fixtureStats);
    render(<StatsPage />);
    expect(await screen.findByText(/come from the web server's logs: 38 quizzes and 14/)).toBeInTheDocument();
    expect(screen.getByText(/A classroom laptop shared by many students counts once/)).toBeInTheDocument();
  });

  it('switches a chart to its table view and shows a tooltip on focus', async () => {
    stubStats(fixtureStats);
    render(<StatsPage />);
    await screen.findByTestId('hero-quizzes');

    const dayBar = screen.getByRole('graphics-symbol', { name: /Nov 4, 2026: 30 quizzes/ });
    fireEvent.focus(dayBar);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Nov 4, 2026');
    expect(screen.getByRole('tooltip')).toHaveTextContent('25Completed');

    const [dailyToggle] = screen.getAllByRole('button', { name: /show table/i });
    fireEvent.click(dailyToggle);
    const dailyTable = screen.getByRole('table', { name: /quizzes per day/i });
    expect(within(dailyTable).getByText('Nov 4, 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show chart/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the replay choices as shares', async () => {
    stubStats(fixtureStats);
    render(<StatsPage />);
    expect(await screen.findByLabelText('Harder: 15 (38%)')).toBeInTheDocument();
    expect(screen.getByLabelText('Same level: 20 (50%)')).toBeInTheDocument();
  });

  it('handles a brand-new install with nothing tracked yet', async () => {
    stubStats({
      ...fixtureStats,
      firstEventAt: null,
      trackingStartedAt: null,
      backfill: null,
      players: { ...fixtureStats.players, quizzes: 0, completed: 0, scoredGames: 0, completionRate: null, avgScorePct: null },
      moves: { easier: 0, same: 0, harder: 0 },
      daily: [],
      monthly: [],
      pricing: null,
    });
    render(<StatsPage />);
    expect(await screen.findByText('No games yet.')).toBeInTheDocument();
    expect(screen.getByText(/Scores appear here/)).toBeInTheDocument();
    expect(screen.getByText(/Replays appear here/)).toBeInTheDocument();
  });

  it('says so when the stats are unavailable', async () => {
    stubStats(null);
    render(<StatsPage />);
    expect(await screen.findByText(/stats are unavailable right now/i)).toBeInTheDocument();
  });
});
