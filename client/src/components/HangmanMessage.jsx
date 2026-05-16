import React from 'react';
import { getVibeById } from '../utils/vibes';

const HangmanMessage = ({ message, currentUser, onJoin, onSolo, onLaunch, roomVibe }) => {
  const { gameData } = message;
  const vibe = getVibeById(roomVibe);
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const currentNickname = currentUser?.nickname;

  const isWordmaster = gameData.wordmaster?.id === currentUserId || (currentNickname && gameData.wordmaster?.name === currentNickname);
  const isGuesser = gameData.guesser?.id === currentUserId || (currentNickname && gameData.guesser?.name === currentNickname);
  const isPlayer = isWordmaster || isGuesser;
  const canJoin = !gameData.guesser && !isWordmaster && gameData.status === 'waiting';
  const canSolo = isWordmaster && gameData.status === 'waiting' && !gameData.guesser;
  const isLive = gameData.status === 'playing' || gameData.status === 'picking';
  const isFinished = gameData.status === 'finished';
  const wrong = gameData.wrongGuesses?.length || 0;
  const maxWrong = gameData.maxWrong || 6;

  return (
    <div className={`w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-2xl shadow-lg border border-black/10 dark:border-white/10`}>
      {/* Header */}
      <div className={`p-2.5 sm:p-3 ${vibe.accentClass} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-white text-base">🪤</span>
          <h3 className="text-white font-bold text-xs sm:text-sm">Word Trap</h3>
        </div>
        {canJoin && (
          <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-2 py-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[9px] font-black text-white uppercase tracking-tighter">Open</span>
          </div>
        )}
        {isLive && !isFinished && (
          <div className="flex items-center gap-1.5 bg-green-400/30 rounded-full px-2 py-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[9px] font-black text-green-200 uppercase tracking-tighter">Live</span>
          </div>
        )}
        {isFinished && <span className="text-lg">{gameData.winner === 'guesser' ? '🎉' : '💀'}</span>}
      </div>

      {/* Body */}
      <div className="bg-white dark:bg-gray-900 px-3 py-2.5 space-y-2">
        {/* Players */}
        <div className="flex items-center justify-between text-[11px] font-bold text-gray-700 dark:text-gray-300">
          <div className="flex items-center gap-1">
            <span>🎭</span>
            <span>{gameData.wordmaster?.name || '?'}</span>
          </div>
          <span className="text-gray-400">vs</span>
          <div className="flex items-center gap-1">
            <span>{gameData.guesser?.name || '???'}</span>
            <span>🔍</span>
          </div>
        </div>

        {/* Word blanks preview */}
        {(isLive || isFinished) && gameData.wordLength > 0 && (
          <div className="flex gap-1 flex-wrap py-1">
            {(gameData.revealedLetters || Array(gameData.wordLength).fill(null)).map((l, i) => (
              <span key={i} className="w-5 h-6 border-b-2 border-gray-400 dark:border-gray-600 flex items-end justify-center text-[11px] font-bold text-gray-700 dark:text-gray-200">
                {l ? l.toUpperCase() : ''}
              </span>
            ))}
          </div>
        )}

        {/* Wrong guesses progress */}
        {(isLive || isFinished) && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div className="h-full rounded-full bg-red-500 transition-all" style={{ width: `${(wrong / maxWrong) * 100}%` }} />
            </div>
            <span className="text-[10px] text-gray-500">{wrong}/{maxWrong}</span>
          </div>
        )}

        {/* CTA */}
        {canJoin && (
          <button onClick={() => onJoin(message.id)}
            className={`w-full py-2.5 rounded-xl ${vibe.accentClass} text-white font-black text-xs uppercase tracking-widest shadow-md hover:scale-[1.02] active:scale-95 transition-all`}>
            Join as Guesser
          </button>
        )}
        {canSolo && (
          <button onClick={() => onSolo(message.id)}
            className="w-full py-2 rounded-xl bg-gray-700 text-white font-black text-xs uppercase tracking-widest shadow hover:scale-[1.02] active:scale-95 transition-all">
            🤖 vs Computer
          </button>
        )}
        {!canJoin && !isFinished && (
          <button onClick={() => onLaunch(message)}
            className="w-full py-2 rounded-xl bg-gray-900 dark:bg-black text-white font-black text-xs uppercase tracking-widest shadow-md hover:scale-[1.02] active:scale-95 transition-all">
            {isPlayer ? 'Open Game' : '👁 Watch'}
          </button>
        )}

        {isFinished && (
          <>
            <div className={`w-full py-2.5 rounded-xl text-center font-black text-[11px] shadow-md text-white ${gameData.winner === 'guesser' ? 'bg-green-500' : 'bg-red-500'}`}>
              {gameData.winner === 'guesser' ? '🎉 Word guessed!' : '💀 Wordmaster wins!'}
            </div>
            <button onClick={() => onLaunch(message)}
              className="w-full py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold text-[10px] uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-700 transition-all">
              View Recap
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default HangmanMessage;
