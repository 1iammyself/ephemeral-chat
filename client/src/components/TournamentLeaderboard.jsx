import React from 'react';
import { Crown, Medal } from 'lucide-react';

const TournamentLeaderboard = ({ standings = [], rounds = [], currentUserId, accentColor }) => {
  // Sort standings by points (desc), then wins (desc)
  const sorted = [...standings].sort((a, b) => b.points - a.points || b.wins - a.wins);

  const totalRounds = rounds.length;
  const completedRounds = rounds.filter(r => r.every(m => m.winner || m.status === 'completed')).length;

  return (
    <div className="pt-2">
      <div className="text-[10px] text-gray-400 dark:text-gray-500 text-center mb-2">
        Round {completedRounds}/{totalRounds}
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_40px_40px_40px_50px] gap-1 px-2 py-1 bg-gray-50 dark:bg-gray-700/50 text-[9px] sm:text-[10px] font-bold text-gray-500 dark:text-gray-400">
          <span className="w-5 text-center">#</span>
          <span>Player</span>
          <span className="text-center">W</span>
          <span className="text-center">L</span>
          <span className="text-center">D</span>
          <span className="text-center">Pts</span>
        </div>

        {/* Rows */}
        {sorted.map((entry, idx) => {
          const isMe = entry.playerId === currentUserId;
          const rank = idx + 1;
          return (
            <div
              key={entry.playerId}
              className={`grid grid-cols-[auto_1fr_40px_40px_40px_50px] gap-1 px-2 py-1.5 border-t border-gray-100 dark:border-gray-700 text-xs ${
                isMe ? `bg-${accentColor}-50/50 dark:bg-${accentColor}-900/10` : ''
              }`}
            >
              <span className="w-5 text-center font-bold text-gray-400 dark:text-gray-500 flex items-center justify-center">
                {rank === 1 ? <Crown className="w-3.5 h-3.5 text-amber-500" /> :
                 rank === 2 ? <Medal className="w-3.5 h-3.5 text-gray-400" /> :
                 rank === 3 ? <Medal className="w-3.5 h-3.5 text-amber-700" /> :
                 rank}
              </span>
              <span className={`truncate ${isMe ? `font-bold text-${accentColor}-700 dark:text-${accentColor}-300` : 'text-gray-700 dark:text-gray-300'}`}>
                {entry.nickname}
              </span>
              <span className="text-center text-green-600 dark:text-green-400 font-bold">{entry.wins}</span>
              <span className="text-center text-red-500 dark:text-red-400">{entry.losses}</span>
              <span className="text-center text-gray-500 dark:text-gray-400">{entry.draws}</span>
              <span className={`text-center font-bold text-${accentColor}-600 dark:text-${accentColor}-400`}>{entry.points}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TournamentLeaderboard;
