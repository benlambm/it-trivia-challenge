import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  it('renders important external links', () => {
    render(<Footer />);

    expect(screen.getByRole('link', { name: /view source on github/i })).toHaveAttribute(
      'href',
      'https://github.com/benlambm/it-trivia-challenge',
    );
    expect(screen.getByRole('link', { name: /apply now/i })).toHaveAttribute(
      'href',
      'https://www.brightpoint.edu/applynow',
    );
  });
});

describe('LoadingScreen', () => {
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('advances through loading messages', () => {
    vi.useFakeTimers();
    render(<LoadingScreen type="questions" />);

    expect(screen.getByText('Generating Challenge')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1600));

    expect(screen.getByText('Connecting to Neural Network...')).toBeInTheDocument();
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
