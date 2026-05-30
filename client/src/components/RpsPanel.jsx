import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Flag, Users, Trash2 } from 'lucide-react';
import socketManager from '../socket';
import { getPicks, resolveRound, getBeatText, getCpuPick, PICK_EMOJI, PICK_LABEL } from './games/RpsEngine';
import { getVibeById } from '../utils/vibes';

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

  const [gameData, setGameData] = useState(message?.gameData ?? null);
  const [status, setStatus] = useState(message?.gameData?.status || 'waiting');
  const [currentRound, setCurrentRound] = useState(message?.gameData?.currentRound || 1);
  const [scores, setScores] = useState(message?.gameData?.scores || { player1: 0, player2: 0, draw: 0 });
  const [roundHistory, setRoundHistory] = useState(message?.gameData?.roundHistory || []);
  const [pickedIds, setPickedIds] = useState(message?.gameData?.pickedIds || []);
  const [myPickThisRound, setMyPickThisRound] = useState(null);
  const [revealData, setRevealData] = useState(null);
  const [myTurnFlash, setMyTurnFlash] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectSecondsLeft, setDisconnectSecondsLeft] = useState(null);
  const [wasDisplacedFromGame, setWasDisplacedFromGame] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [boardSize, setBoardSize] = useState(320);

  const boardContainerRef = useRef(null);
  const revealTimerRef = useRef(null);
  const disconnectTimerRef = useRef(null);

  const messageId = message?.id;
  const myId = currentUser?.id || currentUser?.socketId;
  const nickname = currentUser?.nickname;

  const isP1 = gameData?.player1?.id === myId || (nickname && gameData?.player1?.name === nickname);
  const isP2 = gameData?.player2?.id === myId || (nickname && gameData?.player2?.name === nickname);
  const isPlaying = isP1 || isP2;
  const isCpu = !!gameData?.cpu?.enabled;
  const cpuDifficulty = gameData?.cpu?.difficulty || 'medium';
  const isFinished = status === 'finished';
  const isWaiting = status === 'waiting';
  const isLive = status === 'playing';
  const isCreator = gameData?.creatorId === myId;
  const totalRounds = gameData?.totalRounds ?? 5;
  const variant = gameData?.variant || 'standard';

  const queueLocked = !!gameData?.queueLocked;
  const maxQueue = gameData?.maxQueue ?? Infinity;
  const queueCount = gameData?.challengeQueue?.length ?? 0;
  const queueFull = queueCount >= maxQueue;
  const inQueue = gameData?.challengeQueue?.some(p => p.id === myId || (nickname && p.name === nickname));
  const canJoinQueue = !isPlaying && !inQueue && isLive && !queueLocked && !queueFull;

  const p1Name = gameData?.player1?.name ?? 'Player 1';
  const p2Name = isCpu ? `CPU (${cpuDifficulty})` : (gameData?.player2?.name ?? 'Player 2');

  const myPlayerId = isP1 ? gameData?.player1?.id : gameData?.player2?.id;
  const iHavePicked = pickedIds.includes(myPlayerId) || myPickThisRound !== null;
  const cpuThinking = isCpu && iHavePicked && !revealData && isLive && !isFinished;

  // Board sizing — fills available space (same pattern as chess)
  useEffect(() => {
    const el = boardContainerRef.current;
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

  // Sync from message prop
  useEffect(() => {
    if (!message?.gameData) return;
    const gd = message.gameData;
    setGameData(gd);
    setStatus(gd.status || 'waiting');
    setCurrentRound(gd.currentRound || 1);
    setScores(gd.scores || { player1: 0, player2: 0, draw: 0 });
    setRoundHistory(gd.roundHistory || []);
    setPickedIds(gd.pickedIds || []);
  }, [message?.gameData]);

  // My turn flash — fires when round changes or reveal clears
  useEffect(() => {
    if (!isPlaying || !isLive || iHavePicked || revealData) return;
    setMyTurnFlash(true);
    const t = setTimeout(() => setMyTurnFlash(false), 1200);
    return () => clearTimeout(t);
  }, [currentRound, revealData]); // eslint-disable-line

  // Disconnect countdown
  useEffect(() => {
    clearInterval(disconnectTimerRef.current);
    if (!opponentDisconnected) { setDisconnectSecondsLeft(null); return; }
    disconnectTimerRef.current = setInterval(() => {
      setDisconnectSecondsLeft(prev => (prev == null || prev <= 0) ? 0 : prev - 1);
    }, 1000);
    return () => clearInterval(disconnectTimerRef.current);
  }, [opponentDisconnected]);

  // Socket events
  useEffect(() => {
    if (!messageId) return;

    const onPlayerPicked = ({ messageId: mid, pickedIds: pids }) => {
      if (mid !== messageId) return;
      setPickedIds(pids || []);
    };

    const onRoundReveal = ({ messageId: mid, round, p1Pick, p2Pick, result, replay, scores: s, currentRound: cr, status: st, winner: w }) => {
      if (mid !== messageId) return;
      const beatText = result !== 'draw' && result
        ? getBeatText(result === 'player1' ? p1Pick : p2Pick, result === 'player1' ? p2Pick : p1Pick)
        : null;
      clearTimeout(revealTimerRef.current);
      setRevealData({ round, p1Pick, p2Pick, result, beatText, replay: !!replay });
      setMyPickThisRound(null);
      setPickedIds([]);
      if (s) setScores(s);
      if (cr) setCurrentRound(cr);
      if (st) setStatus(st);
      if (w) setGameData(prev => prev ? { ...prev, winner: w, status: st || prev.status } : prev);
      if (st !== 'finished') {
        // Draw replays the same round — shorter dismiss so player can pick again quickly
        revealTimerRef.current = setTimeout(() => setRevealData(null), replay ? 1500 : 2500);
      }
    };

    const onGameOver = ({ messageId: mid, gameData: gd }) => {
      if (mid !== messageId) return;
      setGameData(gd);
      setStatus('finished');
    };

    const onNewRound = ({ messageId: mid, gameData: gd }) => {
      if (mid !== messageId) return;
      const nowP1 = gd.player1?.id === myId || (nickname && gd.player1?.name === nickname);
      const nowP2 = gd.player2?.id === myId || (nickname && gd.player2?.name === nickname);
      if (isPlaying && !nowP1 && !nowP2) setWasDisplacedFromGame(true);
      if (nowP1 || nowP2) setWasDisplacedFromGame(false);
      setGameData(gd);
      setStatus(gd.status || 'playing');
      setCurrentRound(gd.currentRound || 1);
      setScores(gd.scores || { player1: 0, player2: 0, draw: 0 });
      setRoundHistory(gd.roundHistory || []);
      setPickedIds(gd.pickedIds || []);
      setMyPickThisRound(null);
      clearTimeout(revealTimerRef.current);
      setRevealData(null);
      setOpponentDisconnected(false);
      setDisconnectSecondsLeft(null);
    };

    const onOpponentJoined = ({ messageId: mid, gameData: gd }) => {
      if (mid !== messageId) return;
      setGameData(gd);
      setStatus(gd.status || 'playing');
      setOpponentDisconnected(false);
    };

    const onDC = ({ messageId: mid }) => { if (mid !== messageId) return; setOpponentDisconnected(true); setDisconnectSecondsLeft(60); };
    const onRC = ({ messageId: mid }) => { if (mid !== messageId) return; setOpponentDisconnected(false); setDisconnectSecondsLeft(null); };

    socketManager.on('rps-player-picked', onPlayerPicked);
    socketManager.on('rps-round-reveal', onRoundReveal);
    socketManager.on('rps-game-over', onGameOver);
    socketManager.on('rps-new-round', onNewRound);
    socketManager.on('rps-opponent-joined', onOpponentJoined);
    socketManager.on('rps-opponent-disconnected', onDC);
    socketManager.on('rps-opponent-reconnected', onRC);

    return () => {
      socketManager.off('rps-player-picked', onPlayerPicked);
      socketManager.off('rps-round-reveal', onRoundReveal);
      socketManager.off('rps-game-over', onGameOver);
      socketManager.off('rps-new-round', onNewRound);
      socketManager.off('rps-opponent-joined', onOpponentJoined);
      socketManager.off('rps-opponent-disconnected', onDC);
      socketManager.off('rps-opponent-reconnected', onRC);
    };
  }, [messageId, isPlaying, myId, nickname]); // eslint-disable-line

  const handlePick = useCallback((pick) => {
    if (!isPlaying || iHavePicked || !isLive || isFinished) return;
    setMyPickThisRound(pick);
    socketManager.emit('rps-pick', { messageId, pick });
  }, [isPlaying, iHavePicked, isLive, isFinished, messageId]);

  const handleStartCpu = (diff) => socketManager.emit('rps-set-cpu', { messageId, difficulty: diff });

  const handleResign = () => {
    if (isCpu && isPlaying) {
      const winnerPlayer = isP1 ? gameData?.player2 : gameData?.player1;
      setStatus('finished');
      setGameData(prev => prev ? { ...prev, status: 'finished', result: 'resign', winner: winnerPlayer } : prev);
      socketManager.emit('rps-game-end', { messageId, winner: isP1 ? 'player2' : 'player1', result: 'resign' });
    } else {
      socketManager.emit('rps-resign', { messageId });
    }
  };

  const handleRematch = (difficulty) => {
    socketManager.emit('rps-rematch', { messageId, ...(difficulty ? { difficulty } : {}) });
    if (isCpu) {
      const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : cpuDifficulty;
      setStatus('playing');
      setCurrentRound(1);
      setScores({ player1: 0, player2: 0, draw: 0 });
      setRoundHistory([]);
      setPickedIds([]);
      setMyPickThisRound(null);
      clearTimeout(revealTimerRef.current);
      setRevealData(null);
      setOpponentDisconnected(false);
      setDisconnectSecondsLeft(null);
      setGameData(prev => prev ? {
        ...prev,
        status: 'playing',
        winner: null,
        result: null,
        endedAt: null,
        currentRound: 1,
        roundHistory: [],
        scores: { player1: 0, player2: 0, draw: 0 },
        pickedIds: [],
        picks: {},
        cpu: { enabled: true, difficulty: diff },
        player2: { id: 'cpu', socketId: null, name: `CPU (${diff})` },
        startedAt: Date.now(),
      } : prev);
    }
  };

  const handleTagOut = () => socketManager.emit('rps-tag-out', { messageId });
  const handleQueueAgain = () => { socketManager.emit('rps-queue-again', { messageId }); setWasDisplacedFromGame(false); };
  const handleAddSlot = () => socketManager.emit('rps-set-max-queue', { messageId, maxQueue: (gameData?.maxQueue ?? queueCount) + 1 });
  const handleToggleLock = () => socketManager.emit('rps-lock-queue', { messageId, locked: !queueLocked });

  const buildResultMsg = (gd) => {
    if (!gd) return '';
    if (gd.result === 'resign') return `🏳 ${gd.winner?.name ?? '?'} wins by resignation`;
    if (gd.result === 'abandoned') return 'Opponent abandoned';
    if (!gd.winner) return '🤝 Draw!';
    const winnerIsCpu = gd.winner?.id === 'cpu';
    const name = winnerIsCpu ? `CPU (${gd.cpu?.difficulty ?? '?'})` : (gd.winner?.name ?? '?');
    return `🏆 ${name} wins!`;
  };

  // Pick buttons grid
  const picks = getPicks(variant);
  const btnSize = Math.max(56, Math.round(boardSize / (variant === 'rpsls' ? 5.5 : 4)));
  const emojiFontSize = Math.round(btnSize * 0.44);

  const myRevealPick = revealData ? (isP1 ? revealData.p1Pick : revealData.p2Pick) : null;
  const oppRevealPick = revealData ? (isP1 ? revealData.p2Pick : revealData.p1Pick) : null;
  const revealResult = revealData?.result;
  const iWon = revealResult === (isP1 ? 'player1' : 'player2');
  const oppWon = revealResult === (isP1 ? 'player2' : 'player1');

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

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden select-none">

      {/* Player bars */}
      {(isLive || isFinished) && (
        <div className="border-b border-gray-100 dark:border-gray-800 pt-0.5 pb-0.5">
          <RpsPlayerBar side={2} name={p2Name} score={scores.player2 ?? 0} isActive={isLive && !isFinished} />
          <RpsPlayerBar side={1} name={p1Name} score={scores.player1 ?? 0} isActive={isLive && !isFinished} />
        </div>
      )}

      {/* Status strip */}
      {isLive && !isFinished ? (
        <div className={`text-center text-xs font-semibold py-1 transition-colors ${
          opponentDisconnected
            ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300'
            : revealData?.replay
              ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
            : revealData
              ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
            : cpuThinking
              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
            : iHavePicked
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
            : myTurnFlash
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
              : ''
        }`}>
          {opponentDisconnected
            ? `⚠️ Opponent disconnected — forfeit in ${disconnectSecondsLeft ?? 60}s`
            : revealData?.replay
              ? '🤝 Draw — pick again!'
            : revealData
              ? `Round ${revealData.round} — ${iWon ? '🎉 You win this round!' : '😞 You lose this round'}`
            : cpuThinking ? '🤖 CPU thinking...'
            : iHavePicked ? '⏳ Waiting for opponent...'
            : myTurnFlash ? '✓ Make your pick!'
            : ' '}
        </div>
      ) : null}

      {/* Waiting for challenger banner */}
      {isWaiting && isP1 && (
        <div className="mx-3 mt-2 mb-1 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 truncate">Waiting for challenger...</span>
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
      <div ref={boardContainerRef} className="flex-1 min-h-0 flex items-center justify-center p-3">
        <div className="flex flex-col items-center gap-4 w-full" style={{ maxWidth: boardSize }}>

          {/* Round indicator — shows decisive (non-draw) round wins, first-to-winsNeeded */}
          {(isLive || isFinished) && (() => {
            const winsNeeded = Math.ceil(totalRounds / 2);
            const decisive = roundHistory.filter(r => r.result !== 'draw');
            const drawCount = roundHistory.filter(r => r.result === 'draw').length;
            return (
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-2">
                  {Array.from({ length: winsNeeded }, (_, i) => {
                    const r = decisive[i];
                    const isCurrent = !r && i === decisive.length && !isFinished;
                    return (
                      <div key={i} className={`w-4 h-4 rounded-full transition-all ${
                        !r
                          ? isCurrent ? 'bg-white dark:bg-gray-800 ring-2 ring-gray-400 dark:ring-gray-500 animate-pulse' : 'bg-gray-200 dark:bg-gray-700'
                          : r.result === 'player1' ? 'bg-indigo-500'
                          : 'bg-red-500'
                      }`} />
                    );
                  })}
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 ml-1">
                    First to {winsNeeded}
                    {drawCount > 0 ? ` · ${drawCount} draw${drawCount !== 1 ? 's' : ''}` : ''}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Main game content */}
          {isLive && revealData ? (
            // Reveal view
            <div className="flex flex-col items-center gap-3 w-full">
              <div className="flex items-center justify-center gap-6 w-full">
                {/* My side */}
                <div className={`flex flex-col items-center gap-1 flex-1 p-3 rounded-2xl ${iWon ? 'bg-green-50 dark:bg-green-900/20' : oppWon ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
                  <span style={{ fontSize: Math.round(boardSize / 4) }}>{PICK_EMOJI[myRevealPick] || '?'}</span>
                  <span className="text-[10px] font-black text-gray-600 dark:text-gray-300">{PICK_LABEL[myRevealPick] || ''}</span>
                  <span className="text-[9px] text-gray-400 truncate max-w-full">{isP1 ? p1Name : p2Name}</span>
                  {iWon && <span className="text-[10px] font-black text-green-600 dark:text-green-400">WIN</span>}
                  {oppWon && <span className="text-[10px] font-black text-red-500">LOSE</span>}
                  {revealResult === 'draw' && <span className="text-[10px] font-black text-gray-500">DRAW</span>}
                </div>
                <span className="text-lg font-black text-gray-300 dark:text-gray-600 shrink-0">VS</span>
                {/* Opponent side */}
                <div className={`flex flex-col items-center gap-1 flex-1 p-3 rounded-2xl ${oppWon ? 'bg-green-50 dark:bg-green-900/20' : iWon ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
                  <span style={{ fontSize: Math.round(boardSize / 4) }}>{PICK_EMOJI[oppRevealPick] || '?'}</span>
                  <span className="text-[10px] font-black text-gray-600 dark:text-gray-300">{PICK_LABEL[oppRevealPick] || ''}</span>
                  <span className="text-[9px] text-gray-400 truncate max-w-full">{isP1 ? p2Name : p1Name}</span>
                  {oppWon && <span className="text-[10px] font-black text-green-600 dark:text-green-400">WIN</span>}
                  {iWon && <span className="text-[10px] font-black text-red-500">LOSE</span>}
                  {revealResult === 'draw' && <span className="text-[10px] font-black text-gray-500">DRAW</span>}
                </div>
              </div>
              {revealData.beatText && (
                <p className="text-[10px] text-gray-500 dark:text-gray-400 text-center">{revealData.beatText}</p>
              )}
            </div>
          ) : isLive && iHavePicked && isPlaying ? (
            // Locked in view
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 rounded-2xl bg-green-50 dark:bg-green-900/20 flex flex-col items-center gap-2">
                <span style={{ fontSize: Math.round(boardSize / 3.5) }}>{PICK_EMOJI[myPickThisRound] || '✅'}</span>
                <span className="text-xs font-black text-green-700 dark:text-green-400">✓ Locked in</span>
                {myPickThisRound && <span className="text-[10px] text-gray-500">{PICK_LABEL[myPickThisRound]}</span>}
              </div>
              <p className="text-xs text-gray-400 animate-pulse">Waiting for opponent...</p>
            </div>
          ) : isLive && isPlaying ? (
            // Pick buttons
            <div className={`grid gap-2 w-full ${variant === 'rpsls' ? 'grid-cols-3' : 'grid-cols-3'}`}>
              {picks.map(pick => (
                <button key={pick} onClick={() => handlePick(pick)}
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 active:scale-95 transition-all py-3 px-1"
                  style={{ minHeight: btnSize }}>
                  <span style={{ fontSize: emojiFontSize, lineHeight: 1 }}>{PICK_EMOJI[pick]}</span>
                  <span className="text-[9px] font-black text-gray-600 dark:text-gray-300 leading-none">{PICK_LABEL[pick]}</span>
                </button>
              ))}
            </div>
          ) : isLive && !isPlaying ? (
            // Spectator view
            <div className="flex flex-col items-center gap-3">
              <div className="text-4xl">✊</div>
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                {pickedIds.length === 0 ? 'Waiting for picks...'
                  : pickedIds.length === 1 ? '1 player has picked'
                  : 'Both players have picked'}
              </p>
              <p className="text-xs text-gray-400">Round {currentRound} of {totalRounds}</p>
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
              <span className="ml-0.5 text-[9px]">
                {r.result === 'player1' ? '①' : r.result === 'player2' ? '②' : '='}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Result banner */}
      {isFinished && (
        <div className="mx-3 mb-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 overflow-hidden">
          <div className="py-2 px-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-black text-amber-700 dark:text-amber-300">{buildResultMsg(gameData)}</p>
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
          {/* Post-match stats strip — pick distribution + win rate (per research spec) */}
          {(() => {
            const myRounds = roundHistory.filter(r => isP1 ? r.p1Pick : r.p2Pick);
            if (myRounds.length === 0) return null;
            const myPicks = myRounds.map(r => isP1 ? r.p1Pick : r.p2Pick);
            const myWins = myRounds.filter(r => r.result === (isP1 ? 'player1' : 'player2')).length;
            const myDraws = myRounds.filter(r => r.result === 'draw').length;
            const myLosses = myRounds.filter(r => r.result !== 'draw' && r.result !== (isP1 ? 'player1' : 'player2')).length;
            const pickCounts = {};
            myPicks.forEach(p => { pickCounts[p] = (pickCounts[p] || 0) + 1; });
            const total = myPicks.length;
            const winRate = total > 0 ? Math.round(myWins / total * 100) : 0;
            return (
              <div className="border-t border-amber-100 dark:border-amber-800/40 px-3 py-2">
                <p className="text-[9px] text-gray-400 uppercase tracking-widest mb-1.5">
                  {isPlaying ? 'Your stats' : `${p1Name}'s picks`}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {Object.entries(pickCounts).sort((a, b) => b[1] - a[1]).map(([pick, count]) => (
                    <span key={pick} className="text-[10px] text-gray-600 dark:text-gray-300 flex items-center gap-0.5">
                      {PICK_EMOJI[pick]}<span className="font-black">×{count}</span>
                    </span>
                  ))}
                  <span className="ml-auto text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
                    {myWins}W {myDraws}D {myLosses}L · {winRate}% win
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Creator queue controls */}
      {isLive && isCreator && (
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

      {/* Controls */}
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
              ? `In queue · #${(gameData?.challengeQueue?.findIndex(p => p.id === myId || (nickname && p.name === nickname)) ?? -1) + 1}`
              : `Spectating · Round ${currentRound} of ${totalRounds}`}
          </span>
          {canJoinQueue && (
            <button onClick={handleQueueAgain}
              className={`py-1.5 px-2.5 text-xs font-black rounded-lg text-white ${vibe.accentClass} hover:opacity-90 transition-opacity shrink-0`}>
              {wasDisplacedFromGame ? '↩ Re-queue' : '+ Queue'}
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
