import React from 'react';
import { Trophy, Clock } from 'lucide-react';
import { getVibeById } from '../utils/vibes';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PIECE_CHARS = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

function MiniBoard({ fen }) {
  const pos = (fen || INITIAL_FEN).split(' ')[0];
  const rows = pos.split('/');
  const board = rows.map(row => {
    const cells = [];
    for (const c of row) {
      if (/\d/.test(c)) cells.push(...Array(parseInt(c)).fill(null));
      else cells.push(c);
    }
    return cells;
  });

  return (
    <div className="grid grid-cols-8 w-[88px] h-[88px] rounded overflow-hidden border border-black/10 dark:border-white/10 mx-auto shrink-0">
      {board.flatMap((row, ri) =>
        row.map((piece, ci) => {
          const isDark = (ri + ci) % 2 === 1;
          return (
            <div key={`${ri}-${ci}`} className={`flex items-center justify-center text-[9px] ${isDark ? 'bg-amber-700' : 'bg-amber-100'}`}>
              {piece && (
                <span className={piece === piece.toUpperCase() ? 'text-white drop-shadow-sm' : 'text-gray-900 drop-shadow-sm'}>
                  {PIECE_CHARS[piece]}
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function formatMs(ms) {
  if (ms == null) return null;
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const ChessMessage = ({ message, currentUser, onJoin, onSpectate, onLaunch, onVsCpu, roomVibe }) => {
  const { gameData } = message;
  const vibe = getVibeById(roomVibe);
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const currentNickname = currentUser?.nickname;

  const isWhite = gameData.white?.id === currentUserId || (currentNickname && gameData.white?.name === currentNickname);
  const isBlack = gameData.black?.id === currentUserId || (currentNickname && gameData.black?.name === currentNickname);
  const isPlaying = isWhite || isBlack;
  const inQueue = gameData.challengeQueue?.some(p => p.id === currentUserId || (currentNickname && p.name === currentNickname));

  const isCpu = !!gameData.cpu?.enabled;
  const isFinished = gameData.status === 'finished';
  const isLive = gameData.status === 'playing';
  const isWaiting = gameData.status === 'waiting';

  const canJoin = !isPlaying && !inQueue && !gameData.black && isWaiting && !isCpu;
  const canQueue = !isPlaying && !inQueue && !!gameData.black && !isFinished;
  const creatorWaiting = isWhite && isWaiting && !gameData.black && !isCpu;
  const turnColor = gameData.fen?.split(' ')[1];

  let winnerLabel = null;
  if (isFinished) {
    if (gameData.winner === 'draw') winnerLabel = '½-½ Draw';
    else if (gameData.winner === 'white') winnerLabel = `♔ ${gameData.white?.name ?? 'White'} wins`;
    else if (gameData.winner === 'black') winnerLabel = `♚ ${isCpu ? `CPU (${gameData.cpu.difficulty})` : (gameData.black?.name ?? 'Black')} wins`;
  }

  return (
    <div className="w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-2xl shadow-lg border border-black/10 dark:border-white/10">
      {/* Header */}
      <div className={`p-2.5 sm:p-3 ${vibe.accentClass} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-white text-base leading-none">♟</span>
          <h3 className="text-white font-bold text-xs sm:text-sm">
            Chess{isCpu ? ` vs CPU` : ''}
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

      {/* Board + players */}
      <div className="bg-white dark:bg-gray-900 px-3 py-2.5 flex gap-3 items-center">
        <MiniBoard fen={gameData.fen} />

        <div className="flex-1 min-w-0 space-y-1.5">
          {/* White player */}
          <div className="flex items-center gap-1.5">
            <span className="text-sm leading-none shrink-0">♔</span>
            <span className={`text-xs font-semibold truncate flex-1 ${gameData.white ? 'text-gray-900 dark:text-white' : 'text-gray-400 italic'}`}>
              {gameData.white?.name ?? 'Waiting...'}
            </span>
            {isFinished && gameData.winner === 'white' && <Trophy className="w-3 h-3 text-yellow-500 shrink-0" />}
            {isLive && turnColor === 'w' && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />}
          </div>

          {/* Black player */}
          <div className="flex items-center gap-1.5">
            <span className="text-sm leading-none shrink-0">♚</span>
            <span className={`text-xs font-semibold truncate flex-1 ${(gameData.black || isCpu) ? 'text-gray-900 dark:text-white' : 'text-gray-400 italic'}`}>
              {isCpu ? `CPU (${gameData.cpu.difficulty})` : (gameData.black?.name ?? 'Waiting...')}
            </span>
            {isFinished && gameData.winner === 'black' && <Trophy className="w-3 h-3 text-yellow-500 shrink-0" />}
            {isLive && turnColor === 'b' && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />}
          </div>

          {/* Move count */}
          {gameData.moves?.length > 0 && !isFinished && (
            <p className="text-[10px] text-gray-400">
              Move {Math.ceil(gameData.moves.length / 2)}
              {gameData.timeControl && gameData.whiteTime != null && (
                <span> · {formatMs(gameData.whiteTime)}/{formatMs(gameData.blackTime)}</span>
              )}
            </p>
          )}

          {/* Result */}
          {isFinished && winnerLabel && (
            <p className="text-[10px] font-black text-yellow-600 dark:text-yellow-400">🏆 {winnerLabel}</p>
          )}
        </div>
      </div>

      {/* Queue */}
      {gameData.challengeQueue?.length > 0 && (
        <div className="bg-white dark:bg-gray-900 px-3 pb-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-yellow-500 shrink-0" />
          <span className="text-[10px] text-yellow-600 dark:text-yellow-400">
            {gameData.challengeQueue.length === 1
              ? `${gameData.challengeQueue[0].name} is next`
              : `${gameData.challengeQueue.length} in queue`}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-2 flex gap-2">
        {canJoin && (
          <button onClick={() => onJoin?.(message.id)} className={`flex-1 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity`}>
            ⚔️ Challenge
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

export default ChessMessage;
