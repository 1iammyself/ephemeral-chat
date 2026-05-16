import React from 'react';
import { Trophy } from 'lucide-react';
import AnagramGame from './games/AnagramGame';
import { getVibeById } from '../utils/vibes';
import socketManager from '../socket';

const AnagramPanel = ({ message, currentUser, roomVibe }) => {
  const { gameData } = message;
  const vibe = getVibeById(roomVibe);
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const currentNickname = currentUser?.nickname;

  const handleGuess = (guess) => socketManager.emit('anagram-guess', { messageId: message.id, guess });
  const handleJoin = () => socketManager.emit('anagram-join', { messageId: message.id });

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-950 overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 ${vibe.accentClass} flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-white/20 rounded-lg">
            <span className="text-white text-lg">🔤</span>
          </div>
          <div>
            <h3 className="text-white font-black text-sm leading-none">Word Duel</h3>
            <p className="text-white/60 text-[9px] font-bold uppercase tracking-widest leading-none mt-0.5">
              {gameData.winner ? 'Finished' : gameData.status === 'playing' ? 'Round ' + gameData.round : 'Waiting'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {gameData.status === 'playing' && <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
          <span className="text-white/60 text-[9px] font-bold uppercase tracking-wider">
            {gameData.host?.name} vs {gameData.challenger?.name || '?'}
          </span>
        </div>
      </div>

      {/* Game */}
      <div className="flex-1 overflow-y-auto flex items-start justify-center p-4">
        <AnagramGame
          gameData={gameData}
          currentUserId={currentUserId}
          currentNickname={currentNickname}
          onGuess={handleGuess}
          onJoin={handleJoin}
          vibeId={vibe.id}
        />
      </div>

      {/* How to play */}
      {gameData.status === 'waiting' && (
        <div className="px-4 pb-4 shrink-0">
          <div className="rounded-xl p-3 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-[11px] text-gray-500 dark:text-gray-400">
            <p className="font-bold mb-1">How to play</p>
            <p>Unscramble the tiles to find the hidden word. First player to type the correct answer wins the round. Best of {gameData.totalRounds} rounds wins!</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnagramPanel;
