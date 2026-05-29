import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy } from 'lucide-react';
import socketManager from '../socket';
import { getCpuPick, PICK_EMOJI } from './games/RpsEngine';
import { getVibeById } from '../utils/vibes';

const PICKS = ['rock', 'paper', 'scissors'];
const REVEAL_DELAY_MS = 1500; // show round result for 1.5 s then auto-advance

export default function RpsPanel({ message, currentUser, roomVibe }) {
  const messageId   = message?.id;
  const gameData    = message?.gameData;
  const vibe        = getVibeById(roomVibe);
  const userId      = currentUser?.id || currentUser?.socketId;
  const nickname    = currentUser?.nickname;

  // Derive roles from gameData (available immediately as a prop)
  const isCpu       = !!gameData?.cpu?.enabled;
  const cpuDiff     = gameData?.cpu?.difficulty || 'medium';
  const totalRounds = gameData?.totalRounds || 5;
  const isHost      = gameData?.hostId === userId;
  const isMember    = (gameData?.players || []).some(
    p => p.id === userId || (nickname && p.name === nickname)
  );

  // Initialize state directly from gameData — no waiting-flash for CPU games
  const [status,       setStatus]       = useState(gameData?.status || 'waiting');
  const [players,      setPlayers]      = useState(gameData?.players || []);
  const [scores,       setScores]       = useState(gameData?.scores || {});
  const [round,        setRound]        = useState(gameData?.round || 1);
  const [myPick,       setMyPick]       = useState(null);
  const [revealed,     setRevealed]     = useState(false);
  const [roundResult,  setRoundResult]  = useState(null);
  const [waitingPicks, setWaitingPicks] = useState({});
  const [overallWinner,setOverallWinner]= useState(gameData?.overallWinner || null);

  const cpuHistoryRef    = useRef([]);
  const autoAdvanceTimer = useRef(null);

  const isFinished = status === 'finished';

  // Sync server state into local state
  useEffect(() => {
    if (!gameData) return;
    setPlayers(gameData.players || []);
    setScores(gameData.scores || {});
    setRound(gameData.round || 1);
    setStatus(gameData.status || 'waiting');
    if (gameData.overallWinner) setOverallWinner(gameData.overallWinner);

    // Keep pick state in sync with server's revealed field
    if (gameData.revealed) {
      setRevealed(true);
      const last = gameData.roundResults?.[gameData.roundResults.length - 1];
      if (last) setRoundResult(last);
    } else {
      setRevealed(false);
      setRoundResult(null);
      setMyPick(null);
      setWaitingPicks({});
    }
  }, [gameData]);

  // Schedule auto-advance after reveal (host only)
  const scheduleAdvance = useCallback(() => {
    clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = setTimeout(() => {
      if (isHost) socketManager.emit('rps-next-round', { messageId });
    }, REVEAL_DELAY_MS);
  }, [isHost, messageId]);

  // Socket events
  useEffect(() => {
    if (!messageId) return;

    const onReveal = (data) => {
      if (data.messageId !== messageId) return;
      setRevealed(true);
      setRoundResult(data.roundResult);
      setScores(data.scores || {});
      if (data.status) setStatus(data.status);
      if (data.status === 'finished' && data.roundResult) {
        // Resolve overall winner from final scores
      }
      // Auto-advance for non-final rounds
      if (data.status !== 'finished') scheduleAdvance();
    };

    const onNextRound = (data) => {
      if (data.messageId !== messageId) return;
      clearTimeout(autoAdvanceTimer.current);
      setRevealed(false);
      setMyPick(null);
      setRoundResult(null);
      setRound(data.round);
      setWaitingPicks({});
    };

    const onPicked = (data) => {
      if (data.messageId !== messageId) return;
      setWaitingPicks(prev => ({ ...prev, [data.playerId]: true }));
    };

    socketManager.on('rps-round-reveal',   onReveal);
    socketManager.on('rps-next-round',     onNextRound);
    socketManager.on('rps-player-picked',  onPicked);

    return () => {
      clearTimeout(autoAdvanceTimer.current);
      socketManager.off('rps-round-reveal',  onReveal);
      socketManager.off('rps-next-round',    onNextRound);
      socketManager.off('rps-player-picked', onPicked);
    };
  }, [messageId, scheduleAdvance]);

  // Pick handler
  const handlePick = (pick) => {
    if (myPick || revealed || status !== 'playing' || !isMember) return;

    setMyPick(pick);
    setWaitingPicks(prev => ({ ...prev, [userId]: true }));
    socketManager.emit('rps-pick', { messageId, pick });
    cpuHistoryRef.current = [...cpuHistoryRef.current, pick];

    // CPU responds after a short delay
    if (isCpu) {
      const cpuPick = getCpuPick(cpuDiff, cpuHistoryRef.current.slice(0, -1));
      setTimeout(() => {
        socketManager.emit('rps-cpu-pick', { messageId, pick: cpuPick });
      }, 400);
    }
  };

  // Start multiplayer game (host only, shown when waiting with 2+ players)
  const handleStartGame = () => socketManager.emit('rps-start', { messageId });

  // Render helpers
  const accentColor   = vibe?.colors?.primary || '#6366f1';
  const sortedPlayers = [...players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));

  // Round dots showing progress
  const RoundDots = () => (
    <div className="flex gap-1.5 justify-center">
      {Array.from({ length: totalRounds }, (_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all ${
            i < round - 1
              ? 'w-2.5 h-2.5'
              : i === round - 1
              ? 'w-3 h-3 scale-110'
              : 'w-2.5 h-2.5 opacity-30'
          }`}
          style={{ background: i <= round - 1 ? accentColor : '#374151' }}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col items-center p-4 h-full gap-3 overflow-y-auto">

      {/* Round progress */}
      {status === 'playing' && <RoundDots />}

      {/* Status line */}
      <p className="text-sm font-bold text-gray-700 dark:text-gray-300 text-center">
        {isFinished
          ? '🏆 Match Over!'
          : status === 'waiting'
          ? 'Waiting for players…'
          : revealed
          ? 'Round result!'
          : `Round ${round} of ${totalRounds} — make your pick!`}
      </p>

      {/* Pick buttons — shown immediately when playing and not yet revealed */}
      {isMember && status === 'playing' && !revealed && (
        <div className="flex gap-2 sm:gap-3 w-full max-w-[280px] justify-center">
          {PICKS.map(p => (
            <button
              key={p}
              onClick={() => handlePick(p)}
              disabled={!!myPick}
              className={`flex-1 aspect-square text-3xl sm:text-4xl rounded-2xl transition-all duration-150 shadow min-h-[64px]
                ${myPick === p
                  ? 'scale-110 shadow-lg'
                  : myPick
                  ? 'opacity-40'
                  : 'hover:scale-105 active:scale-95'}`}
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

      {/* Waiting for opponent to pick */}
      {myPick && !revealed && (
        <p className="text-xs text-gray-400 text-center">
          {isCpu
            ? `CPU (${cpuDiff}) is thinking…`
            : `Waiting for ${
                players.filter(p => !waitingPicks[p.id] && p.id !== userId).map(p => p.name).join(', ') || 'everyone…'
              }`}
        </p>
      )}

      {/* Round reveal */}
      {revealed && roundResult && (
        <div className="w-full max-w-xs bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1.5">
          {Object.entries(roundResult.picks || {}).map(([pid, pick]) => {
            const player  = pid === 'cpu'
              ? { name: `CPU (${cpuDiff})` }
              : players.find(p => p.id === pid);
            const outcome = roundResult.outcomes?.[pid];
            return (
              <div
                key={pid}
                className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${
                  outcome === 'win'  ? 'bg-green-100 dark:bg-green-900/30' :
                  outcome === 'lose' ? 'bg-red-50 dark:bg-red-900/20' :
                  'bg-gray-100 dark:bg-gray-700'
                }`}
              >
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[110px]">
                  {player?.name || pid}{pid === userId ? ' (you)' : ''}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xl">{PICK_EMOJI[pick]}</span>
                  {outcome === 'win'  && <span className="text-xs font-black text-green-600">+1</span>}
                  {outcome === 'lose' && <span className="text-xs font-black text-red-400">—</span>}
                  {outcome === 'draw' && <span className="text-xs font-black text-gray-400">draw</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Scoreboard */}
      {(status === 'playing' || isFinished) && players.length > 0 && (
        <div className="w-full max-w-xs">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 text-center mb-1">Scores</p>
          {sortedPlayers.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between px-2 py-0.5">
              <div className="flex items-center gap-1.5">
                {i === 0 && isFinished && <Trophy className="w-3 h-3 text-yellow-500" />}
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[120px]">
                  {p.name}{p.id === userId ? ' (you)' : ''}
                </span>
              </div>
              <span className="text-xs font-black tabular-nums" style={{ color: accentColor }}>
                {scores[p.id] ?? 0}
              </span>
            </div>
          ))}
          {isCpu && (
            <div className="flex items-center justify-between px-2 py-0.5">
              <span className="text-xs text-gray-700 dark:text-gray-300">CPU ({cpuDiff})</span>
              <span className="text-xs font-black tabular-nums" style={{ color: accentColor }}>
                {scores['cpu'] ?? 0}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Overall winner banner */}
      {isFinished && (overallWinner || gameData?.overallWinner) && (
        <div className="w-full max-w-xs rounded-xl p-3 text-center" style={{ background: accentColor + '22' }}>
          <Trophy className="w-8 h-8 text-yellow-500 mx-auto mb-1" />
          <p className="text-sm font-black text-gray-900 dark:text-white">
            {(overallWinner || gameData?.overallWinner)?.name === nickname
              ? '🎉 You win the match!'
              : `${(overallWinner || gameData?.overallWinner)?.name} wins!`}
          </p>
        </div>
      )}
      {isFinished && !(overallWinner || gameData?.overallWinner) && (
        <p className="text-sm font-bold text-gray-500 text-center">Match ended in a tie!</p>
      )}

      {/* Multiplayer lobby — host starts when 2+ players joined */}
      {isHost && status === 'waiting' && !isCpu && (
        <div className="flex flex-col items-center gap-2 w-full max-w-xs">
          <p className="text-xs text-gray-400 text-center">
            {players.length >= 2
              ? `${players.length} players in lobby`
              : 'Waiting for someone to join…'}
          </p>
          {players.length >= 2 && (
            <button
              onClick={handleStartGame}
              className="w-full py-2 rounded-xl text-sm font-bold text-white"
              style={{ background: accentColor }}
            >
              ▶ Start Match
            </button>
          )}
          <button
            onClick={() => socketManager.emit('rps-set-cpu', { messageId, difficulty: 'medium' })}
            className="text-xs text-purple-500 hover:underline"
          >
            🤖 Switch to vs CPU instead
          </button>
        </div>
      )}

      {/* Non-host waiting */}
      {!isHost && status === 'waiting' && (
        <p className="text-sm text-gray-400 text-center">Waiting for host to start…</p>
      )}
    </div>
  );
}
