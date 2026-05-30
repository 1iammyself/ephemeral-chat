import React, { useState, useEffect, useRef } from 'react';
import { WifiOff } from 'lucide-react';
import socketManager from '../socket';
import { dropDisc, checkWinner, getCpuMove } from './games/ConnectFourEngine';
import { getVibeById } from '../utils/vibes';

const ROWS = 6, COLS = 7;
const EMPTY_BOARD = () => Array(ROWS).fill(null).map(() => Array(COLS).fill(null));

// Columns where dropping gives the opponent a win next turn
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

// Landing row for a given column (lowest empty row)
function getLandingRow(board, col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === null) return r;
  }
  return -1;
}

export default function ConnectFourPanel({ message, currentUser, roomVibe }) {
  const [board, setBoard] = useState(EMPTY_BOARD);
  const [turn, setTurn] = useState(1);
  const [winCells, setWinCells] = useState(null);
  const [status, setStatus] = useState('waiting');
  const [scores, setScores] = useState({ 1: 0, 2: 0, draw: 0 });
  const [hoverCol, setHoverCol] = useState(null);
  const [pendingCpu, setPendingCpu] = useState(false);
  const [myTurnFlash, setMyTurnFlash] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectSecondsLeft, setDisconnectSecondsLeft] = useState(null);
  const cpuRef = useRef(false);
  const disconnectTimerRef = useRef(null);

  const messageId = message?.id;
  const gameData = message?.gameData;
  const vibe = getVibeById(roomVibe);
  const userId = currentUser?.id || currentUser?.socketId;

  const isP1 = gameData?.player1?.id === userId || (currentUser?.nickname && gameData?.player1?.name === currentUser?.nickname);
  const isP2 = gameData?.player2?.id === userId || (currentUser?.nickname && gameData?.player2?.name === currentUser?.nickname);
  const isCpu = !!gameData?.cpu?.enabled;
  const cpuDifficulty = gameData?.cpu?.difficulty || 'medium';
  const isMyTurn = ((isP1 && turn === 1) || (isP2 && turn === 2) || (isP1 && isCpu && turn === 2));
  const isFinished = status === 'finished';
  const cpuThinking = isCpu && turn === 2 && status === 'playing' && !winCells && !isFinished;
  const winSet = new Set((winCells || []).map(([r, c]) => `${r},${c}`));
  const p1Discs = board.flat().filter(c => c === 1).length;
  const p2Discs = board.flat().filter(c => c === 2).length;
  const threatCols = (status === 'playing' && !winCells && isMyTurn && !(isCpu && turn === 2))
    ? getThreatCols(board, turn) : new Set();
  const canDropInCol = (c) => isMyTurn && !winCells && status === 'playing' && !(isCpu && turn === 2) && board[0][c] === null;

  // Ghost disc landing position
  const hoverLandingRow = (hoverCol !== null && canDropInCol(hoverCol))
    ? getLandingRow(board, hoverCol)
    : -1;

  useEffect(() => {
    if (!gameData) return;
    setBoard(gameData.board || EMPTY_BOARD());
    setTurn(gameData.turn || 1);
    setWinCells(gameData.winCells || null);
    setStatus(gameData.status || 'waiting');
    setScores(gameData.scores || { 1: 0, 2: 0, draw: 0 });
  }, [gameData]);

  // "Your turn" flash
  useEffect(() => {
    if (!isMyTurn || isFinished || cpuThinking) return;
    setMyTurnFlash(true);
    const t = setTimeout(() => setMyTurnFlash(false), 1200);
    return () => clearTimeout(t);
  }, [isMyTurn, turn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Disconnect countdown
  useEffect(() => {
    clearInterval(disconnectTimerRef.current);
    if (!opponentDisconnected) { setDisconnectSecondsLeft(null); return; }
    disconnectTimerRef.current = setInterval(() => {
      setDisconnectSecondsLeft(prev => (prev == null || prev <= 0) ? 0 : prev - 1);
    }, 1000);
    return () => clearInterval(disconnectTimerRef.current);
  }, [opponentDisconnected]);

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
    const diff = cpuDifficulty;
    const tid = setTimeout(() => {
      const col = getCpuMove(snapshot, diff, 2);
      if (col >= 0) { applyLocalDrop(snapshot, col, 2); socketManager.emit('c4-drop', { messageId, col }); }
      cpuRef.current = false;
    }, 600);
    return () => { clearTimeout(tid); cpuRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, status, winCells, isCpu, isP1, messageId, cpuDifficulty]);

  useEffect(() => {
    if (!messageId) return;
    const onDrop = ({ messageId: mid, board: b, turn: t, winCells: wc, scores: s, status: st }) => {
      if (mid !== messageId) return;
      setBoard(b || EMPTY_BOARD());
      setTurn(t || 1);
      setWinCells(wc || null);
      if (s) setScores(s);
      if (st) setStatus(st);
    };
    const onDisconnected = ({ messageId: mid }) => {
      if (mid !== messageId) return;
      setOpponentDisconnected(true);
      setDisconnectSecondsLeft(60);
    };
    const onReconnected = ({ messageId: mid }) => {
      if (mid !== messageId) return;
      setOpponentDisconnected(false);
      setDisconnectSecondsLeft(null);
    };
    socketManager.on('c4-drop-made', onDrop);
    socketManager.on('c4-opponent-disconnected', onDisconnected);
    socketManager.on('c4-opponent-reconnected', onReconnected);
    return () => {
      socketManager.off('c4-drop-made', onDrop);
      socketManager.off('c4-opponent-disconnected', onDisconnected);
      socketManager.off('c4-opponent-reconnected', onReconnected);
    };
  }, [messageId]);

  const handleColClick = (col) => {
    if (!isMyTurn || winCells || status !== 'playing') return;
    if (isCpu && turn === 2) return;
    if (board[0][col] !== null) return;
    applyLocalDrop(board, col, turn);
    socketManager.emit('c4-drop', { messageId, col });
  };

  const handleSetCpu = (diff) => { socketManager.emit('c4-set-cpu', { messageId, difficulty: diff }); setPendingCpu(false); };
  const handleRematch = () => socketManager.emit('c4-rematch', { messageId });

  const accentColor = vibe?.colors?.primary || '#6366f1';
  const boardBg = vibe?.boardColors?.dark || '#1e3a5f';
  const currentTurnName = turn === 1 ? gameData?.player1?.name : (isCpu ? `CPU (${cpuDifficulty})` : gameData?.player2?.name);
  const winResult = checkWinner(board);

  const statusText = opponentDisconnected
    ? `⚠️ Opponent disconnected — forfeit in ${disconnectSecondsLeft ?? 60}s`
    : status === 'waiting' ? 'Waiting for opponent…'
    : isFinished ? (winResult?.winner === 'draw' ? '🤝 Draw!'
        : `🏆 ${winResult?.winner === 1 ? (gameData?.player1?.name ?? 'Red') : (isCpu ? `CPU (${cpuDifficulty})` : (gameData?.player2?.name ?? 'Yellow'))} wins!`)
    : cpuThinking ? `🤖 CPU (${cpuDifficulty}) thinking…`
    : myTurnFlash ? '✓ Your turn'
    : `${currentTurnName ?? '?'}'s turn`;

  const statusBg = opponentDisconnected
    ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300'
    : isFinished ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
    : cpuThinking ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300'
    : myTurnFlash ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
    : 'bg-gray-50 dark:bg-gray-800/40 text-gray-500 dark:text-gray-400';

  return (
    <div className="flex flex-col items-center p-3 h-full gap-3 overflow-y-auto">

      {/* Scores + disc counts */}
      <div className="flex gap-6 items-end">
        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold text-red-500">🔴 {scores[1]}</span>
          <span className="text-[9px] text-gray-500">{p1Discs} placed</span>
        </div>
        <span className="text-sm font-semibold text-gray-400 mb-3">{scores.draw ?? 0} draw</span>
        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold text-yellow-500">🟡 {scores[2]}</span>
          <span className="text-[9px] text-gray-500">{p2Discs} placed</span>
        </div>
      </div>

      {/* Status strip */}
      <div className={`w-full max-w-[320px] text-center text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors ${statusBg}`}>
        {statusText}
      </div>

      {/* Alternating first-player hint — shown after the first game, near rematch */}
      {status !== 'waiting' && !isCpu && (scores[1] + scores[2] + (scores.draw ?? 0) > 0) && (
        <p className="text-[9px] text-gray-500 -mt-1.5">↺ First player alternates each rematch</p>
      )}

      <div className="w-full max-w-[320px] px-1">
        {/* Column headers */}
        <div className="grid mb-0.5" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
          {Array.from({ length: COLS }, (_, c) => {
            const isFull = board[0][c] !== null;
            const isThreat = threatCols.has(c);
            return (
              <div key={c} className="flex items-center justify-center h-6">
                {isFull ? (
                  <div className="w-3 h-3 rounded-full bg-gray-500/30" title="Column full" />
                ) : canDropInCol(c) ? (
                  <div
                    className={`w-4 h-4 rounded-full transition-opacity duration-100 ${
                      isThreat ? 'opacity-90 animate-pulse' : hoverCol === c ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{ background: isThreat ? '#ef4444' : turn === 1 ? '#ef4444' : '#facc15' }}
                    title={isThreat ? '⚠️ Danger column' : undefined}
                  />
                ) : <div className="w-4 h-4" />}
              </div>
            );
          })}
        </div>

        {/* Board */}
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

        {/* Mobile: large tap targets per column */}
        {(isMyTurn && !winCells && status === 'playing' && !(isCpu && turn === 2)) && (
          <div className="grid mt-1.5 gap-0.5 sm:hidden" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
            {Array.from({ length: COLS }, (_, c) => (
              <button
                key={c}
                onClick={() => handleColClick(c)}
                disabled={board[0][c] !== null}
                className="h-8 rounded-lg text-[10px] font-bold transition-colors disabled:opacity-20"
                style={{
                  background: board[0][c] !== null
                    ? 'transparent'
                    : threatCols.has(c)
                    ? 'rgba(239,68,68,0.2)'
                    : turn === 1 ? 'rgba(239,68,68,0.12)' : 'rgba(250,204,21,0.12)',
                  color: turn === 1 ? '#ef4444' : '#d97706',
                }}
              >↓</button>
            ))}
          </div>
        )}
      </div>

      {/* Waiting — CPU switch */}
      {isP1 && status === 'waiting' && !gameData?.player2 && !isCpu && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-gray-400">Waiting for someone to join…</p>
          {pendingCpu ? (
            <div className="flex gap-2">
              {['easy', 'medium', 'hard'].map(d => (
                <button key={d} onClick={() => handleSetCpu(d)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white capitalize"
                  style={{ background: accentColor }}>{d}</button>
              ))}
              <button onClick={() => setPendingCpu(false)} className="px-2 py-1.5 rounded-lg text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">✕</button>
            </div>
          ) : (
            <button onClick={() => setPendingCpu(true)}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
              🤖 Switch to vs CPU
            </button>
          )}
        </div>
      )}

      {isFinished && (isP1 || isP2) && (
        <button onClick={handleRematch} className="mt-1 px-6 py-2 rounded-xl text-sm font-bold text-white" style={{ background: accentColor }}>
          🔁 Rematch
        </button>
      )}
    </div>
  );
}
