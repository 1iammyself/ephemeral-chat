// Variants: 'american' | 'russian' | 'brazilian'
// American:  short kings, men forward only, no majority capture, promotion ends turn
// Russian:   flying kings, men capture backward, no majority capture, promotion mid-sequence continues
// Brazilian: flying kings, men capture backward, majority capture required, promotion ends turn

export function initBoard(variant = 'american') {
  const rows = 8, cols = 8;
  const board = Array(rows).fill(null).map(() => Array(cols).fill(null));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2 === 1) {
        if (r < 3) board[r][c] = { p: 2, k: false };
        else if (r > 4) board[r][c] = { p: 1, k: false };
      }
    }
  }
  return board;
}

function isFlying(piece, variant) {
  return piece.k && variant !== 'american';
}

function canCaptureBackward(piece, variant) {
  return piece.k || variant !== 'american';
}

const ALL_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1]];

function forwardDirs(piece) {
  return piece.p === 1 ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
}

export function getJumps(board, r, c, variant = 'american') {
  const piece = board[r][c];
  if (!piece) return [];
  const jumps = [];
  const dirs = canCaptureBackward(piece, variant) ? ALL_DIRS : forwardDirs(piece);

  if (isFlying(piece, variant)) {
    // Flying king: scan along each diagonal; collect all valid landing squares beyond first opponent
    for (const [dr, dc] of ALL_DIRS) {
      let mr = r + dr, mc = c + dc;
      let opponentPos = null;
      while (mr >= 0 && mr < 8 && mc >= 0 && mc < 8) {
        const cell = board[mr][mc];
        if (!cell) {
          if (opponentPos) jumps.push({ from: [r,c], to: [mr,mc], captured: opponentPos });
        } else if (cell.p !== piece.p && !opponentPos) {
          opponentPos = [mr, mc];
        } else {
          break; // own piece, or second opponent
        }
        mr += dr; mc += dc;
      }
    }
  } else {
    // Short jump (1 square over)
    for (const [dr, dc] of dirs) {
      const mr = r+dr, mc = c+dc;
      const lr = r+dr*2, lc = c+dc*2;
      if (lr<0||lr>7||lc<0||lc>7) continue;
      const mid = board[mr]?.[mc];
      if (mid && mid.p !== piece.p && !board[lr][lc]) {
        jumps.push({ from:[r,c], to:[lr,lc], captured:[mr,mc] });
      }
    }
  }
  return jumps;
}

export function getMoves(board, r, c, variant = 'american') {
  const piece = board[r][c];
  if (!piece) return [];
  const moves = [];
  const moveDirs = piece.k ? ALL_DIRS : forwardDirs(piece);

  if (isFlying(piece, variant)) {
    for (const [dr, dc] of ALL_DIRS) {
      let nr = r+dr, nc = c+dc;
      while (nr>=0&&nr<8&&nc>=0&&nc<8&&!board[nr][nc]) {
        moves.push({ from:[r,c], to:[nr,nc], captured:null });
        nr+=dr; nc+=dc;
      }
    }
  } else {
    for (const [dr, dc] of moveDirs) {
      const nr=r+dr, nc=c+dc;
      if (nr<0||nr>7||nc<0||nc>7) continue;
      if (!board[nr][nc]) moves.push({ from:[r,c], to:[nr,nc], captured:null });
    }
  }
  return moves;
}

// Recursively compute max capture count available from (r,c) given board state
function maxCaptureDepth(board, r, c, variant, visitedCaptures = new Set()) {
  const jumps = getJumps(board, r, c, variant);
  const available = jumps.filter(j => {
    const key = `${j.captured[0]},${j.captured[1]}`;
    return !visitedCaptures.has(key);
  });
  if (!available.length) return 0;
  let max = 0;
  for (const j of available) {
    const next = applyMove(board, j);
    const key = `${j.captured[0]},${j.captured[1]}`;
    const depth = 1 + maxCaptureDepth(next, j.to[0], j.to[1], variant, new Set([...visitedCaptures, key]));
    if (depth > max) max = depth;
  }
  return max;
}

export function getAllMoves(board, player, variant = 'american') {
  const jumps = [], moves = [];
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
    if (board[r][c]?.p===player) {
      jumps.push(...getJumps(board, r, c, variant));
      moves.push(...getMoves(board, r, c, variant));
    }
  }
  if (!jumps.length) return moves;

  // Brazilian: mandatory majority capture — only return max-depth jump sequences
  if (variant === 'brazilian') {
    let maxDepth = 0;
    for (const j of jumps) {
      const next = applyMove(board, j);
      const depth = 1 + maxCaptureDepth(next, j.to[0], j.to[1], variant, new Set([`${j.captured[0]},${j.captured[1]}`]));
      if (depth > maxDepth) maxDepth = depth;
    }
    return jumps.filter(j => {
      const next = applyMove(board, j);
      const depth = 1 + maxCaptureDepth(next, j.to[0], j.to[1], variant, new Set([`${j.captured[0]},${j.captured[1]}`]));
      return depth === maxDepth;
    });
  }
  return jumps;
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
  if (next[tr][tc].p === 1 && tr === 0) next[tr][tc] = { ...next[tr][tc], k: true };
  if (next[tr][tc].p === 2 && tr === 7) next[tr][tc] = { ...next[tr][tc], k: true };
  return next;
}

export function checkWinner(board) {
  const p1 = board.flat().filter(c => c?.p===1).length;
  const p2 = board.flat().filter(c => c?.p===2).length;
  if (p1===0) return 2;
  if (p2===0) return 1;
  if (getAllMoves(board,1).length===0) return 2;
  if (getAllMoves(board,2).length===0) return 1;
  return null;
}

function boardScore(board, player) {
  let score = 0;
  for (const cell of board.flat()) {
    if (!cell) continue;
    const val = cell.k ? 3 : 1;
    score += cell.p===player ? val : -val;
  }
  return score;
}

function minimaxCheckers(board, depth, isMax, alpha, beta, player, variant) {
  const winner = checkWinner(board);
  if (winner) return winner===player ? 1000+depth : -(1000+depth);
  if (depth===0) return boardScore(board, player);
  const current = isMax ? player : (player===1?2:1);
  const moves = getAllMoves(board, current, variant);
  if (!moves.length) return isMax ? -1000 : 1000;
  if (isMax) {
    let v=-Infinity;
    for (const m of moves) {
      v=Math.max(v, minimaxCheckers(applyMove(board,m),depth-1,false,alpha,beta,player,variant));
      alpha=Math.max(alpha,v); if (alpha>=beta) break;
    }
    return v;
  } else {
    let v=Infinity;
    for (const m of moves) {
      v=Math.min(v, minimaxCheckers(applyMove(board,m),depth-1,true,alpha,beta,player,variant));
      beta=Math.min(beta,v); if (alpha>=beta) break;
    }
    return v;
  }
}

export function getCpuMove(board, difficulty, player=2, variant='american') {
  const moves = getAllMoves(board, player, variant);
  if (!moves.length) return null;
  if (difficulty==='easy') return moves[Math.floor(Math.random()*moves.length)];
  const depth = difficulty==='medium' ? 2 : 4;
  let best=-Infinity, bestMove=moves[0];
  for (const m of moves) {
    const score = minimaxCheckers(applyMove(board,m),depth-1,false,-Infinity,Infinity,player,variant);
    if (score>best) { best=score; bestMove=m; }
  }
  return bestMove;
}
