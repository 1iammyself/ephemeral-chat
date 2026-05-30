import React, { useState } from 'react';
import { Trophy, Clock, Users, Trash2 } from 'lucide-react';
import { getVibeById } from '../utils/vibes';

const TicTacToeMessage = ({ message, currentUser, onJoin, onSpectate, onLaunch, onVsCpu, onDelete, roomVibe }) => {
  const { gameData } = message;
  const vibe = getVibeById(roomVibe);
  const userId = currentUser?.id || currentUser?.socketId;
  const nickname = currentUser?.nickname;

  const [confirmDelete, setConfirmDelete] = useState(false);
  const isCreator = message.sender?.id === userId || (nickname && message.sender?.nickname === nickname);
  const isP1 = gameData.player1?.id === userId || (nickname && gameData.player1?.name === nickname);
  const isP2 = gameData.player2?.id === userId || (nickname && gameData.player2?.name === nickname);
  const isPlaying = isP1 || isP2;
  const inQueue = gameData.queue?.some(p => p.id === userId || (nickname && p.name === nickname));

  const isCpu = !!gameData.cpu?.enabled;
  const isFinished = gameData.status === 'finished';
  const isLive = gameData.status === 'playing';
  const isWaiting = gameData.status === 'waiting';

  const creatorWaiting = isP1 && isWaiting && !gameData.player2 && !isCpu;
  const canJoin = !isPlaying && !inQueue && !gameData.player2 && isWaiting && !isCpu;
  const canQueue = !isPlaying && !inQueue && !!gameData.player2 && !isFinished;

  const board = gameData.board || Array(9).fill(null);
  const winLine = gameData.winLine || [];

  return (
    <div className="w-full max-w-[240px] overflow-hidden rounded-2xl shadow-lg border border-black/10 dark:border-white/10">
      {/* Header */}
      <div className={`p-2.5 ${vibe.accentClass} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-white text-base leading-none">✕</span>
          <h3 className="text-white font-bold text-xs sm:text-sm">
            Tic-Tac-Toe{isCpu ? ' vs CPU' : ''}
          </h3>
          {gameData.mode === 'ultimate' && (
            <span className="text-[9px] font-black text-white/80 bg-white/20 rounded-full px-1.5 py-0.5 uppercase tracking-tight">
              Ultimate
            </span>
          )}
          {isCpu && (
            <span className="text-[9px] font-black text-white/80 bg-white/20 rounded-full px-1.5 py-0.5 uppercase tracking-tight">
              {gameData.cpu.difficulty}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isWaiting && !isCpu && (
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

      {/* Players + board */}
      <div className="bg-white dark:bg-gray-900 px-3 py-2.5 flex gap-3 items-center">
        {/* Mini board */}
        <div className="grid grid-cols-3 gap-0.5 shrink-0">
          {board.map((cell, i) => {
            const isWin = winLine.includes(i);
            return (
              <div
                key={i}
                className={`w-7 h-7 flex items-center justify-center text-xs font-black rounded
                  ${isWin ? 'bg-yellow-400 text-white' :
                    cell === 'X' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300' :
                    cell === 'O' ? 'bg-red-100 dark:bg-red-900/40 text-red-500 dark:text-red-400' :
                    'bg-gray-100 dark:bg-gray-800'}`}
              >
                {cell}
              </div>
            );
          })}
        </div>

        {/* Player info */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm leading-none shrink-0 text-indigo-500">✕</span>
            <span className={`text-xs font-semibold truncate flex-1 ${gameData.player1 ? 'text-gray-900 dark:text-white' : 'text-gray-400 italic'}`}>
              {gameData.player1?.name ?? 'Waiting...'}
            </span>
            {isLive && gameData.turn === 'X' && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />}
            {isFinished && gameData.result === 'X' && <Trophy className="w-3 h-3 text-yellow-500 shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm leading-none shrink-0 text-red-500">○</span>
            <span className={`text-xs font-semibold truncate flex-1 ${(gameData.player2 || isCpu) ? 'text-gray-900 dark:text-white' : 'text-gray-400 italic'}`}>
              {isCpu ? `CPU (${gameData.cpu.difficulty})` : (gameData.player2?.name ?? 'Waiting...')}
            </span>
            {isLive && gameData.turn === 'O' && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />}
            {isFinished && gameData.result === 'O' && <Trophy className="w-3 h-3 text-yellow-500 shrink-0" />}
          </div>
          {isFinished && (
            <p className="text-[10px] font-black text-yellow-600 dark:text-yellow-400">
              {gameData.result === 'draw' ? '🤝 Draw!' : `🏆 ${gameData.winner?.name ?? gameData.result} wins`}
            </p>
          )}
          {(gameData.scores?.X > 0 || gameData.scores?.O > 0) && (
            <p className="text-[10px] text-gray-400 tabular-nums">
              {gameData.scores.X} – {gameData.scores.draw ?? 0} – {gameData.scores.O}
            </p>
          )}
        </div>
      </div>

      {/* Queue */}
      {gameData.queue?.length > 0 && (
        <div className="bg-white dark:bg-gray-900 px-3 pb-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-yellow-500 shrink-0" />
          <span className="text-[10px] text-yellow-600 dark:text-yellow-400">
            {gameData.queue.length === 1 ? `${gameData.queue[0].name} is next` : `${gameData.queue.length} in queue`}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-2 flex gap-2">
        {canJoin && (
          <button onClick={() => onJoin?.(message.id)} className={`flex-1 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity`}>
            ⚔️ Join
          </button>
        )}
        {canQueue && (
          <button onClick={() => onJoin?.(message.id)} className="flex-1 py-1.5 text-xs font-black rounded-lg bg-yellow-600/80 text-yellow-100 hover:opacity-90 transition-opacity">
            <Clock className="w-3 h-3 inline mr-1" />Queue
          </button>
        )}
        {isPlaying && !isFinished && (
          <button onClick={() => onLaunch?.(message)} className={`flex-1 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity`}>
            Open
          </button>
        )}
        {creatorWaiting && (
          <button onClick={() => onVsCpu?.(message)} className="flex-1 py-1.5 text-xs font-black rounded-lg bg-purple-600/80 text-purple-100 hover:opacity-90 transition-opacity">
            🤖 vs CPU
          </button>
        )}
        {!canJoin && !canQueue && !isPlaying && !creatorWaiting && (
          <button onClick={() => onSpectate?.(message)} className="flex-1 py-1.5 text-xs font-black rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:opacity-90 transition-opacity">
            {isFinished ? '📋 Review' : '👁 Spectate'}
          </button>
        )}
        {isCreator && onDelete && (
          confirmDelete ? (
            <div className="flex gap-1 shrink-0">
              <button onClick={() => { onDelete(message.id); setConfirmDelete(false); }}
                className="py-1.5 px-2 text-xs font-black rounded-lg bg-red-600 text-white hover:opacity-90 transition-opacity">
                Confirm
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="py-1.5 px-2 text-xs font-black rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:opacity-80 transition-opacity">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors shrink-0"
              title="Delete game for everyone">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )
        )}
      </div>
    </div>
  );
};

export default TicTacToeMessage;
