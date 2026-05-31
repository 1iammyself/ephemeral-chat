import React, { useState } from 'react';
import { Trophy, Clock, Trash2 } from 'lucide-react';
import { getVibeById } from '../utils/vibes';
import useBubbleMode from '../hooks/useBubbleMode';
import CompactGameBubble, { BubbleCollapseBar } from './CompactGameBubble';

function MiniScoreDisplay({ roundHistory = [], totalRounds = 5, scores = {} }) {
  return (
    <div className="w-[88px] h-[88px] rounded overflow-hidden border border-black/10 dark:border-white/10 mx-auto shrink-0 flex flex-col items-center justify-center gap-1.5 bg-gray-50 dark:bg-gray-800">
      <div className="text-2xl leading-none">✊</div>
      <div className="flex gap-0.5 flex-wrap justify-center max-w-[72px]">
        {Array.from({ length: totalRounds }, (_, i) => {
          const round = roundHistory[i];
          if (!round) return <div key={i} className="w-2.5 h-2.5 rounded-full bg-gray-200 dark:bg-gray-600" />;
          const color = round.result === 'player1' ? 'bg-indigo-500' : round.result === 'player2' ? 'bg-red-500' : 'bg-gray-400';
          return <div key={i} className={`w-2.5 h-2.5 rounded-full ${color}`} />;
        })}
      </div>
      {(scores.player1 > 0 || scores.player2 > 0) && (
        <div className="text-[10px] font-black text-gray-600 dark:text-gray-300 tabular-nums">
          {scores.player1 ?? 0}–{scores.player2 ?? 0}
        </div>
      )}
    </div>
  );
}

const RpsMessage = ({ message, currentUser, onJoin, onSpectate, onLaunch, onVsCpu, onDelete, roomVibe }) => {
  const { gameData } = message;
  const vibe = getVibeById(roomVibe);
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const currentNickname = currentUser?.nickname;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isP1 = gameData.player1?.id === currentUserId || (currentNickname && gameData.player1?.name === currentNickname);
  const isP2 = gameData.player2?.id === currentUserId || (currentNickname && gameData.player2?.name === currentNickname);
  const isPlaying = isP1 || isP2;
  const inQueue = gameData.challengeQueue?.some(p => p.id === currentUserId || (currentNickname && p.name === currentNickname));

  const isCpu = !!gameData.cpu?.enabled;
  const isFinished = gameData.status === 'finished';
  const isLive = gameData.status === 'playing';
  const isWaiting = gameData.status === 'waiting';

  const queueLocked = !!gameData.queueLocked;
  const maxQueue = gameData.maxQueue ?? Infinity;
  const queueFull = (gameData.challengeQueue?.length ?? 0) >= maxQueue;
  const isCreator = message.sender?.id === currentUserId || (currentNickname && message.sender?.nickname === currentNickname);

  const canJoin = !isPlaying && !inQueue && !gameData.player2 && isWaiting && !isCpu;
  const canQueue = !isPlaying && !inQueue && !!gameData.player2 && !isFinished && !queueLocked && !queueFull;
  const creatorWaiting = isP1 && isWaiting && !gameData.player2 && !isCpu;

  const p1Name = gameData.player1?.name ?? 'Player 1';
  const p2Name = isCpu ? `CPU (${gameData.cpu?.difficulty ?? '?'})` : (gameData.player2?.name ?? 'Waiting...');

  let winnerLabel = null;
  if (isFinished) {
    const w = gameData.winner;
    if (!w) winnerLabel = '🤝 Draw';
    else if (w.id === gameData.player1?.id) winnerLabel = `✊ ${p1Name} wins`;
    else winnerLabel = `✊ ${isCpu ? `CPU (${gameData.cpu?.difficulty})` : (w.name ?? 'Player 2')} wins`;
  }

  let primary;
  if (isPlaying && !isFinished) primary = { label: 'Open', onClick: () => onLaunch?.(message) };
  else if (canJoin) primary = { label: '⚔️ Challenge', onClick: () => onJoin?.(message.id) };
  else if (canQueue) primary = { label: 'Queue', variant: 'queue', onClick: () => onJoin?.(message.id) };
  else if (creatorWaiting) primary = { label: '🤖 vs CPU', variant: 'cpu', onClick: () => onVsCpu?.(message) };
  else primary = { label: isFinished ? '📋 Review' : '👁 Spectate', variant: 'ghost', onClick: () => onSpectate?.(message) };

  const liveScore = `${p1Name} ${gameData.scores?.player1 ?? 0}–${gameData.scores?.player2 ?? 0} ${p2Name}`;

  const bubble = useBubbleMode();
  if (bubble.isCompact) {
    return (
      <CompactGameBubble
        vibe={vibe}
        icon="✊"
        title={`${gameData.variant === 'rpsls' ? 'RPSLS' : 'Rock·Paper·Scissors'}${isCpu ? ' vs CPU' : ''}`}
        badges={[`Bo${gameData.totalRounds ?? 5}`, isCpu && gameData.cpu.difficulty]}
        status={isLive ? 'live' : isFinished ? 'finished' : 'open'}
        subtitle={isFinished ? winnerLabel : isLive ? liveScore : `${p1Name} vs ${p2Name}`}
        primary={primary}
        canExpand={bubble.canExpand}
        onExpand={bubble.expand}
      />
    );
  }

  return (
    <div className="w-full max-w-[260px] sm:max-w-[280px]">
      {bubble.canExpand && <BubbleCollapseBar onCollapse={bubble.collapse} />}
    <div className="w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-2xl shadow-lg border border-black/10 dark:border-white/10">
      {/* Header */}
      <div className={`p-2.5 sm:p-3 ${vibe.accentClass} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-white text-base leading-none">✊</span>
          <h3 className="text-white font-bold text-xs sm:text-sm">
            {gameData.variant === 'rpsls' ? 'RPSLS' : 'Rock·Paper·Scissors'}{isCpu ? ' vs CPU' : ''}
          </h3>
          {isCpu && (
            <span className="text-[9px] font-black text-white/80 bg-white/20 rounded-full px-1.5 py-0.5 uppercase tracking-tight">
              {gameData.cpu.difficulty}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-black text-white/80 bg-white/20 rounded-full px-1.5 py-0.5">
            Bo{gameData.totalRounds ?? 5}
          </span>
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

      {/* Score display + players */}
      <div className="bg-white dark:bg-gray-900 px-3 py-2.5 flex gap-3 items-center">
        <MiniScoreDisplay
          roundHistory={gameData.roundHistory ?? []}
          totalRounds={gameData.totalRounds ?? 5}
          scores={gameData.scores ?? { player1: 0, player2: 0 }}
        />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm leading-none shrink-0">✊</span>
            <span className={`text-xs font-semibold truncate flex-1 ${gameData.player1 ? 'text-gray-900 dark:text-white' : 'text-gray-400 italic'}`}>
              {p1Name}
            </span>
            {isFinished && gameData.winner?.id === gameData.player1?.id && <Trophy className="w-3 h-3 text-yellow-500 shrink-0" />}
            {isLive && <span className="text-[10px] font-black text-indigo-500 shrink-0 tabular-nums">{gameData.scores?.player1 ?? 0}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm leading-none shrink-0">✊</span>
            <span className={`text-xs font-semibold truncate flex-1 ${(gameData.player2 || isCpu) ? 'text-gray-900 dark:text-white' : 'text-gray-400 italic'}`}>
              {p2Name}
            </span>
            {isFinished && gameData.winner && gameData.winner?.id !== gameData.player1?.id && <Trophy className="w-3 h-3 text-yellow-500 shrink-0" />}
            {isLive && <span className="text-[10px] font-black text-red-500 shrink-0 tabular-nums">{gameData.scores?.player2 ?? 0}</span>}
          </div>
          {isLive && (
            <p className="text-[10px] text-gray-400">
              Round {(gameData.roundHistory?.length ?? 0) + 1} of {gameData.totalRounds ?? 5}
            </p>
          )}
          {isFinished && winnerLabel && (
            <p className="text-[10px] font-black text-yellow-600 dark:text-yellow-400">🏆 {winnerLabel}</p>
          )}
        </div>
      </div>

      {/* Queue */}
      {(gameData.challengeQueue?.length > 0 || (isLive && maxQueue !== Infinity)) && (
        <div className="bg-white dark:bg-gray-900 px-3 pb-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-yellow-500 shrink-0" />
          <span className="text-[10px] text-yellow-600 dark:text-yellow-400 flex-1">
            {gameData.challengeQueue?.length === 0 ? 'Queue empty'
              : gameData.challengeQueue?.length === 1 ? `${gameData.challengeQueue[0].name} is next`
              : `${gameData.challengeQueue.length} in queue`}
          </span>
          {maxQueue !== Infinity && (
            <span className="text-[9px] text-gray-400 tabular-nums">{gameData.challengeQueue?.length ?? 0}/{maxQueue}</span>
          )}
          {queueLocked && <span className="text-[9px]">🔒</span>}
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
        {isCreator && onDelete && (
          confirmDelete ? (
            <div className="flex gap-1 shrink-0">
              <button onClick={() => { onDelete(message.id); setConfirmDelete(false); }} className="py-1.5 px-2 text-xs font-black rounded-lg bg-red-600 text-white hover:opacity-90 transition-opacity">Confirm</button>
              <button onClick={() => setConfirmDelete(false)} className="py-1.5 px-2 text-xs font-black rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:opacity-80 transition-opacity">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="p-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors shrink-0" title="Delete game for everyone">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )
        )}
      </div>
    </div>
    </div>
  );
};

export default RpsMessage;
