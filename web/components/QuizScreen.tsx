import React, { useState, useEffect } from 'react';
import { Question, CATEGORY_COLORS, Category } from '../types';

interface QuizScreenProps {
  questions: Question[];
  onFinish: (score: number) => void;
}

// Fun messages for the loading screens
const CATEGORY_INTRO_MESSAGES: Record<string, string> = {
  [Category.NETWORKING]: "Connecting the world at light speed! Get ready for clouds and cables. 🌐",
  [Category.AI]: "Unlocking the power of machine minds! Neural networks incoming. 🤖",
  [Category.DEV]: "Building the future, one line of code at a time! Logic is your superpower. 💻",
  [Category.CYBER]: "Defending the digital frontier! Hackers and firewalls await. 🛡️",
  [Category.OPS]: "Solving real-world tech mysteries! Keep the systems running. 🔧"
};

const QuizScreen: React.FC<QuizScreenProps> = ({ questions, onFinish }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  
  // Intro Screen State
  const [showIntro, setShowIntro] = useState(true);
  const [countdown, setCountdown] = useState(5);

  const currentQuestion = questions[currentIndex];
  
  // Update to 5 questions per category
  const questionsPerCategory = 5;
  const currentCategoryIndex = Math.floor(currentIndex / questionsPerCategory);
  const totalCategories = 5;
  
  // Categories ordered list for the progress bar
  const orderedCategories = [
    Category.NETWORKING,
    Category.AI,
    Category.DEV,
    Category.CYBER,
    Category.OPS
  ];

  // Handle Countdown
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (showIntro && countdown > 0) {
      timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    } else if (showIntro && countdown === 0) {
      setShowIntro(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [showIntro, countdown]);

  const handleOptionClick = (option: string) => {
    if (isAnswered) return;

    setSelectedOption(option);
    setIsAnswered(true);

    const isCorrect = option === currentQuestion.correctAnswer;
    if (isCorrect) {
      setScore(prev => prev + 1);
    }

    setTimeout(() => {
      const nextIndex = currentIndex + 1;
      
      if (nextIndex < questions.length) {
        // Check if entering a new category
        if (nextIndex % questionsPerCategory === 0) {
          setShowIntro(true);
          setCountdown(5);
        }
        setCurrentIndex(nextIndex);
        setSelectedOption(null);
        setIsAnswered(false);
      } else {
        onFinish(isCorrect ? score + 1 : score);
      }
    }, 1500);
  };

  const categoryColorClass = CATEGORY_COLORS[currentQuestion.category] || 'bg-[#173A45] text-white';

  // --- Render Intro Screen ---
  if (showIntro) {
    const introCategory = orderedCategories[currentCategoryIndex] || currentQuestion.category;
    const introColor = CATEGORY_COLORS[introCategory] || 'bg-[#173A45] text-white';
    const introMessage = CATEGORY_INTRO_MESSAGES[introCategory] || "Get Ready!";
    
    return (
      <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center ${introColor} transition-all duration-500`}>
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/circuit-board.png')]"></div>
        
        <div className="z-10 text-center animate-[slideUp_0.5s_ease-out] p-6 max-w-4xl mx-auto">
          <p className="text-xl md:text-2xl uppercase tracking-[0.3em] font-bold mb-4 text-white/80">
            Sector {currentCategoryIndex + 1} of {totalCategories}
          </p>
          <h1 className="text-5xl md:text-7xl font-black text-white mb-6 drop-shadow-lg leading-tight">
            {introCategory}
          </h1>
          
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 md:p-8 mb-8 border-2 border-white/20 transform rotate-1">
             <p className="text-white text-2xl md:text-3xl font-bold italic leading-relaxed">
               "{introMessage}"
             </p>
          </div>
          
          <div className="w-24 h-24 mx-auto rounded-full border-8 border-white flex items-center justify-center mb-8 relative">
             <span className="text-5xl font-black text-white animate-ping absolute opacity-20">{countdown}</span>
             <span className="text-5xl font-black text-white relative z-10">{countdown}</span>
          </div>
          
          <p className="text-white text-lg font-bold animate-pulse tracking-widest uppercase">Initializing Challenge...</p>
        </div>
        
        {/* Skip button for impatient users */}
        <button 
          onClick={() => setShowIntro(false)}
          className="absolute bottom-10 px-6 py-2 border-2 border-white/30 text-white/60 rounded-full hover:bg-white/10 hover:text-white transition-colors"
        >
          Skip Intro
        </button>
      </div>
    );
  }

  // --- Render Quiz Screen ---
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Enhanced Progress Header */}
      <div className="bg-white shadow-sm border-b-4 border-[#173A45] sticky top-0 z-40">
        {/* Top Row: Categories */}
        <div className="flex w-full h-16 md:h-20">
          {orderedCategories.map((cat, idx) => {
            const isActive = idx === currentCategoryIndex;
            const isCompleted = idx < currentCategoryIndex;
            const baseColor = CATEGORY_COLORS[cat].split(' ')[0]; // Extract bg class
            
            return (
              <div 
                key={idx}
                className={`flex-1 flex flex-col items-center justify-center relative transition-all duration-300 border-r border-slate-100 last:border-r-0
                  ${isActive ? 'bg-slate-100 flex-[1.5]' : 'bg-white'}
                `}
              >
                {/* Active Indicator Line */}
                {isActive && (
                  <div className={`absolute top-0 left-0 right-0 h-1.5 ${baseColor}`} />
                )}
                
                {/* Mobile: Number only / Desktop: Icon + Text */}
                <div className={`
                  flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full text-xs md:text-sm font-bold mb-1
                  ${isActive ? `${baseColor} text-white shadow-md scale-110` : isCompleted ? `${baseColor} text-white opacity-60` : 'bg-slate-200 text-slate-400'}
                `}>
                  {isCompleted ? '✓' : idx + 1}
                </div>
                
                <span className={`
                  hidden md:block text-[10px] uppercase font-black tracking-wider text-center px-1
                  ${isActive ? 'text-[#173A45]' : 'text-slate-300'}
                `}>
                  {cat.split(' ')[0]} {/* Show first word only for space */}
                </span>
              </div>
            );
          })}
        </div>

        {/* Sub-header: Current Status */}
        <div className={`${categoryColorClass} px-6 py-3 flex items-center justify-between transition-colors duration-500`}>
           <div className="flex flex-col">
             <span className="text-[10px] uppercase tracking-widest opacity-80 font-bold">Current Sector</span>
             <span className="text-lg md:text-xl font-black leading-none">{currentQuestion.category}</span>
           </div>
           
           <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="block text-[10px] uppercase tracking-widest opacity-80 font-bold">Progress</span>
                <span className="font-bold">{currentIndex + 1} / {questions.length}</span>
              </div>
              <div className="h-8 w-[1px] bg-white/30"></div>
              <div className="text-right">
                 <span className="block text-[10px] uppercase tracking-widest opacity-80 font-bold">Score</span>
                 <span className="font-black text-xl">
                   {score} <span className="text-sm opacity-60">pts</span>
                 </span>
              </div>
           </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-10 max-w-5xl mx-auto w-full animate-[fadeIn_0.5s_ease-out]">
        
        {/* Question Card */}
        <div className="w-full mb-8 md:mb-12">
           <div className="inline-block px-3 py-1 bg-slate-200 text-slate-600 rounded-lg text-xs font-bold uppercase tracking-wider mb-4">
             Question {(currentIndex % questionsPerCategory) + 1} of {questionsPerCategory}
           </div>
           <h2 className="text-2xl md:text-4xl font-black text-[#173A45] leading-snug drop-shadow-sm">
             {currentQuestion.text}
           </h2>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full">
          {currentQuestion.options.map((option, idx) => {
            let buttonStyle = "bg-white border-4 border-[#173A45] text-[#173A45] shadow-[4px_4px_0px_0px_#173A45]";
            
            if (isAnswered) {
              if (option === currentQuestion.correctAnswer) {
                // Correct
                buttonStyle = "bg-[#10b981] border-4 border-[#173A45] text-white shadow-[4px_4px_0px_0px_#173A45] scale-[1.02]";
              } else if (option === selectedOption) {
                 // Wrong
                 buttonStyle = "bg-[#D63A4C] border-4 border-[#173A45] text-white shadow-[4px_4px_0px_0px_#173A45] opacity-90";
              } else {
                // Unselected
                buttonStyle = "bg-slate-100 border-4 border-slate-300 text-slate-400 opacity-60 shadow-none";
              }
            } else {
              // Hover state for unanswered
              buttonStyle += " hover:-translate-y-1 hover:bg-[#E87722] hover:text-white hover:border-[#173A45] hover:shadow-[6px_6px_0px_0px_#173A45]";
            }

            return (
              <button
                key={idx}
                onClick={() => handleOptionClick(option)}
                disabled={isAnswered}
                className={`
                  relative p-5 md:p-8 rounded-2xl text-lg md:text-xl font-bold text-left transition-all duration-200 transform
                  ${buttonStyle}
                  active:translate-y-0 active:shadow-none
                `}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="leading-tight">{option}</span>
                  {isAnswered && option === currentQuestion.correctAnswer && (
                    <div className="flex-shrink-0 bg-white rounded-full p-1">
                      <svg className="w-5 h-5 text-[#10b981]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {isAnswered && option === selectedOption && option !== currentQuestion.correctAnswer && (
                    <div className="flex-shrink-0 bg-white/20 rounded-full p-1">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default QuizScreen;