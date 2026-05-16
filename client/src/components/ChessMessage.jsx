import React, { useEffect } from 'react';
import { Trophy, Swords } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getVibeById } from '../utils/vibes';

const ChessMessage = ({ message, currentUser, onJoin, onLaunch, onDelete, roomVibe, isHost }) => {
  const { gameData } = message;
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const currentNickname = currentUser?.nickname;
  const vibe = getVibeById(roomVibe);

  const isWhite =
    gameData.players.white?.id === currentUserId ||
    (currentNickname && gameData.players.white?.name === currentNickname);
  const isBlack =
    gameData.players.black?.id === currentUserId ||
    (currentNickname && gameData.players.black?.name === currentNickname);
  const isPlayer = isWhite || isBlack;
  const isSender =
    message.sender.socketId === currentUserId ||
    message.sender.id === currentUserId ||
    (currentNickname && message.sender.nickname === currentNickname);

  const isTargeted = message.recipients && message.recipients.length > 0;
  const isIntendedRecipient =
    isTargeted &&
    (message.recipients.includes(currentUserId) ||
      message.recipients.includes(currentUser?.socketId) ||
      (gameData.invitedNickname && gameData.invitedNickname === currentNickname));

  const canJoin =
    !isPlayer &&
    !gameData.winner &&
    (!gameData.players.white?.id || !gameData.players.black?.id) &&
    (!isTargeted || isIntendedRecipient);

  const isMyTurn = (() => {
    if (gameData.winner || !gameData.players.white?.id || !gameData.players.black?.id) return false;
    return (
      (gameData.turn === 'w' && isWhite) ||
      (gameData.turn === 'b' && isBlack)
    );
  })();

  // Confetti on winning
  useEffect(() => {
    if (!gameData.winner || gameData.winner === 'draw') return;
    const winningPlayer = gameData.players[gameData.winner];
    if (
      winningPlayer?.id === currentUserId ||
      (currentNickname && winningPlayer?.name === currentNickname)
    ) {
      const defaults = { origin: { y: 0.9 }, zIndex: 9999 };
      const fire = (ratio, opts) =>
        confetti({ ...defaults, ...opts, particleCount: Math.floor(200 * ratio) });
      fire(0.25, { spread: 26, startVelocity: 55 });
      fire(0.20, { spread: 60 });
      fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
      fire(0.10, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
      fire(0.10, { spread: 120, startVelocity: 45 });
    }
  }, [gameData.winner]); // eslint-disable-line react-hooks/exhaustive-deps

  const headerClass = vibe.accentClass;
  const accentColor = vibe.accent || 'indigo';

  return (
    <div className={`w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-2xl shadow-lg border border-black/10 dark:border-white/10 border-t-4 border-t-${accentColor}-500 animate-in fade-in zoom-in duration-300`}>
      {/* Header */}
      <div className={`p-2.5 sm:p-3 ${headerClass} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-white" />
          <h3 className="text-white font-bold text-xs sm:text-sm">Chess Match</h3>
        </div>
        {gameData.isCPU && (
          <div className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5">
            <span className="text-[10px]">🤖</span>
            <span className="text-[9px] font-black text-white uppercase tracking-tighter">{gameData.cpuDifficulty || 'CPU'}</span>
          </div>
        )}
        {!gameData.players.black?.id && !gameData.isCPU && (
          <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-2 py-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[9px] font-black text-white uppercase tracking-tighter">Waiting</span>
          </div>
        )}
        {gameData.winner && (
          <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-2 py-0.5">
            <span className="text-[9px] font-black text-white uppercase tracking-tighter">Ended</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3 sm:p-4 bg-white dark:bg-gray-900 flex flex-col items-center gap-3">
        {/* Players */}
        <div className="flex items-center gap-4 w-full justify-center">
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xl shadow-inner border border-gray-200 dark:border-gray-700 select-none">
              ♔
            </div>
            <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400 truncate max-w-[64px] text-center">
              {gameData.players.white?.name || '?'}
            </span>
          </div>
          <Swords className="w-4 h-4 text-gray-300 dark:text-gray-600" />
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-gray-800 dark:bg-gray-700 flex items-center justify-center text-xl shadow-inner border border-gray-600 dark:border-gray-600 select-none">
              ♚
            </div>
            <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400 truncate max-w-[64px] text-center">
              {gameData.players.black?.name || (gameData.isCPU ? '🤖 CPU' : gameData.invitedNickname || '???')}
            </span>
          </div>
        </div>

        {/* Join button */}
        {canJoin && (
          <button
            onClick={() => onJoin(message.id)}
            className={`w-full py-2.5 rounded-xl ${headerClass} text-white font-black text-xs uppercase tracking-widest shadow-md hover:scale-[1.02] active:scale-95 transition-all`}
          >
            Join Match
          </button>
        )}

        {/* Launch / Spectate button */}
        {!canJoin && !gameData.winner && gameData.players.white?.id && (
          <button
            onClick={() => onLaunch(message)}
            className={`w-full py-2.5 rounded-xl bg-gray-900 dark:bg-black text-white font-black text-xs uppercase tracking-widest shadow-md hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2`}
          >
            <Trophy className="w-3.5 h-3.5 text-yellow-400" />
            {isPlayer ? 'Open Board' : 'Spectate'}
          </button>
        )}

        {/* Turn indicator */}
        {!gameData.winner && gameData.players.white?.id && gameData.players.black?.id && (
          <div className={`w-full py-2 rounded-xl text-center font-bold text-[11px] transition-all ${
            isMyTurn
              ? `bg-${accentColor}-500 text-white shadow-sm`
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
          }`}>
            {isMyTurn ? '♟ Your move!' : `${gameData.turn === 'w' ? 'White' : 'Black'}'s turn`}
          </div>
        )}

        {/* Winner banner */}
        {gameData.winner && (
          <div className="w-full py-2.5 rounded-xl text-center font-black text-[11px] bg-amber-500 text-white shadow-md">
            {gameData.winner === 'draw'
              ? '🤝 Match Drawn'
              : `${gameData.winner === 'white' ? '♔ White' : '♚ Black'} Wins! 🏆`}
          </div>
        )}
        {gameData.winner && (
          <button
            onClick={() => onLaunch(message)}
            className="w-full py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold text-[10px] uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
          >
            View Recap
          </button>
        )}

        {/* Delete (sender or host) */}
        {(isSender || isHost) && !gameData.winner && (
          <button
            onClick={() => onDelete(message.id)}
            className="text-[10px] font-bold text-rose-400 hover:text-rose-500 transition-colors uppercase tracking-widest mt-1"
          >
            Delete Game
          </button>
        )}
      </div>
    </div>
  );
};

export default ChessMessage;
