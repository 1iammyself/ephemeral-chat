import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Flag, Users, Play, Loader2, UserCheck, Swords, RotateCcw, Clock } from 'lucide-react';

const TypingRaceGame = ({
  message, currentUser, vibeColor,
  onTypingRaceJoin, onTypingRaceStart, onTypingRaceProgress, onTypingRaceFinish, onRematch, onShareResult,
}) => {
  const { gameData } = message;
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const isSender = message.sender.socketId === currentUserId || message.sender.id === currentUserId;
  const accent = vibeColor || '#2563EB';

  // Find myself in the players map
  const myKey = Object.keys(gameData.players || {}).find(k => {
    const p = gameData.players[k];
    return p.id === currentUserId || p.socketId === currentUserId ||
      (currentUser?.id && p.id === currentUser.id);
  });
  const myPlayer  = myKey ? gameData.players[myKey] : null;
  const isPlayer  = !!myPlayer;
  const iFinished = !!(myPlayer?.finishedAt);

  const isInvitedUser = gameData.invitedUserId && (
    gameData.invitedUserId === currentUserId ||
    (currentUser?.id && gameData.invitedUserId === currentUser.id)
  );
  const senderName = message.sender.nickname || 'Host';
  const allPlayers = Object.values(gameData.players || {});
  const waitingForOpponent = gameData.isTargeted && allPlayers.length < 2 && gameData.status === 'waiting';
  const showInvitation = gameData.isTargeted && isInvitedUser && !isPlayer && gameData.status === 'waiting';

  const status = gameData.status || 'waiting';
  const text   = gameData.text || '';

  const [typed, setTyped]         = useState('');
  const [countdown, setCountdown] = useState(null);
  const [localWpm, setLocalWpm]   = useState(0);
  const [rawWpm, setRawWpm]       = useState(0);
  const [errors, setErrors]       = useState(0);
  const [capsOn, setCapsOn]       = useState(false);
  const [pacerSpeed, setPacerSpeed] = useState(7);
  const [ghostIndex, setGhostIndex] = useState(0);
  const [errorHeatmap, setErrorHeatmap] = useState(() => {
    try { return JSON.parse(localStorage.getItem('typingRaceHeatmapV1') || '{}'); } catch { return {}; }
  });
  const [wpmHistory, setWpmHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('typingRaceHistoryV1') || '[]'); } catch { return []; }
  });
  const [testStreak, setTestStreak] = useState(() => {
    try { return parseInt(localStorage.getItem('typingRaceStreakV1') || '0', 10); } catch { return 0; }
  });
  const [isNewPB, setIsNewPB]     = useState(false);
  const [personalBest, setPersonalBest] = useState(() => {
    try { return parseInt(localStorage.getItem('typingRacePB') || '0', 10); } catch (_) { return 0; }
  });
  const startTimeRef    = useRef(null);
  const lastProgressRef = useRef(0);
  const inputRef        = useRef(null);
  const finishedRef     = useRef(false);

  // Countdown
  useEffect(() => {
    if (status !== 'racing' || !gameData.startedAt) return;
    const tick = () => {
      const ms = gameData.startedAt - Date.now();
      if (ms > 0) {
        setCountdown(Math.ceil(ms / 1000));
      } else {
        setCountdown(null);
        if (!startTimeRef.current) startTimeRef.current = gameData.startedAt;
        if (inputRef.current && isPlayer && !iFinished) inputRef.current.focus();
      }
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [status, gameData.startedAt, isPlayer, iFinished]);

  useEffect(() => {
    if (status === 'waiting') {
      setTyped(''); setLocalWpm(0); setRawWpm(0); setErrors(0); setIsNewPB(false); setGhostIndex(0);
      finishedRef.current = false; startTimeRef.current = null;
    }
  }, [status]);

  useEffect(() => {
    const onKey = (e) => {
      if (typeof e.getModifierState === 'function') {
        setCapsOn(e.getModifierState('CapsLock'));
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  useEffect(() => {
    if (status !== 'racing' || countdown !== null || !startTimeRef.current || iFinished) return;
    const id = setInterval(() => {
      const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
      const idx = Math.min(text.length - 1, Math.floor(elapsedSec * pacerSpeed));
      setGhostIndex(Math.max(0, idx));
    }, 120);
    return () => clearInterval(id);
  }, [status, countdown, iFinished, text.length, pacerSpeed]);

  // Personal best detection
  useEffect(() => {
    if (!iFinished || !myPlayer?.wpm) return;
    const wpm = myPlayer.wpm;
    if (wpm > personalBest) {
      setPersonalBest(wpm);
      setIsNewPB(true);
      try { localStorage.setItem('typingRacePB', String(wpm)); } catch (_) {}
    }
  }, [iFinished, myPlayer?.wpm]); // eslint-disable-line react-hooks/exhaustive-deps

  const calcWpm = useCallback((typedText) => {
    if (!startTimeRef.current) return { wpm: 0, errs: 0 };
    const elapsedMin = Math.max(0.001, (Date.now() - startTimeRef.current) / 60000);
    let errs = 0;
    for (let i = 0; i < typedText.length; i++) { if (typedText[i] !== text[i]) errs++; }
    const correct = typedText.length - errs;
    return { wpm: Math.max(0, Math.round((correct / 5) / elapsedMin)), errs };
  }, [text]);

  const handleChange = useCallback((e) => {
    if (!isPlayer || iFinished || countdown !== null || status !== 'racing' || finishedRef.current) return;
    const val = e.target.value.slice(0, text.length);
    setTyped(val);
    let errs = 0;
    for (let i = 0; i < val.length; i++) { if (val[i] !== text[i]) errs++; }
    setErrors(errs);
    const { wpm } = calcWpm(val);
    setLocalWpm(wpm);
    const elapsedMin = startTimeRef.current ? Math.max(0.001, (Date.now() - startTimeRef.current) / 60000) : 0.001;
    setRawWpm(Math.max(0, Math.round((val.length / 5) / elapsedMin)));
    const progress = val.length / text.length;
    const acc = val.length > 0 ? Math.round(((val.length - errs) / val.length) * 100) : 100;

    if (val.length > 0) {
      const i = val.length - 1;
      if (val[i] !== text[i]) {
        const key = (val[i] || '').toUpperCase();
        if (key) {
          setErrorHeatmap(prev => {
            const next = { ...prev, [key]: (prev[key] || 0) + 1 };
            try { localStorage.setItem('typingRaceHeatmapV1', JSON.stringify(next)); } catch (_) {}
            return next;
          });
        }
      }
    }
    const now = Date.now();
    if (now - lastProgressRef.current > 500) {
      lastProgressRef.current = now;
      onTypingRaceProgress(message.id, progress, wpm, acc, errs);
    }
    if (val.length === text.length && !finishedRef.current) {
      finishedRef.current = true;
      const timeSecs = startTimeRef.current ? Math.round((Date.now() - startTimeRef.current) / 1000) : 0;
      const finalAcc = val.length > 0 ? Math.round(((val.length - errs) / val.length) * 100) : 100;
      onTypingRaceFinish(message.id, wpm, finalAcc, errs, timeSecs);

      setWpmHistory(prev => {
        const next = [...prev, wpm].slice(-20);
        try { localStorage.setItem('typingRaceHistoryV1', JSON.stringify(next)); } catch (_) {}
        return next;
      });
      setTestStreak(prev => {
        const next = prev + 1;
        try { localStorage.setItem('typingRaceStreakV1', String(next)); } catch (_) {}
        return next;
      });
    }
  }, [isPlayer, iFinished, countdown, status, text, calcWpm, message.id, onTypingRaceProgress, onTypingRaceFinish]);

  const sortedPlayers = [...allPlayers].sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank;
    if (a.rank) return -1; if (b.rank) return 1;
    return (b.progress || 0) - (a.progress || 0);
  });

  const renderText = () => (
    <span className="font-mono text-xs sm:text-sm leading-relaxed">
      {text.split('').map((char, i) => {
        let cls = 'text-gray-400 dark:text-gray-500';
        if (i < typed.length) {
          cls = typed[i] === char ? 'text-cyan-600 dark:text-cyan-400' : 'text-red-500 bg-red-100 dark:bg-red-950/50 rounded-sm';
        } else if (i === typed.length) {
          cls = 'text-gray-800 dark:text-gray-100 border-l-2 border-blue-500 animate-pulse';
        }
        return <span key={i} className={cls}>{char === ' ' ? '\u00A0' : char}</span>;
      })}
    </span>
  );

  const diffBadge = gameData.difficulty === 'hard' ? 'bg-red-500'
    : gameData.difficulty === 'medium' ? 'bg-amber-500' : 'bg-emerald-500';

  const isCustomTextHost = gameData.isCustomText && isSender;

  // ── Custom text host view ────────────────────────────────────────
  if (isCustomTextHost) {
    const totalPlayers = allPlayers.length;
    const finishedCount = allPlayers.filter(p => p.finishedAt).length;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 shrink-0" style={{ color: accent }} />
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200">Type Race</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500 text-white uppercase shrink-0">Text Setter</span>
        </div>
        <div className="rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/40 p-2.5 space-y-1">
          <div className="text-[10px] font-semibold text-violet-600 dark:text-violet-300 uppercase tracking-wide">Your custom text</div>
          <div className="font-mono text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3">{text}</div>
        </div>
        {status === 'waiting' && (
          <div className="text-[11px] text-gray-500 text-center">Waiting for players to join…</div>
        )}
        {status === 'racing' && (
          <div className="space-y-1">
            {sortedPlayers.map(p => (
              <div key={p.id || p.socketId} className="flex items-center gap-1.5 text-xs">
                <span className="font-medium text-gray-700 dark:text-gray-200 truncate flex-1">{p.name}</span>
                <div className="w-20 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden shrink-0">
                  <div className="h-full rounded-full transition-all" style={{ width: `${(p.progress || 0) * 100}%`, backgroundColor: accent }} />
                </div>
                <span className="text-[10px] text-gray-400 shrink-0">{Math.round((p.progress || 0) * 100)}%</span>
              </div>
            ))}
          </div>
        )}
        {status === 'finished' && (
          <div className="space-y-1.5">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-2 space-y-1">
              {sortedPlayers.filter(p => p.rank).map(p => (
                <div key={p.id || p.socketId} className="flex items-center gap-1.5 text-xs">
                  <span className={`font-black w-5 shrink-0 ${p.rank === 1 ? 'text-amber-500' : p.rank === 2 ? 'text-gray-400' : 'text-amber-700'}`}>
                    {p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : '🥉'}
                  </span>
                  <span className="font-medium text-gray-700 dark:text-gray-200 truncate flex-1">{p.name}</span>
                  <span className="font-bold shrink-0" style={{ color: accent }}>{p.wpm} WPM</span>
                </div>
              ))}
            </div>
            {onShareResult && (() => {
              const winner = sortedPlayers.find(p => p.rank === 1);
              const txt = winner ? `⌨️ Typing Race: ${winner.name} wins at ${winner.wpm} WPM!` : '⌨️ Typing Race done!';
              return (
                <button
                  onClick={() => onShareResult(txt)}
                  className="w-full py-1.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 opacity-80 hover:opacity-100"
                  style={{ backgroundColor: accent }}
                >📣 Share</button>
              );
            })()}
          </div>
        )}
      </div>
    );
  }

  // ── Invitation card ──────────────────────────────────────────────
  if (showInvitation) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 shrink-0" style={{ color: accent }} />
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200">Type Race</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase text-white shrink-0 ${diffBadge}`}>{gameData.difficulty || 'easy'}</span>
        </div>

        <div className="rounded-xl border-2 p-3 text-center space-y-2" style={{ borderColor: accent }}>
          <div className="text-2xl">🏎️</div>
          <div className="text-sm font-bold text-gray-800 dark:text-white">
            <span style={{ color: accent }}>{senderName}</span> challenges you to a typing duel!
          </div>
          <div className="text-[11px] text-gray-500">{gameData.difficulty} difficulty · first to finish wins</div>
          {/* Preview of text length */}
          <div className="text-[10px] text-gray-400 bg-gray-50 dark:bg-gray-800/60 rounded-lg px-2 py-1.5 font-mono text-left truncate">
            {text.slice(0, 40)}…
          </div>
        </div>

        <button
          onClick={() => onTypingRaceJoin(message.id)}
          className="w-full py-2 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
          style={{ backgroundColor: accent }}
        >
          <UserCheck className="w-4 h-4" />
          Accept Race
        </button>
      </div>
    );
  }

  // ── Sender waiting ───────────────────────────────────────────────
  if (waitingForOpponent && isSender) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 shrink-0" style={{ color: accent }} />
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200">Type Race</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase text-white shrink-0 ${diffBadge}`}>{gameData.difficulty || 'easy'}</span>
        </div>
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-4 text-center space-y-2">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
          <div className="text-sm font-bold text-gray-700 dark:text-gray-200">
            Waiting for <span style={{ color: accent }}>{gameData.invitedNickname}</span>…
          </div>
          <div className="text-[10px] text-gray-400 font-mono truncate">{text.slice(0, 50)}…</div>
        </div>
      </div>
    );
  }

  // ── Main game UI ─────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Zap className="w-4 h-4 shrink-0" style={{ color: accent }} />
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">Type Race</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase text-white shrink-0 ${diffBadge}`}>{gameData.difficulty || 'easy'}</span>
        </div>
        {status === 'racing' && countdown === null && localWpm > 0 && (
            <span className="text-xs font-bold shrink-0" style={{ color: accent }}>Net {localWpm} / Raw {rawWpm}</span>
        )}
      </div>

        {capsOn && (
          <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 text-center">⚠️ Caps Lock is ON</div>
        )}

        <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
          <div className="rounded-md bg-gray-100 dark:bg-gray-800 py-1"><span className="opacity-60">Net</span><div className="font-black">{localWpm}</div></div>
          <div className="rounded-md bg-gray-100 dark:bg-gray-800 py-1"><span className="opacity-60">Raw</span><div className="font-black">{rawWpm}</div></div>
          <div className="rounded-md bg-gray-100 dark:bg-gray-800 py-1"><span className="opacity-60">Acc</span><div className="font-black">{typed.length > 0 ? Math.max(0, Math.round(((typed.length - errors) / typed.length) * 100)) : 100}%</div></div>
          <div className="rounded-md bg-gray-100 dark:bg-gray-800 py-1"><span className="opacity-60">Chars</span><div className="font-black">{typed.length}/{text.length}</div></div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span>Pacer speed</span>
            <span>{pacerSpeed} cps · Streak {testStreak}</span>
          </div>
          <input type="range" min={3} max={15} value={pacerSpeed} onChange={(e) => setPacerSpeed(parseInt(e.target.value, 10))} className="w-full" />
        </div>

        <div className="space-y-1">
          <div className="text-[10px] text-gray-400">Skill Zone</div>
          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div className={`h-full ${localWpm < 35 ? 'bg-blue-500' : localWpm < 60 ? 'bg-emerald-500' : localWpm < 100 ? 'bg-lime-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, (localWpm / 120) * 100)}%` }} />
          </div>
        </div>

        {wpmHistory.length > 1 && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-900/50">
            <div className="text-[10px] text-gray-400 mb-1">WPM History</div>
            <svg viewBox="0 0 200 40" className="w-full h-10">
              <polyline
                fill="none"
                stroke={accent}
                strokeWidth="2"
                points={wpmHistory.map((v, i) => `${(i / Math.max(1, wpmHistory.length - 1)) * 200},${40 - Math.min(38, (v / 120) * 38)}`).join(' ')}
              />
            </svg>
          </div>
        )}

        {Object.keys(errorHeatmap).length > 0 && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-900/50">
            <div className="text-[10px] text-gray-400 mb-1">Error Heatmap (top keys)</div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(errorHeatmap)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 12)
                .map(([k, v]) => (
                  <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-bold">{k}:{v}</span>
                ))}
            </div>
          </div>
        )}

      {/* 1v1 vs */}
      {gameData.isTargeted && allPlayers.length >= 2 && (
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-500">
          <span className="font-bold truncate max-w-[70px]" style={{ color: accent }}>{sortedPlayers[0]?.name}</span>
          <Swords className="w-3 h-3 text-gray-400 shrink-0" />
          <span className="font-bold truncate max-w-[70px]" style={{ color: accent }}>{sortedPlayers[1]?.name}</span>
        </div>
      )}

      {/* Difficulty indicator, text preview, and timer */}
      <div className="space-y-1.5">
        {/* Difficulty badge with color coding */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400">Difficulty:</span>
          <div className={`px-2 py-1 rounded-md text-white text-[10px] font-bold ${
            gameData.difficulty === 'easy' ? 'bg-green-500' :
            gameData.difficulty === 'medium' ? 'bg-yellow-500' :
            'bg-red-500'
          }`}>
            {(gameData.difficulty || 'easy').toUpperCase()}
          </div>
        </div>

        {/* Text preview (first 60 chars) */}
        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700">
          <p className="text-[12px] text-gray-700 dark:text-gray-300 font-mono leading-relaxed">
            {text ? text.substring(0, 60) + (text.length > 60 ? '...' : '') : 'Loading text...'}
          </p>
        </div>

        {/* Timer display */}
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-500" />
          <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
            Time: {gameData.duration || 60} seconds
          </span>
        </div>
      </div>

      {/* Race lanes */}
      {sortedPlayers.length > 0 && (
        <div className="space-y-1.5">
          {sortedPlayers.map(player => {
            const isMe = player.id === currentUserId || player.socketId === currentUserId ||
              (currentUser?.id && player.id === currentUser.id);
            const prog = isMe && status === 'racing' ? typed.length / text.length : (player.progress || 0);
            const displayWpm = isMe ? localWpm : (player.wpm || 0);
            return (
              <div key={player.id || player.socketId}>
                <div className="flex items-center justify-between text-[10px] mb-0.5 gap-1">
                  <span className={`font-medium truncate max-w-[90px] sm:max-w-[110px] ${isMe ? 'font-bold' : 'text-gray-500 dark:text-gray-400'}`}
                    style={isMe ? { color: accent } : {}}>
                    {player.name}{isMe ? ' (you)' : ''}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {player.rank && <span className="font-black text-amber-500">#{player.rank}</span>}
                    {displayWpm > 0 && <span className="text-gray-400">{displayWpm}wpm</span>}
                    {player.finishedAt && <Flag className="w-3 h-3 text-emerald-500" />}
                  </div>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${player.finishedAt ? 'bg-gradient-to-r from-emerald-500 to-green-400' : ''}`}
                    style={{
                      width: `${Math.min(100, prog * 100)}%`,
                      background: player.finishedAt ? undefined : isMe ? `linear-gradient(to right, ${accent}, ${accent}99)` : undefined,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Countdown */}
      {countdown !== null && (
        <div className="text-center py-3">
          <div className="text-5xl font-black tabular-nums" style={{ color: accent }}>{countdown}</div>
          <div className="text-xs text-gray-500 mt-1">Get ready to type!</div>
        </div>
      )}

      {/* Text + input */}
      {status === 'racing' && countdown === null && (
        <>
          <div
            className="p-2.5 sm:p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 leading-relaxed cursor-text break-words"
            onClick={() => inputRef.current?.focus()}
          >
            {renderText()}
            {status === 'racing' && countdown === null && !iFinished && (
              <div className="mt-1 text-[10px] text-gray-400">👻 Ghost target at char {Math.min(text.length, ghostIndex + 1)}</div>
            )}
          </div>
          {isPlayer && !iFinished && (
            <>
              <input
                ref={inputRef}
                type="text"
                value={typed}
                onChange={handleChange}
                className="opacity-0 absolute -z-10 w-0 h-0"
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false"
                aria-label="Type here to race"
              />
              <div className="text-center text-[10px] text-gray-400">
                Tap the text to focus, then type!
                {errors > 0 && <span className="text-red-400 ml-1">{errors} error{errors !== 1 ? 's' : ''}</span>}
              </div>
            </>
          )}
          {iFinished && (
            <div className="text-center text-xs font-bold text-emerald-600 dark:text-emerald-400 space-y-0.5">
              <div>🏁 Finished!{myPlayer?.rank ? ` You placed #${myPlayer.rank}` : ''}</div>
              {isNewPB && <div className="text-amber-500">🏆 New personal best: {myPlayer?.wpm} WPM!</div>}
              {!isNewPB && personalBest > 0 && <div className="text-[10px] text-gray-400 font-normal">PB: {personalBest} WPM</div>}
            </div>
          )}
        </>
      )}

      {/* Final results */}
      {status === 'finished' && (
        <div className="space-y-1.5">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-2.5 space-y-1.5">
            <div className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Final Results</div>
            {sortedPlayers.filter(p => p.rank).map(p => (
              <div key={p.id || p.socketId} className="flex items-center gap-1.5 text-xs">
                <span className={`font-black w-5 shrink-0 ${p.rank === 1 ? 'text-amber-500' : p.rank === 2 ? 'text-gray-400' : p.rank === 3 ? 'text-amber-700' : 'text-gray-500'}`}>
                  {p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`}
                </span>
                <span className="font-medium text-gray-700 dark:text-gray-200 truncate flex-1">{p.name}</span>
                <span className="font-bold shrink-0" style={{ color: accent }}>{p.wpm} WPM</span>
                <span className="text-gray-400 shrink-0">{p.accuracy}%</span>
              </div>
            ))}
          </div>
          {isPlayer && (
            <div className="flex gap-2">
              {onShareResult && (() => {
                const winner = sortedPlayers.find(p => p.rank === 1);
                const myResult = sortedPlayers.find(p => (p.id || p.socketId) === currentUserId);
                const txt = winner
                  ? `⌨️ Typing Race: ${winner.name} wins at ${winner.wpm} WPM!${myResult && myResult.id !== winner.id ? ` (I got ${myResult.wpm} WPM)` : ''}`
                  : `⌨️ Typing Race done! I got ${myResult?.wpm || 0} WPM`;
                return (
                  <button
                    onClick={() => onShareResult(txt)}
                    className="flex-1 py-1.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 opacity-80 hover:opacity-100"
                    style={{ backgroundColor: accent }}
                  >
                    📣 Share
                  </button>
                );
              })()}
              {onRematch && (
                <button
                  onClick={() => onRematch(message.id)}
                  className="flex-1 py-1.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 opacity-80 hover:opacity-100"
                  style={{ backgroundColor: accent }}
                >
                  <RotateCcw className="w-3 h-3" /> Rematch
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Waiting controls */}
      {status === 'waiting' && (
        <div className="space-y-1.5">
          {!isPlayer && !gameData.isTargeted && (
            <button
              onClick={() => onTypingRaceJoin(message.id)}
              className="w-full py-1.5 rounded-lg text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors active:scale-95"
              style={{ backgroundColor: accent }}
            >
              <Users className="w-3.5 h-3.5" /> Join Race
            </button>
          )}
          {isSender && isPlayer && !waitingForOpponent && !gameData.isTargeted && (
            <button
              onClick={() => onTypingRaceStart(message.id)}
              className="w-full py-1.5 rounded-lg text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors active:scale-95"
              style={{ backgroundColor: '#16a34a' }}
            >
              <Play className="w-3.5 h-3.5" />
              Start Race · {allPlayers.length} player{allPlayers.length !== 1 ? 's' : ''}
            </button>
          )}
          {!isSender && isPlayer && !gameData.isTargeted && (
            <div className="text-center text-[11px] text-gray-400">Waiting for host to start the race…</div>
          )}
        </div>
      )}
    </div>
  );
};

export default TypingRaceGame;
