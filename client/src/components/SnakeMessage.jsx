import React from 'react';
import { Trophy } from 'lucide-react';
import { getVibeById } from '../utils/vibes';

const SnakeMessage = ({ message, currentUser, onJoin, onSpectate, onLaunch, roomVibe }) => {
  const { gameData } = message;
  const vibe = getVibeById(roomVibe);
  const userId = currentUser?.id || currentUser?.socketId;
  const nickname = currentUser?.nickname;

  const isMember   = gameData.players?.some(p => p.id === userId || (nickname && p.name === nickname));
  const isHost     = gameData.hostId === userId;
  const isFinished = gameData.status === 'finished';
  const isLive     = gameData.status === 'playing';
  const isWaiting  = gameData.status === 'waiting';
  const isSolo     = !!gameData.soloMode;

  const scores = gameData.scores || {};
  const sortedPlayers = (gameData.players || []).slice().sort((a,b) => (scores[b.id]||0) - (scores[a.id]||0));

  return (
    <div className="w-full max-w-[220px] overflow-hidden rounded-2xl shadow-lg border border-black/10 dark:border-white/10">
      <div className={`p-2.5 ${vibe.accentClass} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-white text-base">🐍</span>
          <h3 className="text-white font-bold text-xs sm:text-sm">
            Snake{isSolo ? ' — Solo' : ''}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {isWaiting && (
            <div className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-[9px] font-black text-white">Open</span>
            </div>
          )}
          {isLive && (
            <div className="flex items-center gap-1 bg-green-400/30 rounded-full px-2 py-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[9px] font-black text-green-200">Live</span>
            </div>
          )}
          {isFinished && <Trophy className="w-4 h-4 text-yellow-300" />}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 px-3 py-2.5">
        <div className="space-y-1">
          {sortedPlayers.slice(0, 3).map((p, i) => (
            <div key={p.id} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {i === 0 && isFinished && <Trophy className="w-3 h-3 text-yellow-500" />}
                <span className="text-xs font-semibold truncate max-w-[120px] text-gray-800 dark:text-gray-200">
                  {p.name}{p.id === userId ? ' (you)' : ''}
                </span>
              </div>
              <span className="text-xs font-black tabular-nums text-gray-600 dark:text-gray-400">
                {scores[p.id] ?? 0}
              </span>
            </div>
          ))}
          {sortedPlayers.length === 0 && (
            <p className="text-xs text-gray-400 italic">No players yet</p>
          )}
        </div>
        {isFinished && gameData.winner && (
          <p className="text-[10px] font-black text-yellow-600 dark:text-yellow-400 text-center mt-1">
            🏆 {gameData.winner.name} wins!
          </p>
        )}
      </div>

      <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-2 flex gap-2">
        {isWaiting && !isMember && (
          <button onClick={() => onJoin?.(message.id)} className={`flex-1 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity`}>
            Join
          </button>
        )}
        {isMember && !isFinished && (
          <button onClick={() => onLaunch?.(message)} className={`flex-1 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity`}>
            Open
          </button>
        )}
        {!isMember && !isWaiting && (
          <button onClick={() => onSpectate?.(message)} className="flex-1 py-1.5 text-xs font-black rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:opacity-90 transition-opacity">
            {isFinished ? '📋 Review' : '👁 Watch'}
          </button>
        )}
      </div>
    </div>
  );
};

export default SnakeMessage;
