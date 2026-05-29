import React, { useState, useEffect, useRef } from 'react';
import { socketManager } from '../socket';
import { getCpuMove } from './games/TicTacToeEngine';
import { getVibeById } from '../utils/vibes';

const EMPTY_BOARD = Array(9).fill(null);

const DIFF_LABELS = { easy: '😊 Easy', medium: '🤔 Medium', hard: '😈 Hard' };

export default function TicTacToePanel({ message, currentUser, roomVibe }) {
  const [board, setBoard] = useState(EMPTY_BOARD);
  const [turn, setTurn] = useState('X');
  const [winLine, setWinLine] = useState(null);
  const [status, setStatus] = useState('waiting');
  const [scores, setScores] = useState({ X: 0, O: 0, draw: 0 });
  const [pendingCpu, setPendingCpu] = useState(null);
  const cpuPendingRef = useRef(false);

  const messageId = message?.id;
  const gameData = message?.gameData;
  const vibe = getVibeById(roomVibe);
  const userId = currentUser?.id || currentUser?.socketId;

  const isP1 = gameData?.player1?.id === userId || (currentUser?.nickname && gameData?.player1?.name === currentUser?.nickname);
  const isP2 = gameData?.player2?.id === userId || (currentUser?.nickname && gameData?.player2?.name === currentUser?.nickname);
  const isCpu = !!gameData?.cpu?.enabled;
  const isMyTurn = (isP1 && turn === 'X') || (isP2 && turn === 'O') || (isP1 && isCpu && turn === 'O');
  const isFinished = status === 'finished';

  // Sync state from message.gameData
  useEffect(() => {
    if (!gameData) return;
    setBoard(gameData.board || EMPTY_BOARD);
    setTurn(gameData.turn || 'X');
    setWinLine(gameData.winLine || null);
    setStatus(gameData.status || 'waiting');
    setScores(gameData.scores || { X: 0, O: 0, draw: 0 });
  }, [gameData]);

  // CPU move trigger
  useEffect(() => {
    if (!isCpu || !isP1 || turn !== 'O' || status !== 'playing' || winLine || cpuPendingRef.current) return;
    cpuPendingRef.current = true;
    const tid = setTimeout(() => {
      const move = getCpuMove([...board], gameData.cpu.difficulty);
      if (move >= 0) socketManager.emit('ttt-move', { messageId, index: move });
      cpuPendingRef.current = false;
    }, 500);
    return () => { clearTimeout(tid); cpuPendingRef.current = false; };
  }, [turn, status, board, isCpu, isP1, winLine, messageId, gameData]);

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
    socketManager.on('ttt-move-made', onMove);
    return () => socketManager.off('ttt-move-made', onMove);
  }, [messageId]);

  const handleCell = (i) => {
    if (!isMyTurn || board[i] || winLine || status !== 'playing') return;
    if (isCpu && turn === 'O') return; // CPU's turn handled automatically
    socketManager.emit('ttt-move', { messageId, index: i });
  };

  const handleRematch = () => socketManager.emit('ttt-rematch', { messageId });

  const handleSetCpu = (diff) => {
    socketManager.emit('ttt-set-cpu', { messageId, difficulty: diff });
    setPendingCpu(null);
  };

  const accentColor = vibe?.colors?.primary || '#6366f1';
  const darkCell = vibe?.boardColors?.dark || '#818cf8';
  const lightCell = vibe?.boardColors?.light || '#e0e7ff';

  const currentTurnName = turn === 'X' ? gameData?.player1?.name : (isCpu ? `CPU (${gameData?.cpu?.difficulty})` : gameData?.player2?.name);

  return (
    <div className="flex flex-col items-center p-4 h-full gap-3 overflow-y-auto">
      {/* Scores */}
      <div className="flex gap-6 text-sm font-semibold">
        <span className="text-indigo-500 dark:text-indigo-400">✕ {scores.X}</span>
        <span className="text-gray-400">{scores.draw ?? 0} draw</span>
        <span className="text-red-500 dark:text-red-400">○ {scores.O}</span>
      </div>

      {/* Status */}
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center h-5">
        {status === 'waiting'
          ? 'Waiting for opponent…'
          : isFinished
            ? gameData?.result === 'draw'
              ? '🤝 Draw!'
              : `🏆 ${gameData?.winner?.name ?? gameData?.result} wins!`
            : isMyTurn
              ? "Your turn"
              : `${currentTurnName} is thinking…`}
      </p>

      {/* Board */}
      <div
        className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 rounded-2xl w-full max-w-[288px]"
        style={{ background: lightCell + '66' }}
      >
        {board.map((cell, i) => {
          const isWin = winLine?.includes(i);
          const canClick = isMyTurn && !cell && !winLine && status === 'playing' && !(isCpu && turn === 'O');
          return (
            <button
              key={i}
              onClick={() => handleCell(i)}
              disabled={!canClick}
              className={`aspect-square w-full rounded-xl text-3xl sm:text-4xl font-black transition-all duration-150
                ${canClick ? 'hover:scale-105 active:scale-95 cursor-pointer' : 'cursor-default'}
                ${isWin ? 'scale-105 shadow-xl' : ''}`}
              style={{
                background: isWin
                  ? accentColor
                  : cell
                    ? (cell === 'X' ? '#e0e7ff' : '#fee2e2')
                    : lightCell,
                color: isWin ? '#fff' : cell === 'X' ? '#4f46e5' : '#ef4444',
                border: `2px solid ${isWin ? accentColor : 'transparent'}`,
              }}
            >
              {cell}
            </button>
          );
        })}
      </div>

      {/* CPU difficulty picker (creator, waiting, no opponent yet) */}
      {isP1 && status === 'waiting' && !gameData?.player2 && !isCpu && (
        pendingCpu ? (
          <div className="flex gap-2 flex-wrap justify-center">
            {['easy','medium','hard'].map(d => (
              <button
                key={d}
                onClick={() => handleSetCpu(d)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                style={{ background: accentColor }}
              >
                {DIFF_LABELS[d]}
              </button>
            ))}
            <button onClick={() => setPendingCpu(null)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setPendingCpu(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
          >
            🤖 Play vs CPU
          </button>
        )
      )}

      {/* Rematch */}
      {isFinished && (isP1 || isP2) && (
        <button
          onClick={handleRematch}
          className="mt-1 px-6 py-2 rounded-xl text-sm font-bold text-white"
          style={{ background: accentColor }}
        >
          🔁 Rematch
        </button>
      )}
    </div>
  );
}
