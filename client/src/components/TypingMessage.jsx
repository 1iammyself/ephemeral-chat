import React from 'react';
import { getVibeById } from '../utils/vibes';

const TypingMessage = ({ message, currentUser, onJoin, onSolo, onLaunch, roomVibe }) => {
  const { gameData } = message;
  const vibe = getVibeById(roomVibe);
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const currentNickname = currentUser?.nickname;

  const isP1 = gameData.player1?.id === currentUserId || (currentNickname && gameData.player1?.name === currentNickname);
  const isP2 = gameData.player2?.id === currentUserId || (currentNickname && gameData.player2?.name === currentNickname);
  const isPlayer = isP1 || isP2;
  const canJoin = !gameData.player2 && !isP1 && gameData.status === 'waiting';
  const canSolo = isP1 && gameData.status === 'waiting' && !gameData.player2;
  const isLive = gameData.status === 'playing' || gameData.status === 'countdown';
  const isFinished = gameData.status === 'finished';
  const p1Progress = gameData.progress?.player1 ?? 0;
  const p2Progress = gameData.progress?.player2 ?? 0;

  return (
    <div className={`w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-2xl shadow-lg border border-black/10 dark:border-white/10`}>
      {/* Header */}
      <div className={`p-2.5 sm:p-3 ${vibe.accentClass} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-white text-base">⌨️</span>
          <h3 className="text-white font-bold text-xs sm:text-sm">Type Sprint</h3>
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
            <span className="text-[9px] font-black text-green-200 uppercase tracking-tighter">Racing</span>
          </div>
        )}
        {isFinished && <span className="text-lg">🏁</span>}
      </div>

      {/* Body */}
      <div className="bg-white dark:bg-gray-900 px-3 py-2.5 space-y-2.5">
        {/* Progress bars */}
        {(isLive || isFinished) && (
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="font-bold text-gray-700 dark:text-gray-300">{gameData.player1?.name}</span>
                <span className="text-gray-500">{gameData.wpm?.player1 ?? 0} WPM</span>
              </div>
              <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${p1Progress}%`, background: 'var(--vibe-primary, #6366f1)' }} />
              </div>
            </div>
            {gameData.player2 && (
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="font-bold text-gray-700 dark:text-gray-300">{gameData.player2?.name}</span>
                  <span className="text-gray-500">{gameData.wpm?.player2 ?? 0} WPM</span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${p2Progress}%` }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Players if waiting */}
        {!isLive && !isFinished && (
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-700 dark:text-gray-300">
            <span>{gameData.player1?.name || '?'}</span>
            <span className="text-gray-400">vs</span>
            <span>{gameData.player2?.name || '???'}</span>
          </div>
        )}

        {/* CTA */}
        {canJoin && (
          <button onClick={() => onJoin(message.id)}
            className={`w-full py-2.5 rounded-xl ${vibe.accentClass} text-white font-black text-xs uppercase tracking-widest shadow-md hover:scale-[1.02] active:scale-95 transition-all`}>
            Join Race
          </button>
        )}
        {canSolo && (
          <button onClick={() => onSolo(message.id)}
            className="w-full py-2 rounded-xl bg-gray-700 text-white font-black text-xs uppercase tracking-widest shadow hover:scale-[1.02] active:scale-95 transition-all">
            ⌨️ Solo Time Trial
          </button>
        )}
        {!canJoin && !isFinished && (
          <button onClick={() => onLaunch(message)}
            className="w-full py-2 rounded-xl bg-gray-900 dark:bg-black text-white font-black text-xs uppercase tracking-widest shadow-md hover:scale-[1.02] active:scale-95 transition-all">
            {isPlayer ? '⌨️ Open' : '👁 Watch'}
          </button>
        )}

        {/* Winner */}
        {isFinished && (() => {
          const winnerName = gameData.winner === 'player1' ? gameData.player1?.name : gameData.player2?.name;
          return (
            <>
              <div className="w-full py-2.5 rounded-xl text-center font-black text-[11px] bg-amber-500 text-white shadow-md">
                🏁 {winnerName} wins!
              </div>
              <button onClick={() => onLaunch(message)}
                className="w-full py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold text-[10px] uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-700 transition-all">
                View Replay
              </button>
            </>
          );
        })()}
      </div>
    </div>
  );
};

export default TypingMessage;
