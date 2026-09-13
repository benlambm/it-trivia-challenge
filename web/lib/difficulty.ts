export type Difficulty = 'much_easier' | 'easier' | 'normal' | 'harder' | 'much_harder';

export const TIER_MIN = -2;
export const TIER_MAX = 2;

// Students start one notch below Normal so the first quiz is approachable.
export const DEFAULT_TIER = -1;

export const TIER_TO_DIFFICULTY: Record<number, Difficulty> = {
  [-2]: 'much_easier',
  [-1]: 'easier',
  0: 'normal',
  1: 'harder',
  2: 'much_harder',
};

export const DEFAULT_DIFFICULTY: Difficulty = TIER_TO_DIFFICULTY[DEFAULT_TIER];

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

export type ReplayKind = 'easier' | 'same' | 'harder';

export interface ReplayOption {
  kind: ReplayKind;
  label: string;
  tier: number;
}

// Replay choices offered after a quiz: one step easier, the same tier, and one
// step harder. A step past either end of the scale is omitted, not clamped.
export function replayOptions(currentTier: number): ReplayOption[] {
  const options: ReplayOption[] = [];
  if (currentTier > TIER_MIN) {
    options.push({ kind: 'easier', label: 'Try an Easier Quiz', tier: currentTier - 1 });
  }
  options.push({ kind: 'same', label: 'Play Again', tier: currentTier });
  if (currentTier < TIER_MAX) {
    options.push({ kind: 'harder', label: 'Try a Harder Quiz', tier: currentTier + 1 });
  }
  return options;
}
