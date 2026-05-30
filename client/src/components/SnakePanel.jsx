import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Gamepad2, Trophy, Pause, Play } from 'lucide-react';
import socketManager from '../socket';
import { createInitialState, tick, changeDir, getSpeed, GRID } from './games/SnakeEngine';
import { getVibeById } from '../utils/vibes';

const SNAKE_ANIM_CSS = `
  @keyframes score-pop {
    0%   { opacity: 1; transform: translateY(0) scale(1); }
    100% { opacity: 0; transform: translateY(-28px) scale(0.8); }
  }
  .score-pop { animation: score-pop 800ms ease-out forwards; pointer-events: none; }

  @keyframes death-flash {
    0%   { opacity: 0.55; }
    100% { opacity: 0; }
  }
  .death-flash { animation: death-flash 350ms ease-out forwards; pointer-events: none; }

  @keyframes particle-burst {
    0%   { opacity: 1; transform: translate(0,0) scale(1); }
    100% { opacity: 0; transform: translate(var(--px), var(--py)) scale(0); }
  }
  .particle { animation: particle-burst 400ms ease-out forwards; pointer-events: none; }
`;

// Interpolate hex color by factor t (0=full color, 1=dark)
function dimColor(hex, t) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = Math.max(0.2, 1 - t * 0.75);
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
}

export default function SnakePanel({ message, currentUser, roomVibe }) {
  const messageId = message?.id;
  const gameData  = message?.gameData;
  const vibe      = getVibeById(roomVibe);
  const userId    = currentUser?.id || currentUser?.socketId;
  const nickname  = currentUser?.nickname;
  const isSolo         = !!gameData?.soloMode;
  const wrapWalls      = !!gameData?.wrapWalls;
  const dailyChallenge = !!gameData?.dailyChallenge;
  const dailySeed      = gameData?.dailySeed || null;
  const isHost    = gameData?.hostId === userId;
  const isMember  = gameData?.players?.some(p => p.id === userId || (nickname && p.name === nickname));

  const initialSeed = dailyChallenge && dailySeed ? dailySeed : Date.now();
  const stateRef  = useRef(isSolo && isMember && gameData?.status !== 'finished'
    ? createInitialState(initialSeed, { wrapWalls }) : null);
  const tickRef   = useRef(null);
  const scoreRef  = useRef(0);

  const [gameState,    setGameState]    = useState(stateRef.current);
  const [gameOver,     setGameOver]     = useState(false);
  const [gameKey,      setGameKey]      = useState(0);
  const [scores,       setScores]       = useState(gameData?.scores || {});
  const [players,      setPlayers]      = useState(gameData?.players || []);
  const [serverStatus, setServerStatus] = useState(gameData?.status || 'waiting');
  const [winner,       setWinner]       = useState(gameData?.winner || null);
  const [started,      setStarted]      = useState(!isSolo);
  const [paused,       setPaused]       = useState(false);
  const [bestScore,    setBestScore]    = useState(0);
  const [showGhost,    setShowGhost]    = useState(true);
  const [scorePops,    setScorePops]    = useState([]);
  const [deathFlash,   setDeathFlash]   = useState(false);
  const [particles,    setParticles]    = useState([]);
  // Bonus food blink state (for visual blinking)
  const [bonusBlink,   setBonusBlink]   = useState(true);
  const bonusBlinkRef = useRef(null);
  // Input buffering: queue up to 2 direction inputs between ticks
  const inputQueueRef = useRef([]);
  // Ghost / replay refs
  const ghostPathRef  = useRef([]);   // records snake arrays for current game
  const ghostDataRef  = useRef(null); // best ghost { score, path }
  const tickCountRef  = useRef(0);    // ticks elapsed in current game

  // Inject animation CSS once on mount
  useEffect(() => {
    const id = 'snake-anim-styles';
    if (!document.getElementById(id)) {
      const el = document.createElement('style');
      el.id = id;
      el.textContent = SNAKE_ANIM_CSS;
      document.head.appendChild(el);
    }
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!gameData) return;
    setPlayers(gameData.players || []);
    setScores(gameData.scores || {});
    setServerStatus(gameData.status || 'waiting');
    if (gameData.winner) setWinner(gameData.winner);
  }, [gameData]);

  useEffect(() => {
    if (isSolo && isMember && gameData?.status === 'waiting') {
      socketManager.emit('snake-start', { messageId, soloMode: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load best ghost from localStorage on mount (solo only)
  useEffect(() => {
    if (!isSolo) return;
    const saved = localStorage.getItem('snake-ghost');
    if (saved) {
      try { ghostDataRef.current = JSON.parse(saved); } catch {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const initGame = useCallback(() => {
    clearInterval(tickRef.current);
    scoreRef.current = 0;
    ghostPathRef.current = [];
    tickCountRef.current = 0;
    setGameOver(false);
    // Daily challenge always uses the same seed; solo uses fresh seed
    const seed = dailyChallenge && dailySeed ? dailySeed : Date.now();
    const state = createInitialState(seed, { wrapWalls });
    stateRef.current = state;
    setGameState(state);
  }, [wrapWalls, dailyChallenge, dailySeed]);

  // Bonus food blinking effect
  useEffect(() => {
    clearInterval(bonusBlinkRef.current);
    if (!gameState?.bonusFood) return;
    bonusBlinkRef.current = setInterval(() => setBonusBlink(b => !b), 350);
    return () => clearInterval(bonusBlinkRef.current);
  }, [gameState?.bonusFood]);

  // Race socket listeners
  useEffect(() => {
    if (!messageId) return;
    const onStarted = ({ messageId: mid }) => {
      if (mid !== messageId || isSolo) return;
      setStarted(true);
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
    const onRematch = ({ messageId: mid }) => {
      if (mid !== messageId) return;
      clearInterval(tickRef.current);
      setGameOver(false);
      setGameState(null);
      stateRef.current = null;
      setStarted(false);
      setPaused(false);
      setWinner(null);
      setScores({});
      setServerStatus('waiting');
    };
    socketManager.on('snake-started',       onStarted);
    socketManager.on('snake-scores-update', onScores);
    socketManager.on('snake-game-over',     onOver);
    socketManager.on('snake-rematch',       onRematch);
    return () => {
      clearInterval(tickRef.current);
      socketManager.off('snake-started',       onStarted);
      socketManager.off('snake-scores-update', onScores);
      socketManager.off('snake-game-over',     onOver);
      socketManager.off('snake-rematch',       onRematch);
    };
  }, [messageId, isSolo, initGame]);

  // Game tick loop
  useEffect(() => {
    if (!gameState || gameOver || serverStatus === 'finished' || !started || paused) return;
    const speed = getSpeed(gameState.level);
    tickRef.current = setInterval(() => {
      // Process buffered input before ticking
      if (inputQueueRef.current.length > 0) {
        const nextDir = inputQueueRef.current.shift();
        stateRef.current = changeDir(stateRef.current, nextDir);
      }
      stateRef.current = tick(stateRef.current);
      const s = stateRef.current;

      // Record snake state for ghost replay (solo only, cap at 400 ticks)
      if (isSolo && ghostPathRef.current.length < 400) {
        ghostPathRef.current.push([...s.snake]);
      }
      tickCountRef.current += 1;

      setGameState({ ...s });
      if (s.dead) {
        clearInterval(tickRef.current);
        setGameOver(true);
        // Feature 2: death flash
        setDeathFlash(true);
        setTimeout(() => setDeathFlash(false), 400);
        if (s.score > 0) setBestScore(prev => Math.max(prev, s.score));
        // Save ghost if this is the best run (solo only)
        if (isSolo && s.score > 0) {
          if (!ghostDataRef.current || s.score > ghostDataRef.current.score) {
            ghostDataRef.current = { score: s.score, path: ghostPathRef.current };
            try {
              localStorage.setItem('snake-ghost', JSON.stringify(ghostDataRef.current));
            } catch {}
          }
          ghostPathRef.current = [];
        }
        socketManager.emit('snake-died', { messageId, score: s.score });
        return;
      }
      if (s.score !== scoreRef.current) {
        const scoreDiff = s.score - scoreRef.current;
        scoreRef.current = s.score;
        setBestScore(prev => Math.max(prev, s.score));
        if (!isSolo) socketManager.emit('snake-score-update', { messageId, score: s.score });

        // Feature 1: floating score pop
        const newPop = {
          id: Date.now(),
          r: s.snake[0][0],
          c: s.snake[0][1],
          text: scoreDiff >= 50 ? '+50' : '+10',
        };
        setScorePops(prev => [...prev.slice(-4), newPop]);
        setTimeout(() => setScorePops(prev => prev.filter(p => p.id !== newPop.id)), 900);

        // Feature 3: particle burst
        const numParticles = 6;
        const newParticles = Array.from({ length: numParticles }, (_, i) => {
          const angle = (i / numParticles) * Math.PI * 2;
          const dist = 12 + Math.random() * 10;
          return {
            id: Date.now() + i + 1,
            r: s.snake[0][0],
            c: s.snake[0][1],
            px: `${Math.cos(angle) * dist}px`,
            py: `${Math.sin(angle) * dist}px`,
            color: scoreDiff >= 50 ? '#fbbf24' : '#f87171',
          };
        });
        setParticles(prev => [...prev.slice(-20), ...newParticles]);
        setTimeout(() => setParticles(prev => prev.filter(p => !newParticles.some(n => n.id === p.id))), 450);
      }
    }, speed);
    return () => clearInterval(tickRef.current);
  }, [gameKey, gameState?.level, gameOver, serverStatus, messageId, isSolo, started, paused]); // eslint-disable-line

  const handleDir = useCallback((dir) => {
    if (!stateRef.current || stateRef.current.dead) return;
    if (!started) {
      setStarted(true);
      setPaused(false);
      inputQueueRef.current = [];
      stateRef.current = changeDir(stateRef.current, dir);
      setGameState(prev => prev ? { ...prev, dir: stateRef.current.dir } : prev);
      return;
    }
    if (paused) return;
    // Buffer up to 2 inputs; apply immediately if queue empty
    if (inputQueueRef.current.length === 0) {
      stateRef.current = changeDir(stateRef.current, dir);
      setGameState(prev => prev ? { ...prev, dir: stateRef.current.dir } : prev);
    } else if (inputQueueRef.current.length < 2) {
      inputQueueRef.current.push(dir);
    }
  }, [started, paused]);

  // Keyboard
  useEffect(() => {
    const MAP = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
    };
    const onKey = (e) => {
      const d = MAP[e.key];
      if (d) { e.preventDefault(); handleDir(d); return; }
      if ((e.key === 'p' || e.key === 'P') && started && !gameOver) {
        e.preventDefault();
        setPaused(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleDir, started, gameOver]);

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
    ghostPathRef.current = [];
    tickCountRef.current = 0;
    setGameKey(k => k + 1);
    setStarted(false);
    setPaused(false);
    initGame();
    socketManager.emit('snake-start', { messageId, soloMode: true });
  };

  const accentColor  = vibe?.colors?.primary || '#22c55e';
  const snakeColor   = vibe?.colors?.primary || '#4ade80';
  const myScore      = gameState?.score ?? (scores[userId] ?? 0);
  const snakeLen     = gameState?.snake?.length ?? 0;
  const foodEaten    = Math.max(0, snakeLen - 3);
  const level        = gameState?.level ?? 1;
  const levelProgress = gameState ? (gameState.score % 100) / 100 : 0;
  const modeBadge    = dailyChallenge ? 'Daily' : isSolo ? (wrapWalls ? 'Solo · Wrap' : 'Solo') : `Race ${players.length}P`;
  const sortedPlayers = [...players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  const headKey      = gameState ? `${gameState.snake[0][0]},${gameState.snake[0][1]}` : '';
  const foodKey      = gameState ? `${gameState.food[0]},${gameState.food[1]}` : '';
  const bonusFoodKey = gameState?.bonusFood ? `${gameState.bonusFood[0]},${gameState.bonusFood[1]}` : '';

  // Map each snake segment to its index for gradient coloring
  const snakeMap = gameState
    ? new Map(gameState.snake.map(([r, c], i) => [`${r},${c}`, i]))
    : new Map();
  const totalLen = gameState?.snake?.length || 1;

  return (
    <div className="flex h-full overflow-hidden bg-gray-950">

      {/* ── Board area ── */}
      <div className="relative flex-1 min-w-0 min-h-0 flex items-center justify-center p-2">
        {gameState ? (
          <div
            className="relative rounded-lg overflow-hidden w-full aspect-square"
            style={{ maxWidth: 300, background: '#111827' }}
          >
            {/* Ready overlay */}
            {!started && isSolo && !gameOver && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-10 gap-2">
                <p className="text-4xl">🐍</p>
                <p className="text-white font-black text-lg">Ready?</p>
                <p className="text-gray-400 text-xs">
                  {dailyChallenge ? '📅 Daily Challenge · ' : wrapWalls ? '🔄 Wrap walls · ' : ''}Press any arrow key or swipe to start
                </p>
              </div>
            )}

            {/* Paused overlay */}
            {started && paused && !gameOver && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-10 gap-2">
                <Pause className="w-10 h-10 text-white" />
                <p className="text-white font-black text-xl">PAUSED</p>
                <p className="text-gray-400 text-xs">Press P or tap ▶ to continue</p>
              </div>
            )}

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

            {/* Bonus food countdown indicator */}
            {gameState?.bonusFood && !gameOver && started && !paused && (
              <div className="absolute top-1 left-1 right-1 z-20 flex justify-center pointer-events-none">
                <div className="bg-yellow-500/80 rounded-full px-2 py-0.5 text-[9px] font-black text-white">
                  ⭐ BONUS {Math.ceil(gameState.bonusFoodTimer / 10)}s
                </div>
              </div>
            )}

            {/* Board cells */}
            {Array.from({ length: GRID }, (_, r) =>
              Array.from({ length: GRID }, (_, c) => {
                const key       = `${r},${c}`;
                const segIdx    = snakeMap.get(key);
                const isSnake   = segIdx !== undefined;
                const isHead    = key === headKey;
                const isFood    = key === foodKey;
                const isBonus   = key === bonusFoodKey;

                if (!isSnake && !isFood && !isBonus) return null;

                const pct = 100 / GRID;
                let bg;
                if (isHead) bg = '#ffffff';
                else if (isSnake) {
                  const t = segIdx / Math.max(totalLen - 1, 1);
                  bg = dimColor(snakeColor, t);
                } else if (isBonus) {
                  bg = bonusBlink ? '#fbbf24' : '#f59e0b';
                } else {
                  bg = '#f87171';
                }

                return (
                  <div
                    key={key}
                    className={`absolute${isFood && !isBonus ? ' animate-pulse' : ''}`}
                    style={{
                      left:   `calc(${c * pct}% + 1px)`,
                      top:    `calc(${r * pct}% + 1px)`,
                      width:  `calc(${pct}% - 2px)`,
                      height: `calc(${pct}% - 2px)`,
                      background: bg,
                      borderRadius: isHead ? 4 : (isBonus || isFood) ? '50%' : 2,
                      boxShadow: isBonus && bonusBlink ? '0 0 4px 2px rgba(251,191,36,0.6)' : isFood ? '0 0 3px 1px rgba(248,113,113,0.5)' : undefined,
                    }}
                  />
                );
              })
            )}

            {/* Ghost / replay overlay */}
            {showGhost && ghostDataRef.current && !gameOver && started && (() => {
              const ghostSnake = ghostDataRef.current.path[tickCountRef.current - 1];
              if (!ghostSnake) return null;
              const pct = 100 / GRID;
              return ghostSnake.map(([gr, gc], gi) => (
                <div
                  key={`ghost-${gi}`}
                  className="absolute pointer-events-none"
                  style={{
                    left:   `calc(${gc * pct}% + 1px)`,
                    top:    `calc(${gr * pct}% + 1px)`,
                    width:  `calc(${pct}% - 2px)`,
                    height: `calc(${pct}% - 2px)`,
                    background: 'rgba(156,163,175,0.25)',
                    borderRadius: 2,
                  }}
                />
              ));
            })()}

            {/* Feature 3: Particle burst on food eat */}
            {particles.map(p => {
              const pct = 100 / GRID;
              return (
                <div key={p.id} className="particle absolute rounded-full"
                  style={{
                    zIndex: 25,
                    left: `calc(${p.c * pct + pct / 2}%)`,
                    top:  `calc(${p.r * pct + pct / 2}%)`,
                    width: 4,
                    height: 4,
                    background: p.color,
                    '--px': p.px,
                    '--py': p.py,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              );
            })}

            {/* Feature 2: Death flash overlay */}
            {deathFlash && (
              <div className="death-flash absolute inset-0 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.45)', zIndex: 25 }} />
            )}

            {/* Feature 1: Floating score pops */}
            {scorePops.map(pop => {
              const pct = 100 / GRID;
              return (
                <div key={pop.id} className="score-pop absolute z-30 text-[11px] font-black text-yellow-300"
                  style={{
                    left: `calc(${pop.c * pct}% + ${pct / 2}%)`,
                    top:  `calc(${pop.r * pct}%)`,
                    transform: 'translateX(-50%)',
                  }}>
                  {pop.text}
                </div>
              );
            })}
          </div>
        ) : (
          /* Race lobby */
          <div className="flex flex-col items-center gap-4 px-4 text-center">
            {serverStatus === 'waiting' && isHost && (
              <>
                <p className="text-sm font-bold text-gray-300">🏁 Race Mode</p>
                <p className="text-xs text-gray-400">
                  {players.length > 1 ? `${players.length} players ready` : 'Waiting for others to join…'}
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
              <div className="flex flex-col items-center gap-2">
                <p className="text-white font-bold">
                  {winner ? `🏆 ${winner.name} wins!` : 'Race Over'}
                </p>
                {isHost && (
                  <button
                    onClick={() => socketManager.emit('snake-rematch', { messageId })}
                    className="px-6 py-2 rounded-xl font-black text-sm text-white"
                    style={{ background: accentColor }}
                  >
                    🔁 Rematch
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Side panel ── */}
      <div className="flex-shrink-0 w-32 flex flex-col bg-gray-900 border-l border-gray-800">

        <div className={`px-3 py-2 ${vibe.accentClass} flex items-center gap-2 shrink-0`}>
          <span className="text-white text-sm">🐍</span>
          <span className="text-[10px] font-black text-white uppercase tracking-widest truncate">{modeBadge}</span>
          {serverStatus === 'playing' && started && !paused && (
            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
          )}
        </div>

        <div className="flex-1 p-3 flex flex-col gap-3 overflow-y-auto">

          {/* Stats */}
          <div className="bg-gray-800 rounded-xl p-3 space-y-1">
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Score</p>
            <p className="text-xl font-black text-white tabular-nums">{myScore}</p>
            {bestScore > 0 && (
              <p className="text-[9px] text-gray-500">
                Best <span className="text-yellow-400 font-bold">{bestScore}</span>
              </p>
            )}
            {gameState && (
              <div className="flex gap-2 flex-wrap text-[9px] text-gray-400 mt-0.5">
                <span>Lv <span className="text-white font-bold">{level}</span></span>
                <span>Len <span className="text-white font-bold">{snakeLen}</span></span>
                <span>🍎 <span className="text-white font-bold">{foodEaten}</span></span>
              </div>
            )}
          </div>

          {/* Level progress */}
          {gameState && serverStatus !== 'finished' && (
            <div>
              <div className="flex justify-between text-[8px] text-gray-600 mb-0.5">
                <span>Lv {level}</span>
                <span>Lv {level + 1}</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-gray-700 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${levelProgress * 100}%`, background: accentColor }} />
              </div>
            </div>
          )}

          {/* Bonus food hint */}
          {gameState && !gameOver && serverStatus !== 'finished' && (
            <div className="text-[9px] text-gray-500 text-center">
              {gameState.bonusFood
                ? <span className="text-yellow-400 font-black animate-pulse">⭐ Bonus active!</span>
                : <span>Next bonus in {5 - (gameState.foodEaten % 5)} 🍎</span>
              }
            </div>
          )}

          {/* Wrap walls badge */}
          {wrapWalls && (
            <div className="text-[9px] text-center text-cyan-400 font-bold">🔄 Wrap walls</div>
          )}

          {/* Daily challenge badge */}
          {dailyChallenge && (
            <div className="text-[9px] text-center text-yellow-400 font-bold">📅 Daily Challenge</div>
          )}

          {/* Ghost toggle (solo only, only when ghost data exists) */}
          {isSolo && ghostDataRef.current && (
            <button
              onClick={() => setShowGhost(g => !g)}
              className={`text-[9px] text-center font-bold w-full ${showGhost ? 'text-gray-400' : 'text-gray-600'}`}
            >
              {showGhost ? '👻 Ghost ON' : '👻 Ghost OFF'}
            </button>
          )}

          {/* Race scores */}
          {!isSolo && sortedPlayers.length > 0 && (
            <div className="bg-gray-800/50 rounded-lg p-2 space-y-1">
              <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-0.5">Race</p>
              {sortedPlayers.map((p, i) => (
                <div key={p.id} className="flex items-center gap-1">
                  {i === 0 && serverStatus === 'finished' && (
                    <Trophy className="w-2.5 h-2.5 text-yellow-400 shrink-0" />
                  )}
                  <span className="text-[10px] text-gray-400 truncate flex-1">{p.name}</span>
                  <span className="text-[10px] font-black text-white tabular-nums">{scores[p.id] ?? 0}</span>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-auto flex flex-col gap-2">
            {isSolo && started && !gameOver && serverStatus !== 'finished' && (
              <button
                onClick={() => setPaused(prev => !prev)}
                className="w-full py-1.5 text-[9px] font-black rounded-lg bg-gray-700/50 text-gray-300 border border-gray-600/40 hover:bg-gray-700 transition-colors flex items-center justify-center gap-1"
              >
                {paused ? <><Play className="w-2.5 h-2.5" />Resume</> : <><Pause className="w-2.5 h-2.5" />Pause</>}
              </button>
            )}
            {isSolo && (
              <button
                onClick={handleNewGame}
                className="w-full py-1.5 text-[9px] font-black rounded-lg bg-cyan-800/30 text-cyan-400 border border-cyan-700/30 hover:bg-cyan-800/60 transition-colors"
              >
                ↺ New Game
              </button>
            )}
            {!isSolo && serverStatus === 'finished' && isHost && (
              <button
                onClick={() => socketManager.emit('snake-rematch', { messageId })}
                className="w-full py-1.5 text-[9px] font-black rounded-lg bg-cyan-800/30 text-cyan-400 border border-cyan-700/30 hover:bg-cyan-800/60 transition-colors"
              >
                🔁 Rematch
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
            <button onClick={() => handleDir('up')}
              className="aspect-square rounded-md bg-gray-700 flex items-center justify-center text-sm font-bold active:scale-90 transition-transform select-none">↑</button>
            <div />
            <button onClick={() => handleDir('left')}
              className="aspect-square rounded-md bg-gray-700 flex items-center justify-center text-sm font-bold active:scale-90 transition-transform select-none">←</button>
            <button onClick={() => handleDir('down')}
              className="aspect-square rounded-md bg-gray-700 flex items-center justify-center text-sm font-bold active:scale-90 transition-transform select-none">↓</button>
            <button onClick={() => handleDir('right')}
              className="aspect-square rounded-md bg-gray-700 flex items-center justify-center text-sm font-bold active:scale-90 transition-transform select-none">→</button>
          </div>

          <div className="pt-2 border-t border-gray-800 text-[8px] text-gray-600 leading-relaxed">
            <p>← → ↑ ↓ or WASD</p>
            <p>P to pause · Swipe mobile</p>
            {gameState?.bonusFood ? <p className="text-yellow-600">⭐ = +50 pts, no growth</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
