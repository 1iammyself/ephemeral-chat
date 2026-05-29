export function initBoard() {
  const board = Array(8).fill(null).map(() => Array(8).fill(null));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        if (r < 3) board[r][c] = { p: 2, k: false };
        else if (r > 4) board[r][c] = { p: 1, k: false };
      }
    }
  }
  return board;
}

function dirs(piece) {
  if (piece.k) return [[-1,-1],[-1,1],[1,-1],[1,1]];
  return piece.p === 1 ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
}

export function getJumps(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const jumps = [];
  for (const [dr,dc] of dirs(piece)) {
    const mr = r+dr, mc = c+dc;
    const lr = r+dr*2, lc = c+dc*2;
    if (lr<0||lr>7||lc<0||lc>7) continue;
    const mid = board[mr]?.[mc];
    if (mid && mid.p !== piece.p && !board[lr][lc]) {
      jumps.push({ from:[r,c], to:[lr,lc], captured:[mr,mc] });
    }
  }
  return jumps;
}

export function getMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const moves = [];
  for (const [dr,dc] of dirs(piece)) {
    const nr = r+dr, nc = c+dc;
    if (nr<0||nr>7||nc<0||nc>7) continue;
    if (!board[nr][nc]) moves.push({ from:[r,c], to:[nr,nc], captured:null });
  }
  return moves;
}

export function getAllMoves(board, player) {
  const jumps = [];
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.p === player) {
        jumps.push(...getJumps(board, r, c));
        moves.push(...getMoves(board, r, c));
      }
    }
  }
  return jumps.length > 0 ? jumps : moves;
}

export function applyMove(board, move) {
  const next = board.map(row => row.map(c => c ? {...c} : null));
  const [fr, fc] = move.from, [tr, tc] = move.to;
  next[tr][tc] = next[fr][fc];
  next[fr][fc] = null;
  if (move.captured) {
    const [cr, cc] = move.captured;
    next[cr][cc] = null;
  }
  // King promotion
  if (next[tr][tc].p === 1 && tr === 0) next[tr][tc].k = true;
  if (next[tr][tc].p === 2 && tr === 7) next[tr][tc].k = true;
  return next;
}

export function checkWinner(board) {
  const p1 = board.flat().filter(c => c?.p === 1).length;
  const p2 = board.flat().filter(c => c?.p === 2).length;
  if (p1 === 0) return 2;
  if (p2 === 0) return 1;
  if (getAllMoves(board, 1).length === 0) return 2;
  if (getAllMoves(board, 2).length === 0) return 1;
  return null;
}

function boardScore(board, player) {
  let score = 0;
  for (const cell of board.flat()) {
    if (!cell) continue;
    const val = cell.k ? 3 : 1;
    score += cell.p === player ? val : -val;
  }
  return score;
}

function minimaxCheckers(board, depth, isMax, alpha, beta, player) {
  const winner = checkWinner(board);
  if (winner) return winner === player ? 1000 + depth : -(1000 + depth);
  if (depth === 0) return boardScore(board, player);
  const current = isMax ? player : (player === 1 ? 2 : 1);
  const moves = getAllMoves(board, current);
  if (!moves.length) return isMax ? -1000 : 1000;
  if (isMax) {
    let v = -Infinity;
    for (const m of moves) {
      v = Math.max(v, minimaxCheckers(applyMove(board, m), depth-1, false, alpha, beta, player));
      alpha = Math.max(alpha, v);
      if (alpha >= beta) break;
    }
    return v;
  } else {
    let v = Infinity;
    for (const m of moves) {
      v = Math.min(v, minimaxCheckers(applyMove(board, m), depth-1, true, alpha, beta, player));
      beta = Math.min(beta, v);
      if (alpha >= beta) break;
    }
    return v;
  }
}

export function getCpuMove(board, difficulty, player = 2) {
  const moves = getAllMoves(board, player);
  if (!moves.length) return null;
  if (difficulty === 'easy') return moves[Math.floor(Math.random() * moves.length)];
  const depth = difficulty === 'medium' ? 3 : 6;
  let best = -Infinity, bestMove = moves[0];
  for (const m of moves) {
    const score = minimaxCheckers(applyMove(board, m), depth-1, false, -Infinity, Infinity, player);
    if (score > best) { best = score; bestMove = m; }
  }
  return bestMove;
}
