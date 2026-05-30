import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Flag, Users, Trash2 } from 'lucide-react';
import socketManager from '../socket';
import {
  getPicks, getCpuPick, getBeatText, applyRound, winsNeeded,
  PICK_EMOJI, PICK_LABEL,
} from './games/RpsEngine';
import { getVibeById } from '../utils/vibes';

// How long the round result stays on screen before the next round opens.
const REVEAL_MS = 2200;
const REVEAL_DRAW_MS = 1400;

function RpsPlayerBar({ name, score, isActive, side }) {
  return (
    <div className={`flex items-center gap-2 px-2 pt-1 pb-0.5 transition-opacity ${isActive ? 'opacity-100' : 'opacity-50'}`}>
      <span className="text-sm leading-none shrink-0">{side === 1 ? '🔵' : '🔴'}</span>
      <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 truncate flex-1">{name}</span>
      <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{score} wins</span>
    </div>
  );
}

export default function RpsPanel({ message, currentUser, roomVibe, onDelete }) {
  const vibe = getVibeById(roomVibe);
  const messageId = message?.id;
  const myId = currentUser?.id || currentUser?.socketId;
  const nickname = currentUser?.nickname;

  const [gameData, setGameData] = useState(message?.gameData ?? null);
  const [reveal, setReveal] = useState(null);        // transient round result overlay
  const [myPick, setMyPick] = useState(null);        // pick I locked this round
  const [oppLocked, setOppLocked] = useState(false); // opponent has locked in
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [boardSize, setBoardSize] = useState(320);

  const boardRef = useRef(null);
  const revealTimerRef = useRef(null);
  const revealedLenRef = useRef(message?.gameData?.roundHistory?.length ?? 0);
  const oppPickRef = useRef(null);                   // referee: opponent pick awaiting resolution
  const gameDataRef = useRef(gameData);              // latest state for once-registered socket handlers
  const myPickRef = useRef(null);

  useEffect(() => { gameDataRef.current = gameData; }, [gameData]);
  useEffect(() => { myPickRef.current = myPick; }, [myPick]);

  // ── Derived identity / state ──────────────────────────────────────────────
  const isP1 = gameData?.player1?.id === myId || (nickname && gameData?.player1?.name === nickname);
  const isP2 = !gameData?.cpu?.enabled &&
    (gameData?.player2?.id === myId || (nickname && gameData?.player2?.name === nickname));
  const isPlaying = isP1 || isP2;
  const isReferee = isP1;                             // player1 resolves every round
  const isCreator = gameData?.creatorId === myId
    || (nickname && gameData?.player1?.name === nickname && gameData?.player1?.id === gameData?.creatorId);

  const isCpu = !!gameData?.cpu?.enabled;
  const cpuDifficulty = gameData?.cpu?.difficulty || 'medium';
  const status = gameData?.status || 'waiting';
  const isWaiting = status === 'waiting';
  const isLive = status === 'playing';
  const isFinished = status === 'finished';
  const variant = gameData?.variant || 'standard';
  const totalRounds = gameData?.totalRounds ?? 5;
  const needed = winsNeeded(totalRounds);

  const scores = gameData?.scores || { player1: 0, player2: 0, draw: 0 };
  const roundHistory = gameData?.roundHistory || [];
  const currentRound = gameData?.currentRound || 1;

  const p1Name = gameData?.player1?.name ?? 'Player 1';
  const p2Name = isCpu ? `CPU (${cpuDifficulty})` : (gameData?.player2?.name ?? 'Player 2');

  const queueLocked = !!gameData?.queueLocked;
  const maxQueue = gameData?.maxQueue ?? Infinity;
  const challengeQueue = gameData?.challengeQueue ?? [];
  const queueCount = challengeQueue.length;
  const queueFull = queueCount >= maxQueue;
  const inQueue = challengeQueue.some(p => p.id === myId || (nickname && p.name === nickname));
  const canJoinQueue = !isPlaying && !inQueue && isLive && !queueLocked && !queueFull;

  const iLockedIn = myPick !== null;

  // ── Board sizing (matches sibling game panels) ─────────────────────────────
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    let raf = null;
    const ro = new ResizeObserver(([entry]) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const { width, height } = entry.contentRect;
        const s = Math.max(160, Math.floor(Math.min(width, height)) - 8);
        setBoardSize(prev => Math.abs(prev - s) > 8 ? s : prev);
      });
    });
    ro.observe(el);
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);

  // ── Local round-state reset (rematch / tag-out / fresh start) ──────────────
  const resetRound = useCallback(() => {
    clearTimeout(revealTimerRef.current);
    setReveal(null);
    setMyPick(null);
    setOppLocked(false);
    oppPickRef.current = null;
  }, []);

  const showReveal = useCallback((p1Pick, p2Pick, result) => {
    const beatText = result !== 'draw'
      ? getBeatText(result === 'player1' ? p1Pick : p2Pick, result === 'player1' ? p2Pick : p1Pick)
      : null;
    clearTimeout(revealTimerRef.current);
    setReveal({ p1Pick, p2Pick, result, beatText });
    revealTimerRef.current = setTimeout(() => {
      setReveal(null);
      setMyPick(null);
    }, result === 'draw' ? REVEAL_DRAW_MS : REVEAL_MS);
  }, []);

  // ── Referee resolution: combine both picks, advance state, broadcast ───────
  const resolveAndPush = useCallback((p1Pick, p2Pick) => {
    const cur = gameDataRef.current;
    if (!cur) return;
    const next = applyRound(cur, p1Pick, p2Pick);
    const last = next.roundHistory[next.roundHistory.length - 1];
    revealedLenRef.current = next.roundHistory.length; // suppress re-reveal on our own echo
    oppPickRef.current = null;
    setOppLocked(false);
    setGameData(next);
    gameDataRef.current = next;
    showReveal(p1Pick, p2Pick, last.result);
    socketManager.emit('rps-state', { messageId, gameData: next });
  }, [messageId, showReveal]);

  // ── Sync from message prop (e.g. reopened panel) ───────────────────────────
  useEffect(() => {
    if (!message?.gameData) return;
    setGameData(message.gameData);
    gameDataRef.current = message.gameData;
    revealedLenRef.current = message.gameData.roundHistory?.length ?? 0;
  }, [message?.gameData]);

  // ── Socket events ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!messageId) return;

    // Authoritative full-state update from the referee (via server relay).
    const onState = ({ messageId: mid, gameData: gd }) => {
      if (mid !== messageId || !gd) return;
      const prevLen = revealedLenRef.current;
      const newLen = gd.roundHistory?.length ?? 0;
      if (newLen > prevLen) {
        // A round was just resolved — play the reveal (also for the resolver's
        // peers; the resolver itself already advanced revealedLenRef so its own
        // echo is treated as a no-op below).
        const last = gd.roundHistory[newLen - 1];
        showReveal(last.p1Pick, last.p2Pick, last.result);
        revealedLenRef.current = newLen;
      } else if (newLen < prevLen) {
        // History shrank — rematch / tag-out / new game.
        resetRound();
        revealedLenRef.current = newLen;
      }
      // else: plain echo (same length) — leave the live reveal/lock untouched.
      gameDataRef.current = gd;
      setGameData(gd);
    };

    // PvP: opponent's pick value arrives (only the referee resolves on it).
    const onPick = ({ messageId: mid, pick, fromId, fromName }) => {
      if (mid !== messageId || !isReferee) return;
      if (fromId === myId || (nickname && fromName === nickname)) return; // ignore our own relay
      oppPickRef.current = pick;
      setOppLocked(true);
      if (myPickRef.current) resolveAndPush(myPickRef.current, pick);
    };

    // Valueless "this side locked in" ping for the waiting indicator.
    const onLocked = ({ messageId: mid, side }) => {
      if (mid !== messageId) return;
      const opponentSide = isP1 ? 'player2' : 'player1';
      if (side === opponentSide) setOppLocked(true);
    };

    socketManager.on('rps-state', onState);
    socketManager.on('rps-pick', onPick);
    socketManager.on('rps-locked', onLocked);
    return () => {
      socketManager.off('rps-state', onState);
      socketManager.off('rps-pick', onPick);
      socketManager.off('rps-locked', onLocked);
    };
  }, [messageId, isReferee, isP1, myId, nickname, resolveAndPush, showReveal, resetRound]);

  useEffect(() => () => clearTimeout(revealTimerRef.current), []);

  // ── Push authoritative state (queue/setting changes that aren't a round) ───
  const pushState = useCallback((next) => {
    revealedLenRef.current = next.roundHistory?.length ?? 0;
    setGameData(next);
    gameDataRef.current = next;
    socketManager.emit('rps-state', { messageId, gameData: next });
  }, [messageId]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handlePick = (pick) => {
    if (!isPlaying || !isLive || isFinished || iLockedIn || reveal) return;
    setMyPick(pick);
    myPickRef.current = pick;

    if (isCpu) {
      // Fully local: compute CPU pick and resolve immediately. No network round
      // trip, so this can never hang ("CPU thinking forever" is impossible).
      const cpuPick = getCpuPick(variant, cpuDifficulty, gameDataRef.current?.roundHistory || []);
      resolveAndPush(pick, cpuPick);
      return;
    }

    if (isReferee) {
      socketManager.emit('rps-locked', { messageId, side: 'player1' });
      if (oppPickRef.current) resolveAndPush(pick, oppPickRef.current);
    } else {
      socketManager.emit('rps-pick', { messageId, pick });
    }
  };

  const handleStartCpu = (diff) => {
    const cur = gameDataRef.current;
    if (!isCreator || !cur) return;
    resetRound();
    pushState({
      ...cur,
      cpu: { enabled: true, difficulty: diff },
      player2: { id: 'cpu', socketId: null, name: `CPU (${diff})` },
      status: 'playing',
      currentRound: 1, roundHistory: [], scores: { player1: 0, player2: 0, draw: 0 },
      picks: {}, pickedIds: [], winner: null, result: null, endedAt: null,
      startedAt: Date.now(),
    });
  };

  const handleResign = () => {
    const cur = gameDataRef.current;
    if (!isPlaying || !cur) return;
    resetRound();
    const winnerSide = isP1 ? cur.player2 : cur.player1;
    if (!isCpu && (cur.challengeQueue?.length ?? 0) > 0) {
      const [next, ...rest] = cur.challengeQueue;
      pushState({
        ...cur,
        player1: isP1 ? next : cur.player1,
        player2: isP1 ? cur.player2 : next,
        challengeQueue: rest,
        status: 'playing',
        currentRound: 1, roundHistory: [], scores: { player1: 0, player2: 0, draw: 0 },
        picks: {}, pickedIds: [], winner: null, result: null,
        startedAt: Date.now(), endedAt: null,
      });
      return;
    }
    pushState({ ...cur, status: 'finished', result: 'resign', winner: winnerSide, endedAt: Date.now() });
  };

  const handleRematch = (difficulty) => {
    const cur = gameDataRef.current;
    if (!isCreator || !cur) return;
    resetRound();
    let player2 = cur.player2;
    let cpu = cur.cpu;
    let queue = cur.challengeQueue ?? [];
    if (isCpu) {
      const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : cpuDifficulty;
      cpu = { enabled: true, difficulty: diff };
      player2 = { id: 'cpu', socketId: null, name: `CPU (${diff})` };
    } else if (queue.length > 0) {
      [player2, ...queue] = queue;
    }
    pushState({
      ...cur,
      cpu, player2, challengeQueue: queue,
      status: 'playing',
      currentRound: 1, roundHistory: [], scores: { player1: 0, player2: 0, draw: 0 },
      picks: {}, pickedIds: [], winner: null, result: null,
      startedAt: Date.now(), endedAt: null,
    });
  };

  const handleTagOut = () => {
    const cur = gameDataRef.current;
    if (!isPlaying || isCpu || (cur?.challengeQueue?.length ?? 0) === 0) return;
    resetRound();
    const [next, ...rest] = cur.challengeQueue;
    const benched = isP1 ? cur.player1 : cur.player2;
    pushState({
      ...cur,
      player1: isP1 ? next : cur.player1,
      player2: isP1 ? cur.player2 : next,
      challengeQueue: [...rest, benched],
      currentRound: 1, roundHistory: [], scores: { player1: 0, player2: 0, draw: 0 },
      picks: {}, pickedIds: [], startedAt: Date.now(),
    });
  };

  const handleAddSlot = () => {
    const cur = gameDataRef.current;
    if (!isCreator || !cur) return;
    pushState({ ...cur, maxQueue: (cur.maxQueue ?? queueCount) + 1 });
  };
  const handleToggleLock = () => {
    const cur = gameDataRef.current;
    if (!isCreator || !cur) return;
    pushState({ ...cur, queueLocked: !cur.queueLocked });
  };
  const handleQueueAgain = () => socketManager.emit('rps-queue', { messageId });

  // ── Render helpers ──────────────────────────────────────────────────────────
  const picks = getPicks(variant);
  const btnSize = Math.max(56, Math.round(boardSize / (variant === 'rpsls' ? 5.5 : 4)));
  const emojiFontSize = Math.round(btnSize * 0.44);

  const myRevealPick = reveal ? (isP1 ? reveal.p1Pick : reveal.p2Pick) : null;
  const oppRevealPick = reveal ? (isP1 ? reveal.p2Pick : reveal.p1Pick) : null;
  const iWon = reveal && reveal.result === (isP1 ? 'player1' : 'player2');
  const oppWon = reveal && reveal.result === (isP1 ? 'player2' : 'player1');
  const isDrawReveal = reveal?.result === 'draw';

  const buildResultMsg = () => {
    if (!gameData) return '';
    if (gameData.result === 'resign') return `🏳 ${gameData.winner?.name ?? '?'} wins by resignation`;
    if (!gameData.winner) return '🤝 Draw!';
    const winnerIsCpu = gameData.winner?.id === 'cpu';
    const name = winnerIsCpu ? `CPU (${cpuDifficulty})` : (gameData.winner?.name ?? '?');
    return `🏆 ${name} wins!`;
  };

  // Spectator waiting view
  if (isWaiting && !isPlaying) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 bg-white dark:bg-gray-900">
        <div className="text-5xl">✊</div>
        <p className="font-semibold text-gray-700 dark:text-gray-200">Waiting for game to start</p>
        <div className="flex gap-2 text-sm text-gray-500">
          <span>✊ {p1Name}</span><span>vs</span><span>✊ {p2Name}</span>
        </div>
      </div>
    );
  }

  // ── Status strip — exactly ONE coherent message at a time ──────────────────
  let statusText = ' ';
  let statusTone = '';
  if (reveal) {
    if (isDrawReveal) { statusText = '🤝 Draw — pick again!'; statusTone = 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'; }
    else { statusText = !isPlaying ? 'Round result' : iWon ? '🎉 You win the round!' : '😞 You lose the round'; statusTone = 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'; }
  } else if (iLockedIn) {
    statusText = isCpu ? '🤖 Resolving…' : '⏳ Waiting for opponent…';
    statusTone = 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300';
  } else if (oppLocked && isPlaying) {
    statusText = '✓ Opponent locked in — your move!';
    statusTone = 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300';
  } else if (isLive && isPlaying) {
    statusText = '✊ Make your pick!';
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden select-none">

      {/* Player bars */}
      {(isLive || isFinished) && (
        <div className="border-b border-gray-100 dark:border-gray-800 pt-0.5 pb-0.5">
          <RpsPlayerBar side={2} name={p2Name} score={scores.player2 ?? 0} isActive={isLive} />
          <RpsPlayerBar side={1} name={p1Name} score={scores.player1 ?? 0} isActive={isLive} />
        </div>
      )}

      {/* Status strip */}
      {isLive && (
        <div className={`text-center text-xs font-semibold py-1 transition-colors ${statusTone}`}>
          {statusText}
        </div>
      )}

      {/* Waiting-for-challenger banner (PvP) + start-vs-CPU shortcut */}
      {isWaiting && isP1 && (
        <div className="mx-3 mt-2 mb-1 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 truncate">Waiting for challenger…</span>
          </div>
          <div className="flex gap-1 shrink-0">
            {['easy', 'medium', 'hard'].map(d => (
              <button key={d} onClick={() => handleStartCpu(d)}
                className={`py-1 px-2 text-[10px] font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity capitalize`}>
                🤖 {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Game area */}
      <div ref={boardRef} className="flex-1 min-h-0 flex items-center justify-center p-3">
        <div className="flex flex-col items-center gap-4 w-full" style={{ maxWidth: boardSize }}>

          {/* Round progress — decisive wins, first-to-needed */}
          {(isLive || isFinished) && (() => {
            const decisive = roundHistory.filter(r => r.result !== 'draw');
            const drawCount = roundHistory.filter(r => r.result === 'draw').length;
            return (
              <div className="flex items-center gap-2">
                {Array.from({ length: needed * 2 - 1 }, (_, i) => {
                  const r = decisive[i];
                  const isCurrent = !r && i === decisive.length && !isFinished;
                  return (
                    <div key={i} className={`w-3.5 h-3.5 rounded-full transition-all ${
                      !r
                        ? isCurrent ? 'bg-white dark:bg-gray-800 ring-2 ring-gray-400 dark:ring-gray-500 animate-pulse' : 'bg-gray-200 dark:bg-gray-700'
                        : r.result === 'player1' ? 'bg-blue-500' : 'bg-red-500'
                    }`} />
                  );
                })}
                <span className="text-[10px] text-gray-500 dark:text-gray-400 ml-1">
                  First to {needed}{drawCount > 0 ? ` · ${drawCount} draw${drawCount !== 1 ? 's' : ''}` : ''}
                </span>
              </div>
            );
          })()}

          {/* Reveal / locked / pick */}
          {isLive && reveal ? (
            <div className="flex flex-col items-center gap-3 w-full">
              <div className="flex items-center justify-center gap-4 w-full">
                <div className={`flex flex-col items-center gap-1 flex-1 p-3 rounded-2xl ${iWon ? 'bg-green-50 dark:bg-green-900/20' : oppWon ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
                  <span style={{ fontSize: Math.round(boardSize / 4) }}>{PICK_EMOJI[myRevealPick] || '?'}</span>
                  <span className="text-[10px] font-black text-gray-600 dark:text-gray-300">{PICK_LABEL[myRevealPick] || ''}</span>
                  <span className="text-[9px] text-gray-400 truncate max-w-full">{isP1 ? p1Name : p2Name}</span>
                  {iWon && <span className="text-[10px] font-black text-green-600 dark:text-green-400">WIN</span>}
                  {oppWon && <span className="text-[10px] font-black text-red-500">LOSE</span>}
                  {isDrawReveal && <span className="text-[10px] font-black text-gray-500">DRAW</span>}
                </div>
                <span className="text-lg font-black text-gray-300 dark:text-gray-600 shrink-0">VS</span>
                <div className={`flex flex-col items-center gap-1 flex-1 p-3 rounded-2xl ${oppWon ? 'bg-green-50 dark:bg-green-900/20' : iWon ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
                  <span style={{ fontSize: Math.round(boardSize / 4) }}>{PICK_EMOJI[oppRevealPick] || '?'}</span>
                  <span className="text-[10px] font-black text-gray-600 dark:text-gray-300">{PICK_LABEL[oppRevealPick] || ''}</span>
                  <span className="text-[9px] text-gray-400 truncate max-w-full">{isP1 ? p2Name : p1Name}</span>
                  {oppWon && <span className="text-[10px] font-black text-green-600 dark:text-green-400">WIN</span>}
                  {iWon && <span className="text-[10px] font-black text-red-500">LOSE</span>}
                  {isDrawReveal && <span className="text-[10px] font-black text-gray-500">DRAW</span>}
                </div>
              </div>
              {reveal.beatText && <p className="text-[10px] text-gray-500 dark:text-gray-400 text-center">{reveal.beatText}</p>}
            </div>
          ) : isLive && isPlaying && iLockedIn ? (
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 rounded-2xl bg-green-50 dark:bg-green-900/20 flex flex-col items-center gap-2">
                <span style={{ fontSize: Math.round(boardSize / 3.5) }}>{PICK_EMOJI[myPick] || '✅'}</span>
                <span className="text-xs font-black text-green-700 dark:text-green-400">✓ Locked in</span>
                <span className="text-[10px] text-gray-500">{PICK_LABEL[myPick]}</span>
              </div>
              <p className="text-xs text-gray-400 animate-pulse">{isCpu ? 'Resolving…' : 'Waiting for opponent…'}</p>
            </div>
          ) : isLive && isPlaying ? (
            <div className="grid grid-cols-3 gap-2 w-full">
              {picks.map(pick => (
                <button key={pick} onClick={() => handlePick(pick)}
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 active:scale-95 transition-all py-3 px-1"
                  style={{ minHeight: btnSize }}>
                  <span style={{ fontSize: emojiFontSize, lineHeight: 1 }}>{PICK_EMOJI[pick]}</span>
                  <span className="text-[9px] font-black text-gray-600 dark:text-gray-300 leading-none">{PICK_LABEL[pick]}</span>
                </button>
              ))}
            </div>
          ) : isLive && !isPlaying ? (
            <div className="flex flex-col items-center gap-3">
              <div className="text-4xl">✊</div>
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">Spectating</p>
              <p className="text-xs text-gray-400">Round {currentRound} · {p1Name} vs {p2Name}</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Round history strip */}
      {roundHistory.length > 0 && (
        <div className="mx-3 mb-1 flex flex-wrap gap-x-2 gap-y-0.5 justify-center">
          {roundHistory.map((r, i) => (
            <span key={i} className="text-[10px] font-mono text-gray-500 dark:text-gray-400">
              <span className="text-gray-400">{i + 1}.</span>
              <span className="ml-0.5">{PICK_EMOJI[r.p1Pick] || '?'}</span>
              <span className="mx-0.5 text-gray-300">vs</span>
              <span>{PICK_EMOJI[r.p2Pick] || '?'}</span>
              <span className="ml-0.5 text-[9px]">{r.result === 'player1' ? '①' : r.result === 'player2' ? '②' : '='}</span>
            </span>
          ))}
        </div>
      )}

      {/* Result banner */}
      {isFinished && (
        <div className="mx-3 mb-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 overflow-hidden">
          <div className="py-2 px-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-black text-amber-700 dark:text-amber-300">{buildResultMsg()}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                {p1Name} {scores.player1 ?? 0} – {scores.player2 ?? 0} {p2Name}
                {(scores.draw ?? 0) > 0 ? ` · ${scores.draw} drawn` : ''}
              </p>
            </div>
            {isCreator && (!isCpu || queueCount > 0) && (
              <button onClick={() => handleRematch()}
                className={`px-3 py-1.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 shrink-0`}>
                ↺ Rematch
              </button>
            )}
          </div>
          {isCreator && isCpu && queueCount === 0 && (
            <div className="border-t border-amber-100 dark:border-amber-800/40 px-3 py-2 flex gap-1.5">
              {['easy', 'medium', 'hard'].map(d => {
                const isCurrent = d === cpuDifficulty;
                return (
                  <button key={d} onClick={() => handleRematch(d)}
                    className={`flex-1 py-1.5 text-xs font-black rounded-lg capitalize transition-opacity hover:opacity-90 ${isCurrent ? `text-white ${vibe.accentClass}` : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>
                    {isCurrent ? `↺ ${d}` : d}
                  </button>
                );
              })}
            </div>
          )}
          {/* Post-match stats — pick distribution + win rate */}
          {(() => {
            if (!isPlaying || roundHistory.length === 0) return null;
            const meSide = isP1 ? 'player1' : 'player2';
            const mine = roundHistory.map(r => isP1 ? r.p1Pick : r.p2Pick).filter(Boolean);
            const wins = roundHistory.filter(r => r.result === meSide).length;
            const draws = roundHistory.filter(r => r.result === 'draw').length;
            const losses = roundHistory.length - wins - draws;
            const counts = {};
            mine.forEach(p => { counts[p] = (counts[p] || 0) + 1; });
            const winRate = roundHistory.length ? Math.round(wins / roundHistory.length * 100) : 0;
            return (
              <div className="border-t border-amber-100 dark:border-amber-800/40 px-3 py-2">
                <p className="text-[9px] text-gray-400 uppercase tracking-widest mb-1.5">Your stats</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([pick, count]) => (
                    <span key={pick} className="text-[10px] text-gray-600 dark:text-gray-300 flex items-center gap-0.5">
                      {PICK_EMOJI[pick]}<span className="font-black">×{count}</span>
                    </span>
                  ))}
                  <span className="ml-auto text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
                    {wins}W {draws}D {losses}L · {winRate}% win
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Creator queue controls (PvP only) */}
      {isLive && isCreator && !isCpu && (
        <div className="px-3 pb-1 flex gap-1.5 items-center">
          <span className="text-[9px] text-gray-400 uppercase tracking-wide">Queue</span>
          <span className="text-[10px] text-gray-500 tabular-nums">{queueCount}{maxQueue !== Infinity ? `/${maxQueue}` : ''}</span>
          <button onClick={handleAddSlot}
            className="ml-1 px-2 py-0.5 text-[10px] font-black rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:opacity-80 transition-opacity">
            +1 Slot
          </button>
          <button onClick={handleToggleLock}
            className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-opacity hover:opacity-80 ${queueLocked ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
            {queueLocked ? '🔒 Locked' : '🔓 Open'}
          </button>
        </div>
      )}

      {/* Player controls */}
      {isLive && isPlaying && (
        <div className="px-3 pb-3 flex gap-2">
          {!isCpu && queueCount > 0 && (
            <button onClick={handleTagOut}
              className="py-1.5 px-2.5 text-xs font-black rounded-lg bg-purple-500/80 text-purple-100 hover:opacity-90 transition-opacity">
              ⇄ Tag Out
            </button>
          )}
          <button onClick={handleResign}
            className="flex-1 py-1.5 text-xs font-black rounded-lg bg-red-500/80 text-red-100 hover:opacity-90 transition-opacity flex items-center justify-center gap-1">
            <Flag className="w-3.5 h-3.5" />Resign
          </button>
        </div>
      )}

      {/* Spectator bar */}
      {isLive && !isPlaying && (
        <div className="px-3 pb-3 flex gap-2 items-center">
          <span className="flex-1 flex items-center gap-1.5 text-xs text-gray-400 justify-center">
            <Users className="w-3.5 h-3.5" />
            {inQueue
              ? `In queue · #${challengeQueue.findIndex(p => p.id === myId || (nickname && p.name === nickname)) + 1}`
              : `Spectating · Round ${currentRound}`}
          </span>
          {canJoinQueue && (
            <button onClick={handleQueueAgain}
              className={`py-1.5 px-2.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity shrink-0`}>
              + Queue
            </button>
          )}
        </div>
      )}

      {/* Finished spectator */}
      {isFinished && !isPlaying && (
        <div className="px-3 pb-3">
          <div className="w-full py-1.5 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1.5">
            <Users className="w-3.5 h-3.5" />Spectating
          </div>
        </div>
      )}

      {/* Creator delete game */}
      {isCreator && onDelete && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-800 pt-2">
          {confirmDelete ? (
            <div className="flex gap-2">
              <button onClick={() => { onDelete(messageId); setConfirmDelete(false); }}
                className="flex-1 py-1.5 text-xs font-black rounded-lg bg-red-600 text-white hover:opacity-90 transition-opacity">
                Delete for everyone
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="py-1.5 px-3 text-xs font-black rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:opacity-80 transition-opacity">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="w-full py-1.5 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" />Delete Game
            </button>
          )}
        </div>
      )}
    </div>
  );
}
