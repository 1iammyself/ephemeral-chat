import React from 'react';
import TypingGame from './games/TypingGame';
import { getVibeById } from '../utils/vibes';
import socketManager from '../socket';

const TypingPanel = ({ message, currentUser, roomVibe }) => {
  const { gameData } = message;
  const vibe = getVibeById(roomVibe);
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const currentNickname = currentUser?.nickname;

  const handleProgress = (progress, wpm) =>
    socketManager.emit('typesprint-progress', { messageId: message.id, progress, wpm });
  const handleJoin = () => socketManager.emit('typesprint-join', { messageId: message.id });

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-950 overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 ${vibe.accentClass} flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-white/20 rounded-lg">
            <span className="text-white text-lg">⌨️</span>
          </div>
          <div>
            <h3 className="text-white font-black text-sm leading-none">Type Sprint</h3>
            <p className="text-white/60 text-[9px] font-bold uppercase tracking-widest leading-none mt-0.5">
              {gameData.winner ? 'Race Finished' : gameData.status === 'playing' ? 'Racing!' : gameData.status === 'countdown' ? 'Get ready…' : 'Waiting'}
            </p>
          </div>
        </div>
        <div className="text-white/60 text-[9px] font-bold uppercase tracking-wider">
          {gameData.player1?.name} vs {gameData.player2?.name || '?'}
        </div>
      </div>

      {/* Game */}
      <div className="flex-1 overflow-y-auto flex items-start justify-center p-4">
        <TypingGame
          gameData={gameData}
          currentUserId={currentUserId}
          currentNickname={currentNickname}
          onProgress={handleProgress}
          onJoin={handleJoin}
          vibeId={vibe.id}
        />
      </div>
    </div>
  );
};

export default TypingPanel;
