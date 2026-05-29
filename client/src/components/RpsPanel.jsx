import React, { useState, useEffect, useCallback } from 'react';
import { socketManager } from '../socket';
import { getRoundResult, getCpuPick, PICK_EMOJI } from './games/RpsEngine';
import { getVibeById } from '../utils/vibes';

const PICKS = ['rock', 'paper', 'scissors'];

export default function RpsPanel({ message, currentUser, roomVibe }) {
  const [myPick, setMyPick] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [roundResult, setRoundResult] = useState(null);
  const [scores, setScores] = useState({});
  const [players, setPlayers] = useState([]);
  const [round, setRound] = useState(1);
  const [status, setStatus] = useState('waiting');
  const [isCpuMode, setIsCpuMode] = useState(false);
  const [cpuHistory, setCpuHistory] = useState([]);
  const [pendingCpu, setPendingCpu] = useState(false);
  const [waitingPicks, setWaitingPicks] = useState({});

  const messageId = message?.id;
  const gameData = message?.gameData;
  const vibe = getVibeById(roomVibe);
  const userId = currentUser?.id || currentUser?.socketId;
  const totalRounds = gameData?.totalRounds || 5;
  const isHost = gameData?.hostId === userId;
  const isFinished = status === 'finished';

  useEffect(() => {
    if (!gameData) return;
    setScores(gameData.scores || {});
    setPlayers(gameData.players || []);
    setRound(gameData.round || 1);
    setStatus(gameData.status || 'waiting');
    setIsCpuMode(!!gameData.cpu?.enabled);
    if (gameData.revealed) {
      setRevealed(true);
      setRoundResult(gameData.roundResults?.[gameData.roundResults.length - 1] || null);
    } else {
      setRevealed(false);
      setRoundResult(null);
      setMyPick(null);
    }
    setWaitingPicks(gameData.pickedIds ? Object.fromEntries(gameData.pickedIds.map(id => [id, true])) : {});
  }, [gameData]);

  useEffect(() => {
    if (!messageId) return;
    const onReveal = (data) => {
      if (data.messageId !== messageId) return;
      setRevealed(true);
      setRoundResult(data.roundResult);
      setScores(data.scores || {});
      if (data.status) setStatus(data.status);
    };
    const onNextRound = (data) => {
      if (data.messageId !== messageId) return;
      setRevealed(false); setMyPick(null); setRoundResult(null);
      setRound(data.round); setWaitingPicks({});
    };
    const onPicked = (data) => {
      if (data.messageId !== messageId) return;
      setWaitingPicks(prev => ({ ...prev, [data.playerId]: true }));
    };
    socketManager.on('rps-round-reveal', onReveal);
    socketManager.on('rps-next-round', onNextRound);
    socketManager.on('rps-player-picked', onPicked);
    return () => {
      socketManager.off('rps-round-reveal', onReveal);
      socketManager.off('rps-next-round', onNextRound);
      socketManager.off('rps-player-picked', onPicked);
    };
  }, [messageId]);

  const handlePick = (pick) => {
    if (myPick || revealed || status !== 'playing') return;
    setMyPick(pick);
    socketManager.emit('rps-pick', { messageId, pick });
    if (isCpuMode) {
      const cpuPick = getCpuPick(gameData.cpu.difficulty, cpuHistory);
      setCpuHistory(prev => [...prev, pick]);
      setTimeout(() => {
        socketManager.emit('rps-cpu-pick', { messageId, pick: cpuPick });
      }, 300);
    }
  };

  const handleNextRound = () => socketManager.emit('rps-next-round', { messageId });
  const handleStartGame = () => socketManager.emit('rps-start', { messageId });
  const handleSetCpu = (diff) => {
    socketManager.emit('rps-set-cpu', { messageId, difficulty: diff });
    setPendingCpu(false);
  };

  const accentColor = vibe?.colors?.primary || '#6366f1';
  const sortedPlayers = [...players].sort((a,b) => (scores[b.id]||0) - (scores[a.id]||0));
  const myData = players.find(p => p.id === userId);
  const isMember = !!myData;

  return (
    <div className="flex flex-col items-center p-4 h-full gap-3 overflow-y-auto">
      {/* Round indicator */}
      {status === 'playing' && (
        <div className="flex gap-1.5">
          {Array.from({ length: totalRounds }, (_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-all ${i < round - 1 ? 'opacity-100' : i === round - 1 ? 'opacity-100 scale-125' : 'opacity-30'}`}
              style={{ background: i < round - 1 ? accentColor + 'aa' : i === round - 1 ? accentColor : '#d1d5db' }}
            />
          ))}
        </div>
      )}

      <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
        {status === 'waiting' ? 'Waiting for players…' :
          status === 'finished' ? `🏆 Match Over!` :
          revealed ? 'Round result!' : `Round ${round} — pick your move!`}
      </p>

      {/* Pick buttons */}
      {isMember && status === 'playing' && !revealed && (
        <div className="flex gap-2 sm:gap-3 w-full max-w-[280px] justify-center">
          {PICKS.map(p => (
            <button
              key={p}
              onClick={() => handlePick(p)}
              disabled={!!myPick}
              className={`flex-1 aspect-square text-3xl sm:text-4xl rounded-2xl transition-all duration-150 shadow min-h-[64px]
                ${myPick === p ? 'scale-110 shadow-lg' : myPick ? 'opacity-40' : 'hover:scale-105 active:scale-95'}
              `}
              style={{
                background: myPick === p ? accentColor : (vibe?.boardColors?.light || '#f3f4f6'),
                border: myPick === p ? `3px solid ${accentColor}` : '3px solid transparent',
              }}
            >
              {PICK_EMOJI[p]}
            </button>
          ))}
        </div>
      )}

      {/* Waiting for others */}
      {myPick && !revealed && (
        <p className="text-xs text-gray-400">
          Waiting for {players.filter(p => !waitingPicks[p.id]).map(p => p.name).join(', ') || 'everyone'}…
        </p>
      )}

      {/* Reveal */}
      {revealed && roundResult && (
        <div className="w-full max-w-xs bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1.5">
          {Object.entries(roundResult.picks || {}).map(([pid, pick]) => {
            const player = players.find(p => p.id === pid);
            const outcome = roundResult.outcomes?.[pid];
            return (
              <div key={pid} className={`flex items-center justify-between rounded-lg px-3 py-1.5
                ${outcome === 'win' ? 'bg-green-100 dark:bg-green-900/30' :
                  outcome === 'lose' ? 'bg-red-50 dark:bg-red-900/20' :
                  'bg-gray-100 dark:bg-gray-700'}`}>
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[100px]">
                  {player?.name || pid}{pid === userId ? ' (you)' : ''}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-xl">{PICK_EMOJI[pick]}</span>
                  {outcome === 'win' && <span className="text-xs font-black text-green-600">+1</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Scores leaderboard */}
      {(status === 'playing' || isFinished) && players.length > 0 && (
        <div className="w-full max-w-xs">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 text-center mb-1">Scores</p>
          {sortedPlayers.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between px-2 py-0.5">
              <div className="flex items-center gap-1.5">
                {i === 0 && (status === 'finished') && <span>🏆</span>}
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[120px]">{p.name}</span>
              </div>
              <span className="text-xs font-black tabular-nums" style={{ color: accentColor }}>
                {scores[p.id] ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Host controls */}
      {isHost && status === 'waiting' && (
        <div className="flex flex-col items-center gap-2 w-full max-w-xs">
          <button
            onClick={handleStartGame}
            className="w-full py-2 rounded-xl text-sm font-bold text-white"
            style={{ background: accentColor }}
          >
            ▶ Start Game ({players.length} {players.length === 1 ? 'player' : 'players'})
          </button>
          {!isCpuMode && (
            pendingCpu ? (
              <div className="flex gap-2">
                {['easy','medium','hard'].map(d => (
                  <button key={d} onClick={() => handleSetCpu(d)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white capitalize"
                    style={{ background: accentColor }}>
                    {d}
                  </button>
                ))}
                <button onClick={() => setPendingCpu(false)} className="px-2 py-1.5 rounded-lg text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">✕</button>
              </div>
            ) : (
              <button onClick={() => setPendingCpu(true)} className="text-xs text-purple-500 hover:underline">
                🤖 Play solo vs CPU
              </button>
            )
          )}
        </div>
      )}

      {/* Next round / after reveal */}
      {revealed && !isFinished && isHost && (
        <button onClick={handleNextRound} className="px-6 py-2 rounded-xl text-sm font-bold text-white" style={{ background: accentColor }}>
          Next Round →
        </button>
      )}
    </div>
  );
}
