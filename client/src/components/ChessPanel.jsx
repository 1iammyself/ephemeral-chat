import React, { useState, useEffect, useRef, useCallback, useMemo, useContext } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { Flag, RotateCcw, Clock, Users, Trash2 } from 'lucide-react';
import socketManager from '../socket';
import { getCpuMove } from './games/ChessEngine';
import { getVibeById } from '../utils/vibes';
import { FloatingPanelContext } from './FloatingPanel';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// Human-feeling delays — easy plays randomly but should still pause like a person thinks
const CPU_DELAY = { easy: 1000, medium: 2000, hard: 3500 };

const PROMO_PIECES = {
  white: { q: '♕', r: '♖', b: '♗', n: '♘' },
  black: { q: '♛', r: '♜', b: '♝', n: '♞' },
};

const DRAW_REASON = {
  stalemate: 'Stalemate',
  'threefold-repetition': 'Threefold Repetition',
  'insufficient-material': 'Insufficient Material',
  'fifty-move-rule': '50-Move Rule',
};

// Piece values for material advantage display
const PIECE_VAL = { q: 9, r: 5, b: 3, n: 3, p: 1 };
const PIECE_ORDER = ['q', 'r', 'b', 'n', 'p'];
// Unicode for pieces captured by each side
const CAP_UNICODE_BY_WHITE = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }; // black pieces taken by white
const CAP_UNICODE_BY_BLACK = { q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }; // white pieces taken by black

function sortedCaps(arr) {
  return [...arr].sort((a, b) => (PIECE_VAL[b] || 0) - (PIECE_VAL[a] || 0));
}

function computeCaptures(moves) {
  const chess = new Chess();
  const byWhite = [];
  const byBlack = [];
  for (const m of moves) {
    try {
      const r = chess.move(m.san || m);
      if (r?.captured) {
        if (r.color === 'w') byWhite.push(r.captured);
        else byBlack.push(r.captured);
      }
    } catch {}
  }
  return { byWhite, byBlack };
}

function formatMs(ms) {
  if (ms == null) return '—';
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function CapturedRow({ captured, unicode, advantage }) {
  if (!captured.length && !advantage) return null;
  const sorted = sortedCaps(captured);
  return (
    <div className="flex items-center gap-0.5 ml-6 min-h-[12px]">
      <span className="text-[10px] leading-none tracking-tight">
        {sorted.map((p, i) => <span key={i}>{unicode[p] || ''}</span>)}
      </span>
      {advantage > 0 && (
        <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 ml-0.5">+{advantage}</span>
      )}
    </div>
  );
}

function TimerBar({ timeMs, maxMs, isActive, color, name, captured, unicode, advantage }) {
  const pct = maxMs ? Math.min(100, Math.max(0, (timeMs / maxMs) * 100)) : 100;
  const urgent = timeMs != null && timeMs < 30000 && timeMs > 0;
  const showTime = timeMs != null;
  return (
    <div className={`flex flex-col px-2 pt-1 pb-0.5 transition-opacity ${isActive ? 'opacity-100' : 'opacity-50'}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm leading-none shrink-0">{color === 'white' ? '♔' : '♚'}</span>
        <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 truncate flex-1">{name}</span>
        {showTime && (
          <>
            <div className="w-14 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shrink-0">
              <div
                className={`h-full rounded-full ${urgent ? 'bg-red-500' : color === 'white' ? 'bg-gray-600 dark:bg-gray-200' : 'bg-gray-900 dark:bg-gray-400'}`}
                style={{ width: `${pct}%`, transition: 'width 1s linear' }}
              />
            </div>
            <span className={`text-xs font-black tabular-nums w-9 text-right shrink-0 ${urgent && isActive ? 'text-red-500 animate-pulse' : 'text-gray-700 dark:text-gray-300'}`}>
              {formatMs(timeMs)}
            </span>
          </>
        )}
      </div>
      <CapturedRow captured={captured} unicode={unicode} advantage={advantage} />
    </div>
  );
}

export default function ChessPanel({ message, currentUser, roomVibe, onDelete }) {
  const { suspended } = useContext(FloatingPanelContext);
  const vibe = getVibeById(roomVibe);
  const [gameData, setGameData] = useState(message?.gameData ?? null);
  const [fen, setFen] = useState(message?.gameData?.fen || INITIAL_FEN);
  const [moveHistory, setMoveHistory] = useState(message?.gameData?.moves || []);
  const [drawOffered, setDrawOffered] = useState(false);
  const [drawOfferFrom, setDrawOfferFrom] = useState(null);
  const [whiteTime, setWhiteTime] = useState(message?.gameData?.whiteTime ?? null);
  const [blackTime, setBlackTime] = useState(message?.gameData?.blackTime ?? null);
  const [turnStartedAt, setTurnStartedAt] = useState(message?.gameData?.turnStartedAt ?? null);
  const [cpuThinking, setCpuThinking] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectSecondsLeft, setDisconnectSecondsLeft] = useState(null);
  const [wasDisplacedFromGame, setWasDisplacedFromGame] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [optionSquares, setOptionSquares] = useState({});
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [isInCheck, setIsInCheck] = useState(false);
  const [myTurnFlash, setMyTurnFlash] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Board sizing — tracks the flex container and fits the largest square that fits
  const boardContainerRef = useRef(null);
  const [boardSize, setBoardSize] = useState(360);

  useEffect(() => {
    const el = boardContainerRef.current;
    if (!el) return;
    let raf = null;
    const ro = new ResizeObserver(([entry]) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const { width, height } = entry.contentRect;
        const s = Math.max(120, Math.floor(Math.min(width, height)) - 8);
        setBoardSize(prev => Math.abs(prev - s) > 8 ? s : prev);
      });
    });
    ro.observe(el);
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);

  // Refs to avoid stale closures
  const chessRef = useRef((() => {
    try { return new Chess(message?.gameData?.fen || INITIAL_FEN); } catch { return new Chess(INITIAL_FEN); }
  })());
  const moveHistoryRef = useRef(message?.gameData?.moves || []);
  const timerRef = useRef(null);
  const timeoutFiredRef = useRef(false);
  const disconnectTimerRef = useRef(null);
  const cpuThinkingRef = useRef(false);
  const gameEndedRef = useRef(false); // prevents duplicate chess-game-end emits

  const currentUserId = currentUser?.id || currentUser?.socketId;
  const currentNickname = currentUser?.nickname;
  const messageId = message?.id;

  const myColor = gameData?.white?.id === currentUserId || (currentNickname && gameData?.white?.name === currentNickname)
    ? 'white'
    : gameData?.black?.id === currentUserId || (currentNickname && gameData?.black?.name === currentNickname)
      ? 'black'
      : null;

  const isCpu = !!gameData?.cpu?.enabled;
  const isCreator = gameData?.creatorId === currentUserId;
  const isPlaying = !!myColor;
  const isFinished = gameData?.status === 'finished';
  const isWaiting = gameData?.status === 'waiting';
  const isLive = gameData?.status === 'playing';
  const turnColor = fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const isMyTurn = isPlaying && myColor === turnColor && !isFinished && !cpuThinking;
  const hasTimer = gameData?.timeControl != null;

  // ── Sync game data from updated message ──────────────────────────
  useEffect(() => {
    if (!message?.gameData) return;
    const gd = message.gameData;
    setGameData(gd);
    if (gd.fen) {
      try { chessRef.current = new Chess(gd.fen); setFen(gd.fen); }
      catch { chessRef.current = new Chess(INITIAL_FEN); setFen(INITIAL_FEN); }
    }
    const moves = gd.moves || [];
    moveHistoryRef.current = moves;
    setMoveHistory(moves);
    setWhiteTime(gd.whiteTime ?? null);
    setBlackTime(gd.blackTime ?? null);
    if (gd.turnStartedAt != null) setTurnStartedAt(gd.turnStartedAt);
    if (gd.status === 'finished') {
      timeoutFiredRef.current = false;
      gameEndedRef.current = false;
    }
  }, [message?.gameData]);

  // ── Timer countdown ───────────────────────────────────────────────
  useEffect(() => {
    clearInterval(timerRef.current);
    if (!hasTimer || isFinished || isWaiting || !turnStartedAt || suspended) return;
    timerRef.current = setInterval(() => {
      if (turnColor === 'white') setWhiteTime(prev => (prev == null ? null : Math.max(0, prev - 1000)));
      else setBlackTime(prev => (prev == null ? null : Math.max(0, prev - 1000)));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [turnColor, turnStartedAt, isFinished, isWaiting, hasTimer, suspended]);

  // ── Timer timeout enforcement (fires immediately locally, no roundtrip wait) ──
  useEffect(() => {
    if (!hasTimer || isFinished || isWaiting || timeoutFiredRef.current) return;
    if (whiteTime !== 0) return;
    timeoutFiredRef.current = true;
    clearInterval(timerRef.current);
    socketManager.emit('chess-timeout', { messageId, color: 'white' });
    // Apply locally without waiting for server
    setGameData(prev => prev ? { ...prev, status: 'finished', winner: 'black', result: 'timeout' } : prev);
  }, [whiteTime, hasTimer, isFinished, isWaiting, messageId]);

  useEffect(() => {
    if (!hasTimer || isFinished || isWaiting || timeoutFiredRef.current) return;
    if (blackTime !== 0) return;
    timeoutFiredRef.current = true;
    clearInterval(timerRef.current);
    socketManager.emit('chess-timeout', { messageId, color: 'black' });
    // Apply locally without waiting for server
    setGameData(prev => prev ? { ...prev, status: 'finished', winner: 'white', result: 'timeout' } : prev);
  }, [blackTime, hasTimer, isFinished, isWaiting, messageId]);

  // ── Disconnect countdown ──────────────────────────────────────────
  useEffect(() => {
    clearInterval(disconnectTimerRef.current);
    if (!opponentDisconnected) { setDisconnectSecondsLeft(null); return; }
    disconnectTimerRef.current = setInterval(() => {
      setDisconnectSecondsLeft(prev => (prev == null || prev <= 0) ? 0 : prev - 1);
    }, 1000);
    return () => clearInterval(disconnectTimerRef.current);
  }, [opponentDisconnected]);

  // ── Check detection ───────────────────────────────────────────────
  useEffect(() => {
    setIsInCheck(isLive && !isFinished && chessRef.current.inCheck());
  }, [fen, isLive, isFinished]);

  // ── "Your turn" flash ─────────────────────────────────────────────
  useEffect(() => {
    if (!isMyTurn || isFinished || cpuThinking) return;
    setMyTurnFlash(true);
    const t = setTimeout(() => setMyTurnFlash(false), 1200);
    return () => clearTimeout(t);
  }, [isMyTurn]);

  // ── Socket events ─────────────────────────────────────────────────
  useEffect(() => {
    if (!messageId) return;

    const onMoveMade = ({ messageId: mid, move, fen: newFen, whiteTime: wt, blackTime: bt, turnStartedAt: tsa }) => {
      if (mid !== messageId) return;
      try {
        chessRef.current.move(move);
      } catch {
        // Local instance out of sync (e.g. promotion flag missing) — resync from FEN
        if (newFen) { try { chessRef.current = new Chess(newFen); } catch { chessRef.current = new Chess(INITIAL_FEN); } }
      }
      if (newFen) setFen(newFen);
      if (wt != null) setWhiteTime(wt);
      if (bt != null) setBlackTime(bt);
      if (tsa != null) setTurnStartedAt(tsa);
    };

    const onGameOver = ({ messageId: mid, gameData: gd }) => {
      if (mid !== messageId) return;
      setGameData(gd);
      clearInterval(timerRef.current);
      setStatusMsg(buildResultMsg(gd));
    };

    const onDrawOffered = ({ messageId: mid, byColor }) => {
      if (mid !== messageId || byColor === myColor) return;
      setDrawOfferFrom(byColor);
      setDrawOffered(true);
    };

    const onDrawDeclined = ({ messageId: mid }) => {
      if (mid !== messageId) return;
      setDrawOffered(false);
      setDrawOfferFrom(null);
      setStatusMsg('Draw declined');
      setTimeout(() => setStatusMsg(''), 2500);
    };

    const onOpponentJoined = ({ messageId: mid, gameData: gd }) => {
      if (mid !== messageId) return;
      setGameData(gd);
      const opponentFen = gd.fen || INITIAL_FEN;
      try { chessRef.current = new Chess(opponentFen); setFen(opponentFen); }
      catch { chessRef.current = new Chess(INITIAL_FEN); setFen(INITIAL_FEN); }
      moveHistoryRef.current = [];
      setMoveHistory([]);
      setWhiteTime(gd.whiteTime ?? null);
      setBlackTime(gd.blackTime ?? null);
      setTurnStartedAt(gd.turnStartedAt ?? null);
      setOpponentDisconnected(false);
      timeoutFiredRef.current = false;
      gameEndedRef.current = false;
    };

    const onNewRound = ({ messageId: mid, gameData: gd }) => {
      if (mid !== messageId) return;
      // myColor from closure = pre-round value; detect if user was displaced
      const nowWhite = gd.white?.id === currentUserId || (currentNickname && gd.white?.name === currentNickname);
      const nowBlack = gd.black?.id === currentUserId || (currentNickname && gd.black?.name === currentNickname);
      if (myColor !== null && !nowWhite && !nowBlack) setWasDisplacedFromGame(true);
      if (nowWhite || nowBlack) setWasDisplacedFromGame(false);
      setGameData(gd);
      setFen(INITIAL_FEN);
      chessRef.current = new Chess(INITIAL_FEN);
      moveHistoryRef.current = [];
      setMoveHistory([]);
      setDrawOffered(false);
      setDrawOfferFrom(null);
      setStatusMsg('');
      setOpponentDisconnected(false);
      setDisconnectSecondsLeft(null);
      timeoutFiredRef.current = false;
      gameEndedRef.current = false;
      cpuThinkingRef.current = false;
      setWhiteTime(gd.whiteTime ?? null);
      setBlackTime(gd.blackTime ?? null);
      setTurnStartedAt(gd.turnStartedAt ?? null);
      setPendingPromotion(null);
      setSelectedSquare(null);
      setOptionSquares({});
    };

    const onOpponentDisconnected = ({ messageId: mid }) => {
      if (mid !== messageId) return;
      setOpponentDisconnected(true);
      setDisconnectSecondsLeft(60);
    };

    const onOpponentReconnected = ({ messageId: mid }) => {
      if (mid !== messageId) return;
      setOpponentDisconnected(false);
      setDisconnectSecondsLeft(null);
    };

    socketManager.on('chess-move-made', onMoveMade);
    socketManager.on('chess-game-over', onGameOver);
    socketManager.on('chess-draw-offered', onDrawOffered);
    socketManager.on('chess-draw-declined', onDrawDeclined);
    socketManager.on('chess-opponent-joined', onOpponentJoined);
    socketManager.on('chess-new-round', onNewRound);
    socketManager.on('chess-opponent-disconnected', onOpponentDisconnected);
    socketManager.on('chess-opponent-reconnected', onOpponentReconnected);

    return () => {
      socketManager.off('chess-move-made', onMoveMade);
      socketManager.off('chess-game-over', onGameOver);
      socketManager.off('chess-draw-offered', onDrawOffered);
      socketManager.off('chess-draw-declined', onDrawDeclined);
      socketManager.off('chess-opponent-joined', onOpponentJoined);
      socketManager.off('chess-new-round', onNewRound);
      socketManager.off('chess-opponent-disconnected', onOpponentDisconnected);
      socketManager.off('chess-opponent-reconnected', onOpponentReconnected);
    };
  }, [messageId, myColor]);

  // ── CPU move trigger ──────────────────────────────────────────────
  useEffect(() => {
    if (!isCpu || !isLive || isFinished || chessRef.current.turn() !== 'b') return;
    if (cpuThinkingRef.current || chessRef.current.isGameOver()) return;
    const diff = gameData?.cpu?.difficulty || 'medium';
    cpuThinkingRef.current = true;
    setCpuThinking(true);
    const delay = CPU_DELAY[diff] ?? 600;
    const t = setTimeout(() => {
      const move = getCpuMove(chessRef.current.fen(), diff);
      if (!move) { cpuThinkingRef.current = false; setCpuThinking(false); return; }
      let result;
      try { result = chessRef.current.move(move); } catch { cpuThinkingRef.current = false; setCpuThinking(false); return; }
      if (!result) { cpuThinkingRef.current = false; setCpuThinking(false); return; }
      const newFen = chessRef.current.fen();
      const updated = [...moveHistoryRef.current, { san: result.san, color: 'b' }];
      moveHistoryRef.current = updated;
      setMoveHistory(updated);
      setFen(newFen);
      cpuThinkingRef.current = false;
      setCpuThinking(false);
      // Include promotion so spectator chess.js doesn't throw
      socketManager.emit('chess-sync-fen', { messageId, fen: newFen, move: { from: result.from, to: result.to, ...(result.promotion ? { promotion: result.promotion } : {}) } });
      maybeEndGame(newFen, updated);
    }, delay);
    return () => {
      clearTimeout(t);
      cpuThinkingRef.current = false;
    };
  }, [fen, isCpu, isLive, isFinished]);

  function maybeEndGame(currentFen, currentMoves) {
    if (gameEndedRef.current) return;
    const chess = chessRef.current;
    if (!chess.isGameOver()) return;
    gameEndedRef.current = true;
    let winner = null, result = null;
    if (chess.isCheckmate()) {
      winner = chess.turn() === 'w' ? 'black' : 'white';
      result = 'checkmate';
    } else if (chess.isStalemate()) {
      winner = 'draw'; result = 'stalemate';
    } else if (chess.isThreefoldRepetition()) {
      winner = 'draw'; result = 'threefold-repetition';
    } else if (chess.isInsufficientMaterial()) {
      winner = 'draw'; result = 'insufficient-material';
    } else if (chess.isDraw()) {
      winner = 'draw'; result = 'fifty-move-rule';
    }
    socketManager.emit('chess-game-end', { messageId, winner, result, fen: currentFen, moves: currentMoves });
    // Apply locally without waiting for server roundtrip — prevents "nothing happened" on checkmate
    clearInterval(timerRef.current);
    setGameData(prev => prev ? { ...prev, status: 'finished', winner, result } : prev);
  }

  function buildResultMsg(gd) {
    if (!gd) return '';
    const gdCpu = !!gd.cpu?.enabled;
    if (gd.winner === 'draw') return `½-½ ${DRAW_REASON[gd.result] ?? 'Draw'}`;
    if (gd.winner === 'white') return `♔ ${gd.white?.name ?? 'White'} wins!`;
    if (gd.winner === 'black') return `♚ ${gdCpu ? `CPU (${gd.cpu.difficulty})` : (gd.black?.name ?? 'Black')} wins!`;
    if (gd.result === 'abandoned') return 'Opponent abandoned';
    if (gd.result === 'timeout') {
      const loser = gd.winner === 'white' ? 'black' : 'white';
      return `⏱ ${loser === 'white' ? (gd.white?.name ?? 'White') : (gdCpu ? 'CPU' : (gd.black?.name ?? 'Black'))} ran out of time`;
    }
    return 'Game over';
  }

  // ── Move highlighting helpers ─────────────────────────────────────
  function getMoveOptions(square) {
    const moves = chessRef.current.moves({ square, verbose: true });
    if (!moves.length) return {};
    const squares = {};
    moves.forEach(move => {
      squares[move.to] = {
        background: chessRef.current.get(move.to)
          ? 'radial-gradient(circle, rgba(0,0,0,.22) 85%, transparent 85%)'
          : 'radial-gradient(circle, rgba(0,0,0,.15) 28%, transparent 28%)',
        borderRadius: '50%',
      };
    });
    squares[square] = { background: 'rgba(255,255,0,0.4)' };
    return squares;
  }

  // ── Core move executor (shared by drag-drop and click-to-move) ───
  const commitMove = useCallback((from, to, promotion) => {
    let result;
    try {
      result = chessRef.current.move({ from, to, promotion });
    } catch { return false; }
    if (!result) return false;
    const newFen = chessRef.current.fen();
    const updated = [...moveHistoryRef.current, { san: result.san, color: result.color }];
    moveHistoryRef.current = updated;
    setMoveHistory(updated);
    setFen(newFen);
    setSelectedSquare(null);
    setOptionSquares({});
    if (isCpu) {
      socketManager.emit('chess-sync-fen', { messageId, fen: newFen, move: { from, to, ...(result.promotion ? { promotion: result.promotion } : {}) } });
    } else {
      socketManager.emit('chess-move', { messageId, move: { from, to, promotion: result.promotion || 'q' }, fen: newFen });
    }
    maybeEndGame(newFen, updated);
    return true;
  }, [isCpu, messageId]);

  // ── Drag-drop handler ────────────────────────────────────────────
  const onDrop = useCallback((sourceSquare, targetSquare) => {
    if (!isMyTurn) return false;
    const piece = chessRef.current.get(sourceSquare);
    const isPromo = piece?.type === 'p' && (targetSquare[1] === '8' || targetSquare[1] === '1');
    if (isPromo) {
      // Snap piece back; show picker overlay
      setPendingPromotion({ from: sourceSquare, to: targetSquare });
      setSelectedSquare(null);
      setOptionSquares({});
      return false;
    }
    return commitMove(sourceSquare, targetSquare, 'q');
  }, [isMyTurn, commitMove]);

  // ── Promotion confirmation ────────────────────────────────────────
  const handlePromotion = useCallback((piece) => {
    if (!pendingPromotion) return;
    commitMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
  }, [pendingPromotion, commitMove]);

  // ── Click-to-move ─────────────────────────────────────────────────
  const onSquareClick = useCallback((square) => {
    if (!isMyTurn) return;
    // Clicked a valid destination square — execute move
    if (selectedSquare && optionSquares[square]) {
      const piece = chessRef.current.get(selectedSquare);
      const isPromo = piece?.type === 'p' && (square[1] === '8' || square[1] === '1');
      if (isPromo) {
        setPendingPromotion({ from: selectedSquare, to: square });
        setSelectedSquare(null);
        setOptionSquares({});
        return;
      }
      commitMove(selectedSquare, square, 'q');
      return;
    }
    // Select a piece
    const piece = chessRef.current.get(square);
    const myPieceColor = myColor === 'white' ? 'w' : 'b';
    if (piece && piece.color === myPieceColor) {
      setSelectedSquare(square);
      setOptionSquares(getMoveOptions(square));
    } else {
      setSelectedSquare(null);
      setOptionSquares({});
    }
  }, [isMyTurn, selectedSquare, optionSquares, myColor, commitMove]);

  // ── Drag highlight ────────────────────────────────────────────────
  const onPieceDragBegin = useCallback((_piece, square) => {
    if (!isMyTurn) return;
    setSelectedSquare(square);
    setOptionSquares(getMoveOptions(square));
  }, [isMyTurn]);

  const onPieceDragEnd = useCallback(() => {
    setSelectedSquare(null);
    setOptionSquares({});
  }, []);

  const queueLocked = !!gameData?.queueLocked;
  const maxQueue = gameData?.maxQueue ?? Infinity;
  const queueCount = gameData?.challengeQueue?.length ?? 0;
  const queueFull = queueCount >= maxQueue;
  const inQueue = gameData?.challengeQueue?.some(p => p.id === currentUserId || (currentNickname && p.name === currentNickname));
  const canJoinQueue = !isPlaying && !inQueue && isLive && !queueLocked && !queueFull;

  const handleStartCpu = (diff) => socketManager.emit('chess-set-cpu', { messageId, difficulty: diff });
  const handleResign = () => {
    if (isCpu && myColor) {
      const winnerColor = myColor === 'white' ? 'black' : 'white';
      clearInterval(timerRef.current);
      setGameData(prev => prev ? { ...prev, status: 'finished', winner: winnerColor, result: 'resign' } : prev);
      // chess-game-end has no identity check (unlike chess-resign), so the server
      // correctly marks the game finished and allows subsequent chess-rematch to work
      socketManager.emit('chess-game-end', { messageId, winner: winnerColor, result: 'resign', fen: chessRef.current.fen(), moves: moveHistoryRef.current });
    } else {
      socketManager.emit('chess-resign', { messageId });
    }
  };
  const handleDrawOffer = () => {
    socketManager.emit('chess-draw-offer', { messageId });
    setStatusMsg('Draw offered...');
  };
  const handleDrawAccept = () => { socketManager.emit('chess-draw-accept', { messageId }); setDrawOffered(false); };
  const handleDrawDecline = () => { socketManager.emit('chess-draw-decline', { messageId }); setDrawOffered(false); };
  const handleRematch = (difficulty) => socketManager.emit('chess-rematch', { messageId, ...(difficulty ? { difficulty } : {}) });
  const handleTagOut = () => socketManager.emit('chess-tag-out', { messageId });
  const handleQueueAgain = () => { socketManager.emit('chess-queue-again', { messageId }); setWasDisplacedFromGame(false); };
  const handleAddSlot = () => socketManager.emit('chess-set-max-queue', { messageId, maxQueue: (gameData?.maxQueue ?? queueCount) + 1 });
  const handleToggleLock = () => socketManager.emit('chess-lock-queue', { messageId, locked: !queueLocked });

  // ── Captured pieces (derived from move history) ──────────────────
  const { byWhite: whiteCaptured, byBlack: blackCaptured } = useMemo(
    () => computeCaptures(moveHistory),
    [moveHistory]
  );
  const whiteMat = whiteCaptured.reduce((s, p) => s + (PIECE_VAL[p] || 0), 0);
  const blackMat = blackCaptured.reduce((s, p) => s + (PIECE_VAL[p] || 0), 0);
  const initialTime = gameData?.timeControl ? gameData.timeControl.initial * 1000 : null;

  const boardOrientation = flipped
    ? (myColor === 'black' ? 'white' : 'black')
    : (myColor ?? 'white');

  const whiteName = gameData?.white?.name ?? 'White';
  const blackName = isCpu ? `CPU (${gameData?.cpu?.difficulty ?? '?'})` : (gameData?.black?.name ?? 'Black');

  // ── Spectator: waiting for game to start ─────────────────────────
  if (isWaiting && !myColor) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 bg-white dark:bg-gray-900">
        <div className="text-5xl">♟</div>
        <p className="font-semibold text-gray-700 dark:text-gray-200">Waiting for game to start</p>
        <div className="flex gap-2 text-sm text-gray-500">
          <span>♔ {whiteName}</span><span>vs</span><span>♚ {blackName}</span>
        </div>
      </div>
    );
  }

  const showCheckStrip = isInCheck && isLive && !isFinished;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden select-none">
      {/* Player info + timers (shown when live or finished) */}
      {(isLive || isFinished) && (
        <div className="border-b border-gray-100 dark:border-gray-800 pt-0.5 pb-0.5">
          <TimerBar
            timeMs={blackTime} maxMs={initialTime} isActive={turnColor === 'black'}
            color="black" name={blackName}
            captured={blackCaptured} unicode={CAP_UNICODE_BY_BLACK}
            advantage={blackMat > whiteMat ? blackMat - whiteMat : 0}
          />
          <TimerBar
            timeMs={whiteTime} maxMs={initialTime} isActive={turnColor === 'white'}
            color="white" name={whiteName}
            captured={whiteCaptured} unicode={CAP_UNICODE_BY_WHITE}
            advantage={whiteMat > blackMat ? whiteMat - blackMat : 0}
          />
        </div>
      )}

      {/* Status strip — always occupies height during live games to prevent board resize flicker */}
      {isLive && !isFinished ? (
        <div className={`text-center text-xs font-semibold py-1 transition-colors ${
          opponentDisconnected
            ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300'
            : showCheckStrip
              ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300'
            : myTurnFlash
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
            : (cpuThinking || statusMsg)
              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
              : ''
        }`}>
          {opponentDisconnected
            ? `⚠️ Opponent disconnected — forfeit in ${disconnectSecondsLeft ?? 60}s`
            : cpuThinking ? '🤖 CPU thinking...'
            : showCheckStrip ? '⚠️ Check!'
            : myTurnFlash ? '✓ Your turn'
            : statusMsg || ' '}
        </div>
      ) : (statusMsg && !isFinished) ? (
        <div className="text-center text-xs font-semibold py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">
          {statusMsg}
        </div>
      ) : null}

      {/* Waiting for challenger banner */}
      {isWaiting && myColor === 'white' && (
        <div className="mx-3 mt-2 mb-1 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 truncate">Waiting for challenger...</span>
          </div>
          <div className="flex gap-1 shrink-0">
            {['easy', 'medium', 'hard'].map(d => (
              <button key={d} onClick={() => handleStartCpu(d)}
                className={`py-1 px-2 text-[10px] font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity capitalize`}>
                🤖 {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Draw offer */}
      {drawOffered && (
        <div className="mx-3 mt-2 p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-between gap-2">
          <span className="text-xs text-blue-700 dark:text-blue-300 font-semibold">🤝 Draw offered by {drawOfferFrom}</span>
          <div className="flex gap-1.5">
            <button onClick={handleDrawAccept} className="text-xs font-black px-2.5 py-1 rounded-lg bg-green-500 text-white">Accept</button>
            <button onClick={handleDrawDecline} className="text-xs font-black px-2.5 py-1 rounded-lg bg-red-500 text-white">Decline</button>
          </div>
        </div>
      )}

      {/* Board */}
      <div ref={boardContainerRef} className="flex-1 flex items-center justify-center p-2 min-h-0 overflow-hidden">
        <div style={{ width: boardSize, height: boardSize }} className="relative flex-shrink-0">
          <Chessboard
            id={`chess-${messageId}`}
            position={fen}
            boardWidth={boardSize}
            onPieceDrop={onDrop}
            onSquareClick={isMyTurn ? onSquareClick : undefined}
            onPieceDragBegin={isMyTurn ? onPieceDragBegin : undefined}
            onPieceDragEnd={onPieceDragEnd}
            boardOrientation={boardOrientation}
            arePiecesDraggable={isMyTurn && !isFinished}
            customSquareStyles={optionSquares}
            showBoardNotation={true}
            animationDuration={200}
            customBoardStyle={{ borderRadius: '6px', boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}
            customDarkSquareStyle={{ backgroundColor: '#b58863' }}
            customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
          />
          {/* Promotion picker overlay */}
          {pendingPromotion && myColor && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20 rounded-md">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-xl flex flex-col items-center gap-2">
                <p className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wide">Promote pawn</p>
                <div className="flex gap-2">
                  {Object.entries(PROMO_PIECES[myColor]).map(([piece, symbol]) => (
                    <button key={piece} onClick={() => handlePromotion(piece)}
                      className="w-12 h-12 flex items-center justify-center text-3xl rounded-lg bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-700 transition-colors">
                      {symbol}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Move history */}
      {moveHistory.length > 0 && (
        <div className="mx-3 mb-1 max-h-[44px] overflow-y-auto flex flex-wrap gap-x-3 gap-y-0.5">
          {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => {
            const w = moveHistory[i * 2];
            const b = moveHistory[i * 2 + 1];
            return (
              <span key={i} className="text-[10px] font-mono">
                <span className="text-gray-400">{i + 1}.</span>
                {w && <span className="ml-0.5 text-gray-700 dark:text-gray-200">{w.san}</span>}
                {b && <span className="ml-1 text-gray-500 dark:text-gray-400">{b.san}</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* Result banner */}
      {isFinished && (
        <div className="mx-3 mb-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 overflow-hidden">
          <div className="py-2 px-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-black text-amber-700 dark:text-amber-300">{buildResultMsg(gameData)}</p>
              {gameData?.result && (
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  {DRAW_REASON[gameData.result] ?? gameData.result.replace(/-/g, ' ')}
                </p>
              )}
            </div>
            {/* Non-CPU rematch or CPU with queued players: simple button */}
            {isCreator && (!isCpu || queueCount > 0) && (
              <button onClick={() => handleRematch()} className={`px-3 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 shrink-0`}>
                ↺ Rematch
              </button>
            )}
          </div>
          {/* Solo CPU: difficulty quick-select */}
          {isCreator && isCpu && queueCount === 0 && (
            <div className="border-t border-amber-100 dark:border-amber-800/40 px-3 py-2 flex gap-1.5">
              {['easy', 'medium', 'hard'].map(d => {
                const isCurrent = d === gameData?.cpu?.difficulty;
                return (
                  <button key={d} onClick={() => handleRematch(d)}
                    className={`flex-1 py-1.5 text-xs font-black rounded-lg capitalize transition-opacity hover:opacity-90 ${isCurrent ? `text-white ${vibe.accentClass}` : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>
                    {isCurrent ? `↺ ${d}` : d}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Creator queue controls */}
      {isLive && isCreator && (
        <div className="px-3 pb-1 flex gap-1.5 items-center">
          <span className="text-[9px] text-gray-400 uppercase tracking-wide">Queue</span>
          <span className="text-[10px] text-gray-500 tabular-nums">{queueCount}{maxQueue !== Infinity ? `/${maxQueue}` : ''}</span>
          <button onClick={handleAddSlot}
            className="ml-1 px-2 py-0.5 text-[10px] font-black rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:opacity-80 transition-opacity">
            +1 Slot
          </button>
          <button onClick={handleToggleLock}
            className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-opacity hover:opacity-80 ${queueLocked ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
            {queueLocked ? '🔒 Locked' : '🔓 Open'}
          </button>
        </div>
      )}

      {/* Controls */}
      {isLive && isPlaying && (
        <div className="px-3 pb-3 flex gap-2">
          <button onClick={() => setFlipped(f => !f)}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:opacity-80 transition-opacity shrink-0">
            <RotateCcw className="w-4 h-4" />
          </button>
          {!isCpu && queueCount > 0 && (
            <button onClick={handleTagOut}
              className="py-1.5 px-2.5 text-xs font-black rounded-lg bg-purple-500/80 text-purple-100 hover:opacity-90 transition-opacity">
              ⇄ Tag Out
            </button>
          )}
          {!isCpu && (
            <button onClick={handleDrawOffer}
              className="flex-1 py-1.5 text-xs font-black rounded-lg bg-blue-500/80 text-blue-100 hover:opacity-90 transition-opacity">
              ½ Draw
            </button>
          )}
          <button onClick={handleResign}
            className="flex-1 py-1.5 text-xs font-black rounded-lg bg-red-500/80 text-red-100 hover:opacity-90 transition-opacity flex items-center justify-center gap-1">
            <Flag className="w-3.5 h-3.5" />Resign
          </button>
        </div>
      )}

      {/* Spectator bar */}
      {isLive && !isPlaying && (
        <div className="px-3 pb-3 flex gap-2 items-center">
          <button onClick={() => setFlipped(f => !f)}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:opacity-80 transition-opacity">
            <RotateCcw className="w-4 h-4" />
          </button>
          <span className="flex-1 flex items-center gap-1.5 text-xs text-gray-400 justify-center">
            <Users className="w-3.5 h-3.5" />
            {inQueue ? `In queue · #${(gameData?.challengeQueue?.findIndex(p => p.id === currentUserId || (currentNickname && p.name === currentNickname)) ?? -1) + 1}` : `Spectating · ${turnColor === 'white' ? `♔ ${whiteName}` : `♚ ${blackName}`}'s turn`}
          </span>
          {canJoinQueue && (
            <button onClick={handleQueueAgain}
              className={`py-1.5 px-2.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity shrink-0`}>
              {wasDisplacedFromGame ? '↩ Re-queue' : '+ Queue'}
            </button>
          )}
        </div>
      )}

      {/* Finished spectator flip */}
      {isFinished && !isPlaying && (
        <div className="px-3 pb-3">
          <button onClick={() => setFlipped(f => !f)}
            className="w-full py-1.5 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:opacity-80 flex items-center justify-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" />Flip Board
          </button>
        </div>
      )}

      {/* Creator delete game */}
      {isCreator && onDelete && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-800 pt-2">
          {confirmDelete ? (
            <div className="flex gap-2">
              <button
                onClick={() => { onDelete(messageId); setConfirmDelete(false); }}
                className="flex-1 py-1.5 text-xs font-black rounded-lg bg-red-600 text-white hover:opacity-90 transition-opacity"
              >
                Delete for everyone
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="py-1.5 px-3 text-xs font-black rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:opacity-80 transition-opacity"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-1.5 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />Delete Game
            </button>
          )}
        </div>
      )}
    </div>
  );
}
