import React from 'react';
import { Trophy, Clock } from 'lucide-react';
import { getVibeById } from '../utils/vibes';

const ROWS = 6, COLS = 7;

const ConnectFourMessage = ({ message, currentUser, onJoin, onSpectate, onLaunch, onVsCpu, roomVibe }) => {
  const { gameData } = message;
  const vibe = getVibeById(roomVibe);
  const userId = currentUser?.id || currentUser?.socketId;
  const nickname = currentUser?.nickname;

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

  const board = gameData.board || Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
  const winCells = gameData.winCells || [];
  const winSet = new Set(winCells.map(([r,c]) => `${r},${c}`));

  return (
    <div className="w-full max-w-[260px] overflow-hidden rounded-2xl shadow-lg border border-black/10 dark:border-white/10">
      {/* Header */}
      <div className={`p-2.5 ${vibe.accentClass} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-white text-base leading-none">🔴</span>
          <h3 className="text-white font-bold text-xs sm:text-sm">
            Connect Four{isCpu ? ' vs CPU' : ''}
          </h3>
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

      {/* Mini board */}
      <div className="bg-white dark:bg-gray-900 px-3 pt-2.5 pb-1">
        <div className="grid gap-0.5 mx-auto" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, width: 'fit-content' }}>
          {board.flatMap((row, r) =>
            row.map((cell, c) => {
              const isWin = winSet.has(`${r},${c}`);
              return (
                <div
                  key={`${r}-${c}`}
                  className={`w-5 h-5 rounded-full border
                    ${isWin ? 'border-yellow-400' :
                      cell === 1 ? 'border-transparent' :
                      cell === 2 ? 'border-transparent' :
                      'border-gray-200 dark:border-gray-700'}`}
                  style={{
                    background: isWin ? '#facc15' :
                      cell === 1 ? '#ef4444' :
                      cell === 2 ? '#facc15' :
                      'transparent',
                  }}
                />
              );
            })
          )}
        </div>

        {/* Players */}
        <div className="flex items-center justify-between mt-2 mb-1">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
            <span className={`text-xs font-semibold truncate max-w-[80px] ${gameData.player1 ? 'text-gray-900 dark:text-white' : 'text-gray-400 italic'}`}>
              {gameData.player1?.name ?? 'Waiting...'}
            </span>
            {isLive && gameData.turn === 1 && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
            {isFinished && gameData.result === 1 && <Trophy className="w-3 h-3 text-yellow-500" />}
          </div>
          <div className="flex items-center gap-1">
            {isLive && gameData.turn === 2 && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
            {isFinished && gameData.result === 2 && <Trophy className="w-3 h-3 text-yellow-500" />}
            <span className={`text-xs font-semibold truncate max-w-[80px] text-right ${(gameData.player2||isCpu) ? 'text-gray-900 dark:text-white' : 'text-gray-400 italic'}`}>
              {isCpu ? `CPU (${gameData.cpu.difficulty})` : (gameData.player2?.name ?? 'Waiting...')}
            </span>
            <div className="w-3 h-3 rounded-full bg-yellow-400 shrink-0" />
          </div>
        </div>

        {isFinished && (
          <p className="text-[10px] font-black text-yellow-600 dark:text-yellow-400 text-center pb-1">
            {gameData.result === 'draw' ? '🤝 Draw!' : `🏆 ${gameData.winner?.name ?? 'Winner'} wins!`}
          </p>
        )}
        {(gameData.scores?.[1] > 0 || gameData.scores?.[2] > 0) && (
          <p className="text-[10px] text-gray-400 text-center tabular-nums pb-1">
            🔴 {gameData.scores[1]} – {gameData.scores[2]} 🟡
          </p>
        )}
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
      </div>
    </div>
  );
};

export default ConnectFourMessage;
