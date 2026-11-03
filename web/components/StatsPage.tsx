import React, { useEffect, useState } from 'react';
import type { PublicStats } from '../types';
import { fetchStats } from '../services/triviaApi';
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
} from '../lib/statsFormat';
import { CHART, ChartCard, ColumnChart, DataTable, SegmentedBar, StatTile } from './StatsCharts';
import Footer from './Footer';

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; stats: PublicStats };

const StatsPage: React.FC = () => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    fetchStats()
      .then((stats) => active && setState({ status: 'ready', stats }))
      .catch(() => active && setState({ status: 'error' }));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="bg-[#173A45] border-b-4 border-[#E87722]">
        <div className="max-w-6xl mx-auto px-6 md:px-12 py-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[#E87722] uppercase tracking-widest text-sm font-black">Live stats</p>
            <h1 className="text-3xl md:text-4xl font-black text-white">IT Trivia Challenge</h1>
          </div>
          <a
            href="/"
            className="inline-flex items-center py-3 px-5 rounded-2xl bg-[#E87722] text-white font-black hover:bg-black transition-colors"
          >
            Play the game →
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 md:px-12 py-10 space-y-8">
        {state.status === 'loading' ? <p className="text-slate-500">Loading live stats…</p> : null}
        {state.status === 'error' ? (
          <p className="text-slate-700">The stats are unavailable right now. Please try again in a minute.</p>
        ) : null}
        {state.status === 'ready' ? <Dashboard stats={state.stats} /> : null}
      </main>

      <Footer />
    </div>
  );
};

const Dashboard: React.FC<{ stats: PublicStats }> = ({ stats }) => {
  const tz = stats.timeZone;
  const today = isoToLocalDate(stats.generatedAt, tz);
  const since = stats.firstEventAt ? formatDay(isoToLocalDate(stats.firstEventAt, tz)) : null;
  const trackingSince = stats.trackingStartedAt ? formatDay(isoToLocalDate(stats.trackingStartedAt, tz)) : null;
  const p = stats.players;
  const g = stats.gemini;
  const { bars, unit } = dailyBars(stats, today);
  const totalMoves = stats.moves.easier + stats.moves.same + stats.moves.harder;
  const maxDifficulty = Math.max(1, ...stats.difficulty.map((d) => d.quizzes));
  const testingCost = g.costBySource.script + g.costBySource.test;

  return (
    <>
      <p className="text-slate-600">
        Anonymous numbers from{' '}
        <a href="/" className="font-semibold text-[#173A45] underline underline-offset-4">
          trivia.benlamb.net
        </a>
        , the Brightpoint IT career trivia game.{since ? ` Counting since ${since}.` : ''} Updated{' '}
        {new Date(stats.generatedAt).toLocaleString('en-US', {
          timeZone: tz,
          dateStyle: 'medium',
          timeStyle: 'short',
        })}{' '}
        Eastern.
      </p>

      <section aria-labelledby="hero-label" className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8">
        <div id="hero-label" className="text-sm font-semibold text-slate-500">
          Quizzes played
        </div>
        <div className="text-6xl md:text-7xl font-black text-slate-900 mt-1" data-testid="hero-quizzes">
          {formatInt(p.quizzes)}
        </div>
        <p className="text-slate-500 mt-2">Each one a fresh set of 25 questions written by Google Gemini.</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          <StatTile label="Games completed" value={formatInt(p.completed)} note={`${formatPct(p.completionRate)} of quizzes`} />
          <StatTile label="Average score" value={formatPct(p.avgScorePct)} note={`${formatInt(p.scoredGames)} scored games`} />
          <StatTile
            label="Devices"
            value={stats.trackingStartedAt ? formatInt(p.devices) : '—'}
            note={trackingSince ? `since ${trackingSince}` : undefined}
          />
          <StatTile
            label="Play sessions"
            value={stats.trackingStartedAt ? formatInt(p.sessions) : '—'}
            note={`${formatPct(p.replayRate)} played again`}
          />
          <StatTile label="Gemini cost so far" value={formatUsd(g.costUsd)} note="estimated, every call" />
          <StatTile label="Cost per quiz" value={formatCents(g.costPerQuizUsd)} note="questions + results" />
        </div>
      </section>

      <ChartCard
        title={unit === 'day' ? 'Quizzes per day' : 'Quizzes per week'}
        subtitle="Completed games and quizzes that were started but not finished"
        legend={[
          { label: 'Completed', color: CHART.blue },
          { label: 'Not finished', color: CHART.context },
        ]}
        table={{
          columns: [unit === 'day' ? 'Date' : 'Week', 'Quizzes', 'Completed'],
          rows: bars.filter((b) => b.quizzes > 0).map((b) => [b.label, b.quizzes, b.completed]),
        }}
      >
        {bars.length > 0 ? (
          <ColumnChart
            valueName="quizzes"
            ariaLabel={`Quizzes per ${unit}, ${bars[0].label} to ${bars[bars.length - 1].label}`}
            columns={bars.map((b) => ({
              key: b.key,
              label: b.label,
              axisLabel: formatDay(b.key, false),
              segments: [
                { label: 'Completed', value: b.completed, color: CHART.blue },
                { label: 'Not finished', value: b.notCompleted, color: CHART.context },
              ],
            }))}
          />
        ) : (
          <p className="text-slate-500">No games yet.</p>
        )}
      </ChartCard>

      <div className="grid md:grid-cols-2 gap-8">
        <ChartCard
          title="Scores"
          subtitle={`Completed games by share of questions right${trackingSince ? `, since ${trackingSince}` : ''}`}
          table={{ columns: ['Score', 'Games'], rows: stats.scoreBuckets.map((b) => [b.label, b.count]) }}
        >
          {p.scoredGames > 0 ? (
            <ColumnChart
              height={180}
              valueName="games"
              ariaLabel="Completed games by score"
              columns={stats.scoreBuckets.map((b) => ({
                key: b.label,
                label: `${b.label} correct`,
                axisLabel: b.label,
                segments: [{ label: 'games', value: b.count, color: CHART.blue }],
              }))}
            />
          ) : (
            <p className="text-slate-500">Scores appear here after the first completed game.</p>
          )}
        </ChartCard>

        <section className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 min-w-0" aria-labelledby="difficulty-title">
          <h2 id="difficulty-title" className="text-xl font-black text-slate-900">
            Difficulty
          </h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">Quizzes played at each level and how players scored</p>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200">
                <th scope="col" className="text-left py-2 font-semibold">Level</th>
                <th scope="col" className="text-left py-2 font-semibold w-2/5">
                  <span className="sr-only">Share of quizzes</span>
                </th>
                <th scope="col" className="text-right py-2 font-semibold">Quizzes</th>
                <th scope="col" className="text-right py-2 font-semibold">Avg score</th>
              </tr>
            </thead>
            <tbody className="[font-variant-numeric:tabular-nums]">
              {stats.difficulty.map((d) => (
                <tr key={d.difficulty} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 text-slate-900 whitespace-nowrap">{d.label}</td>
                  <td className="py-2 pr-3">
                    <div className="h-2 rounded-full" style={{ width: `${(d.quizzes / maxDifficulty) * 100}%`, background: d.quizzes ? CHART.blue : 'transparent' }} />
                  </td>
                  <td className="py-2 text-right text-slate-700">{formatInt(d.quizzes)}</td>
                  <td className="py-2 text-right text-slate-700">{formatPct(d.avgScorePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <ChartCard
          title="After a quiz, players chose…"
          subtitle="The next quiz in the same sitting, compared with the one before"
          table={{
            columns: ['Choice', 'Replays'],
            rows: [
              ['An easier quiz', stats.moves.easier],
              ['The same level', stats.moves.same],
              ['A harder quiz', stats.moves.harder],
            ],
          }}
        >
          {totalMoves > 0 ? (
            <SegmentedBar
              ariaLabel="Difficulty chosen for the next quiz"
              parts={[
                { label: 'Easier', value: stats.moves.easier, color: CHART.blue, ink: '#ffffff' },
                { label: 'Same level', value: stats.moves.same, color: CHART.neutral, ink: '#0b0b0b' },
                { label: 'Harder', value: stats.moves.harder, color: CHART.orange, ink: '#ffffff' },
              ]}
            />
          ) : (
            <p className="text-slate-500">Replays appear here once players start a second quiz.</p>
          )}
        </ChartCard>

        <section className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 min-w-0" aria-labelledby="speed-title">
          <h2 id="speed-title" className="text-xl font-black text-slate-900">
            Speed and reliability
          </h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">Time for Gemini to write a 25-question quiz</p>
          <div className="grid grid-cols-2 gap-4">
            <StatTile label="Typical wait" value={formatSeconds(stats.generation.p50Ms)} note="median" />
            <StatTile label="Slow waits" value={formatSeconds(stats.generation.p95Ms)} note="95th percentile" />
            <StatTile label="Gemini calls" value={formatInt(g.calls)} note={trackingSince ? `since ${trackingSince}` : undefined} />
            <StatTile label="Failed calls" value={formatInt(g.failedCalls)} note={`${formatInt(g.retries)} retried`} />
          </div>
        </section>
      </div>

      <section className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8" aria-labelledby="cost-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="cost-title" className="text-xl font-black text-slate-900">
              Gemini API cost
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Estimated from the tokens Google reports for each call, at Google's list price.
            </p>
          </div>
          <a
            href="/api/stats/daily.csv"
            className="text-sm font-semibold text-[#173A45] border border-slate-300 rounded-full px-4 py-1.5 hover:border-[#173A45]"
          >
            Download daily CSV
          </a>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <StatTile label="Total" value={formatUsd(g.costUsd)} />
          <StatTile label="For players" value={formatUsd(g.costBySource.web)} />
          <StatTile label="Testing and scripts" value={formatUsd(testingCost)} />
          <StatTile label="Per completed game" value={formatCents(g.costPerCompletedGameUsd)} />
        </div>
        <div className="mt-6">
          <DataTable
            caption="Gemini cost by month"
            table={{
              columns: ['Month', 'Quizzes', 'Completed', 'Gemini calls', 'Tokens', 'Players', 'Testing', 'Total'],
              rows: stats.monthly.map((m) => [
                formatMonth(m.month),
                formatInt(m.quizzes),
                formatInt(m.completed),
                m.costTracked ? formatInt(m.geminiCalls) : 'not tracked',
                m.costTracked ? formatInt(m.inputTokens + m.outputTokens + m.thinkingTokens) : 'not tracked',
                m.costTracked ? formatUsd(m.costWebUsd) : 'not tracked',
                m.costTracked ? formatUsd(m.costOtherUsd) : 'not tracked',
                m.costTracked ? formatUsd(m.costUsd) : 'not tracked',
              ]),
            }}
          />
        </div>
        {stats.pricing ? (
          <p className="text-sm text-slate-500 mt-4">
            Priced at {formatUsd(stats.pricing.inputPerMillion)} per million input tokens and{' '}
            {formatUsd(stats.pricing.outputPerMillion)} per million output tokens, thinking included ({stats.pricing.model}).
            {stats.pricing.next
              ? ` Google's price rises to ${formatUsd(stats.pricing.next.inputPerMillion)} and ${formatUsd(stats.pricing.next.outputPerMillion)} on ${formatDay(stats.pricing.next.from)}.`
              : ''}{' '}
            <a href={stats.pricing.source} className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">
              Google's pricing
            </a>
            . Google's invoice is the receipt; these figures attribute it to games played.
          </p>
        ) : null}
      </section>

      <section className="text-sm text-slate-600 space-y-2" aria-labelledby="about-title">
        <h2 id="about-title" className="text-base font-black text-slate-900">
          About these numbers
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Every quiz is generated fresh by Gemini, so quizzes played and quizzes generated are the same number.</li>
          {stats.backfill ? (
            <li>
              {formatDay(isoToLocalDate(stats.backfill.from, tz))} to {formatDay(isoToLocalDate(stats.backfill.to, tz))} come
              from the web server's logs: {formatInt(stats.backfill.quizzes)} quizzes and {formatInt(stats.backfill.completed)}{' '}
              completed games, counts only. Devices, scores, difficulty and cost are tracked from{' '}
              {trackingSince ?? 'the start of detailed tracking'}.
            </li>
          ) : null}
          <li>
            A device is one web browser. A classroom laptop shared by many students counts once, and a private-browsing window
            counts as new each time.
          </li>
          <li>A play session is a run of games on one device with no break longer than 30 minutes.</li>
          <li>Test runs and scripts are left out of player numbers but included in cost, because Google bills them.</li>
          <li>No names, IP addresses or other personal information are collected. Dates are Eastern time.</li>
        </ul>
      </section>
    </>
  );
};

export default StatsPage;
