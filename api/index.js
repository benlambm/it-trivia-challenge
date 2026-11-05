import 'dotenv/config';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { genkit, z } from 'genkit';
// @genkit-ai/googleai is deprecated upstream; google-genai is its successor. It reads the
// same GOOGLE_GENAI_API_KEY (also GEMINI_API_KEY / GOOGLE_API_KEY) and keeps the 'googleai/' model prefix.
import { googleAI } from '@genkit-ai/google-genai';
import { buildQuestionsPrompt, QuestionsInputSchema, QuestionsOutputSchema } from './triviaQuestions.js';
import {
  classifySource,
  cleanDeviceId,
  cleanGameId,
  createEventStore,
  DIFFICULTY_ORDER,
  dailyCsv,
  geminiCallFields,
  tokensFromUsage,
} from './analytics.js';

// Model is env-overridable (TRIVIA_MODEL in .env) so it can be changed with a
// restart instead of a code edit + redeploy.
//
// gemini-3.8-flash is the preferred model. Google deprecated gemini-3.7-flash on
// 2026-10-09 and silently redirects it to 3.8-flash (the response's modelVersion
// says gemini-3.8-flash), so production had effectively been on 3.8-flash since
// then with no errors; pinned explicitly on 2026-11-03. gemini-3.6-flash remains
// the known-good fallback. gemini-flash-latest is a floating alias that has
// resolved to a congested model, and gemini-2.5-flash is retired (404). If
// "transient upstream error" shows up in the journal, set
// TRIVIA_MODEL=googleai/gemini-3.6-flash in .env and restart trivia-api.
const DEFAULT_MODEL = 'googleai/gemini-3.8-flash';
const MODEL = process.env.TRIVIA_MODEL || DEFAULT_MODEL;

const ALLOWED_ORIGIN = 'https://trivia.benlamb.net';
const PORT = Number(process.env.TRIVIA_PORT || 3000);
const HOST = '127.0.0.1';
const JSON_BODY_LIMIT = '2mb';

// nginx fronts this service with `proxy_read_timeout 180s`, so the whole
// request -- including retries -- has to finish inside that window or the user
// gets a 504 instead of our error. A successful 25-question generation runs
// ~11-49s and Google can hold a failing call for ~70s before shedding it, so
// the budget for *starting* attempts stays ~60s below the nginx timeout, and we
// only start another attempt if there's plausibly time for it. Keep this in
// step with the nginx site config if either side changes.
const RETRY_BUDGET_MS = Number(process.env.TRIVIA_RETRY_BUDGET_MS || 120_000);
const MIN_ATTEMPT_MS = Number(process.env.TRIVIA_MIN_ATTEMPT_MS || 18_000);
const MAX_BACKOFF_MS = 2_000;
// A reply that fails the schema check was still billed, so unlike a 503 it gets
// one more try and no more, however much of the budget is left.
const MAX_BAD_REPLY_RETRIES = 1;

const ai = genkit({ plugins: [googleAI()] });

// Anonymous usage + cost tracking (see analytics.js). systemd's
// StateDirectory=trivia-api sets STATE_DIRECTORY=/var/lib/trivia-api, which is
// outside the repo checkout that every deploy hard-resets. Local runs fall back
// to api/data/ (gitignored); TRIVIA_EVENTS_FILE overrides both.
const EVENTS_FILE =
  process.env.TRIVIA_EVENTS_FILE ||
  (process.env.STATE_DIRECTORY
    ? path.join(process.env.STATE_DIRECTORY.split(':')[0], 'events.jsonl')
    : fileURLToPath(new URL('./data/events.jsonl', import.meta.url)));
const events = createEventStore({ file: EVENTS_FILE, model: MODEL });

// Carries { game, src } from the HTTP handler down to each Gemini attempt.
const requestContext = new AsyncLocalStorage();

const ResultsOutputSchema = z.object({
  title: z.string(),
  evaluation: z.string(),
  motivation: z.string(),
});

// Every Gemini failure leaves generateWithRetry as one of these. None of them
// carries a Genkit status, so the error handler can't mistake a problem on
// Google's side for a bad request from the browser.
class UpstreamError extends Error {
  constructor(message, { attempts, elapsedMs, cause }) {
    super(message);
    this.name = new.target.name;
    this.attempts = attempts;
    this.elapsedMs = elapsedMs;
    this.cause = cause;
  }
}

// Google is shedding load and retries ran out.
class UpstreamBusyError extends UpstreamError {}

// Google answered, but the reply failed the schema check or was blocked.
class BadModelReplyError extends UpstreamError {}

// Google refused the call itself, e.g. a bad API key or a retired model.
class UpstreamRejectedError extends UpstreamError {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Google sheds load with 503 (and occasionally 429/500/502/504) when a model is
// saturated. Those are worth retrying. A call Google refuses outright (400, 404)
// is not; it would fail identically every time. Bad replies are a third case,
// handled in generateWithRetry: the model is random, so a second try may well work.
function isTransientUpstream(err) {
  const status = Number(err?.status ?? err?.cause?.status ?? err?.response?.status);
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(err?.message ?? '');
  return (
    /\[(429|500|502|503|504)\s/.test(message) ||
    /Service Unavailable|high demand|overloaded|Too Many Requests|try again later/i.test(message)
  );
}

// A schema error's message embeds the whole reply and schema; keep logs short.
const brief = (err) => String(err?.message ?? err).replace(/\s+/g, ' ').slice(0, 200);

async function generateWithRetry(label, generate) {
  const startedAt = Date.now();

  const ctx = requestContext.getStore() ?? {};
  let badReplies = 0;

  for (let attempt = 1; ; attempt++) {
    const attemptStartedAt = Date.now();
    ctx.attempts = attempt;
    // Genkit checks the reply after the model call returns, and its error keeps
    // neither the reply nor the token usage. Holding the raw reply here tells us
    // Google answered, so the attempt was billed, and what it cost.
    let reply = null;
    const keepReply = async (req, next) => {
      reply = await next(req);
      return reply;
    };
    try {
      const response = await generate(keepReply);
      events.record('gemini_call', {
        flow: label,
        game: ctx.game ?? null,
        src: ctx.src ?? 'script',
        model: MODEL,
        attempt,
        ms: Date.now() - attemptStartedAt,
        ok: true,
        ...geminiCallFields({ model: MODEL, tokens: tokensFromUsage(response?.usage) }),
      });
      return response;
    } catch (err) {
      events.record('gemini_call', {
        flow: label,
        game: ctx.game ?? null,
        src: ctx.src ?? 'script',
        model: MODEL,
        attempt,
        ms: Date.now() - attemptStartedAt,
        ok: false,
        status: reply
          ? 'bad_reply'
          : Number(err?.status ?? err?.cause?.status) || String(err?.status ?? 'error'),
        ...geminiCallFields({ model: MODEL, tokens: tokensFromUsage(reply?.usage) }),
      });

      const elapsedMs = Date.now() - startedAt;
      const backoffMs =
        Math.min(400 * 2 ** (attempt - 1), MAX_BACKOFF_MS) + Math.floor(Math.random() * 250);
      const outOfTime = elapsedMs + backoffMs + MIN_ATTEMPT_MS > RETRY_BUDGET_MS;
      const failure = { attempts: attempt, elapsedMs, cause: err };

      if (reply) {
        badReplies++;
        if (outOfTime || badReplies > MAX_BAD_REPLY_RETRIES) {
          throw new BadModelReplyError(
            `${label}: unusable reply after ${attempt} attempt(s): ${brief(err)}`,
            failure,
          );
        }
        console.warn(
          `[trivia-api] ${label}: bad reply on attempt ${attempt} ` +
            `(${elapsedMs}ms elapsed, model=${MODEL}), retrying in ${backoffMs}ms: ${brief(err)}`,
        );
      } else if (!isTransientUpstream(err)) {
        throw new UpstreamRejectedError(`${label}: Gemini call failed: ${brief(err)}`, failure);
      } else {
        if (outOfTime) {
          throw new UpstreamBusyError(
            `${label}: upstream busy after ${attempt} attempt(s) in ${elapsedMs}ms`,
            failure,
          );
        }
        console.warn(
          `[trivia-api] ${label}: transient upstream error on attempt ${attempt} ` +
            `(${elapsedMs}ms elapsed, model=${MODEL}), retrying in ${backoffMs}ms`,
        );
      }
      await sleep(backoffMs);
    }
  }
}

const triviaQuestionsFlow = ai.defineFlow(
  {
    name: 'triviaQuestionsFlow',
    inputSchema: QuestionsInputSchema,
    outputSchema: QuestionsOutputSchema,
  },
  async ({ difficulty, previousQuestions = [] }) => {
    const prompt = buildQuestionsPrompt({ difficulty, previousQuestions });
    const { output } = await generateWithRetry('questions', (keepReply) =>
      ai.generate({
        model: MODEL,
        system: 'You are an expert IT Educator creating a game for potential college students.',
        prompt,
        output: { schema: QuestionsOutputSchema },
        use: [keepReply],
      }),
    );
    if (!output) throw new Error('Model returned empty output for questions flow');
    return output;
  }
);

const triviaResultsFlow = ai.defineFlow(
  {
    name: 'triviaResultsFlow',
    inputSchema: z.object({
      score: z.number().int().min(0),
      total: z.number().int().min(1),
    }),
    outputSchema: ResultsOutputSchema,
  },
  async ({ score, total }) => {
    const prompt = `
    The student scored ${score} out of ${total} in the IT Trivia Challenge.

    1. Generate a fun, personalized Title (e.g., "Help Desk Hero", "Cyber Rookie").
    2. Write a witty evaluation message based on the score.
    3. Write a custom motivational paragraph specifically explaining why they should consider a career in IT and taking classes at "Brightpoint Community College". Keep it energetic and appealing to high schoolers.
  `;
    const { output } = await generateWithRetry('results', (keepReply) =>
      ai.generate({
        model: MODEL,
        system: 'You are a cool, encouraging guidance counselor for future tech professionals.',
        prompt,
        output: { schema: ResultsOutputSchema },
        use: [keepReply],
      }),
    );
    if (!output) throw new Error('Model returned empty output for results flow');
    return output;
  }
);

const app = express();
app.set('trust proxy', 'loopback');

// Public, anonymous usage numbers for the footer counter and /stats page. Open
// to any origin (no personal data) and registered before the origin guard.
const statsLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});
app.get('/api/stats', statsLimiter, (_req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'public, max-age=60');
  res.json(events.stats());
});
app.get('/api/stats/daily.csv', statsLimiter, (_req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'public, max-age=60');
  res.type('text/csv');
  res.attachment('trivia-daily-usage.csv');
  res.send(dailyCsv(events.stats()));
});

app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.use('/api/', (req, res, next) => {
  const origin = req.get('Origin');
  if (origin && origin !== ALLOWED_ORIGIN) {
    return res.status(403).json({ error: 'forbidden_origin' });
  }
  next();
});

// Per client IP, and shared by /api/questions and /api/results. A classroom
// sits behind one school IP, so this is effectively a per-room cap on starts +
// finishes per minute. Override with TRIVIA_RATE_LIMIT_PER_MIN in .env and
// restart (no redeploy) if a bigger group is coming.
const RATE_LIMIT_PER_MIN = Number(process.env.TRIVIA_RATE_LIMIT_PER_MIN || 30);
const limiter = rateLimit({
  windowMs: 60_000,
  max: RATE_LIMIT_PER_MIN,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});
app.use('/api/questions', limiter);
app.use('/api/results', limiter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', model: MODEL });
});

function pick(source, keys) {
  const picked = {};
  for (const key of keys) {
    if (source[key] !== undefined) picked[key] = source[key];
  }
  return picked;
}

function failureReason(err) {
  if (err instanceof BadModelReplyError) return 'bad_reply';
  if (err instanceof UpstreamBusyError || isTransientUpstream(err)) return 'upstream_busy';
  if (err?.status === 'INVALID_ARGUMENT') return 'invalid_request';
  return 'error';
}

app.post('/api/questions', async (req, res, next) => {
  const body = req.body ?? {};
  const ctx = { game: randomUUID(), src: classifySource(req, ALLOWED_ORIGIN), attempts: 0 };
  const startedAt = Date.now();
  const base = {
    game: ctx.game,
    device: cleanDeviceId(body.deviceId),
    src: ctx.src,
    difficulty: body.difficulty === undefined ? 'easier' : DIFFICULTY_ORDER.includes(body.difficulty) ? body.difficulty : null,
  };
  // The player closing the tab or reloading while Gemini works shows up as the
  // response closing before it was sent (nginx logs it as 499).
  let settled = false;
  res.on('close', () => {
    if (!settled && !res.writableFinished) {
      settled = true;
      events.record('quiz_abandoned', { ...base, ms: Date.now() - startedAt });
    }
  });
  try {
    // Pass only the flow's own fields (the browser also sends deviceId).
    const input = pick(body, ['difficulty', 'previousQuestions']);
    const output = await requestContext.run(ctx, () => triviaQuestionsFlow(input));
    if (settled) return;
    settled = true;
    events.record('quiz_generated', {
      ...base,
      replay: Array.isArray(body.previousQuestions) && body.previousQuestions.length > 0,
      ms: Date.now() - startedAt,
      attempts: ctx.attempts,
      model: MODEL,
    });
    res.json({ ...output, gameId: ctx.game });
  } catch (err) {
    if (!settled) {
      settled = true;
      events.record('quiz_failed', { ...base, reason: failureReason(err), ms: Date.now() - startedAt });
    }
    next(err);
  }
});

app.post('/api/results', async (req, res, next) => {
  const body = req.body ?? {};
  const src = classifySource(req, ALLOWED_ORIGIN);
  const game = cleanGameId(body.gameId);
  const { score, total } = body;
  if (Number.isInteger(score) && Number.isInteger(total) && total >= 1 && score >= 0 && score <= total) {
    const quiz = events.game(game);
    events.record('game_completed', {
      game,
      device: cleanDeviceId(body.deviceId) ?? quiz?.device ?? null,
      src,
      difficulty: quiz?.difficulty ?? null,
      score,
      total,
    });
  }
  try {
    const output = await requestContext.run({ game, src }, () => triviaResultsFlow(pick(body, ['score', 'total'])));
    res.json(output);
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error('[trivia-api error]', err?.stack || err);

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large' });
  }
  // Bad client payload (e.g. an unknown difficulty) is a 400, not our fault. The
  // flow's input check is the only thing that can reach this branch now; Gemini
  // failures arrive as UpstreamError with no status.
  if (err?.status === 'INVALID_ARGUMENT') {
    return res.status(400).json({ error: 'invalid_request' });
  }
  // Gemini's reply was unusable even after a retry. Nobody's request was wrong.
  if (err instanceof BadModelReplyError) {
    return res.status(502).json({ error: 'bad_model_reply' });
  }
  // Google shed the request. Say so honestly so the UI can offer a retry
  // instead of reporting a generic server fault.
  if (err instanceof UpstreamBusyError || isTransientUpstream(err)) {
    res.set('Retry-After', '30');
    return res.status(503).json({ error: 'upstream_busy' });
  }
  res.status(500).json({ error: 'internal_error' });
});

app.listen(PORT, HOST, () => {
  console.log(
    `[trivia-api] listening on http://${HOST}:${PORT} model=${MODEL} ` +
      `events=${EVENTS_FILE} (${events.loaded} loaded)`,
  );
});
