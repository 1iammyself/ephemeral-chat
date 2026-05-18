import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { Flag, RotateCcw, Clock, Users } from 'lucide-react';
import socketManager from '../socket';
import { getCpuMove } from './games/ChessEngine';
import { getVibeById } from '../utils/vibes';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CPU_DELAY = { easy: 300, medium: 500, hard: 800 };

function formatMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function TimerBar({ timeMs, isActive, color }) {
  const pct = Math.min(100, (timeMs / 300000) * 100);
  const urgent = timeMs < 30000;
  return (
    <div className={`flex items-center gap-2 px-1 ${isActive ? 'opacity-100' : 'opacity-50'}`}>
      <span className="text-lg leading-none">{color === 'white' ? '♔' : '♚'}</span>
      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${urgent ? 'bg-red-500' : color === 'white' ? 'bg-gray-200 dark:bg-gray-100' : 'bg-gray-800 dark:bg-gray-300'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-black tabular-nums w-10 text-right ${urgent && isActive ? 'text-red-500 animate-pulse' : 'text-gray-700 dark:text-gray-300'}`}>
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
  const [difficulty, setDifficulty] = useState('medium');
  const [statusMsg, setStatusMsg] = useState('');
  const [promotionPiece, setPromotionPiece] = useState(null);

  const chessRef = useRef(new Chess(message?.gameData?.fen || INITIAL_FEN));
  const timerRef = useRef(null);

  const currentUserId = currentUser?.id || currentUser?.socketId;
  const currentNickname = currentUser?.nickname;
  const messageId = message?.id;

  // Derived identity
  const myColor = gameData?.white?.id === currentUserId || (currentNickname && gameData?.white?.name === currentNickname)
    ? 'white'
    : gameData?.black?.id === currentUserId || (currentNickname && gameData?.black?.name === currentNickname)
      ? 'black'
      : null;

  const isCpu = !!gameData?.cpu?.enabled;
  const isPlaying = !!myColor;
  const isFinished = gameData?.status === 'finished';
  const isWaiting = gameData?.status === 'waiting';
  const turnColor = fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const isMyTurn = myColor === turnColor && !isFinished && !cpuThinking;
  const hasTimer = gameData?.timeControl != null;

  // ── Sync game data from updated message ──────────────────────────
  useEffect(() => {
    if (!message?.gameData) return;
    const gd = message.gameData;
    setGameData(gd);
    if (gd.fen && gd.fen !== fen) {
      setFen(gd.fen);
      chessRef.current = new Chess(gd.fen);
    }
    if (gd.moves) setMoveHistory(gd.moves);
    if (gd.whiteTime != null) setWhiteTime(gd.whiteTime);
    if (gd.blackTime != null) setBlackTime(gd.blackTime);
    if (gd.turnStartedAt != null) setTurnStartedAt(gd.turnStartedAt);
  }, [message?.gameData]);

  // ── Timer countdown ───────────────────────────────────────────────
  useEffect(() => {
    clearInterval(timerRef.current);
    if (!hasTimer || isFinished || isWaiting || !turnStartedAt) return;
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - turnStartedAt;
      if (turnColor === 'white') {
        setWhiteTime(prev => {
          const t = Math.max(0, prev - 1000);
          if (t === 0) handleTimeout('white');
          return t;
        });
      } else {
        setBlackTime(prev => {
          const t = Math.max(0, prev - 1000);
          if (t === 0) handleTimeout('black');
          return t;
        });
      }
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [turnColor, turnStartedAt, isFinished, isWaiting, hasTimer]);

  // ── Socket events ─────────────────────────────────────────────────
  useEffect(() => {
    if (!messageId) return;

    const onMoveMade = ({ messageId: mid, move, fen: newFen, whiteTime: wt, blackTime: bt, turnStartedAt: tsa }) => {
      if (mid !== messageId) return;
      const result = chessRef.current.move(move);
      if (!result) return;
      const f = chessRef.current.fen();
      setFen(f);
      setMoveHistory(prev => [...prev, { san: result.san, color: result.color }]);
      if (wt != null) setWhiteTime(wt);
      if (bt != null) setBlackTime(bt);
      if (tsa != null) setTurnStartedAt(tsa);
      checkLocalGameOver();
    };

    const onGameOver = ({ messageId: mid, gameData: gd }) => {
      if (mid !== messageId) return;
      setGameData(gd);
      setStatusMsg(buildResultMsg(gd));
      clearInterval(timerRef.current);
    };

    const onDrawOffered = ({ messageId: mid, byColor }) => {
      if (mid !== messageId) return;
      if (byColor !== myColor) {
        setDrawOfferFrom(byColor);
        setDrawOffered(true);
      }
    };

    const onDrawDeclined = ({ messageId: mid }) => {
      if (mid !== messageId) return;
      setDrawOffered(false);
      setDrawOfferFrom(null);
      setStatusMsg('Draw declined');
      setTimeout(() => setStatusMsg(''), 2000);
    };

    const onOpponentJoined = ({ messageId: mid, gameData: gd }) => {
      if (mid !== messageId) return;
      setGameData(gd);
      setFen(gd.fen || INITIAL_FEN);
      chessRef.current = new Chess(gd.fen || INITIAL_FEN);
      setMoveHistory([]);
      if (gd.whiteTime != null) setWhiteTime(gd.whiteTime);
      if (gd.blackTime != null) setBlackTime(gd.blackTime);
      if (gd.turnStartedAt != null) setTurnStartedAt(gd.turnStartedAt);
      setStatusMsg('');
    };

    const onNewRound = ({ messageId: mid, gameData: gd }) => {
      if (mid !== messageId) return;
      setGameData(gd);
      setFen(INITIAL_FEN);
      chessRef.current = new Chess(INITIAL_FEN);
      setMoveHistory([]);
      setDrawOffered(false);
      setDrawOfferFrom(null);
      setStatusMsg('New round started!');
      setTimeout(() => setStatusMsg(''), 2000);
      if (gd.whiteTime != null) setWhiteTime(gd.whiteTime);
      if (gd.blackTime != null) setBlackTime(gd.blackTime);
      if (gd.turnStartedAt != null) setTurnStartedAt(gd.turnStartedAt);
    };

    socketManager.on('chess-move-made', onMoveMade);
    socketManager.on('chess-game-over', onGameOver);
    socketManager.on('chess-draw-offered', onDrawOffered);
    socketManager.on('chess-draw-declined', onDrawDeclined);
    socketManager.on('chess-opponent-joined', onOpponentJoined);
    socketManager.on('chess-new-round', onNewRound);

    return () => {
      socketManager.off('chess-move-made', onMoveMade);
      socketManager.off('chess-game-over', onGameOver);
      socketManager.off('chess-draw-offered', onDrawOffered);
      socketManager.off('chess-draw-declined', onDrawDeclined);
      socketManager.off('chess-opponent-joined', onOpponentJoined);
      socketManager.off('chess-new-round', onNewRound);
    };
  }, [messageId, myColor]);

  // ── CPU move trigger ──────────────────────────────────────────────
  useEffect(() => {
    if (!isCpu || isFinished || chessRef.current.turn() !== 'b' || cpuThinking) return;
    if (chessRef.current.isGameOver()) return;
    const diff = gameData?.cpu?.difficulty || difficulty;
    setCpuThinking(true);
    const delay = CPU_DELAY[diff] ?? 500;
    const t = setTimeout(() => {
      const move = getCpuMove(chessRef.current.fen(), diff);
      if (!move) { setCpuThinking(false); return; }
      const result = chessRef.current.move(move);
      if (!result) { setCpuThinking(false); return; }
      const newFen = chessRef.current.fen();
      setFen(newFen);
      setMoveHistory(prev => [...prev, { san: result.san, color: 'b' }]);
      setCpuThinking(false);
      // Sync FEN to server so spectators and reconnect work
      socketManager.emit('chess-sync-fen', { messageId, fen: newFen, move: { from: result.from, to: result.to } });
      checkLocalGameOver();
    }, delay);
    return () => clearTimeout(t);
  }, [fen, isCpu, isFinished, cpuThinking]);

  function checkLocalGameOver() {
    const chess = chessRef.current;
    if (!chess.isGameOver()) return;
    let winner = null, result = null;
    if (chess.isCheckmate()) {
      winner = chess.turn() === 'w' ? 'black' : 'white';
      result = 'checkmate';
    } else if (chess.isStalemate()) { result = 'stalemate'; winner = 'draw'; }
    else if (chess.isDraw()) { result = 'draw'; winner = 'draw'; }
    socketManager.emit('chess-game-end', { messageId, winner, result, fen: chess.fen(), moves: moveHistory });
  }

  function handleTimeout(color) {
    clearInterval(timerRef.current);
    socketManager.emit('chess-timeout', { messageId, color });
  }

  function buildResultMsg(gd) {
    if (!gd) return '';
    if (gd.winner === 'draw') return '½-½ Game drawn';
    if (gd.winner === 'white') return `♔ ${gd.white?.name ?? 'White'} wins!`;
    if (gd.winner === 'black') return `♚ ${isCpu ? 'CPU' : (gd.black?.name ?? 'Black')} wins!`;
    return 'Game over';
  }

  // ── PvP move handler ──────────────────────────────────────────────
  const onDrop = useCallback((sourceSquare, targetSquare, piece) => {
    if (!isMyTurn || isCpu) return false;
    const promotion = piece?.[1]?.toLowerCase() === 'p' &&
      (targetSquare[1] === '8' || targetSquare[1] === '1') ? 'q' : undefined;
    try {
      const result = chessRef.current.move({ from: sourceSquare, to: targetSquare, promotion: promotion || 'q' });
      if (!result) return false;
      const newFen = chessRef.current.fen();
      setFen(newFen);
      setMoveHistory(prev => [...prev, { san: result.san, color: result.color }]);
      socketManager.emit('chess-move', {
        messageId,
        move: { from: sourceSquare, to: targetSquare, promotion: promotion || 'q' },
        fen: newFen,
      });
      return true;
    } catch { return false; }
  }, [isMyTurn, isCpu, messageId]);

  // ── CPU setup ─────────────────────────────────────────────────────
  const handleStartCpu = (diff) => {
    setDifficulty(diff);
    socketManager.emit('chess-set-cpu', { messageId, difficulty: diff });
  };

  const handleResign = () => {
    socketManager.emit('chess-resign', { messageId });
  };

  const handleDrawOffer = () => {
    socketManager.emit('chess-draw-offer', { messageId });
    setStatusMsg('Draw offered...');
  };

  const handleDrawAccept = () => {
    socketManager.emit('chess-draw-accept', { messageId });
    setDrawOffered(false);
    setDrawOfferFrom(null);
  };

  const handleDrawDecline = () => {
    socketManager.emit('chess-draw-decline', { messageId });
    setDrawOffered(false);
    setDrawOfferFrom(null);
  };

  const boardOrientation = flipped
    ? (myColor === 'black' ? 'white' : 'black')
    : (myColor ?? 'white');

  // ── Waiting for opponent UI ───────────────────────────────────────
  if (isWaiting && myColor === 'white' && !isCpu) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <div className="text-6xl">♟</div>
        <p className="text-gray-600 dark:text-gray-300 font-semibold">Waiting for a challenger...</p>
        <div className="w-full max-w-[220px] space-y-2">
          <p className="text-xs text-gray-400 text-center">Or play against the CPU:</p>
          {['easy', 'medium', 'hard'].map(d => (
            <button
              key={d}
              onClick={() => handleStartCpu(d)}
              className={`w-full py-2 text-sm font-black rounded-xl text-white ${vibe.accentClass} hover:opacity-90 transition-opacity capitalize`}
            >
              🤖 {d}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Spectator/Queue waiting ───────────────────────────────────────
  if (isWaiting && !myColor) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
        <div className="text-5xl">♟</div>
        <p className="text-gray-600 dark:text-gray-300 font-semibold">Waiting for players to start...</p>
        <div className="flex gap-2 text-xs text-gray-400">
          <span>♔ {gameData?.white?.name ?? '—'}</span>
          <span>vs</span>
          <span>♚ {gameData?.black?.name ?? 'Open'}</span>
        </div>
      </div>
    );
  }

  const activeMoves = moveHistory.length > 0;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden">
      {/* Timers */}
      {hasTimer && (
        <div className="px-3 pt-2 pb-1 space-y-1 border-b border-gray-100 dark:border-gray-800">
          <TimerBar timeMs={blackTime} isActive={turnColor === 'black' && !isFinished} color="black" />
          <TimerBar timeMs={whiteTime} isActive={turnColor === 'white' && !isFinished} color="white" />
        </div>
      )}

      {/* Status overlay */}
      {(statusMsg || cpuThinking) && (
        <div className="text-center text-xs font-semibold py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">
          {cpuThinking ? '🤖 CPU thinking...' : statusMsg}
        </div>
      )}

      {/* Draw offer */}
      {drawOffered && (
        <div className="mx-3 mt-2 p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-between gap-2">
          <span className="text-xs text-blue-700 dark:text-blue-300 font-semibold">🤝 Draw offered by {drawOfferFrom}</span>
          <div className="flex gap-1.5">
            <button onClick={handleDrawAccept} className="text-xs font-black px-2 py-1 rounded-lg bg-green-500 text-white">Accept</button>
            <button onClick={handleDrawDecline} className="text-xs font-black px-2 py-1 rounded-lg bg-red-500 text-white">Decline</button>
          </div>
        </div>
      )}

      {/* Board */}
      <div className="flex-1 flex items-center justify-center p-2 min-h-0">
        <div className="w-full max-w-[360px] aspect-square">
          <Chessboard
            id={`chess-${messageId}`}
            position={fen}
            onPieceDrop={onDrop}
            boardOrientation={boardOrientation}
            arePiecesDraggable={isMyTurn && !isFinished && !isCpu}
            customBoardStyle={{ borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
            customDarkSquareStyle={{ backgroundColor: '#b58863' }}
            customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
          />
        </div>
      </div>

      {/* Move history */}
      {activeMoves && (
        <div className="mx-3 mb-2 flex flex-wrap gap-x-3 gap-y-0.5 max-h-[52px] overflow-y-auto text-[10px] font-mono text-gray-500 dark:text-gray-400">
          {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => {
            const w = moveHistory[i * 2];
            const b = moveHistory[i * 2 + 1];
            return (
              <span key={i}>
                <span className="text-gray-400 dark:text-gray-600">{i + 1}.</span>
                {w && <span className="ml-1 text-gray-700 dark:text-gray-200">{w.san}</span>}
                {b && <span className="ml-1">{b.san}</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* Result banner */}
      {isFinished && (
        <div className="mx-3 mb-2 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-center">
          <p className="text-sm font-black text-amber-700 dark:text-amber-300">{buildResultMsg(gameData)}</p>
          {gameData?.result && <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{gameData.result}</p>}
        </div>
      )}

      {/* Controls */}
      {!isFinished && isPlaying && (
        <div className="px-3 pb-3 flex gap-2">
          <button onClick={() => setFlipped(f => !f)} className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:opacity-80 transition-opacity">
            <RotateCcw className="w-4 h-4" />
          </button>
          {!isCpu && (
            <button onClick={handleDrawOffer} className="flex-1 py-1.5 text-xs font-black rounded-lg bg-blue-500/80 text-blue-100 hover:opacity-90 transition-opacity">
              ½ Draw
            </button>
          )}
          <button onClick={handleResign} className="flex-1 py-1.5 text-xs font-black rounded-lg bg-red-500/80 text-red-100 hover:opacity-90 transition-opacity flex items-center justify-center gap-1">
            <Flag className="w-3.5 h-3.5" />Resign
          </button>
        </div>
      )}

      {/* Spectator controls */}
      {!isFinished && !isPlaying && (
        <div className="px-3 pb-3 flex gap-2">
          <button onClick={() => setFlipped(f => !f)} className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:opacity-80 transition-opacity">
            <RotateCcw className="w-4 h-4" />
          </button>
          <div className="flex-1 flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <Users className="w-3.5 h-3.5" />Spectating
          </div>
        </div>
      )}
    </div>
  );
}
