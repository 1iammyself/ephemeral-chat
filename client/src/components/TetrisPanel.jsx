import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Gamepad2, Trophy, Zap, WifiOff } from 'lucide-react';
import socketManager from '../socket';
import { getVibeById } from '../utils/vibes';
import TetrisGame from './games/TetrisGame';

// lines cleared → garbage rows sent (standard battle rules)
const GARBAGE_MAP = [0, 0, 1, 2, 4];

// Compact board renderer for opponent / spectator view
const MiniBoard = ({ matrix, label, score, lines }) => {
  const cellSize = 7;
  const cols = 10;
  const rows = 20;
  return (
    <div className="flex flex-col items-center gap-1">
      {label && (
        <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 truncate max-w-[80px]">{label}</p>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
          gap: 1,
          background: '#111827',
          padding: 2,
          borderRadius: 4,
        }}
      >
        {matrix
          ? matrix.map((row, ri) =>
              row.map((cell, ci) => (
                <div
                  key={`${ri}-${ci}`}
                  style={{ width: cellSize, height: cellSize, background: cell ? '#22d3ee' : '#1f2937', borderRadius: 1 }}
                />
              ))
            )
          : Array.from({ length: rows * cols }).map((_, i) => (
              <div key={i} style={{ width: cellSize, height: cellSize, background: '#1f2937', borderRadius: 1 }} />
            ))}
      </div>
      {score !== undefined && (
        <p className="text-[10px] font-black text-white tabular-nums">{score?.toLocaleString() ?? 0}</p>
      )}
      {lines !== undefined && (
        <p className="text-[9px] text-gray-500">Lines: {lines ?? 0}</p>
      )}
    </div>
  );
};

const TetrisPanel = ({ message, currentUser, roomVibe }) => {
  const [myScore, setMyScore] = useState(0);
  const [myLines, setMyLines] = useState(0);
  const [myLevel, setMyLevel] = useState(1);
  const [p1State, setP1State] = useState(null);
  const [p2State, setP2State] = useState(null);
  const [gameOver, setGameOver] = useState(null); // 'won' | 'lost' | 'ended'
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [garbageTotal, setGarbageTotal] = useState(0);
  const [gameKey, setGameKey] = useState(0); // increment to remount TetrisGame
  const relayThrottleRef = useRef(0);

  const vibe = getVibeById(roomVibe);
  const gameData = message?.gameData;
  const messageId = message?.id;

  const currentUserId = currentUser?.id || currentUser?.socketId;
  const currentNickname = currentUser?.nickname;

  const isPlayer1 =
    gameData?.player1?.id === currentUserId ||
    (currentNickname && gameData?.player1?.name === currentNickname);
  const isPlayer2 =
    gameData?.player2?.id === currentUserId ||
    (currentNickname && gameData?.player2?.name === currentNickname);
  const isSpectator = !isPlayer1 && !isPlayer2;

  const opponentState = isPlayer1 ? p2State : p1State;
  const opponentName = isPlayer1
    ? gameData?.player2?.name
    : gameData?.player1?.name;

  // ── Multiplayer callbacks passed to TetrisGame ───────────────────
  const handleStateUpdate = useCallback(({ score, lines, level, matrix }) => {
    setMyScore(score);
    setMyLines(lines);
    setMyLevel(level);
    if (!isSpectator && messageId) {
      const now = Date.now();
      if (now - relayThrottleRef.current >= 400) {
        relayThrottleRef.current = now;
        socketManager.emit('tetris-state-update', { messageId, score, lines, level, matrix });
      }
    }
  }, [isSpectator, messageId]);

  const handleLinesCleared = useCallback((count) => {
    const garbage = GARBAGE_MAP[Math.min(count, 4)] ?? 0;
    if (garbage > 0 && !isSpectator && messageId) {
      socketManager.emit('tetris-garbage', { messageId, count: garbage });
    }
  }, [isSpectator, messageId]);

  const handleGameOver = useCallback(() => {
    setGameOver('lost');
    if (!isSpectator && messageId) {
      socketManager.emit('tetris-game-over', { messageId });
    }
  }, [isSpectator, messageId]);

  const handleGameRestart = useCallback(() => {
    if (!gameData?.player2) {
      setGameOver(null);
      setGarbageTotal(0);
      if (messageId) socketManager.emit('tetris-solo-reset', { messageId });
    }
  }, [gameData?.player2, messageId]);

  const handleNewGame = useCallback(() => {
    if (gameData?.player2) return; // solo only
    setGameOver(null);
    setGarbageTotal(0);
    setGameKey(k => k + 1); // remount TetrisGame (fresh state)
    if (messageId) socketManager.emit('tetris-solo-reset', { messageId });
  }, [gameData?.player2, messageId]);

  // ── Socket events ────────────────────────────────────────────────
  useEffect(() => {
    const handleOpponentState = ({ messageId: mid, role, score, lines, level, matrix }) => {
      if (mid !== messageId) return;
      setOpponentDisconnected(false);
      const setter = role === 'player1' ? setP1State : setP2State;
      setter({ score, lines, level, matrix });
    };

    const handleAddGarbage = ({ messageId: mid, count }) => {
      if (mid !== messageId) return;
      if (!isSpectator) setGarbageTotal(prev => prev + count);
    };

    const handleOpponentDisconnected = ({ messageId: mid }) => {
      if (mid !== messageId) return;
      setOpponentDisconnected(true);
    };

    const handleOpponentReconnected = ({ messageId: mid }) => {
      if (mid !== messageId) return;
      setOpponentDisconnected(false);
    };

    socketManager.on('tetris-opponent-state', handleOpponentState);
    socketManager.on('tetris-add-garbage', handleAddGarbage);
    socketManager.on('tetris-opponent-disconnected', handleOpponentDisconnected);
    socketManager.on('tetris-opponent-reconnected', handleOpponentReconnected);

    return () => {
      socketManager.off('tetris-opponent-state', handleOpponentState);
      socketManager.off('tetris-add-garbage', handleAddGarbage);
      socketManager.off('tetris-opponent-disconnected', handleOpponentDisconnected);
      socketManager.off('tetris-opponent-reconnected', handleOpponentReconnected);
    };
  }, [messageId, isSpectator]);

  // Derive game-over state from server message
  useEffect(() => {
    if (!gameData || gameData.status !== 'finished' || isSpectator || gameOver) return;
    if (gameData.winner) {
      const winnerName = gameData.winner === 'player1' ? gameData.player1?.name : gameData.player2?.name;
      setGameOver(winnerName === currentNickname ? 'won' : 'lost');
    } else if (!gameData.player2) {
      // Solo forfeit / End Game
      setGameOver('ended');
    }
  }, [gameData?.status, gameData?.winner, isSpectator, currentNickname, gameOver]);

  if (!gameData) return null;

  // ── Spectator view ───────────────────────────────────────────────
  if (isSpectator) {
    return (
      <div className="flex h-full flex-col bg-gray-950 p-4 gap-4 overflow-y-auto">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Spectating</span>
        </div>
        <div className="flex gap-6 justify-center items-start">
          <MiniBoard
            matrix={p1State?.matrix}
            label={gameData.player1?.name ?? 'Player 1'}
            score={p1State?.score}
            lines={p1State?.lines}
          />
          <div className="flex flex-col items-center justify-center gap-1 pt-20">
            <span className="text-xs font-black text-cyan-500">VS</span>
          </div>
          <MiniBoard
            matrix={p2State?.matrix}
            label={gameData.player2?.name ?? 'Player 2'}
            score={p2State?.score}
            lines={p2State?.lines}
          />
        </div>
        {gameData.status === 'waiting' && (
          <p className="text-center text-xs text-gray-600">Waiting for players to start…</p>
        )}
      </div>
    );
  }

  // ── Player view ──────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden bg-gray-950">
      {/* Game area — dominant, fills available space */}
      <div className="relative flex-1 min-w-0 min-h-0">
        <TetrisGame
          key={gameKey}
          onStateUpdate={handleStateUpdate}
          onLinesCleared={handleLinesCleared}
          onGameOver={handleGameOver}
          onGameRestart={handleGameRestart}
          garbageTotal={garbageTotal}
        />

        {gameOver && gameOver !== 'ended' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-30 pointer-events-none">
            <div className="text-center space-y-2 px-4">
              {gameOver === 'won' ? (
                <>
                  <Trophy className="w-14 h-14 text-yellow-400 mx-auto" />
                  <p className="text-white text-2xl font-black">YOU WIN!</p>
                </>
              ) : (
                <>
                  <p className="text-5xl">💀</p>
                  <p className="text-white text-2xl font-black">TOPPED OUT</p>
                </>
              )}
              <p className="text-gray-300 text-sm">Score: {myScore.toLocaleString()}</p>
              {!gameData.player2 && (
                <p className="text-gray-500 text-xs">Press R or use New Game below</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Side panel — compact, fixed width */}
      <div className="flex-shrink-0 w-36 flex flex-col bg-gray-900 overflow-y-auto border-l border-gray-800">
        {/* Mode badge */}
        <div className={`px-3 py-2 ${vibe.accentClass} flex items-center gap-2 shrink-0`}>
          <Gamepad2 className="w-3.5 h-3.5 text-white" />
          <span className="text-[10px] font-black text-white uppercase tracking-widest">
            {gameData.player2 ? '1v1 Battle' : 'Solo Mode'}
          </span>
          {gameData.status === 'playing' && (
            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          )}
        </div>

        <div className="flex-1 p-3 flex flex-col gap-3">
          {/* My score */}
          <div className="bg-gray-800 rounded-xl p-3">
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">You</p>
            <p className="text-xl font-black text-white tabular-nums">{myScore.toLocaleString()}</p>
            <div className="flex gap-3 mt-0.5">
              <span className="text-[9px] text-gray-400">Lines <span className="text-white font-bold">{myLines}</span></span>
              <span className="text-[9px] text-gray-400">Lv <span className="text-white font-bold">{myLevel}</span></span>
            </div>
          </div>

          {/* Opponent section */}
          {gameData.player2 && (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-700" />
                <span className="text-[9px] font-black text-cyan-500 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5" /> VS
                </span>
                <div className="flex-1 h-px bg-gray-700" />
              </div>

              <div className="bg-gray-800 rounded-xl p-3 flex flex-col gap-2">
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest truncate">
                  {opponentName ?? 'Opponent'}
                </p>
                {opponentState ? (
                  <>
                    <p className="text-xl font-black text-white tabular-nums">{opponentState.score?.toLocaleString() ?? 0}</p>
                    <div className="flex gap-3">
                      <span className="text-[9px] text-gray-400">Lines <span className="text-white font-bold">{opponentState.lines ?? 0}</span></span>
                      <span className="text-[9px] text-gray-400">Lv <span className="text-white font-bold">{opponentState.level ?? 1}</span></span>
                    </div>
                    <MiniBoard matrix={opponentState.matrix} />
                  </>
                ) : (
                  <p className="text-[10px] text-gray-600 italic">Waiting for opponent board…</p>
                )}
              </div>
            </>
          )}

          {/* Opponent disconnect warning */}
          {opponentDisconnected && gameData.player2 && !gameOver && (
            <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-2.5 py-1.5">
              <WifiOff className="w-3 h-3 text-yellow-400 shrink-0" />
              <p className="text-[9px] text-yellow-400 font-bold">Opponent disconnected — auto-forfeit in ~30s</p>
            </div>
          )}

          {/* Action buttons */}
          {gameOver === 'ended' ? (
            <button
              onClick={handleNewGame}
              className="w-full py-1.5 text-[9px] font-black rounded-lg bg-cyan-800/50 text-cyan-300 border border-cyan-700/40 hover:bg-cyan-800/80 transition-colors"
            >↺ New Game</button>
          ) : !gameOver ? (
            <>
              {!gameData.player2 && (
                <button
                  onClick={handleNewGame}
                  className="w-full py-1.5 text-[9px] font-black rounded-lg bg-cyan-800/30 text-cyan-400 border border-cyan-700/30 hover:bg-cyan-800/60 transition-colors"
                >↺ Reset</button>
              )}
              <button
                onClick={() => socketManager.emit('tetris-forfeit', { messageId })}
                className="w-full py-1.5 text-[9px] font-black rounded-lg bg-red-900/30 text-red-400 border border-red-800/40 hover:bg-red-900/60 transition-colors"
              >
                {gameData.player2 ? 'Forfeit' : 'End Game'}
              </button>
            </>
          ) : (
            !gameData.player2 && (
              <button
                onClick={handleNewGame}
                className="w-full py-1.5 text-[9px] font-black rounded-lg bg-cyan-800/50 text-cyan-300 border border-cyan-700/40 hover:bg-cyan-800/80 transition-colors"
              >↺ New Game</button>
            )
          )}

          {/* Controls hint */}
          <div className="mt-auto pt-2 border-t border-gray-800 text-[9px] text-gray-600 leading-relaxed">
            <p>← → Move &nbsp; ↑ Rotate &nbsp; ↓ Soft drop</p>
            <p>Space Hard drop &nbsp; P Pause &nbsp; S Sound</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TetrisPanel;
