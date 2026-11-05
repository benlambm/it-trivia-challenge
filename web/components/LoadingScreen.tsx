import React, { useEffect, useState } from 'react';
import { Category } from '../types';

interface LoadingScreenProps {
  type: 'questions' | 'results';
}

const QUESTION_STEPS = [
  `Connecting to Neural Network...`,
  `Scanning ${Category.NETWORKING} protocols...`,
  `Training ${Category.AI} models...`,
  `Compiling ${Category.DEV} code...`,
  `Securing ${Category.CYBER} endpoints...`,
  `Analyzing ${Category.OPS} scenarios...`,
  `Finalizing Game Data...`,
];

const RESULT_STEPS = [
  'Calculating Score...',
  'Analyzing Performance...',
  'Drafting Career Path...',
  'Contacting Brightpoint CC...',
  'Generating Certificate...',
];

// Real question requests (nginx log, Oct-Nov 2026) take a median 26s, p90 44s,
// max 51s. Seven 7s steps reach the 95% ceiling at about 49s, so nearly every
// game finishes while the bar is still moving.
const QUESTION_STEP_MS = 7000;
const RESULT_STEP_MS = 1600;

const STAY_NOTICE =
  "Wait! Don't click Refresh. Your Trivia questions are on their way now. Please be patient and count down from 10.";
const STAY_NOTICE_MS = 10000;
// A fast flick can report its last position a little below the viewport's top edge.
const TOP_EXIT_PX = 20;

const LoadingScreen: React.FC<LoadingScreenProps> = ({ type }) => {
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('');
  const [showStayNotice, setShowStayNotice] = useState(false);
  const isQuestions = type === 'questions';

  useEffect(() => {
    const steps = isQuestions ? QUESTION_STEPS : RESULT_STEPS;
    setProgress(0);
    setLoadingText('');
    let currentStep = 0;
    const advance = () => {
      if (currentStep < steps.length) {
        setLoadingText(steps[currentStep]);
        setProgress(Math.min(((currentStep + 1) / steps.length) * 100, 95));
        currentStep++;
      }
    };
    // Question steps are long, so start the first one now rather than leave an empty bar.
    if (isQuestions) advance();
    const interval = setInterval(advance, isQuestions ? QUESTION_STEP_MS : RESULT_STEP_MS);

    return () => clearInterval(interval);
  }, [isQuestions]);

  // Leaving the page through the top edge means the cursor is heading for the
  // browser's Refresh button or tabs, which would throw away the quiz being written.
  useEffect(() => {
    if (!isQuestions) return;
    let hideTimer: ReturnType<typeof setTimeout>;
    const onMouseLeave = (event: MouseEvent) => {
      if (event.clientY > TOP_EXIT_PX) return;
      setShowStayNotice(true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setShowStayNotice(false), STAY_NOTICE_MS);
    };
    const root = document.documentElement;
    root.addEventListener('mouseleave', onMouseLeave);

    return () => {
      root.removeEventListener('mouseleave', onMouseLeave);
      clearTimeout(hideTimer);
    };
  }, [isQuestions]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      {showStayNotice && (
        <div
          role="alert"
          className="fixed top-4 left-1/2 transform -translate-x-1/2 w-11/12 max-w-xl z-50 bg-[#D63A4C] text-white px-6 py-4 rounded-2xl border-4 border-[#173A45] shadow-[8px_8px_0px_0px_rgba(23,58,69,0.4)] text-center text-xl font-bold leading-snug"
        >
          {STAY_NOTICE}
        </div>
      )}

      <div className="w-full max-w-2xl bg-white p-12 rounded-3xl border-4 border-[#173A45] shadow-[8px_8px_0px_0px_rgba(23,58,69,0.2)] text-center">
        <div className="mb-10 relative">
           {/* Animated Icon */}
           <div className="w-24 h-24 mx-auto bg-[#173A45] rounded-full border-4 border-[#E87722] flex items-center justify-center animate-bounce">
              <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
           </div>
        </div>

        <h2 className="text-4xl font-black text-[#173A45] mb-4">
          {type === 'questions' ? 'Generating Challenge' : 'Grading Performance'}
        </h2>
        
        <p className="text-[#D63A4C] h-8 mb-8 text-xl font-bold transition-all duration-300">
          {loadingText}
        </p>

        {/* Progress Bar */}
        <div className="w-full bg-slate-200 rounded-full h-6 border-2 border-[#173A45] overflow-hidden">
          <div 
            className="bg-[#E87722] h-full transition-all duration-700 ease-out"
            style={{
              width: `${progress}%`,
              // Glide for the whole step so the bar never sits still long enough to look frozen.
              ...(isQuestions && {
                transitionDuration: `${QUESTION_STEP_MS}ms`,
                transitionTimingFunction: 'linear',
              }),
            }}
          ></div>
        </div>

        {isQuestions && (
          <p className="mt-6 text-lg font-semibold text-[#173A45]">
            Gemini AI is writing new questions just for you! This may take a minute or two...
          </p>
        )}
      </div>
    </div>
  );
};

export default LoadingScreen;