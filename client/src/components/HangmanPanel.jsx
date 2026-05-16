import React, { useState } from 'react';
import HangmanGame from './games/HangmanGame';
import { getVibeById } from '../utils/vibes';
import socketManager from '../socket';

const HangmanPanel = ({ message, currentUser, roomVibe }) => {
  const { gameData } = message;
  const vibe = getVibeById(roomVibe);
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const currentNickname = currentUser?.nickname;
  const [localWord, setLocalWord] = useState(null); // wordmaster's secret

  socketManager.off && socketManager.off('hangman-your-word');
  socketManager.on?.('hangman-your-word', ({ messageId, word }) => {
    if (messageId === message.id) setLocalWord(word);
  });

  const handleGuess = (letter) => socketManager.emit('hangman-guess', { messageId: message.id, letter });
  const handleSetWord = (word) => socketManager.emit('hangman-set-word', { messageId: message.id, word });
  const handleJoin = () => socketManager.emit('hangman-join', { messageId: message.id });

  const enrichedData = localWord
    ? { ...gameData, wordForMaster: localWord, revealedLetters: gameData.revealedLetters || Array(gameData.wordLength || localWord.length).fill(null) }
    : gameData;

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-950 overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 ${vibe.accentClass} flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-white/20 rounded-lg">
            <span className="text-white text-lg">🪤</span>
          </div>
          <div>
            <h3 className="text-white font-black text-sm leading-none">Word Trap</h3>
            <p className="text-white/60 text-[9px] font-bold uppercase tracking-widest leading-none mt-0.5">
              {gameData.winner ? 'Finished' : gameData.status === 'playing' ? 'Guessing' : gameData.status === 'picking' ? 'Pick a word' : 'Waiting'}
            </p>
          </div>
        </div>
        <div className="text-white/60 text-[9px] font-bold uppercase tracking-wider">
          🎭 {gameData.wordmaster?.name} vs 🔍 {gameData.guesser?.name || '?'}
        </div>
      </div>

      {/* Game */}
      <div className="flex-1 overflow-y-auto flex items-start justify-center p-4">
        <HangmanGame
          gameData={enrichedData}
          currentUserId={currentUserId}
          currentNickname={currentNickname}
          onGuess={handleGuess}
          onSetWord={handleSetWord}
          onJoin={handleJoin}
          vibeId={vibe.id}
        />
      </div>
    </div>
  );
};

export default HangmanPanel;
