import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Flag, Lightbulb, Users, Trash2 } from 'lucide-react';
import socketManager from '../socket';
import {
  getCpuMove, checkWinner, getHintMove,
  createUltimateState, applyUltimateMove, isValidUltimateMove, getUltimateCpuMove,
} from './games/TicTacToeEngine';
import { getVibeById } from '../utils/vibes';

const EMPTY_BOARD = Array(9).fill(null);
const TTT_WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

function TttPlayerBar({ symbol, name, score, isActive }) {
  return (
    <div className={`flex items-center gap-2 px-2 pt-1 pb-0.5 transition-opacity ${isActive ? 'opacity-100' : 'opacity-50'}`}>
      <span className={`text-sm font-black leading-none shrink-0 ${symbol === 'X' ? 'text-indigo-500' : 'text-red-500'}`}>
        {symbol === 'X' ? '✕' : '○'}
      </span>
      <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 truncate flex-1">{name}</span>
      <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{score} wins</span>
    </div>
  );
}

// ── Standard TicTacToe ────────────────────────────────────────────────────

function StandardTTT({ message, currentUser, roomVibe, onDelete }) {
  const vibe = getVibeById(roomVibe);
  const userId = currentUser?.id || currentUser?.socketId;
  const nickname = currentUser?.nickname;

  const [gameData, setGameData] = useState(message?.gameData ?? null);
  const [board, setBoard] = useState(EMPTY_BOARD);
  const [turn, setTurn] = useState('X');
  const [winLine, setWinLine] = useState(null);
  const [status, setStatus] = useState('waiting');
  const [scores, setScores] = useState({ X: 0, O: 0, draw: 0 });
  const [myTurnFlash, setMyTurnFlash] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectSecondsLeft, setDisconnectSecondsLeft] = useState(null);
  const [hoverCell, setHoverCell] = useState(null);
  const [hintCell, setHintCell] = useState(null);
  const [wasDisplacedFromGame, setWasDisplacedFromGame] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [boardSize, setBoardSize] = useState(300);

  const boardContainerRef = useRef(null);
  const hintTimerRef = useRef(null);
  const cpuPendingRef = useRef(false);
  const disconnectTimerRef = useRef(null);

  const messageId = message?.id;
  const isCpu = !!gameData?.cpu?.enabled;
  const cpuDiff = gameData?.cpu?.difficulty || 'medium';
  const isP1 = gameData?.player1?.id === userId || (nickname && gameData?.player1?.name === nickname);
  const isP2 = gameData?.player2?.id === userId || (nickname && gameData?.player2?.name === nickname);
  const isPlaying = isP1 || isP2;
  const isMyTurn = (isP1 && turn === 'X') || (isP2 && turn === 'O') || (isP1 && isCpu && turn === 'O');
  const isFinished = status === 'finished';
  const isWaiting = status === 'waiting';
  const isLive = status === 'playing';
  const isCreator = gameData?.creatorId === userId;
  const cpuThinking = isCpu && turn === 'O' && isLive && !winLine && !isFinished;

  const queueLocked = !!gameData?.queueLocked;
  const maxQueue = gameData?.maxQueue ?? Infinity;
  const queueCount = gameData?.challengeQueue?.length ?? 0;
  const queueFull = queueCount >= maxQueue;
  const inQueue = gameData?.challengeQueue?.some(p => p.id === userId || (nickname && p.name === nickname));
  const canJoinQueue = !isPlaying && !inQueue && isLive && !queueLocked && !queueFull;

  const p1Name = gameData?.player1?.name ?? 'Player 1';
  const p2Name = isCpu ? `CPU (${cpuDiff})` : (gameData?.player2?.name ?? 'Player 2');

  // Sync from message prop
  useEffect(() => {
    if (!message?.gameData) return;
    const gd = message.gameData;
    setGameData(gd);
    setBoard(gd.board || EMPTY_BOARD);
    setTurn(gd.turn || 'X');
    setWinLine(gd.winLine || null);
    setStatus(gd.status || 'waiting');
    setScores(gd.scores || { X: 0, O: 0, draw: 0 });
  }, [message?.gameData]);

  useEffect(() => {
    if (!isMyTurn || isFinished || cpuThinking) return;
    setMyTurnFlash(true);
    const t = setTimeout(() => setMyTurnFlash(false), 1200);
    return () => clearTimeout(t);
  }, [isMyTurn, turn]); // eslint-disable-line

  useEffect(() => {
    clearInterval(disconnectTimerRef.current);
    if (!opponentDisconnected) { setDisconnectSecondsLeft(null); return; }
    disconnectTimerRef.current = setInterval(() => {
      setDisconnectSecondsLeft(prev => (prev == null || prev <= 0) ? 0 : prev - 1);
    }, 1000);
    return () => clearInterval(disconnectTimerRef.current);
  }, [opponentDisconnected]);

  // Board sizing — fits the largest square that fills the container
  useEffect(() => {
    const el = boardContainerRef.current;
    if (!el) return;
    let raf = null;
    const ro = new ResizeObserver(([entry]) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const { width, height } = entry.contentRect;
        const s = Math.max(120, Math.floor(Math.min(width, height)) - 24);
        setBoardSize(prev => Math.abs(prev - s) > 8 ? s : prev);
      });
    });
    ro.observe(el);
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const applyLocalMove = (currentBoard, index, player) => {
    const next = [...currentBoard]; next[index] = player;
    const result = checkWinner(next);
    setBoard(next);
    setWinLine(result ? (result.winner === 'draw' ? [] : result.line) : null);
    setStatus(result ? 'finished' : 'playing');
    if (!result) setTurn(player === 'X' ? 'O' : 'X');
    return { finished: !!result };
  };

  // CPU move
  useEffect(() => {
    if (!isCpu || !isP1 || turn !== 'O' || status !== 'playing' || winLine || cpuPendingRef.current) return;
    cpuPendingRef.current = true;
    const snapshot = [...board];
    const tid = setTimeout(() => {
      const mv = getCpuMove(snapshot, cpuDiff);
      if (mv >= 0) { applyLocalMove(snapshot, mv, 'O'); socketManager.emit('ttt-move', { messageId, index: mv }); }
      cpuPendingRef.current = false;
    }, 500);
    return () => { clearTimeout(tid); cpuPendingRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, status, winLine, isCpu, isP1, messageId, cpuDiff]);

  // Socket events
  useEffect(() => {
    if (!messageId) return;

    const onMove = ({ messageId: mid, board: b, turn: t, winLine: wl, scores: s, status: st }) => {
      if (mid !== messageId) return;
      setBoard(b || EMPTY_BOARD);
      setTurn(t || 'X');
      setWinLine(wl || null);
      if (s) setScores(s);
      if (st) setStatus(st);
    };

    const onNewRound = ({ messageId: mid, gameData: gd }) => {
      if (mid !== messageId) return;
      const nowP1 = gd.player1?.id === userId || (nickname && gd.player1?.name === nickname);
      const nowP2 = gd.player2?.id === userId || (nickname && gd.player2?.name === nickname);
      if (isPlaying && !nowP1 && !nowP2) setWasDisplacedFromGame(true);
      if (nowP1 || nowP2) setWasDisplacedFromGame(false);
      setGameData(gd);
      setBoard(gd.board || EMPTY_BOARD);
      setTurn(gd.turn || 'X');
      setWinLine(gd.winLine || null);
      setStatus(gd.status || 'playing');
      setScores(gd.scores || { X: 0, O: 0, draw: 0 });
      setHintCell(null);
      setOpponentDisconnected(false);
      setDisconnectSecondsLeft(null);
      cpuPendingRef.current = false;
    };

    const onOpponentJoined = ({ messageId: mid, gameData: gd }) => {
      if (mid !== messageId) return;
      setGameData(gd);
      setBoard(gd.board || EMPTY_BOARD);
      setTurn(gd.turn || 'X');
      setStatus(gd.status || 'playing');
      setScores(gd.scores || { X: 0, O: 0, draw: 0 });
      setOpponentDisconnected(false);
    };

    const onDC = ({ messageId: mid }) => { if (mid !== messageId) return; setOpponentDisconnected(true); setDisconnectSecondsLeft(60); };
    const onRC = ({ messageId: mid }) => { if (mid !== messageId) return; setOpponentDisconnected(false); setDisconnectSecondsLeft(null); };

    socketManager.on('ttt-move-made', onMove);
    socketManager.on('ttt-new-round', onNewRound);
    socketManager.on('ttt-opponent-joined', onOpponentJoined);
    socketManager.on('ttt-opponent-disconnected', onDC);
    socketManager.on('ttt-opponent-reconnected', onRC);
    return () => {
      socketManager.off('ttt-move-made', onMove);
      socketManager.off('ttt-new-round', onNewRound);
      socketManager.off('ttt-opponent-joined', onOpponentJoined);
      socketManager.off('ttt-opponent-disconnected', onDC);
      socketManager.off('ttt-opponent-reconnected', onRC);
    };
  }, [messageId, isPlaying, userId, nickname]);

  const handleCell = useCallback((i) => {
    if (!isMyTurn || board[i] || winLine || status !== 'playing') return;
    if (isCpu && turn === 'O') return;
    setHintCell(null); clearTimeout(hintTimerRef.current);
    applyLocalMove(board, i, turn);
    socketManager.emit('ttt-move', { messageId, index: i });
  }, [isMyTurn, board, winLine, status, isCpu, turn, messageId]); // eslint-disable-line

  const handleHint = () => {
    if (!isMyTurn || winLine || status !== 'playing' || (isCpu && turn === 'O')) return;
    const best = getHintMove(board); if (best < 0) return;
    setHintCell(best); clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHintCell(null), 2000);
  };

  const handleStartCpu = (diff) => socketManager.emit('ttt-set-cpu', { messageId, difficulty: diff });

  const handleResign = () => {
    if (isCpu && isPlaying) {
      const winnerName = isP1 ? p2Name : p1Name;
      setStatus('finished');
      setWinLine(null);
      setGameData(prev => prev ? { ...prev, status: 'finished', result: 'resign', winner: { name: winnerName } } : prev);
      socketManager.emit('ttt-resign', { messageId });
    } else {
      socketManager.emit('ttt-resign', { messageId });
    }
  };

  const handleRematch = (difficulty) => {
    socketManager.emit('ttt-rematch', { messageId, ...(difficulty ? { difficulty } : {}) });
    if (isCpu) {
      const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : cpuDiff;
      setBoard(EMPTY_BOARD);
      setTurn('X');
      setWinLine(null);
      setStatus('playing');
      setHintCell(null);
      setOpponentDisconnected(false);
      setDisconnectSecondsLeft(null);
      cpuPendingRef.current = false;
      setGameData(prev => prev ? {
        ...prev,
        status: 'playing',
        winner: null,
        result: null,
        board: EMPTY_BOARD,
        turn: 'X',
        winLine: null,
        cpu: { enabled: true, difficulty: diff },
        player2: { id: 'cpu', socketId: null, name: `CPU (${diff})` },
      } : prev);
    }
  };

  const handleTagOut = () => socketManager.emit('ttt-tag-out', { messageId });
  const handleQueueAgain = () => { socketManager.emit('ttt-queue-again', { messageId }); setWasDisplacedFromGame(false); };
  const handleAddSlot = () => socketManager.emit('ttt-set-max-queue', { messageId, maxQueue: (gameData?.maxQueue ?? queueCount) + 1 });
  const handleToggleLock = () => socketManager.emit('ttt-lock-queue', { messageId, locked: !queueLocked });

  const accentColor = vibe?.colors?.primary || '#6366f1';
  const lightCell = vibe?.boardColors?.light || '#e0e7ff';

  const buildResultMsg = (gd) => {
    if (!gd) return '';
    if (gd.result === 'resign') return `🏳 ${gd.winner?.name ?? '?'} wins by resignation`;
    if (gd.result === 'abandoned') return 'Opponent abandoned';
    if (gd.result === 'draw') return '🤝 Draw!';
    if (gd.result === 'X') return `🏆 ${gd.player1?.name ?? 'X'} wins!`;
    if (gd.result === 'O') return `🏆 ${isCpu ? `CPU (${cpuDiff})` : (gd.player2?.name ?? 'O')} wins!`;
    const w = checkWinner(gd.board || EMPTY_BOARD);
    if (w?.winner === 'draw') return '🤝 Draw!';
    if (w?.winner === 'X') return `🏆 ${p1Name} wins!`;
    if (w?.winner === 'O') return `🏆 ${p2Name} wins!`;
    return 'Game over';
  };

  // Spectator waiting view
  if (isWaiting && !isPlaying) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 bg-white dark:bg-gray-900">
        <div className="text-5xl">✕</div>
        <p className="font-semibold text-gray-700 dark:text-gray-200">Waiting for game to start</p>
        <div className="flex gap-2 text-sm text-gray-500">
          <span>✕ {p1Name}</span><span>vs</span><span>○ {p2Name}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden select-none">

      {/* Player bars */}
      {(isLive || isFinished) && (
        <div className="border-b border-gray-100 dark:border-gray-800 pt-0.5 pb-0.5">
          <TttPlayerBar symbol="O" name={p2Name} score={scores.O ?? 0} isActive={turn === 'O' && isLive && !isFinished} />
          <TttPlayerBar symbol="X" name={p1Name} score={scores.X ?? 0} isActive={turn === 'X' && isLive && !isFinished} />
        </div>
      )}

      {/* Status strip */}
      {isLive && !isFinished ? (
        <div className={`text-center text-xs font-semibold py-1 transition-colors ${
          opponentDisconnected
            ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300'
            : myTurnFlash
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
            : cpuThinking
              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
              : ''
        }`}>
          {opponentDisconnected
            ? `⚠️ Opponent disconnected — forfeit in ${disconnectSecondsLeft ?? 60}s`
            : cpuThinking ? `🤖 CPU (${cpuDiff}) thinking...`
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

      {/* Board */}
      <div ref={boardContainerRef} className="flex-1 min-h-0 flex items-center justify-center p-3">
        <div className="p-2 rounded-2xl flex-shrink-0" style={{ background: lightCell + '66', width: boardSize, height: boardSize }}>
          <div className="grid grid-cols-3 gap-1.5 h-full w-full">
            {board.map((cell, i) => {
              const isWin = winLine?.includes(i);
              const canClick = isMyTurn && !cell && !winLine && isLive && !(isCpu && turn === 'O');
              const isHint = hintCell === i && !cell;
              const isHover = hoverCell === i && !cell && canClick;
              return (
                <button key={i} onClick={() => handleCell(i)}
                  onMouseEnter={() => canClick && setHoverCell(i)}
                  onMouseLeave={() => setHoverCell(null)}
                  disabled={!canClick}
                  className={`rounded-xl font-black transition-all duration-150 flex items-center justify-center
                    ${canClick ? 'hover:scale-105 active:scale-95 cursor-pointer' : 'cursor-default'}
                    ${isWin ? 'scale-105 shadow-xl' : ''}
                    ${isHint ? 'ring-2 ring-yellow-400 ring-offset-1 animate-pulse' : ''}`}
                  style={{
                    background: isWin ? accentColor : cell ? (cell === 'X' ? '#e0e7ff' : '#fee2e2') : lightCell,
                    color: isWin ? '#fff' : cell === 'X' ? '#4f46e5' : '#ef4444',
                    border: `2px solid ${isWin ? accentColor : isHint ? '#facc15' : 'transparent'}`,
                    fontSize: Math.round(boardSize / 6),
                  }}>
                  {cell || (isHint
                    ? <span style={{ color: '#facc15', opacity: 0.9 }}>{turn === 'X' ? '✕' : '○'}</span>
                    : isHover
                    ? <span style={{ color: turn === 'X' ? '#4f46e5' : '#ef4444', opacity: 0.3 }}>{turn === 'X' ? '✕' : '○'}</span>
                    : '')}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Draw score */}
      {(isLive || isFinished) && (scores.draw ?? 0) > 0 && (
        <p className="text-center text-[10px] text-gray-400 -mt-1 mb-1">{scores.draw} draw{scores.draw !== 1 ? 's' : ''}</p>
      )}

      {/* Result banner */}
      {isFinished && (
        <div className="mx-3 mb-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 overflow-hidden">
          <div className="py-2 px-3 flex items-center justify-between gap-2">
            <p className="text-sm font-black text-amber-700 dark:text-amber-300 min-w-0 truncate">{buildResultMsg(gameData)}</p>
            {isCreator && (!isCpu || queueCount > 0) && (
              <button onClick={() => handleRematch()}
                className={`px-3 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 shrink-0`}>
                ↺ Rematch
              </button>
            )}
          </div>
          {isCreator && isCpu && queueCount === 0 && (
            <div className="border-t border-amber-100 dark:border-amber-800/40 px-3 py-2 flex gap-1.5">
              {['easy', 'medium', 'hard'].map(d => {
                const isCurrent = d === cpuDiff;
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
          {isMyTurn && !winLine && !(isCpu && turn === 'O') && (
            <button onClick={handleHint}
              className="p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 hover:opacity-80 transition-opacity shrink-0"
              title="Hint">
              <Lightbulb className="w-4 h-4" />
            </button>
          )}
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
          <span className="flex-1 flex items-center gap-1.5 text-xs text-gray-400 justify-center">
            <Users className="w-3.5 h-3.5" />
            {inQueue
              ? `In queue · #${(gameData?.challengeQueue?.findIndex(p => p.id === userId || (nickname && p.name === nickname)) ?? -1) + 1}`
              : `Spectating · ${turn === 'X' ? `✕ ${p1Name}` : `○ ${p2Name}`}'s turn`}
          </span>
          {canJoinQueue && (
            <button onClick={handleQueueAgain}
              className={`py-1.5 px-2.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity shrink-0`}>
              {wasDisplacedFromGame ? '↩ Re-queue' : '+ Queue'}
            </button>
          )}
        </div>
      )}

      {/* Finished spectator */}
      {isFinished && !isPlaying && (
        <div className="px-3 pb-3">
          <div className="w-full py-1.5 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1.5">
            <Users className="w-3.5 h-3.5" />Spectating
          </div>
        </div>
      )}

      {/* Creator delete */}
      {isCreator && onDelete && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-800 pt-2">
          {confirmDelete ? (
            <div className="flex gap-2">
              <button onClick={() => { onDelete(messageId); setConfirmDelete(false); }}
                className="flex-1 py-1.5 text-xs font-black rounded-lg bg-red-600 text-white hover:opacity-90 transition-opacity">
                Delete for everyone
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="py-1.5 px-3 text-xs font-black rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:opacity-80 transition-opacity">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="w-full py-1.5 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" />Delete Game
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ultimate Tic-Tac-Toe (local-only, no changes) ────────────────────────

function UltimateTTT({ message, currentUser, roomVibe }) {
  const gameData    = message?.gameData;
  const vibe        = getVibeById(roomVibe);
  const userId      = currentUser?.id || currentUser?.socketId;
  const isCpu       = !!gameData?.cpu?.enabled;
  const cpuDiff     = gameData?.cpu?.difficulty || 'medium';
  const isP1        = gameData?.player1?.id === userId || (currentUser?.nickname && gameData?.player1?.name === currentUser?.nickname);

  const [state, setState]     = useState(createUltimateState);
  const [scores, setScores]   = useState({ X: 0, O: 0, draw: 0 });
  const [hoverMini, setHoverMini] = useState(null);
  const [hoverCell, setHoverCell] = useState(null);
  const cpuRef = useRef(false);
  const accentColor = vibe?.colors?.primary || '#6366f1';

  const mySymbol   = isP1 ? 'X' : (gameData?.player2?.id === userId || (currentUser?.nickname && gameData?.player2?.name === currentUser?.nickname)) ? 'O' : null;
  const isMyTurn   = mySymbol === state.turn || (isP1 && isCpu && state.turn === 'O');
  const isFinished = !!state.globalWon;

  useEffect(() => {
    if (!isCpu || !isP1 || state.turn !== 'O' || isFinished || cpuRef.current) return;
    cpuRef.current = true;
    const snap = JSON.parse(JSON.stringify(state));
    const tid = setTimeout(() => {
      const mv = getUltimateCpuMove(snap, cpuDiff);
      if (mv) setState(s => applyUltimateMove(s, mv.mini, mv.cell));
      cpuRef.current = false;
    }, 600);
    return () => { clearTimeout(tid); cpuRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turn, isFinished, isCpu, isP1, cpuDiff]);

  const handleCellClick = (miniIdx, cellIdx) => {
    if (!isMyTurn || isFinished) return;
    if (!isValidUltimateMove(state, miniIdx, cellIdx)) return;
    setState(s => applyUltimateMove(s, miniIdx, cellIdx));
  };

  const handleNewGame = () => { setState(createUltimateState()); };

  const isMiniActive = (miniIdx) => {
    if (state.won[miniIdx]) return false;
    return state.activeMini === null || state.activeMini === miniIdx;
  };

  const globalCells = state.won.map(w => w === 'draw' ? null : w);
  const globalLine  = state.globalLine || [];

  return (
    <div className="flex flex-col items-center p-3 h-full gap-3 overflow-y-auto">
      <div className="flex gap-4 text-sm font-semibold items-center">
        <span className="text-indigo-500">✕ {scores.X}</span>
        <span className="text-gray-400 text-xs">ULTIMATE</span>
        <span className="text-red-500">○ {scores.O}</span>
      </div>
      <div className={`w-full max-w-sm text-center text-xs font-semibold py-1.5 px-3 rounded-lg ${
        isFinished ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
        : isMyTurn ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
        : 'bg-gray-50 dark:bg-gray-800/40 text-gray-500 dark:text-gray-400'
      }`}>
        {isFinished
          ? (state.globalWon === 'draw' ? '🤝 Draw!' : `🏆 ${state.globalWon === 'X' ? (gameData?.player1?.name ?? 'X') : (isCpu ? `CPU (${cpuDiff})` : (gameData?.player2?.name ?? 'O'))} wins!`)
          : (isCpu && state.turn === 'O') ? `🤖 CPU (${cpuDiff}) thinking…`
          : isMyTurn ? `Your turn (${state.turn}) ${state.activeMini !== null ? `→ Board ${state.activeMini+1}` : '→ Any board'}`
          : `${state.turn}'s turn${state.activeMini !== null ? ` → Board ${state.activeMini+1}` : ''}`}
      </div>
      <div className="grid grid-cols-3 gap-1.5 w-full max-w-lg">
        {Array.from({length:9}, (_, miniIdx) => {
          const isActive  = isMiniActive(miniIdx);
          const miniWon   = state.won[miniIdx];
          const isGlobalWin = globalLine.includes(miniIdx);
          return (
            <div key={miniIdx}
              className={`rounded-lg p-1 transition-all border-2 ${
                isGlobalWin ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
                : isActive && isMyTurn && !isFinished ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/10'
                : miniWon ? 'border-transparent bg-gray-100 dark:bg-gray-800/40 opacity-70'
                : 'border-gray-200 dark:border-gray-700'
              }`}
              onMouseLeave={() => { setHoverMini(null); setHoverCell(null); }}
            >
              {miniWon ? (
                <div className="aspect-square flex items-center justify-center text-2xl font-black"
                  style={{ color: miniWon === 'X' ? '#4f46e5' : miniWon === 'draw' ? '#9ca3af' : '#ef4444' }}>
                  {miniWon === 'draw' ? '—' : miniWon === 'X' ? '✕' : '○'}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-0.5">
                  {Array.from({length:9}, (_, cellIdx) => {
                    const cell = state.boards[miniIdx][cellIdx];
                    const canPlace = isMyTurn && !isFinished && isValidUltimateMove(state, miniIdx, cellIdx);
                    const isHov   = hoverMini === miniIdx && hoverCell === cellIdx && canPlace && !cell;
                    return (
                      <button key={cellIdx}
                        onClick={() => handleCellClick(miniIdx, cellIdx)}
                        onMouseEnter={() => { if (canPlace) { setHoverMini(miniIdx); setHoverCell(cellIdx); } }}
                        disabled={!canPlace}
                        className={`aspect-square rounded text-[10px] font-black transition-all flex items-center justify-center
                          ${canPlace && !cell ? 'hover:bg-indigo-100 dark:hover:bg-indigo-900/30 cursor-pointer' : 'cursor-default'}`}
                        style={{
                          background: cell === 'X' ? '#e0e7ff' : cell === 'O' ? '#fee2e2' : isHov ? '#f0f4ff' : '#f9fafb',
                          color: cell === 'X' ? '#4f46e5' : '#ef4444',
                        }}>
                        {cell || (isHov ? <span style={{ opacity:0.3 }}>{state.turn === 'X' ? '✕' : '○'}</span> : '')}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-gray-400 text-center leading-tight max-w-[280px]">
        Where you play sends your opponent to that board number. Won/tied boards = free choice.
      </p>
      {isFinished && (
        <button onClick={handleNewGame} className="px-6 py-2 rounded-xl text-sm font-bold text-white" style={{ background: accentColor }}>
          🔁 New Game
        </button>
      )}
    </div>
  );
}

// ── Router ────────────────────────────────────────────────────────────────

export default function TicTacToePanel(props) {
  const mode = props.message?.gameData?.mode;
  return mode === 'ultimate' ? <UltimateTTT {...props} /> : <StandardTTT {...props} />;
}
