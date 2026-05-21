import { describe, it, expect, vi, afterEach } from 'vitest';
import { shuffleArray } from './shuffleArray';

describe('shuffleArray', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves length', () => {
    const input = ['a', 'b', 'c', 'd'];
    expect(shuffleArray(input)).toHaveLength(4);
  });

  it('preserves the same multiset of values', () => {
    const input = ['a', 'b', 'c', 'd'];
    const output = shuffleArray(input);
    expect([...output].sort()).toEqual([...input].sort());
  });

  it('does not mutate the input array', () => {
    const input = ['a', 'b', 'c'];
    const copy = [...input];
    shuffleArray(input);
    expect(input).toEqual(copy);
  });

  it('returns a new array reference', () => {
    const input = ['a', 'b', 'c'];
    expect(shuffleArray(input)).not.toBe(input);
  });

  it('can reorder elements when length > 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const input = ['a', 'b', 'c', 'd'];
    const output = shuffleArray(input);
    expect(output).not.toEqual(input);
    expect([...output].sort()).toEqual([...input].sort());
  });

  it('returns a copy for single-element arrays', () => {
    const input = ['only'];
    const output = shuffleArray(input);
    expect(output).toEqual(['only']);
    expect(output).not.toBe(input);
  });
});
