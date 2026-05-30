import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy } from 'lucide-react';
import socketManager from '../socket';
import { getCpuPick, PICK_EMOJI, PICKS_BY_VARIANT, RPSLS_BEATS_TEXT } from './games/RpsEngine';
import { getVibeById } from '../utils/vibes';

const REVEAL_DELAY_MS = 1600;

export default function RpsPanel({ message, currentUser, roomVibe }) {
  const messageId   = message?.id;
  const gameData    = message?.gameData;
  const vibe        = getVibeById(roomVibe);
  const userId      = currentUser?.id || currentUser?.socketId;
  const nickname    = currentUser?.nickname;

  const variant      = gameData?.variant || 'standard';
  const PICKS        = PICKS_BY_VARIANT[variant] || PICKS_BY_VARIANT.standard;
  const isCpu        = !!gameData?.cpu?.enabled;
  const cpuDiff      = gameData?.cpu?.difficulty || 'medium';
  const totalRounds  = gameData?.totalRounds || 5;
  const isHost       = gameData?.hostId === userId;
  const isMember     = (gameData?.players || []).some(p => p.id === userId || (nickname && p.name === nickname));

  const [status,       setStatus]       = useState(gameData?.status || 'waiting');
  const [players,      setPlayers]      = useState(gameData?.players || []);
  const [scores,       setScores]       = useState(gameData?.scores || {});
  const [round,        setRound]        = useState(gameData?.round || 1);
  const [myPick,       setMyPick]       = useState(null);
  const [revealed,     setRevealed]     = useState(false);
  const [roundResult,  setRoundResult]  = useState(null);
  const [waitingPicks, setWaitingPicks] = useState({});
  const [overallWinner,setOverallWinner]= useState(gameData?.overallWinner || null);
  const [roundHistory, setRoundHistory] = useState([]);
  const [myPickTime,   setMyPickTime]   = useState(null);
  // Janken countdown: 3 → 2 → 1 → null (show picks)
  const [countdown,    setCountdown]    = useState(null);
  // RPSLS beat explanation
  const [beatText,     setBeatText]     = useState(null);

  const roundStartRef     = useRef(null);
  const cpuHistoryRef     = useRef([]);
  const autoAdvanceTimer  = useRef(null);
  const countdownRef      = useRef(null);

  const isFinished = status === 'finished';
  const showPicks  = countdown === null;

  let winStreak = 0;
  for (let i = roundHistory.length - 1; i >= 0; i--) {
    if (roundHistory[i]?.outcomes?.[userId] === 'win') winStreak++;
    else break;
  }

  // Best streak this match
  let bestStreak = 0, cur = 0;
  for (const r of roundHistory) {
    if (r.outcomes?.[userId] === 'win') { cur++; if (cur > bestStreak) bestStreak = cur; }
    else cur = 0;
  }

  // Win/loss/draw rates this match
  const playedRounds = roundHistory.length;
  const matchWins    = roundHistory.filter(r => r.outcomes?.[userId] === 'win').length;
  const matchLosses  = roundHistory.filter(r => r.outcomes?.[userId] === 'lose').length;
  const matchDraws   = roundHistory.filter(r => r.outcomes?.[userId] === 'draw').length;
  const winPct  = playedRounds > 0 ? Math.round(matchWins   / playedRounds * 100) : null;
  const lossPct = playedRounds > 0 ? Math.round(matchLosses / playedRounds * 100) : null;
  const drawPct = playedRounds > 0 ? Math.round(matchDraws  / playedRounds * 100) : null;

  const pickStats = Object.fromEntries(PICKS.map(p => [p, 0]));
  roundHistory.forEach(r => { const p = r.picks?.[userId]; if (p && p in pickStats) pickStats[p]++; });

  // Start Janken countdown when a new round begins
  useEffect(() => {
    clearInterval(countdownRef.current);
    if (status !== 'playing' || revealed) return;
    let count = 3;
    setCountdown(count);
    countdownRef.current = setInterval(() => {
      count--;
      if (count <= 0) { clearInterval(countdownRef.current); setCountdown(null); roundStartRef.current = Date.now(); }
      else setCountdown(count);
    }, 700);
    return () => clearInterval(countdownRef.current);
  }, [round, status]); // eslint-disable-line

  useEffect(() => {
    if (!gameData) return;
    setPlayers(gameData.players || []);
    setScores(gameData.scores || {});
    setRound(gameData.round || 1);
    setStatus(gameData.status || 'waiting');
    if (gameData.overallWinner) setOverallWinner(gameData.overallWinner);
    if (gameData.revealed) {
      setRevealed(true);
      const last = gameData.roundResults?.[gameData.roundResults.length - 1];
      if (last) setRoundResult(last);
    } else {
      setRevealed(false); setRoundResult(null); setMyPick(null); setWaitingPicks({});
    }
  }, [gameData]);

  const scheduleAdvance = useCallback(() => {
    clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = setTimeout(() => {
      if (isHost) socketManager.emit('rps-next-round', { messageId });
    }, REVEAL_DELAY_MS);
  }, [isHost, messageId]);

  useEffect(() => {
    if (!messageId) return;
    const onReveal = (data) => {
      if (data.messageId !== messageId) return;
      setRevealed(true); setRoundResult(data.roundResult); setScores(data.scores || {});
      if (data.status) setStatus(data.status);
      // Compute beat explanation for RPSLS
      if (variant === 'rpsls' && data.roundResult) {
        const picks = data.roundResult.picks || {};
        const pickList = Object.values(picks);
        if (pickList.length === 2) {
          const [a, b] = pickList;
          if (a !== b && RPSLS_BEATS_TEXT[a]) {
            const text = RPSLS_BEATS_TEXT[a].find(t => {
              const words = t.toLowerCase().split(' ');
              return words.some(w => b.startsWith(w));
            }) || RPSLS_BEATS_TEXT[b]?.find(t => {
              const words = t.toLowerCase().split(' ');
              return words.some(w => a.startsWith(w));
            });
            setBeatText(text || null);
          } else { setBeatText(null); }
        }
      }
      if (data.roundResult) {
        setRoundHistory(prev => [...prev, { round, picks: data.roundResult.picks, outcomes: data.roundResult.outcomes, pickTime: myPickTime }]);
      }
      setMyPickTime(null);
      if (data.status !== 'finished') scheduleAdvance();
    };
    const onNextRound = (data) => {
      if (data.messageId !== messageId) return;
      clearTimeout(autoAdvanceTimer.current);
      setRevealed(false); setMyPick(null); setRoundResult(null);
      setRound(data.round); setWaitingPicks({}); setBeatText(null);
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
  }, [messageId, scheduleAdvance, round, myPickTime, variant]);

  const handlePick = (pick) => {
    if (myPick || revealed || status !== 'playing' || !isMember || countdown !== null) return;
    const elapsed = roundStartRef.current ? ((Date.now() - roundStartRef.current) / 1000).toFixed(1) : null;
    setMyPickTime(elapsed);
    setMyPick(pick);
    setWaitingPicks(prev => ({ ...prev, [userId]: true }));
    socketManager.emit('rps-pick', { messageId, pick });
    cpuHistoryRef.current = [...cpuHistoryRef.current, pick];
    if (isCpu) {
      const cpuPick = getCpuPick(cpuDiff, cpuHistoryRef.current.slice(0, -1), variant);
      setTimeout(() => socketManager.emit('rps-cpu-pick', { messageId, pick: cpuPick }), 400);
    }
  };

  const handleStartGame = () => socketManager.emit('rps-start', { messageId });
  const accentColor = vibe?.colors?.primary || '#6366f1';
  const sortedPlayers = [...players].sort((a, b) => (scores[b.id]||0) - (scores[a.id]||0));

  const RoundDots = () => (
    <div className="flex gap-1.5 justify-center">
      {Array.from({length:totalRounds},(_,i) => (
        <div key={i} className={`rounded-full transition-all ${i<round-1?'w-2.5 h-2.5':i===round-1?'w-3 h-3 scale-110':'w-2.5 h-2.5 opacity-30'}`}
          style={{ background: i<=round-1 ? accentColor : '#374151' }} />
      ))}
    </div>
  );

  // Grid cols based on variant
  const pickGridCols = variant === 'rpsls' ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-3';

  return (
    <div className="flex flex-col items-center p-4 h-full gap-3 overflow-y-auto">
      {variant === 'rpsls' && (
        <span className="text-[9px] font-black uppercase tracking-widest bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">🖖 RPSLS mode</span>
      )}

      {status === 'playing' && <RoundDots />}

      <p className="text-sm font-bold text-gray-700 dark:text-gray-300 text-center">
        {isFinished ? '🏆 Match Over!'
          : status === 'waiting' ? 'Waiting for players…'
          : revealed ? 'Round result!'
          : countdown !== null ? 'Rock · Paper · Scissors…'
          : `Round ${round} of ${totalRounds} — make your pick!`}
      </p>

      {/* Janken countdown ceremony */}
      {countdown !== null && isMember && status === 'playing' && !revealed && (
        <div className="flex flex-col items-center gap-2 py-3">
          <p className="text-3xl animate-bounce select-none">✊</p>
          <p className="text-base font-black text-gray-300 tracking-wide text-center">
            {countdown === 3 ? 'Saisho wa guu…' : countdown === 2 ? 'Janken…' : 'Pon!'}
          </p>
          <p className="text-4xl font-black text-gray-200 tabular-nums">{countdown}</p>
        </div>
      )}

      {/* Pick buttons */}
      {isMember && status === 'playing' && !revealed && showPicks && (
        <div className={`grid ${pickGridCols} gap-2 w-full max-w-[320px] justify-center`}>
          {PICKS.map(p => (
            <button key={p} onClick={() => handlePick(p)} disabled={!!myPick}
              className={`aspect-square text-2xl sm:text-3xl rounded-2xl transition-all duration-150 shadow min-h-[56px] flex flex-col items-center justify-center gap-0.5
                ${myPick===p ? 'scale-110 shadow-lg' : myPick ? 'opacity-40' : 'hover:scale-105 active:scale-95'}`}
              style={{
                background: myPick===p ? accentColor : (vibe?.boardColors?.light || '#f3f4f6'),
                border: myPick===p ? `3px solid ${accentColor}` : '3px solid transparent',
              }}>
              <span>{PICK_EMOJI[p]}</span>
              {variant === 'rpsls' && <span className="text-[8px] font-black text-gray-500 capitalize">{p}</span>}
            </button>
          ))}
        </div>
      )}

      {myPick && !revealed && (
        <p className="text-xs text-gray-400 text-center">
          {isCpu ? `CPU (${cpuDiff}) is thinking…`
            : `Waiting for ${players.filter(p => !waitingPicks[p.id] && p.id !== userId).map(p => p.name).join(', ') || 'everyone…'}`}
        </p>
      )}

      {/* Round reveal */}
      {revealed && roundResult && (
        <div className="w-full max-w-xs bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1.5">
          {Object.entries(roundResult.picks || {}).map(([pid, pick]) => {
            const player  = pid === 'cpu' ? { name: `CPU (${cpuDiff})` } : players.find(p => p.id === pid);
            const outcome = roundResult.outcomes?.[pid];
            return (
              <div key={pid} className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${
                outcome==='win' ? 'bg-green-100 dark:bg-green-900/30' :
                outcome==='lose' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-100 dark:bg-gray-700'
              }`}>
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[100px]">
                  {player?.name || pid}{pid === userId ? ' (you)' : ''}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xl">{PICK_EMOJI[pick]}</span>
                  {outcome==='win'  && <span className="text-xs font-black text-green-600">+1</span>}
                  {outcome==='lose' && <span className="text-xs font-black text-red-400">—</span>}
                  {outcome==='draw' && <span className="text-xs font-black text-gray-400">draw</span>}
                  {pid === userId && myPickTime && <span className="text-[9px] text-gray-400 ml-0.5">⚡{myPickTime}s</span>}
                </div>
              </div>
            );
          })}
          {beatText && <p className="text-[10px] text-center text-purple-500 italic pt-0.5">{beatText}</p>}
        </div>
      )}

      {/* Scoreboard */}
      {(status === 'playing' || isFinished) && players.length > 0 && (
        <div className="w-full max-w-xs">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 text-center mb-1">Scores</p>
          {sortedPlayers.map((p, i) => {
            const isMe = p.id === userId || (nickname && p.name === nickname);
            return (
              <div key={p.id} className="flex items-center justify-between px-2 py-0.5">
                <div className="flex items-center gap-1.5">
                  {i===0 && isFinished && <Trophy className="w-3 h-3 text-yellow-500" />}
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[120px]">
                    {p.name}{p.id===userId?' (you)':''}
                  </span>
                  {isMe && winStreak >= 2 && <span className="text-[9px] text-orange-500 font-black">🔥×{winStreak}</span>}
                </div>
                <span className="text-xs font-black tabular-nums" style={{ color: accentColor }}>{scores[p.id] ?? 0}</span>
              </div>
            );
          })}
          {isCpu && (
            <div className="flex items-center justify-between px-2 py-0.5">
              <span className="text-xs text-gray-700 dark:text-gray-300">CPU ({cpuDiff})</span>
              <span className="text-xs font-black tabular-nums" style={{ color: accentColor }}>{scores['cpu'] ?? 0}</span>
            </div>
          )}
        </div>
      )}

      {/* Match stats: win/loss/draw rates + best streak */}
      {playedRounds >= 2 && isMember && (
        <div className="w-full max-w-xs bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2 flex justify-between text-center">
          <div>
            <p className="text-[9px] text-gray-400 uppercase tracking-widest">Win%</p>
            <p className="text-sm font-black text-green-500">{winPct}%</p>
          </div>
          <div>
            <p className="text-[9px] text-gray-400 uppercase tracking-widest">Draw%</p>
            <p className="text-sm font-black text-gray-400">{drawPct}%</p>
          </div>
          <div>
            <p className="text-[9px] text-gray-400 uppercase tracking-widest">Loss%</p>
            <p className="text-sm font-black text-red-400">{lossPct}%</p>
          </div>
          {bestStreak >= 2 && (
            <div>
              <p className="text-[9px] text-gray-400 uppercase tracking-widest">Best 🔥</p>
              <p className="text-sm font-black text-orange-400">×{bestStreak}</p>
            </div>
          )}
        </div>
      )}

      {/* Round history */}
      {roundHistory.length > 0 && (
        <div className="w-full max-w-xs">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 text-center mb-1">History</p>
          <div className="space-y-0.5">
            {[...roundHistory].reverse().slice(0,5).map((r, i) => {
              const myP = r.picks?.[userId];
              const oppPid = Object.keys(r.picks||{}).find(pid=>pid!==userId);
              const oppP  = r.picks?.[oppPid];
              const outcome = r.outcomes?.[userId];
              return (
                <div key={i} className="flex items-center justify-between px-2 py-0.5 rounded text-[10px]">
                  <span className="text-gray-500">R{r.round}</span>
                  <span className="font-mono">{PICK_EMOJI[myP]??'?'} vs {PICK_EMOJI[oppP]??'?'}</span>
                  <span className={`font-black w-8 text-right ${outcome==='win'?'text-green-500':outcome==='lose'?'text-red-400':'text-gray-400'}`}>
                    {outcome==='win'?'+1':outcome==='lose'?'—':'tie'}
                  </span>
                  {r.pickTime && <span className="text-gray-500 w-8 text-right">⚡{r.pickTime}s</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Overall winner */}
      {isFinished && (overallWinner || gameData?.overallWinner) && (
        <div className="w-full max-w-xs rounded-xl p-3 text-center" style={{ background: accentColor + '22' }}>
          <Trophy className="w-8 h-8 text-yellow-500 mx-auto mb-1" />
          <p className="text-sm font-black text-gray-900 dark:text-white">
            {(overallWinner || gameData?.overallWinner)?.name === nickname ? '🎉 You win the match!' : `${(overallWinner || gameData?.overallWinner)?.name} wins!`}
          </p>
          {Object.values(pickStats).some(v=>v>0) && (
            <div className="flex justify-center gap-3 mt-2 flex-wrap">
              {PICKS.map(p => pickStats[p] > 0 && (
                <span key={p} className="text-[10px] text-gray-500">{PICK_EMOJI[p]} ×{pickStats[p]}</span>
              ))}
            </div>
          )}
        </div>
      )}
      {isFinished && !(overallWinner || gameData?.overallWinner) && (
        <p className="text-sm font-bold text-gray-500 text-center">Match ended in a tie!</p>
      )}

      {/* Lobby */}
      {isHost && status === 'waiting' && !isCpu && (
        <div className="flex flex-col items-center gap-2 w-full max-w-xs">
          <p className="text-xs text-gray-400 text-center">
            {players.length >= 2 ? `${players.length} players in lobby` : 'Waiting for someone to join…'}
          </p>
          {players.length >= 2 && (
            <button onClick={handleStartGame} className="w-full py-2 rounded-xl text-sm font-bold text-white" style={{ background: accentColor }}>
              ▶ Start Match
            </button>
          )}
          <button onClick={() => socketManager.emit('rps-set-cpu', { messageId, difficulty: 'medium' })} className="text-xs text-purple-500 hover:underline">
            🤖 Switch to vs CPU instead
          </button>
        </div>
      )}
      {!isHost && status === 'waiting' && (
        <p className="text-sm text-gray-400 text-center">Waiting for host to start…</p>
      )}
    </div>
  );
}
