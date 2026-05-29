import React, { useState, useEffect, useRef } from 'react';
import socketManager from '../socket';
import { dropDisc, checkWinner, getCpuMove } from './games/ConnectFourEngine';
import { getVibeById } from '../utils/vibes';

const ROWS = 6, COLS = 7;
const EMPTY_BOARD = () => Array(ROWS).fill(null).map(() => Array(COLS).fill(null));

export default function ConnectFourPanel({ message, currentUser, roomVibe }) {
  const [board, setBoard] = useState(EMPTY_BOARD);
  const [turn, setTurn] = useState(1);
  const [winCells, setWinCells] = useState(null);
  const [status, setStatus] = useState('waiting');
  const [scores, setScores] = useState({ 1: 0, 2: 0, draw: 0 });
  const [hoverCol, setHoverCol] = useState(null);
  const [pendingCpu, setPendingCpu] = useState(false);
  const cpuRef = useRef(false);

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
  const winSet = new Set((winCells || []).map(([r,c]) => `${r},${c}`));

  useEffect(() => {
    if (!gameData) return;
    setBoard(gameData.board || EMPTY_BOARD());
    setTurn(gameData.turn || 1);
    setWinCells(gameData.winCells || null);
    setStatus(gameData.status || 'waiting');
    setScores(gameData.scores || { 1: 0, 2: 0, draw: 0 });
  }, [gameData]);

  // Apply a disc drop locally and update state
  const applyLocalDrop = (currentBoard, col, player) => {
    const res = dropDisc(currentBoard, col, player);
    if (!res) return null;
    const result = checkWinner(res.board);
    setBoard(res.board);
    if (result) {
      setWinCells(result.cells || null);
      setStatus('finished');
    } else {
      setTurn(player === 1 ? 2 : 1);
    }
    return { board: res.board, finished: !!result };
  };

  // CPU move — fully local, syncs to server
  useEffect(() => {
    if (!isCpu || !isP1 || turn !== 2 || status !== 'playing' || winCells || cpuRef.current) return;
    cpuRef.current = true;
    const snapshot = board.map(r => [...r]);
    const diff = cpuDifficulty;
    const tid = setTimeout(() => {
      const col = getCpuMove(snapshot, diff, 2);
      if (col >= 0) {
        applyLocalDrop(snapshot, col, 2);
        socketManager.emit('c4-drop', { messageId, col });
      }
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
    socketManager.on('c4-drop-made', onDrop);
    return () => socketManager.off('c4-drop-made', onDrop);
  }, [messageId]);

  const handleColClick = (col) => {
    if (!isMyTurn || winCells || status !== 'playing') return;
    if (isCpu && turn === 2) return;
    if (board[0][col] !== null) return;
    applyLocalDrop(board, col, turn);
    socketManager.emit('c4-drop', { messageId, col });
  };

  const handleSetCpu = (diff) => {
    socketManager.emit('c4-set-cpu', { messageId, difficulty: diff });
    setPendingCpu(false);
  };

  const handleRematch = () => socketManager.emit('c4-rematch', { messageId });

  const accentColor = vibe?.colors?.primary || '#6366f1';
  const boardBg = vibe?.boardColors?.dark || '#1e3a5f';
  const currentTurnName = turn === 1 ? gameData?.player1?.name : (isCpu ? `CPU (${cpuDifficulty})` : gameData?.player2?.name);

  return (
    <div className="flex flex-col items-center p-3 h-full gap-3 overflow-y-auto">
      <div className="flex gap-4 text-sm font-semibold">
        <span className="text-red-500">🔴 {scores[1]}</span>
        <span className="text-gray-400">{scores.draw ?? 0} draw</span>
        <span className="text-yellow-500">🟡 {scores[2]}</span>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 h-5 text-center">
        {status === 'waiting' ? 'Waiting for opponent…' :
          isFinished ? (checkWinner(board)?.winner === 'draw' ? '🤝 Draw!' : `🏆 ${checkWinner(board)?.winner === 1 ? (gameData?.player1?.name ?? 'Red') : (isCpu ? `CPU (${cpuDifficulty})` : (gameData?.player2?.name ?? 'Yellow'))} wins!`) :
          isMyTurn && !(isCpu && turn === 2) ? 'Your turn' : `${currentTurnName} is thinking…`}
      </p>

      <div className="w-full max-w-[320px] px-1">
        <div className="grid mb-0.5" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
          {Array.from({ length: COLS }, (_, c) => (
            <div key={c} className="flex items-center justify-center h-5">
              {isMyTurn && !winCells && status === 'playing' && !(isCpu && turn === 2) ? (
                <div className={`w-4 h-4 rounded-full transition-opacity ${hoverCol === c ? 'opacity-100' : 'opacity-0'}`}
                  style={{ background: turn === 1 ? '#ef4444' : '#facc15' }} />
              ) : <div className="w-4 h-4" />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-1.5 shadow-inner w-full" style={{ background: boardBg }}>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
            {board.flatMap((row, r) =>
              row.map((cell, c) => {
                const isWin = winSet.has(`${r},${c}`);
                const canHover = isMyTurn && !winCells && status === 'playing' && !(isCpu && turn === 2) && board[0][c] === null;
                return (
                  <div
                    key={`${r}-${c}`}
                    className={`aspect-square rounded-full cursor-pointer transition-all duration-150 ${canHover ? 'hover:opacity-80' : ''} ${isWin ? 'ring-2 ring-yellow-300 ring-offset-1' : ''}`}
                    style={{
                      background: isWin ? (cell === 1 ? '#f87171' : '#fde047') : cell === 1 ? '#ef4444' : cell === 2 ? '#facc15' : 'rgba(255,255,255,0.1)',
                      transform: isWin ? 'scale(1.1)' : 'scale(1)',
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
      </div>

      {isP1 && status === 'waiting' && !gameData?.player2 && !isCpu && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-gray-400">Waiting for someone to join…</p>
          {pendingCpu ? (
            <div className="flex gap-2">
              {['easy','medium','hard'].map(d => (
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
