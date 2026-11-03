import React, { useEffect, useState } from 'react';
import { fetchStats } from '../services/triviaApi';
import { formatInt, isoToLocalDate, formatMonth } from '../lib/statsFormat';

interface CounterData {
  quizzes: number;
  completed: number;
  since: string | null;
}

// Footer line: live count of quizzes played, linking to the public /stats page.
// Renders nothing until the numbers arrive, or at all if the API is down.
const PlayCounter: React.FC = () => {
  const [data, setData] = useState<CounterData | null>(null);

  useEffect(() => {
    let active = true;
    fetchStats()
      .then((stats) => {
        if (!active) return;
        setData({
          quizzes: stats.players.quizzes,
          completed: stats.players.completed,
          since: stats.firstEventAt ? formatMonth(isoToLocalDate(stats.firstEventAt, stats.timeZone).slice(0, 7)) : null,
        });
      })
      .catch(() => {
        // The counter is a nice-to-have; never show an error in the footer.
      });
    return () => {
      active = false;
    };
  }, []);

  if (!data || data.quizzes === 0) return null;

  return (
    <p className="text-slate-300" data-testid="play-counter">
      <span className="text-white font-black text-lg">{formatInt(data.quizzes)}</span> quizzes played
      {data.since ? ` since ${data.since}` : ''} ·{' '}
      <span className="text-white font-semibold">{formatInt(data.completed)}</span> completed ·{' '}
      <a href="/stats" className="font-semibold text-[#E87722] hover:text-white underline-offset-4 hover:underline">
        Live stats
      </a>
    </p>
  );
};

export default PlayCounter;
