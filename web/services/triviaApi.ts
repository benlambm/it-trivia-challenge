import { Question, GameResult, PublicStats, QuizSet } from '../types';
import { shuffleArray } from '../lib/shuffleArray';
import { DEFAULT_DIFFICULTY, type Difficulty } from '../lib/difficulty';
import { getDeviceId } from '../lib/device';

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      if (j && typeof j.error === 'string') detail = j.error;
    } catch {
      // body wasn't JSON; keep statusText
    }
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

interface QuestionsResponse {
  gameId?: string;
  questions: Array<{
    category: string;
    text: string;
    options: string[];
    correctAnswer: string;
  }>;
}

type PreviousQuestion = Pick<Question, 'category' | 'text' | 'options' | 'correctAnswer'>;

interface ResultsResponse {
  title: string;
  evaluation: string;
  motivation: string;
}

export const fetchQuestions = async (
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
  previousQuestions: Question[] = [],
): Promise<QuizSet> => {
  const previousQuestionPayload: PreviousQuestion[] = previousQuestions.map(
    ({ category, text, options, correctAnswer }) => ({
      category,
      text,
      options,
      correctAnswer,
    }),
  );
  const body =
    previousQuestionPayload.length > 0
      ? { difficulty, previousQuestions: previousQuestionPayload, deviceId: getDeviceId() }
      : { difficulty, deviceId: getDeviceId() };
  const { questions, gameId } = await postJson<QuestionsResponse>('/api/questions', body);
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('Empty question set from API.');
  }
  return {
    gameId: typeof gameId === 'string' ? gameId : null,
    questions: questions.map((q, index) => ({
      id: index,
      category: q.category,
      text: q.text,
      options: shuffleArray(q.options),
      correctAnswer: q.correctAnswer,
    })),
  };
};

// Public, anonymous usage numbers (footer counter and /stats page).
export const fetchStats = async (): Promise<PublicStats> => {
  const res = await fetch('/api/stats', { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`API ${res.status}: stats unavailable`);
  return res.json() as Promise<PublicStats>;
};

export const fetchGameResults = async (
  score: number,
  total: number,
  gameId: string | null = null,
): Promise<GameResult> => {
  try {
    const body = gameId ? { score, total, gameId, deviceId: getDeviceId() } : { score, total, deviceId: getDeviceId() };
    const r = await postJson<ResultsResponse>('/api/results', body);
    return {
      score,
      totalQuestions: total,
      title: r.title,
      evaluation: r.evaluation,
      motivation: r.motivation,
    };
  } catch (error) {
    console.error('Results API error:', error);
    return {
      score,
      totalQuestions: total,
      title: 'Tech Explorer',
      evaluation: 'Great effort! Technology is a vast field with a place for everyone.',
      motivation:
        "Brightpoint Community College offers amazing pathways into IT careers. Whether you got a perfect score or are just starting, there's a class for you!",
    };
  }
};
