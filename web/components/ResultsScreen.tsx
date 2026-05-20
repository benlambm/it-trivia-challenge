import React, { useEffect, useRef } from 'react';
import { GameResult } from '../types';

interface ResultsScreenProps {
  result: GameResult;
  onPlayAgain: () => void;
}

const ResultsScreen: React.FC<ResultsScreenProps> = ({ result, onPlayAgain }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Confetti effect
  useEffect(() => {
    if (result.score / result.totalQuestions > 0.5) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      const particles: any[] = [];
      const colors = ['#E87722', '#D63A4C', '#173A45', '#10b981', '#f59e0b'];

      for (let i = 0; i < 150; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height - canvas.height,
          size: Math.random() * 8 + 4,
          color: colors[Math.floor(Math.random() * colors.length)],
          speedY: Math.random() * 3 + 2,
          speedX: Math.random() * 2 - 1
        });
      }

      const animate = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach((p) => {
          p.y += p.speedY;
          p.x += p.speedX;
          if (p.y > canvas.height) {
            p.y = -20;
            p.x = Math.random() * canvas.width;
          }
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });
        requestAnimationFrame(animate);
      };

      animate();
    }
  }, [result.score, result.totalQuestions]);

  const percentage = Math.round((result.score / result.totalQuestions) * 100);

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden flex flex-col items-center p-4">
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0" />
      
      <div className="w-full max-w-4xl z-10 flex-1 flex flex-col justify-center my-8">
        <div className="bg-white rounded-3xl overflow-hidden border-4 border-[#173A45] shadow-[12px_12px_0px_0px_rgba(23,58,69,0.2)] animate-[fadeIn_0.5s_ease-out]">
          
          {/* Score Header */}
          <div className="bg-[#173A45] text-white p-10 text-center relative border-b-4 border-[#173A45]">
             <p className="text-[#E87722] uppercase tracking-[0.2em] text-lg font-bold mb-2">Final Score</p>
             <div className="text-8xl md:text-9xl font-black mb-6 tracking-tighter">
               {percentage}%
             </div>
             <p className="text-3xl font-bold">{result.score} / {result.totalQuestions} Correct</p>
          </div>

          <div className="p-8 md:p-12">
            {/* Title & Eval */}
            <div className="text-center mb-12 border-b-2 border-slate-100 pb-10">
              <h2 className="text-4xl md:text-5xl font-black text-[#173A45] mb-4">{result.title}</h2>
              <p className="text-2xl md:text-3xl text-slate-600 font-medium italic">"{result.evaluation}"</p>
            </div>

            {/* Brightpoint Pitch */}
            <div className="bg-orange-50 rounded-2xl p-8 mb-10 border-4 border-[#E87722]">
              <div className="flex flex-col md:flex-row items-start">
                <div className="flex-shrink-0 mb-4 md:mb-0 md:mr-6">
                  <div className="w-16 h-16 bg-[#E87722] rounded-full flex items-center justify-center text-white font-black text-3xl border-4 border-[#173A45]">
                    !
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-black text-[#173A45] mb-3">Your Future in IT Starts Here</h3>
                  <p className="text-[#173A45] leading-relaxed text-lg font-medium">
                    {result.motivation}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <button
              onClick={onPlayAgain}
              className="w-full py-6 bg-[#173A45] text-white rounded-2xl font-black text-2xl hover:bg-[#E87722] transition-colors border-4 border-[#173A45] hover:shadow-[4px_4px_0px_0px_#173A45]"
            >
              Play Again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultsScreen;