import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Flag, Users, Trash2 } from 'lucide-react';
import socketManager from '../socket';
import { dropDisc, checkWinner, getCpuMove } from './games/ConnectFourEngine';
import { getVibeById } from '../utils/vibes';

const ROWS = 6, COLS = 7;
const EMPTY_BOARD = () => Array(ROWS).fill(null).map(() => Array(COLS).fill(null));

function C4PlayerBar({ player, name, score, discs, isActive }) {
  return (
    <div className={`flex items-center gap-2 px-2 pt-1 pb-0.5 transition-opacity ${isActive ? 'opacity-100' : 'opacity-50'}`}>
      <span className="text-sm leading-none shrink-0">{player === 1 ? '🔴' : '🟡'}</span>
      <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 truncate flex-1">{name}</span>
      <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{score} wins · {discs} placed</span>
    </div>
  );
}

function getThreatCols(board, currentTurn) {
  const opponent = currentTurn === 1 ? 2 : 1;
  const threats = new Set();
  for (let c = 0; c < COLS; c++) {
    if (board[0][c] !== null) continue;
    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c] === null) { row = r; break; }
    }
    if (row === -1) continue;
    const test = board.map(r => [...r]);
    test[row][c] = opponent;
    if (checkWinner(test)?.winner === opponent) threats.add(c);
  }
  return threats;
}

function getLandingRow(board, col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === null) return r;
  }
  return -1;
}

export default function ConnectFourPanel({ message, currentUser, roomVibe, onDelete }) {
  const vibe = getVibeById(roomVibe);
  const userId = currentUser?.id || currentUser?.socketId;
  const nickname = currentUser?.nickname;

  const [gameData, setGameData] = useState(message?.gameData ?? null);
  const [board, setBoard] = useState(EMPTY_BOARD);
  const [turn, setTurn] = useState(1);
  const [winCells, setWinCells] = useState(null);
  const [status, setStatus] = useState('waiting');
  const [scores, setScores] = useState({ 1: 0, 2: 0, draw: 0 });
  const [hoverCol, setHoverCol] = useState(null);
  const [myTurnFlash, setMyTurnFlash] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectSecondsLeft, setDisconnectSecondsLeft] = useState(null);
  const [wasDisplacedFromGame, setWasDisplacedFromGame] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [boardWidth, setBoardWidth] = useState(380);

  const boardContainerRef = useRef(null);
  const cpuRef = useRef(false);
  const disconnectTimerRef = useRef(null);

  const messageId = message?.id;
  const isP1 = gameData?.player1?.id === userId || (nickname && gameData?.player1?.name === nickname);
  const isP2 = gameData?.player2?.id === userId || (nickname && gameData?.player2?.name === nickname);
  const isPlaying = isP1 || isP2;
  const isCpu = !!gameData?.cpu?.enabled;
  const cpuDifficulty = gameData?.cpu?.difficulty || 'medium';
  const isMyTurn = ((isP1 && turn === 1) || (isP2 && turn === 2) || (isP1 && isCpu && turn === 2));
  const isFinished = status === 'finished';
  const isWaiting = status === 'waiting';
  const isLive = status === 'playing';
  const isCreator = gameData?.creatorId === userId;
  const cpuThinking = isCpu && turn === 2 && isLive && !winCells && !isFinished;

  const queueLocked = !!gameData?.queueLocked;
  const maxQueue = gameData?.maxQueue ?? Infinity;
  const queueCount = gameData?.challengeQueue?.length ?? 0;
  const queueFull = queueCount >= maxQueue;
  const inQueue = gameData?.challengeQueue?.some(p => p.id === userId || (nickname && p.name === nickname));
  const canJoinQueue = !isPlaying && !inQueue && isLive && !queueLocked && !queueFull;

  const winSet = new Set((winCells || []).map(([r, c]) => `${r},${c}`));
  const p1Discs = board.flat().filter(c => c === 1).length;
  const p2Discs = board.flat().filter(c => c === 2).length;

  const p1Name = gameData?.player1?.name ?? 'Player 1';
  const p2Name = isCpu ? `CPU (${cpuDifficulty})` : (gameData?.player2?.name ?? 'Player 2');

  const threatCols = (isLive && !winCells && isMyTurn && !(isCpu && turn === 2))
    ? getThreatCols(board, turn) : new Set();
  const canDropInCol = (c) => isMyTurn && !winCells && isLive && !(isCpu && turn === 2) && board[0][c] === null;
  const hoverLandingRow = (hoverCol !== null && canDropInCol(hoverCol)) ? getLandingRow(board, hoverCol) : -1;

  // Sync from message prop
  useEffect(() => {
    if (!message?.gameData) return;
    const gd = message.gameData;
    setGameData(gd);
    setBoard(gd.board || EMPTY_BOARD());
    setTurn(gd.turn || 1);
    setWinCells(gd.winCells || null);
    setStatus(gd.status || 'waiting');
    setScores(gd.scores || { 1: 0, 2: 0, draw: 0 });
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

  // Board sizing — respects both width and height; board is COLS:ROWS = 7:6 aspect ratio
  useEffect(() => {
    const el = boardContainerRef.current;
    if (!el) return;
    let raf = null;
    const ro = new ResizeObserver(([entry]) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const { width, height } = entry.contentRect;
        const byWidth = Math.floor(width) - 16;
        const byHeight = Math.floor((height - 56) * COLS / ROWS);
        const w = Math.max(200, Math.min(byWidth, Math.max(byHeight, 200)));
        setBoardWidth(prev => Math.abs(prev - w) > 8 ? w : prev);
      });
    });
    ro.observe(el);
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const applyLocalDrop = (currentBoard, col, player) => {
    const res = dropDisc(currentBoard, col, player);
    if (!res) return null;
    const result = checkWinner(res.board);
    setBoard(res.board);
    if (result) { setWinCells(result.cells || null); setStatus('finished'); }
    else setTurn(player === 1 ? 2 : 1);
    return { board: res.board, finished: !!result };
  };

  // CPU move
  useEffect(() => {
    if (!isCpu || !isP1 || turn !== 2 || status !== 'playing' || winCells || cpuRef.current) return;
    cpuRef.current = true;
    const snapshot = board.map(r => [...r]);
    const tid = setTimeout(() => {
      const col = getCpuMove(snapshot, cpuDifficulty, 2);
      if (col >= 0) { applyLocalDrop(snapshot, col, 2); socketManager.emit('c4-drop', { messageId, col }); }
      cpuRef.current = false;
    }, 600);
    return () => { clearTimeout(tid); cpuRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, status, winCells, isCpu, isP1, messageId, cpuDifficulty]);

  // Socket events
  useEffect(() => {
    if (!messageId) return;

    const onDrop = ({ messageId: mid, board: b, turn: t, winCells: wc, scores: s, status: st, winner: w }) => {
      if (mid !== messageId) return;
      setBoard(b || EMPTY_BOARD());
      setTurn(t || 1);
      setWinCells(wc || null);
      if (s) setScores(s);
      if (st) setStatus(st);
      if (w) setGameData(prev => prev ? { ...prev, winner: w, status: st || prev.status } : prev);
    };

    const onNewRound = ({ messageId: mid, gameData: gd }) => {
      if (mid !== messageId) return;
      const nowP1 = gd.player1?.id === userId || (nickname && gd.player1?.name === nickname);
      const nowP2 = gd.player2?.id === userId || (nickname && gd.player2?.name === nickname);
      if (isPlaying && !nowP1 && !nowP2) setWasDisplacedFromGame(true);
      if (nowP1 || nowP2) setWasDisplacedFromGame(false);
      setGameData(gd);
      setBoard(gd.board || EMPTY_BOARD());
      setTurn(gd.turn || 1);
      setWinCells(gd.winCells || null);
      setStatus(gd.status || 'playing');
      setScores(gd.scores || { 1: 0, 2: 0, draw: 0 });
      setHoverCol(null);
      setOpponentDisconnected(false);
      setDisconnectSecondsLeft(null);
      cpuRef.current = false;
    };

    const onOpponentJoined = ({ messageId: mid, gameData: gd }) => {
      if (mid !== messageId) return;
      setGameData(gd);
      setBoard(gd.board || EMPTY_BOARD());
      setTurn(gd.turn || 1);
      setStatus(gd.status || 'playing');
      setScores(gd.scores || { 1: 0, 2: 0, draw: 0 });
      setOpponentDisconnected(false);
    };

    const onDC = ({ messageId: mid }) => { if (mid !== messageId) return; setOpponentDisconnected(true); setDisconnectSecondsLeft(60); };
    const onRC = ({ messageId: mid }) => { if (mid !== messageId) return; setOpponentDisconnected(false); setDisconnectSecondsLeft(null); };

    socketManager.on('c4-drop-made', onDrop);
    socketManager.on('c4-new-round', onNewRound);
    socketManager.on('c4-opponent-joined', onOpponentJoined);
    socketManager.on('c4-opponent-disconnected', onDC);
    socketManager.on('c4-opponent-reconnected', onRC);
    return () => {
      socketManager.off('c4-drop-made', onDrop);
      socketManager.off('c4-new-round', onNewRound);
      socketManager.off('c4-opponent-joined', onOpponentJoined);
      socketManager.off('c4-opponent-disconnected', onDC);
      socketManager.off('c4-opponent-reconnected', onRC);
    };
  }, [messageId, isPlaying, userId, nickname]);

  const handleColClick = useCallback((col) => {
    if (!isMyTurn || winCells || status !== 'playing') return;
    if (isCpu && turn === 2) return;
    if (board[0][col] !== null) return;
    applyLocalDrop(board, col, turn);
    socketManager.emit('c4-drop', { messageId, col });
  }, [isMyTurn, winCells, status, isCpu, turn, board, messageId]); // eslint-disable-line

  const handleStartCpu = (diff) => socketManager.emit('c4-set-cpu', { messageId, difficulty: diff });

  const handleResign = () => {
    if (isCpu && isPlaying) {
      const winnerName = isP1 ? p2Name : p1Name;
      setStatus('finished');
      setWinCells(null);
      setGameData(prev => prev ? { ...prev, status: 'finished', result: 'resign', winner: { name: winnerName } } : prev);
      socketManager.emit('c4-resign', { messageId });
    } else {
      socketManager.emit('c4-resign', { messageId });
    }
  };

  const handleRematch = (difficulty) => {
    socketManager.emit('c4-rematch', { messageId, ...(difficulty ? { difficulty } : {}) });
    if (isCpu) {
      const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : cpuDifficulty;
      setBoard(EMPTY_BOARD());
      setTurn(1);
      setWinCells(null);
      setStatus('playing');
      setHoverCol(null);
      setOpponentDisconnected(false);
      setDisconnectSecondsLeft(null);
      cpuRef.current = false;
      setGameData(prev => prev ? {
        ...prev,
        status: 'playing',
        winner: null,
        result: null,
        board: EMPTY_BOARD(),
        turn: 1,
        winCells: null,
        cpu: { enabled: true, difficulty: diff },
        player2: { id: 'cpu', socketId: null, name: `CPU (${diff})` },
      } : prev);
    }
  };

  const handleTagOut = () => socketManager.emit('c4-tag-out', { messageId });
  const handleQueueAgain = () => { socketManager.emit('c4-queue-again', { messageId }); setWasDisplacedFromGame(false); };
  const handleAddSlot = () => socketManager.emit('c4-set-max-queue', { messageId, maxQueue: (gameData?.maxQueue ?? queueCount) + 1 });
  const handleToggleLock = () => socketManager.emit('c4-lock-queue', { messageId, locked: !queueLocked });

  const accentColor = vibe?.colors?.primary || '#6366f1';
  const boardBg = vibe?.boardColors?.dark || '#1e3a5f';

  const buildResultMsg = (gd) => {
    if (!gd) return '';
    if (gd.result === 'resign') return `🏳 ${gd.winner?.name ?? '?'} wins by resignation`;
    if (gd.result === 'abandoned') return 'Opponent abandoned';
    if (gd.result === 'draw') return '🤝 Draw!';
    if (gd.winner) return `🏆 ${gd.winner.name ?? '?'} wins!`;
    const w = checkWinner(gd.board || EMPTY_BOARD());
    if (w?.winner === 'draw') return '🤝 Draw!';
    if (w?.winner === 1) return `🏆 ${p1Name} wins!`;
    if (w?.winner === 2) return `🏆 ${p2Name} wins!`;
    return 'Game over';
  };

  // Spectator waiting view
  if (isWaiting && !isPlaying) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 bg-white dark:bg-gray-900">
        <div className="text-5xl">🔴</div>
        <p className="font-semibold text-gray-700 dark:text-gray-200">Waiting for game to start</p>
        <div className="flex gap-2 text-sm text-gray-500">
          <span>🔴 {p1Name}</span><span>vs</span><span>🟡 {p2Name}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden select-none">

      {/* Player bars */}
      {(isLive || isFinished) && (
        <div className="border-b border-gray-100 dark:border-gray-800 pt-0.5 pb-0.5">
          <C4PlayerBar player={2} name={p2Name} score={scores[2] ?? 0} discs={p2Discs} isActive={turn === 2 && isLive && !isFinished} />
          <C4PlayerBar player={1} name={p1Name} score={scores[1] ?? 0} discs={p1Discs} isActive={turn === 1 && isLive && !isFinished} />
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

      {/* Board */}
      <div ref={boardContainerRef} className="flex-1 min-h-0 flex flex-col items-center justify-center px-2 py-1">
        <div style={{ width: boardWidth }}>
          {/* Column drop indicators */}
          <div className="grid mb-0.5" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
            {Array.from({ length: COLS }, (_, c) => {
              const isFull = board[0][c] !== null;
              const isThreat = threatCols.has(c);
              return (
                <div key={c} className="flex items-center justify-center h-5">
                  {isFull ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-500/30" />
                  ) : canDropInCol(c) ? (
                    <div
                      className={`w-3.5 h-3.5 rounded-full transition-opacity duration-100 ${isThreat ? 'opacity-90 animate-pulse' : hoverCol === c ? 'opacity-100' : 'opacity-0'}`}
                      style={{ background: isThreat ? '#ef4444' : turn === 1 ? '#ef4444' : '#facc15' }}
                    />
                  ) : <div className="w-3.5 h-3.5" />}
                </div>
              );
            })}
          </div>

          {/* Board grid */}
          <div className="rounded-2xl p-1.5 shadow-inner w-full" style={{ background: boardBg }}>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
              {board.flatMap((row, r) =>
                row.map((cell, c) => {
                  const isWin = winSet.has(`${r},${c}`);
                  const isGhostPreview = r === hoverLandingRow && c === hoverCol && !cell && !isWin;
                  return (
                    <div
                      key={`${r}-${c}`}
                      className={`aspect-square rounded-full cursor-pointer transition-all duration-150 ${canDropInCol(c) ? 'hover:opacity-80' : ''} ${isWin ? 'ring-2 ring-yellow-300 ring-offset-1' : ''}`}
                      style={{
                        background: isGhostPreview
                          ? (turn === 1 ? 'rgba(239,68,68,0.38)' : 'rgba(250,204,21,0.38)')
                          : isWin ? (cell === 1 ? '#f87171' : '#fde047')
                          : cell === 1 ? '#ef4444'
                          : cell === 2 ? '#facc15'
                          : 'rgba(255,255,255,0.1)',
                        transform: isWin ? 'scale(1.1)' : 'scale(1)',
                        boxShadow: isGhostPreview ? (turn === 1 ? '0 0 0 1px rgba(239,68,68,0.5)' : '0 0 0 1px rgba(250,204,21,0.5)') : undefined,
                      }}
                      onClick={() => handleColClick(c)}
                      onMouseEnter={() => setHoverCol(c)}
                      onMouseLeave={() => setHoverCol(null)}
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* Mobile tap targets */}
          {isMyTurn && !winCells && isLive && !(isCpu && turn === 2) && (
            <div className="grid mt-1 gap-0.5 sm:hidden" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
              {Array.from({ length: COLS }, (_, c) => (
                <button key={c} onClick={() => handleColClick(c)} disabled={board[0][c] !== null}
                  className="h-7 rounded-lg text-[10px] font-bold transition-colors disabled:opacity-20"
                  style={{
                    background: board[0][c] !== null ? 'transparent'
                      : threatCols.has(c) ? 'rgba(239,68,68,0.2)'
                      : turn === 1 ? 'rgba(239,68,68,0.12)' : 'rgba(250,204,21,0.12)',
                    color: turn === 1 ? '#ef4444' : '#d97706',
                  }}>↓</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Draw score */}
      {(isLive || isFinished) && (scores.draw ?? 0) > 0 && (
        <p className="text-center text-[10px] text-gray-400 mb-1">
          {scores.draw} draw{scores.draw !== 1 ? 's' : ''} · First player alternates each rematch
        </p>
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
              : `Spectating · ${turn === 1 ? `🔴 ${p1Name}` : `🟡 ${p2Name}`}'s turn`}
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
