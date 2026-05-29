import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Gamepad2, Trophy } from 'lucide-react';
import socketManager from '../socket';
import { createInitialState, tick, changeDir, getSpeed, GRID } from './games/SnakeEngine';
import { getVibeById } from '../utils/vibes';

export default function SnakePanel({ message, currentUser, roomVibe }) {
  const messageId = message?.id;
  const gameData  = message?.gameData;
  const vibe      = getVibeById(roomVibe);
  const userId    = currentUser?.id || currentUser?.socketId;
  const nickname  = currentUser?.nickname;
  const isSolo    = !!gameData?.soloMode;
  const isHost    = gameData?.hostId === userId;
  const isMember  = gameData?.players?.some(
    p => p.id === userId || (nickname && p.name === nickname)
  );

  // Solo: start immediately on mount (game is not null); race: start on server event
  const shouldAutoStart = isSolo && isMember && gameData?.status !== 'finished';

  // stateRef and gameState initialized together so the board is never null for solo
  const stateRef     = useRef(shouldAutoStart ? createInitialState(Date.now()) : null);
  const tickRef      = useRef(null);
  const scoreRef     = useRef(0);

  const [gameState,    setGameState]    = useState(stateRef.current);
  const [gameOver,     setGameOver]     = useState(false);
  const [gameKey,      setGameKey]      = useState(0);
  const [scores,       setScores]       = useState(gameData?.scores || {});
  const [players,      setPlayers]      = useState(gameData?.players || []);
  const [serverStatus, setServerStatus] = useState(gameData?.status || 'waiting');
  const [winner,       setWinner]       = useState(gameData?.winner || null);

  // Sync non-game fields from server (scores, player list, status)
  useEffect(() => {
    if (!gameData) return;
    setPlayers(gameData.players || []);
    setScores(gameData.scores || {});
    setServerStatus(gameData.status || 'waiting');
    if (gameData.winner) setWinner(gameData.winner);
  }, [gameData]);

  // Solo: tell server we started (fire-and-forget, only when game was in 'waiting' state)
  useEffect(() => {
    if (shouldAutoStart && gameData?.status === 'waiting') {
      socketManager.emit('snake-start', { messageId, soloMode: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reinitialize game state (used for New Game and race start)
  const initGame = useCallback(() => {
    clearInterval(tickRef.current);
    scoreRef.current = 0;
    setGameOver(false);
    const state = createInitialState(Date.now());
    stateRef.current = state;
    setGameState(state);
  }, []);

  // Race socket listeners
  useEffect(() => {
    if (!messageId) return;
    const onStarted = ({ messageId: mid }) => {
      if (mid !== messageId || isSolo) return;
      initGame();
    };
    const onScores = ({ messageId: mid, scores: s }) => {
      if (mid !== messageId) return;
      setScores(s || {});
    };
    const onOver = ({ messageId: mid, scores: s, winner: w }) => {
      if (mid !== messageId) return;
      setScores(s || {});
      if (w) setWinner(w);
      setServerStatus('finished');
      clearInterval(tickRef.current);
    };
    socketManager.on('snake-started',       onStarted);
    socketManager.on('snake-scores-update', onScores);
    socketManager.on('snake-game-over',     onOver);
    return () => {
      clearInterval(tickRef.current);
      socketManager.off('snake-started',       onStarted);
      socketManager.off('snake-scores-update', onScores);
      socketManager.off('snake-game-over',     onOver);
    };
  }, [messageId, isSolo, initGame]);

  // Game tick loop — restarts when gameKey or level changes
  useEffect(() => {
    if (!gameState || gameOver || serverStatus === 'finished') return;
    const speed = getSpeed(gameState.level);
    tickRef.current = setInterval(() => {
      stateRef.current = tick(stateRef.current);
      const s = stateRef.current;
      setGameState({ ...s });
      if (s.dead) {
        clearInterval(tickRef.current);
        setGameOver(true);
        socketManager.emit('snake-died', { messageId, score: s.score });
        return;
      }
      if (s.score !== scoreRef.current) {
        scoreRef.current = s.score;
        if (!isSolo) socketManager.emit('snake-score-update', { messageId, score: s.score });
      }
    }, speed);
    return () => clearInterval(tickRef.current);
  }, [gameKey, gameState?.level, gameOver, serverStatus, messageId, isSolo]); // eslint-disable-line

  // Direction control
  const handleDir = useCallback((dir) => {
    if (!stateRef.current || stateRef.current.dead) return;
    stateRef.current = changeDir(stateRef.current, dir);
    setGameState(prev => prev ? { ...prev, dir: stateRef.current.dir } : prev);
  }, []);

  // Keyboard
  useEffect(() => {
    const MAP = {
      ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
      w:'up', s:'down', a:'left', d:'right',
    };
    const onKey = (e) => { const d = MAP[e.key]; if (d) { e.preventDefault(); handleDir(d); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleDir]);

  // Touch swipe
  useEffect(() => {
    let sx, sy;
    const onTouchStart = (e) => { sx = e.touches[0]?.clientX; sy = e.touches[0]?.clientY; };
    const onTouchEnd   = (e) => {
      if (sx == null || sy == null) return;
      const dx = (e.changedTouches[0]?.clientX ?? 0) - sx;
      const dy = (e.changedTouches[0]?.clientY ?? 0) - sy;
      if (Math.abs(dx) > Math.abs(dy) + 10) handleDir(dx > 0 ? 'right' : 'left');
      else if (Math.abs(dy) > Math.abs(dx) + 10) handleDir(dy > 0 ? 'down' : 'up');
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend',   onTouchEnd,   { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend',   onTouchEnd);
    };
  }, [handleDir]);

  const handleNewGame = () => {
    if (!isSolo) return;
    setGameKey(k => k + 1);
    initGame();
    socketManager.emit('snake-start', { messageId, soloMode: true });
  };

  // Render helpers
  const accentColor = vibe?.colors?.primary || '#22c55e';
  const snakeColor  = vibe?.colors?.primary || '#4ade80';
  const snakeSet = gameState
    ? new Set(gameState.snake.map(([r, c]) => `${r},${c}`))
    : new Set();
  const headKey = gameState ? `${gameState.snake[0][0]},${gameState.snake[0][1]}` : '';
  const foodKey = gameState ? `${gameState.food[0]},${gameState.food[1]}` : '';
  const myScore = gameState?.score ?? (scores[userId] ?? 0);
  const sortedPlayers = [...players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  const modeBadge = isSolo ? 'Solo' : `Race ${players.length}P`;

  return (
    <div className="flex h-full overflow-hidden bg-gray-950">

      {/* ── Board area ──────────────────────────────────────── */}
      <div className="relative flex-1 min-w-0 min-h-0 flex items-center justify-center p-2">
        {gameState ? (
          <div
            className="relative rounded-lg overflow-hidden w-full aspect-square"
            style={{ maxWidth: 300, background: '#111827' }}
          >
            {/* Game-over / finished overlay */}
            {(gameOver || serverStatus === 'finished') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 gap-2">
                {serverStatus === 'finished' && winner && !isSolo ? (
                  <>
                    <Trophy className="w-12 h-12 text-yellow-400" />
                    <p className="text-white font-black text-xl">
                      {winner.name === nickname ? 'YOU WIN!' : `${winner.name} wins!`}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-5xl">💀</p>
                    <p className="text-white font-black text-xl">GAME OVER</p>
                  </>
                )}
                <p className="text-gray-300 text-sm">Score: {gameState.score}</p>
                {isSolo && <p className="text-gray-500 text-xs">↺ tap New Game</p>}
              </div>
            )}

            {/* Board cells */}
            {Array.from({ length: GRID }, (_, r) =>
              Array.from({ length: GRID }, (_, c) => {
                const key    = `${r},${c}`;
                const isSnake = snakeSet.has(key);
                const isHead  = key === headKey;
                const isFood  = key === foodKey;
                if (!isSnake && !isFood) return null;
                const pct = 100 / GRID;
                return (
                  <div
                    key={key}
                    className="absolute"
                    style={{
                      left:   `calc(${c * pct}% + 1px)`,
                      top:    `calc(${r * pct}% + 1px)`,
                      width:  `calc(${pct}% - 2px)`,
                      height: `calc(${pct}% - 2px)`,
                      background: isFood ? '#f87171' : isHead ? '#fff' : snakeColor,
                      borderRadius: isHead ? 4 : 2,
                    }}
                  />
                );
              })
            )}
          </div>
        ) : (
          /* Race lobby — solo never reaches here */
          <div className="flex flex-col items-center gap-4 px-4 text-center">
            {serverStatus === 'waiting' && isHost && (
              <>
                <p className="text-sm font-bold text-gray-300">🏁 Race Mode</p>
                <p className="text-xs text-gray-400">
                  {players.length > 1
                    ? `${players.length} players ready`
                    : 'Waiting for others to join…'}
                </p>
                <button
                  onClick={() => socketManager.emit('snake-start', { messageId })}
                  className="px-6 py-3 rounded-xl font-black text-sm text-white"
                  style={{ background: accentColor }}
                >
                  🏁 Start Race
                </button>
              </>
            )}
            {serverStatus === 'waiting' && !isHost && (
              <p className="text-sm text-gray-400">Waiting for host to start…</p>
            )}
            {serverStatus === 'finished' && (
              <p className="text-white font-bold">
                {winner ? `🏆 ${winner.name} wins!` : 'Race Over'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Side panel ──────────────────────────────────────── */}
      <div className="flex-shrink-0 w-32 flex flex-col bg-gray-900 border-l border-gray-800">

        {/* Header */}
        <div className={`px-3 py-2 ${vibe.accentClass} flex items-center gap-2 shrink-0`}>
          <span className="text-white text-sm">🐍</span>
          <span className="text-[10px] font-black text-white uppercase tracking-widest truncate">
            {modeBadge}
          </span>
          {serverStatus === 'playing' && (
            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
          )}
        </div>

        <div className="flex-1 p-3 flex flex-col gap-3 overflow-y-auto">

          {/* My score */}
          <div className="bg-gray-800 rounded-xl p-3">
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Score</p>
            <p className="text-xl font-black text-white tabular-nums">{myScore}</p>
            {gameState && (
              <p className="text-[9px] text-gray-400">
                Lv <span className="text-white font-bold">{gameState.level}</span>
              </p>
            )}
          </div>

          {/* Race live scores */}
          {!isSolo && sortedPlayers.length > 0 && (
            <div className="bg-gray-800/50 rounded-lg p-2 space-y-1">
              <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-0.5">Race</p>
              {sortedPlayers.map((p, i) => (
                <div key={p.id} className="flex items-center gap-1">
                  {i === 0 && serverStatus === 'finished' && (
                    <Trophy className="w-2.5 h-2.5 text-yellow-400 shrink-0" />
                  )}
                  <span className="text-[10px] text-gray-400 truncate flex-1">{p.name}</span>
                  <span className="text-[10px] font-black text-white tabular-nums">
                    {scores[p.id] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-auto flex flex-col gap-2">
            {isSolo && (
              <button
                onClick={handleNewGame}
                className="w-full py-1.5 text-[9px] font-black rounded-lg bg-cyan-800/30 text-cyan-400 border border-cyan-700/30 hover:bg-cyan-800/60 transition-colors"
              >
                ↺ New Game
              </button>
            )}
            <button
              onClick={() => {
                if (isSolo) socketManager.emit('delete-message', { messageId });
                else socketManager.emit('snake-forfeit', { messageId });
              }}
              className="w-full py-1.5 text-[9px] font-black rounded-lg bg-red-900/30 text-red-400 border border-red-800/40 hover:bg-red-900/60 transition-colors"
            >
              {isSolo ? 'End Game' : 'Forfeit'}
            </button>
          </div>

          {/* D-pad */}
          <div className="grid grid-cols-3 gap-1">
            <div />
            <button
              onClick={() => handleDir('up')}
              className="aspect-square rounded-md bg-gray-700 flex items-center justify-center text-sm font-bold active:scale-90 transition-transform select-none"
            >↑</button>
            <div />
            <button
              onClick={() => handleDir('left')}
              className="aspect-square rounded-md bg-gray-700 flex items-center justify-center text-sm font-bold active:scale-90 transition-transform select-none"
            >←</button>
            <button
              onClick={() => handleDir('down')}
              className="aspect-square rounded-md bg-gray-700 flex items-center justify-center text-sm font-bold active:scale-90 transition-transform select-none"
            >↓</button>
            <button
              onClick={() => handleDir('right')}
              className="aspect-square rounded-md bg-gray-700 flex items-center justify-center text-sm font-bold active:scale-90 transition-transform select-none"
            >→</button>
          </div>

          {/* Controls hint */}
          <div className="pt-2 border-t border-gray-800 text-[8px] text-gray-600 leading-relaxed">
            <p>← → ↑ ↓ or WASD</p>
            <p>Swipe on mobile</p>
          </div>
        </div>
      </div>
    </div>
  );
}
