import React from 'react';
import { Category, CATEGORY_COLORS } from '../types';

interface WelcomeScreenProps {
  onStart: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart }) => {
  const categories = Object.values(Category);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-3xl w-full bg-white rounded-3xl overflow-hidden border-4 border-[#173A45] shadow-[8px_8px_0px_0px_rgba(23,58,69,0.2)]">
        
        {/* Header Section */}
        <div className="bg-[#173A45] p-10 text-center relative overflow-hidden border-b-4 border-[#173A45]">
          <h1 className="relative z-10 text-5xl md:text-7xl font-extrabold text-white mb-6 tracking-tight">
            IT Trivia <span className="text-[#E87722]">Challenge</span>
          </h1>
          <p className="relative z-10 text-slate-200 text-xl md:text-2xl font-medium max-w-2xl mx-auto">
            Master the tech industry. Test your skills. Build your future.
          </p>
        </div>

        {/* Categories Grid */}
        <div className="p-8 md:p-12">
          <h2 className="text-[#173A45] font-black text-center mb-8 uppercase tracking-widest text-lg md:text-xl border-b-2 border-slate-200 pb-4 inline-block mx-auto">
            Your Mission
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
            {categories.map((cat, idx) => (
              <div key={idx} className="flex items-center p-4 rounded-xl bg-white border-2 border-[#173A45] hover:bg-slate-50 transition-colors">
                <div className={`w-5 h-5 rounded-full mr-4 border-2 border-white ring-2 ring-[#173A45] ${CATEGORY_COLORS[cat].split(' ')[0]}`}></div>
                <span className="text-[#173A45] font-bold text-lg md:text-xl">{cat}</span>
              </div>
            ))}
          </div>

          {/* Action */}
          <button
            onClick={onStart}
            className="w-full group relative flex items-center justify-center py-6 px-8 text-2xl font-black rounded-2xl text-white bg-[#E87722] hover:bg-[#D63A4C] border-4 border-[#173A45] transition-all transform hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#173A45] active:translate-y-0 active:shadow-none"
          >
            Start New Game
            <svg className="ml-3 w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
          
          <div className="mt-8 flex items-center justify-center space-x-2">
            <span className="h-2 w-2 bg-[#D63A4C] rounded-full animate-pulse"></span>
            <p className="text-center text-sm md:text-base font-bold text-[#173A45] opacity-60">
              Powered by Google Gemini Intelligence
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;