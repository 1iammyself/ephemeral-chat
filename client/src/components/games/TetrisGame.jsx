import React, { useReducer, useEffect, useRef, useState } from 'react';

const COLS = 10;
const ROWS = 20;
const CELL = 22; // px per cell

// 7 tetrominoes × 4 rotations × 4×4 grid (row-major)
const PIECES = [
  // 0: I (cyan)
  [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
  ],
  // 1: O (yellow)
  [
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
  ],
  // 2: T (purple)
  [
    [[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,1,0],[0,1,0,0],[0,0,0,0]],
    [[0,1,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]],
  ],
  // 3: S (green)
  [
    [[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,1,0],[0,0,1,0],[0,0,0,0]],
    [[0,0,0,0],[0,1,1,0],[1,1,0,0],[0,0,0,0]],
    [[1,0,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]],
  ],
  // 4: Z (red)
  [
    [[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,0,0],[0,1,1,0],[0,0,0,0]],
    [[0,1,0,0],[1,1,0,0],[1,0,0,0],[0,0,0,0]],
  ],
  // 5: J (blue)
  [
    [[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,1,0],[0,0,1,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[1,1,0,0],[0,0,0,0]],
  ],
  // 6: L (orange)
  [
    [[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,1,0],[1,0,0,0],[0,0,0,0]],
    [[1,1,0,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],
  ],
];

// Color index: 0=empty, 1-7=pieces, 8=garbage
const COLORS = [
  '',         // 0 empty
  '#00e5e5',  // 1 I cyan
  '#e5e500',  // 2 O yellow
  '#9900cc',  // 3 T purple
  '#00cc00',  // 4 S green
  '#cc0000',  // 5 Z red
  '#0033cc',  // 6 J blue
  '#cc7700',  // 7 L orange
  '#445566',  // 8 garbage
];

const SCORE_TABLE = [0, 100, 300, 500, 800];
const SPEEDS = [800,717,633,550,467,383,300,217,133,100,83,83,83,83,83,67,67,67,50,50,33];

// ── Pure helpers ─────────────────────────────────────────────────

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function randType() {
  return Math.floor(Math.random() * 7);
}

function getShape(type, rot) {
  return PIECES[type][rot & 3];
}

function fits(board, type, rot, x, y) {
  const s = getShape(type, rot);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (!s[r][c]) continue;
      const ny = y + r, nx = x + c;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
      if (ny >= 0 && board[ny][nx]) return false;
    }
  }
  return true;
}

function stamp(board, type, rot, x, y) {
  const b = board.map(r => r.slice());
  const s = getShape(type, rot);
  const col = type + 1;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (!s[r][c]) continue;
      const ny = y + r, nx = x + c;
      if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) b[ny][nx] = col;
    }
  }
  return b;
}

function sweep(board) {
  const kept = board.filter(row => row.some(v => v === 0));
  const cleared = ROWS - kept.length;
  const top = Array.from({ length: cleared }, () => Array(COLS).fill(0));
  return { board: [...top, ...kept], cleared };
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

// ── State & Reducer ───────────────────────────────────────────────

function newGame() {
  return {
    phase: 'playing',
    board: emptyBoard(),
    cur: { type: randType(), rot: 0, x: 3, y: 0 },
    next: randType(),
    score: 0,
    lines: 0,
    level: 1,
    pendingGarbage: 0,
    clearSeq: 0,
    lastCleared: 0,
  };
}

function doLock(state) {
  let board = stamp(state.board, state.cur.type, state.cur.rot, state.cur.x, state.cur.y);
  const { board: swept, cleared } = sweep(board);
  board = swept;

  let { pendingGarbage } = state;
  if (pendingGarbage > 0) {
    const rows = Array.from({ length: pendingGarbage }, makeGarbageRow);
    board = [...board.slice(pendingGarbage), ...rows];
    pendingGarbage = 0;
  }

  const lines = state.lines + cleared;
  const level = Math.min(Math.floor(lines / 10) + 1, 20);
  const score = state.score + SCORE_TABLE[Math.min(cleared, 4)] * state.level;
  const clearSeq = state.clearSeq + (cleared > 0 ? 1 : 0);

  const nextType = state.next;
  const newNext = randType();
  if (!fits(board, nextType, 0, 3, 0)) {
    return { ...state, board, score, lines, level, pendingGarbage: 0, phase: 'over', clearSeq, lastCleared: cleared };
  }
  return {
    ...state,
    board, score, lines, level, pendingGarbage,
    cur: { type: nextType, rot: 0, x: 3, y: 0 },
    next: newNext,
    clearSeq,
    lastCleared: cleared,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'START':
      return newGame();
    case 'TOGGLE_PAUSE':
      if (state.phase === 'playing') return { ...state, phase: 'paused' };
      if (state.phase === 'paused') return { ...state, phase: 'playing' };
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
      if (fits(board, cur.type, cur.rot, cur.x - 1, cur.y))
        return { ...state, cur: { ...cur, x: cur.x - 1 } };
      return state;
    }
    case 'RIGHT': {
      if (state.phase !== 'playing') return state;
      const { cur, board } = state;
      if (fits(board, cur.type, cur.rot, cur.x + 1, cur.y))
        return { ...state, cur: { ...cur, x: cur.x + 1 } };
      return state;
    }
    case 'ROTATE': {
      if (state.phase !== 'playing') return state;
      const { cur, board } = state;
      const rot = (cur.rot + 1) & 3;
      for (const dx of [0, -1, 1, -2, 2]) {
        if (fits(board, cur.type, rot, cur.x + dx, cur.y))
          return { ...state, cur: { ...cur, rot, x: cur.x + dx } };
      }
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
    default:
      return state;
  }
}

// ── Next piece preview ────────────────────────────────────────────

function NextPiece({ type }) {
  const s = getShape(type, 0);
  const color = COLORS[type + 1];
  const sz = 9;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(4, ${sz}px)`, gap: 1 }}>
      {s.map((row, r) =>
        row.map((cell, c) => (
          <div
            key={`${r}-${c}`}
            style={{ width: sz, height: sz, background: cell ? color : 'transparent', borderRadius: 1 }}
          />
        ))
      )}
    </div>
  );
}

// ── TetrisGame ────────────────────────────────────────────────────

const TetrisGame = ({ onStateUpdate, onLinesCleared, onGameOver, onGameRestart, garbageTotal = 0 }) => {
  const [state, dispatch] = useReducer(reducer, undefined, newGame);
  const [musicOn, setMusicOn] = useState(false);
  const audioRef = useRef(null);
  const prevGarbageRef = useRef(0);
  const prevClearSeqRef = useRef(0);
  const prevPhaseRef = useRef('playing');

  // Stable callback refs to avoid stale closures
  const cbRefs = useRef({ onStateUpdate, onLinesCleared, onGameOver, onGameRestart });
  useEffect(() => { cbRefs.current = { onStateUpdate, onLinesCleared, onGameOver, onGameRestart }; });

  // Drop timer
  useEffect(() => {
    if (state.phase !== 'playing') return;
    const speed = SPEEDS[Math.min(state.level - 1, SPEEDS.length - 1)];
    const id = setInterval(() => dispatch({ type: 'TICK' }), speed);
    return () => clearInterval(id);
  }, [state.phase, state.level]);

  // Garbage rows from parent (monotonically increasing total)
  useEffect(() => {
    const delta = garbageTotal - prevGarbageRef.current;
    if (delta > 0) {
      dispatch({ type: 'ADD_GARBAGE', count: delta });
      prevGarbageRef.current = garbageTotal;
    }
  }, [garbageTotal]);

  // Lines-cleared callback
  useEffect(() => {
    if (state.clearSeq !== prevClearSeqRef.current) {
      prevClearSeqRef.current = state.clearSeq;
      if (state.lastCleared > 0) cbRefs.current.onLinesCleared?.(state.lastCleared);
    }
  }, [state.clearSeq, state.lastCleared]);

  // Phase-change callbacks
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    if (state.phase === 'over' && prev !== 'over') cbRefs.current.onGameOver?.();
    if (state.phase === 'playing' && prev === 'over') cbRefs.current.onGameRestart?.();
  }, [state.phase]);

  // State-update callback (for opponent mini-board and socket relay)
  useEffect(() => {
    if (state.phase === 'playing') {
      const matrix = stamp(state.board, state.cur.type, state.cur.rot, state.cur.x, state.cur.y);
      cbRefs.current.onStateUpdate?.({ score: state.score, lines: state.lines, level: state.level, matrix });
    }
  }, [state.board, state.cur, state.score, state.lines, state.level, state.phase]);

  // Keyboard input
  useEffect(() => {
    const handleKey = (e) => {
      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); dispatch({ type: 'LEFT' }); break;
        case 'ArrowRight': e.preventDefault(); dispatch({ type: 'RIGHT' }); break;
        case 'ArrowDown':  e.preventDefault(); dispatch({ type: 'SOFT_DROP' }); break;
        case 'ArrowUp':    e.preventDefault(); dispatch({ type: 'ROTATE' }); break;
        case ' ':          e.preventDefault(); dispatch({ type: 'HARD_DROP' }); break;
        case 'p': case 'P': dispatch({ type: 'TOGGLE_PAUSE' }); break;
        case 'r': case 'R':
          if (state.phase === 'over') dispatch({ type: 'START' });
          break;
        case 'm': case 'M': {
          const audio = audioRef.current;
          if (!audio) break;
          if (audio.paused) { audio.play().catch(() => {}); setMusicOn(true); }
          else { audio.pause(); setMusicOn(false); }
          break;
        }
        default: break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [state.phase]);

  // Build render view: board + ghost + current piece
  const gy = state.phase === 'playing'
    ? ghostY(state.board, state.cur.type, state.cur.rot, state.cur.x, state.cur.y)
    : -1;

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

  const boardW = COLS * CELL + (COLS - 1);
  const boardH = ROWS * CELL + (ROWS - 1);

  const toggleMusic = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) { audio.play().catch(() => {}); setMusicOn(true); }
    else { audio.pause(); setMusicOn(false); }
  };

  return (
    <div className="flex flex-col items-center bg-gray-950 select-none py-2 px-2 gap-2">
      {/* Header row */}
      <div className="flex items-start justify-between w-full" style={{ width: boardW }}>
        <div>
          <p className="text-[8px] font-black text-gray-600 uppercase tracking-widest mb-0.5">Next</p>
          <NextPiece type={state.next} />
        </div>
        <div className="text-right">
          <p className="text-[8px] text-gray-600 uppercase">Score</p>
          <p className="text-sm font-black text-white tabular-nums">{state.score.toLocaleString()}</p>
          <p className="text-[8px] text-gray-500 mt-0.5">
            Lv <span className="text-white font-bold">{state.level}</span>
            &nbsp;·&nbsp;
            Lines <span className="text-white font-bold">{state.lines}</span>
          </p>
        </div>
        <button
          onClick={toggleMusic}
          className="text-[10px] rounded bg-gray-800 hover:bg-gray-700 px-1.5 py-1 text-gray-400 hover:text-gray-200 transition-colors"
          title="Toggle music (M)"
        >
          {musicOn ? '🔊' : '🔇'}
        </button>
      </div>

      {/* Board */}
      <div className="relative" style={{ width: boardW, height: boardH, flexShrink: 0 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
            gridTemplateRows: `repeat(${ROWS}, ${CELL}px)`,
            gap: 1,
            background: '#0f172a',
          }}
        >
          {view.map((row, ri) =>
            row.map((cell, ci) => (
              <div
                key={`${ri}-${ci}`}
                style={{
                  width: CELL, height: CELL,
                  background: cell.c
                    ? (cell.ghost ? cell.c + '40' : cell.c)
                    : '#1e293b',
                  borderRadius: 2,
                  boxShadow: cell.c && !cell.ghost
                    ? 'inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.3)'
                    : 'none',
                }}
              />
            ))
          )}
        </div>

        {state.phase === 'paused' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-10">
            <p className="text-white text-lg font-black tracking-widest">PAUSED</p>
          </div>
        )}

        {state.phase === 'over' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/80 backdrop-blur-sm z-10">
            <p className="text-4xl">💀</p>
            <p className="text-white text-base font-black">TOPPED OUT</p>
            <p className="text-gray-500 text-[10px]">Press R or tap below to restart</p>
          </div>
        )}
      </div>

      {/* Touch controls */}
      <div className="flex flex-col items-center gap-1 w-full" style={{ width: boardW }}>
        <button
          onPointerDown={(e) => { e.preventDefault(); dispatch({ type: 'ROTATE' }); }}
          className="w-full py-2 text-[11px] font-black rounded-lg bg-gray-800 text-white active:bg-gray-600 touch-none"
        >↑ ROTATE</button>
        <div className="flex gap-1 w-full">
          <button
            onPointerDown={(e) => { e.preventDefault(); dispatch({ type: 'LEFT' }); }}
            className="flex-1 py-2.5 text-[11px] font-black rounded-lg bg-gray-800 text-white active:bg-gray-600 touch-none"
          >← L</button>
          <button
            onPointerDown={(e) => { e.preventDefault(); dispatch({ type: 'SOFT_DROP' }); }}
            className="flex-1 py-2.5 text-[11px] font-black rounded-lg bg-gray-800 text-white active:bg-gray-600 touch-none"
          >↓ D</button>
          <button
            onPointerDown={(e) => { e.preventDefault(); dispatch({ type: 'RIGHT' }); }}
            className="flex-1 py-2.5 text-[11px] font-black rounded-lg bg-gray-800 text-white active:bg-gray-600 touch-none"
          >→ R</button>
        </div>
        <button
          onPointerDown={(e) => { e.preventDefault(); dispatch({ type: 'HARD_DROP' }); }}
          className="w-full py-2 text-[11px] font-black rounded-lg bg-cyan-900 text-cyan-200 active:bg-cyan-700 touch-none"
        >▼ HARD DROP</button>
        <div className="flex gap-1 w-full">
          <button
            onPointerDown={(e) => { e.preventDefault(); dispatch({ type: 'TOGGLE_PAUSE' }); }}
            className="flex-1 py-1.5 text-[10px] font-black rounded-lg bg-gray-700 text-gray-300 active:bg-gray-500 touch-none"
          >{state.phase === 'paused' ? '▶ RESUME' : '⏸ PAUSE'}</button>
          {state.phase === 'over' && (
            <button
              onPointerDown={(e) => { e.preventDefault(); dispatch({ type: 'START' }); }}
              className="flex-1 py-1.5 text-[10px] font-black rounded-lg bg-green-900 text-green-200 active:bg-green-700 touch-none"
            >↺ RESTART</button>
          )}
        </div>
      </div>

      <audio ref={audioRef} src="/games/tetris/music.mp3" loop preload="none" />
    </div>
  );
};

export default TetrisGame;
