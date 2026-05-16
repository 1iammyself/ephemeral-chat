import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chess } from '../../utils/chess-lib';
import { getVibeById } from '../../utils/vibes';

// ── Chess AI Engine ──────────────────────────────────────────────────────────
const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Piece-square tables (white perspective, rank 0 = rank 1)
const PST = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

function pstScore(piece, square) {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]) - 1;
  const idx = piece.color === 'w' ? (7 - rank) * 8 + file : rank * 8 + file;
  return (PST[piece.type]?.[idx] ?? 0);
}

function evaluateBoard(chess) {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? -99999 : 99999;
  if (chess.isDraw()) return 0;
  let score = 0;
  chess.board().flat().forEach(p => {
    if (!p) return;
    const val = PIECE_VALUES[p.type] + pstScore(p, p.square);
    score += p.color === 'w' ? val : -val;
  });
  return score;
}

function minimax(chess, depth, alpha, beta, maximizing) {
  if (depth === 0 || chess.isGameOver()) return evaluateBoard(chess);
  const moves = chess.moves();
  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      chess.move(move);
      best = Math.max(best, minimax(chess, depth - 1, alpha, beta, false));
      chess.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      chess.move(move);
      best = Math.min(best, minimax(chess, depth - 1, alpha, beta, true));
      chess.undo();
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function getBestMove(fen, difficulty) {
  const chess = new Chess(fen);
  const moves = chess.moves();
  if (!moves.length) return null;

  if (difficulty === 'easy') {
    // 70% random, 30% captures/checks
    const captures = moves.filter(m => m.includes('x') || m.includes('+'));
    if (captures.length && Math.random() < 0.3) return captures[Math.floor(Math.random() * captures.length)];
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const depth = difficulty === 'hard' ? 4 : 2;
  const isMax = chess.turn() === 'w';
  let bestScore = isMax ? -Infinity : Infinity;
  let bestMoves = [];

  for (const move of moves) {
    chess.move(move);
    const score = minimax(chess, depth - 1, -Infinity, Infinity, !isMax);
    chess.undo();
    if (isMax ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

// SVG Pieces — standalone, no external assets
const PIECES = {
  w: {
    p: (fill, stroke) => (
      <svg viewBox="0 0 45 45" width="100%" height="100%">
        <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    n: (fill, stroke) => (
      <svg viewBox="0 0 45 45" width="100%" height="100%">
        <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill={fill} stroke={stroke} strokeWidth="1.5" />
        <path d="M24 18c.3 1.2 1.5 2.5 1.5 2.5s-1.5 3-2.5 4.5" fill="none" stroke={stroke} strokeWidth="1.5" />
        <path d="M9.5 25.5A.5.5 0 1 1 9 25.5a.5.5 0 0 1 .5.5z" fill={fill} stroke={stroke} strokeWidth="1.5" />
        <path d="M15 15.5c4.5 2 7.5 7 7.5 12" fill="none" stroke={stroke} strokeWidth="1.5" />
      </svg>
    ),
    b: (fill, stroke) => (
      <svg viewBox="0 0 45 45" width="100%" height="100%">
        <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 0 2 0 2H9v-2z" />
          <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
          <path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z" />
        </g>
      </svg>
    ),
    r: (fill, stroke) => (
      <svg viewBox="0 0 45 45" width="100%" height="100%">
        <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" />
          <path d="M34 14l-3 3H14l-3-3" />
          <path d="M31 17v12.5H14V17" />
          <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
          <path d="M11 14h23" fill="none" stroke={stroke} strokeLinejoin="miter" />
        </g>
      </svg>
    ),
    q: (fill, stroke) => (
      <svg viewBox="0 0 45 45" width="100%" height="100%">
        <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM24.5 7.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM11 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM38 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
          <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-5.5-13.5V25L13 14l-4 12z" />
          <path d="M9 26c0 2 1.5 2 2.5 4 2.5 4 4.5 6 12 6s9.5-2 12-6c1-2 2.5-2 2.5-4 0-5-5-10-7-10H16c-2 0-7 5-7 10z" />
          <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" />
        </g>
      </svg>
    ),
    k: (fill, stroke) => (
      <svg viewBox="0 0 45 45" width="100%" height="100%">
        <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22.5 11.63V6M20 8h5" fill="none" stroke={stroke} strokeLinejoin="miter" />
          <path d="M22.5 25s4.5-7.5 3-10c-1.5-2.5-6-2.5-6 0-1.5 2.5 3 10 3 10z" />
          <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-1-1-4-1-4s-3 3-3 8c1.5 3-3 5.5-3 5.5s-3-2-3-4.5V14.5h-4V24s-3 2.5-3 2.5-3-2.5-3-2.5V14.5h-4v9.5c0 2.5-3 4.5-3 4.5s-4.5-2.5-3-5.5c0-5-3-8-3-8s3 3-1 4c-3 6 6 10.5 6 10.5v7z" />
          <path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0" fill="none" />
        </g>
      </svg>
    ),
  },
  b: {
    p: (fill, stroke) => (
      <svg viewBox="0 0 45 45" width="100%" height="100%">
        <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    n: (fill, stroke) => (
      <svg viewBox="0 0 45 45" width="100%" height="100%">
        <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
          <path d="M24 18c.3 1.2 1.5 2.5 1.5 2.5s-1.5 3-2.5 4.5" fill={fill} stroke={stroke} />
          <path d="M9.5 25.5A.5.5 0 1 1 9 25.5a.5.5 0 0 1 .5.5z" fill={fill} stroke={stroke} />
          <path d="M15 15.5c4.5 2 7.5 7 7.5 12" fill="none" stroke={stroke} />
        </g>
      </svg>
    ),
    b: (fill, stroke) => (
      <svg viewBox="0 0 45 45" width="100%" height="100%">
        <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 0 2 0 2H9v-2z" />
          <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
          <path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z" />
        </g>
      </svg>
    ),
    r: (fill, stroke) => (
      <svg viewBox="0 0 45 45" width="100%" height="100%">
        <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" />
          <path d="M34 14l-3 3H14l-3-3" />
          <path d="M31 17v12.5H14V17" />
          <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
          <path d="M11 14h23" fill="none" stroke={stroke} strokeLinejoin="miter" />
        </g>
      </svg>
    ),
    q: (fill, stroke) => (
      <svg viewBox="0 0 45 45" width="100%" height="100%">
        <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM24.5 7.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM11 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM38 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
          <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-5.5-13.5V25L13 14l-4 12z" />
          <path d="M9 26c0 2 1.5 2 2.5 4 2.5 4 4.5 6 12 6s9.5-2 12-6c1-2 2.5-2 2.5-4 0-5-5-10-7-10H16c-2 0-7 5-7 10z" />
          <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" />
        </g>
      </svg>
    ),
    k: (fill, stroke) => (
      <svg viewBox="0 0 45 45" width="100%" height="100%">
        <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22.5 11.63V6M20 8h5" fill="none" stroke={stroke} strokeLinejoin="miter" />
          <path d="M22.5 25s4.5-7.5 3-10c-1.5-2.5-6-2.5-6 0-1.5 2.5 3 10 3 10z" />
          <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-1-1-4-1-4s-3 3-3 8c1.5 3-3 5.5-3 5.5s-3-2-3-4.5V14.5h-4V24s-3 2.5-3 2.5-3-2.5-3-2.5V14.5h-4v9.5c0 2.5-3 4.5-3 4.5s-4.5-2.5-3-5.5c0-5-3-8-3-8s3 3-1 4c-3 6 6 10.5 6 10.5v7z" />
          <path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0" fill="none" />
        </g>
      </svg>
    ),
  },
};

const ChessGame = ({ gameData, currentUserId, currentNickname, onMove, vibeId }) => {
  const [game, setGame] = useState(() => new Chess(gameData?.fen || undefined));
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [cpuThinking, setCpuThinking] = useState(false);
  const cpuTimerRef = useRef(null);
  const vibe = getVibeById(vibeId);
  const primary = vibe.colors?.primary || '#6366f1';

  const isCPU = !!gameData?.isCPU;
  const cpuDifficulty = gameData?.cpuDifficulty || 'medium';

  const isWhite =
    gameData?.players?.white?.id === currentUserId ||
    (currentNickname && gameData?.players?.white?.name === currentNickname);
  const isBlack =
    gameData?.players?.black?.id === currentUserId ||
    (currentNickname && gameData?.players?.black?.name === currentNickname);
  const isMyTurn =
    (game.turn() === 'w' && isWhite) || (game.turn() === 'b' && isBlack);

  // Trigger CPU move when it's black's turn in CPU mode
  const triggerCpuMove = useCallback((fen) => {
    if (!isCPU || game.isGameOver()) return;
    setCpuThinking(true);
    const delay = cpuDifficulty === 'easy' ? 400 : cpuDifficulty === 'medium' ? 700 : 1200;
    cpuTimerRef.current = setTimeout(() => {
      const move = getBestMove(fen, cpuDifficulty);
      if (move) {
        const tempChess = new Chess(fen);
        const result = tempChess.move(move);
        if (result) onMove({ from: result.from, to: result.to, promotion: result.promotion || undefined, isCpuMove: true });
      }
      setCpuThinking(false);
    }, delay);
  }, [isCPU, cpuDifficulty, game, onMove]);

  useEffect(() => {
    if (gameData?.fen) {
      const newGame = new Chess(gameData.fen);
      setGame(newGame);
      setSelectedSquare(null);
      setValidMoves([]);
      // Fire CPU move if it's black's turn in CPU mode and game is still active
      if (isCPU && newGame.turn() === 'b' && !newGame.isGameOver()) {
        triggerCpuMove(gameData.fen);
      }
    }
    return () => { if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current); };
  }, [gameData?.fen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSquareClick = (square) => {
    if (!isMyTurn || game.isGameOver()) return;

    if (selectedSquare === square) {
      setSelectedSquare(null);
      setValidMoves([]);
      return;
    }

    const piece = game.get(square);
    if (piece && piece.color === game.turn()) {
      setSelectedSquare(square);
      setValidMoves(game.moves({ square, verbose: true }).map(m => m.to));
    } else if (selectedSquare && validMoves.includes(square)) {
      const movingPiece = game.get(selectedSquare);
      const isPromotion =
        movingPiece?.type === 'p' &&
        ((movingPiece.color === 'w' && square[1] === '8') ||
          (movingPiece.color === 'b' && square[1] === '1'));

      if (isPromotion) {
        setPendingPromotion({ from: selectedSquare, to: square });
      } else {
        onMove({ from: selectedSquare, to: square });
        setSelectedSquare(null);
        setValidMoves([]);
      }
    } else {
      setSelectedSquare(null);
      setValidMoves([]);
    }
  };

  const handleConfirmPromotion = (piece) => {
    if (!pendingPromotion) return;
    onMove({ ...pendingPromotion, promotion: piece });
    setPendingPromotion(null);
    setSelectedSquare(null);
    setValidMoves([]);
  };

  // Captured piece tracking
  const initialPieces = { w: { p: 8, n: 2, b: 2, r: 2, q: 1 }, b: { p: 8, n: 2, b: 2, r: 2, q: 1 } };
  const currentPieces = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  game.board().flat().filter(Boolean).forEach(p => {
    if (currentPieces[p.color][p.type] !== undefined) currentPieces[p.color][p.type]++;
  });
  const capturedByWhite = [];
  const capturedByBlack = [];
  ['p', 'n', 'b', 'r', 'q'].forEach(type => {
    for (let i = 0; i < initialPieces.b[type] - currentPieces.b[type]; i++) capturedByWhite.push({ type, color: 'b' });
    for (let i = 0; i < initialPieces.w[type] - currentPieces.w[type]; i++) capturedByBlack.push({ type, color: 'w' });
  });

  const history = gameData?.history || [];
  const lastMove = history.length > 0 ? gameData?.lastRawMove : null;
  const inCheck = game.inCheck();
  const kingSquare = inCheck
    ? game.board().flat().find(p => p?.type === 'k' && p?.color === game.turn())?.square
    : null;

  const board = game.board();
  const rows = isBlack ? [...board].reverse() : [...board];

  const squares = [];
  rows.forEach((row, i) => {
    const displayRow = isBlack ? [...row].reverse() : [...row];
    displayRow.forEach((cell, j) => {
      const fileIdx = isBlack ? 7 - j : j;
      const rankIdx = isBlack ? i : 7 - i;
      const sq = String.fromCharCode(97 + fileIdx) + (rankIdx + 1);
      const isDark = (rankIdx + fileIdx) % 2 === 0;
      const isSelected = selectedSquare === sq;
      const isValid = validMoves.includes(sq);
      const isLastMoveSq = lastMove && (lastMove.from === sq || lastMove.to === sq);
      const isCheck = kingSquare === sq;

      let bgColor;
      if (isSelected) bgColor = primary + 'cc';
      else if (isCheck) bgColor = '#ef444466';
      else if (isLastMoveSq) bgColor = primary + '55';
      else if (isDark) bgColor = primary + '44';
      else bgColor = 'transparent';

      squares.push(
        <div
          key={sq}
          onClick={() => handleSquareClick(sq)}
          style={{
            width: '12.5%',
            height: '12.5%',
            backgroundColor: bgColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isMyTurn && !game.isGameOver() ? 'pointer' : 'default',
            position: 'relative',
            transition: 'background-color 0.15s ease',
          }}
        >
          {/* Board coordinates */}
          {fileIdx === 0 && (
            <span style={{ position: 'absolute', left: 2, top: 2, fontSize: 8, color: isDark ? '#fff' : primary, opacity: 0.5, pointerEvents: 'none', userSelect: 'none' }}>
              {rankIdx + 1}
            </span>
          )}
          {rankIdx === (isBlack ? 7 : 0) && (
            <span style={{ position: 'absolute', right: 2, bottom: 2, fontSize: 8, color: isDark ? '#fff' : primary, opacity: 0.5, pointerEvents: 'none', userSelect: 'none' }}>
              {String.fromCharCode(97 + fileIdx)}
            </span>
          )}

          {/* Valid move dot / ring */}
          {isValid && (
            <div style={{
              position: 'absolute',
              width: cell ? '88%' : '30%',
              height: cell ? '88%' : '30%',
              borderRadius: '50%',
              border: cell ? `3px solid ${primary}88` : 'none',
              backgroundColor: cell ? 'transparent' : primary + '66',
              zIndex: 1,
              pointerEvents: 'none',
            }} />
          )}

          {/* Piece */}
          {cell && (
            <div style={{
              width: '86%', height: '86%', zIndex: 2,
              transform: isSelected ? 'scale(1.12) translateY(-3px)' : 'none',
              transition: 'transform 0.15s ease',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))',
            }}>
              {PIECES[cell.color][cell.type](
                cell.color === 'w' ? '#ffffff' : '#1e1e2e',
                cell.color === 'w' ? '#1e1e2e' : '#6b7280'
              )}
            </div>
          )}
        </div>
      );
    });
  });

  return (
    <div style={{ width: '100%', maxWidth: 'min(92vw, 400px)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <style>{`@keyframes chess-pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>

      {/* Black's captured pieces (top) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, minHeight: 20, padding: '0 4px', opacity: 0.65 }}>
        {capturedByBlack.map((p, i) => (
          <div key={i} style={{ width: 14, height: 14 }}>{PIECES[p.color][p.type]('#e5e7eb', '#374151')}</div>
        ))}
      </div>

      {/* Board */}
      <div style={{
        width: '100%', aspectRatio: '1/1',
        borderRadius: 12, overflow: 'hidden',
        border: `3px solid ${primary}aa`,
        display: 'flex', flexWrap: 'wrap',
        background: 'rgba(0,0,0,0.18)',
        boxShadow: `0 8px 32px ${primary}22`,
        position: 'relative',
      }}>
        {squares}

        {/* CPU thinking overlay */}
        {isCPU && cpuThinking && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 30,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(1px)',
            borderRadius: 10, pointerEvents: 'none',
          }}>
            <div style={{
              background: `${primary}33`, border: `1.5px solid ${primary}88`,
              borderRadius: 12, padding: '12px 22px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>🤖</div>
              <p style={{ color: '#f9fafb', fontWeight: 700, fontSize: '0.8rem', margin: 0 }}>
                CPU is thinking…
              </p>
            </div>
          </div>
        )}

        {/* Waiting for opponent overlay */}
        {!gameData?.players?.black?.id && !gameData?.winner && !isCPU && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 30,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
            borderRadius: 10,
          }}>
            <div style={{
              background: `${primary}22`, border: `1.5px solid ${primary}66`,
              borderRadius: 14, padding: '18px 28px', textAlign: 'center', maxWidth: 200,
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
              <p style={{ color: '#f9fafb', fontWeight: 700, fontSize: '0.85rem', margin: 0 }}>
                Waiting for opponent
              </p>
              <p style={{ color: '#9ca3af', fontSize: '0.72rem', marginTop: 4 }}>
                Share the room so someone can join as Black
              </p>
            </div>
          </div>
        )}
      </div>

      {/* White's captured pieces (bottom) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 2, minHeight: 20, padding: '0 4px', opacity: 0.65 }}>
        {capturedByWhite.map((p, i) => (
          <div key={i} style={{ width: 14, height: 14 }}>{PIECES[p.color][p.type]('#374151', '#e5e7eb')}</div>
        ))}
      </div>

      {/* Status bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '5px 10px', borderRadius: 8,
        background: `${primary}33`, fontSize: '0.82rem', fontWeight: 600,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            backgroundColor: isMyTurn && !game.isGameOver() ? primary : '#6b7280',
            boxShadow: isMyTurn && !game.isGameOver() ? `0 0 8px ${primary}` : 'none',
            animation: isMyTurn && !game.isGameOver() ? 'chess-pulse 1.5s infinite' : 'none',
          }} />
          <span style={{ color: isMyTurn ? primary : '#9ca3af' }}>
            {game.isGameOver()
              ? (game.isCheckmate() ? 'Checkmate!' : 'Draw!')
              : isCPU && cpuThinking
                ? `🤖 CPU thinking (${cpuDifficulty})…`
                : !gameData?.players?.black?.id && !isCPU
                  ? 'Waiting for opponent…'
                  : isMyTurn ? 'Your turn' : `${game.turn() === 'w' ? 'White' : 'Black'}'s turn`}
          </span>
        </div>
        {inCheck && !game.isGameOver() && (
          <span style={{ color: '#ef4444', fontWeight: 700, animation: 'chess-pulse 0.8s infinite' }}>⚠ Check</span>
        )}
      </div>

      {/* Pawn promotion picker */}
      {pendingPromotion && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: 'var(--bg, #ffffff)', color: 'var(--fg, #111827)',
            borderRadius: 16, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            border: `2px solid ${primary}66`,
          }}
            className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <p style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, marginBottom: 12, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.7 }}>
              Promote pawn to:
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              {['q', 'r', 'b', 'n'].map(type => (
                <button
                  key={type}
                  onClick={() => handleConfirmPromotion(type)}
                  style={{
                    width: 56, height: 56, borderRadius: 10, border: `2px solid ${primary}44`,
                    background: 'transparent', cursor: 'pointer', padding: 6,
                    transition: 'all 0.15s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = primary + '22'; e.currentTarget.style.borderColor = primary; }}
                  onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = primary + '44'; }}
                >
                  {PIECES[game.turn()][type](
                    game.turn() === 'w' ? '#ffffff' : '#1e1e2e',
                    game.turn() === 'w' ? '#1e1e2e' : '#6b7280'
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChessGame;
