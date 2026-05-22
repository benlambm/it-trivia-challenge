import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuizScreen from './QuizScreen';
import { Category, Question } from '../types';

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
    render(<QuizScreen questions={questions} onFinish={onFinish} />);

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
    render(<QuizScreen questions={[questions[0]]} onFinish={onFinish} />);

    fireEvent.click(screen.getByRole('button', { name: /skip intro/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Wrong 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Correct 1' }));
    act(() => vi.advanceTimersByTime(1500));

    expect(onFinish).toHaveBeenCalledWith(0);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
