import React, { useReducer, useEffect, useRef, useState, useCallback, useContext } from 'react';
import { FloatingPanelContext } from '../FloatingPanel';

const COLS = 10;
const ROWS = 20;
const BASE_CELL = 22;

// Sound sprite offsets in music.mp3 (identical to original react-tetris)
const SOUNDS = {
  move:     [2.9088, 0.1437],
  rotate:   [2.2471, 0.0807],
  drop:     [1.2558, 0.3546],
  clear:    [0,      0.7675],
  gameover: [8.1276, 1.1437],
};

const PIECES = [
  [[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],[[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],[[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],[[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]]],
  [[[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]]],
  [[[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,1,0,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],[[0,0,0,0],[1,1,1,0],[0,1,0,0],[0,0,0,0]],[[0,1,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]]],
  [[[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],[[0,1,0,0],[0,1,1,0],[0,0,1,0],[0,0,0,0]],[[0,0,0,0],[0,1,1,0],[1,1,0,0],[0,0,0,0]],[[1,0,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]]],
  [[[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,0,1,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],[[0,0,0,0],[1,1,0,0],[0,1,1,0],[0,0,0,0]],[[0,1,0,0],[1,1,0,0],[1,0,0,0],[0,0,0,0]]],
  [[[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,1,1,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],[[0,0,0,0],[1,1,1,0],[0,0,1,0],[0,0,0,0]],[[0,1,0,0],[0,1,0,0],[1,1,0,0],[0,0,0,0]]],
  [[[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],[[0,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,0,0]],[[0,0,0,0],[1,1,1,0],[1,0,0,0],[0,0,0,0]],[[1,1,0,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]]],
];

const COLORS = ['','#00e5e5','#e5e500','#9900cc','#00cc00','#cc0000','#0033cc','#cc7700','#445566'];
const SCORE_TABLE = [0, 100, 300, 500, 800];
const SPEEDS = [800,717,633,550,467,383,300,217,133,100,83,83,83,83,83,67,67,67,50,50,33];

// ── Pure helpers ──────────────────────────────────────────────────

function emptyBoard() { return Array.from({ length: ROWS }, () => Array(COLS).fill(0)); }
function randType() { return Math.floor(Math.random() * 7); }
function getShape(type, rot) { return PIECES[type][rot & 3]; }

function fits(board, type, rot, x, y) {
  const s = getShape(type, rot);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (!s[r][c]) continue;
    const ny = y + r, nx = x + c;
    if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
    if (ny >= 0 && board[ny][nx]) return false;
  }
  return true;
}

function stamp(board, type, rot, x, y) {
  const b = board.map(r => r.slice());
  const s = getShape(type, rot);
  const col = type + 1;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (!s[r][c]) continue;
    const ny = y + r, nx = x + c;
    if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) b[ny][nx] = col;
  }
  return b;
}

function sweep(board) {
  const kept = board.filter(row => row.some(v => v === 0));
  const cleared = ROWS - kept.length;
  return { board: [...Array.from({ length: cleared }, () => Array(COLS).fill(0)), ...kept], cleared };
}

function ghostY(board, type, rot, x, y) {
  let gy = y;
  while (fits(board, type, rot, x, gy + 1)) gy++;
  return gy;
}

function makeGarbageRow() {
  const row = Array(COLS).fill(8);
  row[Math.floor(Math.random() * COLS)] = 0;
  return row;
}

// ── Reducer ───────────────────────────────────────────────────────

function newGame() {
  return {
    phase: 'playing',
    board: emptyBoard(),
    cur: { type: randType(), rot: 0, x: 3, y: 0 },
    next: randType(),
    score: 0, lines: 0, level: 1,
    pendingGarbage: 0, clearSeq: 0, lastCleared: 0,
  };
}

function initState() { return { ...newGame(), phase: 'idle' }; }

function doLock(state) {
  let board = stamp(state.board, state.cur.type, state.cur.rot, state.cur.x, state.cur.y);
  const { board: swept, cleared } = sweep(board);
  board = swept;
  let { pendingGarbage } = state;
  if (pendingGarbage > 0) {
    board = [...board.slice(pendingGarbage), ...Array.from({ length: pendingGarbage }, makeGarbageRow)];
    pendingGarbage = 0;
  }
  const lines = state.lines + cleared;
  const level = Math.min(Math.floor(lines / 10) + 1, 20);
  const score = state.score + SCORE_TABLE[Math.min(cleared, 4)] * state.level;
  const clearSeq = state.clearSeq + (cleared > 0 ? 1 : 0);
  const nextType = state.next;
  if (!fits(board, nextType, 0, 3, 0)) {
    return { ...state, board, score, lines, level, pendingGarbage: 0, phase: 'over', clearSeq, lastCleared: cleared };
  }
  return {
    ...state, board, score, lines, level, pendingGarbage,
    cur: { type: nextType, rot: 0, x: 3, y: 0 }, next: randType(), clearSeq, lastCleared: cleared,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'START': return newGame();
    case 'TOGGLE_PAUSE':
      if (state.phase === 'playing') return { ...state, phase: 'paused' };
      if (state.phase === 'paused')  return { ...state, phase: 'playing' };
      return state;
    case 'TICK':
    case 'SOFT_DROP': {
      if (state.phase !== 'playing') return state;
      const { cur, board } = state;
      if (fits(board, cur.type, cur.rot, cur.x, cur.y + 1))
        return { ...state, cur: { ...cur, y: cur.y + 1 } };
      return doLock(state);
    }
    case 'LEFT': {
      if (state.phase !== 'playing') return state;
      const { cur, board } = state;
      return fits(board, cur.type, cur.rot, cur.x - 1, cur.y)
        ? { ...state, cur: { ...cur, x: cur.x - 1 } } : state;
    }
    case 'RIGHT': {
      if (state.phase !== 'playing') return state;
      const { cur, board } = state;
      return fits(board, cur.type, cur.rot, cur.x + 1, cur.y)
        ? { ...state, cur: { ...cur, x: cur.x + 1 } } : state;
    }
    case 'ROTATE': {
      if (state.phase !== 'playing') return state;
      const { cur, board } = state;
      const rot = (cur.rot + 1) & 3;
      for (const dx of [0, -1, 1, -2, 2])
        if (fits(board, cur.type, rot, cur.x + dx, cur.y))
          return { ...state, cur: { ...cur, rot, x: cur.x + dx } };
      return state;
    }
    case 'HARD_DROP': {
      if (state.phase !== 'playing') return state;
      const { cur, board } = state;
      const gy = ghostY(board, cur.type, cur.rot, cur.x, cur.y);
      return doLock({ ...state, cur: { ...cur, y: gy } });
    }
    case 'ADD_GARBAGE': {
      if (state.phase !== 'playing') return state;
      return { ...state, pendingGarbage: state.pendingGarbage + action.count };
    }
    default: return state;
  }
}

// ── Next piece preview ────────────────────────────────────────────

function NextPiece({ type, cellSize }) {
  const sz = Math.max(6, Math.round(cellSize * 0.45));
  const s = getShape(type, 0);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(4, ${sz}px)`, gap: 1 }}>
      {s.map((row, r) => row.map((cell, c) => (
        <div key={`${r}-${c}`} style={{
          width: sz, height: sz, borderRadius: 1,
          background: cell ? COLORS[type + 1] : 'transparent',
        }} />
      )))}
    </div>
  );
}

// ── TetrisGame ────────────────────────────────────────────────────

// Detect touch device once (stable across renders)
const IS_TOUCH = typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

const TetrisGame = ({ onStateUpdate, onLinesCleared, onGameOver, onGameRestart, garbageTotal = 0 }) => {
  const [state, dispatch] = useReducer(reducer, undefined, initState);
  const [soundOn, setSoundOn]         = useState(true);
  const [cellSize, setCellSize]       = useState(BASE_CELL);
  // Desktop: controls hidden by default; mobile: controls shown by default
  const [showControls, setShowControls] = useState(IS_TOUCH);

  const boardAreaRef  = useRef(null);
  const audioCtxRef   = useRef(null);
  const audioBufferRef= useRef(null);
  const soundOnRef    = useRef(true);
  const prevGarbageRef  = useRef(0);
  const prevClearSeqRef = useRef(0);
  const prevPhaseRef    = useRef('idle');
  const cbRefs = useRef({ onStateUpdate, onLinesCleared, onGameOver, onGameRestart });
  useEffect(() => { cbRefs.current = { onStateUpdate, onLinesCleared, onGameOver, onGameRestart }; });

  // ── Auto-pause when floating panel is minimized or hidden ──────────
  const { suspended } = useContext(FloatingPanelContext);
  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;
  const autoSuspendedRef = useRef(false);
  useEffect(() => {
    if (suspended && phaseRef.current === 'playing') {
      autoSuspendedRef.current = true;
      dispatch({ type: 'TOGGLE_PAUSE' });
    } else if (!suspended && autoSuspendedRef.current && phaseRef.current === 'paused') {
      autoSuspendedRef.current = false;
      dispatch({ type: 'TOGGLE_PAUSE' });
    } else if (!suspended) {
      autoSuspendedRef.current = false;
    }
  }, [suspended]);

  // ── Audio ─────────────────────────────────────────────────────
  useEffect(() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    audioCtxRef.current = ctx;
    fetch('/games/tetris/music.mp3')
      .then(r => r.arrayBuffer())
      .then(buf => ctx.decodeAudioData(buf))
      .then(decoded => { audioBufferRef.current = decoded; })
      .catch(() => {});
    return () => { ctx.close(); };
  }, []);

  const playSound = useCallback((name) => {
    if (!soundOnRef.current) return;
    const ctx = audioCtxRef.current;
    const buf = audioBufferRef.current;
    if (!ctx || !buf) return;
    const [offset, duration] = SOUNDS[name] || [];
    if (offset === undefined) return;
    const go = () => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0, offset, duration);
    };
    if (ctx.state === 'suspended') ctx.resume().then(go); else go();
  }, []);

  const toggleSound = useCallback(() => {
    soundOnRef.current = !soundOnRef.current;
    setSoundOn(soundOnRef.current);
  }, []);

  // ── Responsive board via ResizeObserver ───────────────────────
  useEffect(() => {
    if (!boardAreaRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const fromW = Math.floor((width  - 2) / COLS);
      const fromH = Math.floor((height - 2) / ROWS);
      setCellSize(Math.max(14, Math.min(fromW, fromH, 36)));
    });
    obs.observe(boardAreaRef.current);
    return () => obs.disconnect();
  }, []);

  // ── Drop timer ────────────────────────────────────────────────
  useEffect(() => {
    if (state.phase !== 'playing') return;
    const speed = SPEEDS[Math.min(state.level - 1, SPEEDS.length - 1)];
    const id = setInterval(() => dispatch({ type: 'TICK' }), speed);
    return () => clearInterval(id);
  }, [state.phase, state.level]);

  // ── Garbage from parent ───────────────────────────────────────
  useEffect(() => {
    const delta = garbageTotal - prevGarbageRef.current;
    if (delta > 0) { dispatch({ type: 'ADD_GARBAGE', count: delta }); prevGarbageRef.current = garbageTotal; }
  }, [garbageTotal]);

  // ── Lines-cleared callback + sound ───────────────────────────
  useEffect(() => {
    if (state.clearSeq !== prevClearSeqRef.current) {
      prevClearSeqRef.current = state.clearSeq;
      if (state.lastCleared > 0) {
        playSound('clear');
        cbRefs.current.onLinesCleared?.(state.lastCleared);
      }
    }
  }, [state.clearSeq, state.lastCleared, playSound]);

  // ── Phase-change callbacks + sounds ──────────────────────────
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    if (state.phase === 'over' && prev !== 'over') { playSound('gameover'); cbRefs.current.onGameOver?.(); }
    if (state.phase === 'playing' && prev === 'over') cbRefs.current.onGameRestart?.();
  }, [state.phase, playSound]);

  // ── State-update callback ─────────────────────────────────────
  useEffect(() => {
    if (state.phase === 'playing') {
      const matrix = stamp(state.board, state.cur.type, state.cur.rot, state.cur.x, state.cur.y);
      cbRefs.current.onStateUpdate?.({ score: state.score, lines: state.lines, level: state.level, matrix });
    }
  }, [state.board, state.cur, state.score, state.lines, state.level, state.phase]);

  // ── Keyboard input ────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e) => {
      if (state.phase === 'idle') { dispatch({ type: 'START' }); return; }
      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); playSound('move');   dispatch({ type: 'LEFT' });      break;
        case 'ArrowRight': e.preventDefault(); playSound('move');   dispatch({ type: 'RIGHT' });     break;
        case 'ArrowDown':  e.preventDefault(); playSound('move');   dispatch({ type: 'SOFT_DROP' }); break;
        case 'ArrowUp':    e.preventDefault(); playSound('rotate'); dispatch({ type: 'ROTATE' });    break;
        case ' ':          e.preventDefault(); playSound('drop');   dispatch({ type: 'HARD_DROP' }); break;
        case 'p': case 'P': dispatch({ type: 'TOGGLE_PAUSE' }); break;
        case 'r': case 'R': if (state.phase === 'over') dispatch({ type: 'START' }); break;
        case 's': case 'S': toggleSound(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [state.phase, playSound, toggleSound]);

  // ── Build render view ─────────────────────────────────────────
  const gy = state.phase === 'playing'
    ? ghostY(state.board, state.cur.type, state.cur.rot, state.cur.x, state.cur.y) : -1;

  const view = (() => {
    const v = state.board.map(r => r.map(col => ({ c: COLORS[col] || '', ghost: false })));
    if (state.phase === 'playing') {
      const s = getShape(state.cur.type, state.cur.rot);
      const col = COLORS[state.cur.type + 1];
      if (gy > state.cur.y) {
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
          if (!s[r][c]) continue;
          const ny = gy + r, nx = state.cur.x + c;
          if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS && !v[ny][nx].c)
            v[ny][nx] = { c: col, ghost: true };
        }
      }
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        if (!s[r][c]) continue;
        const ny = state.cur.y + r, nx = state.cur.x + c;
        if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS)
          v[ny][nx] = { c: col, ghost: false };
      }
    }
    return v;
  })();

  const boardW = COLS * cellSize + (COLS - 1);
  const boardH = ROWS * cellSize + (ROWS - 1);

  // Shared touch-button props
  const tb = (onAction, label, className = '') => ({
    className: `flex items-center justify-center font-black rounded-xl bg-gray-700 active:bg-gray-500 text-white touch-none select-none ${className}`,
    onPointerDown: (e) => { e.preventDefault(); onAction(); },
  });

  const doLeft      = () => { playSound('move');   dispatch({ type: 'LEFT' }); };
  const doRight     = () => { playSound('move');   dispatch({ type: 'RIGHT' }); };
  const doDown      = () => { playSound('move');   dispatch({ type: 'SOFT_DROP' }); };
  const doRotate    = () => { playSound('rotate'); dispatch({ type: 'ROTATE' }); };
  const doHardDrop  = () => { playSound('drop');   dispatch({ type: 'HARD_DROP' }); };
  const doPause     = () => dispatch({ type: 'TOGGLE_PAUSE' });
  const doStart     = () => dispatch({ type: 'START' });

  return (
    <div className="flex flex-col h-full w-full select-none bg-gray-950 overflow-hidden">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-shrink-0 px-3 pt-2 pb-1 gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-[8px] font-black text-gray-600 uppercase tracking-widest">Next</p>
          <NextPiece type={state.next} cellSize={cellSize} />
        </div>

        <div className="text-right flex flex-col gap-0 flex-shrink-0">
          <p className="text-[8px] text-gray-600 uppercase leading-tight">Score</p>
          <p className="text-base font-black text-white tabular-nums leading-tight">{state.score.toLocaleString()}</p>
          <p className="text-[8px] text-gray-500 leading-tight">
            Lv <span className="text-white font-bold">{state.level}</span>
            &nbsp;·&nbsp;Lines <span className="text-white font-bold">{state.lines}</span>
          </p>
        </div>

        <div className="flex flex-col gap-1 flex-shrink-0 mt-0.5">
          <button
            onClick={toggleSound}
            className="text-[10px] rounded bg-gray-800 hover:bg-gray-700 px-1.5 py-0.5 text-gray-400 hover:text-gray-200 transition-colors"
            title="Sound (S)"
          >{soundOn ? '🔊' : '🔇'}</button>
          <button
            onClick={() => setShowControls(v => !v)}
            className={`text-[10px] rounded px-1.5 py-0.5 transition-colors ${
              showControls
                ? 'bg-cyan-800/60 text-cyan-300 hover:bg-cyan-800'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300'
            }`}
            title={showControls ? 'Hide controls' : 'Show controls'}
          >🎮</button>
        </div>
      </div>

      {/* ── Board — fills all remaining space ────────────────── */}
      <div
        ref={boardAreaRef}
        className="flex-1 min-h-0 flex items-center justify-center overflow-hidden"
      >
        <div className="relative" style={{ width: boardW, height: boardH }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${ROWS}, ${cellSize}px)`,
            gap: 1,
            background: '#0f172a',
            width: boardW, height: boardH,
          }}>
            {view.map((row, ri) => row.map((cell, ci) => (
              <div key={`${ri}-${ci}`} style={{
                width: cellSize, height: cellSize,
                background: cell.c ? (cell.ghost ? cell.c + '40' : cell.c) : '#1e293b',
                borderRadius: 2,
                boxShadow: cell.c && !cell.ghost
                  ? 'inset 0 1px 0 rgba(255,255,255,0.2),inset 0 -1px 0 rgba(0,0,0,0.3)' : 'none',
              }} />
            )))}
          </div>

          {state.phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-950/95 z-20">
              <p className="text-2xl font-black text-cyan-400 tracking-[0.25em]">TETRIS</p>
              <p className="text-xs text-gray-500">Press any key or tap to start</p>
              <button
                onClick={doStart}
                className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-black font-black text-sm rounded-xl transition-colors"
              >▶ PLAY</button>
            </div>
          )}

          {state.phase === 'paused' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-20">
              <p className="text-white text-xl font-black tracking-widest">PAUSED</p>
            </div>
          )}

          {state.phase === 'over' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 backdrop-blur-sm z-20">
              <p className="text-4xl">💀</p>
              <p className="text-white text-lg font-black">TOPPED OUT</p>
              <p className="text-gray-500 text-[10px]">R or tap below to restart</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Touch controls (hidden on desktop by default) ─────── */}
      {showControls && (
        <div className="flex-shrink-0 px-3 pt-1 pb-3 flex flex-col gap-2">

          {/* Row 1 — utility left, rotate right */}
          <div className="flex items-center gap-2">
            <div className="flex gap-2">
              <button {...tb(doPause, '', 'h-12 w-12 text-xl bg-gray-800')}>
                {state.phase === 'paused' ? '▶' : '⏸'}
              </button>
              {state.phase === 'over' && (
                <button {...tb(doStart, '', 'h-12 w-12 text-xl bg-green-900 active:bg-green-700')}>↺</button>
              )}
            </div>
            <div className="flex-1" />
            {/* Rotate — most-used action, bigger target */}
            <button {...tb(doRotate, '', 'h-14 w-24 text-xl rounded-2xl bg-indigo-700 active:bg-indigo-500 shadow-md')}>
              ↻ ROT
            </button>
          </div>

          {/* Row 2 — D-pad: Left / Down / Right */}
          <div className="flex gap-2">
            <button {...tb(doLeft,  '', 'flex-1 h-14 text-2xl')}>◀</button>
            <button {...tb(doDown,  '', 'flex-1 h-14 text-2xl')}>▼</button>
            <button {...tb(doRight, '', 'flex-1 h-14 text-2xl')}>▶</button>
          </div>

          {/* Row 3 — Hard drop (full width, tall, prominent) */}
          <button
            className="w-full h-14 text-base font-black rounded-2xl bg-cyan-800 active:bg-cyan-600 text-cyan-100 touch-none select-none shadow-md tracking-widest"
            onPointerDown={(e) => { e.preventDefault(); doHardDrop(); }}
          >▼▼ HARD DROP</button>
        </div>
      )}
    </div>
  );
};

export default TetrisGame;
