export enum GameState {
  WELCOME = 'WELCOME',
  LOADING_QUESTIONS = 'LOADING_QUESTIONS',
  PLAYING = 'PLAYING',
  LOADING_RESULTS = 'LOADING_RESULTS',
  RESULTS = 'RESULTS',
  ERROR = 'ERROR'
}

export enum Category {
  NETWORKING = 'Networking & Internet',
  AI = 'Artificial Intelligence',
  DEV = 'Program and Database Development',
  CYBER = 'Cybersecurity',
  OPS = 'IT Operations and Support'
}

export interface Question {
  id: number;
  category: Category | string;
  text: string;
  options: string[];
  correctAnswer: string;
}

export interface QuizSet {
  gameId: string | null;
  questions: Question[];
}

export interface GameResult {
  score: number;
  totalQuestions: number;
  title: string;
  evaluation: string;
  motivation: string;
}

// Using arbitrary values for Brightpoint colors + Standard Tailwind for others
// Dark Blue: #173A45, Hot Red: #D63A4C, Orange: #E87722
export const CATEGORY_COLORS: Record<string, string> = {
  [Category.OPS]: 'bg-[#173A45] text-white', // Brightpoint Dark Blue
  [Category.NETWORKING]: 'bg-cyan-600 text-white',
  [Category.AI]: 'bg-purple-600 text-white',
  [Category.DEV]: 'bg-[#E87722] text-white', // Brightpoint Orange
  [Category.CYBER]: 'bg-[#D63A4C] text-white', // Brightpoint Red
};

export const CATEGORY_BG_LIGHT: Record<string, string> = {
  [Category.OPS]: 'bg-slate-100',
  [Category.NETWORKING]: 'bg-cyan-50',
  [Category.AI]: 'bg-purple-50',
  [Category.DEV]: 'bg-orange-50',
  [Category.CYBER]: 'bg-red-50',
};
// Shape of GET /api/stats (see api/analytics.js summarize()).
export interface StatsPeriod {
  quizzes: number;
  completed: number;
  abandoned: number;
  failed: number;
  devices: number;
  geminiCalls: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cachedTokens: number;
  costWebUsd: number;
  costOtherUsd: number;
  costUsd: number;
  costTracked: boolean;
}

export interface PublicStats {
  generatedAt: string;
  timeZone: string;
  firstEventAt: string | null;
  trackingStartedAt: string | null;
  backfill: { source: string; from: string; to: string; quizzes: number; completed: number; note: string } | null;
  players: {
    quizzes: number;
    completed: number;
    completionRate: number | null;
    abandoned: number;
    failed: number;
    devices: number;
    sessions: number;
    replaySessions: number;
    replayRate: number | null;
    avgGamesPerSession: number | null;
    scoredGames: number;
    avgScorePct: number | null;
  };
  generation: { samples: number; p50Ms: number | null; p95Ms: number | null };
  gemini: {
    calls: number;
    failedCalls: number;
    retries: number;
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    cachedTokens: number;
    costUsd: number;
    costBySource: { web: number; script: number; test: number };
    costByFlow: { questions: number; results: number };
    costPerQuizUsd: number | null;
    costPerCompletedGameUsd: number | null;
  };
  difficulty: Array<{ difficulty: string; label: string; quizzes: number; completed: number; avgScorePct: number | null }>;
  moves: { easier: number; same: number; harder: number };
  scoreBuckets: Array<{ label: string; count: number }>;
  daily: Array<StatsPeriod & { date: string }>;
  monthly: Array<StatsPeriod & { month: string }>;
  pricing: {
    model: string;
    inputPerMillion: number;
    outputPerMillion: number;
    since: string;
    next: { from: string; inputPerMillion: number; outputPerMillion: number } | null;
    source: string;
  } | null;
}
