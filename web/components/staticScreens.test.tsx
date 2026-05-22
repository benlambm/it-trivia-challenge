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
  it('shows score feedback and calls play again', () => {
    const onPlayAgain = vi.fn();
    render(
      <ResultsScreen
        result={{
          score: 5,
          totalQuestions: 25,
          title: 'Tech Explorer',
          evaluation: 'Keep learning.',
          motivation: 'Brightpoint can help.',
        }}
        onPlayAgain={onPlayAgain}
        playAgainLabel="Try Again"
      />,
    );

    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('5 / 25 Correct')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(onPlayAgain).toHaveBeenCalledTimes(1);
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
