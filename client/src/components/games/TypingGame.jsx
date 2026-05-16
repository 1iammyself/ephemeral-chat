import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getVibeById } from '../../utils/vibes';

const TypingGame = ({ gameData, currentUserId, currentNickname, onProgress, onJoin, vibeId }) => {
  const [typed, setTyped] = useState('');
  const [started, setStarted] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [myWPM, setMyWPM] = useState(0);
  const inputRef = useRef(null);
  const startTimeRef = useRef(null);
  const lastProgressRef = useRef(0);
  const vibe = getVibeById(vibeId);
  const primary = vibe.colors?.primary || '#6366f1';

  const isP1 = gameData?.player1?.id === currentUserId || (currentNickname && gameData?.player1?.name === currentNickname);
  const isP2 = gameData?.player2?.id === currentUserId || (currentNickname && gameData?.player2?.name === currentNickname);
  const isPlayer = isP1 || isP2;
  const myRole = isP1 ? 'player1' : isP2 ? 'player2' : null;
  const oppRole = isP1 ? 'player2' : isP2 ? 'player1' : null;
  const canJoin = !gameData?.player2 && !isP1 && gameData?.status === 'waiting';
  const isSolo = !!gameData?.isSolo;

  const passage = gameData?.passage || '';
  const myProgress = gameData?.progress?.[myRole] ?? 0;
  const oppProgress = gameData?.progress?.[oppRole] ?? 0;
  const oppName = isP1 ? gameData?.player2?.name : gameData?.player1?.name;
  const oppWPM = gameData?.wpm?.[oppRole] ?? 0;
  const isWaiting = gameData?.status === 'waiting';
  const isCountdown = gameData?.status === 'countdown';
  const isPlaying = gameData?.status === 'playing';
  const isFinished = gameData?.status === 'finished';

  // Countdown timer
  useEffect(() => {
    if (isCountdown && gameData?.startedAt) {
      const interval = setInterval(() => {
        const left = Math.ceil((gameData.startedAt - Date.now()) / 1000);
        setCountdown(Math.max(0, left));
        if (left <= 0) { setStarted(true); clearInterval(interval); inputRef.current?.focus(); }
      }, 200);
      return () => clearInterval(interval);
    }
    if (isPlaying && !started) { setStarted(true); inputRef.current?.focus(); }
  }, [isCountdown, isPlaying, gameData?.startedAt, started]);

  const handleInput = useCallback((e) => {
    if (!isPlayer || !isPlaying || !passage) return;
    const val = e.target.value;
    if (val.length > passage.length) return;
    setTyped(val);

    if (!startTimeRef.current) startTimeRef.current = Date.now();
    const elapsed = (Date.now() - startTimeRef.current) / 60000;
    const words = val.trim().split(/\s+/).length;
    const currentWPM = elapsed > 0 ? Math.round(words / elapsed) : 0;
    setMyWPM(currentWPM);

    const progress = Math.round((val.length / passage.length) * 100);
    if (Math.abs(progress - lastProgressRef.current) >= 2 || progress >= 100) {
      lastProgressRef.current = progress;
      onProgress(progress, currentWPM);
    }
  }, [isPlayer, isPlaying, passage, onProgress]);

  // Color each character
  const renderPassage = () => {
    return passage.split('').map((char, i) => {
      const typedChar = typed[i];
      let color = '#6b7280'; // untyped
      if (typedChar !== undefined) {
        color = typedChar === char ? '#22c55e' : '#ef4444';
      }
      return <span key={i} style={{ color, fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.9rem' }}>{char}</span>;
    });
  };

  return (
    <div style={{ width: '100%', maxWidth: 'min(92vw, 420px)', margin: '0 auto' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&display=swap');`}</style>

      {/* Progress bars */}
      {(isPlaying || isFinished || isCountdown) && (
        <div style={{ marginBottom: 12 }}>
          {/* My progress */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: '0.72rem', color: '#9ca3af', fontFamily: 'monospace' }}>
              <span style={{ color: primary }}>You {isPlayer ? `— ${myWPM} WPM` : ''}</span>
              <span>{myProgress}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${myProgress}%`, background: primary, borderRadius: 3, transition: 'width 0.3s ease' }} />
            </div>
          </div>
          {/* Opponent progress — hidden in solo mode */}
          {oppName && !isSolo && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: '0.72rem', color: '#9ca3af', fontFamily: 'monospace' }}>
                <span style={{ color: '#f59e0b' }}>{oppName} — {oppWPM} WPM</span>
                <span>{oppProgress}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${oppProgress}%`, background: '#f59e0b', borderRadius: 3, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Countdown */}
      {isCountdown && (
        <div style={{ textAlign: 'center', padding: '20px 0', fontSize: '3rem', fontFamily: 'IBM Plex Mono, monospace', color: primary, fontWeight: 600 }}>
          {countdown > 0 ? countdown : '🚀'}
        </div>
      )}

      {/* Passage + Input */}
      {(isPlaying || isFinished) && (
        <>
          <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.15)', border: `1px solid ${primary}33`, marginBottom: 8, lineHeight: 1.7, wordBreak: 'break-word' }}>
            {renderPassage()}
          </div>
          {isPlaying && isPlayer && (
            <textarea
              ref={inputRef}
              value={typed}
              onChange={handleInput}
              rows={2}
              placeholder="Start typing here…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `2px solid ${primary}55`, background: 'rgba(0,0,0,0.1)', color: '#f9fafb', fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.9rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }}
            />
          )}
          {isPlaying && !isPlayer && (
            <p style={{ textAlign: 'center', color: '#9ca3af', fontFamily: 'monospace', fontSize: '0.78rem' }}>👁 Spectating</p>
          )}
        </>
      )}

      {/* Waiting */}
      {isWaiting && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>⌨️</div>
          <p style={{ color: '#9ca3af', fontFamily: 'monospace', fontSize: '0.8rem', marginBottom: 12 }}>
            {isP1 ? 'Waiting for a challenger…' : 'Race to type the passage!'}
          </p>
          {canJoin && (
            <button onClick={onJoin} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', cursor: 'pointer', background: primary, color: '#fff', fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.9rem', fontWeight: 600 }}>
              Join Race
            </button>
          )}
        </div>
      )}

      {/* Finished */}
      {isFinished && (
        <div style={{ textAlign: 'center', padding: '12px', borderRadius: 10, background: `${primary}22`, border: `1.5px solid ${primary}44`, marginTop: 8 }}>
          <p style={{ color: '#f9fafb', fontWeight: 700, fontFamily: 'monospace', margin: 0 }}>
            {isSolo ? `🏆 Done! ${myWPM} WPM` : (gameData.winner === myRole ? '🏆 You won!' : gameData.winner ? `${oppName} wins!` : '🤝 Draw!')}
          </p>
          {!isSolo && (
            <p style={{ color: '#9ca3af', fontSize: '0.72rem', marginTop: 4, fontFamily: 'monospace' }}>
              You: {myWPM} WPM · Opp: {oppWPM} WPM
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default TypingGame;
