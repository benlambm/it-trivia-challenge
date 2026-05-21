import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateGameResults } from './geminiService';

describe('generateGameResults', () => {
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

    const result = await generateGameResults(7, 25);

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
