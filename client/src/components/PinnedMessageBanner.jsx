import React from 'react';
import { X } from 'lucide-react';

const PinnedMessageBanner = ({ pinnedMessage, isHost, onUnpin, onClick }) => {
  if (!pinnedMessage) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50/90 dark:bg-amber-900/20 border-b border-amber-200/60 dark:border-amber-700/30 backdrop-blur-sm z-30 animate-in slide-in-from-top-1 duration-200">
      <span className="text-sm flex-shrink-0" aria-hidden="true">📌</span>
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={onClick}
        title="Jump to pinned message"
      >
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 leading-none mb-0.5">
          {pinnedMessage.senderNickname} pinned
        </p>
        <p className="text-xs text-gray-700 dark:text-gray-200 truncate leading-snug">
          {pinnedMessage.text}
        </p>
      </div>
      {isHost && (
        <button
          onClick={onUnpin}
          className="flex-shrink-0 p-1 hover:bg-amber-200/60 dark:hover:bg-amber-700/40 rounded-full transition-colors text-amber-600 dark:text-amber-400"
          title="Unpin message"
          aria-label="Unpin message"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default PinnedMessageBanner;
