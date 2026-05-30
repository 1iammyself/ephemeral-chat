import React, { useState } from 'react';
import { Trophy, Trash2 } from 'lucide-react';
import { getVibeById } from '../utils/vibes';
import { PICK_EMOJI } from './games/RpsEngine';

const RpsMessage = ({ message, currentUser, onJoin, onSpectate, onLaunch, onDelete, roomVibe }) => {
  const { gameData } = message;
  const vibe     = getVibeById(roomVibe);
  const userId   = currentUser?.id || currentUser?.socketId;
  const nickname = currentUser?.nickname;

  const [confirmDelete, setConfirmDelete] = useState(false);
  const isCreator = message.sender?.id === userId || (nickname && message.sender?.nickname === nickname);
  const isMember   = (gameData.players || []).some(
    p => p.id === userId || (nickname && p.name === nickname)
  );
  const isCpu      = !!gameData.cpu?.enabled;
  const cpuDiff    = gameData.cpu?.difficulty || 'medium';
  const isFinished = gameData.status === 'finished';
  const isLive     = gameData.status === 'playing';
  const isWaiting  = gameData.status === 'waiting';

  const scores        = gameData.scores || {};
  const sortedPlayers = (gameData.players || []).slice()
    .sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));

  const lastResult  = gameData.roundResults?.[gameData.roundResults.length - 1];
  const overallWinner = gameData.overallWinner;

  return (
    <div className="w-full max-w-[240px] overflow-hidden rounded-2xl shadow-lg border border-black/10 dark:border-white/10">

      {/* Header */}
      <div className={`p-2.5 ${vibe.accentClass} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-white text-base">✊</span>
          <h3 className="text-white font-bold text-xs sm:text-sm">
            Rock · Paper · Scissors{isCpu ? ` vs CPU (${cpuDiff})` : ''}
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
              <span className="text-[9px] font-black text-green-200">
                Rd {gameData.round}/{gameData.totalRounds}
              </span>
            </div>
          )}
          {isFinished && <Trophy className="w-4 h-4 text-yellow-300" />}
        </div>
      </div>

      {/* Body */}
      <div className="bg-white dark:bg-gray-900 px-3 py-2.5">

        {/* Last round picks preview */}
        {lastResult?.picks && isLive && (
          <div className="flex justify-center gap-4 mb-2 text-2xl">
            {Object.entries(lastResult.picks).slice(0, 2).map(([pid, pick]) => (
              <span key={pid}>{PICK_EMOJI[pick] || '❓'}</span>
            ))}
          </div>
        )}

        {/* Player score list */}
        <div className="space-y-1">
          {sortedPlayers.slice(0, 4).map((p, i) => (
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
          {isCpu && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                CPU ({cpuDiff})
              </span>
              <span className="text-xs font-black tabular-nums text-gray-600 dark:text-gray-400">
                {scores['cpu'] ?? 0}
              </span>
            </div>
          )}
          {sortedPlayers.length > 4 && (
            <p className="text-[10px] text-gray-400">+{sortedPlayers.length - 4} more</p>
          )}
        </div>

        {isFinished && overallWinner && (
          <p className="text-[10px] font-black text-yellow-600 dark:text-yellow-400 text-center mt-1.5">
            🏆 {overallWinner.name} wins the match!
          </p>
        )}
        {isFinished && !overallWinner && (
          <p className="text-[10px] text-gray-500 text-center mt-1.5">Match tied!</p>
        )}
      </div>

      {/* Actions */}
      <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-2 flex gap-2">
        {isWaiting && !isMember && (
          <button
            onClick={() => onJoin?.(message.id)}
            className={`flex-1 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity`}
          >
            ✋ Join
          </button>
        )}
        {isMember && !isFinished && (
          <button
            onClick={() => onLaunch?.(message)}
            className={`flex-1 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity`}
          >
            Open
          </button>
        )}
        {!isMember && (isLive || isFinished) && (
          <button
            onClick={() => onSpectate?.(message)}
            className="flex-1 py-1.5 text-xs font-black rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:opacity-90 transition-opacity"
          >
            {isFinished ? '📋 Review' : '👁 Watch'}
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

export default RpsMessage;
