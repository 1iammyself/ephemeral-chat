import React, { useState, useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import socketManager from '../socket';
import { getAllMoves, getJumps, applyMove, checkWinner, getCpuMove, initBoard } from './games/CheckersEngine';
import { getVibeById } from '../utils/vibes';

const INITIAL_PIECES = 12;

const VARIANT_LABEL = { american: 'American', russian: 'Russian', brazilian: 'Brazilian' };

export default function CheckersPanel({ message, currentUser, roomVibe }) {
  const [board, setBoard]     = useState(() => initBoard());
  const [turn, setTurn]       = useState(1);
  const [selected, setSelected] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [status, setStatus]   = useState('waiting');
  const [scores, setScores]   = useState({ 1: 0, 2: 0 });
  const [pendingCpu, setPendingCpu] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [myTurnFlash, setMyTurnFlash] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectSecondsLeft, setDisconnectSecondsLeft] = useState(null);
  const [midJump, setMidJump] = useState(false);
  const [midJumpPiece, setMidJumpPiece] = useState(null);
  const [noProgressMoves, setNoProgressMoves] = useState(0);
  const cpuRef = useRef(false);
  const disconnectTimerRef = useRef(null);

  const messageId    = message?.id;
  const gameData     = message?.gameData;
  const vibe         = getVibeById(roomVibe);
  const userId       = currentUser?.id || currentUser?.socketId;
  const nickname     = currentUser?.nickname;
  const variant      = gameData?.variant || 'american';

  const isP1 = gameData?.player1?.id === userId || (nickname && gameData?.player1?.name === nickname);
  const isP2 = gameData?.player2?.id === userId || (nickname && gameData?.player2?.name === nickname);
  const isCpu = !!gameData?.cpu?.enabled;
  const cpuDifficulty = gameData?.cpu?.difficulty || 'medium';
  const myPiece = isP1 ? 1 : isP2 ? 2 : null;
  const isMyTurn = myPiece === turn || (isP1 && isCpu && turn === 2);
  const isFinished = status === 'finished';
  const cpuThinking = isCpu && turn === 2 && status === 'playing' && !isFinished;

  const cells = board.flat().filter(Boolean);
  const p1Count = cells.filter(c => c.p===1).length;
  const p2Count = cells.filter(c => c.p===2).length;
  const p1Kings = cells.filter(c => c.p===1 && c.k).length;
  const p2Kings = cells.filter(c => c.p===2 && c.k).length;
  const p1Captured = INITIAL_PIECES - p1Count;
  const p2Captured = INITIAL_PIECES - p2Count;

  useEffect(() => {
    if (!gameData) return;
    setBoard(gameData.board || initBoard());
    setTurn(gameData.turn || 1);
    setStatus(gameData.status || 'waiting');
    setScores(gameData.scores || { 1: 0, 2: 0 });
    setSelected(null); setValidMoves([]);
    setMidJump(false); setMidJumpPiece(null);
    setNoProgressMoves(0);
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
      setDisconnectSecondsLeft(prev => (prev==null||prev<=0) ? 0 : prev-1);
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

    // 40-move no-progress tracking
    const isProgress = isCapture || !movingPiece?.k;
    setNoProgressMoves(prev => isProgress ? 0 : prev + 1);

    setBoard(next); setSelected(null); setValidMoves([]);
    const winner = checkWinner(next);
    if (winner) {
      setStatus('finished'); setMidJump(false); setMidJumpPiece(null);
      return { board: next, finished: true };
    }

    // Russian variant: promotion mid-sequence allows continuation as king
    const promotionEndsJump = variant !== 'russian';

    if (isCapture && !(justBecameKing && promotionEndsJump)) {
      const continuationJumps = getJumps(next, tr, tc, variant);
      if (continuationJumps.length > 0) {
        setMidJump(true); setMidJumpPiece([tr, tc]);
        setSelected([tr, tc]); setValidMoves(continuationJumps);
        return { board: next, finished: false, midJump: true };
      }
    }

    setMidJump(false); setMidJumpPiece(null);
    setTurn(currentTurn === 1 ? 2 : 1);
    return { board: next, finished: false };
  };

  // CPU move (handles mid-jump continuation)
  useEffect(() => {
    if (!isCpu || !isP1 || turn !== 2 || status !== 'playing' || cpuRef.current) return;
    cpuRef.current = true;
    const snapshot = board.map(row => row.map(c => c ? {...c} : null));

    if (midJump && midJumpPiece) {
      const [pr, pc] = midJumpPiece;
      const jumps = getJumps(snapshot, pr, pc, variant);
      if (jumps.length > 0) {
        const mv = jumps[Math.floor(Math.random() * jumps.length)];
        const tid = setTimeout(() => {
          applyLocalMove(snapshot, mv, 2);
          socketManager.emit('checkers-move', { messageId, move: mv });
          cpuRef.current = false;
        }, 350);
        return () => { clearTimeout(tid); cpuRef.current = false; };
      }
      setMidJump(false); setMidJumpPiece(null); setTurn(1);
      cpuRef.current = false; return;
    }

    const tid = setTimeout(() => {
      const mv = getCpuMove(snapshot, cpuDifficulty, 2, variant);
      if (mv) { applyLocalMove(snapshot, mv, 2); socketManager.emit('checkers-move', { messageId, move: mv }); }
      cpuRef.current = false;
    }, 600);
    return () => { clearTimeout(tid); cpuRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, status, isCpu, isP1, messageId, cpuDifficulty, midJump, midJumpPiece, variant]);

  useEffect(() => {
    if (!messageId) return;
    const onMove = ({ messageId: mid, board: b, turn: t, status: st, scores: s }) => {
      if (mid !== messageId) return;
      setBoard(b || initBoard()); setTurn(t||1);
      if (st) setStatus(st); if (s) setScores(s);
      setSelected(null); setValidMoves([]);
      setMidJump(false); setMidJumpPiece(null);
    };
    const onDC = ({ messageId: mid }) => { if (mid!==messageId) return; setOpponentDisconnected(true); setDisconnectSecondsLeft(60); };
    const onRC = ({ messageId: mid }) => { if (mid!==messageId) return; setOpponentDisconnected(false); setDisconnectSecondsLeft(null); };
    socketManager.on('checkers-move-made', onMove);
    socketManager.on('checkers-opponent-disconnected', onDC);
    socketManager.on('checkers-opponent-reconnected', onRC);
    return () => {
      socketManager.off('checkers-move-made', onMove);
      socketManager.off('checkers-opponent-disconnected', onDC);
      socketManager.off('checkers-opponent-reconnected', onRC);
    };
  }, [messageId]);

  const handleSquareClick = (visualR, visualC) => {
    const r = flipped ? 7 - visualR : visualR;
    const c = flipped ? 7 - visualC : visualC;
    if (!isMyTurn || status !== 'playing') return;
    if (isCpu && turn === 2) return;

    if (midJump && midJumpPiece) {
      if (r === midJumpPiece[0] && c === midJumpPiece[1]) return;
      const mv = validMoves.find(m => m.to[0]===r && m.to[1]===c);
      if (mv) { applyLocalMove(board, mv, turn); socketManager.emit('checkers-move', { messageId, move: mv }); }
      return;
    }

    const cell = board[r][c];
    if (cell && cell.p === turn) {
      const allMoves = getAllMoves(board, turn, variant);
      const hasJumps = allMoves.some(m => m.captured);
      const pieceMoves = allMoves.filter(m => {
        const [fr,fc] = m.from;
        return fr===r && fc===c && (!hasJumps || m.captured);
      });
      setSelected([r,c]); setValidMoves(pieceMoves); return;
    }
    if (selected) {
      const mv = validMoves.find(m => m.to[0]===r && m.to[1]===c);
      if (mv) { applyLocalMove(board, mv, turn); socketManager.emit('checkers-move', { messageId, move: mv }); }
      else { setSelected(null); setValidMoves([]); }
    }
  };

  const handleSetCpu = (diff) => { socketManager.emit('checkers-set-cpu', { messageId, difficulty: diff }); setPendingCpu(false); };
  const handleRematch = () => socketManager.emit('checkers-rematch', { messageId });

  const darkSq = vibe?.boardColors?.dark || '#92400e';
  const lightSq = vibe?.boardColors?.light || '#fef3c7';
  const accentColor = vibe?.colors?.primary || '#6366f1';
  const validToSet = new Set(validMoves.map(m => `${m.to[0]},${m.to[1]}`));

  const statusText = opponentDisconnected
    ? `⚠️ Disconnected — forfeit in ${disconnectSecondsLeft??60}s`
    : status==='waiting' ? 'Waiting for opponent…'
    : isFinished ? `🏆 ${gameData?.winner?.name ?? 'Winner'} wins!`
    : midJump ? '⚡ Continue your jump!'
    : cpuThinking ? `🤖 CPU (${cpuDifficulty}) thinking…`
    : myTurnFlash ? '✓ Your turn'
    : isMyTurn && !(isCpu&&turn===2) ? 'Your turn'
    : `${turn===1 ? gameData?.player1?.name : (isCpu?`CPU (${cpuDifficulty})`:gameData?.player2?.name) ?? '?'}'s turn`;

  const statusBg = opponentDisconnected
    ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300'
    : isFinished ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
    : midJump ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
    : cpuThinking ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300'
    : myTurnFlash ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
    : 'bg-gray-50 dark:bg-gray-800/40 text-gray-500 dark:text-gray-400';

  const displayBoard = flipped ? [...board].reverse().map(row => [...row].reverse()) : board;

  return (
    <div className="flex flex-col items-center p-3 h-full gap-3 overflow-y-auto">

      {/* Variant badge */}
      {variant !== 'american' && (
        <span className="text-[9px] font-black uppercase tracking-widest bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
          {VARIANT_LABEL[variant]} rules
        </span>
      )}

      {/* Scores + piece counts */}
      <div className="flex gap-4 text-sm font-semibold items-start">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-gray-700 dark:text-gray-300">⚪ {scores[1]}</span>
          <span className="text-[9px] text-gray-500">{p1Count} left{p1Kings>0?` · ♛×${p1Kings}`:''}</span>
          {p1Captured>0 && <span className="text-[9px] text-red-400">{p1Captured} captured</span>}
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-gray-700 dark:text-gray-300">⚫ {scores[2]}</span>
          <span className="text-[9px] text-gray-500">{p2Count} left{p2Kings>0?` · ♛×${p2Kings}`:''}</span>
          {p2Captured>0 && <span className="text-[9px] text-red-400">{p2Captured} captured</span>}
        </div>
      </div>

      <div className={`w-full max-w-[352px] text-center text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors ${statusBg}`}>{statusText}</div>

      {/* 40-move draw counter */}
      {status==='playing' && noProgressMoves>=20 && (
        <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${noProgressMoves>=40?'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400':'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'}`}>
          {noProgressMoves} / 40 moves without progress{noProgressMoves>=40?' — Draw can be claimed':''}
        </div>
      )}

      {/* Board */}
      <div className="w-full max-w-[352px] rounded-xl overflow-hidden border-2 border-black/20" style={{ background: darkSq }}>
        {displayBoard.map((row, visualR) => (
          <div key={visualR} className="grid grid-cols-8">
            {row.map((cell, visualC) => {
              const logicalR = flipped ? 7-visualR : visualR;
              const logicalC = flipped ? 7-visualC : visualC;
              const isDark = (logicalR+logicalC)%2===1;
              const isSelected = selected && selected[0]===logicalR && selected[1]===logicalC;
              const isMJP = midJumpPiece && midJumpPiece[0]===logicalR && midJumpPiece[1]===logicalC;
              const isTarget = validToSet.has(`${logicalR},${logicalC}`);
              return (
                <div key={visualC}
                  onClick={() => isDark && handleSquareClick(visualR, visualC)}
                  className={`aspect-square flex items-center justify-center transition-all relative ${isDark&&isMyTurn&&status==='playing'&&!(isCpu&&turn===2)?'cursor-pointer':''}`}
                  style={{ background: isMJP?'#3b82f622':isSelected?accentColor+'66':isDark?darkSq:lightSq }}>
                  {isTarget && !cell && (
                    <div className="w-1/3 h-1/3 rounded-full opacity-50" style={{ background: accentColor }} />
                  )}
                  {isTarget && midJump && !cell && (
                    <div className="absolute inset-0.5 rounded-sm border border-blue-400/60 animate-pulse pointer-events-none" />
                  )}
                  {cell && isDark && (
                    <div className={`rounded-full flex items-center justify-center transition-transform ${isSelected||isMJP?'scale-110':''} ${isTarget?'ring-1 ring-yellow-400':''}`}
                      style={{
                        width:'78%', height:'78%',
                        background: cell.p===1 ? '#f1f5f9' : '#1e293b',
                        boxShadow: isMJP ? '0 0 0 3px rgba(59,130,246,0.7)' : cell.p===1 ? '0 2px 4px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.5)',
                        border: cell.k ? '2px solid #facc15' : `2px solid ${cell.p===1?'#cbd5e1':'#475569'}`,
                        fontSize:'55%',
                      }}>
                      {cell.k && '♛'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-2 items-center flex-wrap justify-center">
        <button onClick={() => setFlipped(f=>!f)}
          className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:opacity-80 transition-opacity" title="Flip board">
          <RotateCcw className="w-4 h-4" />
        </button>
        {isP1 && status==='waiting' && !gameData?.player2 && !isCpu && (
          pendingCpu ? (
            <div className="flex gap-2">
              {['easy','medium','hard'].map(d => (
                <button key={d} onClick={() => handleSetCpu(d)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white capitalize" style={{ background: accentColor }}>{d}</button>
              ))}
              <button onClick={() => setPendingCpu(false)} className="px-2 py-1.5 rounded-lg text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">✕</button>
            </div>
          ) : (
            <button onClick={() => setPendingCpu(true)} className="px-4 py-1.5 rounded-xl text-xs font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
              🤖 vs CPU
            </button>
          )
        )}
      </div>

      {/* Variant key for Russian/Brazilian */}
      {variant !== 'american' && (
        <div className="text-[9px] text-gray-400 text-center leading-relaxed max-w-[320px]">
          {variant==='russian' && '👑 Flying kings · Men capture backward · Promotion continues mid-jump'}
          {variant==='brazilian' && '👑 Flying kings · Men capture backward · Must maximize captures'}
        </div>
      )}

      {isFinished && (isP1||isP2) && (
        <button onClick={handleRematch} className="px-6 py-2 rounded-xl text-sm font-bold text-white" style={{ background: accentColor }}>🔁 Rematch</button>
      )}
    </div>
  );
}
