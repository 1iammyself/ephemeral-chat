import React, { useState, useEffect, useRef } from 'react';
import { Lightbulb } from 'lucide-react';
import socketManager from '../socket';
import {
  getCpuMove, checkWinner, getHintMove,
  createUltimateState, applyUltimateMove, isValidUltimateMove, getUltimateCpuMove,
} from './games/TicTacToeEngine';
import { getVibeById } from '../utils/vibes';

const EMPTY_BOARD = Array(9).fill(null);
const TTT_WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

// ── Standard TicTacToe ────────────────────────────────────────────────────

function StandardTTT({ message, currentUser, roomVibe }) {
  const [board, setBoard]   = useState(EMPTY_BOARD);
  const [turn, setTurn]     = useState('X');
  const [winLine, setWinLine] = useState(null);
  const [status, setStatus] = useState('waiting');
  const [scores, setScores] = useState({ X: 0, O: 0, draw: 0 });
  const [pendingCpu, setPendingCpu] = useState(false);
  const [myTurnFlash, setMyTurnFlash] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectSecondsLeft, setDisconnectSecondsLeft] = useState(null);
  const [hoverCell, setHoverCell] = useState(null);
  const [hintCell, setHintCell]   = useState(null);
  const hintTimerRef    = useRef(null);
  const cpuPendingRef   = useRef(false);
  const disconnectTimerRef = useRef(null);

  const messageId  = message?.id;
  const gameData   = message?.gameData;
  const vibe       = getVibeById(roomVibe);
  const userId     = currentUser?.id || currentUser?.socketId;
  const isCpu      = !!gameData?.cpu?.enabled;
  const cpuDiff    = gameData?.cpu?.difficulty || 'medium';
  const isP1       = gameData?.player1?.id === userId || (currentUser?.nickname && gameData?.player1?.name === currentUser?.nickname);
  const isP2       = gameData?.player2?.id === userId || (currentUser?.nickname && gameData?.player2?.name === currentUser?.nickname);
  const isMyTurn   = (isP1 && turn === 'X') || (isP2 && turn === 'O') || (isP1 && isCpu && turn === 'O');
  const isFinished = status === 'finished';
  const cpuThinking = isCpu && turn === 'O' && status === 'playing' && !winLine && !isFinished;
  const moveCount  = board.filter(Boolean).length;

  useEffect(() => {
    if (!gameData) return;
    setBoard(gameData.board || EMPTY_BOARD);
    setTurn(gameData.turn || 'X');
    setWinLine(gameData.winLine || null);
    setStatus(gameData.status || 'waiting');
    setScores(gameData.scores || { X: 0, O: 0, draw: 0 });
  }, [gameData]);

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

  const applyLocalMove = (currentBoard, index, player) => {
    const next = [...currentBoard]; next[index] = player;
    const result = checkWinner(next);
    setBoard(next);
    setWinLine(result ? (result.winner === 'draw' ? [] : result.line) : null);
    setStatus(result ? 'finished' : 'playing');
    if (!result) setTurn(player === 'X' ? 'O' : 'X');
    return { finished: !!result };
  };

  useEffect(() => {
    if (!isCpu || !isP1 || turn !== 'O' || status !== 'playing' || winLine || cpuPendingRef.current) return;
    cpuPendingRef.current = true;
    const snapshot = [...board], diff = cpuDiff;
    const tid = setTimeout(() => {
      const mv = getCpuMove(snapshot, diff);
      if (mv >= 0) { applyLocalMove(snapshot, mv, 'O'); socketManager.emit('ttt-move', { messageId, index: mv }); }
      cpuPendingRef.current = false;
    }, 500);
    return () => { clearTimeout(tid); cpuPendingRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, status, winLine, isCpu, isP1, messageId, cpuDiff]);

  useEffect(() => {
    if (!messageId) return;
    const onMove = ({ messageId: mid, board: b, turn: t, winLine: wl, scores: s, status: st }) => {
      if (mid !== messageId) return;
      setBoard(b || EMPTY_BOARD); setTurn(t || 'X'); setWinLine(wl || null);
      if (s) setScores(s); if (st) setStatus(st);
    };
    const onDC  = ({ messageId: mid }) => { if (mid !== messageId) return; setOpponentDisconnected(true); setDisconnectSecondsLeft(60); };
    const onRC  = ({ messageId: mid }) => { if (mid !== messageId) return; setOpponentDisconnected(false); setDisconnectSecondsLeft(null); };
    socketManager.on('ttt-move-made', onMove);
    socketManager.on('ttt-opponent-disconnected', onDC);
    socketManager.on('ttt-opponent-reconnected', onRC);
    return () => {
      socketManager.off('ttt-move-made', onMove);
      socketManager.off('ttt-opponent-disconnected', onDC);
      socketManager.off('ttt-opponent-reconnected', onRC);
    };
  }, [messageId]);

  const handleCell = (i) => {
    if (!isMyTurn || board[i] || winLine || status !== 'playing') return;
    if (isCpu && turn === 'O') return;
    setHintCell(null); clearTimeout(hintTimerRef.current);
    applyLocalMove(board, i, turn);
    socketManager.emit('ttt-move', { messageId, index: i });
  };

  const handleHint = () => {
    if (!isMyTurn || winLine || status !== 'playing' || (isCpu && turn === 'O')) return;
    const best = getHintMove(board); if (best < 0) return;
    setHintCell(best); clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHintCell(null), 2000);
  };

  const handleRematch = () => socketManager.emit('ttt-rematch', { messageId });
  const handleSetCpu  = (d) => { socketManager.emit('ttt-set-cpu', { messageId, difficulty: d }); setPendingCpu(false); };

  const accentColor = vibe?.colors?.primary || '#6366f1';
  const lightCell   = vibe?.boardColors?.light || '#e0e7ff';
  const winner      = checkWinner(board);
  const curName     = turn === 'X' ? gameData?.player1?.name : (isCpu ? `CPU (${cpuDiff})` : gameData?.player2?.name);

  const statusText = opponentDisconnected
    ? `⚠️ Opponent disconnected — forfeit in ${disconnectSecondsLeft ?? 60}s`
    : status === 'waiting' ? 'Waiting for opponent…'
    : isFinished ? (winner?.winner === 'draw' ? '🤝 Draw!' : `🏆 ${winner?.winner === 'X' ? (gameData?.player1?.name ?? 'X') : (isCpu ? `CPU (${cpuDiff})` : (gameData?.player2?.name ?? 'O'))} wins!`)
    : cpuThinking ? `🤖 CPU (${cpuDiff}) thinking…`
    : myTurnFlash ? '✓ Your turn'
    : `${curName ?? '?'}'s turn`;

  const statusBg = opponentDisconnected ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300'
    : isFinished ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
    : cpuThinking ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300'
    : myTurnFlash ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
    : 'bg-gray-50 dark:bg-gray-800/40 text-gray-500 dark:text-gray-400';

  return (
    <div className="flex flex-col items-center p-4 h-full gap-3 overflow-y-auto">
      <div className="flex gap-6 text-sm font-semibold">
        <span className="text-indigo-500 dark:text-indigo-400">✕ {scores.X}</span>
        <span className="text-gray-400">{scores.draw ?? 0} draw</span>
        <span className="text-red-500 dark:text-red-400">○ {scores.O}</span>
      </div>
      <div className={`w-full max-w-[288px] text-center text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors ${statusBg}`}>{statusText}</div>
      {status === 'playing' && <p className="text-[10px] text-gray-400 tabular-nums -mt-1">Move {moveCount} / 9</p>}

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 rounded-2xl w-full max-w-[288px]" style={{ background: lightCell + '66' }}>
        {board.map((cell, i) => {
          const isWin   = winLine?.includes(i);
          const canClick = isMyTurn && !cell && !winLine && status === 'playing' && !(isCpu && turn === 'O');
          const isHint  = hintCell === i && !cell;
          const isHover = hoverCell === i && !cell && canClick;
          return (
            <button key={i} onClick={() => handleCell(i)}
              onMouseEnter={() => canClick && setHoverCell(i)}
              onMouseLeave={() => setHoverCell(null)}
              disabled={!canClick}
              className={`aspect-square w-full rounded-xl text-3xl sm:text-4xl font-black transition-all duration-150
                ${canClick ? 'hover:scale-105 active:scale-95 cursor-pointer' : 'cursor-default'}
                ${isWin ? 'scale-105 shadow-xl' : ''}
                ${isHint ? 'ring-2 ring-yellow-400 ring-offset-1 animate-pulse' : ''}`}
              style={{
                background: isWin ? accentColor : cell ? (cell==='X'?'#e0e7ff':'#fee2e2') : lightCell,
                color: isWin ? '#fff' : cell==='X' ? '#4f46e5' : '#ef4444',
                border: `2px solid ${isWin ? accentColor : isHint ? '#facc15' : 'transparent'}`,
              }}>
              {cell || (isHint
                ? <span style={{ color:'#facc15', opacity:0.9 }}>{turn==='X'?'✕':'○'}</span>
                : isHover
                ? <span style={{ color:turn==='X'?'#4f46e5':'#ef4444', opacity:0.3 }}>{turn==='X'?'✕':'○'}</span>
                : '')}
            </button>
          );
        })}
      </div>

      {isMyTurn && !winLine && status === 'playing' && !(isCpu && turn === 'O') && (
        <button onClick={handleHint} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 hover:opacity-80 transition-opacity">
          <Lightbulb className="w-3.5 h-3.5" /> Hint
        </button>
      )}

      {isP1 && status === 'waiting' && !gameData?.player2 && !isCpu && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-gray-400">Waiting for someone to join…</p>
          {pendingCpu ? (
            <div className="flex gap-2">
              {['easy','medium','hard'].map(d => (
                <button key={d} onClick={() => handleSetCpu(d)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white capitalize" style={{ background: accentColor }}>{d}</button>
              ))}
              <button onClick={() => setPendingCpu(false)} className="px-2 py-1.5 rounded-lg text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">✕</button>
            </div>
          ) : (
            <button onClick={() => setPendingCpu(true)} className="px-4 py-1.5 rounded-xl text-xs font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">🤖 Switch to vs CPU</button>
          )}
        </div>
      )}
      {isFinished && (isP1 || isP2) && (
        <button onClick={handleRematch} className="mt-1 px-6 py-2 rounded-xl text-sm font-bold text-white" style={{ background: accentColor }}>🔁 Rematch</button>
      )}
    </div>
  );
}

// ── Ultimate Tic-Tac-Toe ─────────────────────────────────────────────────

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

  // CPU move
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

  const handleNewGame = () => {
    setState(createUltimateState());
  };

  const isMiniActive = (miniIdx) => {
    if (state.won[miniIdx]) return false;
    return state.activeMini === null || state.activeMini === miniIdx;
  };

  const globalCells = state.won.map(w => w === 'draw' ? null : w);
  const globalLine  = state.globalLine || [];

  return (
    <div className="flex flex-col items-center p-3 h-full gap-3 overflow-y-auto">
      {/* Header */}
      <div className="flex gap-4 text-sm font-semibold items-center">
        <span className="text-indigo-500">✕ {scores.X}</span>
        <span className="text-gray-400 text-xs">ULTIMATE</span>
        <span className="text-red-500">○ {scores.O}</span>
      </div>

      {/* Status */}
      <div className={`w-full max-w-xs text-center text-xs font-semibold py-1.5 px-3 rounded-lg ${
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

      {/* 3×3 global grid of mini-boards */}
      <div className="grid grid-cols-3 gap-1.5 w-full max-w-[340px]">
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
