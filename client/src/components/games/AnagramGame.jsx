import React, { useState, useEffect, useRef } from 'react';
import { getVibeById } from '../../utils/vibes';

const AnagramGame = ({ gameData, currentUserId, currentNickname, onGuess, vibeId, onJoin }) => {
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState(null); // 'wrong' | 'correct' | null
  const [timeLeft, setTimeLeft] = useState(30);
  const inputRef = useRef(null);
  const vibe = getVibeById(vibeId);
  const primary = vibe.colors?.primary || '#6366f1';

  const isHost = gameData?.host?.id === currentUserId || (currentNickname && gameData?.host?.name === currentNickname);
  const isChallenger = gameData?.challenger?.id === currentUserId || (currentNickname && gameData?.challenger?.name === currentNickname);
  const isPlayer = isHost || isChallenger;
  const canJoin = !gameData?.challenger && !isHost && gameData?.status === 'waiting';

  useEffect(() => {
    if (gameData?.status === 'playing' && gameData?.roundDeadline) {
      const update = () => {
        const left = Math.max(0, Math.ceil((gameData.roundDeadline - Date.now()) / 1000));
        setTimeLeft(left);
      };
      update();
      const interval = setInterval(update, 500);
      return () => clearInterval(interval);
    }
  }, [gameData?.roundDeadline, gameData?.status]);

  useEffect(() => {
    setInput('');
    setFeedback(null);
    if (gameData?.status === 'playing') inputRef.current?.focus();
  }, [gameData?.round, gameData?.status]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || !isPlayer) return;
    const guess = input.trim().toLowerCase();
    onGuess(guess);
    setInput('');
    setFeedback('sent');
    setTimeout(() => setFeedback(null), 800);
  };

  const scrambled = gameData?.currentScrambled || '';
  const isWaiting = gameData?.status === 'waiting';
  const isPlaying = gameData?.status === 'playing';
  const isFinished = gameData?.status === 'finished';
  const myScore = isHost ? gameData?.scores?.host : gameData?.scores?.challenger;
  const oppScore = isHost ? gameData?.scores?.challenger : gameData?.scores?.host;
  const oppName = isHost ? gameData?.challenger?.name : gameData?.host?.name;

  return (
    <div style={{ width: '100%', maxWidth: 'min(92vw, 380px)', margin: '0 auto', fontFamily: "'Fredoka One', cursive, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800&display=swap');
        @keyframes anagram-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes anagram-shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
        @keyframes anagram-pop { 0%{transform:scale(1)} 50%{transform:scale(1.15)} 100%{transform:scale(1)} }
      `}</style>

      {/* Scores */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, padding: '6px 10px', borderRadius: 12, background: `${primary}22`, border: `1.5px solid ${primary}44` }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: primary }}>{myScore ?? 0}</div>
          <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontFamily: 'Nunito, sans-serif' }}>You</div>
        </div>
        <div style={{ textAlign: 'center', opacity: 0.5, fontSize: '1rem', alignSelf: 'center' }}>vs</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#f59e0b' }}>{oppScore ?? 0}</div>
          <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontFamily: 'Nunito, sans-serif' }}>{oppName || '?'}</div>
        </div>
        <div style={{ textAlign: 'center', borderLeft: `1px solid ${primary}33`, paddingLeft: 10 }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: timeLeft <= 5 ? '#ef4444' : '#9ca3af' }}>{timeLeft}s</div>
          <div style={{ fontSize: '0.62rem', color: '#9ca3af', fontFamily: 'Nunito, sans-serif' }}>Round {gameData?.round}/{gameData?.totalRounds}</div>
        </div>
      </div>

      {/* Scrambled tiles */}
      {isPlaying && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {scrambled.split('').map((letter, i) => (
            <div key={i} style={{
              width: 40, height: 46, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.3rem', fontWeight: 900, color: '#fff',
              background: `linear-gradient(145deg, ${primary}dd, ${primary}99)`,
              boxShadow: `0 4px 0 ${primary}44, 0 6px 8px rgba(0,0,0,0.2)`,
              animation: 'anagram-bounce 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.1}s`,
              userSelect: 'none',
            }}>
              {letter.toUpperCase()}
            </div>
          ))}
        </div>
      )}

      {/* Waiting state */}
      {isWaiting && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔤</div>
          <p style={{ color: '#9ca3af', fontFamily: 'Nunito, sans-serif', fontSize: '0.82rem', margin: 0 }}>
            {isHost ? 'Waiting for a challenger to join…' : 'Unscramble words faster than your opponent!'}
          </p>
          {canJoin && (
            <button
              onClick={onJoin}
              style={{ marginTop: 14, padding: '10px 24px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'Fredoka One, cursive', fontSize: '1rem', color: '#fff', background: `linear-gradient(135deg, ${primary}, ${primary}cc)`, boxShadow: `0 4px 12px ${primary}55` }}
            >
              Join Duel
            </button>
          )}
        </div>
      )}

      {/* Input */}
      {isPlaying && isPlayer && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Unscramble…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 12,
              border: `2px solid ${feedback === 'sent' ? '#22c55e' : primary}66`,
              background: 'rgba(0,0,0,0.08)', color: '#f9fafb',
              fontFamily: 'Nunito, sans-serif', fontSize: '1rem', fontWeight: 700, outline: 'none',
              animation: feedback === 'shake' ? 'anagram-shake 0.4s ease' : undefined,
            }}
          />
          <button type="submit" style={{
            padding: '10px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: primary, color: '#fff', fontFamily: 'Fredoka One, cursive', fontSize: '1rem',
            boxShadow: `0 4px 0 ${primary}66`,
          }}>Go</button>
        </form>
      )}

      {/* Spectator */}
      {isPlaying && !isPlayer && (
        <div style={{ textAlign: 'center', padding: '10px', color: '#9ca3af', fontFamily: 'Nunito, sans-serif', fontSize: '0.78rem' }}>
          👁 Watching live — {gameData?.host?.name} vs {gameData?.challenger?.name}
        </div>
      )}

      {/* Finished */}
      {isFinished && (
        <div style={{ textAlign: 'center', padding: '12px', borderRadius: 12, background: `${primary}22`, border: `1.5px solid ${primary}44` }}>
          <div style={{ fontSize: '1.8rem', marginBottom: 4 }}>🏆</div>
          <p style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 800, color: '#f9fafb', margin: 0 }}>
            {gameData.winner === 'host' ? gameData.host?.name : gameData.challenger?.name} wins!
          </p>
          <p style={{ fontFamily: 'Nunito, sans-serif', fontSize: '0.75rem', color: '#9ca3af', marginTop: 4 }}>
            {gameData.scores?.host} – {gameData.scores?.challenger}
          </p>
        </div>
      )}
    </div>
  );
};

export default AnagramGame;
