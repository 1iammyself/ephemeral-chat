import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Gamepad2, Trophy, Timer } from 'lucide-react';
import socketManager from '../socket';
import { createBoard, createThreesBoard, move, addTile, getBestTile, isGameOver, getWinTile, getTileColor } from './games/Game2048Engine';
import { getVibeById } from '../utils/vibes';

const ANIM_CSS = `
  @keyframes tile-appear {
    0%   { transform: scale(0); opacity: 0; }
    60%  { transform: scale(1.12); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes tile-merge {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.2); }
    100% { transform: scale(1); }
  }
  .tile-appear { animation: tile-appear 120ms ease-out forwards; }
  .tile-merge  { animation: tile-merge 150ms ease-out forwards; }
  .tile-slide  { transition: transform 130ms ease-out; }
`;

/**
 * Match tiles from prevBoard to their new positions in newBoard.
 * Returns a Map keyed by "r,c" with { fromR, fromC, isNew, isMerge } for each
 * non-zero tile in newBoard.
 *
 * Strategy: greedily consume available prev-board values by matching position
 * (stayed-in-place) first, then by nearest available matching value (moved).
 */
function reconcileTiles(prevBoard, newBoard, N) {
  // Build pool of available source tiles
  const available = [];
  prevBoard.forEach((row, r) => row.forEach((val, c) => {
    if (val) available.push({ r, c, val, used: false });
  }));

  const result = new Map();

  // Two-pass: first pass matches tiles that stayed in place (exact position + value match).
  // This avoids greedy stealing of same-valued tiles that didn't actually move.
  newBoard.forEach((row, r) => row.forEach((newVal, c) => {
    if (!newVal) return;
    const key = `${r},${c}`;
    const prevVal = prevBoard[r]?.[c] ?? 0;

    if (prevVal === newVal) {
      // Tile stayed — mark its source as used and record no movement
      const src = available.find(a => !a.used && a.r === r && a.c === c && a.val === newVal);
      if (src) {
        src.used = true;
        result.set(key, { fromR: r, fromC: c, isNew: false, isMerge: false });
      }
    }
  }));

  // Second pass: handle moved tiles and merges
  newBoard.forEach((row, r) => row.forEach((newVal, c) => {
    if (!newVal) return;
    const key = `${r},${c}`;
    if (result.has(key)) return; // already handled above

    const prevVal = prevBoard[r]?.[c] ?? 0;
    const isMerge = prevVal * 2 === newVal || (prevVal === 0 && newVal > 0);

    // Try to find a matching source tile (same value) that hasn't been used
    const src = available.find(a => !a.used && a.val === (isMerge && prevVal > 0 ? newVal / 2 : newVal));
    if (src) {
      src.used = true;
      result.set(key, { fromR: src.r, fromC: src.c, isNew: false, isMerge: isMerge && prevVal > 0 });
    } else {
      // Newly spawned tile — no slide, use tile-appear animation
      result.set(key, { fromR: r, fromC: c, isNew: true, isMerge: false });
    }
  }));

  return result;
}

// Score delta: show "+N" briefly after each merge batch
function useScoreDelta() {
  const [delta, setDelta] = useState(0);
  const timerRef = useRef(null);
  const show = (n) => {
    if (!n) return;
    clearTimeout(timerRef.current);
    setDelta(n);
    timerRef.current = setTimeout(() => setDelta(0), 1100);
  };
  return [delta, show];
}

const RACE_DURATION_MS = 180000; // 3 min
const UNDO_LIMIT = 3;

export default function Game2048Panel({ message, currentUser, roomVibe }) {
  const messageId = message?.id;
  const gameData  = message?.gameData;
  const vibe      = getVibeById(roomVibe);
  const userId    = currentUser?.id || currentUser?.socketId;
  const nickname  = currentUser?.nickname;
  const isSolo     = !!gameData?.soloMode;
  const isHost     = gameData?.hostId === userId;
  const isMember   = gameData?.players?.some(p => p.id === userId || (nickname && p.name === nickname));
  const gridSize   = gameData?.gridSize || 4;
  const gameMode   = gameData?.gameMode || 'standard'; // 'standard' | 'threes'
  const timerMode  = gameData?.timerMode || null;      // null | '1min' | '5min'
  const timerMs    = timerMode === '1min' ? 60000 : timerMode === '5min' ? 300000 : null;
  const winTile    = getWinTile(gameMode, gridSize);

  const shouldAutoStart = isSolo && isMember && gameData?.status !== 'finished';
  const initialSeed = gameData?.seed || Date.now();

  const makeInitialBoard = (seed) => gameMode === 'threes' ? createThreesBoard(seed) : createBoard(seed, gridSize);

  const seedRef      = useRef(initialSeed);
  const moveCountRef = useRef(0);
  const timerRef     = useRef(null);

  const [board,        setBoard]        = useState(shouldAutoStart ? makeInitialBoard(initialSeed) : null);
  const [soloTimeLeft, setSoloTimeLeft] = useState(null); // solo timer
  const soloTimerRef = useRef(null);
  const [score,        setScore]        = useState(0);
  const [bestTile,     setBestTile]     = useState(0);
  const [tileWon,      setTileWon]      = useState(false);
  const [boardOver,    setBoardOver]    = useState(false);
  const [gameKey,      setGameKey]      = useState(0);
  const [scores,       setScores]       = useState(gameData?.scores || {});
  const [bestTiles,    setBestTiles]    = useState(gameData?.bestTiles || {});
  const [players,      setPlayers]      = useState(gameData?.players || []);
  const [serverStatus, setServerStatus] = useState(gameData?.status || 'waiting');
  const [timeLeft,     setTimeLeft]     = useState(null);
  const [started,      setStarted]      = useState(!isSolo);
  const [undoStack,    setUndoStack]    = useState([]);
  const [moveCount,    setMoveCount]    = useState(0);
  const [bestScore,    setBestScore]    = useState(0);
  const [scoreDelta,   showScoreDelta]  = useScoreDelta();
  const [newTiles,     setNewTiles]     = useState(new Set());
  const [mergeTiles,   setMergeTiles]   = useState(new Set());
  const [tileAnims,    setTileAnims]    = useState(new Map()); // "r,c" -> { fromR, fromC, isNew, isMerge }
  const [animating,    setAnimating]    = useState(false);     // true = tiles at FROM position (no transition yet)
  const prevBoardRef   = useRef(null);                         // board snapshot before each move

  // Sync non-board fields from server
  useEffect(() => {
    if (!gameData) return;
    setPlayers(gameData.players || []);
    setScores(gameData.scores || {});
    setBestTiles(gameData.bestTiles || {});
    const s = gameData.status || 'waiting';
    setServerStatus(s);
    if (s === 'playing' && !board && !isSolo && gameData.seed) {
      seedRef.current = gameData.seed;
      moveCountRef.current = 0;
      setBoard(makeInitialBoard(gameData.seed));
      setStarted(true);
      if (gameData.startedAt) {
        const elapsed = Date.now() - gameData.startedAt;
        setTimeLeft(Math.max(0, RACE_DURATION_MS - elapsed));
      }
    }
  }, [gameData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Solo: notify server on first open
  useEffect(() => {
    if (shouldAutoStart && gameData?.status === 'waiting') {
      socketManager.emit('g2048-start', { messageId, soloMode: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track session best score
  useEffect(() => {
    if (score > bestScore) setBestScore(score);
  }, [score]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inject tile animation CSS once on mount
  useEffect(() => {
    const id = 'g2048-anim-styles';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = ANIM_CSS;
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []);

  // Score update socket listeners
  useEffect(() => {
    if (!messageId) return;
    const onScore = ({ messageId: mid, scores: s, bestTiles: bt }) => {
      if (mid !== messageId) return;
      setScores(s || {});
      setBestTiles(bt || {});
    };
    const onFinish = ({ messageId: mid, scores: s, bestTiles: bt }) => {
      if (mid !== messageId) return;
      setScores(s || {});
      setBestTiles(bt || {});
      setServerStatus('finished');
      clearInterval(timerRef.current);
    };
    socketManager.on('g2048-scores-update', onScore);
    socketManager.on('g2048-game-over',     onFinish);
    return () => {
      socketManager.off('g2048-scores-update', onScore);
      socketManager.off('g2048-game-over',     onFinish);
    };
  }, [messageId]);

  // Race countdown timer
  useEffect(() => {
    if (serverStatus !== 'playing' || isSolo || timeLeft == null) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1000) {
          clearInterval(timerRef.current);
          socketManager.emit('g2048-time-up', { messageId });
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [serverStatus, isSolo, messageId]); // eslint-disable-line

  const handleMove = useCallback((dir) => {
    if (!board || boardOver || !isMember) return;
    if (!isSolo && serverStatus !== 'playing') return;
    // First move in solo starts the game
    if (isSolo && !started) setStarted(true);

    // Start solo timer on first move
    if (isSolo && !started && timerMs) {
      setSoloTimeLeft(timerMs);
    }

    // Snapshot the board before the move for slide-animation reconciliation
    const prevBoard = board;
    prevBoardRef.current = prevBoard;

    const result = move(board, dir, gameMode);
    if (!result.changed) return;

    const count    = moveCountRef.current++;
    const newBoard = addTile(result.board, (seedRef.current || 0) + count * 37 + Date.now() % 1000);
    const newScore = score + result.score;
    const newBest  = getBestTile(newBoard);

    // Push undo entry (solo only, keep last UNDO_LIMIT states)
    if (isSolo) {
      setUndoStack(prev => [...prev.slice(-(UNDO_LIMIT - 1)), { board, score }]);
    }

    // Reconcile tiles: compute where each tile came from for slide animation
    const anims = reconcileTiles(prevBoard, newBoard, gridSize);

    // Derive newTiles / mergeTiles sets for CSS class animations (appear / merge bump)
    const newPos = new Set();
    const mergePos = new Set();
    anims.forEach(({ isNew, isMerge }, key) => {
      const [r, c] = key.split(',').map(Number);
      const idx = r * gridSize + c;
      if (isNew) newPos.add(idx);
      if (isMerge) mergePos.add(idx);
    });
    setNewTiles(newPos);
    setMergeTiles(mergePos);
    setTimeout(() => { setNewTiles(new Set()); setMergeTiles(new Set()); }, 200);

    // Two-frame slide animation:
    // Frame 1 — set animating=true + new anims → tiles render at FROM position (no transition)
    // Frame 2 — set animating=false → CSS transition kicks in, tiles slide to (0,0)
    setTileAnims(anims);
    setAnimating(true);
    setBoard(newBoard);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimating(false);
        setTimeout(() => setTileAnims(new Map()), 160);
      });
    });
    setScore(newScore);
    setBestTile(newBest);
    setMoveCount(c => c + 1);
    if (result.score > 0) showScoreDelta(result.score);
    if (isGameOver(newBoard)) setBoardOver(true);
    if (newBest >= winTile && !tileWon) setTileWon(true);

    if (count % 5 === 0 || newBest > bestTile) {
      socketManager.emit('g2048-score-update', { messageId, score: newScore, bestTile: newBest });
    }
  }, [board, boardOver, isMember, isSolo, serverStatus, score, bestTile, tileWon, messageId, started]);

  const handleUndo = () => {
    if (!isSolo || undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    setBoard(prev.board);
    setScore(prev.score);
    setBestTile(getBestTile(prev.board));
    setBoardOver(false);
    setTileWon(false);
    setMoveCount(c => Math.max(0, c - 1));
    // Clear any in-flight slide animation
    setTileAnims(new Map());
    setAnimating(false);
    setNewTiles(new Set());
    setMergeTiles(new Set());
  };

  // Keyboard
  useEffect(() => {
    const MAP = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
    };
    const onKey = (e) => { const d = MAP[e.key]; if (d) { e.preventDefault(); handleMove(d); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleMove]);

  // Touch swipe
  useEffect(() => {
    let sx, sy;
    const onTouchStart = (e) => { sx = e.touches[0]?.clientX; sy = e.touches[0]?.clientY; };
    const onTouchEnd   = (e) => {
      if (sx == null || sy == null) return;
      const dx = (e.changedTouches[0]?.clientX ?? 0) - sx;
      const dy = (e.changedTouches[0]?.clientY ?? 0) - sy;
      if (Math.abs(dx) > Math.abs(dy) + 10) handleMove(dx > 0 ? 'right' : 'left');
      else if (Math.abs(dy) > Math.abs(dx) + 10) handleMove(dy > 0 ? 'down' : 'up');
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend',   onTouchEnd,   { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend',   onTouchEnd);
    };
  }, [handleMove]);

  const handleNewGame = () => {
    if (!isSolo) return;
    const newSeed = Date.now();
    seedRef.current = newSeed;
    moveCountRef.current = 0;
    setBoard(makeInitialBoard(newSeed));
    setSoloTimeLeft(null);
    clearInterval(soloTimerRef.current);
    setScore(0);
    setBestTile(0);
    setBoardOver(false);
    setTileWon(false);
    setGameKey(k => k + 1);
    setStarted(false);
    setUndoStack([]);
    setMoveCount(0);
    setTileAnims(new Map());
    setAnimating(false);
    setNewTiles(new Set());
    setMergeTiles(new Set());
    socketManager.emit('g2048-start', { messageId, soloMode: true });
  };

  // Render helpers
  const accentColor = vibe?.colors?.primary || '#6366f1';
  const sortedPlayers = [...players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  // Solo timer effect
  useEffect(() => {
    clearInterval(soloTimerRef.current);
    if (!isSolo || !timerMs || soloTimeLeft === null || boardOver) return;
    soloTimerRef.current = setInterval(() => {
      setSoloTimeLeft(prev => {
        if (prev <= 1000) { clearInterval(soloTimerRef.current); setBoardOver(true); return 0; }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(soloTimerRef.current);
  }, [isSolo, timerMs, soloTimeLeft === null, boardOver]); // eslint-disable-line

  const modeBadge = isSolo
    ? (gameMode === 'threes' ? 'Threes!' : gridSize === 5 ? '5×5' : timerMode ? `${timerMode}` : 'Solo')
    : `Race ${players.length}P`;
  const soloMins = Math.floor((soloTimeLeft||0)/60000);
  const soloSecs = String(Math.floor(((soloTimeLeft||0)%60000)/1000)).padStart(2,'0');
  const myScore = isMember ? score : (scores[userId] ?? 0);
  const mins = Math.floor((timeLeft || 0) / 60000);
  const secs = String(Math.floor(((timeLeft || 0) % 60000) / 1000)).padStart(2, '0');

  return (
    <div className="flex h-full overflow-hidden bg-gray-950">

      {/* ── Board area ──────────────────────────────────────── */}
      <div className="relative flex-1 min-w-0 min-h-0 flex items-center justify-center p-2">
        {board ? (
          <div className="relative rounded-xl p-1.5 w-full" style={{ maxWidth: 280, background: '#bbada0' }}>

            {/* "Tap to start" overlay — solo only, before first move */}
            {isSolo && !started && !boardOver && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-xl z-10 gap-2">
                <p className="text-3xl font-black text-white">2048</p>
                <p className="text-gray-300 text-sm">Swipe or use arrow keys to start</p>
              </div>
            )}

            {/* Solo timer display */}
            {isSolo && timerMs && soloTimeLeft !== null && !boardOver && (
              <div className={`absolute top-1 left-1 right-1 z-20 flex justify-center pointer-events-none`}>
                <div className={`rounded-full px-2 py-0.5 text-[9px] font-black text-white ${soloTimeLeft < 10000 ? 'bg-red-500/90 animate-pulse' : 'bg-gray-700/80'}`}>
                  ⏱ {soloMins}:{soloSecs}
                </div>
              </div>
            )}

            {/* Win tile reached */}
            {tileWon && !boardOver && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-yellow-400/90 rounded-xl z-10 gap-2">
                <p className="text-3xl font-black">🎉 {winTile}!</p>
                <button
                  onClick={() => setTileWon(false)}
                  className="px-4 py-1.5 bg-white/70 rounded-lg text-sm font-black text-gray-800 hover:bg-white/90"
                >
                  Keep Going
                </button>
              </div>
            )}

            {/* Board over */}
            {boardOver && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 rounded-xl z-10 gap-2">
                <p className="text-xl font-black text-white">Game Over</p>
                <p className="text-gray-300 text-sm">Score: {score}</p>
                {score >= bestScore && bestScore > 0 && (
                  <p className="text-yellow-400 text-xs font-black">🏆 New best!</p>
                )}
                {isSolo && (
                  <button
                    onClick={handleNewGame}
                    className="px-4 py-1.5 rounded-lg text-sm font-bold text-white"
                    style={{ background: accentColor }}
                  >
                    ↺ New Game
                  </button>
                )}
              </div>
            )}

            {/* Race finished */}
            {serverStatus === 'finished' && !isSolo && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 rounded-xl z-10 gap-2">
                <Trophy className="w-10 h-10 text-yellow-400" />
                <p className="text-white font-black text-lg">Race Over!</p>
              </div>
            )}

            {/* Tile grid */}
            <div className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
              {(board.flat()).map((val, i) => {
                const r = Math.floor(i / gridSize);
                const c = i % gridSize;
                const colors = getTileColor(val, gameMode);
                const isNew   = val !== 0 && newTiles.has(i);
                const isMerge = val !== 0 && mergeTiles.has(i);

                // Slide animation: compute translate offset from previous position
                const anim = val !== 0 ? tileAnims.get(`${r},${c}`) : null;
                const dr = anim ? anim.fromR - r : 0;
                const dc = anim ? anim.fromC - c : 0;
                const hasSlide = (dr !== 0 || dc !== 0) && anim && !anim.isNew;

                // When animating=true: tile starts at FROM position (offset applied, no transition)
                // When animating=false: tile transitions to (0,0) — the slide plays out
                let tileTransform = 'translate(0, 0)';
                let tileTransition = 'none';
                if (hasSlide) {
                  if (animating) {
                    // Start position: offset by (dc, dr) grid cells
                    // 100% = this tile's own width/height (all cells are equal size in a square grid)
                    // 6px accounts for the gap-1.5 (1.5 * 4px = 6px) between cells
                    tileTransform = `translate(calc(${dc} * (100% + 6px)), calc(${dr} * (100% + 6px)))`;
                    tileTransition = 'none';
                  } else {
                    tileTransform = 'translate(0, 0)';
                    tileTransition = 'transform 130ms ease-out';
                  }
                }

                return (
                  <div
                    key={i}
                    className={`aspect-square rounded-md flex items-center justify-center font-black${isNew ? ' tile-appear' : isMerge ? ' tile-merge' : ''}`}
                    style={{
                      background: val ? colors.bg : '#cdc1b4',
                      color: colors.text || '#776e65',
                      fontSize: val > 999 ? '0.65rem' : val > 99 ? '0.8rem' : '1rem',
                      transform: tileTransform,
                      transition: tileTransition,
                    }}
                  >
                    {val || ''}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Race lobby */
          <div className="flex flex-col items-center gap-4 px-4 text-center">
            {serverStatus === 'waiting' && isHost && !isSolo && (
              <>
                <p className="text-sm font-bold text-gray-300">🏁 Race Mode</p>
                {players.length > 1 && (
                  <p className="text-xs text-gray-400">{players.map(p => p.name).join(', ')}</p>
                )}
                <button
                  onClick={() => socketManager.emit('g2048-start', { messageId })}
                  className="px-6 py-3 rounded-xl text-white font-black text-sm"
                  style={{ background: accentColor }}
                >
                  🏁 Start Race — {players.length > 1 ? `${players.length} players` : 'wait for others'}
                </button>
              </>
            )}
            {serverStatus === 'waiting' && !isHost && (
              <p className="text-sm text-gray-400">Waiting for host to start…</p>
            )}
            {serverStatus === 'finished' && <p className="text-lg font-bold text-white">Race finished!</p>}
          </div>
        )}
      </div>

      {/* ── Side panel ──────────────────────────────────────── */}
      <div className="flex-shrink-0 w-32 flex flex-col bg-gray-900 border-l border-gray-800">

        {/* Header */}
        <div className={`px-3 py-2 ${vibe.accentClass} flex items-center gap-2 shrink-0`}>
          <span className="text-white font-black text-xs">2048</span>
          <span className="text-[9px] font-black text-white uppercase tracking-widest truncate">{modeBadge}</span>
          {serverStatus === 'playing' && (
            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
          )}
        </div>

        <div className="flex-1 p-3 flex flex-col gap-3 overflow-y-auto">

          {/* Score + best tile + session best */}
          <div className="bg-gray-800 rounded-xl p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Score</p>
                <p className="text-lg font-black text-white tabular-nums">{myScore}</p>
                {scoreDelta > 0 && (
                  <span className="absolute -top-2 right-0 text-[10px] font-black text-yellow-400 pointer-events-none animate-bounce">
                    +{scoreDelta}
                  </span>
                )}
              </div>
              <div>
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Best</p>
                <p className="text-lg font-black tabular-nums" style={{ color: accentColor }}>
                  {bestTile || '—'}
                </p>
              </div>
            </div>
            {bestScore > 0 && (
              <p className="text-[9px] text-gray-500 mt-1">
                Session best <span className="text-yellow-400 font-bold">{bestScore}</span>
              </p>
            )}
            {isSolo && moveCount > 0 && (
              <p className="text-[9px] text-gray-600 mt-0.5">
                Move <span className="text-gray-400 font-bold">{moveCount}</span>
              </p>
            )}
          </div>

          {/* Mode badge */}
          {(gameMode === 'threes' || gridSize > 4 || timerMode) && (
            <div className="text-[9px] text-center text-purple-400 font-bold">
              {gameMode==='threes' ? '🔢 Threes! rules (1+2=3)' : gridSize > 4 ? `📐 ${gridSize}×${gridSize} grid` : ''}
              {timerMode ? ` ⏱ ${timerMode} sprint` : ''}
            </div>
          )}

          {/* Race timer */}
          {!isSolo && timeLeft !== null && (
            <div className="bg-gray-800 rounded-xl p-2 flex items-center gap-2">
              <Timer className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <p className={`text-sm font-black tabular-nums ${timeLeft < 30000 ? 'text-red-400' : 'text-white'}`}>
                {mins}:{secs}
              </p>
            </div>
          )}

          {/* Race leaderboard */}
          {!isSolo && sortedPlayers.length > 0 && (
            <div className="bg-gray-800/50 rounded-lg p-2 space-y-1">
              <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-0.5">Race</p>
              {sortedPlayers.map((p, i) => (
                <div key={p.id} className="flex items-center gap-1">
                  {i === 0 && serverStatus === 'finished' && (
                    <Trophy className="w-2.5 h-2.5 text-yellow-400 shrink-0" />
                  )}
                  <span className="text-[10px] text-gray-400 truncate flex-1">{p.name}</span>
                  <div className="flex flex-col items-end">
                    {bestTiles[p.id] > 0 && (
                      <span className="text-[8px] font-bold"
                        style={{ color: getTileColor(bestTiles[p.id], gameMode).bg }}>
                        {bestTiles[p.id]}
                      </span>
                    )}
                    <span className="text-[10px] font-black text-white tabular-nums">{scores[p.id] ?? 0}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-auto flex flex-col gap-2">
            {isSolo && undoStack.length > 0 && !boardOver && (
              <button
                onClick={handleUndo}
                className="w-full py-1.5 text-[9px] font-black rounded-lg bg-yellow-800/30 text-yellow-400 border border-yellow-700/30 hover:bg-yellow-800/60 transition-colors"
              >
                ↩ Undo ({undoStack.length})
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
            <button
              onClick={() => socketManager.emit('delete-message', { messageId })}
              className="w-full py-1.5 text-[9px] font-black rounded-lg bg-red-900/30 text-red-400 border border-red-800/40 hover:bg-red-900/60 transition-colors"
            >
              {isSolo ? 'End Game' : 'Leave'}
            </button>
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
