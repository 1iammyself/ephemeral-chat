import React from 'react';
import { X, Trophy } from 'lucide-react';
import TypingRaceGame from './TypingRaceGame';
import { getVibeById } from '../../utils/vibes';

const TypingRaceModal = ({ isOpen, onClose, message, currentUser, onTypingRaceJoin, onTypingRaceStart, onTypingRaceProgress, onTypingRaceFinish, onRematch, onShareResult, roomVibe }) => {
  if (!isOpen || !message) return null;

  const { gameData } = message;
  const vibe = getVibeById(roomVibe);
  const headerClass = vibe.accentClass;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className={`relative w-full max-w-3xl bg-gray-50 dark:bg-gray-950 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-gray-300 dark:border-white/10 flex flex-col max-h-[95vh] sm:max-h-[90vh] animate-in zoom-in-95 duration-300`}>

        {/* Header */}
        <div className={`p-3 sm:p-4 ${headerClass} flex items-center justify-between shrink-0`}>
          <div className="flex items-center gap-2">
            <div className="p-1.5 sm:p-2 bg-white/20 rounded-xl">
              <Trophy className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h3 className="text-white font-black text-sm sm:text-lg tracking-tight">Typing Race</h3>
              <p className="text-white/70 text-[9px] sm:text-[10px] uppercase font-bold tracking-widest leading-none">
                {gameData.status === 'finished' ? 'Race Ended' : 'In Progress'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 hover:bg-white/20 rounded-full text-white transition-colors"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Game Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50 dark:bg-gray-900">
          <TypingRaceGame
            message={message}
            currentUser={currentUser}
            vibeColor={vibe.colors?.primary}
            onTypingRaceJoin={onTypingRaceJoin}
            onTypingRaceStart={onTypingRaceStart}
            onTypingRaceProgress={onTypingRaceProgress}
            onTypingRaceFinish={onTypingRaceFinish}
            onRematch={onRematch}
            onShareResult={onShareResult}
          />
        </div>
      </div>
    </div>
  );
};

export default TypingRaceModal;
