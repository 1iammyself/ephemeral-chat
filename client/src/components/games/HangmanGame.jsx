import React, { useState, useEffect } from 'react';
import { getVibeById } from '../../utils/vibes';

// SVG hangman drawing stages
function HangmanSVG({ wrong }) {
  return (
    <svg viewBox="0 0 120 130" width="100%" style={{ maxWidth: 120 }}>
      {/* Gallows */}
      <line x1="10" y1="125" x2="110" y2="125" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round"/>
      <line x1="30" y1="125" x2="30" y2="10" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round"/>
      <line x1="30" y1="10" x2="75" y2="10" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round"/>
      <line x1="75" y1="10" x2="75" y2="25" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"/>
      {/* Head */}
      {wrong >= 1 && <circle cx="75" cy="35" r="10" stroke="#ef4444" strokeWidth="2" fill="none"/>}
      {/* Body */}
      {wrong >= 2 && <line x1="75" y1="45" x2="75" y2="80" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>}
      {/* Left arm */}
      {wrong >= 3 && <line x1="75" y1="55" x2="55" y2="68" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>}
      {/* Right arm */}
      {wrong >= 4 && <line x1="75" y1="55" x2="95" y2="68" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>}
      {/* Left leg */}
      {wrong >= 5 && <line x1="75" y1="80" x2="58" y2="100" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>}
      {/* Right leg */}
      {wrong >= 6 && <line x1="75" y1="80" x2="92" y2="100" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>}
    </svg>
  );
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

const HangmanGame = ({ gameData, currentUserId, currentNickname, onGuess, onSetWord, onJoin, vibeId }) => {
  const [wordInput, setWordInput] = useState('');
  const [lastGuess, setLastGuess] = useState(null);
  const vibe = getVibeById(vibeId);
  const primary = vibe.colors?.primary || '#6366f1';

  const isWordmaster = gameData?.wordmaster?.id === currentUserId || (currentNickname && gameData?.wordmaster?.name === currentNickname);
  const isGuesser = gameData?.guesser?.id === currentUserId || (currentNickname && gameData?.guesser?.name === currentNickname);
  const canJoin = !gameData?.guesser && !isWordmaster && gameData?.status === 'waiting';

  const wrong = gameData?.wrongGuesses?.length || 0;
  const revealed = gameData?.revealedLetters || [];
  const wrongLetters = gameData?.wrongGuesses || [];
  const guessed = [...revealed.filter(Boolean), ...wrongLetters];

  const handleGuess = (letter) => {
    if (guessed.includes(letter)) return;
    setLastGuess(letter);
    onGuess(letter);
    setTimeout(() => setLastGuess(null), 600);
  };

  const handleSetWord = (e) => {
    e.preventDefault();
    if (wordInput.trim().length >= 3) { onSetWord(wordInput.trim()); setWordInput(''); }
  };

  const isWaiting = gameData?.status === 'waiting';
  const isPicking = gameData?.status === 'picking';
  const isPlaying = gameData?.status === 'playing';
  const isFinished = gameData?.status === 'finished';

  return (
    <div style={{ width: '100%', maxWidth: 'min(92vw, 380px)', margin: '0 auto', fontFamily: "'Caveat', cursive, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&display=swap');`}</style>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Hangman SVG */}
        <div style={{ flexShrink: 0, width: 100 }}>
          <HangmanSVG wrong={wrong} />
          <div style={{ textAlign: 'center', fontSize: '0.72rem', color: wrong >= 5 ? '#ef4444' : '#9ca3af', fontFamily: 'sans-serif', marginTop: 2 }}>
            {wrong}/{gameData?.maxWrong || 6} wrong
          </div>
        </div>

        {/* Game content */}
        <div style={{ flex: 1 }}>
          {/* Word blanks */}
          {(isPlaying || isFinished) && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
              {revealed.map((letter, i) => (
                <div key={i} style={{
                  width: 24, height: 30, borderBottom: `2px solid ${primary}88`,
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                  fontSize: '1.2rem', color: '#f9fafb', fontWeight: 700, paddingBottom: 2,
                }}>
                  {letter ? letter.toUpperCase() : ''}
                </div>
              ))}
            </div>
          )}

          {/* Wrong letters */}
          {(isPlaying || isFinished) && wrongLetters.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
              {wrongLetters.map(l => (
                <span key={l} style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 700, textDecoration: 'line-through', fontFamily: 'monospace' }}>{l.toUpperCase()}</span>
              ))}
            </div>
          )}

          {/* Waiting to join */}
          {isWaiting && (
            <div style={{ textAlign: 'center', paddingTop: 10 }}>
              <p style={{ color: '#9ca3af', fontFamily: 'sans-serif', fontSize: '0.78rem', marginBottom: 10 }}>
                {isWordmaster ? 'Waiting for a guesser…' : 'Guess the hidden word!'}
              </p>
              {canJoin && (
                <button onClick={onJoin} style={{ padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'Caveat, cursive', fontSize: '1rem', fontWeight: 700, color: '#fff', background: primary }}>
                  Join as Guesser
                </button>
              )}
            </div>
          )}

          {/* Picking word */}
          {isPicking && isWordmaster && (
            <form onSubmit={handleSetWord}>
              <input
                value={wordInput}
                onChange={e => setWordInput(e.target.value)}
                placeholder="Enter secret word…"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${primary}55`, background: 'rgba(0,0,0,0.1)', color: '#f9fafb', fontFamily: 'Caveat, cursive', fontSize: '1.1rem', outline: 'none', marginBottom: 6, boxSizing: 'border-box' }}
              />
              <button type="submit" style={{ width: '100%', padding: '8px', borderRadius: 8, border: 'none', background: primary, color: '#fff', cursor: 'pointer', fontFamily: 'Caveat, cursive', fontSize: '1rem', fontWeight: 700 }}>
                Set Word
              </button>
            </form>
          )}

          {isPicking && !isWordmaster && (
            <p style={{ color: '#9ca3af', fontFamily: 'sans-serif', fontSize: '0.78rem', marginTop: 8 }}>
              {gameData?.wordmaster?.name} is picking a word…
            </p>
          )}
        </div>
      </div>

      {/* Keyboard */}
      {isPlaying && (isGuesser || (!isWordmaster && !isGuesser)) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10, justifyContent: 'center' }}>
          {ALPHABET.map(l => (
            <button
              key={l}
              onClick={() => handleGuess(l)}
              disabled={guessed.includes(l)}
              style={{
                width: 26, height: 30, borderRadius: 5, border: 'none', cursor: guessed.includes(l) ? 'default' : 'pointer',
                fontFamily: 'monospace', fontWeight: 700, fontSize: '0.82rem',
                background: wrongLetters.includes(l) ? '#ef444433' : revealed.includes(l) ? `${primary}44` : guessed.includes(l) ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.12)',
                color: wrongLetters.includes(l) ? '#ef4444' : revealed.includes(l) ? primary : guessed.includes(l) ? '#4b5563' : '#f9fafb',
                opacity: guessed.includes(l) ? 0.5 : 1,
                transition: 'all 0.1s',
              }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Finished */}
      {isFinished && (
        <div style={{ textAlign: 'center', marginTop: 12, padding: '10px', borderRadius: 10, background: `${primary}22` }}>
          <p style={{ color: '#f9fafb', fontWeight: 700, fontFamily: 'sans-serif', margin: 0 }}>
            {gameData.winner === 'guesser' ? '🎉 Word guessed!' : '💀 Word not guessed!'}
          </p>
          {gameData.wordForMaster && (
            <p style={{ color: primary, fontSize: '1.2rem', fontWeight: 900, marginTop: 4 }}>
              {gameData.wordForMaster.toUpperCase()}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default HangmanGame;
