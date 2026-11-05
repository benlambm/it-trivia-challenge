import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorToast from './ErrorToast';
import Footer from './Footer';
import LoadingScreen from './LoadingScreen';
import ResultsScreen from './ResultsScreen';
import WelcomeScreen from './WelcomeScreen';

describe('WelcomeScreen', () => {
  it('starts the game and lists quiz categories', () => {
    const onStart = vi.fn();
    render(<WelcomeScreen onStart={onStart} difficultyTier={0} onDifficultyTierChange={vi.fn()} />);

    expect(screen.getByText('Networking & Internet')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /starting difficulty/i })).toHaveValue('0');
    fireEvent.click(screen.getByRole('button', { name: /start new game/i }));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('changes the starting difficulty with a minimal slider', () => {
    const onDifficultyTierChange = vi.fn();
    render(
      <WelcomeScreen
        onStart={vi.fn()}
        difficultyTier={1}
        onDifficultyTierChange={onDifficultyTierChange}
      />,
    );

    expect(screen.getByRole('slider', { name: /starting difficulty/i })).toHaveValue('1');
    fireEvent.change(screen.getByRole('slider', { name: /starting difficulty/i }), {
      target: { value: '-1' },
    });

    expect(onDifficultyTierChange).toHaveBeenCalledWith(-1);
  });
});

describe('ResultsScreen', () => {
  it('shows score feedback and offers every replay option it is given', () => {
    const onReplay = vi.fn();
    render(
      <ResultsScreen
        result={{
          score: 5,
          totalQuestions: 25,
          title: 'Tech Explorer',
          evaluation: 'Keep learning.',
          motivation: 'Brightpoint can help.',
        }}
        replayOptions={[
          { kind: 'easier', label: 'Try an Easier Quiz', tier: -1 },
          { kind: 'same', label: 'Play Again', tier: 0 },
          { kind: 'harder', label: 'Try a Harder Quiz', tier: 1 },
        ]}
        onReplay={onReplay}
      />,
    );

    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('5 / 25 Correct')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: /try an easier quiz/i }));
    fireEvent.click(screen.getByRole('button', { name: /^play again/i }));
    fireEvent.click(screen.getByRole('button', { name: /try a harder quiz/i }));

    expect(onReplay.mock.calls).toEqual([[-1], [0], [1]]);
  });

  it('renders only the options it is given at the end of the scale', () => {
    render(
      <ResultsScreen
        result={{ score: 25, totalQuestions: 25, title: 'Ace', evaluation: 'Wow.', motivation: 'Go.' }}
        replayOptions={[
          { kind: 'easier', label: 'Try an Easier Quiz', tier: 1 },
          { kind: 'same', label: 'Play Again', tier: 2 },
        ]}
        onReplay={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /try a harder quiz/i })).toBeNull();
  });
});

describe('Footer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders important external links', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<Footer />);

    expect(screen.getByRole('link', { name: /view source on github/i })).toHaveAttribute(
      'href',
      'https://github.com/benlambm/it-trivia-challenge',
    );
    expect(screen.getByRole('link', { name: /apply now/i })).toHaveAttribute(
      'href',
      'https://www.brightpoint.edu/applynow',
    );
    expect(screen.queryByTestId('play-counter')).toBeNull();
  });

  it('shows the live play counter with a link to the stats page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          timeZone: 'America/New_York',
          firstEventAt: '2026-10-03T20:42:09.000Z',
          players: { quizzes: 1234, completed: 987 },
        }),
      }),
    );
    render(<Footer />);
    const counter = await screen.findByTestId('play-counter');
    expect(counter).toHaveTextContent('1,234 quizzes played since Oct 2026 · 987 completed');
    expect(screen.getByRole('link', { name: /live stats/i })).toHaveAttribute('href', '/stats');
  });
});

describe('LoadingScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  const NOTE = /Gemini AI is writing new questions just for you! This may take a minute or two\.\.\./;
  const STAY_NOTICE =
    "Wait! Don't click Refresh. Your Trivia questions are on their way now. Please be patient and count down from 10.";

  const leavePage = (clientY: number) =>
    act(() => {
      document.documentElement.dispatchEvent(new MouseEvent('mouseleave', { clientY }));
    });

  it('paces question steps so the last one arrives near the slowest real games', () => {
    render(<LoadingScreen type="questions" />);

    expect(screen.getByText('Generating Challenge')).toBeInTheDocument();
    expect(screen.getByText('Connecting to Neural Network...')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(6999));
    expect(screen.getByText('Connecting to Neural Network...')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText(/^Scanning /)).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(27999));
    expect(screen.queryByText('Finalizing Game Data...')).toBeNull();
    act(() => vi.advanceTimersByTime(7001));
    expect(screen.getByText('Finalizing Game Data...')).toBeInTheDocument();
  });

  it('keeps the results screen on its quick pace with no question messaging', () => {
    render(<LoadingScreen type="results" />);

    expect(screen.getByText('Grading Performance')).toBeInTheDocument();
    expect(screen.queryByText('Calculating Score...')).toBeNull();
    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByText('Calculating Score...')).toBeInTheDocument();

    expect(screen.queryByText(NOTE)).toBeNull();
    leavePage(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains the wait underneath the progress bar', () => {
    render(<LoadingScreen type="questions" />);

    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it('flashes a warning when the cursor leaves through the top of the page', () => {
    render(<LoadingScreen type="questions" />);
    expect(screen.queryByRole('alert')).toBeNull();

    leavePage(0);
    expect(screen.getByRole('alert')).toHaveTextContent(STAY_NOTICE);

    act(() => vi.advanceTimersByTime(9999));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('restarts the warning timer if the cursor heads up there again', () => {
    render(<LoadingScreen type="questions" />);

    leavePage(-5);
    act(() => vi.advanceTimersByTime(8000));
    leavePage(-5);
    act(() => vi.advanceTimersByTime(8000));

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('ignores the cursor leaving through the sides or bottom', () => {
    render(<LoadingScreen type="questions" />);

    leavePage(400);

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('ErrorToast', () => {
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('can be dismissed manually and automatically', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<ErrorToast message="Network failed" onClose={onClose} />);

    expect(screen.getByText('Network failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(6000));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
