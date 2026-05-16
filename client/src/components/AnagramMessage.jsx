import React from 'react';
import { getVibeById } from '../utils/vibes';

const AnagramMessage = ({ message, currentUser, onJoin, onSolo, onLaunch, roomVibe }) => {
  const { gameData } = message;
  const vibe = getVibeById(roomVibe);
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const currentNickname = currentUser?.nickname;

  const isHost = gameData.host?.id === currentUserId || (currentNickname && gameData.host?.name === currentNickname);
  const isChallenger = gameData.challenger?.id === currentUserId || (currentNickname && gameData.challenger?.name === currentNickname);
  const isPlayer = isHost || isChallenger;
  const canJoin = !gameData.challenger && !isHost && gameData.status === 'waiting';
  const canSolo = isHost && gameData.status === 'waiting' && !gameData.challenger;
  const isLive = gameData.status === 'playing';
  const isFinished = gameData.status === 'finished';
  const winnerName = gameData.winner === 'host' ? gameData.host?.name : gameData.challenger?.name;

  return (
    <div className={`w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-2xl shadow-lg border border-black/10 dark:border-white/10`}>
      {/* Header */}
      <div className={`p-2.5 sm:p-3 ${vibe.accentClass} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-white text-base">🔤</span>
          <h3 className="text-white font-bold text-xs sm:text-sm">Word Duel</h3>
        </div>
        {canJoin && (
          <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-2 py-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[9px] font-black text-white uppercase tracking-tighter">Open</span>
          </div>
        )}
        {isLive && (
          <div className="flex items-center gap-1.5 bg-green-400/30 rounded-full px-2 py-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[9px] font-black text-green-200 uppercase tracking-tighter">Live</span>
          </div>
        )}
        {isFinished && <span className="text-lg">🏆</span>}
      </div>

      {/* Body */}
      <div className="bg-white dark:bg-gray-900 px-3 py-2.5 space-y-2">
        {/* Players */}
        <div className="flex items-center justify-between text-[11px] font-bold text-gray-700 dark:text-gray-300">
          <span>{gameData.host?.name || '?'}</span>
          <span className="text-gray-400">vs</span>
          <span>{gameData.challenger?.name || '???'}</span>
        </div>

        {/* Scores */}
        {(isLive || isFinished) && (
          <div className="flex items-center justify-between">
            <span className="text-lg font-black" style={{ color: 'var(--vibe-primary, #6366f1)' }}>{gameData.scores?.host ?? 0}</span>
            <span className="text-[9px] text-gray-400 uppercase tracking-widest">Round {gameData.round}/{gameData.totalRounds}</span>
            <span className="text-lg font-black text-amber-500">{gameData.scores?.challenger ?? 0}</span>
          </div>
        )}

        {/* Scrambled preview */}
        {isLive && gameData.currentScrambled && (
          <div className="flex gap-1 flex-wrap justify-center py-1">
            {gameData.currentScrambled.split('').map((l, i) => (
              <span key={i} className="w-6 h-7 rounded flex items-center justify-center text-xs font-black text-white"
                style={{ background: 'var(--vibe-primary, #6366f1)', opacity: 0.85 + i * 0.015 }}>
                {l.toUpperCase()}
              </span>
            ))}
          </div>
        )}

        {/* CTA */}
        {canJoin && (
          <button onClick={() => onJoin(message.id)}
            className={`w-full py-2.5 rounded-xl ${vibe.accentClass} text-white font-black text-xs uppercase tracking-widest shadow-md hover:scale-[1.02] active:scale-95 transition-all`}>
            Join Duel
          </button>
        )}
        {canSolo && (
          <button onClick={() => onSolo(message.id)}
            className="w-full py-2 rounded-xl bg-gray-700 text-white font-black text-xs uppercase tracking-widest shadow hover:scale-[1.02] active:scale-95 transition-all">
            🤖 Play Solo
          </button>
        )}
        {!canJoin && !isFinished && (
          <button onClick={() => onLaunch(message)}
            className="w-full py-2 rounded-xl bg-gray-900 dark:bg-black text-white font-black text-xs uppercase tracking-widest shadow-md hover:scale-[1.02] active:scale-95 transition-all">
            {isPlayer ? 'Open Game' : '👁 Spectate'}
          </button>
        )}

        {/* Winner */}
        {isFinished && (
          <div className="w-full py-2.5 rounded-xl text-center font-black text-[11px] bg-amber-500 text-white shadow-md">
            🏆 {winnerName} wins!
          </div>
        )}
        {isFinished && (
          <button onClick={() => onLaunch(message)}
            className="w-full py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold text-[10px] uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-700 transition-all">
            View Recap
          </button>
        )}
      </div>
    </div>
  );
};

export default AnagramMessage;
