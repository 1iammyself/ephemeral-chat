// Modes: 'standard' | 'threes'
// Grid sizes: N=4 (standard), N=5 (5x5 variant)

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function createBoard(seed, N = 4) {
  const board = Array(N).fill(null).map(() => Array(N).fill(0));
  return addTile(addTile(board, seed), seed + 1);
}

export function addTile(board, seed) {
  const N = board.length;
  const empty = [];
  board.forEach((row, r) => row.forEach((v, c) => { if (!v) empty.push([r,c]); }));
  if (!empty.length) return board;
  const rand = seededRandom(seed || Date.now());
  const [r, c] = empty[Math.floor(rand() * empty.length)];
  const value = rand() < 0.9 ? 2 : 4;
  const next = board.map(row => [...row]);
  next[r][c] = value;
  return next;
}

// ── Standard 2048 slide (merge equal pairs, slide all the way) ─────────────

function slideRow(row) {
  const N = row.length;
  const nums = row.filter(v => v !== 0);
  const merged = [];
  let score = 0, i = 0;
  while (i < nums.length) {
    if (i + 1 < nums.length && nums[i] === nums[i+1]) {
      merged.push(nums[i] * 2);
      score += nums[i] * 2;
      i += 2;
    } else {
      merged.push(nums[i]);
      i++;
    }
  }
  while (merged.length < N) merged.push(0);
  return { row: merged, score };
}

// ── Threes! slide (1+2=3, equal merges for ≥3; slide all the way for our hybrid) ──

function canMergeThrees(a, b) {
  if (a === 1 && b === 2) return true;
  if (a === 2 && b === 1) return true;
  if (a >= 3 && a === b) return true;
  return false;
}

function mergeThrees(a, b) {
  if ((a === 1 && b === 2) || (a === 2 && b === 1)) return 3;
  return a * 2;
}

function slideRowThrees(row) {
  const N = row.length;
  const nums = row.filter(v => v !== 0);
  const merged = [];
  let score = 0, i = 0;
  while (i < nums.length) {
    if (i + 1 < nums.length && canMergeThrees(nums[i], nums[i+1])) {
      const val = mergeThrees(nums[i], nums[i+1]);
      merged.push(val);
      score += val;
      i += 2;
    } else {
      merged.push(nums[i]);
      i++;
    }
  }
  while (merged.length < N) merged.push(0);
  return { row: merged, score };
}

// ── Generic move function ─────────────────────────────────────────────────

export function move(board, direction, mode = 'standard') {
  const N = board.length;
  const slideFn = mode === 'threes' ? slideRowThrees : slideRow;
  let totalScore = 0;
  let next = board.map(row => [...row]);

  const rotateRight = (b) => b[0].map((_, c) => b.map(row => row[c]).reverse());
  const rotateLeft  = (b) => b[0].map((_, c) => b.map(row => row[row.length - 1 - c]));

  if (direction === 'right') next = next.map(row => [...row].reverse());
  if (direction === 'up')    next = rotateLeft(next);
  if (direction === 'down')  next = rotateRight(next);

  next = next.map(row => {
    const { row: r, score } = slideFn(row);
    totalScore += score;
    return r;
  });

  if (direction === 'right') next = next.map(row => [...row].reverse());
  if (direction === 'up')    next = rotateRight(next);
  if (direction === 'down')  next = rotateLeft(next);

  const changed = JSON.stringify(next) !== JSON.stringify(board);
  return { board: next, score: totalScore, changed };
}

export function getBestTile(board) {
  return Math.max(...board.flat());
}

export function isGameOver(board) {
  if (board.flat().some(v => v === 0)) return false;
  const N = board.length;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (c < N-1 && board[r][c] === board[r][c+1]) return false;
      if (r < N-1 && board[r][c] === board[r+1][c]) return false;
    }
  }
  return true;
}

// Win tile per mode/size
export function getWinTile(mode = 'standard', N = 4) {
  if (mode === 'threes') return N === 4 ? 6144 : 12288;
  return N === 4 ? 2048 : 4096;
}

// Threes! starting tiles: 1 and 2 mixed in
export function createThreesBoard(seed) {
  const board = Array(4).fill(null).map(() => Array(4).fill(0));
  // Start with 9 tiles: mix of 1s and 2s and one 3
  const rand = seededRandom(seed || Date.now());
  const positions = [];
  while (positions.length < 9) {
    const pos = [Math.floor(rand() * 4), Math.floor(rand() * 4)];
    if (!positions.some(p => p[0] === pos[0] && p[1] === pos[1])) positions.push(pos);
  }
  const startTiles = [1,1,1,2,2,2,3,1,2];
  positions.forEach(([r,c], i) => { board[r][c] = startTiles[i]; });
  return board;
}

// Separate color tables per mode to avoid duplicate-key bugs
const TILE_COLORS_THREES = {
  0:    { bg: '#eee4da22', text: '' },
  1:    { bg: '#f0e4d3', text: '#776e65' },
  2:    { bg: '#e8dcc8', text: '#776e65' },
  3:    { bg: '#3498db', text: '#ffffff' },
  6:    { bg: '#2980b9', text: '#ffffff' },
  12:   { bg: '#1abc9c', text: '#ffffff' },
  24:   { bg: '#16a085', text: '#ffffff' },
  48:   { bg: '#27ae60', text: '#ffffff' },
  96:   { bg: '#1e8449', text: '#ffffff' },
  192:  { bg: '#f39c12', text: '#ffffff' },
  384:  { bg: '#e67e22', text: '#ffffff' },
  768:  { bg: '#d35400', text: '#ffffff' },
  1536: { bg: '#c0392b', text: '#ffffff' },
  3072: { bg: '#9b59b6', text: '#ffffff' },
  6144: { bg: '#2c3e50', text: '#ffffff' },
};

export const TILE_COLORS = {
  0:    { bg: '#eee4da22', text: '' },
  2:    { bg: '#eee4da', text: '#776e65' },
  4:    { bg: '#ede0c8', text: '#776e65' },
  6:    { bg: '#2980b9', text: '#ffffff' },
  8:    { bg: '#f2b179', text: '#f9f6f2' },
  12:   { bg: '#1abc9c', text: '#ffffff' },
  16:   { bg: '#f59563', text: '#f9f6f2' },
  24:   { bg: '#16a085', text: '#ffffff' },
  32:   { bg: '#f67c5f', text: '#f9f6f2' },
  48:   { bg: '#27ae60', text: '#ffffff' },
  64:   { bg: '#f65e3b', text: '#f9f6f2' },
  96:   { bg: '#1e8449', text: '#ffffff' },
  128:  { bg: '#edcf72', text: '#f9f6f2' },
  192:  { bg: '#f39c12', text: '#ffffff' },
  256:  { bg: '#edcc61', text: '#f9f6f2' },
  384:  { bg: '#e67e22', text: '#ffffff' },
  512:  { bg: '#edc850', text: '#f9f6f2' },
  768:  { bg: '#d35400', text: '#ffffff' },
  1024: { bg: '#edc53f', text: '#f9f6f2' },
  1536: { bg: '#c0392b', text: '#ffffff' },
  2048: { bg: '#edc22e', text: '#f9f6f2' },
  3072: { bg: '#9b59b6', text: '#ffffff' },
  4096: { bg: '#8e44ad', text: '#ffffff' },
  6144: { bg: '#2c3e50', text: '#ffffff' },
  8192: { bg: '#1a252f', text: '#ffffff' },
};

export function getTileColor(val, mode = 'standard') {
  const table = mode === 'threes' ? TILE_COLORS_THREES : TILE_COLORS;
  return table[val] || { bg: '#1a252f', text: '#ffffff' };
}
