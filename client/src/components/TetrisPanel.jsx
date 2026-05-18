import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Gamepad2, Trophy, Zap, WifiOff, Clock } from 'lucide-react';
import socketManager from '../socket';
import { getVibeById } from '../utils/vibes';
import TetrisGame from './games/TetrisGame';

const GARBAGE_MAP = [0, 0, 1, 2, 4];
const STALE_MS = 5000;

// ── Mini board (opponent/spectator/bench view) ────────────────────
const CELL_COLORS = ['','#00e5e5','#e5e500','#9900cc','#00cc00','#cc0000','#0033cc','#cc7700','#445566'];
const CELL = 7;
const COLS = 10;
const ROWS = 20;

const MiniBoard = ({ matrix, label, score, stale }) => (
  <div className="flex flex-col items-center gap-1">
    {label && <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 truncate max-w-[80px]">{label}</p>}
    <div className="relative">
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
        gridTemplateRows: `repeat(${ROWS}, ${CELL}px)`,
        gap: 1, background: '#111827', padding: 2, borderRadius: 4,
        opacity: stale ? 0.45 : 1, transition: 'opacity 0.3s',
      }}>
        {matrix
          ? matrix.map((row, ri) => row.map((cell, ci) => (
              <div key={`${ri}-${ci}`} style={{ width: CELL, height: CELL, borderRadius: 1,
                background: cell ? (CELL_COLORS[cell] || '#22d3ee') : '#1f2937' }} />
            )))
          : Array.from({ length: ROWS * COLS }).map((_, i) => (
              <div key={i} style={{ width: CELL, height: CELL, background: '#1f2937', borderRadius: 1 }} />
            ))}
      </div>
      {stale && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm">📶</span>
        </div>
      )}
    </div>
    {score !== undefined && <p className="text-[10px] font-black text-white tabular-nums">{(score ?? 0).toLocaleString()}</p>}
  </div>
);

// ── Spectator / bench / knocked-out shell ─────────────────────────
const WatchView = ({ gameData, playerStates, stalePlayers, label, labelColor = 'text-gray-400', icon, messageId }) => {
  const activePlayers = (gameData.players || []).filter(p => p.status === 'active');
  return (
    <div className="flex h-full flex-col bg-gray-950 p-4 gap-4 overflow-y-auto">
      <div className="flex items-center gap-2">
        {icon}
        <span className={`text-xs font-black uppercase tracking-widest ${labelColor}`}>{label}</span>
      </div>
      <div className="flex flex-wrap gap-4 justify-center">
        {activePlayers.map(p => {
          const s = playerStates[p.id];
          return (
            <MiniBoard key={p.id} matrix={s?.matrix} label={p.name}
              score={s?.score} stale={stalePlayers.has(p.id)} />
          );
        })}
        {activePlayers.length === 0 && (
          <p className="text-xs text-gray-600 italic">No active players right now…</p>
        )}
      </div>
      {gameData.bench?.length > 0 && (
        <div className="border-t border-gray-800 pt-2 space-y-0.5">
          <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-1">Bench queue</p>
          {gameData.bench.map((p, i) => (
            <p key={p.id} className="text-[10px] text-gray-500">#{i + 1} {p.name}</p>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────
const TetrisPanel = ({ message, currentUser, roomVibe }) => {
  const [myScore, setMyScore] = useState(0);
  const [myLines, setMyLines] = useState(0);
  const [myLevel, setMyLevel] = useState(1);
  // { [playerId]: { score, lines, level, matrix, lastSeen } }
  const [playerStates, setPlayerStates] = useState({});
  const [stalePlayers, setStalePlayers] = useState(new Set());
  const [disconnectedPlayers, setDisconnectedPlayers] = useState(new Set());
  const [gameOver, setGameOver] = useState(null); // 'won' | 'lost' | 'draw'
  const [garbageTotal, setGarbageTotal] = useState(0);
  const [gameKey, setGameKey] = useState(0);

  const relayThrottleRef = useRef(0);
  const prevEndedAtRef = useRef(null);

  const vibe = getVibeById(roomVibe);
  const gameData = message?.gameData;
  const messageId = message?.id;
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const currentNickname = currentUser?.nickname;

  // ── Role detection ────────────────────────────────────────────
  const isNewSchema = !!gameData?.players;

  // Legacy
  const legacyP1 = !isNewSchema && (gameData?.player1?.id === currentUserId || (currentNickname && gameData?.player1?.name === currentNickname));
  const legacyP2 = !isNewSchema && (gameData?.player2?.id === currentUserId || (currentNickname && gameData?.player2?.name === currentNickname));

  // New
  const myEntry = isNewSchema ? gameData.players.find(p => p.id === currentUserId || (currentNickname && p.name === currentNickname)) : null;
  const myBenchEntry = isNewSchema ? gameData.bench.find(p => p.id === currentUserId || (currentNickname && p.name === currentNickname)) : null;
  const isActive = myEntry?.status === 'active';
  const isKnockedOut = myEntry?.status === 'knocked_out';
  const isOnBench = !!myBenchEntry;

  const isPlaying = isNewSchema ? isActive : (legacyP1 || legacyP2);
  const isSpectator = isNewSchema ? (!myEntry && !myBenchEntry) : (!legacyP1 && !legacyP2);

  const myPlayerId = myEntry?.id || (legacyP1 ? gameData?.player1?.id : gameData?.player2?.id) || currentUserId;

  const isCreator = isNewSchema
    ? (gameData.creatorId === currentUserId || gameData.creatorId === currentUser?.id ||
       (gameData.players[0] && (gameData.players[0].id === currentUserId || gameData.players[0].name === currentNickname)))
    : legacyP1;

  const wasSolo = isNewSchema ? !gameData.startedAt : !gameData?.player2;

  // ── Stale board detection ─────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setStalePlayers(() => {
        const next = new Set();
        Object.entries(playerStates).forEach(([pid, s]) => {
          if (s.lastSeen && now - s.lastSeen > STALE_MS) next.add(pid);
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [playerStates]);

  // ── Multiplayer callbacks ─────────────────────────────────────
  const handleStateUpdate = useCallback(({ score, lines, level, matrix }) => {
    setMyScore(score); setMyLines(lines); setMyLevel(level);
    if (!isSpectator && messageId) {
      const now = Date.now();
      if (now - relayThrottleRef.current >= 400) {
        relayThrottleRef.current = now;
        socketManager.emit('tetris-state-update', { messageId, score, lines, level, matrix });
      }
    }
  }, [isSpectator, messageId]);

  const handleLinesCleared = useCallback((count) => {
    const garbage = GARBAGE_MAP[Math.min(count, 4)] ?? 0;
    if (garbage > 0 && !isSpectator && messageId) {
      socketManager.emit('tetris-garbage', { messageId, count: garbage });
    }
  }, [isSpectator, messageId]);

  const handleGameOver = useCallback(() => {
    setGameOver('lost');
    if (!isSpectator && messageId) socketManager.emit('tetris-game-over', { messageId });
  }, [isSpectator, messageId]);

  const handleGameRestart = useCallback(() => {
    if (wasSolo && messageId) {
      setGameOver(null);
      setGarbageTotal(0);
      socketManager.emit('tetris-solo-reset', { messageId });
    }
  }, [wasSolo, messageId]);

  const handleNewGame = useCallback(() => {
    if (!wasSolo) return;
    setGameOver(null);
    setGarbageTotal(0);
    setGameKey(k => k + 1);
    if (messageId) socketManager.emit('tetris-solo-reset', { messageId });
  }, [wasSolo, messageId]);

  // ── Socket events ─────────────────────────────────────────────
  useEffect(() => {
    const onOpponentState = ({ messageId: mid, role, playerId, score, lines, level, matrix }) => {
      if (mid !== messageId) return;
      // Unify: legacy uses role, new uses playerId
      const pid = playerId
        || (role === 'player1' ? gameData?.player1?.id : gameData?.player2?.id);
      if (!pid) return;
      setDisconnectedPlayers(prev => { const n = new Set(prev); n.delete(pid); return n; });
      setPlayerStates(prev => ({ ...prev, [pid]: { score, lines, level, matrix, lastSeen: Date.now() } }));
    };

    const onAddGarbage = ({ messageId: mid, count }) => {
      if (mid !== messageId) return;
      if (isPlaying) setGarbageTotal(prev => prev + count);
    };

    const onDisconnected = ({ messageId: mid, playerId }) => {
      if (mid !== messageId) return;
      if (playerId) {
        setDisconnectedPlayers(prev => new Set([...prev, playerId]));
      } else if (gameData?.player2) {
        // Legacy: mark opponent
        setDisconnectedPlayers(prev => new Set([...prev, gameData.player2.id]));
      }
    };

    const onReconnected = ({ messageId: mid, playerId }) => {
      if (mid !== messageId) return;
      if (playerId) setDisconnectedPlayers(prev => { const n = new Set(prev); n.delete(playerId); return n; });
      else setDisconnectedPlayers(new Set());
    };

    const onGameRestart = ({ messageId: mid }) => {
      if (mid !== messageId) return;
      setGameKey(k => k + 1);
      setGameOver(null);
      setGarbageTotal(0);
      setPlayerStates({});
    };

    const onSlotOpened = ({ messageId: mid }) => {
      if (mid !== messageId) return;
      setGameKey(k => k + 1);
      setGameOver(null);
      setGarbageTotal(0);
    };

    socketManager.on('tetris-opponent-state', onOpponentState);
    socketManager.on('tetris-add-garbage', onAddGarbage);
    socketManager.on('tetris-opponent-disconnected', onDisconnected);
    socketManager.on('tetris-opponent-reconnected', onReconnected);
    socketManager.on('tetris-game-restart', onGameRestart);
    socketManager.on('tetris-slot-opened', onSlotOpened);

    return () => {
      socketManager.off('tetris-opponent-state', onOpponentState);
      socketManager.off('tetris-add-garbage', onAddGarbage);
      socketManager.off('tetris-opponent-disconnected', onDisconnected);
      socketManager.off('tetris-opponent-reconnected', onReconnected);
      socketManager.off('tetris-game-restart', onGameRestart);
      socketManager.off('tetris-slot-opened', onSlotOpened);
    };
  }, [messageId, isPlaying, gameData]);

  // ── Game-over from server (finished status) ───────────────────
  useEffect(() => {
    if (!gameData || gameData.status !== 'finished') return;
    if (gameData.endedAt === prevEndedAtRef.current) return;
    prevEndedAtRef.current = gameData.endedAt;
    if (isSpectator) return;

    if (!isNewSchema) {
      if (gameData.winner) {
        const name = gameData.winner === 'player1' ? gameData.player1?.name : gameData.player2?.name;
        setGameOver(name === currentNickname ? 'won' : 'lost');
      }
      return;
    }

    if (gameData.winner) {
      setGameOver(gameData.winner === currentNickname ? 'won' : 'lost');
    } else if (gameData.players?.some(p => p.status === 'knocked_out')) {
      setGameOver('draw');
    }
  }, [gameData?.status, gameData?.winner, gameData?.endedAt, isSpectator, currentNickname, isNewSchema]);

  if (!gameData) return null;

  // ── Spectator view ────────────────────────────────────────────
  if (isSpectator) {
    return (
      <WatchView
        gameData={gameData} playerStates={playerStates} stalePlayers={stalePlayers}
        label="Spectating" icon={<Gamepad2 className="w-4 h-4 text-cyan-400" />}
        messageId={messageId}
      />
    );
  }

  // ── Knocked-out view ──────────────────────────────────────────
  if (isKnockedOut) {
    return (
      <WatchView
        gameData={gameData} playerStates={playerStates} stalePlayers={stalePlayers}
        label="Eliminated 💀" labelColor="text-red-400"
        icon={<span className="text-base">💀</span>}
        messageId={messageId}
      />
    );
  }

  // ── Bench view ────────────────────────────────────────────────
  if (isOnBench) {
    const myPos = gameData.bench.findIndex(p => p.id === currentUserId || p.name === currentNickname);
    return (
      <div className="flex h-full flex-col bg-gray-950 p-4 gap-4 overflow-y-auto">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-yellow-400" />
          <span className="text-xs font-black text-yellow-400 uppercase tracking-widest">
            Bench — #{myPos + 1} in queue
          </span>
        </div>
        <p className="text-[11px] text-gray-500">
          You're queued. You'll be called in when a slot opens.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          {(gameData.players || []).filter(p => p.status === 'active').map(p => {
            const s = playerStates[p.id];
            return (
              <MiniBoard key={p.id} matrix={s?.matrix} label={p.name}
                score={s?.score} stale={stalePlayers.has(p.id)} />
            );
          })}
        </div>
        <button
          onClick={() => socketManager.emit('tetris-forfeit', { messageId })}
          className="w-full py-1.5 text-[9px] font-black rounded-lg bg-red-900/30 text-red-400 border border-red-800/40 hover:bg-red-900/60 transition-colors mt-auto"
        >Leave Queue</button>
      </div>
    );
  }

  // ── Active player view ────────────────────────────────────────
  const opponents = isNewSchema
    ? (gameData.players || []).filter(p => p.status === 'active' && p.id !== myPlayerId && p.name !== currentNickname)
    : legacyP1 && gameData.player2 ? [gameData.player2]
    : legacyP2 ? [gameData.player1]
    : [];

  const opponentIdFor = (p) => isNewSchema ? p.id : (legacyP1 ? gameData.player2?.id : gameData.player1?.id);

  const activeCount = isNewSchema
    ? (gameData.players || []).filter(p => p.status === 'active').length
    : (gameData.player2 ? 2 : 1);

  const modeBadge = wasSolo && activeCount === 1 ? 'Solo' : `FFA ${activeCount}P`;

  return (
    <div className="flex h-full overflow-hidden bg-gray-950">
      {/* ── Game board ─────────────────────────────────────────── */}
      <div className="relative flex-1 min-w-0 min-h-0">
        <TetrisGame
          key={gameKey}
          onStateUpdate={handleStateUpdate}
          onLinesCleared={handleLinesCleared}
          onGameOver={handleGameOver}
          onGameRestart={handleGameRestart}
          garbageTotal={garbageTotal}
        />

        {gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-30 pointer-events-none">
            <div className="text-center space-y-2 px-4">
              {gameOver === 'won'
                ? <><Trophy className="w-14 h-14 text-yellow-400 mx-auto" /><p className="text-white text-2xl font-black">YOU WIN!</p></>
                : gameOver === 'draw'
                ? <><p className="text-4xl">🤝</p><p className="text-white text-2xl font-black">DRAW</p></>
                : <><p className="text-5xl">💀</p><p className="text-white text-2xl font-black">TOPPED OUT</p></>}
              <p className="text-gray-300 text-sm">Score: {myScore.toLocaleString()}</p>
              {wasSolo && <p className="text-gray-500 text-xs">Press R or use New Game</p>}
            </div>
          </div>
        )}
      </div>

      {/* ── Side panel ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 w-36 flex flex-col bg-gray-900 overflow-y-auto border-l border-gray-800">
        {/* Mode badge */}
        <div className={`px-3 py-2 ${vibe.accentClass} flex items-center gap-2 shrink-0`}>
          <Gamepad2 className="w-3.5 h-3.5 text-white" />
          <span className="text-[10px] font-black text-white uppercase tracking-widest">{modeBadge}</span>
          {gameData.status === 'playing' && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
        </div>

        <div className="flex-1 p-3 flex flex-col gap-3">
          {/* My stats */}
          <div className="bg-gray-800 rounded-xl p-3">
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">You</p>
            <p className="text-xl font-black text-white tabular-nums">{myScore.toLocaleString()}</p>
            <div className="flex gap-3 mt-0.5">
              <span className="text-[9px] text-gray-400">Lines <span className="text-white font-bold">{myLines}</span></span>
              <span className="text-[9px] text-gray-400">Lv <span className="text-white font-bold">{myLevel}</span></span>
            </div>
          </div>

          {/* Opponents */}
          {opponents.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-700" />
                <span className="text-[9px] font-black text-cyan-500 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5" />VS
                </span>
                <div className="flex-1 h-px bg-gray-700" />
              </div>
              {opponents.map(p => {
                const pid = opponentIdFor(p);
                const s = playerStates[pid];
                const isDisc = disconnectedPlayers.has(pid);
                return (
                  <div key={pid} className="bg-gray-800 rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-1">
                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest truncate flex-1">{p.name}</p>
                      {isDisc && <WifiOff className="w-2.5 h-2.5 text-yellow-400 shrink-0" />}
                    </div>
                    {s ? (
                      <>
                        <p className="text-base font-black text-white tabular-nums">{(s.score ?? 0).toLocaleString()}</p>
                        <MiniBoard matrix={s.matrix} stale={stalePlayers.has(pid)} />
                      </>
                    ) : (
                      <p className="text-[10px] text-gray-600 italic">Waiting…</p>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* Bench queue */}
          {isNewSchema && gameData.bench?.length > 0 && (
            <div className="bg-gray-800/50 rounded-lg p-2 space-y-0.5">
              <p className="text-[9px] text-gray-500 uppercase tracking-widest">Bench</p>
              {gameData.bench.map((p, i) => (
                <p key={p.id} className="text-[10px] text-gray-400">#{i + 1} {p.name}</p>
              ))}
            </div>
          )}

          {/* Disconnect warning */}
          {disconnectedPlayers.size > 0 && !wasSolo && !gameOver && (
            <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-2.5 py-1.5">
              <WifiOff className="w-3 h-3 text-yellow-400 shrink-0" />
              <p className="text-[9px] text-yellow-400 font-bold">Player disconnected — auto-forfeit in ~30s</p>
            </div>
          )}

          {/* Action buttons */}
          {!gameOver ? (
            <>
              {isCreator && isNewSchema && gameData.maxPlayers < 6 && (
                <button
                  onClick={() => socketManager.emit('tetris-increase-slots', { messageId })}
                  className="w-full py-1.5 text-[9px] font-black rounded-lg bg-indigo-900/40 text-indigo-300 border border-indigo-700/30 hover:bg-indigo-900/70 transition-colors"
                >
                  ⊕ Add Slot ({gameData.maxPlayers}/6)
                </button>
              )}
              {isNewSchema && isActive && !wasSolo && (
                <button
                  onClick={() => socketManager.emit('tetris-tag-out', { messageId })}
                  className="w-full py-1.5 text-[9px] font-black rounded-lg bg-amber-900/30 text-amber-400 border border-amber-800/40 hover:bg-amber-900/60 transition-colors"
                >⇄ Tag Out</button>
              )}
              {wasSolo && (
                <button
                  onClick={handleNewGame}
                  className="w-full py-1.5 text-[9px] font-black rounded-lg bg-cyan-800/30 text-cyan-400 border border-cyan-700/30 hover:bg-cyan-800/60 transition-colors"
                >{gameData?.status === 'finished' ? '↺ New Game' : '↺ Reset'}</button>
              )}
              <button
                onClick={() => {
                  if (wasSolo) socketManager.emit('delete-message', { messageId });
                  else socketManager.emit('tetris-forfeit', { messageId });
                }}
                className="w-full py-1.5 text-[9px] font-black rounded-lg bg-red-900/30 text-red-400 border border-red-800/40 hover:bg-red-900/60 transition-colors"
              >{wasSolo ? 'End Game' : 'Forfeit'}</button>
            </>
          ) : (
            wasSolo && (
              <button
                onClick={handleNewGame}
                className="w-full py-1.5 text-[9px] font-black rounded-lg bg-cyan-800/50 text-cyan-300 border border-cyan-700/40 hover:bg-cyan-800/80 transition-colors"
              >↺ New Game</button>
            )
          )}

          {/* Controls hint */}
          <div className="mt-auto pt-2 border-t border-gray-800 text-[9px] text-gray-600 leading-relaxed">
            <p>← → Move &nbsp;↑ Rotate &nbsp;↓ Soft drop</p>
            <p>Space Hard drop &nbsp;P Pause &nbsp;S Sound</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TetrisPanel;
