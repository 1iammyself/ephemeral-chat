import React, { useState, useEffect, useCallback, useRef } from 'react';
import socketManager from '../socket';
import { createInitialState, tick, changeDir, getSpeed, GRID } from './games/SnakeEngine';
import { getVibeById } from '../utils/vibes';

// Cell size adapts to container: max 16px, min 12px
const CELL = 14;

export default function SnakePanel({ message, currentUser, roomVibe }) {
  const [gameState, setGameState] = useState(null);
  const [scores, setScores] = useState({});
  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState('waiting');
  const [winner, setWinner] = useState(null);
  const stateRef = useRef(null);
  const tickRef = useRef(null);
  const lastScoreRef = useRef(0);

  const messageId = message?.id;
  const gameData = message?.gameData;
  const vibe = getVibeById(roomVibe);
  const userId = currentUser?.id || currentUser?.socketId;
  const isSolo = gameData?.soloMode;
  const isHost = gameData?.hostId === userId;
  const isMember = gameData?.players?.some(p => p.id === userId);
  const isFinished = status === 'finished';

  useEffect(() => {
    if (!gameData) return;
    setPlayers(gameData.players || []);
    setScores(gameData.scores || {});
    setStatus(gameData.status || 'waiting');
  }, [gameData]);

  useEffect(() => {
    if (!messageId) return;
    const onStarted = ({ messageId: mid }) => {
      if (mid !== messageId || !isMember) return;
      const state = createInitialState(Date.now());
      stateRef.current = state;
      setGameState(state);
    };
    const onScores = ({ messageId: mid, scores: s }) => {
      if (mid !== messageId) return;
      setScores(s || {});
    };
    const onOver = ({ messageId: mid, scores: s, winner: w }) => {
      if (mid !== messageId) return;
      setScores(s || {}); setWinner(w); setStatus('finished');
      clearInterval(tickRef.current);
    };
    socketManager.on('snake-started', onStarted);
    socketManager.on('snake-scores-update', onScores);
    socketManager.on('snake-game-over', onOver);
    return () => {
      socketManager.off('snake-started', onStarted);
      socketManager.off('snake-scores-update', onScores);
      socketManager.off('snake-game-over', onOver);
    };
  }, [messageId, isMember]);

  // Game loop
  useEffect(() => {
    if (!gameState || gameState.dead || isFinished) return;
    const speed = getSpeed(gameState.level);
    tickRef.current = setInterval(() => {
      stateRef.current = tick(stateRef.current);
      setGameState({ ...stateRef.current });
      if (stateRef.current.dead) {
        clearInterval(tickRef.current);
        socketManager.emit('snake-died', { messageId, score: stateRef.current.score });
        return;
      }
      if (stateRef.current.score !== lastScoreRef.current) {
        lastScoreRef.current = stateRef.current.score;
        socketManager.emit('snake-score-update', { messageId, score: stateRef.current.score });
      }
    }, speed);
    return () => clearInterval(tickRef.current);
  }, [gameState?.level, gameState?.dead, isFinished, messageId]);

  const handleDir = useCallback((dir) => {
    if (!stateRef.current || stateRef.current.dead) return;
    stateRef.current = changeDir(stateRef.current, dir);
    setGameState(prev => prev ? { ...prev, dir: stateRef.current.dir } : prev);
  }, []);

  // Keyboard controls
  useEffect(() => {
    const keyMap = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', w:'up', s:'down', a:'left', d:'right' };
    const onKey = (e) => { const d = keyMap[e.key]; if (d) { e.preventDefault(); handleDir(d); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleDir]);

  // Swipe controls
  useEffect(() => {
    let sx, sy;
    const onStart = (e) => { sx = e.touches?.[0]?.clientX; sy = e.touches?.[0]?.clientY; };
    const onEnd = (e) => {
      if (!sx || !sy) return;
      const dx = e.changedTouches?.[0]?.clientX - sx;
      const dy = e.changedTouches?.[0]?.clientY - sy;
      if (Math.abs(dx) > Math.abs(dy) + 10) handleDir(dx > 0 ? 'right' : 'left');
      else if (Math.abs(dy) > Math.abs(dx) + 10) handleDir(dy > 0 ? 'down' : 'up');
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchend', onEnd); };
  }, [handleDir]);

  const handleStart = () => socketManager.emit('snake-start', { messageId });
  // Solo: emit only — state init happens in the onStarted handler to avoid double-init race condition
  const handlePlaySolo = () => {
    socketManager.emit('snake-start', { messageId, soloMode: true });
  };

  const accentColor = vibe?.colors?.primary || '#22c55e';
  const darkBg = vibe?.boardColors?.dark || '#14532d';
  const snakeColor = vibe?.colors?.primary || '#4ade80';
  const foodColor = '#f87171';

  const snakeSet = gameState ? new Set(gameState.snake.map(([r,c]) => `${r},${c}`)) : new Set();
  const isHead = gameState ? `${gameState.snake[0][0]},${gameState.snake[0][1]}` : '';
  const isFood = gameState ? `${gameState.food[0]},${gameState.food[1]}` : '';

  const sortedPlayers = [...players].sort((a,b) => (scores[b.id]||0) - (scores[a.id]||0));

  return (
    <div className="flex flex-col items-center p-3 h-full gap-3 overflow-y-auto">
      {/* Score + Level */}
      {gameState && (
        <div className="flex gap-4 text-sm font-semibold">
          <span className="text-gray-700 dark:text-gray-300">Score: <strong>{gameState.score}</strong></span>
          <span className="text-gray-500">Lv {gameState.level}</span>
        </div>
      )}

      {/* Board */}
      {gameState ? (
        <div className="relative rounded-lg overflow-hidden w-full max-w-[320px] aspect-square" style={{ background: darkBg }}>
          {gameState.dead && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
              <p className="text-white font-black text-xl">💀 {gameState.score}</p>
            </div>
          )}
          {Array.from({ length: GRID }, (_, r) =>
            Array.from({ length: GRID }, (_, c) => {
              const key = `${r},${c}`;
              const isSnake = snakeSet.has(key);
              const isHeadCell = key === isHead;
              const isFoodCell = key === isFood;
              if (!isSnake && !isFoodCell) return null;
              const pct = 100 / GRID;
              return (
                <div
                  key={key}
                  className="absolute"
                  style={{
                    left: `calc(${c * pct}% + 1px)`,
                    top: `calc(${r * pct}% + 1px)`,
                    width: `calc(${pct}% - 2px)`,
                    height: `calc(${pct}% - 2px)`,
                    background: isFoodCell ? foodColor : isHeadCell ? '#fff' : snakeColor,
                    opacity: isSnake ? (isHeadCell ? 1 : 0.9) : 1,
                    borderRadius: isHeadCell ? 4 : 2,
                  }}
                />
              );
            })
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-6 w-full max-w-[320px] rounded-lg px-4"
          style={{ background: darkBg + '33', justifyContent: 'center', minHeight: 200 }}>
          {status === 'waiting' && isHost && isSolo && (
            <>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300">🎯 Solo Mode</p>
              <button onClick={handlePlaySolo}
                className="w-full py-3 rounded-xl font-black text-sm text-white" style={{ background: accentColor }}>
                ▶ Start Solo Game
              </button>
            </>
          )}
          {status === 'waiting' && isHost && !isSolo && (
            <>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300">🏁 Race Mode</p>
              <p className="text-xs text-gray-400 text-center">
                {players.length > 1 ? `${players.length} players joined` : 'Waiting for others to join…'}
              </p>
              {players.length > 1 && (
                <p className="text-xs text-gray-400">{players.map(p => p.name).join(', ')}</p>
              )}
              <button onClick={handleStart}
                className="w-full py-3 rounded-xl font-black text-sm text-white" style={{ background: accentColor }}>
                🏁 Start Race ({players.length} {players.length === 1 ? 'player' : 'players'})
              </button>
            </>
          )}
          {status === 'waiting' && !isHost && (
            <p className="text-sm text-gray-400 text-center">Waiting for the host to start…</p>
          )}
          {isFinished && (
            <p className="text-white font-bold text-center text-lg">
              {winner ? `🏆 ${winner.name} wins!` : 'Game Over'}
            </p>
          )}
        </div>
      )}

      {/* D-pad for mobile — large touch targets */}
      <div className="grid grid-cols-3 gap-1.5 mt-1 w-full max-w-[160px]">
        <div />
        <button onClick={() => handleDir('up')} className="w-full aspect-square rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xl font-bold active:scale-90 transition-transform select-none">↑</button>
        <div />
        <button onClick={() => handleDir('left')} className="w-full aspect-square rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xl font-bold active:scale-90 transition-transform select-none">←</button>
        <button onClick={() => handleDir('down')} className="w-full aspect-square rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xl font-bold active:scale-90 transition-transform select-none">↓</button>
        <button onClick={() => handleDir('right')} className="w-full aspect-square rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xl font-bold active:scale-90 transition-transform select-none">→</button>
      </div>

      {/* Leaderboard */}
      {players.length > 1 && (
        <div className="w-full max-w-xs">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 text-center mb-1">Live Scores</p>
          {sortedPlayers.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between px-2 py-0.5">
              <div className="flex items-center gap-1.5">
                {i === 0 && isFinished && <span>🏆</span>}
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[120px]">{p.name}</span>
              </div>
              <span className="text-xs font-black tabular-nums" style={{ color: accentColor }}>{scores[p.id] ?? 0}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
