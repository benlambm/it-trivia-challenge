import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { buildQuestionsPrompt, QuestionsInputSchema, QuestionsOutputSchema } from './triviaQuestions.js';

// Model is env-overridable (TRIVIA_MODEL in .env) so it can be changed with a
// restart instead of a code edit + redeploy.
//
// TODO: move to googleai/gemini-3.7-flash once Google's capacity recovers.
// Measured on 2026-08-17 against the real 25-question generateContent workload:
//   gemini-3.7-flash     0/8  ok  <- preferred, but 503 "high demand" on every call
//   gemini-flash-latest  0/4  ok  <- floating alias, resolves to a congested model
//   gemini-3.6-flash    11/12 ok  <- current pin
//   gemini-3.5-flash     4/4  ok
//   gemini-2.5-flash     0/4  ok  <- retired: 404 "no longer available to new users"
// Retest with: TRIVIA_MODEL=googleai/gemini-3.7-flash, then watch for 503s.
const DEFAULT_MODEL = 'googleai/gemini-3.6-flash';
const MODEL = process.env.TRIVIA_MODEL || DEFAULT_MODEL;

const ALLOWED_ORIGIN = 'https://trivia.benlamb.net';
const PORT = 3000;
const HOST = '127.0.0.1';
const JSON_BODY_LIMIT = '2mb';

// nginx fronts this service with `proxy_read_timeout 60s`, so the whole
// request -- including retries -- has to finish inside that window or the user
// gets a 504 instead of our error. A successful 25-question generation runs
// ~19-33s, so we only start another attempt if there's plausibly time for it.
const RETRY_BUDGET_MS = Number(process.env.TRIVIA_RETRY_BUDGET_MS || 55_000);
const MIN_ATTEMPT_MS = Number(process.env.TRIVIA_MIN_ATTEMPT_MS || 18_000);
const MAX_BACKOFF_MS = 2_000;

const ai = genkit({ plugins: [googleAI()] });

const ResultsOutputSchema = z.object({
  title: z.string(),
  evaluation: z.string(),
  motivation: z.string(),
});

class UpstreamBusyError extends Error {
  constructor(message, { attempts, elapsedMs, cause }) {
    super(message);
    this.name = 'UpstreamBusyError';
    this.attempts = attempts;
    this.elapsedMs = elapsedMs;
    this.cause = cause;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Google sheds load with 503 (and occasionally 429/500/502/504) when a model is
// saturated. Those are worth retrying. Schema/validation failures are not --
// they'd fail identically every time.
function isTransientUpstream(err) {
  const status = Number(err?.status ?? err?.cause?.status ?? err?.response?.status);
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(err?.message ?? '');
  return (
    /\[(429|500|502|503|504)\s/.test(message) ||
    /Service Unavailable|high demand|overloaded|Too Many Requests|try again later/i.test(message)
  );
}

async function generateWithRetry(label, generate) {
  const startedAt = Date.now();

  for (let attempt = 1; ; attempt++) {
    try {
      return await generate();
    } catch (err) {
      if (!isTransientUpstream(err)) throw err;

      const elapsedMs = Date.now() - startedAt;
      const backoffMs =
        Math.min(400 * 2 ** (attempt - 1), MAX_BACKOFF_MS) + Math.floor(Math.random() * 250);

      if (elapsedMs + backoffMs + MIN_ATTEMPT_MS > RETRY_BUDGET_MS) {
        throw new UpstreamBusyError(
          `${label}: upstream busy after ${attempt} attempt(s) in ${elapsedMs}ms`,
          { attempts: attempt, elapsedMs, cause: err },
        );
      }

      console.warn(
        `[trivia-api] ${label}: transient upstream error on attempt ${attempt} ` +
          `(${elapsedMs}ms elapsed, model=${MODEL}), retrying in ${backoffMs}ms`,
      );
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
    const { output } = await generateWithRetry('questions', () =>
      ai.generate({
        model: MODEL,
        system: 'You are an expert IT Educator creating a game for potential college students.',
        prompt,
        output: { schema: QuestionsOutputSchema },
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
    const { output } = await generateWithRetry('results', () =>
      ai.generate({
        model: MODEL,
        system: 'You are a cool, encouraging guidance counselor for future tech professionals.',
        prompt,
        output: { schema: ResultsOutputSchema },
      }),
    );
    if (!output) throw new Error('Model returned empty output for results flow');
    return output;
  }
);

const app = express();
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.use('/api/', (req, res, next) => {
  const origin = req.get('Origin');
  if (origin && origin !== ALLOWED_ORIGIN) {
    return res.status(403).json({ error: 'forbidden_origin' });
  }
  next();
});

const limiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});
app.use('/api/questions', limiter);
app.use('/api/results', limiter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', model: MODEL });
});

app.post('/api/questions', async (req, res, next) => {
  try {
    const output = await triviaQuestionsFlow(req.body ?? {});
    res.json(output);
  } catch (err) {
    next(err);
  }
});

app.post('/api/results', async (req, res, next) => {
  try {
    const output = await triviaResultsFlow(req.body);
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
  // Bad client payload (e.g. an unknown difficulty) is a 400, not our fault.
  if (err?.status === 'INVALID_ARGUMENT') {
    return res.status(400).json({ error: 'invalid_request' });
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
  console.log(`[trivia-api] listening on http://${HOST}:${PORT} model=${MODEL}`);
});
