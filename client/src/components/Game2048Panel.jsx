import React, { useState, useEffect, useCallback, useRef } from 'react';
import socketManager from '../socket';
import { createBoard, move, addTile, getBestTile, isGameOver, TILE_COLORS } from './games/Game2048Engine';
import { getVibeById } from '../utils/vibes';

const DURATION_MS = 180000; // 3 min

export default function Game2048Panel({ message, currentUser, roomVibe }) {
  const [board, setBoard] = useState(null);
  const [score, setScore] = useState(0);
  const [bestTile, setBestTile] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [scores, setScores] = useState({});
  const [bestTiles, setBestTiles] = useState({});
  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState('waiting');
  const [timeLeft, setTimeLeft] = useState(null);
  const seedRef = useRef(null);
  const timerRef = useRef(null);
  const moveCountRef = useRef(0);

  const messageId = message?.id;
  const gameData = message?.gameData;
  const vibe = getVibeById(roomVibe);
  const userId = currentUser?.id || currentUser?.socketId;
  const isSolo = gameData?.soloMode;
  const isHost = gameData?.hostId === userId;
  const isMember = gameData?.players?.some(p => p.id === userId);
  const isFinished = status === 'finished';

  useEffect(() => {
    if (!gameData) return;
    setPlayers(gameData.players || []);
    setScores(gameData.scores || {});
    setBestTiles(gameData.bestTiles || {});
    setStatus(gameData.status || 'waiting');
    if (gameData.status === 'playing' && !board && gameData.seed) {
      seedRef.current = gameData.seed;
      setBoard(createBoard(gameData.seed));
    }
    if (gameData.status === 'playing' && gameData.startedAt && !isSolo) {
      const elapsed = Date.now() - gameData.startedAt;
      setTimeLeft(Math.max(0, DURATION_MS - elapsed));
    }
  }, [gameData]);

  // Countdown timer
  useEffect(() => {
    if (status !== 'playing' || isSolo || !timeLeft) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1000) {
          clearInterval(timerRef.current);
          socketManager.emit('g2048-time-up', { messageId });
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [status, isSolo, messageId]);

  useEffect(() => {
    if (!messageId) return;
    const onScore = ({ messageId: mid, scores: s, bestTiles: bt }) => {
      if (mid !== messageId) return;
      setScores(s || {}); setBestTiles(bt || {});
    };
    const onFinish = ({ messageId: mid, scores: s, bestTiles: bt, winner }) => {
      if (mid !== messageId) return;
      setScores(s || {}); setBestTiles(bt || {});
      setStatus('finished');
    };
    socketManager.on('g2048-scores-update', onScore);
    socketManager.on('g2048-game-over', onFinish);
    return () => {
      socketManager.off('g2048-scores-update', onScore);
      socketManager.off('g2048-game-over', onFinish);
    };
  }, [messageId]);

  const handleMove = useCallback((dir) => {
    if (!board || gameOver || !isMember || status !== 'playing') return;
    const result = move(board, dir);
    if (!result.changed) return;
    const newTileCount = moveCountRef.current++;
    const newBoard = addTile(result.board, (seedRef.current || 0) + newTileCount * 37 + Date.now() % 1000);
    const newScore = score + result.score;
    const newBest = getBestTile(newBoard);
    setBoard(newBoard);
    setScore(newScore);
    setBestTile(newBest);
    if (isGameOver(newBoard)) setGameOver(true);
    if (newBest >= 2048 && !won) setWon(true);
    // Throttled sync every 5 moves or on milestone
    if (newTileCount % 5 === 0 || newBest > bestTile) {
      socketManager.emit('g2048-score-update', { messageId, score: newScore, bestTile: newBest });
    }
  }, [board, gameOver, isMember, status, score, bestTile, won, messageId]);

  // Keyboard controls
  useEffect(() => {
    const keyMap = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', w:'up', s:'down', a:'left', d:'right' };
    const onKey = (e) => { const dir = keyMap[e.key]; if (dir) { e.preventDefault(); handleMove(dir); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleMove]);

  // Swipe
  useEffect(() => {
    let sx, sy;
    const onStart = (e) => { sx = e.touches?.[0]?.clientX; sy = e.touches?.[0]?.clientY; };
    const onEnd = (e) => {
      if (!sx || !sy) return;
      const dx = e.changedTouches?.[0]?.clientX - sx;
      const dy = e.changedTouches?.[0]?.clientY - sy;
      if (Math.abs(dx) > Math.abs(dy) + 10) handleMove(dx > 0 ? 'right' : 'left');
      else if (Math.abs(dy) > Math.abs(dx) + 10) handleMove(dy > 0 ? 'down' : 'up');
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchend', onEnd); };
  }, [handleMove]);

  const handleStart = () => socketManager.emit('g2048-start', { messageId });
  const handleNewGame = () => {
    const newSeed = Date.now();
    seedRef.current = newSeed;
    moveCountRef.current = 0;
    setBoard(createBoard(newSeed));
    setScore(0); setBestTile(0); setGameOver(false); setWon(false);
  };

  const accentColor = vibe?.colors?.primary || '#6366f1';
  const boardBg = '#bbada0';
  const sortedPlayers = [...players].sort((a,b) => (scores[b.id]||0) - (scores[a.id]||0));
  const mins = Math.floor((timeLeft || 0) / 60000);
  const secs = Math.floor(((timeLeft || 0) % 60000) / 1000);

  return (
    <div className="flex flex-col items-center p-3 h-full gap-2 overflow-y-auto">
      {/* Header stats */}
      <div className="flex items-center gap-4 text-sm font-semibold">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-gray-400">Score</p>
          <p className="font-black text-gray-800 dark:text-gray-200">{score}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-gray-400">Best</p>
          <p className="font-black" style={{ color: accentColor }}>{bestTile || '—'}</p>
        </div>
        {!isSolo && timeLeft !== null && (
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-widest text-gray-400">Time</p>
            <p className={`font-black tabular-nums ${timeLeft < 30000 ? 'text-red-500' : 'text-gray-800 dark:text-gray-200'}`}>
              {mins}:{String(secs).padStart(2,'0')}
            </p>
          </div>
        )}
      </div>

      {/* Board */}
      {board ? (
        <div className="relative rounded-xl p-1.5 w-full max-w-[280px]" style={{ background: boardBg }}>
          {(won && !gameOver) && (
            <div className="absolute inset-0 flex items-center justify-center bg-yellow-400/80 rounded-xl z-10">
              <div className="text-center">
                <p className="text-2xl font-black">🎉 2048!</p>
                <button onClick={() => setWon(false)} className="mt-1 text-sm underline">Keep going</button>
              </div>
            </div>
          )}
          {gameOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/70 rounded-xl z-10">
              <div className="text-center text-white">
                <p className="text-xl font-black">Game Over</p>
                {isSolo && (
                  <button onClick={handleNewGame} className="mt-2 px-4 py-1.5 rounded-lg text-sm font-bold text-white" style={{ background: accentColor }}>
                    New Game
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="grid grid-cols-4 gap-1.5">
            {board.flat().map((val, i) => {
              const colors = TILE_COLORS[val] || TILE_COLORS[2048];
              return (
                <div
                  key={i}
                  className="aspect-square rounded-md flex items-center justify-center font-black transition-all text-sm sm:text-base"
                  style={{
                    background: val ? colors.bg : '#cdc1b4',
                    color: colors.text || '#776e65',
                    fontSize: val > 999 ? '0.65rem' : val > 99 ? '0.8rem' : '1rem',
                  }}
                >
                  {val || ''}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-6 w-full max-w-[280px]">
          {status === 'waiting' && isHost && (
            <>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300">2048 — How do you want to play?</p>
              <div className="flex flex-col gap-2 w-full">
                <button onClick={() => { socketManager.emit('g2048-start', { messageId, soloMode: true }); }}
                  className="w-full py-3 rounded-xl text-white font-black text-sm" style={{ background: accentColor }}>
                  🎯 Solo — Play alone
                </button>
                <button onClick={handleStart}
                  className="w-full py-3 rounded-xl font-black text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                  🏁 Race — {players.length > 1 ? `${players.length} players` : 'wait for others to join'}
                </button>
              </div>
              {players.length > 1 && (
                <p className="text-xs text-gray-400">{players.map(p => p.name).join(', ')}</p>
              )}
            </>
          )}
          {status === 'waiting' && !isHost && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              Waiting for the host to start…
            </p>
          )}
        </div>
      )}

      {/* Leaderboard */}
      {players.length > 1 && (
        <div className="w-full max-w-xs">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 text-center mb-1">Leaderboard</p>
          {sortedPlayers.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between px-2 py-0.5">
              <div className="flex items-center gap-1.5">
                {i === 0 && isFinished && <span>🏆</span>}
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[100px]">{p.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {bestTiles[p.id] > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                    style={{ background: (TILE_COLORS[bestTiles[p.id]] || TILE_COLORS[2048]).bg, color: (TILE_COLORS[bestTiles[p.id]] || TILE_COLORS[2048]).text || '#776e65' }}>
                    {bestTiles[p.id]}
                  </span>
                )}
                <span className="text-xs font-black tabular-nums" style={{ color: accentColor }}>{scores[p.id] ?? 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
