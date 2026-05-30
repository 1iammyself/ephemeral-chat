const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

export function checkWinner(board) {
  for (const line of WIN_LINES) {
    const [a,b,c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (board.every(c => c !== null)) return { winner: 'draw', line: [] };
  return null;
}

function minimax(board, isMaximizing, depth, alpha, beta) {
  const result = checkWinner(board);
  if (result) {
    if (result.winner === 'O') return 10 - depth;
    if (result.winner === 'X') return depth - 10;
    return 0;
  }
  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = 'O';
        best = Math.max(best, minimax(board, false, depth + 1, alpha, beta));
        board[i] = null;
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = 'X';
        best = Math.min(best, minimax(board, true, depth + 1, alpha, beta));
        board[i] = null;
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
    }
    return best;
  }
}

// Count the number of winning threats player gains by placing at index on board.
// Returns 0 if the move itself is an immediate win (not a fork scenario).
function countThreats(board, player, index) {
  const b = [...board];
  b[index] = player;
  if (checkWinner(b)) return 0; // immediate win, not a fork scenario
  const empty = b.map((v, i) => v === null ? i : -1).filter(i => i >= 0);
  let threats = 0;
  for (const j of empty) {
    const t = [...b]; t[j] = player;
    if (checkWinner(t)?.winner === player) threats++;
  }
  return threats;
}

// Return all empty cells where player would create 2+ simultaneous winning threats.
function findForkMoves(board, player) {
  const empty = board.map((v, i) => v === null ? i : -1).filter(i => i >= 0);
  return empty.filter(i => countThreats(board, player, i) >= 2);
}

// Strategic hint for the current player — uses priority rules, not minimax
export function getHintMove(board) {
  const xCount = board.filter(v => v === 'X').length;
  const oCount = board.filter(v => v === 'O').length;
  const player = xCount <= oCount ? 'X' : 'O';
  const opp    = player === 'X' ? 'O' : 'X';
  const empty  = board.map((v, i) => v === null ? i : -1).filter(i => i >= 0);
  if (!empty.length) return -1;
  // 1. Win immediately
  for (const i of empty) {
    const b = [...board]; b[i] = player;
    if (checkWinner(b)?.winner === player) return i;
  }
  // 2. Block opponent win
  for (const i of empty) {
    const b = [...board]; b[i] = opp;
    if (checkWinner(b)?.winner === opp) return i;
  }
  // 3. Fork
  const myForks = findForkMoves(board, player);
  if (myForks.length) return myForks[0];
  // 4. Block fork
  const oppForks = findForkMoves(board, opp);
  if (oppForks.length === 1) return oppForks[0];
  if (oppForks.length >= 2) {
    // Try to create a forcing threat that doesn't let opp fork
    for (const i of empty) {
      const b = [...board]; b[i] = player;
      const threat = empty.filter(j => j !== i).find(j => {
        const t = [...b]; t[j] = player;
        return checkWinner(t)?.winner === player;
      });
      if (threat === undefined) continue;
      const bBlock = [...b]; bBlock[threat] = opp;
      if (findForkMoves(bBlock, opp).length === 0) return i;
    }
    // Fallback: block any of their fork moves
    return oppForks[0];
  }
  // 5. Center
  if (empty.includes(4)) return 4;
  // 6. Opposite corner (if opponent is in a corner, take the opposite)
  const opposites = [[0, 8], [8, 0], [2, 6], [6, 2]];
  for (const [c1, c2] of opposites) {
    if (board[c2] === opp && empty.includes(c1)) return c1;
  }
  // 7. Any corner
  const corner = [0, 2, 6, 8].find(c => empty.includes(c));
  if (corner !== undefined) return corner;
  // 8. Any edge
  return empty[0];
}

// ── Ultimate Tic-Tac-Toe Engine ───────────────────────────────────────────

export function createUltimateState() {
  return {
    boards: Array(9).fill(null).map(() => Array(9).fill(null)),
    won: Array(9).fill(null), // null | 'X' | 'O' | 'draw'
    activeMini: null,         // null = free choice; number = forced mini-board
    turn: 'X',
    globalWon: null,
    globalLine: null,
  };
}

export function isValidUltimateMove(state, miniIdx, cellIdx) {
  if (state.globalWon) return false;
  if (state.activeMini !== null && state.activeMini !== miniIdx) return false;
  if (state.won[miniIdx]) return false;
  if (state.boards[miniIdx][cellIdx]) return false;
  return true;
}

export function applyUltimateMove(state, miniIdx, cellIdx) {
  if (!isValidUltimateMove(state, miniIdx, cellIdx)) return state;

  const newBoards = state.boards.map((b, i) => i === miniIdx ? [...b] : [...b]);
  newBoards[miniIdx][cellIdx] = state.turn;

  const newWon = [...state.won];
  const miniResult = checkWinner(newBoards[miniIdx]);
  if (miniResult) newWon[miniIdx] = miniResult.winner;

  // Global win: check 3-in-a-row of mini-board wins
  let globalWon = null, globalLine = null;
  const GW = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of GW) {
    const va = newWon[a], vb = newWon[b], vc = newWon[c];
    if (va && va !== 'draw' && va === vb && va === vc) { globalWon = va; globalLine = [a,b,c]; break; }
  }
  if (!globalWon && newWon.every(w => w !== null)) globalWon = 'draw';

  // Next active mini-board = the cell index clicked (sends opponent to that mini)
  let nextActive = cellIdx;
  if (newWon[nextActive]) nextActive = null; // that mini is done = free choice

  return {
    boards: newBoards,
    won: newWon,
    activeMini: nextActive,
    turn: state.turn === 'X' ? 'O' : 'X',
    globalWon,
    globalLine,
  };
}

export function getUltimateCpuMove(state, difficulty) {
  // Collect all valid moves
  const validMinis = state.activeMini !== null
    ? (state.won[state.activeMini] ? Array.from({length:9},(_,i)=>i).filter(i=>!state.won[i]) : [state.activeMini])
    : Array.from({length:9},(_,i)=>i).filter(i=>!state.won[i]);

  const validMoves = [];
  for (const mini of validMinis) {
    for (let cell = 0; cell < 9; cell++) {
      if (isValidUltimateMove(state, mini, cell)) validMoves.push({ mini, cell });
    }
  }
  if (!validMoves.length) return null;
  if (difficulty === 'easy') return validMoves[Math.floor(Math.random() * validMoves.length)];

  const player = state.turn, opp = player === 'X' ? 'O' : 'X';

  // 1. Win globally
  for (const mv of validMoves) {
    if (applyUltimateMove(state, mv.mini, mv.cell).globalWon === player) return mv;
  }
  // 2. Win any mini-board
  for (const mv of validMoves) {
    const testMini = [...state.boards[mv.mini]]; testMini[mv.cell] = player;
    if (checkWinner(testMini)?.winner === player) return mv;
  }
  // 3. Block opponent mini-board win
  for (const mv of validMoves) {
    const testMini = [...state.boards[mv.mini]]; testMini[mv.cell] = opp;
    if (checkWinner(testMini)?.winner === opp) return mv;
  }
  // 4. Prefer center cell (4) or center mini-board (4)
  const center = validMoves.filter(mv => mv.cell === 4 || mv.mini === 4);
  if (center.length) return center[Math.floor(Math.random() * center.length)];

  return validMoves[Math.floor(Math.random() * validMoves.length)];
}

// ─────────────────────────────────────────────────────────────────────────────

export function getCpuMove(board, difficulty) {
  const empty = board.map((v,i) => v === null ? i : -1).filter(i => i >= 0);
  if (!empty.length) return -1;
  if (difficulty === 'easy') return empty[Math.floor(Math.random() * empty.length)];
  // medium: 65% random moves so it makes visible mistakes; hard is full minimax (unbeatable)
  if (difficulty === 'medium' && Math.random() < 0.65) return empty[Math.floor(Math.random() * empty.length)];
  let bestScore = -Infinity, bestMove = empty[0];
  const b = [...board];
  for (const i of empty) {
    b[i] = 'O';
    const score = minimax(b, false, 0, -Infinity, Infinity);
    b[i] = null;
    if (score > bestScore) { bestScore = score; bestMove = i; }
  }
  return bestMove;
}
