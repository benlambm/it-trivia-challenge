import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  classifySource,
  cleanDeviceId,
  cleanGameId,
  createEventStore,
  dailyCsv,
  eventsInMonth,
  geminiCallFields,
  localDate,
  monthlyReportText,
  readEvents,
  summarize,
  tokensFromUsage,
} from './analytics.js';

const ORIGIN = 'https://trivia.benlamb.net';
const DEVICE_A = '11111111-1111-4111-8111-111111111111';
const DEVICE_B = '22222222-2222-4222-8222-222222222222';
const GAME = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fakeReq(headers) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name) => lower[name.toLowerCase()] };
}

function tmpFile(name = 'events.jsonl') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trivia-analytics-'));
  return path.join(dir, 'nested', name);
}

const quietLog = { warn: () => {} };

test('classifySource separates the real site, scripts and tests', () => {
  assert.equal(classifySource(fakeReq({ Origin: ORIGIN }), ORIGIN), 'web');
  assert.equal(classifySource(fakeReq({}), ORIGIN), 'script');
  assert.equal(classifySource(fakeReq({ Origin: ORIGIN, 'X-Trivia-Test': '1' }), ORIGIN), 'test');
});

test('device and game IDs are only kept when they look like random IDs', () => {
  assert.equal(cleanDeviceId(DEVICE_A), DEVICE_A);
  assert.equal(cleanDeviceId('short'), null);
  assert.equal(cleanDeviceId('has spaces and an @ sign'), null);
  assert.equal(cleanDeviceId(42), null);
  assert.equal(cleanGameId(GAME(1)), GAME(1));
  assert.equal(cleanGameId('not-a-uuid'), null);
});

test('token usage is mapped from genkit and priced', () => {
  const tokens = tokensFromUsage({ inputTokens: 1000, outputTokens: 2000, thoughtsTokens: 500 });
  assert.deepEqual(tokens, { input: 1000, output: 2000, thoughts: 500, cached: 0 });
  const fields = geminiCallFields({ model: 'googleai/gemini-3.8-flash', tokens, at: new Date('2026-11-03T00:00:00Z') });
  assert.equal(fields.usd, (1000 * 0.75 + 2500 * 3.75) / 1_000_000);
  assert.equal(fields.priceFrom, '2026-01-01');
  assert.deepEqual(geminiCallFields({ model: 'googleai/gemini-3.8-flash', tokens: null }), {
    tokens: null,
    usd: 0,
    priceFrom: null,
  });
});

test('the event store appends JSON lines and reloads them, skipping a torn last line', () => {
  const file = tmpFile();
  const store = createEventStore({ file, log: quietLog });
  store.record('quiz_generated', { game: GAME(1), device: DEVICE_A, src: 'web', difficulty: 'easier' });
  store.record('game_completed', { game: GAME(1), src: 'web', score: 20, total: 25 });
  fs.appendFileSync(file, '{"v":1,"t":"2026-11-0'); // crash mid-write

  const reloaded = createEventStore({ file, log: quietLog });
  assert.equal(reloaded.loaded, 2);
  assert.equal(reloaded.game(GAME(1)).difficulty, 'easier');
  assert.equal(readEvents(file).length, 2);
});

test('a write failure never throws into the game', () => {
  // Parent "directory" is a regular file, so the directory cannot be created.
  const blocker = tmpFile('blocker');
  fs.mkdirSync(path.dirname(blocker), { recursive: true });
  fs.writeFileSync(blocker, '');
  const noDir = createEventStore({ file: path.join(blocker, 'events.jsonl'), log: quietLog });
  assert.doesNotThrow(() => noDir.record('quiz_generated', { src: 'web' }));
  assert.equal(noDir.stats().players.quizzes, 1);

  // The events path is a directory, so the append itself fails.
  const dirPath = tmpFile('a-directory');
  fs.mkdirSync(dirPath, { recursive: true });
  const badFile = createEventStore({ file: dirPath, log: quietLog });
  assert.doesNotThrow(() => badFile.record('quiz_generated', { src: 'web' }));
  assert.equal(badFile.stats().players.quizzes, 1);
});

function at(iso) {
  return iso;
}

function fixture() {
  const call = (t, src, usd, extra = {}) => ({
    v: 1,
    t: at(t),
    type: 'gemini_call',
    flow: 'questions',
    src,
    model: 'googleai/gemini-3.8-flash',
    attempt: 1,
    ok: true,
    tokens: { input: 1000, output: 3000, thoughts: 1000, cached: 0 },
    usd,
    ...extra,
  });
  return [
    // Imported history: counts only.
    { v: 1, t: '2026-10-09T14:00:00Z', type: 'quiz_generated', src: 'web', ms: 20_000, backfill: 'loglab' },
    { v: 1, t: '2026-10-09T14:10:00Z', type: 'game_completed', src: 'web', backfill: 'loglab' },
    { v: 1, t: '2026-10-09T14:12:00Z', type: 'quiz_abandoned', src: 'web', backfill: 'loglab' },
    // Device A: one session of three games (easier -> normal -> normal), two finished.
    call('2026-11-04T15:00:00Z', 'web', 0.02),
    { v: 1, t: '2026-11-04T15:00:20Z', type: 'quiz_generated', game: GAME(1), device: DEVICE_A, src: 'web', difficulty: 'easier', ms: 20_000 },
    { v: 1, t: '2026-11-04T15:08:00Z', type: 'game_completed', game: GAME(1), device: DEVICE_A, src: 'web', difficulty: 'easier', score: 20, total: 25 },
    { v: 1, t: '2026-11-04T15:08:00Z', type: 'game_completed', game: GAME(1), device: DEVICE_A, src: 'web', difficulty: 'easier', score: 20, total: 25 },
    call('2026-11-04T15:08:05Z', 'web', 0.002, { flow: 'results' }),
    call('2026-11-04T15:09:00Z', 'web', 0, { ok: false, tokens: null, status: 503 }),
    call('2026-11-04T15:09:03Z', 'web', 0.02, { attempt: 2 }),
    { v: 1, t: '2026-11-04T15:09:30Z', type: 'quiz_generated', game: GAME(2), device: DEVICE_A, src: 'web', difficulty: 'normal', ms: 30_000 },
    { v: 1, t: '2026-11-04T15:20:00Z', type: 'game_completed', game: GAME(2), device: DEVICE_A, src: 'web', difficulty: 'normal', score: 25, total: 25 },
    { v: 1, t: '2026-11-04T15:21:00Z', type: 'quiz_generated', game: GAME(3), device: DEVICE_A, src: 'web', difficulty: 'normal', ms: 25_000 },
    // Device B: two games more than 30 minutes apart = two sessions.
    { v: 1, t: '2026-11-04T16:00:00Z', type: 'quiz_generated', game: GAME(4), device: DEVICE_B, src: 'web', difficulty: 'easier', ms: 40_000 },
    { v: 1, t: '2026-11-04T17:00:00Z', type: 'quiz_generated', game: GAME(5), device: DEVICE_B, src: 'web', difficulty: 'easier', ms: 10_000 },
    { v: 1, t: '2026-11-04T17:01:00Z', type: 'quiz_failed', game: GAME(6), device: DEVICE_B, src: 'web', reason: 'upstream_busy' },
    // Scripts and tests: billed, but not players.
    call('2026-11-05T12:00:00Z', 'script', 0.03),
    { v: 1, t: '2026-11-05T12:00:30Z', type: 'quiz_generated', game: GAME(7), src: 'script', difficulty: 'easier', ms: 30_000 },
    call('2026-11-05T12:05:00Z', 'test', 0.01),
    { v: 1, t: '2026-11-05T12:05:30Z', type: 'game_completed', game: GAME(8), src: 'test', score: 3, total: 25 },
  ];
}

test('summarize counts players from the real site only, including imported history', () => {
  const stats = summarize(fixture(), { now: new Date('2026-11-06T00:00:00Z'), model: 'googleai/gemini-3.8-flash' });
  const p = stats.players;
  assert.equal(p.quizzes, 6); // 1 imported + 5 live web
  assert.equal(p.completed, 3); // 1 imported + 2 live (the duplicate GAME(1) completion is counted once)
  assert.equal(p.abandoned, 1);
  assert.equal(p.failed, 1);
  assert.equal(p.completionRate, 0.5);
  assert.equal(p.devices, 2);
  assert.equal(p.sessions, 3);
  assert.equal(p.replaySessions, 1);
  assert.equal(p.avgGamesPerSession, 1.67);
  assert.equal(p.scoredGames, 2);
  assert.equal(p.avgScorePct, 0.9);
  assert.deepEqual(stats.moves, { easier: 0, same: 1, harder: 1 });
  assert.deepEqual(stats.backfill.quizzes, 1);
  assert.equal(stats.trackingStartedAt, '2026-11-04T15:00:00Z');
  assert.equal(stats.firstEventAt, '2026-10-09T14:00:00Z');
});

test('summarize totals Gemini cost by who caused it', () => {
  const stats = summarize(fixture(), { now: new Date('2026-11-06T00:00:00Z'), model: 'googleai/gemini-3.8-flash' });
  const g = stats.gemini;
  assert.equal(g.calls, 6);
  assert.equal(g.failedCalls, 1);
  assert.equal(g.retries, 1);
  assert.equal(g.costUsd, 0.082);
  assert.deepEqual(g.costBySource, { web: 0.042, script: 0.03, test: 0.01 });
  assert.equal(g.costByFlow.results, 0.002);
  assert.equal(g.costPerQuizUsd, 0.0084); // 0.042 over 5 live web quizzes
  assert.equal(g.costPerCompletedGameUsd, 0.021); // 0.042 over 2 live completions
  assert.equal(g.thinkingTokens, 5000);
  assert.equal(stats.pricing.next.from, '2027-01-01');
});

test('summarize reports score buckets, difficulty and generation time', () => {
  const stats = summarize(fixture(), { now: new Date('2026-11-06T00:00:00Z') });
  assert.deepEqual(
    stats.scoreBuckets.map((b) => b.count),
    [0, 0, 0, 0, 1, 1],
  );
  const easier = stats.difficulty.find((d) => d.difficulty === 'easier');
  assert.equal(easier.quizzes, 3);
  assert.equal(easier.completed, 1);
  assert.equal(easier.avgScorePct, 0.8);
  assert.equal(stats.generation.samples, 6);
  assert.equal(stats.generation.p50Ms, 20_000);
  assert.equal(stats.generation.p95Ms, 40_000);
  // Model falls back to the latest Gemini call when not given.
  assert.equal(stats.pricing.model, 'gemini-3.8-flash');
});

test('days and months follow Brightpoint local time (America/New_York)', () => {
  assert.equal(localDate('2026-11-01T02:00:00Z'), '2026-10-31');
  const late = [{ v: 1, t: '2026-11-01T02:00:00Z', type: 'quiz_generated', src: 'web' }];
  assert.equal(eventsInMonth(late, '2026-10').length, 1);
  assert.equal(eventsInMonth(late, '2026-11').length, 0);
});

test('daily CSV marks days before cost tracking and totals each day', () => {
  const csv = dailyCsv(summarize(fixture(), { now: new Date('2026-11-06T00:00:00Z') }));
  const [header, ...rows] = csv.trim().split('\n');
  assert.match(header, /^date,quizzes_played,games_completed,/);
  assert.equal(rows.length, 3);
  assert.match(rows[0], /^2026-10-09,1,1,1,0,0,0,0,0,0\.0000,0\.0000,0\.0000,no$/);
  assert.match(rows[1], /^2026-11-04,5,2,0,1,4,/);
  assert.match(rows[1], /,0\.0420,0\.0000,0\.0420,yes$/);
  assert.match(rows[2], /^2026-11-05,0,0,0,0,2,.*,0\.0000,0\.0400,0\.0400,yes$/);
});

test('the monthly report flags days that predate cost tracking', () => {
  const all = fixture();
  const october = eventsInMonth(all, '2026-10');
  const text = monthlyReportText(summarize(october), summarize(all), '2026-10');
  assert.match(text, /October 2026 report/);
  assert.match(text, /Note: days before cost tracking began \(2026-11-04\) come from web server logs/);
});

test('the monthly report text has the numbers a reimbursement request needs', () => {
  const all = fixture();
  const month = eventsInMonth(all, '2026-11');
  const text = monthlyReportText(
    summarize(month, { now: new Date('2026-12-01T13:00:00Z') }),
    summarize(all, { now: new Date('2026-12-01T13:00:00Z') }),
    '2026-11',
  );
  assert.match(text, /November 2026 report/);
  assert.match(text, /Quizzes played \(each one freshly generated by Gemini\): 5/);
  assert.match(text, /Estimated cost: \$0\.0820 total/);
  assert.match(text, /for players: \$0\.0420 {3}testing\/scripts: \$0\.0400/);
  assert.match(text, /Per quiz played: \$0\.0084/);
  assert.match(text, /Scheduled change: \$1\.50\/1M input, \$7\.50\/1M output from 2027-01-01/);
  assert.doesNotMatch(text, /days before cost tracking/);
  assert.match(text, /Counting since 2026-10-09 \(cost tracking since 2026-11-04\)/);
});
