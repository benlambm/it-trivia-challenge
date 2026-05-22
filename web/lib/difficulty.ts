export type Difficulty = 'much_easier' | 'easier' | 'normal' | 'harder' | 'much_harder';

export const TIER_MIN = -2;
export const TIER_MAX = 2;

export const TIER_TO_DIFFICULTY: Record<number, Difficulty> = {
  [-2]: 'much_easier',
  [-1]: 'easier',
  0: 'normal',
  1: 'harder',
  2: 'much_harder',
};

export const TIER_LABELS: Record<number, string> = {
  [-2]: 'Much Easier',
  [-1]: 'Easier',
  0: 'Normal',
  1: 'Harder',
  2: 'Much Harder',
};

export function difficultyLabel(tier: number): string {
  return TIER_LABELS[tier] ?? TIER_LABELS[0];
}

export function scoreDelta(score: number): number {
  if (score > 20) return 1;
  if (score >= 15) return 0;
  if (score >= 10) return -1;
  return -2;
}

export function nextTier(currentTier: number, score: number): { tier: number; delta: number } {
  const raw = currentTier + scoreDelta(score);
  const tier = Math.max(TIER_MIN, Math.min(TIER_MAX, raw));
  return { tier, delta: tier - currentTier };
}

export function playAgainLabel(effectiveDelta: number): string {
  if (effectiveDelta >= 1) return 'Try a Harder Quiz';
  if (effectiveDelta === -1) return 'Try an Easier Quiz';
  if (effectiveDelta <= -2) return 'Try a Much Easier Quiz';
  return 'Play Again';
}
