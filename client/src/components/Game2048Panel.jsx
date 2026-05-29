import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Gamepad2, Trophy, Timer } from 'lucide-react';
import socketManager from '../socket';
import { createBoard, move, addTile, getBestTile, isGameOver, TILE_COLORS } from './games/Game2048Engine';
import { getVibeById } from '../utils/vibes';

const RACE_DURATION_MS = 180000; // 3 min

export default function Game2048Panel({ message, currentUser, roomVibe }) {
  const messageId = message?.id;
  const gameData  = message?.gameData;
  const vibe      = getVibeById(roomVibe);
  const userId    = currentUser?.id || currentUser?.socketId;
  const nickname  = currentUser?.nickname;
  const isSolo    = !!gameData?.soloMode;
  const isHost    = gameData?.hostId === userId;
  const isMember  = gameData?.players?.some(
    p => p.id === userId || (nickname && p.name === nickname)
  );

  // Solo: start immediately on mount; race: wait for server signal
  const shouldAutoStart = isSolo && isMember && gameData?.status !== 'finished';
  const initialSeed = gameData?.seed || Date.now();

  const seedRef      = useRef(initialSeed);
  const moveCountRef = useRef(0);
  const timerRef     = useRef(null);

  const [board,        setBoard]        = useState(shouldAutoStart ? createBoard(initialSeed) : null);
  const [score,        setScore]        = useState(0);
  const [bestTile,     setBestTile]     = useState(0);
  const [tileWon,      setTileWon]      = useState(false);
  const [boardOver,    setBoardOver]    = useState(false);
  const [gameKey,      setGameKey]      = useState(0);
  const [scores,       setScores]       = useState(gameData?.scores || {});
  const [bestTiles,    setBestTiles]    = useState(gameData?.bestTiles || {});
  const [players,      setPlayers]      = useState(gameData?.players || []);
  const [serverStatus, setServerStatus] = useState(gameData?.status || 'waiting');
  const [timeLeft,     setTimeLeft]     = useState(null);

  // Sync non-board fields from server
  useEffect(() => {
    if (!gameData) return;
    setPlayers(gameData.players || []);
    setScores(gameData.scores || {});
    setBestTiles(gameData.bestTiles || {});
    const s = gameData.status || 'waiting';
    setServerStatus(s);
    // Race: board from server seed when playing starts
    if (s === 'playing' && !board && !isSolo && gameData.seed) {
      seedRef.current = gameData.seed;
      moveCountRef.current = 0;
      setBoard(createBoard(gameData.seed));
      if (gameData.startedAt) {
        const elapsed = Date.now() - gameData.startedAt;
        setTimeLeft(Math.max(0, RACE_DURATION_MS - elapsed));
      }
    }
  }, [gameData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Solo: notify server on first open
  useEffect(() => {
    if (shouldAutoStart && gameData?.status === 'waiting') {
      socketManager.emit('g2048-start', { messageId, soloMode: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Score update socket listener
  useEffect(() => {
    if (!messageId) return;
    const onScore = ({ messageId: mid, scores: s, bestTiles: bt }) => {
      if (mid !== messageId) return;
      setScores(s || {});
      setBestTiles(bt || {});
    };
    const onFinish = ({ messageId: mid, scores: s, bestTiles: bt }) => {
      if (mid !== messageId) return;
      setScores(s || {});
      setBestTiles(bt || {});
      setServerStatus('finished');
      clearInterval(timerRef.current);
    };
    socketManager.on('g2048-scores-update', onScore);
    socketManager.on('g2048-game-over',     onFinish);
    return () => {
      socketManager.off('g2048-scores-update', onScore);
      socketManager.off('g2048-game-over',     onFinish);
    };
  }, [messageId]);

  // Race countdown timer
  useEffect(() => {
    if (serverStatus !== 'playing' || isSolo || timeLeft == null) return;
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
  }, [serverStatus, isSolo, messageId]); // eslint-disable-line

  // Move handler
  const handleMove = useCallback((dir) => {
    if (!board || boardOver || !isMember) return;
    if (!isSolo && serverStatus !== 'playing') return;
    const result = move(board, dir);
    if (!result.changed) return;

    const count    = moveCountRef.current++;
    const newBoard = addTile(
      result.board,
      (seedRef.current || 0) + count * 37 + Date.now() % 1000
    );
    const newScore = score + result.score;
    const newBest  = getBestTile(newBoard);

    setBoard(newBoard);
    setScore(newScore);
    setBestTile(newBest);
    if (isGameOver(newBoard)) setBoardOver(true);
    if (newBest >= 2048 && !tileWon) setTileWon(true);

    if (count % 5 === 0 || newBest > bestTile) {
      socketManager.emit('g2048-score-update', { messageId, score: newScore, bestTile: newBest });
    }
  }, [board, boardOver, isMember, isSolo, serverStatus, score, bestTile, tileWon, messageId]);

  // Keyboard
  useEffect(() => {
    const MAP = {
      ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
      w:'up', s:'down', a:'left', d:'right',
    };
    const onKey = (e) => { const d = MAP[e.key]; if (d) { e.preventDefault(); handleMove(d); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleMove]);

  // Touch swipe
  useEffect(() => {
    let sx, sy;
    const onTouchStart = (e) => { sx = e.touches[0]?.clientX; sy = e.touches[0]?.clientY; };
    const onTouchEnd   = (e) => {
      if (sx == null || sy == null) return;
      const dx = (e.changedTouches[0]?.clientX ?? 0) - sx;
      const dy = (e.changedTouches[0]?.clientY ?? 0) - sy;
      if (Math.abs(dx) > Math.abs(dy) + 10) handleMove(dx > 0 ? 'right' : 'left');
      else if (Math.abs(dy) > Math.abs(dx) + 10) handleMove(dy > 0 ? 'down' : 'up');
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend',   onTouchEnd,   { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend',   onTouchEnd);
    };
  }, [handleMove]);

  const handleNewGame = () => {
    if (!isSolo) return;
    const newSeed = Date.now();
    seedRef.current = newSeed;
    moveCountRef.current = 0;
    setBoard(createBoard(newSeed));
    setScore(0);
    setBestTile(0);
    setBoardOver(false);
    setTileWon(false);
    setGameKey(k => k + 1);
    socketManager.emit('g2048-start', { messageId, soloMode: true });
  };

  // Render helpers
  const accentColor = vibe?.colors?.primary || '#6366f1';
  const sortedPlayers = [...players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  const modeBadge = isSolo ? 'Solo' : `Race ${players.length}P`;
  const myScore = isMember ? score : (scores[userId] ?? 0);
  const mins = Math.floor((timeLeft || 0) / 60000);
  const secs = String(Math.floor(((timeLeft || 0) % 60000) / 1000)).padStart(2, '0');

  return (
    <div className="flex h-full overflow-hidden bg-gray-950">

      {/* ── Board area ──────────────────────────────────────── */}
      <div className="relative flex-1 min-w-0 min-h-0 flex items-center justify-center p-2">
        {board ? (
          <div className="relative rounded-xl p-1.5 w-full" style={{ maxWidth: 280, background: '#bbada0' }}>

            {/* 2048 tile reached — offer to continue */}
            {tileWon && !boardOver && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-yellow-400/90 rounded-xl z-10 gap-2">
                <p className="text-3xl font-black">🎉 2048!</p>
                <button
                  onClick={() => setTileWon(false)}
                  className="px-4 py-1.5 bg-white/70 rounded-lg text-sm font-black text-gray-800 hover:bg-white/90"
                >
                  Keep Going
                </button>
              </div>
            )}

            {/* Board over overlay */}
            {boardOver && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 rounded-xl z-10 gap-2">
                <p className="text-xl font-black text-white">Game Over</p>
                <p className="text-gray-300 text-sm">Score: {score}</p>
                {isSolo && (
                  <button
                    onClick={handleNewGame}
                    className="px-4 py-1.5 rounded-lg text-sm font-bold text-white"
                    style={{ background: accentColor }}
                  >
                    ↺ New Game
                  </button>
                )}
              </div>
            )}

            {/* Race finished overlay */}
            {serverStatus === 'finished' && !isSolo && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 rounded-xl z-10 gap-2">
                <Trophy className="w-10 h-10 text-yellow-400" />
                <p className="text-white font-black text-lg">Race Over!</p>
              </div>
            )}

            {/* Tile grid */}
            <div className="grid grid-cols-4 gap-1.5">
              {(board.flat()).map((val, i) => {
                const colors = TILE_COLORS[val] || TILE_COLORS[2048];
                return (
                  <div
                    key={i}
                    className="aspect-square rounded-md flex items-center justify-center font-black transition-all"
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
          /* Race lobby — solo never reaches here */
          <div className="flex flex-col items-center gap-4 px-4 text-center">
            {serverStatus === 'waiting' && isHost && !isSolo && (
              <>
                <p className="text-sm font-bold text-gray-300">🏁 Race Mode</p>
                {players.length > 1 && (
                  <p className="text-xs text-gray-400">{players.map(p => p.name).join(', ')}</p>
                )}
                <button
                  onClick={() => socketManager.emit('g2048-start', { messageId })}
                  className="px-6 py-3 rounded-xl text-white font-black text-sm"
                  style={{ background: accentColor }}
                >
                  🏁 Start Race — {players.length > 1 ? `${players.length} players` : 'wait for others'}
                </button>
              </>
            )}
            {serverStatus === 'waiting' && !isHost && (
              <p className="text-sm text-gray-400">Waiting for host to start…</p>
            )}
            {serverStatus === 'finished' && (
              <p className="text-lg font-bold text-white">Race finished!</p>
            )}
          </div>
        )}
      </div>

      {/* ── Side panel ──────────────────────────────────────── */}
      <div className="flex-shrink-0 w-32 flex flex-col bg-gray-900 border-l border-gray-800">

        {/* Header */}
        <div className={`px-3 py-2 ${vibe.accentClass} flex items-center gap-2 shrink-0`}>
          <span className="text-white font-black text-xs">2048</span>
          <span className="text-[9px] font-black text-white uppercase tracking-widest truncate">
            {modeBadge}
          </span>
          {serverStatus === 'playing' && (
            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
          )}
        </div>

        <div className="flex-1 p-3 flex flex-col gap-3 overflow-y-auto">

          {/* Score + best tile */}
          <div className="bg-gray-800 rounded-xl p-3">
            <div className="flex gap-3">
              <div>
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Score</p>
                <p className="text-lg font-black text-white tabular-nums">{myScore}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Best</p>
                <p className="text-lg font-black tabular-nums" style={{ color: accentColor }}>
                  {bestTile || '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Race timer */}
          {!isSolo && timeLeft !== null && (
            <div className="bg-gray-800 rounded-xl p-2 flex items-center gap-2">
              <Timer className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <p className={`text-sm font-black tabular-nums ${timeLeft < 30000 ? 'text-red-400' : 'text-white'}`}>
                {mins}:{secs}
              </p>
            </div>
          )}

          {/* Race leaderboard */}
          {!isSolo && sortedPlayers.length > 0 && (
            <div className="bg-gray-800/50 rounded-lg p-2 space-y-1">
              <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-0.5">Race</p>
              {sortedPlayers.map((p, i) => (
                <div key={p.id} className="flex items-center gap-1">
                  {i === 0 && serverStatus === 'finished' && (
                    <Trophy className="w-2.5 h-2.5 text-yellow-400 shrink-0" />
                  )}
                  <span className="text-[10px] text-gray-400 truncate flex-1">{p.name}</span>
                  <div className="flex flex-col items-end">
                    {bestTiles[p.id] > 0 && (
                      <span className="text-[8px] font-bold"
                        style={{ color: (TILE_COLORS[bestTiles[p.id]] || TILE_COLORS[2048]).bg }}>
                        {bestTiles[p.id]}
                      </span>
                    )}
                    <span className="text-[10px] font-black text-white tabular-nums">
                      {scores[p.id] ?? 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-auto flex flex-col gap-2">
            {isSolo && (
              <button
                onClick={handleNewGame}
                className="w-full py-1.5 text-[9px] font-black rounded-lg bg-cyan-800/30 text-cyan-400 border border-cyan-700/30 hover:bg-cyan-800/60 transition-colors"
              >
                ↺ New Game
              </button>
            )}
            <button
              onClick={() => socketManager.emit('delete-message', { messageId })}
              className="w-full py-1.5 text-[9px] font-black rounded-lg bg-red-900/30 text-red-400 border border-red-800/40 hover:bg-red-900/60 transition-colors"
            >
              {isSolo ? 'End Game' : 'Leave'}
            </button>
          </div>

          {/* Controls hint */}
          <div className="pt-2 border-t border-gray-800 text-[8px] text-gray-600 leading-relaxed">
            <p>← → ↑ ↓ or WASD</p>
            <p>Swipe on mobile</p>
          </div>
        </div>
      </div>
    </div>
  );
}
