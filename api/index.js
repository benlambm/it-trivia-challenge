import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

const MODEL = 'googleai/gemini-flash-latest';
const ALLOWED_ORIGIN = 'https://trivia.benlamb.net';
const PORT = 3000;
const HOST = '127.0.0.1';

const ai = genkit({ plugins: [googleAI()] });

const QuestionSchema = z.object({
  category: z.string(),
  text: z.string(),
  options: z.array(z.string()).length(4),
  correctAnswer: z.string(),
});

const QuestionsOutputSchema = z.object({
  questions: z.array(QuestionSchema).length(25),
});

const ResultsOutputSchema = z.object({
  title: z.string(),
  evaluation: z.string(),
  motivation: z.string(),
});

const CATEGORY_NETWORKING = 'Networking & Internet';
const CATEGORY_AI = 'Artificial Intelligence';
const CATEGORY_DEV = 'Program and Database Development';
const CATEGORY_CYBER = 'Cybersecurity';
const CATEGORY_OPS = 'IT Operations and Support';

const triviaQuestionsFlow = ai.defineFlow(
  {
    name: 'triviaQuestionsFlow',
    inputSchema: z.object({}).optional(),
    outputSchema: QuestionsOutputSchema,
  },
  async () => {
    const prompt = `
    Create a high-school level IT Trivia game.
    Generate exactly 25 multiple choice questions.

    The questions must be divided evenly (5 questions per category) across these 5 categories, in this specific order:
    1. ${CATEGORY_NETWORKING}
    2. ${CATEGORY_AI}
    3. ${CATEGORY_DEV}
    4. ${CATEGORY_CYBER}
    5. ${CATEGORY_OPS}

    Rules:
    - Answer choices must be short phrases or single words.
    - Questions should be engaging but educational.
    - Provide 4 options per question.
    - Ensure the correct answer is accurate.
    - CRITICAL: Randomize the position of the correct answer. It is VITAL that the correct answer is NOT always the 2nd or 3rd option (B or C). Ensure an even distribution of correct answers across indices 0, 1, 2, and 3 (A, B, C, D) throughout the 25 questions.

    Specific Category Instructions:
    - For "${CATEGORY_OPS}": Focus strictly on practical help desk scenarios, hardware/software troubleshooting, and problem-solving (e.g., "A user's screen is black," "Printer won't print"). Ask "What is the BEST first step?" or "What should you check first?". DO NOT include ITIL, ITSM, or complex framework questions. Keep it hands-on and high-school friendly.
  `;
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
app.use(express.json({ limit: '1kb' }));

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

app.post('/api/questions', async (_req, res, next) => {
  try {
    const output = await triviaQuestionsFlow({});
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
