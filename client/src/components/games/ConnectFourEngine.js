const ROWS = 6, COLS = 7;

export function createBoard() {
  return Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
}

export function dropDisc(board, col, player) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (!board[r][col]) {
      const next = board.map(row => [...row]);
      next[r][col] = player;
      return { board: next, row: r };
    }
  }
  return null;
}

export function checkWinner(board) {
  // horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const p = board[r][c];
      if (p && p === board[r][c+1] && p === board[r][c+2] && p === board[r][c+3])
        return { winner: p, cells: [[r,c],[r,c+1],[r,c+2],[r,c+3]] };
    }
  }
  // vertical
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p === board[r+1][c] && p === board[r+2][c] && p === board[r+3][c])
        return { winner: p, cells: [[r,c],[r+1,c],[r+2,c],[r+3,c]] };
    }
  }
  // diagonal ↘
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const p = board[r][c];
      if (p && p === board[r+1][c+1] && p === board[r+2][c+2] && p === board[r+3][c+3])
        return { winner: p, cells: [[r,c],[r+1,c+1],[r+2,c+2],[r+3,c+3]] };
    }
  }
  // diagonal ↙
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 3; c < COLS; c++) {
      const p = board[r][c];
      if (p && p === board[r+1][c-1] && p === board[r+2][c-2] && p === board[r+3][c-3])
        return { winner: p, cells: [[r,c],[r+1,c-1],[r+2,c-2],[r+3,c-3]] };
    }
  }
  if (board[0].every(c => c !== null)) return { winner: 'draw', cells: [] };
  return null;
}

function scoreWindow(window, player) {
  const opp = player === 1 ? 2 : 1;
  const playerCount = window.filter(c => c === player).length;
  const emptyCount = window.filter(c => c === null).length;
  const oppCount = window.filter(c => c === opp).length;
  if (playerCount === 4) return 100;
  if (playerCount === 3 && emptyCount === 1) return 5;
  if (playerCount === 2 && emptyCount === 2) return 2;
  if (oppCount === 3 && emptyCount === 1) return -4;
  return 0;
}

function scoreBoard(board, player) {
  let score = 0;
  // Center column preference
  const center = board.map(r => r[Math.floor(COLS/2)]);
  score += center.filter(c => c === player).length * 3;
  // Horizontal
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c <= COLS - 4; c++)
      score += scoreWindow([board[r][c],board[r][c+1],board[r][c+2],board[r][c+3]], player);
  // Vertical
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r <= ROWS - 4; r++)
      score += scoreWindow([board[r][c],board[r+1][c],board[r+2][c],board[r+3][c]], player);
  // Diagonals
  for (let r = 0; r <= ROWS-4; r++)
    for (let c = 0; c <= COLS-4; c++)
      score += scoreWindow([board[r][c],board[r+1][c+1],board[r+2][c+2],board[r+3][c+3]], player);
  for (let r = 0; r <= ROWS-4; r++)
    for (let c = 3; c < COLS; c++)
      score += scoreWindow([board[r][c],board[r+1][c-1],board[r+2][c-2],board[r+3][c-3]], player);
  return score;
}

function validCols(board) {
  return Array.from({ length: COLS }, (_, c) => c).filter(c => board[0][c] === null);
}

function minimax(board, depth, isMax, alpha, beta, player) {
  const result = checkWinner(board);
  if (result) {
    if (result.winner === player) return 10000 + depth;
    if (result.winner === (player === 1 ? 2 : 1)) return -(10000 + depth);
    return 0;
  }
  const valid = validCols(board);
  if (!valid.length || depth === 0) return scoreBoard(board, player);

  if (isMax) {
    let value = -Infinity;
    for (const c of valid) {
      const res = dropDisc(board, c, player);
      if (!res) continue;
      value = Math.max(value, minimax(res.board, depth - 1, false, alpha, beta, player));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  } else {
    const opp = player === 1 ? 2 : 1;
    let value = Infinity;
    for (const c of valid) {
      const res = dropDisc(board, c, opp);
      if (!res) continue;
      value = Math.min(value, minimax(res.board, depth - 1, true, alpha, beta, player));
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return value;
  }
}

export function getCpuMove(board, difficulty, player = 2) {
  const valid = validCols(board);
  if (!valid.length) return -1;
  if (difficulty === 'easy') return valid[Math.floor(Math.random() * valid.length)];
  const depth = difficulty === 'medium' ? 3 : 6;
  let best = -Infinity, bestCol = valid[Math.floor(valid.length / 2)];
  for (const c of valid) {
    const res = dropDisc(board, c, player);
    if (!res) continue;
    const score = minimax(res.board, depth - 1, false, -Infinity, Infinity, player);
    if (score > best) { best = score; bestCol = c; }
  }
  return bestCol;
}
