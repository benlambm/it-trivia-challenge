import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fetchGameResults, fetchQuestions, fetchStats } from './triviaApi';

function sentBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('fetchGameResults', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns fallback result when the API responds with an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Gemini unavailable' }),
      }),
    );

    const result = await fetchGameResults(7, 25);

    expect(result).toEqual({
      score: 7,
      totalQuestions: 25,
      title: 'Tech Explorer',
      evaluation: 'Great effort! Technology is a vast field with a place for everyone.',
      motivation:
        "Brightpoint Community College offers amazing pathways into IT careers. Whether you got a perfect score or are just starting, there's a class for you!",
    });
  });

  it('sends the game ID and anonymous device ID with the score', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: 'Cyber Rookie', evaluation: 'Nice.', motivation: 'Go.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGameResults(18, 25, 'game-123');

    expect(result.title).toBe('Cyber Rookie');
    const body = sentBody(fetchMock);
    expect(body).toMatchObject({ score: 18, total: 25, gameId: 'game-123' });
    expect(body.deviceId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});

describe('fetchQuestions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubQuestionsFetch(extra: Record<string, unknown> = { gameId: 'g-1' }) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...extra,
        questions: Array.from({ length: 25 }, (_, i) => ({
          category: 'Networking & Internet',
          text: `Q${i}`,
          options: ['a', 'b', 'c', 'd'],
          correctAnswer: 'a',
        })),
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('forwards the provided difficulty to /api/questions and returns the game ID', async () => {
    const fetchMock = stubQuestionsFetch();
    const quiz = await fetchQuestions('harder');
    expect(fetchMock).toHaveBeenCalledWith('/api/questions', expect.objectContaining({ method: 'POST' }));
    expect(sentBody(fetchMock)).toMatchObject({ difficulty: 'harder' });
    expect(quiz.gameId).toBe('g-1');
    expect(quiz.questions).toHaveLength(25);
    expect(quiz.questions[0].id).toBe(0);
  });

  it('keeps the same anonymous device ID across requests', async () => {
    const fetchMock = stubQuestionsFetch();
    await fetchQuestions('easier');
    await fetchQuestions('easier');
    const first = sentBody(fetchMock, 0).deviceId;
    expect(first).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(sentBody(fetchMock, 1).deviceId).toBe(first);
  });

  it('copes with an older API that sends no game ID', async () => {
    stubQuestionsFetch({});
    const quiz = await fetchQuestions('easier');
    expect(quiz.gameId).toBeNull();
  });

  it('forwards previous quiz questions without frontend-only ids', async () => {
    const fetchMock = stubQuestionsFetch();
    await fetchQuestions('harder', [
      {
        id: 7,
        category: 'Cybersecurity',
        text: 'What is phishing?',
        options: ['Scam email', 'Fast network', 'Backup type', 'Database key'],
        correctAnswer: 'Scam email',
      },
    ]);
    expect(sentBody(fetchMock)).toMatchObject({
      difficulty: 'harder',
      previousQuestions: [
        {
          category: 'Cybersecurity',
          text: 'What is phishing?',
          options: ['Scam email', 'Fast network', 'Backup type', 'Database key'],
          correctAnswer: 'Scam email',
        },
      ],
    });
    expect(sentBody(fetchMock).previousQuestions[0]).not.toHaveProperty('id');
  });

  it("defaults to difficulty 'easier' when called with no argument", async () => {
    const fetchMock = stubQuestionsFetch();
    await fetchQuestions();
    expect(sentBody(fetchMock)).toMatchObject({ difficulty: 'easier' });
  });
});

describe('fetchStats', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the public stats endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ players: { quizzes: 3 } }) });
    vi.stubGlobal('fetch', fetchMock);
    const stats = await fetchStats();
    expect(fetchMock).toHaveBeenCalledWith('/api/stats', expect.anything());
    expect(stats.players.quizzes).toBe(3);
  });

  it('throws when the endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchStats()).rejects.toThrow(/503/);
  });
});
