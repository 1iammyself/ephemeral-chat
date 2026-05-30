import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Flag, RotateCcw, Users, Trash2 } from 'lucide-react';
import socketManager from '../socket';
import { getAllMoves, getJumps, applyMove, checkWinner, getCpuMove, initBoard } from './games/CheckersEngine';
import { getVibeById } from '../utils/vibes';

const CPU_DELAY = { easy: 1000, medium: 1800, hard: 3000 };

function CheckersPlayerBar({ player, name, count, kings, isActive }) {
  return (
    <div className={`flex items-center gap-2 px-2 pt-1 pb-0.5 transition-opacity ${isActive ? 'opacity-100' : 'opacity-50'}`}>
      <span className="text-sm leading-none shrink-0">{player === 1 ? '⚪' : '⚫'}</span>
      <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 truncate flex-1">{name}</span>
      <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 tabular-nums">
        {count} left{kings > 0 ? ` · ♛×${kings}` : ''}
      </span>
    </div>
  );
}

export default function CheckersPanel({ message, currentUser, roomVibe, onDelete }) {
  const vibe = getVibeById(roomVibe);

  const [board, setBoard] = useState(() => initBoard());
  const [turn, setTurn] = useState(1);
  const [selected, setSelected] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [status, setStatus] = useState('waiting');
  const [scores, setScores] = useState({ 1: 0, 2: 0 });
  const [gameData, setGameData] = useState(message?.gameData ?? null);
  const [flipped, setFlipped] = useState(false);
  const [myTurnFlash, setMyTurnFlash] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectSecondsLeft, setDisconnectSecondsLeft] = useState(null);
  const [midJump, setMidJump] = useState(false);
  const [midJumpPiece, setMidJumpPiece] = useState(null);
  const [noProgressMoves, setNoProgressMoves] = useState(0);
  const [wasDisplacedFromGame, setWasDisplacedFromGame] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const boardContainerRef = useRef(null);
  const [boardSize, setBoardSize] = useState(360);
  const cpuRef = useRef(false);
  const disconnectTimerRef = useRef(null);

  const messageId = message?.id;
  const userId = currentUser?.id || currentUser?.socketId;
  const nickname = currentUser?.nickname;
  const variant = gameData?.variant || 'american';

  const isP1 = gameData?.player1?.id === userId || (nickname && gameData?.player1?.name === nickname);
  const isP2 = gameData?.player2?.id === userId || (nickname && gameData?.player2?.name === nickname);
  const isCpu = !!gameData?.cpu?.enabled;
  const cpuDifficulty = gameData?.cpu?.difficulty || 'medium';
  const isPlaying = isP1 || isP2;
  const myPiece = isP1 ? 1 : isP2 ? 2 : null;
  const isMyTurn = myPiece === turn || (isP1 && isCpu && turn === 2);
  const isFinished = status === 'finished';
  const isWaiting = status === 'waiting';
  const isLive = status === 'playing';
  const isCreator = gameData?.creatorId === userId;

  const queueLocked = !!gameData?.queueLocked;
  const maxQueue = gameData?.maxQueue ?? Infinity;
  const queueCount = gameData?.challengeQueue?.length ?? 0;
  const queueFull = queueCount >= maxQueue;
  const inQueue = gameData?.challengeQueue?.some(p => p.id === userId || (nickname && p.name === nickname));
  const canJoinQueue = !isPlaying && !inQueue && isLive && !queueLocked && !queueFull;

  const cpuThinking = isCpu && turn === 2 && isLive && !isFinished;

  const cells = board.flat().filter(Boolean);
  const p1Count = cells.filter(c => c.p === 1).length;
  const p2Count = cells.filter(c => c.p === 2).length;
  const p1Kings = cells.filter(c => c.p === 1 && c.k).length;
  const p2Kings = cells.filter(c => c.p === 2 && c.k).length;

  const p1Name = gameData?.player1?.name ?? 'Player 1';
  const p2Name = isCpu ? `CPU (${cpuDifficulty})` : (gameData?.player2?.name ?? 'Player 2');

  // Board sizing with ResizeObserver
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

  // Sync game data from message prop
  useEffect(() => {
    if (!message?.gameData) return;
    const gd = message.gameData;
    setGameData(gd);
    setBoard(gd.board || initBoard());
    setTurn(gd.turn || 1);
    setStatus(gd.status || 'waiting');
    setScores(gd.scores || { 1: 0, 2: 0 });
    setSelected(null);
    setValidMoves([]);
    setMidJump(false);
    setMidJumpPiece(null);
    setNoProgressMoves(0);
  }, [message?.gameData]);

  // My turn flash
  useEffect(() => {
    if (!isMyTurn || isFinished || cpuThinking) return;
    setMyTurnFlash(true);
    const t = setTimeout(() => setMyTurnFlash(false), 1200);
    return () => clearTimeout(t);
  }, [isMyTurn, turn]); // eslint-disable-line

  // Disconnect countdown
  useEffect(() => {
    clearInterval(disconnectTimerRef.current);
    if (!opponentDisconnected) { setDisconnectSecondsLeft(null); return; }
    disconnectTimerRef.current = setInterval(() => {
      setDisconnectSecondsLeft(prev => (prev == null || prev <= 0) ? 0 : prev - 1);
    }, 1000);
    return () => clearInterval(disconnectTimerRef.current);
  }, [opponentDisconnected]);

  const applyLocalMove = (currentBoard, move, currentTurn) => {
    const isCapture = !!move.captured;
    const movingPiece = currentBoard[move.from[0]][move.from[1]];
    const wasKing = movingPiece?.k || false;
    const next = applyMove(currentBoard, move);
    const [tr, tc] = move.to;
    const justBecameKing = !wasKing && !!next[tr][tc]?.k;

    const isProgress = isCapture || !movingPiece?.k;
    setNoProgressMoves(prev => isProgress ? 0 : prev + 1);

    setBoard(next);
    setSelected(null);
    setValidMoves([]);
    const winner = checkWinner(next);
    if (winner) {
      setStatus('finished');
      setMidJump(false);
      setMidJumpPiece(null);
      return { board: next, finished: true };
    }

    const promotionEndsJump = variant !== 'russian';
    if (isCapture && !(justBecameKing && promotionEndsJump)) {
      const continuationJumps = getJumps(next, tr, tc, variant);
      if (continuationJumps.length > 0) {
        setMidJump(true);
        setMidJumpPiece([tr, tc]);
        setSelected([tr, tc]);
        setValidMoves(continuationJumps);
        return { board: next, finished: false, midJump: true };
      }
    }

    setMidJump(false);
    setMidJumpPiece(null);
    setTurn(currentTurn === 1 ? 2 : 1);
    return { board: next, finished: false };
  };

  // CPU move
  useEffect(() => {
    if (!isCpu || !isP1 || turn !== 2 || status !== 'playing' || cpuRef.current) return;
    cpuRef.current = true;
    const snapshot = board.map(row => row.map(c => c ? { ...c } : null));

    if (midJump && midJumpPiece) {
      const [pr, pc] = midJumpPiece;
      const jumps = getJumps(snapshot, pr, pc, variant);
      if (jumps.length > 0) {
        const mv = jumps[Math.floor(Math.random() * jumps.length)];
        const tid = setTimeout(() => {
          applyLocalMove(snapshot, mv, 2);
          socketManager.emit('checkers-move', { messageId, move: mv });
          cpuRef.current = false;
        }, Math.min(CPU_DELAY[cpuDifficulty] ?? 600, 500));
        return () => { clearTimeout(tid); cpuRef.current = false; };
      }
      setMidJump(false);
      setMidJumpPiece(null);
      setTurn(1);
      cpuRef.current = false;
      return;
    }

    const delay = CPU_DELAY[cpuDifficulty] ?? 600;
    const tid = setTimeout(() => {
      const mv = getCpuMove(snapshot, cpuDifficulty, 2, variant);
      if (mv) {
        applyLocalMove(snapshot, mv, 2);
        socketManager.emit('checkers-move', { messageId, move: mv });
      }
      cpuRef.current = false;
    }, delay);
    return () => { clearTimeout(tid); cpuRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, status, isCpu, isP1, messageId, cpuDifficulty, midJump, midJumpPiece, variant]);

  // Socket events
  useEffect(() => {
    if (!messageId) return;

    const onMove = ({ messageId: mid, board: b, turn: t, status: st, scores: s, winner: w }) => {
      if (mid !== messageId) return;
      setBoard(b || initBoard());
      setTurn(t || 1);
      if (st) setStatus(st);
      if (s) setScores(s);
      if (w) setGameData(prev => prev ? { ...prev, winner: w, status: st || prev.status } : prev);
      setSelected(null);
      setValidMoves([]);
      setMidJump(false);
      setMidJumpPiece(null);
    };

    const onNewRound = ({ messageId: mid, gameData: gd }) => {
      if (mid !== messageId) return;
      const nowP1 = gd.player1?.id === userId || (nickname && gd.player1?.name === nickname);
      const nowP2 = gd.player2?.id === userId || (nickname && gd.player2?.name === nickname);
      if (isPlaying && !nowP1 && !nowP2) setWasDisplacedFromGame(true);
      if (nowP1 || nowP2) setWasDisplacedFromGame(false);
      setGameData(gd);
      setBoard(gd.board || initBoard());
      setTurn(gd.turn || 1);
      setStatus(gd.status || 'playing');
      setScores(gd.scores || { 1: 0, 2: 0 });
      setSelected(null);
      setValidMoves([]);
      setMidJump(false);
      setMidJumpPiece(null);
      setNoProgressMoves(0);
      setOpponentDisconnected(false);
      setDisconnectSecondsLeft(null);
      cpuRef.current = false;
    };

    const onOpponentJoined = ({ messageId: mid, gameData: gd }) => {
      if (mid !== messageId) return;
      setGameData(gd);
      setBoard(gd.board || initBoard());
      setTurn(gd.turn || 1);
      setStatus(gd.status || 'playing');
      setScores(gd.scores || { 1: 0, 2: 0 });
      setOpponentDisconnected(false);
    };

    const onDC = ({ messageId: mid }) => {
      if (mid !== messageId) return;
      setOpponentDisconnected(true);
      setDisconnectSecondsLeft(60);
    };

    const onRC = ({ messageId: mid }) => {
      if (mid !== messageId) return;
      setOpponentDisconnected(false);
      setDisconnectSecondsLeft(null);
    };

    socketManager.on('checkers-move-made', onMove);
    socketManager.on('checkers-new-round', onNewRound);
    socketManager.on('checkers-opponent-joined', onOpponentJoined);
    socketManager.on('checkers-opponent-disconnected', onDC);
    socketManager.on('checkers-opponent-reconnected', onRC);

    return () => {
      socketManager.off('checkers-move-made', onMove);
      socketManager.off('checkers-new-round', onNewRound);
      socketManager.off('checkers-opponent-joined', onOpponentJoined);
      socketManager.off('checkers-opponent-disconnected', onDC);
      socketManager.off('checkers-opponent-reconnected', onRC);
    };
  }, [messageId, isPlaying, userId, nickname]);

  const handleSquareClick = useCallback((visualR, visualC) => {
    const r = flipped ? 7 - visualR : visualR;
    const c = flipped ? 7 - visualC : visualC;
    if (!isMyTurn || status !== 'playing') return;
    if (isCpu && turn === 2) return;

    if (midJump && midJumpPiece) {
      if (r === midJumpPiece[0] && c === midJumpPiece[1]) return;
      const mv = validMoves.find(m => m.to[0] === r && m.to[1] === c);
      if (mv) { applyLocalMove(board, mv, turn); socketManager.emit('checkers-move', { messageId, move: mv }); }
      return;
    }

    const cell = board[r][c];
    if (cell && cell.p === turn) {
      const allMoves = getAllMoves(board, turn, variant);
      const hasJumps = allMoves.some(m => m.captured);
      const pieceMoves = allMoves.filter(m => {
        const [fr, fc] = m.from;
        return fr === r && fc === c && (!hasJumps || m.captured);
      });
      setSelected([r, c]);
      setValidMoves(pieceMoves);
      return;
    }
    if (selected) {
      const mv = validMoves.find(m => m.to[0] === r && m.to[1] === c);
      if (mv) { applyLocalMove(board, mv, turn); socketManager.emit('checkers-move', { messageId, move: mv }); }
      else { setSelected(null); setValidMoves([]); }
    }
  }, [isMyTurn, status, isCpu, turn, midJump, midJumpPiece, validMoves, board, selected, flipped, messageId, variant]); // eslint-disable-line

  const handleStartCpu = (diff) => socketManager.emit('checkers-set-cpu', { messageId, difficulty: diff });

  const handleResign = () => {
    if (isCpu && myPiece) {
      setStatus('finished');
      setGameData(prev => prev ? {
        ...prev,
        status: 'finished',
        result: 'resign',
        winner: myPiece === 1 ? prev.player2 : prev.player1,
      } : prev);
    }
    socketManager.emit('checkers-resign', { messageId });
  };

  const handleRematch = (difficulty) => {
    socketManager.emit('checkers-rematch', { messageId, ...(difficulty ? { difficulty } : {}) });
    if (isCpu) {
      const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : cpuDifficulty;
      const newGd = {
        ...gameData,
        status: 'playing',
        winner: null,
        result: null,
        endedAt: null,
        board: initBoard(),
        turn: 1,
        cpu: { enabled: true, difficulty: diff },
        player2: { id: 'cpu', socketId: null, name: `CPU (${diff})` },
        startedAt: Date.now(),
      };
      setBoard(initBoard());
      setTurn(1);
      setStatus('playing');
      setSelected(null);
      setValidMoves([]);
      setMidJump(false);
      setMidJumpPiece(null);
      setNoProgressMoves(0);
      setOpponentDisconnected(false);
      setDisconnectSecondsLeft(null);
      cpuRef.current = false;
      setGameData(newGd);
    }
  };

  const handleTagOut = () => socketManager.emit('checkers-tag-out', { messageId });
  const handleQueueAgain = () => { socketManager.emit('checkers-queue-again', { messageId }); setWasDisplacedFromGame(false); };
  const handleAddSlot = () => socketManager.emit('checkers-set-max-queue', { messageId, maxQueue: (gameData?.maxQueue ?? queueCount) + 1 });
  const handleToggleLock = () => socketManager.emit('checkers-lock-queue', { messageId, locked: !queueLocked });

  const darkSq = vibe?.boardColors?.dark || '#92400e';
  const lightSq = vibe?.boardColors?.light || '#fef3c7';
  const accentColor = vibe?.colors?.primary || '#6366f1';
  const validToSet = new Set(validMoves.map(m => `${m.to[0]},${m.to[1]}`));
  const displayBoard = flipped ? [...board].reverse().map(row => [...row].reverse()) : board;

  const buildResultMsg = (gd) => {
    if (!gd) return '';
    if (gd.result === 'abandoned') return 'Opponent abandoned';
    if (gd.result === 'resign') {
      const winnerName = gd.winner?.name ?? '?';
      return `🏳 ${winnerName} wins by resignation`;
    }
    if (gd.winner) return `🏆 ${gd.winner.name ?? '?'} wins!`;
    return 'Game over';
  };

  // Spectator waiting view
  if (isWaiting && !isPlaying) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 bg-white dark:bg-gray-900">
        <div className="text-5xl">⛀</div>
        <p className="font-semibold text-gray-700 dark:text-gray-200">Waiting for game to start</p>
        <div className="flex gap-2 text-sm text-gray-500">
          <span>⚪ {p1Name}</span><span>vs</span><span>⚫ {p2Name}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden select-none">

      {/* Player bars (shown when live or finished) */}
      {(isLive || isFinished) && (
        <div className="border-b border-gray-100 dark:border-gray-800 pt-0.5 pb-0.5">
          <CheckersPlayerBar
            player={2} name={p2Name}
            count={p2Count} kings={p2Kings}
            isActive={turn === 2 && isLive && !isFinished}
          />
          <CheckersPlayerBar
            player={1} name={p1Name}
            count={p1Count} kings={p1Kings}
            isActive={turn === 1 && isLive && !isFinished}
          />
        </div>
      )}

      {/* Status strip — always occupies height during live games to prevent board resize flicker */}
      {isLive && !isFinished ? (
        <div className={`text-center text-xs font-semibold py-1 transition-colors ${
          opponentDisconnected
            ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300'
            : midJump
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
            : myTurnFlash
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
            : cpuThinking
              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
              : ''
        }`}>
          {opponentDisconnected
            ? `⚠️ Opponent disconnected — forfeit in ${disconnectSecondsLeft ?? 60}s`
            : midJump ? '⚡ Continue your jump!'
            : cpuThinking ? `🤖 CPU (${cpuDifficulty}) thinking...`
            : myTurnFlash ? '✓ Your turn'
            : ' '}
        </div>
      ) : null}

      {/* Waiting for challenger banner */}
      {isWaiting && isP1 && (
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

      {/* No-progress counter */}
      {isLive && noProgressMoves >= 20 && (
        <div className={`mx-3 mb-1 text-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          noProgressMoves >= 40
            ? 'bg-red-100 dark:bg-red-900/20 text-red-600'
            : 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700'
        }`}>
          {noProgressMoves}/40 no-progress{noProgressMoves >= 40 ? ' — Draw can be claimed' : ''}
        </div>
      )}

      {/* Board */}
      <div ref={boardContainerRef} className="flex-1 flex items-center justify-center p-2 min-h-0 overflow-hidden">
        <div
          className="rounded-xl overflow-hidden border-2 border-black/20 flex-shrink-0"
          style={{ width: boardSize, height: boardSize, background: darkSq }}
        >
          {displayBoard.map((row, visualR) => (
            <div key={visualR} className="grid grid-cols-8" style={{ height: `${boardSize / 8}px` }}>
              {row.map((cell, visualC) => {
                const logicalR = flipped ? 7 - visualR : visualR;
                const logicalC = flipped ? 7 - visualC : visualC;
                const isDark = (logicalR + logicalC) % 2 === 1;
                const isSelected = selected && selected[0] === logicalR && selected[1] === logicalC;
                const isMJP = midJumpPiece && midJumpPiece[0] === logicalR && midJumpPiece[1] === logicalC;
                const isTarget = validToSet.has(`${logicalR},${logicalC}`);
                return (
                  <div
                    key={visualC}
                    onClick={() => isDark && handleSquareClick(visualR, visualC)}
                    className={`h-full flex items-center justify-center transition-all relative ${isDark && isMyTurn && isLive && !(isCpu && turn === 2) ? 'cursor-pointer' : ''}`}
                    style={{ background: isMJP ? '#3b82f622' : isSelected ? accentColor + '66' : isDark ? darkSq : lightSq }}
                  >
                    {isTarget && !cell && (
                      <div className="w-1/3 h-1/3 rounded-full opacity-50" style={{ background: accentColor }} />
                    )}
                    {isTarget && midJump && !cell && (
                      <div className="absolute inset-0.5 rounded-sm border border-blue-400/60 animate-pulse pointer-events-none" />
                    )}
                    {cell && isDark && (
                      <div
                        className={`rounded-full flex items-center justify-center transition-transform ${isSelected || isMJP ? 'scale-110' : ''} ${isTarget ? 'ring-1 ring-yellow-400' : ''}`}
                        style={{
                          width: '78%', height: '78%',
                          background: cell.p === 1 ? '#f1f5f9' : '#1e293b',
                          boxShadow: isMJP ? '0 0 0 3px rgba(59,130,246,0.7)' : cell.p === 1 ? '0 2px 4px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.5)',
                          border: cell.k ? '2px solid #facc15' : `2px solid ${cell.p === 1 ? '#cbd5e1' : '#475569'}`,
                          fontSize: '55%',
                        }}
                      >
                        {cell.k && '♛'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Variant key */}
      {variant !== 'american' && (
        <div className="mx-3 text-center text-[9px] text-gray-400 leading-relaxed">
          {variant === 'russian' && '👑 Flying kings · Men capture backward · Promotion continues mid-jump'}
          {variant === 'brazilian' && '👑 Flying kings · Men capture backward · Must maximize captures'}
        </div>
      )}

      {/* Result banner */}
      {isFinished && (
        <div className="mx-3 mb-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 overflow-hidden">
          <div className="py-2 px-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-black text-amber-700 dark:text-amber-300">{buildResultMsg(gameData)}</p>
              {(scores[1] > 0 || scores[2] > 0) && (
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Score: ⚪ {scores[1]} – {scores[2]} ⚫</p>
              )}
            </div>
            {isCreator && (!isCpu || queueCount > 0) && (
              <button onClick={() => handleRematch()}
                className={`px-3 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 shrink-0`}>
                ↺ Rematch
              </button>
            )}
          </div>
          {/* Solo CPU: difficulty quick-select */}
          {isCreator && isCpu && queueCount === 0 && (
            <div className="border-t border-amber-100 dark:border-amber-800/40 px-3 py-2 flex gap-1.5">
              {['easy', 'medium', 'hard'].map(d => {
                const isCurrent = d === cpuDifficulty;
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
            {inQueue
              ? `In queue · #${(gameData?.challengeQueue?.findIndex(p => p.id === userId || (nickname && p.name === nickname)) ?? -1) + 1}`
              : `Spectating · ${turn === 1 ? `⚪ ${p1Name}` : `⚫ ${p2Name}`}'s turn`}
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
