export function createBoard(seed) {
  const board = Array(4).fill(null).map(() => Array(4).fill(0));
  return addTile(addTile(board, seed), seed + 1);
}

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function addTile(board, seed) {
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

function slideRow(row) {
  const nums = row.filter(v => v !== 0);
  const merged = [];
  let score = 0;
  let i = 0;
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
  while (merged.length < 4) merged.push(0);
  return { row: merged, score };
}

export function move(board, direction) {
  let totalScore = 0;
  let next = board.map(row => [...row]);

  const rotateRight = (b) => b[0].map((_, c) => b.map(row => row[c]).reverse());
  const rotateLeft = (b) => b[0].map((_, c) => b.map(row => row[row.length - 1 - c]));

  if (direction === 'right') next = next.map(row => [...row].reverse());
  if (direction === 'up') next = rotateRight(next);
  if (direction === 'down') next = rotateLeft(next);

  next = next.map(row => {
    const { row: r, score } = slideRow(row);
    totalScore += score;
    return r;
  });

  if (direction === 'right') next = next.map(row => [...row].reverse());
  if (direction === 'up') next = rotateLeft(next);
  if (direction === 'down') next = rotateRight(next);

  const changed = JSON.stringify(next) !== JSON.stringify(board);
  return { board: next, score: totalScore, changed };
}

export function getBestTile(board) {
  return Math.max(...board.flat());
}

export function isGameOver(board) {
  if (board.flat().some(v => v === 0)) return false;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (c < 3 && board[r][c] === board[r][c+1]) return false;
      if (r < 3 && board[r][c] === board[r+1][c]) return false;
    }
  }
  return true;
}

export const TILE_COLORS = {
  0:    { bg: '#eee4da22', text: '' },
  2:    { bg: '#eee4da', text: '#776e65' },
  4:    { bg: '#ede0c8', text: '#776e65' },
  8:    { bg: '#f2b179', text: '#f9f6f2' },
  16:   { bg: '#f59563', text: '#f9f6f2' },
  32:   { bg: '#f67c5f', text: '#f9f6f2' },
  64:   { bg: '#f65e3b', text: '#f9f6f2' },
  128:  { bg: '#edcf72', text: '#f9f6f2' },
  256:  { bg: '#edcc61', text: '#f9f6f2' },
  512:  { bg: '#edc850', text: '#f9f6f2' },
  1024: { bg: '#edc53f', text: '#f9f6f2' },
  2048: { bg: '#edc22e', text: '#f9f6f2' },
};
