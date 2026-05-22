import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { buildQuestionsPrompt, QuestionsInputSchema, QuestionsOutputSchema } from './triviaQuestions.js';

const MODEL = 'googleai/gemini-flash-latest';
const ALLOWED_ORIGIN = 'https://trivia.benlamb.net';
const PORT = 3000;
const HOST = '127.0.0.1';

const ai = genkit({ plugins: [googleAI()] });

const ResultsOutputSchema = z.object({
  title: z.string(),
  evaluation: z.string(),
  motivation: z.string(),
});

const triviaQuestionsFlow = ai.defineFlow(
  {
    name: 'triviaQuestionsFlow',
    inputSchema: QuestionsInputSchema,
    outputSchema: QuestionsOutputSchema,
  },
  async ({ difficulty, previousQuestions = [] }) => {
    const prompt = buildQuestionsPrompt({ difficulty, previousQuestions });
    const { output } = await ai.generate({
      model: MODEL,
      system: 'You are an expert IT Educator creating a game for potential college students.',
      prompt,
      output: { schema: QuestionsOutputSchema },
    });
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
    const { output } = await ai.generate({
      model: MODEL,
      system: 'You are a cool, encouraging guidance counselor for future tech professionals.',
      prompt,
      output: { schema: ResultsOutputSchema },
    });
    if (!output) throw new Error('Model returned empty output for results flow');
    return output;
  }
);

const app = express();
app.set('trust proxy', 'loopback');
app.use(express.json());

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
  res.json({ status: 'ok' });
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
  res.status(500).json({ error: 'internal_error' });
});

app.listen(PORT, HOST, () => {
  console.log(`[trivia-api] listening on http://${HOST}:${PORT} model=${MODEL}`);
});
