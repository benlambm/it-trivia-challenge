import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_TIER,
  difficultyLabel,
  replayOptions,
  TIER_MAX,
  TIER_MIN,
  TIER_TO_DIFFICULTY,
} from './difficulty';

describe('default tier', () => {
  it('starts one notch below Normal', () => {
    expect(DEFAULT_TIER).toBe(-1);
    expect(DEFAULT_DIFFICULTY).toBe('easier');
    expect(difficultyLabel(DEFAULT_TIER)).toBe('Easier');
  });
});

describe('replayOptions', () => {
  it('offers easier, same and harder from a middle tier, in that order', () => {
    expect(replayOptions(0)).toEqual([
      { kind: 'easier', label: 'Try an Easier Quiz', tier: -1 },
      { kind: 'same', label: 'Play Again', tier: 0 },
      { kind: 'harder', label: 'Try a Harder Quiz', tier: 1 },
    ]);
  });

  it('drops the easier option at Much Easier', () => {
    expect(replayOptions(TIER_MIN).map((o) => o.kind)).toEqual(['same', 'harder']);
  });

  it('drops the harder option at Much Harder', () => {
    expect(replayOptions(TIER_MAX).map((o) => o.kind)).toEqual(['easier', 'same']);
  });

  it('keeps Play Again on the current tier and steps exactly one tier each way', () => {
    for (let tier = TIER_MIN; tier <= TIER_MAX; tier++) {
      const byKind = Object.fromEntries(replayOptions(tier).map((o) => [o.kind, o.tier]));
      expect(byKind.same).toBe(tier);
      if (tier > TIER_MIN) expect(byKind.easier).toBe(tier - 1);
      if (tier < TIER_MAX) expect(byKind.harder).toBe(tier + 1);
    }
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

describe('difficultyLabel', () => {
  it.each([
    [-2, 'Much Easier'],
    [-1, 'Easier'],
    [0, 'Normal'],
    [1, 'Harder'],
    [2, 'Much Harder'],
  ])('tier %i → "%s"', (tier, expected) => {
    expect(difficultyLabel(tier)).toBe(expected);
  });

  it('falls back to Normal for unknown tiers', () => {
    expect(difficultyLabel(99)).toBe('Normal');
  });
});
