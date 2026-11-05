import React, { Suspense, lazy, useState, useCallback } from 'react';
import { GameState, Question, GameResult } from './types';
import { fetchQuestions, fetchGameResults } from './services/triviaApi';
import { DEFAULT_TIER, Difficulty, TIER_TO_DIFFICULTY, replayOptions } from './lib/difficulty';
import WelcomeScreen from './components/WelcomeScreen';
import LoadingScreen from './components/LoadingScreen';
import QuizScreen from './components/QuizScreen';
import ResultsScreen from './components/ResultsScreen';
import ErrorToast from './components/ErrorToast';
import Footer from './components/Footer';

// The public stats dashboard is its own chunk so players never download it.
const StatsPage = lazy(() => import('./components/StatsPage'));

function isStatsPath(): boolean {
  return typeof window !== 'undefined' && /^\/stats\/?$/.test(window.location.pathname);
}

const App: React.FC = () => {
  if (isStatsPath()) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">Loading stats…</div>}>
        <StatsPage />
      </Suspense>
    );
  }
  return <Game />;
};

const Game: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.WELCOME);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [gameId, setGameId] = useState<string | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [difficultyTier, setDifficultyTier] = useState(DEFAULT_TIER);

  const startNewGame = useCallback(async (difficulty: Difficulty, previousQuestions: Question[] = []) => {
    setError(null);
    setGameState(GameState.LOADING_QUESTIONS);
    try {
      const quiz = await fetchQuestions(difficulty, previousQuestions);
      const newQuestions = quiz?.questions;
      if (!newQuestions || newQuestions.length === 0) {
        throw new Error("Received empty question set from API.");
      }
      setQuestions(newQuestions);
      setGameId(quiz.gameId);
      setGameState(GameState.PLAYING);
    } catch (err: any) {
      console.error("Failed to load questions", err);
      let msg = "Could not generate questions. Please check your internet connection.";
      if (err.message && err.message.includes("API Key")) {
        msg = "API Key is missing or invalid. Please configure the environment.";
      } else if (err.message) {
        msg = `Generation failed: ${err.message}`;
      }
      setError(msg);
      setGameState(GameState.WELCOME);
    }
  }, []);

  const replayAtTier = useCallback((tier: number) => {
    setDifficultyTier(tier);
    startNewGame(TIER_TO_DIFFICULTY[tier], questions);
  }, [startNewGame, questions]);

  const handleGameFinish = useCallback(async (finalScore: number) => {
    setGameState(GameState.LOADING_RESULTS);
    try {
      const result = await fetchGameResults(finalScore, questions.length, gameId);
      setGameResult(result);
      setGameState(GameState.RESULTS);
    } catch (err: any) {
      console.error("Failed to generate results", err);
      setError("Could not generate personalized results. Showing standard feedback.");
      // Fallback logic is handled inside service, so we usually won't get here unless critical failure
      // But if we do, manually set fallback
      setGameResult({
        score: finalScore,
        totalQuestions: questions.length,
        title: "IT Enthusiast",
        evaluation: "Great effort! Technology is a vast field with a place for everyone.",
        motivation: "Brightpoint Community College offers amazing pathways into IT careers. Whether you got a perfect score or are just starting, there's a class for you!"
      });
      setGameState(GameState.RESULTS);
    }
  }, [questions.length, gameId]);

  return (
    <div className="font-sans antialiased text-slate-900 relative">
      {error && (
        <ErrorToast 
          message={error} 
          onClose={() => setError(null)} 
        />
      )}

      {gameState === GameState.WELCOME && (
        <WelcomeScreen
          onStart={() => startNewGame(TIER_TO_DIFFICULTY[difficultyTier], questions)}
          difficultyTier={difficultyTier}
          onDifficultyTierChange={setDifficultyTier}
        />
      )}

      {gameState === GameState.LOADING_QUESTIONS && (
        <LoadingScreen type="questions" />
      )}

      {gameState === GameState.PLAYING && questions.length > 0 && (
        <QuizScreen 
          questions={questions} 
          onFinish={handleGameFinish} 
          replayOptions={replayOptions(difficultyTier)}
          onReplay={replayAtTier}
          onHome={() => setGameState(GameState.WELCOME)}
        />
      )}

      {gameState === GameState.LOADING_RESULTS && (
        <LoadingScreen type="results" />
      )}

      {gameState === GameState.RESULTS && gameResult && (
        <ResultsScreen
          result={gameResult}
          replayOptions={replayOptions(difficultyTier)}
          onReplay={replayAtTier}
        />
      )}

      {(gameState === GameState.WELCOME || gameState === GameState.RESULTS) && (
        <Footer />
      )}
    </div>
  );
};

export default App;