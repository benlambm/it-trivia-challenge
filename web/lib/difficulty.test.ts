import { describe, it, expect } from 'vitest';
import { nextTier, playAgainLabel, scoreDelta, TIER_TO_DIFFICULTY } from './difficulty';

describe('scoreDelta', () => {
  it.each([
    [0, -2],
    [9, -2],
    [10, -1],
    [14, -1],
    [15, 0],
    [20, 0],
    [21, 1],
    [25, 1],
  ])('score %i → delta %i', (score, expected) => {
    expect(scoreDelta(score)).toBe(expected);
  });
});

describe('nextTier', () => {
  it('moves up from 0 on a >20 score', () => {
    expect(nextTier(0, 23)).toEqual({ tier: 1, delta: 1 });
  });

  it('clamps at +2 when already at +2 and scoring >20', () => {
    expect(nextTier(2, 25)).toEqual({ tier: 2, delta: 0 });
  });

  it('clamps at -2 when already at -2 and scoring <10', () => {
    expect(nextTier(-2, 3)).toEqual({ tier: -2, delta: 0 });
  });

  it('drops two tiers from 0 on a <10 score', () => {
    expect(nextTier(0, 5)).toEqual({ tier: -2, delta: -2 });
  });

  it('partial clamp on -2 step from tier -1', () => {
    expect(nextTier(-1, 4)).toEqual({ tier: -2, delta: -1 });
  });

  it('mid-score keeps the tier where it is', () => {
    expect(nextTier(1, 17)).toEqual({ tier: 1, delta: 0 });
  });
});

describe('playAgainLabel', () => {
  it.each([
    [1, 'Try a Harder Quiz'],
    [0, 'Play Again'],
    [-1, 'Try an Easier Quiz'],
    [-2, 'Try a Much Easier Quiz'],
  ])('delta %i → "%s"', (delta, expected) => {
    expect(playAgainLabel(delta)).toBe(expected);
  });
});

describe('TIER_TO_DIFFICULTY', () => {
  it('maps every tier in [-2, +2] to a difficulty string', () => {
    expect(TIER_TO_DIFFICULTY[-2]).toBe('much_easier');
    expect(TIER_TO_DIFFICULTY[-1]).toBe('easier');
    expect(TIER_TO_DIFFICULTY[0]).toBe('normal');
    expect(TIER_TO_DIFFICULTY[1]).toBe('harder');
    expect(TIER_TO_DIFFICULTY[2]).toBe('much_harder');
  });
});
