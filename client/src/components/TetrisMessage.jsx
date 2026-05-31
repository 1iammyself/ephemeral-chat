import React from 'react';
import { Gamepad2, Trophy, Zap, Users, Clock } from 'lucide-react';
import { getVibeById } from '../utils/vibes';
import useBubbleMode from '../hooks/useBubbleMode';
import CompactGameBubble, { BubbleCollapseBar } from './CompactGameBubble';

const TetrisMessage = ({ message, currentUser, onJoin, onSpectate, onLaunch, roomVibe }) => {
  const { gameData } = message;
  const vibe = getVibeById(roomVibe);
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const currentNickname = currentUser?.nickname;
  const bubble = useBubbleMode();

  // ── Legacy schema (player1/player2) ──────────────────────────────
  if (!gameData.players) {
    const isP1 = gameData.player1?.id === currentUserId || (currentNickname && gameData.player1?.name === currentNickname);
    const isP2 = gameData.player2?.id === currentUserId || (currentNickname && gameData.player2?.name === currentNickname);
    const isPlaying = isP1 || isP2;
    const canJoin = !gameData.player2 && !isP1 && gameData.status === 'waiting';
    const isLive = gameData.status === 'playing';
    const isFinished = gameData.status === 'finished';
    const winnerName = gameData.winner === 'player1' ? gameData.player1?.name : gameData.player2?.name;

    let primary = null;
    if (isPlaying) primary = { label: 'Open', onClick: () => onLaunch?.(message) };
    else if (canJoin) primary = { label: '⚡ Join', onClick: () => onJoin?.(message.id) };
    else if (gameData.player2) primary = { label: 'Spectate', variant: 'ghost', onClick: () => onSpectate?.(message) };

    const subtitle = isFinished
      ? (winnerName ? `🏆 ${winnerName} wins` : (gameData.player2 ? 'Game over' : 'Solo session ended'))
      : `${gameData.player1?.name ?? 'P1'} vs ${gameData.player2?.name ?? 'Waiting...'}`;

    if (bubble.isCompact) {
      return (
        <CompactGameBubble
          vibe={vibe}
          icon="🎮"
          title="Tetris Battle"
          status={isLive ? 'live' : isFinished ? 'finished' : 'open'}
          subtitle={subtitle}
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
        <div className={`p-2.5 sm:p-3 ${vibe.accentClass} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-white" />
            <h3 className="text-white font-bold text-xs sm:text-sm">Tetris Battle</h3>
          </div>
          {canJoin && <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-2 py-0.5"><div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /><span className="text-[9px] font-black text-white uppercase tracking-tighter">Open</span></div>}
          {isLive && <div className="flex items-center gap-1.5 bg-green-400/30 rounded-full px-2 py-0.5"><div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /><span className="text-[9px] font-black text-green-200 uppercase tracking-tighter">Live</span></div>}
          {isFinished && <Trophy className="w-4 h-4 text-yellow-300" />}
        </div>
        <div className="bg-white dark:bg-gray-900 px-3 py-2.5 space-y-2">
          <PlayerRow num={1} name={gameData.player1?.name} color="cyan" isWinner={isFinished && gameData.winner === 'player1'} />
          <PlayerRow num={2} name={gameData.player2?.name} color="purple" isWinner={isFinished && gameData.winner === 'player2'} />
          {isFinished && (
            <div className="pt-1.5 border-t border-gray-100 dark:border-gray-800 text-center">
              {winnerName
                ? <p className="text-xs font-black text-yellow-600 dark:text-yellow-400">🏆 {winnerName} wins!</p>
                : <p className="text-xs font-bold text-gray-500 dark:text-gray-400">{gameData.player2 ? 'Game over — no winner' : 'Solo session ended'}</p>}
            </div>
          )}
        </div>
        {!isFinished && (
          <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-2 flex gap-2">
            {canJoin && <button onClick={() => onJoin?.(message.id)} className={`flex-1 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity`}><Zap className="w-3 h-3 inline mr-1" />Join</button>}
            {isPlaying && <button onClick={() => onLaunch?.(message)} className={`flex-1 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity`}>Open</button>}
            {!canJoin && !isPlaying && gameData.player2 && <button onClick={() => onSpectate?.(message)} className="flex-1 py-1.5 text-xs font-black rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:opacity-90 transition-opacity">Spectate</button>}
          </div>
        )}
      </div>
      </div>
    );
  }

  // ── New FFA schema ────────────────────────────────────────────────
  const activePlayers = gameData.players.filter(p => p.status === 'active');
  const myEntry = gameData.players.find(p =>
    p.id === currentUserId || (currentNickname && p.name === currentNickname)
  );
  const myBenchEntry = gameData.bench.find(p =>
    p.id === currentUserId || (currentNickname && p.name === currentNickname)
  );

  const isMyActive = myEntry?.status === 'active';
  const isOnBench = !!myBenchEntry;
  const hasOpenSlot = activePlayers.length < gameData.maxPlayers;
  const canJoin = !myEntry && !myBenchEntry && hasOpenSlot && gameData.status !== 'finished';
  const canQueue = !myEntry && !myBenchEntry && !hasOpenSlot && gameData.status !== 'finished';
  const isFinished = gameData.status === 'finished';
  const isLive = gameData.status === 'playing';
  const isWaiting = gameData.status === 'waiting';

  let primary;
  if (canJoin) primary = { label: '⚡ Join', onClick: () => onJoin?.(message.id) };
  else if (canQueue) primary = { label: 'Queue', variant: 'queue', onClick: () => onJoin?.(message.id) };
  else if (myEntry) primary = { label: 'Open', onClick: () => onLaunch?.(message) };
  else if (isOnBench) primary = { label: 'Benched', variant: 'queue', onClick: () => onLaunch?.(message) };
  else primary = { label: 'Spectate', variant: 'ghost', onClick: () => onSpectate?.(message) };

  const ffaSubtitle = isFinished
    ? (gameData.winner ? `🏆 ${gameData.winner} wins` : 'Game over')
    : `${activePlayers.length} playing${gameData.bench.length ? ` · ${gameData.bench.length} queued` : ''}`;

  if (bubble.isCompact) {
    return (
      <CompactGameBubble
        vibe={vibe}
        icon="🎮"
        title="Tetris FFA"
        badges={[`${activePlayers.length}/${gameData.maxPlayers}`]}
        status={isLive ? 'live' : isFinished ? 'finished' : 'open'}
        subtitle={ffaSubtitle}
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
          <Gamepad2 className="w-4 h-4 text-white" />
          <h3 className="text-white font-bold text-xs sm:text-sm">Tetris FFA</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {isWaiting && <div className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5"><div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /><span className="text-[9px] font-black text-white">Solo</span></div>}
          {isLive && <div className="flex items-center gap-1 bg-green-400/30 rounded-full px-2 py-0.5"><div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /><span className="text-[9px] font-black text-green-200">Live</span></div>}
          {isFinished && <Trophy className="w-4 h-4 text-yellow-300" />}
          <div className="flex items-center gap-1 bg-white/10 rounded-full px-2 py-0.5">
            <Users className="w-2.5 h-2.5 text-white" />
            <span className="text-[9px] font-black text-white">{activePlayers.length}/{gameData.maxPlayers}</span>
          </div>
        </div>
      </div>

      {/* Players */}
      <div className="bg-white dark:bg-gray-900 px-3 py-2.5 space-y-1.5">
        {gameData.players.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${p.status === 'knocked_out' ? 'bg-gray-500/20 text-gray-500' : 'bg-cyan-500/20 text-cyan-500'}`}>
              {p.status === 'knocked_out' ? '💀' : i + 1}
            </div>
            <span className={`text-xs font-semibold truncate flex-1 ${p.status === 'knocked_out' ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'}`}>{p.name}</span>
            {isFinished && gameData.winner === p.name && <Trophy className="w-3 h-3 text-yellow-500 shrink-0" />}
          </div>
        ))}

        {/* Open slot indicators */}
        {Array.from({ length: Math.max(0, gameData.maxPlayers - activePlayers.length) }).map((_, i) => (
          <div key={`open-${i}`} className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-gray-200/30 flex items-center justify-center shrink-0">
              <span className="text-[8px] text-gray-500">?</span>
            </div>
            <span className="text-xs text-gray-400 italic">Open slot</span>
          </div>
        ))}

        {/* Bench queue */}
        {gameData.bench.length > 0 && (
          <div className="pt-1.5 border-t border-gray-100 dark:border-gray-800 space-y-1">
            {gameData.bench.map((p, i) => (
              <div key={p.id} className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-yellow-500 shrink-0" />
                <span className="text-[10px] text-yellow-600 dark:text-yellow-400 truncate">#{i + 1} {p.name}</span>
              </div>
            ))}
          </div>
        )}

        {isFinished && (
          <div className="pt-1.5 border-t border-gray-100 dark:border-gray-800 text-center">
            {gameData.winner
              ? <p className="text-xs font-black text-yellow-600 dark:text-yellow-400">🏆 {gameData.winner} wins!</p>
              : <p className="text-xs font-bold text-gray-500 dark:text-gray-400">Game over</p>}
          </div>
        )}
      </div>

      {/* Actions */}
      {!isFinished && (
        <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-2 flex gap-2">
          {canJoin && (
            <button onClick={() => onJoin?.(message.id)} className={`flex-1 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity`}>
              <Zap className="w-3 h-3 inline mr-1" />Join
            </button>
          )}
          {canQueue && (
            <button onClick={() => onJoin?.(message.id)} className="flex-1 py-1.5 text-xs font-black rounded-lg bg-yellow-600/80 text-yellow-100 hover:opacity-90 transition-opacity">
              <Clock className="w-3 h-3 inline mr-1" />Queue
            </button>
          )}
          {(isMyActive || (myEntry && !isMyActive)) && (
            <button onClick={() => onLaunch?.(message)} className={`flex-1 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity`}>
              Open
            </button>
          )}
          {isOnBench && (
            <button onClick={() => onLaunch?.(message)} className="flex-1 py-1.5 text-xs font-black rounded-lg bg-yellow-600/80 text-yellow-100 hover:opacity-90 transition-opacity">
              <Clock className="w-3 h-3 inline mr-1" />Benched
            </button>
          )}
          {!canJoin && !canQueue && !myEntry && !myBenchEntry && (
            <button onClick={() => onSpectate?.(message)} className="flex-1 py-1.5 text-xs font-black rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:opacity-90 transition-opacity">
              Spectate
            </button>
          )}
        </div>
      )}
    </div>
    </div>
  );
};

const PlayerRow = ({ num, name, color, isWinner }) => {
  const colorMap = { cyan: 'bg-cyan-500/20 text-cyan-500', purple: 'bg-purple-500/20 text-purple-500' };
  return (
    <div className="flex items-center gap-2">
      <div className={`w-6 h-6 rounded-full ${colorMap[color] || colorMap.cyan} flex items-center justify-center text-xs font-black shrink-0`}>{num}</div>
      {name
        ? <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{name}</span>
        : <span className="text-sm text-gray-400 italic">Waiting...</span>}
      {isWinner && <Trophy className="w-3.5 h-3.5 text-yellow-500 ml-auto shrink-0" />}
    </div>
  );
};

export default TetrisMessage;
