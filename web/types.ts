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