import React, { useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GameState, Question, GameResult } from './types';
import { generateQuestions, generateGameResults } from './services/geminiService';
import WelcomeScreen from './components/WelcomeScreen';
import LoadingScreen from './components/LoadingScreen';
import QuizScreen from './components/QuizScreen';
import ResultsScreen from './components/ResultsScreen';
import ErrorToast from './components/ErrorToast';
import Footer from './components/Footer';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.WELCOME);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startNewGame = useCallback(async () => {
    setError(null);
    setGameState(GameState.LOADING_QUESTIONS);
    try {
      const newQuestions = await generateQuestions();
      if (!newQuestions || newQuestions.length === 0) {
        throw new Error("Received empty question set from API.");
      }
      setQuestions(newQuestions);
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

  const handleGameFinish = useCallback(async (finalScore: number) => {
    setGameState(GameState.LOADING_RESULTS);
    try {
      const result = await generateGameResults(finalScore, questions.length);
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
  }, [questions.length]);

  return (
    <div className="font-sans antialiased text-slate-900 relative">
      {error && (
        <ErrorToast 
          message={error} 
          onClose={() => setError(null)} 
        />
      )}

      {gameState === GameState.WELCOME && (
        <WelcomeScreen onStart={startNewGame} />
      )}

      {gameState === GameState.LOADING_QUESTIONS && (
        <LoadingScreen type="questions" />
      )}

      {gameState === GameState.PLAYING && questions.length > 0 && (
        <QuizScreen 
          questions={questions} 
          onFinish={handleGameFinish} 
        />
      )}

      {gameState === GameState.LOADING_RESULTS && (
        <LoadingScreen type="results" />
      )}

      {gameState === GameState.RESULTS && gameResult && (
        <ResultsScreen 
          result={gameResult} 
          onPlayAgain={() => setGameState(GameState.WELCOME)} 
        />
      )}

      {(gameState === GameState.WELCOME || gameState === GameState.RESULTS) && (
        <Footer />
      )}
    </div>
  );
};

export default App;