import React from 'react';
import { Gamepad2, Trophy, Zap } from 'lucide-react';
import { getVibeById } from '../utils/vibes';

const TetrisMessage = ({ message, currentUser, onJoin, onSpectate, onLaunch, roomVibe }) => {
  const { gameData } = message;
  const vibe = getVibeById(roomVibe);
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const currentNickname = currentUser?.nickname;

  const isPlayer1 =
    gameData.player1?.id === currentUserId ||
    (currentNickname && gameData.player1?.name === currentNickname);
  const isPlayer2 =
    gameData.player2?.id === currentUserId ||
    (currentNickname && gameData.player2?.name === currentNickname);
  const isPlaying = isPlayer1 || isPlayer2;
  const canJoin = !gameData.player2 && !isPlayer1 && gameData.status === 'waiting';
  const isLive = gameData.status === 'playing';
  const isFinished = gameData.status === 'finished';

  const winnerName = gameData.winner === 'player1'
    ? gameData.player1?.name
    : gameData.player2?.name;

  return (
    <div className={`w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-2xl shadow-lg border border-black/10 dark:border-white/10`}>
      {/* Header */}
      <div className={`p-2.5 sm:p-3 ${vibe.accentClass} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-white" />
          <h3 className="text-white font-bold text-xs sm:text-sm">Tetris Battle</h3>
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
        {isFinished && <Trophy className="w-4 h-4 text-yellow-300" />}
      </div>

      {/* Players */}
      <div className="bg-white dark:bg-gray-900 px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center text-xs font-black text-cyan-500 shrink-0">1</div>
          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{gameData.player1?.name}</span>
          {isFinished && gameData.winner === 'player1' && (
            <Trophy className="w-3.5 h-3.5 text-yellow-500 ml-auto shrink-0" />
          )}
          {isLive && gameData.scores?.player1 > 0 && (
            <span className="text-[10px] text-gray-500 ml-auto tabular-nums">{gameData.scores.player1.toLocaleString()}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-xs font-black text-purple-500 shrink-0">2</div>
          {gameData.player2 ? (
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{gameData.player2.name}</span>
          ) : (
            <span className="text-sm text-gray-400 italic">Waiting...</span>
          )}
          {isFinished && gameData.winner === 'player2' && (
            <Trophy className="w-3.5 h-3.5 text-yellow-500 ml-auto shrink-0" />
          )}
          {isLive && gameData.scores?.player2 > 0 && (
            <span className="text-[10px] text-gray-500 ml-auto tabular-nums">{gameData.scores.player2.toLocaleString()}</span>
          )}
        </div>

        {isFinished && (
          <div className="pt-1.5 border-t border-gray-100 dark:border-gray-800 text-center">
            {winnerName ? (
              <p className="text-xs font-black text-yellow-600 dark:text-yellow-400">
                🏆 {winnerName} wins!
              </p>
            ) : (
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
                {gameData.player2 ? 'Game over — no winner' : 'Solo session ended'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {!isFinished && (
        <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-2 flex gap-2">
          {canJoin && (
            <button
              onClick={() => onJoin && onJoin(message.id)}
              className={`flex-1 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity`}
            >
              <Zap className="w-3 h-3 inline mr-1" />
              Join Battle
            </button>
          )}
          {isPlaying && (
            <button
              onClick={() => onLaunch && onLaunch(message)}
              className={`flex-1 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity`}
            >
              Open Game
            </button>
          )}
          {!canJoin && !isPlaying && gameData.player2 && (
            <button
              onClick={() => onSpectate && onSpectate(message)}
              className="flex-1 py-1.5 text-xs font-black rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:opacity-90 transition-opacity"
            >
              Spectate
            </button>
          )}
          {isPlaying && gameData.player2 && (
            <button
              onClick={() => onSpectate && onSpectate(message)}
              className="py-1.5 px-2 text-[10px] font-black rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:opacity-90 transition-opacity"
            >
              Spec
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TetrisMessage;
