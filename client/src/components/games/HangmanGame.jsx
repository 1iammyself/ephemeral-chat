import React, { useEffect, useRef, useState } from 'react';
import { Users, UserCheck, Loader2, Swords, RotateCcw } from 'lucide-react';
import confetti from 'canvas-confetti';
import { toast } from 'react-toastify';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const HangmanSVG = ({ mistakes }) => (
  <svg viewBox="0 0 120 140" className="w-20 h-24 sm:w-24 sm:h-28 mx-auto">
    {/* Gallows */}
    <line x1="10" y1="130" x2="110" y2="130" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-gray-500 dark:text-gray-400" />
    <line x1="30" y1="130" x2="30"  y2="10"  stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-gray-500 dark:text-gray-400" />
    <line x1="30" y1="10"  x2="75"  y2="10"  stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-gray-500 dark:text-gray-400" />
    <line x1="75" y1="10"  x2="75"  y2="25"  stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-gray-500 dark:text-gray-400" />
    {mistakes >= 1 && <circle cx="75" cy="35" r="10" stroke="currentColor" strokeWidth="2.5" fill="none" className="text-red-500" />}
    {mistakes >= 2 && <line x1="75" y1="45" x2="75" y2="85" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-red-500" />}
    {mistakes >= 3 && <line x1="75" y1="57" x2="55" y2="72" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-red-500" />}
    {mistakes >= 4 && <line x1="75" y1="57" x2="95" y2="72" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-red-500" />}
    {mistakes >= 5 && <line x1="75" y1="85" x2="55" y2="110" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-red-500" />}
    {mistakes >= 6 && <line x1="75" y1="85" x2="95" y2="110" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-red-500" />}
    {/* Smiley on no-mistakes (pre-game) */}
    {mistakes === 0 && (
      <>
        <circle cx="75" cy="35" r="10" stroke="currentColor" strokeWidth="2" fill="none" className="text-emerald-500" />
        <path d="M70 38 Q75 42 80 38" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" className="text-emerald-500" />
      </>
    )}
  </svg>
);

const HangmanGame = ({ message, currentUser, vibeColor, onHangmanJoin, onHangmanGuess, onHangmanHint, onRematch, onShareResult }) => {
  const { gameData } = message;
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const accent = vibeColor || '#334155';

  const isPlayer = (gameData.players || []).some(
    p => p.id === currentUserId || p.socketId === currentUserId ||
    (currentUser?.id && p.id === currentUser.id)
  );
  const isInvitedUser = gameData.invitedUserId && (
    gameData.invitedUserId === currentUserId ||
    (currentUser?.id && gameData.invitedUserId === currentUser.id)
  );
  const isSender = message.sender.socketId === currentUserId || message.sender.id === currentUserId;
  const senderName = message.sender.nickname || gameData.players?.[0]?.name || 'Host';

  const guessed      = gameData.guessed || {};
  const wrongLetters = gameData.wrongLetters || [];
  const display      = gameData.display || [];
  const mistakes     = gameData.mistakes || 0;
  const maxMistakes  = gameData.maxMistakes || 6;
  const livesLeft    = maxMistakes - mistakes;
  const isGameOver   = !!gameData.gameOver;
  const isWin        = gameData.winner === 'team';
  const isLoss       = gameData.winner === 'house';
  const players      = gameData.players || [];
  const playerCount  = players.length;
  const isCpuMode    = gameData.mode === 'cpu';

  const guessedSet = new Set([...Object.keys(guessed), ...wrongLetters]);
  const waitingForOpponent = gameData.isTargeted && playerCount < 2 && !isGameOver;
  const showInvitation = gameData.isTargeted && isInvitedUser && !isPlayer && !isGameOver;

  // Turn-based: in targeted 1v1, check if it's this player's turn
  // Custom word host: sender who set the word — watches, sees word, can't guess
  const isCustomWordHost = gameData.isCustomWord && isSender;

  const isMyTurn = isPlayer && !isGameOver && !waitingForOpponent && !isCustomWordHost;
  const statsKey = 'hangmanNativeStatsV1';
  const [stats, setStats] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(statsKey) || '{"wins":0,"losses":0,"streak":0,"bestStreak":0,"games":0}');
    } catch {
      return { wins: 0, losses: 0, streak: 0, bestStreak: 0, games: 0 };
    }
  });
  const endHandledRef = useRef(null);

  const [hardTimeLeft, setHardTimeLeft] = useState(null);
  const isHardTimed = gameData.difficulty === 'hard' && !!gameData.startedAt && !!gameData.timeLimit && !isGameOver;

  useEffect(() => {
    if (!isHardTimed) {
      setHardTimeLeft(null);
      return;
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - gameData.startedAt) / 1000);
      setHardTimeLeft(Math.max(0, gameData.timeLimit - elapsed));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isHardTimed, gameData.startedAt, gameData.timeLimit]);

  useEffect(() => {
    if (!isGameOver || endHandledRef.current === message.id) return;
    endHandledRef.current = message.id;

    const won = gameData.winner === 'team';
    setStats(prev => {
      const next = {
        wins: prev.wins + (won ? 1 : 0),
        losses: prev.losses + (won ? 0 : 1),
        streak: won ? prev.streak + 1 : 0,
        games: prev.games + 1,
        bestStreak: won ? Math.max(prev.bestStreak, prev.streak + 1) : prev.bestStreak,
      };
      try { localStorage.setItem(statsKey, JSON.stringify(next)); } catch (_) {}
      return next;
    });

    if (won) {
      confetti({ particleCount: 160, spread: 95, origin: { y: 0.75 } });
      toast.success('🎉 Hangman win! Nice teamwork.');
    } else {
      toast.info('💀 Round lost. Try a rematch!');
    }
  }, [isGameOver, message.id, gameData.winner]);

  const handleGuess = (letter) => {
    if (!isPlayer || isGameOver || guessedSet.has(letter) || waitingForOpponent || isCustomWordHost) return;
    onHangmanGuess(message.id, letter);
  };

  // Keyboard input support for desktop
  useEffect(() => {
  if (!isPlayer || isGameOver || waitingForOpponent || isCustomWordHost) return;

    const handleKeyPress = (e) => {
      const letter = e.key.toUpperCase();

      // Only handle single letters A-Z
      if (!/^[A-Z]$/.test(letter)) return;

      // Check if already guessed
      if (guessedSet.has(letter)) return;

      // Trigger the guess
      e.preventDefault();
      onHangmanGuess(message.id, letter);
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isPlayer, isGameOver, waitingForOpponent, isCustomWordHost, guessedSet, message.id, onHangmanGuess]);

  const diffBadge = gameData.difficulty === 'hard' ? 'bg-red-500 text-white'
    : gameData.difficulty === 'medium' ? 'bg-amber-500 text-white'
    : 'bg-emerald-500 text-white';

  // ── Invitation card ──────────────────────────────────────────────
  if (showInvitation) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🪓</span>
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200">Hangman Together</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0 ${diffBadge}`}>{gameData.difficulty || 'medium'}</span>
        </div>

        <div className="rounded-xl border-2 p-3 text-center space-y-2" style={{ borderColor: accent }}>
          <div className="text-2xl">💀</div>
          <div className="text-sm font-bold text-gray-800 dark:text-white">
            <span style={{ color: accent }}>{senderName}</span> dares you to hang!
          </div>
          <div className="flex items-center justify-center gap-3 text-[11px] text-gray-500">
            <span>📂 {gameData.category || 'Mystery'}</span>
            <span>❤️ {maxMistakes} lives</span>
          </div>
          {gameData.hint && (
            <div className="text-[11px] italic text-gray-400">💡 {gameData.hint}</div>
          )}
          {/* Blanks preview */}
          <div className="flex flex-wrap gap-1.5 justify-center pt-1">
            {display.map((_, i) => (
              <div key={i} className="w-5 h-0.5 rounded-full bg-gray-300 dark:bg-gray-600" />
            ))}
          </div>
        </div>

        <button
          onClick={() => onHangmanJoin(message.id)}
          className="w-full py-2 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
          style={{ backgroundColor: accent }}
        >
          <UserCheck className="w-4 h-4" />
          Join &amp; Guess
        </button>
      </div>
    );
  }

  // ── Sender waiting ───────────────────────────────────────────────
  if (waitingForOpponent && isSender) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🪓</span>
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200">Hangman Together</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0 ${diffBadge}`}>{gameData.difficulty || 'medium'}</span>
        </div>
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-4 text-center space-y-2">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
          <div className="text-sm font-bold text-gray-700 dark:text-gray-200">
            Waiting for <span style={{ color: accent }}>{gameData.invitedNickname}</span>…
          </div>
          <div className="text-[11px] text-gray-400">📂 {gameData.category} · {maxMistakes} lives</div>
        </div>
      </div>
    );
  }

  // ── Main game UI ─────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm shrink-0">🪓</span>
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">Hangman Together</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0 ${diffBadge}`}>{gameData.difficulty || 'medium'}</span>
          {isCpuMode && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase bg-violet-500 text-white shrink-0">Vs CPU</span>
          )}
        </div>
        {/* Lives — fewer hearts on mobile */}
        <div className="flex items-center gap-0.5 shrink-0 overflow-hidden max-w-[80px] sm:max-w-none">
          {Array.from({ length: Math.min(maxMistakes, 8) }).map((_, i) => (
            <span key={i} className={`text-[10px] sm:text-xs ${i < livesLeft ? 'text-red-500' : 'text-gray-300 dark:text-gray-700'}`}>
              {i < livesLeft ? '❤️' : '🩶'}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
        <div className="rounded-md bg-gray-100 dark:bg-gray-800 py-1"><span className="opacity-60">Score</span><div className="font-black">{stats.wins}</div></div>
        <div className="rounded-md bg-gray-100 dark:bg-gray-800 py-1"><span className="opacity-60">Best</span><div className="font-black">{stats.bestStreak}</div></div>
        <div className="rounded-md bg-gray-100 dark:bg-gray-800 py-1"><span className="opacity-60">Streak</span><div className="font-black">{stats.streak}</div></div>
        <div className="rounded-md bg-gray-100 dark:bg-gray-800 py-1"><span className="opacity-60">Games</span><div className="font-black">{stats.games}</div></div>
      </div>

      {/* 1v1 vs line + turn indicator */}
      {gameData.isTargeted && playerCount >= 2 && (
        <div className="space-y-0.5">
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-500">
            <span className="font-bold truncate max-w-[70px]" style={{ color: accent }}>{players[0]?.name}</span>
            <Swords className="w-3 h-3 text-gray-400 shrink-0" />
            <span className="font-bold truncate max-w-[70px]" style={{ color: accent }}>{players[1]?.name}</span>
          </div>
          {!isGameOver && (
            <div className="text-center text-[10px] font-bold">
              {isMyTurn
                ? <span className="text-emerald-600 dark:text-emerald-400">Your turn — guess a letter!</span>
                : <span className="text-gray-400">Waiting to play…</span>}
            </div>
          )}
        </div>
      )}

      {/* Category + hint */}
      <div className="text-center space-y-0.5">
        <div className="flex items-center justify-center gap-1.5">
          <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400">{gameData.category || 'Mystery'}</div>
          {isCustomWordHost && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: accent }}>Word Setter</span>
          )}
        </div>
  {gameData.hint && gameData.hintUsed && <div className="text-[11px] italic text-gray-500 dark:text-gray-400">💡 {gameData.hint}</div>}
        {/* Host sees the full word before game over */}
        {isCustomWordHost && !isGameOver && (
          <div className="text-[11px] font-mono font-bold tracking-widest" style={{ color: accent }}>{gameData.word}</div>
        )}
      </div>

      {isHardTimed && hardTimeLeft !== null && (
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-full transition-all ${hardTimeLeft <= 10 ? 'bg-red-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.max(0, (hardTimeLeft / gameData.timeLimit) * 100)}%` }}
            />
          </div>
          <div className={`text-center text-[10px] font-bold ${hardTimeLeft <= 10 ? 'text-red-500' : 'text-gray-400'}`}>
            ⏳ {hardTimeLeft}s
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-1">
        {Array.from({ length: Math.min(maxMistakes, 8) }).map((_, i) => (
          <span key={i} className={`w-2 h-2 rounded-full inline-block ${i < mistakes ? 'bg-red-500' : 'bg-gray-300 dark:bg-gray-700'}`} />
        ))}
      </div>

      {/* SVG */}
      <div className={`rounded-xl p-2 ${isLoss ? 'bg-red-50 dark:bg-red-950/20' : isWin ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
        <HangmanSVG mistakes={mistakes} />
      </div>

      {/* Word display */}
      <div className="flex flex-wrap gap-1 sm:gap-1.5 justify-center py-1">
        {display.map((char, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <span className={`text-base font-black font-mono w-5 sm:w-6 text-center leading-none ${
              char === '_' ? 'opacity-0 select-none' : isLoss ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
            }`}>{char === '_' ? 'A' : char}</span>
            <div className={`h-0.5 w-5 sm:w-6 rounded-full ${char === '_' ? 'bg-gray-400 dark:bg-gray-600' : 'bg-emerald-500'}`} />
            {char !== '_' && guessed[char] && (
              <span className="text-[7px] sm:text-[8px] text-gray-400 truncate max-w-[20px] sm:max-w-[24px] text-center leading-none mt-0.5">
                {guessed[char] === currentUserId ? 'you' : (players.find(p => p.id === guessed[char])?.name || '?').split(' ')[0]}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Game over */}
      {isGameOver && (
        <div className="space-y-1.5">
          <div className={`text-center py-2 rounded-xl font-bold text-sm ${isWin ? 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400'}`}>
            {isWin ? '🎉 Team wins! You got it!' : `💀 Hangman wins! Word: ${gameData.word || '???'}`}
          </div>
          <div className="flex gap-1.5">
            {(isPlayer || isCustomWordHost) && onShareResult && (
              <button
                onClick={() => {
                  const txt = isWin
                    ? `🎉 We beat Hangman! Guessed "${gameData.word}" with ${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} to spare!`
                    : `💀 Hangman got us — the word was "${gameData.word || '???'}"`;
                  onShareResult(txt);
                }}
                className="flex-1 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all active:scale-95 border"
                style={{ color: accent, borderColor: accent }}
              >
                📣 Share
              </button>
            )}
            {isPlayer && !isCustomWordHost && onRematch && (
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

      {/* Alphabet keyboard */}
      {!isGameOver && isPlayer && !waitingForOpponent && (
        <div className="space-y-2">
          {gameData.hint && !gameData.hintUsed && onHangmanHint && !isCustomWordHost && (
            <button
              onClick={() => onHangmanHint(message.id)}
              className="w-full py-1 rounded-lg border text-[10px] font-bold border-amber-400 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            >
              💡 Reveal Hint (−1 life)
            </button>
          )}

          <div className="flex flex-wrap gap-1 justify-center pt-0.5">
            {ALPHABET.map(letter => {
              const isCorrect = guessed[letter] !== undefined;
              const isWrong   = wrongLetters.includes(letter);
              return (
                <button
                  key={letter}
                  onClick={() => handleGuess(letter)}
                  disabled={isCorrect || isWrong || !isMyTurn}
                  className={`w-6 h-6 sm:w-7 sm:h-7 text-[10px] sm:text-xs font-bold rounded transition-all active:scale-90 ${
                    isCorrect ? 'bg-emerald-500 text-white cursor-default'
                    : isWrong ? 'bg-red-300 dark:bg-red-900/60 text-red-700 dark:text-red-400 cursor-default opacity-60'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:text-white'
                  }`}
                  onMouseEnter={e => { if (!isCorrect && !isWrong && isMyTurn) e.currentTarget.style.backgroundColor = accent; }}
                  onMouseLeave={e => { if (!isCorrect && !isWrong) e.currentTarget.style.backgroundColor = ''; }}
                >
                  {letter}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-2 text-[10px] text-gray-400 flex-wrap">
            <span className="px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-700 font-mono">A–Z</span>
            <span>guess letters</span>
            <span className="px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-700 font-mono">Tap</span>
            <span>mobile keyboard</span>
            <span className="px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-700 font-mono">Type</span>
            <span>physical keyboard</span>
          </div>
        </div>
      )}

      {/* Join button — non-targeted spectators */}
      {!isPlayer && !isGameOver && !gameData.isTargeted && !isCpuMode && (
        <button
          onClick={() => onHangmanJoin(message.id)}
          className="w-full py-1.5 rounded-lg text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors active:scale-95"
          style={{ backgroundColor: accent }}
        >
          <Users className="w-3.5 h-3.5" />
          Join &amp; Guess
        </button>
      )}

      {!isPlayer && !isGameOver && isCpuMode && (
        <div className="text-center text-[11px] text-gray-400">CPU match in progress — spectating only.</div>
      )}

      {/* Wrong + players footer */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {wrongLetters.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-gray-400 shrink-0">Wrong:</span>
            {wrongLetters.map(l => <span key={l} className="text-xs font-bold text-red-400 line-through">{l}</span>)}
          </div>
        )}
        {players.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-gray-400 shrink-0">Playing:</span>
            {players.map(p => (
              <span key={p.id} className="text-[10px] bg-gray-100 dark:bg-gray-800 rounded-full px-1.5 py-0.5 text-gray-600 dark:text-gray-400">{p.name}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HangmanGame;
