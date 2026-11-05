// Anonymous gameplay + Gemini cost tracking for trivia.benlamb.net.
//
// The API appends one JSON line per event to an events file (JSONL). Nothing
// personal is stored: no IP addresses, names, user agents or free text. A
// "device" is a random ID the browser generates and keeps in localStorage, so
// it counts browsers, not people (a shared demo-table laptop is one device).
//
// Event types (all have v, t = ISO time, type, src):
//   quiz_generated  game, device, difficulty, replay, ms, attempts, model
//   quiz_abandoned  game, device, difficulty, ms   (player left while it generated)
//   quiz_failed     game, device, difficulty, reason, ms
//                   reason: upstream_busy, bad_reply, invalid_request or error
//   game_completed  game, device, difficulty, score, total
//   gemini_call     flow, game, model, attempt, ms, ok, status, tokens{input,output,thoughts,cached}, usd, priceFrom
//                   status 'bad_reply': Google answered but the reply was rejected, so
//                   ok is false yet tokens and usd are real (the attempt was billed)
// src is 'web' (the real site), 'script' (no browser Origin, e.g. offline/fetch-set.mjs)
// or 'test' (X-Trivia-Test header). Public player numbers count 'web' only;
// Gemini cost counts everything, because everything is billed.
// Events imported from nginx logs carry backfill: 'loglab' and have no device,
// score or token data.

import fs from 'node:fs';
import path from 'node:path';
import { estimateCost, nextPriceChange, priceFor, PRICING_SOURCE } from './pricing.js';

export const TIME_ZONE = 'America/New_York';
export const SESSION_GAP_MS = 30 * 60 * 1000;
export const DIFFICULTY_ORDER = ['much_easier', 'easier', 'normal', 'harder', 'much_harder'];
const DIFFICULTY_LABELS = {
  much_easier: 'Much Easier',
  easier: 'Easier',
  normal: 'Normal',
  harder: 'Harder',
  much_harder: 'Much Harder',
};
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

// ---------------------------------------------------------------------------
// Request helpers

export function classifySource(req, allowedOrigin) {
  if (req.get('X-Trivia-Test')) return 'test';
  return req.get('Origin') === allowedOrigin ? 'web' : 'script';
}

export function cleanDeviceId(value) {
  return typeof value === 'string' && DEVICE_ID_PATTERN.test(value) ? value : null;
}

export function cleanGameId(value) {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export function tokensFromUsage(usage) {
  if (!usage) return null;
  return {
    input: usage.inputTokens ?? 0,
    output: usage.outputTokens ?? 0,
    thoughts: usage.thoughtsTokens ?? 0,
    cached: usage.cachedContentTokens ?? 0,
  };
}

export function geminiCallFields({ model, tokens, at = new Date() }) {
  const cost = tokens ? estimateCost(model, tokens, at) : null;
  return { tokens, usd: cost?.usd ?? (tokens ? null : 0), priceFrom: cost?.priceFrom ?? null };
}

// ---------------------------------------------------------------------------
// Event store: in-memory list + append-only JSONL file.

export function readEvents(file) {
  if (!file || !fs.existsSync(file)) return [];
  const events = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event && typeof event.type === 'string' && typeof event.t === 'string') events.push(event);
    } catch {
      // A torn final line (crash mid-write) is skipped, not fatal.
    }
  }
  return events;
}

export function createEventStore({ file, model, now = () => new Date(), log = console, cacheMs = 30_000 } = {}) {
  let events = [];
  try {
    events = readEvents(file);
  } catch (err) {
    // An unreadable history must not stop the API from serving games.
    log.warn(`[trivia-api] analytics history unreadable (${file}): ${err.message}`);
  }
  const games = new Map();
  for (const event of events) {
    if (event.type === 'quiz_generated' && event.game) games.set(event.game, event);
  }

  let writable = Boolean(file);
  if (file) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
    } catch (err) {
      writable = false;
      log.warn(`[trivia-api] analytics disabled, cannot create ${path.dirname(file)}: ${err.message}`);
    }
  }
  let warnedWrite = false;
  let cached = null;
  let cachedAt = 0;

  function record(type, fields = {}) {
    const event = { v: 1, t: now().toISOString(), type, ...fields };
    events.push(event);
    if (type === 'quiz_generated' && event.game) games.set(event.game, event);
    cached = null;
    if (writable) {
      try {
        fs.appendFileSync(file, `${JSON.stringify(event)}\n`);
      } catch (err) {
        // Tracking must never break a game.
        if (!warnedWrite) log.warn(`[trivia-api] analytics write failed (${file}): ${err.message}`);
        warnedWrite = true;
      }
    }
    return event;
  }

  function stats() {
    const at = now();
    if (!cached || at - cachedAt > cacheMs) {
      cached = summarize(events, { now: at, model });
      cachedAt = at.getTime();
    }
    return cached;
  }

  return {
    record,
    stats,
    events: () => events,
    game: (id) => (id ? games.get(id) : undefined),
    file,
    loaded: events.length,
  };
}

// ---------------------------------------------------------------------------
// Aggregation

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function localDate(t) {
  return dayFormatter.format(new Date(t)); // YYYY-MM-DD
}

export function localMonth(t) {
  return localDate(t).slice(0, 7);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function round(value, digits = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function emptyTokens() {
  return { input: 0, output: 0, thoughts: 0, cached: 0 };
}

function addTokens(target, tokens) {
  if (!tokens) return;
  target.input += tokens.input ?? 0;
  target.output += tokens.output ?? 0;
  target.thoughts += tokens.thoughts ?? 0;
  target.cached += tokens.cached ?? 0;
}

const SCORE_BUCKETS = [
  { label: '0–19%', min: 0, max: 0.2 },
  { label: '20–39%', min: 0.2, max: 0.4 },
  { label: '40–59%', min: 0.4, max: 0.6 },
  { label: '60–79%', min: 0.6, max: 0.8 },
  { label: '80–99%', min: 0.8, max: 1 },
  { label: '100%', min: 1, max: Infinity },
];

function newPeriod(key) {
  return {
    key,
    quizzes: 0,
    completed: 0,
    abandoned: 0,
    failed: 0,
    devices: new Set(),
    geminiCalls: 0,
    tokens: emptyTokens(),
    costWebUsd: 0,
    costOtherUsd: 0,
    costTracked: false,
  };
}

function finishPeriod(period, keyName) {
  return {
    [keyName]: period.key,
    quizzes: period.quizzes,
    completed: period.completed,
    abandoned: period.abandoned,
    failed: period.failed,
    devices: period.devices.size,
    geminiCalls: period.geminiCalls,
    inputTokens: period.tokens.input,
    outputTokens: period.tokens.output,
    thinkingTokens: period.tokens.thoughts,
    cachedTokens: period.tokens.cached,
    costWebUsd: round(period.costWebUsd, 6),
    costOtherUsd: round(period.costOtherUsd, 6),
    costUsd: round(period.costWebUsd + period.costOtherUsd, 6),
    costTracked: period.costTracked,
  };
}

export function summarize(events, { now = new Date(), model } = {}) {
  const sorted = [...events].sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  // Without an explicit model (e.g. the monthly report), price notes use the
  // model of the most recent Gemini call.
  model ??= sorted.findLast((event) => event.type === 'gemini_call' && event.model)?.model;
  const daily = new Map();
  const monthly = new Map();
  const periodsFor = (t) => {
    const date = localDate(t);
    const month = date.slice(0, 7);
    if (!daily.has(date)) daily.set(date, newPeriod(date));
    if (!monthly.has(month)) monthly.set(month, newPeriod(month));
    return [daily.get(date), monthly.get(month)];
  };

  const players = { quizzes: 0, completed: 0, abandoned: 0, failed: 0 };
  const devices = new Set();
  const completedGames = new Set();
  const latencies = [];
  const scorePcts = [];
  const difficulty = new Map(DIFFICULTY_ORDER.map((d) => [d, { quizzes: 0, completed: 0, pcts: [] }]));
  const deviceQuizzes = new Map();
  const gemini = {
    calls: 0,
    failedCalls: 0,
    retries: 0,
    tokens: emptyTokens(),
    costUsd: 0,
    costBySource: { web: 0, script: 0, test: 0 },
    costByFlow: { questions: 0, results: 0 },
  };
  const live = { webQuizzes: 0, webCompleted: 0, webCostUsd: 0 };
  let firstEventAt = null;
  let trackingStartedAt = null;
  const backfill = { from: null, to: null, quizzes: 0, completed: 0 };

  for (const event of sorted) {
    firstEventAt ??= event.t;
    if (!event.backfill) trackingStartedAt ??= event.t;
    else {
      backfill.from ??= event.t;
      backfill.to = event.t;
    }
    const [day, month] = periodsFor(event.t);
    const web = event.src === 'web';
    if (!event.backfill) {
      day.costTracked = true;
      month.costTracked = true;
    }

    switch (event.type) {
      case 'quiz_generated': {
        if (!web) break;
        players.quizzes++;
        day.quizzes++;
        month.quizzes++;
        if (event.backfill) backfill.quizzes++;
        else live.webQuizzes++;
        if (typeof event.ms === 'number') latencies.push(event.ms);
        if (difficulty.has(event.difficulty)) difficulty.get(event.difficulty).quizzes++;
        if (event.device) {
          devices.add(event.device);
          day.devices.add(event.device);
          month.devices.add(event.device);
          if (!deviceQuizzes.has(event.device)) deviceQuizzes.set(event.device, []);
          deviceQuizzes.get(event.device).push(event);
        }
        break;
      }
      case 'quiz_abandoned':
        if (!web) break;
        players.abandoned++;
        day.abandoned++;
        month.abandoned++;
        break;
      case 'quiz_failed':
        if (!web) break;
        players.failed++;
        day.failed++;
        month.failed++;
        break;
      case 'game_completed': {
        if (!web) break;
        if (event.game) {
          if (completedGames.has(event.game)) break;
          completedGames.add(event.game);
        }
        players.completed++;
        day.completed++;
        month.completed++;
        if (event.backfill) backfill.completed++;
        else live.webCompleted++;
        if (Number.isFinite(event.score) && Number.isFinite(event.total) && event.total > 0) {
          const pct = event.score / event.total;
          scorePcts.push(pct);
          if (difficulty.has(event.difficulty)) difficulty.get(event.difficulty).pcts.push(pct);
        }
        if (difficulty.has(event.difficulty)) difficulty.get(event.difficulty).completed++;
        break;
      }
      case 'gemini_call': {
        gemini.calls++;
        day.geminiCalls++;
        month.geminiCalls++;
        if (!event.ok) gemini.failedCalls++;
        if ((event.attempt ?? 1) > 1) gemini.retries++;
        addTokens(gemini.tokens, event.tokens);
        addTokens(day.tokens, event.tokens);
        addTokens(month.tokens, event.tokens);
        const usd = Number(event.usd) || 0;
        gemini.costUsd += usd;
        const src = event.src in gemini.costBySource ? event.src : 'script';
        gemini.costBySource[src] += usd;
        if (event.flow in gemini.costByFlow) gemini.costByFlow[event.flow] += usd;
        if (web) {
          day.costWebUsd += usd;
          month.costWebUsd += usd;
          live.webCostUsd += usd;
        } else {
          day.costOtherUsd += usd;
          month.costOtherUsd += usd;
        }
        break;
      }
      default:
        break;
    }
  }

  // Sessions: a device's quizzes with no gap longer than SESSION_GAP_MS.
  // Quizzes without a device ID (imported history) cannot be put in a session.
  let sessions = 0;
  let replaySessions = 0;
  let quizzesWithDevice = 0;
  const moves = { easier: 0, same: 0, harder: 0 };
  for (const quizzes of deviceQuizzes.values()) {
    quizzesWithDevice += quizzes.length;
    let previous = null;
    let sessionGames = 0;
    const closeSession = () => {
      if (sessionGames > 0) {
        sessions++;
        if (sessionGames > 1) replaySessions++;
      }
    };
    for (const quiz of quizzes) {
      const gap = previous ? new Date(quiz.t) - new Date(previous.t) : Infinity;
      if (gap > SESSION_GAP_MS) {
        closeSession();
        sessionGames = 0;
      } else {
        const from = DIFFICULTY_ORDER.indexOf(previous.difficulty);
        const to = DIFFICULTY_ORDER.indexOf(quiz.difficulty);
        if (from >= 0 && to >= 0) moves[to < from ? 'easier' : to > from ? 'harder' : 'same']++;
      }
      sessionGames++;
      previous = quiz;
    }
    closeSession();
  }

  latencies.sort((a, b) => a - b);
  const price = model ? priceFor(model, now) : null;
  const next = model ? nextPriceChange(model, now) : null;

  return {
    generatedAt: now.toISOString(),
    timeZone: TIME_ZONE,
    firstEventAt,
    trackingStartedAt,
    backfill: backfill.from
      ? {
          source: 'nginx access logs (OpenSearch log lab), imported 2026-11-03',
          from: backfill.from,
          to: backfill.to,
          quizzes: backfill.quizzes,
          completed: backfill.completed,
          note: 'Counts only: no scores, devices, difficulty or token data before tracking began.',
        }
      : null,
    players: {
      quizzes: players.quizzes,
      completed: players.completed,
      completionRate: round(ratio(players.completed, players.quizzes)),
      abandoned: players.abandoned,
      failed: players.failed,
      devices: devices.size,
      sessions,
      replaySessions,
      replayRate: round(ratio(replaySessions, sessions)),
      avgGamesPerSession: round(ratio(quizzesWithDevice, sessions), 2),
      scoredGames: scorePcts.length,
      avgScorePct: round(ratio(scorePcts.reduce((sum, p) => sum + p, 0), scorePcts.length)),
    },
    generation: {
      samples: latencies.length,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
    },
    gemini: {
      calls: gemini.calls,
      failedCalls: gemini.failedCalls,
      retries: gemini.retries,
      inputTokens: gemini.tokens.input,
      outputTokens: gemini.tokens.output,
      thinkingTokens: gemini.tokens.thoughts,
      cachedTokens: gemini.tokens.cached,
      costUsd: round(gemini.costUsd, 6),
      costBySource: Object.fromEntries(
        Object.entries(gemini.costBySource).map(([k, v]) => [k, round(v, 6)]),
      ),
      costByFlow: Object.fromEntries(Object.entries(gemini.costByFlow).map(([k, v]) => [k, round(v, 6)])),
      costPerQuizUsd: round(ratio(live.webCostUsd, live.webQuizzes), 6),
      costPerCompletedGameUsd: round(ratio(live.webCostUsd, live.webCompleted), 6),
    },
    difficulty: DIFFICULTY_ORDER.map((d) => {
      const entry = difficulty.get(d);
      return {
        difficulty: d,
        label: DIFFICULTY_LABELS[d],
        quizzes: entry.quizzes,
        completed: entry.completed,
        avgScorePct: round(ratio(entry.pcts.reduce((sum, p) => sum + p, 0), entry.pcts.length)),
      };
    }),
    moves,
    scoreBuckets: SCORE_BUCKETS.map((bucket) => ({
      label: bucket.label,
      count: scorePcts.filter((p) => p >= bucket.min && p < bucket.max).length,
    })),
    daily: [...daily.values()].map((p) => finishPeriod(p, 'date')),
    monthly: [...monthly.values()].map((p) => finishPeriod(p, 'month')),
    pricing: price
      ? {
          model: String(model).replace(/^googleai\//, ''),
          inputPerMillion: price.input,
          outputPerMillion: price.output,
          since: price.from,
          next: next ? { from: next.from, inputPerMillion: next.input, outputPerMillion: next.output } : null,
          source: PRICING_SOURCE,
        }
      : null,
  };
}

export function eventsInMonth(events, month) {
  return events.filter((event) => localMonth(event.t) === month);
}

// ---------------------------------------------------------------------------
// Exports for receipts / reimbursement

const CSV_COLUMNS = [
  ['date', 'date'],
  ['quizzes_played', 'quizzes'],
  ['games_completed', 'completed'],
  ['left_while_loading', 'abandoned'],
  ['failed', 'failed'],
  ['gemini_calls', 'geminiCalls'],
  ['input_tokens', 'inputTokens'],
  ['output_tokens', 'outputTokens'],
  ['thinking_tokens', 'thinkingTokens'],
  ['est_cost_players_usd', 'costWebUsd'],
  ['est_cost_testing_usd', 'costOtherUsd'],
  ['est_cost_total_usd', 'costUsd'],
  ['cost_tracked', 'costTracked'],
];

export function dailyCsv(stats) {
  const lines = [CSV_COLUMNS.map(([header]) => header).join(',')];
  for (const row of stats.daily) {
    lines.push(
      CSV_COLUMNS.map(([, key]) => {
        const value = row[key];
        if (key === 'costTracked') return value ? 'yes' : 'no';
        if (key.startsWith('cost')) return (value ?? 0).toFixed(4);
        return value ?? '';
      }).join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

function usd(value, digits = 2) {
  return `$${(value ?? 0).toFixed(digits)}`;
}

function pct(value) {
  return value === null || value === undefined ? 'n/a' : `${Math.round(value * 100)}%`;
}

export function monthlyReportText(monthStats, allStats, month, { siteUrl = 'https://trivia.benlamb.net' } = {}) {
  const p = monthStats.players;
  const g = monthStats.gemini;
  const label = new Date(`${month}-15T12:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const lines = [
    `IT Trivia Challenge: ${label} report`,
    `${siteUrl}  ·  live stats: ${siteUrl}/stats`,
    '',
    'PLAYERS (real site traffic only; tests and scripts excluded)',
    `  Quizzes played (each one freshly generated by Gemini): ${p.quizzes}`,
    `  Games completed: ${p.completed} (${pct(p.completionRate)} of quizzes)`,
    `  Left while the quiz was generating: ${p.abandoned}`,
    `  Failed to generate: ${p.failed}`,
    `  Devices: ${p.devices}   Play sessions: ${p.sessions}   Sessions with a replay: ${p.replaySessions} (${pct(p.replayRate)})`,
    `  Average score: ${pct(p.avgScorePct)} over ${p.scoredGames} scored games`,
    '',
    'GEMINI API COST (estimated from token counts at Google list price)',
    `  Calls: ${g.calls} (${g.failedCalls} failed, ${g.retries} retries)`,
    `  Tokens: ${g.inputTokens.toLocaleString('en-US')} input, ${g.outputTokens.toLocaleString('en-US')} output, ${g.thinkingTokens.toLocaleString('en-US')} thinking`,
    `  Estimated cost: ${usd(g.costUsd, 4)} total`,
    `    for players: ${usd(g.costBySource.web, 4)}   testing/scripts: ${usd(g.costBySource.script + g.costBySource.test, 4)}`,
    `  Per quiz played: ${g.costPerQuizUsd === null ? 'n/a' : usd(g.costPerQuizUsd, 4)}   Per completed game: ${g.costPerCompletedGameUsd === null ? 'n/a' : usd(g.costPerCompletedGameUsd, 4)}`,
  ];
  if (monthStats.pricing) {
    const pr = monthStats.pricing;
    lines.push(
      `  Price used: ${pr.model} $${pr.inputPerMillion}/1M input, $${pr.outputPerMillion}/1M output incl. thinking (since ${pr.since})`,
    );
    if (pr.next) {
      lines.push(
        `  Scheduled change: ${usd(pr.next.inputPerMillion)}/1M input, ${usd(pr.next.outputPerMillion)}/1M output from ${pr.next.from}`,
      );
    }
  }
  if (monthStats.daily.some((d) => !d.costTracked)) {
    const started = allStats.trackingStartedAt ? localDate(allStats.trackingStartedAt) : 'n/a';
    lines.push(`  Note: days before cost tracking began (${started}) come from web server logs and show no cost.`);
  }
  lines.push(
    '  For reimbursement, pair this with the Google invoice (Google Cloud console > Billing);',
    '  the invoice is the receipt, this report attributes it to games played.',
    '',
    'ALL TIME',
    `  Quizzes played: ${allStats.players.quizzes}   Completed: ${allStats.players.completed}   Estimated Gemini cost: ${usd(allStats.gemini.costUsd, 2)}`,
    `  Counting since ${allStats.firstEventAt ? localDate(allStats.firstEventAt) : 'n/a'} (cost tracking since ${allStats.trackingStartedAt ? localDate(allStats.trackingStartedAt) : 'n/a'})`,
    '',
    'Attached: daily CSV for the month, and the raw anonymous event log for the month (backup copy).',
  );
  return `${lines.join('\n')}\n`;
}
