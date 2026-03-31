import React, { useState, useEffect, useRef } from 'react';
import { Clock, Trophy, ChevronRight, Check, X as XIcon, Puzzle, Loader2, Swords, UserCheck, RotateCcw } from 'lucide-react';

const DIFF_COLORS = {
  novice: { pill: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800' },
  adept:  { pill: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-950/30',   border: 'border-amber-200 dark:border-amber-800' },
  expert: { pill: 'bg-red-500',     text: 'text-red-600 dark:text-red-400',       bg: 'bg-red-50 dark:bg-red-950/30',       border: 'border-red-200 dark:border-red-800' },
  master: { pill: 'bg-violet-500',  text: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-200 dark:border-violet-800' },
};

const AnagramGame = ({
  message, currentUser, vibeColor, vibeAccent,
  onAnagramSubmit, onAnagramNextRound, onAnagramReveal, onAnagramJoin, onAnagramHint, onRematch, onShareResult,
}) => {
  const { gameData } = message;
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const isSender = message.sender.socketId === currentUserId || message.sender.id === currentUserId;

  const [inputWord, setInputWord] = useState('');
  const [timeLeft, setTimeLeft] = useState(null);
  const [localRevealed, setLocalRevealed] = useState(false);
  const [nextRoundIn, setNextRoundIn] = useState(null);
  const nextRoundTimerRef = useRef(null);

  const difficulty = gameData.difficulty || 'novice';
  const dc = DIFF_COLORS[difficulty] || DIFF_COLORS.novice;
  const accent = vibeColor || '#7C3AED';

  // Identity checks
  const isInPlayers = (gameData.players || []).some(
    p => p.id === currentUserId || p.socketId === currentUserId ||
    (currentUser?.id && p.id === currentUser.id)
  );
  const isInvitedUser = gameData.invitedUserId && (
    gameData.invitedUserId === currentUserId ||
    (currentUser?.id && gameData.invitedUserId === currentUser.id)
  );
  const senderName = message.sender.nickname || gameData.players?.[0]?.name || 'Host';
  const opponentEntry = (gameData.players || []).find(
    p => p.id !== currentUserId && p.socketId !== currentUserId &&
    !(currentUser?.id && p.id === currentUser.id)
  );

  const hasSubmitted = !!(
    (gameData.answers?.[currentUserId] !== undefined) ||
    (currentUser?.id && gameData.answers?.[currentUser.id] !== undefined)
  );
  const isRevealed = gameData.revealed || localRevealed || gameData.gameOver;
  // Custom word host: sender who set the word — can see it but can't play
  const isCustomWordHost = gameData.isCustomWord && isSender;
  const submittedCount = Object.keys(gameData.answers || {}).length;
  const playerCount = (gameData.players || []).length;

  // Targeted: waiting for opponent to join
  const waitingForOpponent = gameData.isTargeted && playerCount < 2 && !gameData.gameOver;
  // Show invitation to the invited user
  const showInvitation = gameData.isTargeted && isInvitedUser && !isInPlayers && !gameData.gameOver;

  // Timer countdown — only starts when startedAt is set
  useEffect(() => {
    if (!gameData.startedAt || isRevealed) return;
    const tick = () => {
      const elapsed = (Date.now() - gameData.startedAt) / 1000;
      const left = Math.max(0, Math.ceil((gameData.timeLimit || 60) - elapsed));
      setTimeLeft(left);
      if (left <= 0) {
        setLocalRevealed(true);
        onAnagramReveal(message.id);
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [gameData.startedAt, gameData.timeLimit, isRevealed, message.id, onAnagramReveal]);

  useEffect(() => {
    setInputWord('');
    setLocalRevealed(false);
    setNextRoundIn(null);
    if (nextRoundTimerRef.current) clearInterval(nextRoundTimerRef.current);
  }, [gameData.currentRound]);

  // Auto-advance countdown display for non-senders (mirrors sender's 5s timer)
  useEffect(() => {
    if (!isRevealed || gameData.gameOver || isSender || currentRound >= totalRounds) return;
    let count = 5;
    setNextRoundIn(count);
    const t = setInterval(() => {
      count--;
      if (count <= 0) { clearInterval(t); setNextRoundIn(null); }
      else setNextRoundIn(count);
    }, 1000);
    return () => { clearInterval(t); setNextRoundIn(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRevealed, gameData.gameOver, currentRound]);

  // Auto-advance: 5s countdown after reveal (sender only)
  useEffect(() => {
    if (!isRevealed || gameData.gameOver || !isSender || currentRound >= totalRounds) return;
    let count = 5;
    setNextRoundIn(count);
    nextRoundTimerRef.current = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(nextRoundTimerRef.current);
        setNextRoundIn(null);
        onAnagramNextRound(message.id);
      } else {
        setNextRoundIn(count);
      }
    }, 1000);
    return () => { clearInterval(nextRoundTimerRef.current); setNextRoundIn(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRevealed, gameData.gameOver, currentRound]);

  const handleSubmit = () => {
    if (!inputWord.trim() || hasSubmitted || !isInPlayers) return;
    onAnagramSubmit(message.id, inputWord.trim().toUpperCase());
    setInputWord('');
  };

  const timerPct = timeLeft !== null && gameData.timeLimit
    ? (timeLeft / gameData.timeLimit) * 100 : 100;
  const timerColor = timerPct > 50 ? 'bg-violet-500' : timerPct > 25 ? 'bg-amber-500' : 'bg-red-500';

  const sortedPlayers = [...(gameData.players || [])].sort((a, b) =>
    (gameData.scores?.[b.id] || 0) - (gameData.scores?.[a.id] || 0)
  );
  const currentRound = gameData.currentRound || 1;
  const totalRounds = gameData.totalRounds || 5;
  const revealedWord = gameData.word || gameData.roundHistory?.[gameData.roundHistory.length - 1]?.word;

  // ── Invitation card ──────────────────────────────────────────────
  if (showInvitation) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Puzzle className="w-4 h-4 text-violet-500 shrink-0" />
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200">Anagram Challenge</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${dc.pill} text-white uppercase shrink-0`}>{difficulty}</span>
        </div>

        <div className="rounded-xl border-2 p-3 text-center space-y-1.5" style={{ borderColor: accent }}>
          <div className="text-lg">⚔️</div>
          <div className="text-sm font-bold text-gray-800 dark:text-white">
            <span style={{ color: accent }}>{senderName}</span> challenged you!
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            {totalRounds} rounds · {difficulty} difficulty
          </div>
          {/* Preview tiles — blurred */}
          <div className="flex flex-wrap gap-1 justify-center py-1">
            {(gameData.letters || []).map((_, i) => (
              <div key={i} className="w-7 h-7 flex items-center justify-center rounded-lg bg-amber-400/40 dark:bg-amber-500/30 text-amber-900/0 font-black text-sm border-b-2 border-amber-600/30">
                ?
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => onAnagramJoin(message.id)}
          className="w-full py-2 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
          style={{ backgroundColor: accent }}
        >
          <UserCheck className="w-4 h-4" />
          Accept Challenge
        </button>
      </div>
    );
  }

  // ── Sender waiting for invited user ──────────────────────────────
  if (gameData.isTargeted && waitingForOpponent && isSender) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Puzzle className="w-4 h-4 text-violet-500 shrink-0" />
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200">Anagram Challenge</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${dc.pill} text-white uppercase shrink-0`}>{difficulty}</span>
        </div>
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-4 text-center space-y-1.5">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
          <div className="text-sm font-bold text-gray-700 dark:text-gray-200">
            Waiting for <span style={{ color: accent }}>{gameData.invitedNickname}</span>…
          </div>
          <div className="text-[11px] text-gray-400">{totalRounds} rounds · {difficulty}</div>
        </div>
      </div>
    );
  }

  // ── Main game UI ─────────────────────────────────────────────────
  return (
    <div className="space-y-2 select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Puzzle className="w-4 h-4 text-violet-500 shrink-0" />
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">Anagram Challenge</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${dc.pill} text-white uppercase shrink-0`}>{difficulty}</span>
        </div>
        <span className="text-[10px] font-bold text-gray-400 shrink-0">Round {currentRound}/{totalRounds}</span>
      </div>

      {/* 1v1 vs line */}
      {gameData.isTargeted && playerCount >= 2 && (
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-500">
          <span className="font-bold truncate max-w-[80px]" style={{ color: accent }}>
            {gameData.players?.[0]?.name}
          </span>
          <Swords className="w-3 h-3 text-gray-400 shrink-0" />
          <span className="font-bold truncate max-w-[80px]" style={{ color: accent }}>
            {gameData.players?.[1]?.name}
          </span>
        </div>
      )}

      {/* Letter tiles — locked (no timer yet in targeted mode) */}
      {waitingForOpponent ? (
        <div className="flex flex-wrap gap-1 justify-center py-1">
          {(gameData.letters || []).map((_, i) => (
            <div key={i} className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-400 font-black text-sm border-b-2 border-gray-300 dark:border-gray-600">?</div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1 justify-center py-1">
          {(gameData.letters || []).map((letter, i) => (
            <div key={i} className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg bg-amber-400 dark:bg-amber-500 text-amber-900 font-black text-sm sm:text-base shadow-sm border-b-2 border-amber-600 dark:border-amber-700">
              {letter}
            </div>
          ))}
        </div>
      )}

      {/* Timer bar */}
      {!isRevealed && gameData.startedAt && !waitingForOpponent && (
        <>
          <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className={`h-full ${timerColor} transition-all duration-500 rounded-full`} style={{ width: `${timerPct}%` }} />
          </div>
          {timeLeft !== null && (
            <div className="flex items-center justify-center gap-1 text-[11px] text-gray-500">
              <Clock className="w-3 h-3" />
              <span className={timeLeft <= 10 ? 'text-red-500 font-bold' : ''}>{timeLeft}s</span>
              <span className="text-gray-400">· {submittedCount}/{playerCount} answered</span>
            </div>
          )}
        </>
      )}

      {/* Host view — custom word setter sees the word but can't play */}
      {isCustomWordHost && !isRevealed && (
        <div className="rounded-lg border border-dashed px-3 py-2 text-center space-y-0.5" style={{ borderColor: accent }}>
          <div className="text-[10px] uppercase font-bold tracking-wider opacity-60" style={{ color: accent }}>You set this word</div>
          <div className="text-base font-black font-mono tracking-widest" style={{ color: accent }}>{gameData.word || '?'}</div>
          <div className="text-[10px] text-gray-400">{submittedCount}/{playerCount} answered</div>
        </div>
      )}

      {/* Input */}
      {!isRevealed && !hasSubmitted && isInPlayers && !isCustomWordHost && !waitingForOpponent && gameData.startedAt && (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={inputWord}
            onChange={e => setInputWord(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            maxLength={20}
            placeholder="Spell the word…"
            className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 font-mono uppercase"
            style={{ '--tw-ring-color': accent }}
          />
          <button
            onClick={handleSubmit}
            disabled={!inputWord.trim()}
            className="px-3 py-2 rounded-lg disabled:opacity-40 text-white text-xs font-bold transition-colors shrink-0 active:scale-95"
            style={{ backgroundColor: accent }}
          >
            Submit
          </button>
        </div>
      )}

      {/* Hint display / button */}
      {!isRevealed && gameData.startedAt && !waitingForOpponent && (
        <div className="flex items-center justify-between gap-2">
          {gameData.hintLetter ? (
            <div className="text-[11px] text-amber-600 dark:text-amber-400 font-bold">💡 First letter: <span className="font-mono">{gameData.hintLetter}</span></div>
          ) : (
            <div />
          )}
          {isInPlayers && !isCustomWordHost && !gameData.hintUsed && !hasSubmitted && (
            <button
              onClick={() => onAnagramHint && onAnagramHint(message.id)}
              className="text-[10px] px-2 py-0.5 rounded-full border text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors shrink-0"
            >
              💡 Hint −5pts
            </button>
          )}
        </div>
      )}

      {/* Submitted waiting */}
      {!isRevealed && hasSubmitted && (
        <div className="flex items-center justify-center gap-2 py-1.5 text-xs text-gray-500">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Submitted! Waiting… ({submittedCount}/{playerCount})</span>
        </div>
      )}

      {/* Revealed */}
      {isRevealed && (
        <div className={`rounded-xl p-2.5 space-y-2 ${dc.bg} border ${dc.border}`}>
          <div className={`text-center font-black text-xl tracking-widest ${dc.text}`}>{revealedWord || '?'}</div>
          <div className="space-y-1">
            {(gameData.players || []).map(player => {
              const ans = gameData.answers?.[player.id];
              const correct = ans?.word && ans.word.toUpperCase() === revealedWord;
              const timeSec = ans?.submittedAt && gameData.startedAt
                ? ((ans.submittedAt - gameData.startedAt) / 1000).toFixed(1) : null;
              return (
                <div key={player.id} className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-gray-700 dark:text-gray-200 truncate flex-1">{player.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {ans ? (
                      <>
                        <span className={`font-mono font-bold ${correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{ans.word}</span>
                        {correct ? <Check className="w-3 h-3 text-emerald-500" /> : <XIcon className="w-3 h-3 text-red-400" />}
                        {timeSec && <span className="text-gray-400">{timeSec}s</span>}
                      </>
                    ) : <span className="text-gray-400 italic">no answer</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scores */}
      {sortedPlayers.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Scores</div>
          {sortedPlayers.map((player, idx) => {
            const streak = gameData.streaks?.[player.id] || 0;
            return (
              <div key={player.id} className="flex items-center gap-1.5 text-xs">
                {idx === 0 ? <Trophy className="w-3 h-3 text-amber-500 shrink-0" /> : <span className="w-3 h-3 shrink-0" />}
                <span className={`font-medium truncate flex-1 ${idx === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>{player.name}</span>
                {streak >= 3 && <span className="text-[9px] font-bold text-orange-500 shrink-0">🔥{streak}</span>}
                <span className="font-bold shrink-0" style={{ color: accent }}>{gameData.scores?.[player.id] || 0} pts</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Game over */}
      {gameData.gameOver && sortedPlayers.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-center py-2 rounded-xl" style={{ backgroundColor: `${accent}20` }}>
            <div className="text-xs font-bold uppercase tracking-wider mb-0.5 opacity-70" style={{ color: accent }}>Game Over</div>
            <div className="text-sm font-black" style={{ color: accent }}>
              🏆 {sortedPlayers[0].name} wins with {gameData.scores?.[sortedPlayers[0].id] || 0} pts!
            </div>
          </div>
          <div className="flex gap-1.5">
            {(isInPlayers || isCustomWordHost) && onShareResult && (
              <button
                onClick={() => {
                  const top = sortedPlayers[0];
                  onShareResult(`🧩 Anagram done! ${top?.name} wins with ${gameData.scores?.[top?.id] || 0} pts after ${totalRounds} rounds!`);
                }}
                className="flex-1 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all active:scale-95 border"
                style={{ color: accent, borderColor: accent }}
              >
                📣 Share
              </button>
            )}
            {isInPlayers && onRematch && (
              <button
                onClick={() => onRematch(message.id)}
                className="flex-1 py-1.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 opacity-80 hover:opacity-100"
                style={{ backgroundColor: accent }}
              >
                <RotateCcw className="w-3 h-3" /> Rematch
              </button>
            )}
          </div>
        </div>
      )}

      {/* Next round */}
      {isRevealed && !gameData.gameOver && currentRound < totalRounds && (isSender || isInPlayers) && (
        <button
          onClick={() => {
            if (nextRoundTimerRef.current) clearInterval(nextRoundTimerRef.current);
            setNextRoundIn(null);
            onAnagramNextRound(message.id);
          }}
          className="w-full py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1 transition-all active:scale-95"
          style={{ backgroundColor: accent }}
        >
          {nextRoundIn !== null
            ? (isSender ? `Next Round in ${nextRoundIn}s (tap to skip)` : `Next round in ${nextRoundIn}s…`)
            : <>{isSender ? 'Next Round' : 'Start Next Round'} <ChevronRight className="w-3 h-3" /></>}
        </button>
      )}
    </div>
  );
};

export default AnagramGame;
