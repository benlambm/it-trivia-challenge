import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchGameResults, fetchQuestions } from './triviaApi';

describe('fetchGameResults', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns fallback result when the API responds with an error', async () => {
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
});

describe('fetchQuestions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubQuestionsFetch() {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
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

  it('forwards the provided difficulty to /api/questions', async () => {
    const fetchMock = stubQuestionsFetch();
    await fetchQuestions('harder');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/questions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ difficulty: 'harder' }),
      }),
    );
  });

  it("defaults to difficulty 'normal' when called with no argument", async () => {
    const fetchMock = stubQuestionsFetch();
    await fetchQuestions();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/questions',
      expect.objectContaining({
        body: JSON.stringify({ difficulty: 'normal' }),
      }),
    );
  });
});
