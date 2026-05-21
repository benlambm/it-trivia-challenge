import { Question, GameResult } from '../types';
import { shuffleArray } from '../lib/shuffleArray';

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
  questions: Array<{
    category: string;
    text: string;
    options: string[];
    correctAnswer: string;
  }>;
}

interface ResultsResponse {
  title: string;
  evaluation: string;
  motivation: string;
}

export const generateQuestions = async (): Promise<Question[]> => {
  const { questions } = await postJson<QuestionsResponse>('/api/questions');
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('Empty question set from API.');
  }
  return questions.map((q, index) => ({
    id: index,
    category: q.category,
    text: q.text,
    options: shuffleArray(q.options),
    correctAnswer: q.correctAnswer,
  }));
};

export const generateGameResults = async (score: number, total: number): Promise<GameResult> => {
  try {
    const r = await postJson<ResultsResponse>('/api/results', { score, total });
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
