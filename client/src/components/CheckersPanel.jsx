import React, { useState, useEffect, useRef } from 'react';
import socketManager from '../socket';
import { getAllMoves, applyMove, checkWinner, getCpuMove, initBoard } from './games/CheckersEngine';
import { getVibeById } from '../utils/vibes';

export default function CheckersPanel({ message, currentUser, roomVibe }) {
  const [board, setBoard] = useState(initBoard);
  const [turn, setTurn] = useState(1);
  const [selected, setSelected] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [status, setStatus] = useState('waiting');
  const [scores, setScores] = useState({ 1: 0, 2: 0 });
  const [pendingCpu, setPendingCpu] = useState(false);
  const cpuRef = useRef(false);

  const messageId = message?.id;
  const gameData = message?.gameData;
  const vibe = getVibeById(roomVibe);
  const userId = currentUser?.id || currentUser?.socketId;
  const nickname = currentUser?.nickname;

  const isP1 = gameData?.player1?.id === userId || (nickname && gameData?.player1?.name === nickname);
  const isP2 = gameData?.player2?.id === userId || (nickname && gameData?.player2?.name === nickname);
  const isCpu = !!gameData?.cpu?.enabled;
  const cpuDifficulty = gameData?.cpu?.difficulty || 'medium';
  const myPiece = isP1 ? 1 : isP2 ? 2 : null;
  const isMyTurn = myPiece === turn || (isP1 && isCpu && turn === 2);
  const isFinished = status === 'finished';

  useEffect(() => {
    if (!gameData) return;
    setBoard(gameData.board || initBoard());
    setTurn(gameData.turn || 1);
    setStatus(gameData.status || 'waiting');
    setScores(gameData.scores || { 1: 0, 2: 0 });
    setSelected(null);
    setValidMoves([]);
  }, [gameData]);

  // Apply a move locally and update state
  const applyLocalMove = (currentBoard, move, currentTurn) => {
    const next = applyMove(currentBoard, move);
    const winner = checkWinner(next);
    setBoard(next);
    setSelected(null);
    setValidMoves([]);
    if (winner) {
      setStatus('finished');
    } else {
      setTurn(currentTurn === 1 ? 2 : 1);
    }
    return { board: next, finished: !!winner };
  };

  // CPU move — fully local, syncs to server
  useEffect(() => {
    if (!isCpu || !isP1 || turn !== 2 || status !== 'playing' || cpuRef.current) return;
    cpuRef.current = true;
    const snapshot = board.map(row => row.map(c => c ? { ...c } : null));
    const diff = cpuDifficulty;
    const tid = setTimeout(() => {
      const move = getCpuMove(snapshot, diff, 2);
      if (move) {
        applyLocalMove(snapshot, move, 2);
        socketManager.emit('checkers-move', { messageId, move });
      }
      cpuRef.current = false;
    }, 600);
    return () => { clearTimeout(tid); cpuRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, status, isCpu, isP1, messageId, cpuDifficulty]);

  useEffect(() => {
    if (!messageId) return;
    const onMove = ({ messageId: mid, board: b, turn: t, status: st, scores: s }) => {
      if (mid !== messageId) return;
      setBoard(b || initBoard());
      setTurn(t || 1);
      if (st) setStatus(st);
      if (s) setScores(s);
      setSelected(null);
      setValidMoves([]);
    };
    socketManager.on('checkers-move-made', onMove);
    return () => socketManager.off('checkers-move-made', onMove);
  }, [messageId]);

  const handleSquareClick = (r, c) => {
    if (!isMyTurn || status !== 'playing') return;
    if (isCpu && turn === 2) return;

    const cell = board[r][c];
    if (cell && cell.p === turn) {
      const allMoves = getAllMoves(board, turn);
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
      const move = validMoves.find(m => m.to[0] === r && m.to[1] === c);
      if (move) {
        applyLocalMove(board, move, turn);
        socketManager.emit('checkers-move', { messageId, move });
      } else {
        setSelected(null);
        setValidMoves([]);
      }
    }
  };

  const handleSetCpu = (diff) => {
    socketManager.emit('checkers-set-cpu', { messageId, difficulty: diff });
    setPendingCpu(false);
  };
  const handleRematch = () => socketManager.emit('checkers-rematch', { messageId });

  const darkSq = vibe?.boardColors?.dark || '#92400e';
  const lightSq = vibe?.boardColors?.light || '#fef3c7';
  const accentColor = vibe?.colors?.primary || '#6366f1';

  const validToSet = new Set(validMoves.map(m => `${m.to[0]},${m.to[1]}`));
  const currentTurnName = turn === 1 ? gameData?.player1?.name : (isCpu ? `CPU (${cpuDifficulty})` : gameData?.player2?.name);

  return (
    <div className="flex flex-col items-center p-3 h-full gap-3 overflow-y-auto">
      <div className="flex gap-4 text-sm font-semibold">
        <span className="text-gray-700 dark:text-gray-300">⚪ {scores[1]}</span>
        <span className="text-gray-700 dark:text-gray-300">⚫ {scores[2]}</span>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 h-5 text-center">
        {status === 'waiting' ? 'Waiting for opponent…' :
          isFinished ? `🏆 ${gameData?.winner?.name ?? 'Winner'} wins!` :
          isMyTurn && !(isCpu && turn === 2) ? 'Your turn' : `${currentTurnName} is thinking…`}
      </p>

      <div className="w-full max-w-[352px] rounded-xl overflow-hidden border-2 border-black/20" style={{ background: darkSq }}>
        {board.map((row, r) => (
          <div key={r} className="grid grid-cols-8">
            {row.map((cell, c) => {
              const isDark = (r + c) % 2 === 1;
              const isSelected = selected && selected[0] === r && selected[1] === c;
              const isTarget = validToSet.has(`${r},${c}`);
              return (
                <div
                  key={c}
                  onClick={() => isDark && handleSquareClick(r, c)}
                  className={`aspect-square flex items-center justify-center transition-all relative ${isDark && isMyTurn && status === 'playing' && !(isCpu && turn === 2) ? 'cursor-pointer' : ''}`}
                  style={{ background: isSelected ? accentColor + '66' : isDark ? darkSq : lightSq }}
                >
                  {isTarget && !cell && (
                    <div className="w-1/3 h-1/3 rounded-full opacity-50" style={{ background: accentColor }} />
                  )}
                  {cell && isDark && (
                    <div
                      className={`rounded-full flex items-center justify-center transition-transform ${isSelected ? 'scale-110' : ''} ${isTarget ? 'ring-1 ring-yellow-400' : ''}`}
                      style={{
                        width: '78%', height: '78%',
                        background: cell.p === 1 ? '#f1f5f9' : '#1e293b',
                        boxShadow: cell.p === 1 ? '0 2px 4px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.5)',
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
