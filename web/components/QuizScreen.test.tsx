import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuizScreen from './QuizScreen';
import { Category, Question } from '../types';
import { replayOptions } from '../lib/difficulty';

const questions: Question[] = [
  {
    id: 0,
    category: Category.NETWORKING,
    text: 'Q1',
    options: ['Correct 1', 'Wrong 1', 'Wrong 2', 'Wrong 3'],
    correctAnswer: 'Correct 1',
  },
  {
    id: 1,
    category: Category.NETWORKING,
    text: 'Q2',
    options: ['Wrong A', 'Correct 2', 'Wrong B', 'Wrong C'],
    correctAnswer: 'Correct 2',
  },
];

const exits = { replayOptions: replayOptions(0), onReplay: vi.fn(), onHome: vi.fn() };

describe('QuizScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('includes the final answer when reporting the score', () => {
    const onFinish = vi.fn();
    render(<QuizScreen questions={questions} onFinish={onFinish} {...exits} />);

    fireEvent.click(screen.getByRole('button', { name: /skip intro/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Correct 1' }));
    act(() => vi.advanceTimersByTime(1500));

    expect(screen.getByText('Q2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Correct 2' }));
    act(() => vi.advanceTimersByTime(1500));

    expect(onFinish).toHaveBeenCalledWith(2);
  });

  it('does not allow changing an answer after the first selection', () => {
    const onFinish = vi.fn();
    render(<QuizScreen questions={[questions[0]]} onFinish={onFinish} {...exits} />);

    fireEvent.click(screen.getByRole('button', { name: /skip intro/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Wrong 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Correct 1' }));
    act(() => vi.advanceTimersByTime(1500));

    expect(onFinish).toHaveBeenCalledWith(0);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('offers a home link and one step easier or harder during the quiz', () => {
    const onReplay = vi.fn();
    const onHome = vi.fn();
    render(
      <QuizScreen
        questions={questions}
        onFinish={vi.fn()}
        replayOptions={replayOptions(0)}
        onReplay={onReplay}
        onHome={onHome}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /skip intro/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Try an Easier Quiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try a Harder Quiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));

    expect(onReplay.mock.calls).toEqual([[-1], [1]]);
    expect(onHome).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /play again/i })).toBeNull();
  });

  it.each([
    [-2, 'Try an Easier Quiz'],
    [2, 'Try a Harder Quiz'],
  ])('drops the step past the end of the scale at tier %i', (tier, missing) => {
    render(<QuizScreen questions={questions} onFinish={vi.fn()} {...exits} replayOptions={replayOptions(tier)} />);
    fireEvent.click(screen.getByRole('button', { name: /skip intro/i }));

    expect(screen.queryByRole('button', { name: missing })).toBeNull();
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
  });

  it('does not finish a quiz the student left during the answer reveal', () => {
    const onFinish = vi.fn();
    const { unmount } = render(<QuizScreen questions={[questions[0]]} onFinish={onFinish} {...exits} />);

    fireEvent.click(screen.getByRole('button', { name: /skip intro/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Correct 1' }));
    unmount();
    act(() => vi.advanceTimersByTime(1500));

    expect(onFinish).not.toHaveBeenCalled();
  });
});
