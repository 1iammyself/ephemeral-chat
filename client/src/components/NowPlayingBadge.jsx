import React, { useState, useEffect } from 'react';
import { Music } from 'lucide-react';

/**
 * NowPlayingBadge — Shows "🎵 Now Playing" status for a user.
 * 
 * Reads from user.nowPlaying if available (Electron system media detection)
 * or from SharedMediaPlayer sync state.
 * 
 * Props:
 *   nowPlaying: { title, artist, source } | null
 *   compact: boolean (true = single-line badge, false = expanded)
 */
const NowPlayingBadge = ({ nowPlaying, compact = true }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (nowPlaying?.title) {
      setIsVisible(true);
    } else {
      // Fade out
      const t = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(t);
    }
  }, [nowPlaying?.title]);

  if (!isVisible || !nowPlaying?.title) return null;

  const sourceEmoji = nowPlaying.source === 'youtube' ? '▶' :
    nowPlaying.source === 'soundcloud' ? '🎵' :
      nowPlaying.source === 'spotify' ? '🎧' :
        nowPlaying.source === 'system' ? '🎶' : '🎵';

  if (compact) {
    return (
      <div className="flex items-center gap-1 max-w-[160px] animate-in fade-in duration-300">
        <Music className="w-2.5 h-2.5 text-green-500 animate-pulse flex-shrink-0" />
        <span className="text-[10px] text-green-600 dark:text-green-400 truncate font-medium">
          {nowPlaying.artist ? `${nowPlaying.title} — ${nowPlaying.artist}` : nowPlaying.title}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50/80 dark:bg-green-950/30 border border-green-200/30 dark:border-green-800/30 rounded-lg animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div className="flex items-center gap-0.5">
        <span className="text-xs">{sourceEmoji}</span>
        <Music className="w-3 h-3 text-green-500 animate-pulse" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-green-700 dark:text-green-300 truncate leading-tight">
          {nowPlaying.title}
        </p>
        {nowPlaying.artist && (
          <p className="text-[10px] text-green-600/70 dark:text-green-400/70 truncate leading-tight">
            {nowPlaying.artist}
          </p>
        )}
      </div>
    </div>
  );
};

export default NowPlayingBadge;
