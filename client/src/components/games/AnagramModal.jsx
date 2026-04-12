import React, { useEffect, useRef, useState } from 'react';
import { X, Trophy, Maximize2, Minimize2, Move } from 'lucide-react';
import AnagramGame from './AnagramGame';
import { getVibeById } from '../../utils/vibes';

const AnagramModal = ({ isOpen, onClose, message, currentUser, onAnagramJoin, onAnagramSubmit, onAnagramNextRound, onAnagramReveal, onAnagramHint, onRematch, onShareResult, roomVibe }) => {
  if (!isOpen || !message) return null;

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isMaximized, setIsMaximized] = useState(false);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });

  const { gameData } = message;
  const vibe = getVibeById(roomVibe);
  const headerClass = vibe.accentClass;

  useEffect(() => {
    if (!isOpen) {
      setPosition({ x: 0, y: 0 });
      setIsMaximized(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragRef.current.dragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPosition({ x: dragRef.current.baseX + dx, y: dragRef.current.baseY + dy });
    };

    const handleUp = () => {
      dragRef.current.dragging = false;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const onDragStart = (e) => {
    if (isMaximized || e.button !== 0) return;
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      baseX: position.x,
      baseY: position.y,
    };
  };

  const windowStyle = isMaximized
    ? { width: 'calc(100vw - 1.25rem)', height: 'calc(100vh - 1.25rem)' }
    : { transform: `translate(${position.x}px, ${position.y}px)` };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Container */}
  <div style={windowStyle} className={`relative w-full ${isMaximized ? 'max-w-none rounded-xl' : 'max-w-2xl rounded-2xl sm:rounded-3xl'} bg-gray-50 dark:bg-gray-950 shadow-2xl overflow-hidden border border-gray-300 dark:border-white/10 flex flex-col max-h-[95vh] sm:max-h-[90vh] animate-in zoom-in-95 duration-300`}>

        {/* Header */}
        <div className={`p-3 sm:p-4 ${headerClass} flex items-center justify-between shrink-0 ${isMaximized ? '' : 'cursor-move'}`} onMouseDown={onDragStart}>
          <div className="flex items-center gap-2">
            <div className="p-1.5 sm:p-2 bg-white/20 rounded-xl">
              <Trophy className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h3 className="text-white font-black text-sm sm:text-lg tracking-tight">Anagrams</h3>
              <p className="text-white/70 text-[9px] sm:text-[10px] uppercase font-bold tracking-widest leading-none">
                {gameData.gameOver ? 'Game Ended' : 'In Progress'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {!isMaximized && <Move className="w-4 h-4 text-white/80" />}
            <button
              onClick={(e) => { e.stopPropagation(); setIsMaximized(v => !v); }}
              className="p-1.5 sm:p-2 hover:bg-white/20 rounded-full text-white transition-colors"
              title={isMaximized ? 'Restore window' : 'Maximize window'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="p-1.5 sm:p-2 hover:bg-white/20 rounded-full text-white transition-colors"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        {/* Game Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50 dark:bg-gray-900">
          <AnagramGame
            message={message}
            currentUser={currentUser}
            vibeColor={vibe.colors?.primary}
            vibeAccent={vibe.accent}
            onAnagramJoin={onAnagramJoin}
            onAnagramSubmit={onAnagramSubmit}
            onAnagramNextRound={onAnagramNextRound}
            onAnagramReveal={onAnagramReveal}
            onAnagramHint={onAnagramHint}
            onRematch={onRematch}
            onShareResult={onShareResult}
          />
        </div>
      </div>
    </div>
  );
};

export default AnagramModal;
