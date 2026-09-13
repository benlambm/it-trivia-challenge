import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { fetchGameResults, fetchQuestions } from './services/triviaApi';
import type { ReplayOption } from './lib/difficulty';
import type { GameResult, Question } from './types';

vi.mock('./services/triviaApi', () => ({
  fetchQuestions: vi.fn(),
  fetchGameResults: vi.fn(),
}));

vi.mock('./components/WelcomeScreen', () => ({
  default: ({
    onStart,
    difficultyTier,
    onDifficultyTierChange,
  }: {
    onStart: () => void;
    difficultyTier: number;
    onDifficultyTierChange: (tier: number) => void;
  }) => (
    <div>
      <input
        aria-label="Starting difficulty"
        type="range"
        min={-2}
        max={2}
        value={difficultyTier}
        onChange={(event) => onDifficultyTierChange(Number(event.currentTarget.value))}
      />
      <button onClick={onStart}>Start New Game</button>
    </div>
  ),
}));

vi.mock('./components/LoadingScreen', () => ({
  default: ({ type }: { type: string }) => <div>Loading {type}</div>,
}));

vi.mock('./components/QuizScreen', () => ({
  default: ({ questions, onFinish }: { questions: Question[]; onFinish: (score: number) => void }) => (
    <div>
      <div data-testid="quiz-question-count">{questions.length}</div>
      <button onClick={() => onFinish(23)}>Finish Quiz</button>
    </div>
  ),
}));

vi.mock('./components/ResultsScreen', () => ({
  default: ({ replayOptions, onReplay }: { replayOptions: ReplayOption[]; onReplay: (tier: number) => void }) => (
    <div>
      {replayOptions.map((option) => (
        <button key={option.kind} onClick={() => onReplay(option.tier)}>
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('./components/Footer', () => ({
  default: () => <footer>Footer</footer>,
}));

const firstQuestions: Question[] = [
  {
    id: 0,
    category: 'Cybersecurity',
    text: 'What is phishing?',
    options: ['Scam email', 'Fast network', 'Backup type', 'Database key'],
    correctAnswer: 'Scam email',
  },
];

const secondQuestions: Question[] = [
  {
    id: 0,
    category: 'Networking & Internet',
    text: 'What does DNS resolve?',
    options: ['Names to IPs', 'Files to folders', 'Apps to windows', 'Ports to cables'],
    correctAnswer: 'Names to IPs',
  },
];

const result: GameResult = {
  score: 23,
  totalQuestions: 25,
  title: 'Network Navigator',
  evaluation: 'Strong work.',
  motivation: 'Keep going.',
};

describe('App replay flow', () => {
  beforeEach(() => {
    vi.mocked(fetchQuestions).mockReset();
    vi.mocked(fetchGameResults).mockReset();
  });

  async function playThroughFirstQuiz() {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /start new game/i }));
    expect(await screen.findByTestId('quiz-question-count')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: /finish quiz/i }));
    await screen.findByRole('button', { name: /^play again$/i });
  }

  it('offers easier, same and harder replays after a quiz', async () => {
    vi.mocked(fetchQuestions).mockResolvedValue(firstQuestions);
    vi.mocked(fetchGameResults).mockResolvedValue(result);

    await playThroughFirstQuiz();

    expect(screen.getByRole('button', { name: /try an easier quiz/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^play again$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try a harder quiz/i })).toBeInTheDocument();
  });

  // Starting tier is Easier (-1), so the three replays map to much_easier / easier / normal.
  it.each([
    ['Try an Easier Quiz', 'much_easier'],
    ['Play Again', 'easier'],
    ['Try a Harder Quiz', 'normal'],
  ])('"%s" requests %s with the previous quiz attached', async (label, difficulty) => {
    vi.mocked(fetchQuestions).mockResolvedValueOnce(firstQuestions).mockResolvedValueOnce(secondQuestions);
    vi.mocked(fetchGameResults).mockResolvedValue(result);

    await playThroughFirstQuiz();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }));

    await waitFor(() => {
      expect(fetchQuestions).toHaveBeenNthCalledWith(2, difficulty, firstQuestions);
    });
  });

  it('keeps the chosen tier for the following replay', async () => {
    vi.mocked(fetchQuestions).mockResolvedValue(firstQuestions);
    vi.mocked(fetchGameResults).mockResolvedValue(result);

    await playThroughFirstQuiz();
    fireEvent.click(screen.getByRole('button', { name: /try a harder quiz/i })); // easier -> normal
    expect(await screen.findByTestId('quiz-question-count')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: /finish quiz/i }));
    await screen.findByRole('button', { name: /^play again$/i });
    fireEvent.click(screen.getByRole('button', { name: /try a harder quiz/i })); // normal -> harder

    await waitFor(() => {
      expect(fetchQuestions).toHaveBeenNthCalledWith(3, 'harder', firstQuestions);
    });
  });

  it('hides the easier option when already at Much Easier', async () => {
    vi.mocked(fetchQuestions).mockResolvedValue(firstQuestions);
    vi.mocked(fetchGameResults).mockResolvedValue(result);

    render(<App />);
    fireEvent.change(screen.getByRole('slider', { name: /starting difficulty/i }), {
      target: { value: '-2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start new game/i }));
    expect(await screen.findByTestId('quiz-question-count')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: /finish quiz/i }));
    await screen.findByRole('button', { name: /^play again$/i });

    expect(screen.queryByRole('button', { name: /try an easier quiz/i })).toBeNull();
    expect(screen.getByRole('button', { name: /try a harder quiz/i })).toBeInTheDocument();
  });

  it('uses the selected starting difficulty on first play', async () => {
    vi.mocked(fetchQuestions).mockResolvedValue(firstQuestions);

    render(<App />);

    fireEvent.change(screen.getByRole('slider', { name: /starting difficulty/i }), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start new game/i }));

    await waitFor(() => {
      expect(fetchQuestions).toHaveBeenCalledWith('much_harder', []);
    });
  });

  it('starts on the Easier tier when the slider is untouched', async () => {
    vi.mocked(fetchQuestions).mockResolvedValue(firstQuestions);

    render(<App />);

    expect(screen.getByRole('slider', { name: /starting difficulty/i })).toHaveProperty('value', '-1');
    fireEvent.click(screen.getByRole('button', { name: /start new game/i }));

    await waitFor(() => {
      expect(fetchQuestions).toHaveBeenCalledWith('easier', []);
    });
  });
});
