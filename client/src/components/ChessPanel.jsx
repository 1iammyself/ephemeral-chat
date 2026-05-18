import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { Flag, RotateCcw, Clock, Users } from 'lucide-react';
import socketManager from '../socket';
import { getCpuMove } from './games/ChessEngine';
import { getVibeById } from '../utils/vibes';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CPU_DELAY = { easy: 300, medium: 600, hard: 900 };

function formatMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function TimerBar({ timeMs, isActive, color, name }) {
  const pct = Math.min(100, Math.max(0, (timeMs / 300000) * 100));
  const urgent = timeMs < 30000 && timeMs > 0;
  return (
    <div className={`flex items-center gap-2 px-2 py-1 transition-opacity ${isActive ? 'opacity-100' : 'opacity-40'}`}>
      <span className="text-sm leading-none shrink-0">{color === 'white' ? '♔' : '♚'}</span>
      <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 truncate flex-1">{name}</span>
      <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shrink-0">
        <div
          className={`h-full rounded-full ${urgent ? 'bg-red-500' : color === 'white' ? 'bg-gray-600 dark:bg-gray-200' : 'bg-gray-900 dark:bg-gray-400'}`}
          style={{ width: `${pct}%`, transition: 'width 1s linear' }}
        />
      </div>
      <span className={`text-xs font-black tabular-nums w-9 text-right shrink-0 ${urgent && isActive ? 'text-red-500 animate-pulse' : 'text-gray-700 dark:text-gray-300'}`}>
        {formatMs(timeMs)}
      </span>
    </div>
  );
}

export default function ChessPanel({ message, currentUser, roomVibe }) {
  const vibe = getVibeById(roomVibe);
  const [gameData, setGameData] = useState(message?.gameData ?? null);
  const [fen, setFen] = useState(message?.gameData?.fen || INITIAL_FEN);
  const [moveHistory, setMoveHistory] = useState(message?.gameData?.moves || []);
  const [drawOffered, setDrawOffered] = useState(false);
  const [drawOfferFrom, setDrawOfferFrom] = useState(null);
  const [whiteTime, setWhiteTime] = useState(message?.gameData?.whiteTime ?? 300000);
  const [blackTime, setBlackTime] = useState(message?.gameData?.blackTime ?? 300000);
  const [turnStartedAt, setTurnStartedAt] = useState(message?.gameData?.turnStartedAt ?? null);
  const [cpuThinking, setCpuThinking] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectSecondsLeft, setDisconnectSecondsLeft] = useState(null);
  const [wasDisplacedFromGame, setWasDisplacedFromGame] = useState(false);

  // Refs to avoid stale closures
  const chessRef = useRef(new Chess(message?.gameData?.fen || INITIAL_FEN));
  const moveHistoryRef = useRef(message?.gameData?.moves || []);
  const timerRef = useRef(null);
  const timeoutFiredRef = useRef(false);
  const disconnectTimerRef = useRef(null);

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
      setFen(gd.fen);
      chessRef.current = new Chess(gd.fen);
    }
    const moves = gd.moves || [];
    moveHistoryRef.current = moves;
    setMoveHistory(moves);
    if (gd.whiteTime != null) setWhiteTime(gd.whiteTime);
    if (gd.blackTime != null) setBlackTime(gd.blackTime);
    if (gd.turnStartedAt != null) setTurnStartedAt(gd.turnStartedAt);
    if (gd.status === 'finished') timeoutFiredRef.current = false;
  }, [message?.gameData]);

  // ── Timer countdown ───────────────────────────────────────────────
  useEffect(() => {
    clearInterval(timerRef.current);
    if (!hasTimer || isFinished || isWaiting || !turnStartedAt) return;
    timerRef.current = setInterval(() => {
      if (turnColor === 'white') setWhiteTime(prev => Math.max(0, prev - 1000));
      else setBlackTime(prev => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [turnColor, turnStartedAt, isFinished, isWaiting, hasTimer]);

  // Detect timer hitting zero
  useEffect(() => {
    if (!hasTimer || isFinished || isWaiting || timeoutFiredRef.current) return;
    if (whiteTime === 0) { timeoutFiredRef.current = true; socketManager.emit('chess-timeout', { messageId, color: 'white' }); }
  }, [whiteTime, hasTimer, isFinished, isWaiting, messageId]);

  useEffect(() => {
    if (!hasTimer || isFinished || isWaiting || timeoutFiredRef.current) return;
    if (blackTime === 0) { timeoutFiredRef.current = true; socketManager.emit('chess-timeout', { messageId, color: 'black' }); }
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

  // ── Socket events ─────────────────────────────────────────────────
  useEffect(() => {
    if (!messageId) return;

    const onMoveMade = ({ messageId: mid, move, fen: newFen, whiteTime: wt, blackTime: bt, turnStartedAt: tsa }) => {
      if (mid !== messageId) return;
      try { chessRef.current.move(move); } catch { return; }
      setFen(newFen);
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
      setFen(gd.fen || INITIAL_FEN);
      chessRef.current = new Chess(gd.fen || INITIAL_FEN);
      moveHistoryRef.current = [];
      setMoveHistory([]);
      setWhiteTime(gd.whiteTime ?? 300000);
      setBlackTime(gd.blackTime ?? 300000);
      setTurnStartedAt(gd.turnStartedAt ?? null);
      setOpponentDisconnected(false);
      timeoutFiredRef.current = false;
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
      setWhiteTime(gd.whiteTime ?? 300000);
      setBlackTime(gd.blackTime ?? 300000);
      setTurnStartedAt(gd.turnStartedAt ?? null);
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
    if (!isCpu || !isLive || isFinished || chessRef.current.turn() !== 'b' || cpuThinking) return;
    if (chessRef.current.isGameOver()) return;
    const diff = gameData?.cpu?.difficulty || 'medium';
    setCpuThinking(true);
    const delay = CPU_DELAY[diff] ?? 600;
    const t = setTimeout(() => {
      const move = getCpuMove(chessRef.current.fen(), diff);
      if (!move) { setCpuThinking(false); return; }
      let result;
      try { result = chessRef.current.move(move); } catch { setCpuThinking(false); return; }
      if (!result) { setCpuThinking(false); return; }
      const newFen = chessRef.current.fen();
      const updated = [...moveHistoryRef.current, { san: result.san, color: 'b' }];
      moveHistoryRef.current = updated;
      setMoveHistory(updated);
      setFen(newFen);
      setCpuThinking(false);
      // Sync FEN for spectators
      socketManager.emit('chess-sync-fen', { messageId, fen: newFen, move: { from: result.from, to: result.to } });
      maybeEndGame(newFen, updated);
    }, delay);
    return () => clearTimeout(t);
  }, [fen, isCpu, isLive, isFinished, cpuThinking]);

  function maybeEndGame(currentFen, currentMoves) {
    const chess = chessRef.current;
    if (!chess.isGameOver()) return;
    let winner = null, result = null;
    if (chess.isCheckmate()) {
      winner = chess.turn() === 'w' ? 'black' : 'white';
      result = 'checkmate';
    } else if (chess.isStalemate()) {
      winner = 'draw'; result = 'stalemate';
    } else if (chess.isDraw()) {
      winner = 'draw'; result = 'draw';
    }
    socketManager.emit('chess-game-end', { messageId, winner, result, fen: currentFen, moves: currentMoves });
  }

  function buildResultMsg(gd) {
    if (!gd) return '';
    if (gd.winner === 'draw') return `½-½ ${gd.result === 'stalemate' ? 'Stalemate' : 'Draw'}`;
    if (gd.winner === 'white') return `♔ ${gd.white?.name ?? 'White'} wins!`;
    if (gd.winner === 'black') return `♚ ${isCpu ? 'CPU' : (gd.black?.name ?? 'Black')} wins!`;
    if (gd.result === 'abandoned') return 'Opponent abandoned';
    return 'Game over';
  }

  // ── PvP move handler ──────────────────────────────────────────────
  const onDrop = useCallback((sourceSquare, targetSquare) => {
    if (!isMyTurn) return false;
    const isPromotion = (() => {
      const piece = chessRef.current.get(sourceSquare);
      return piece?.type === 'p' && (targetSquare[1] === '8' || targetSquare[1] === '1');
    })();
    let result;
    try {
      result = chessRef.current.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
    } catch { return false; }
    if (!result) return false;

    const newFen = chessRef.current.fen();
    const updated = [...moveHistoryRef.current, { san: result.san, color: result.color }];
    moveHistoryRef.current = updated;
    setMoveHistory(updated);
    setFen(newFen);

    if (isCpu) {
      socketManager.emit('chess-sync-fen', { messageId, fen: newFen, move: { from: sourceSquare, to: targetSquare } });
    } else {
      socketManager.emit('chess-move', { messageId, move: { from: sourceSquare, to: targetSquare, promotion: 'q' }, fen: newFen });
    }

    // Check if human's move ended the game (e.g., checkmate vs CPU)
    maybeEndGame(newFen, updated);
    return true;
  }, [isMyTurn, isCpu, messageId]);

  const queueLocked = !!gameData?.queueLocked;
  const maxQueue = gameData?.maxQueue ?? Infinity;
  const queueCount = gameData?.challengeQueue?.length ?? 0;
  const queueFull = queueCount >= maxQueue;
  const inQueue = gameData?.challengeQueue?.some(p => p.id === currentUserId || (currentNickname && p.name === currentNickname));
  const canJoinQueue = !isPlaying && !inQueue && isLive && !queueLocked && !queueFull;

  const handleStartCpu = (diff) => socketManager.emit('chess-set-cpu', { messageId, difficulty: diff });
  const handleResign = () => socketManager.emit('chess-resign', { messageId });
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

  const boardOrientation = flipped
    ? (myColor === 'black' ? 'white' : 'black')
    : (myColor ?? 'white');

  const whiteName = gameData?.white?.name ?? 'White';
  const blackName = isCpu ? `CPU (${gameData?.cpu?.difficulty ?? '?'})` : (gameData?.black?.name ?? 'Black');

  // ── Waiting for opponent (creator) ───────────────────────────────
  if (isWaiting && myColor === 'white' && !isCpu) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 bg-white dark:bg-gray-900">
        <div className="text-6xl">♟</div>
        <div className="text-center">
          <p className="font-bold text-gray-800 dark:text-gray-100">Waiting for a challenger...</p>
          <p className="text-xs text-gray-400 mt-1">Share the room so someone can join</p>
        </div>
        <div className="w-full max-w-[220px] space-y-2 pt-2">
          <p className="text-xs text-gray-400 text-center">Or play vs the CPU right now:</p>
          {['easy', 'medium', 'hard'].map(d => (
            <button key={d} onClick={() => handleStartCpu(d)}
              className={`w-full py-2 text-sm font-black rounded-xl text-white ${vibe.accentClass} hover:opacity-90 transition-opacity capitalize`}>
              🤖 {d}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Spectator/queue: waiting for game to start ───────────────────
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

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden select-none">
      {/* Timers */}
      {hasTimer && isLive && (
        <div className="border-b border-gray-100 dark:border-gray-800 pt-1 pb-0.5">
          <TimerBar timeMs={blackTime} isActive={turnColor === 'black'} color="black" name={blackName} />
          <TimerBar timeMs={whiteTime} isActive={turnColor === 'white'} color="white" name={whiteName} />
        </div>
      )}

      {/* Status strip */}
      {((statusMsg && !isFinished) || cpuThinking || opponentDisconnected) && (
        <div className={`text-center text-xs font-semibold py-1 ${
          opponentDisconnected
            ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300'
            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
        }`}>
          {opponentDisconnected
            ? `⚠️ Opponent disconnected — forfeit in ${disconnectSecondsLeft ?? 60}s`
            : cpuThinking ? '🤖 CPU thinking...' : statusMsg}
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
      <div className="flex-1 flex items-center justify-center p-2 min-h-0 overflow-hidden">
        <div className="w-full max-w-[380px] aspect-square">
          <Chessboard
            id={`chess-${messageId}`}
            position={fen}
            onPieceDrop={onDrop}
            boardOrientation={boardOrientation}
            arePiecesDraggable={isMyTurn && !isFinished}
            customBoardStyle={{ borderRadius: '6px', boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}
            customDarkSquareStyle={{ backgroundColor: '#b58863' }}
            customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
          />
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
              {gameData?.result && <p className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">{gameData.result.replace('-', ' ')}</p>}
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
    </div>
  );
}
