import React, { useRef, useState, useEffect } from 'react';
import { Play, Lock, Video, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Renders a received videoReply message.
 * View-once (isViewOnce=true): plays inline once; after playback shows "viewed" tombstone.
 * Saved (isViewOnce=false): replayable; thumbnail shown after viewing.
 * Phase 3: renders emoji overlay stickers and filter CSS from message payload.
 */
export default function VideoReplyMessage({ message, isOwnMessage, onViewed }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const [hasViewed, setHasViewed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [displayDuration, setDisplayDuration] = useState(
    message.duration ? `${Math.round(message.duration / 1000)}s` : ''
  );
  const [loadError, setLoadError] = useState(false);

  const isViewOnce = message.isViewOnce !== false; // default true unless explicitly false

  // Reconstruct data URL from base64 if needed (mirrors AudioPlayer pattern)
  const src = message.content?.startsWith('data:')
    ? message.content
    : `data:${message.mimeType || 'video/webm'};base64,${message.content}`;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnd = () => {
      setIsPlaying(false);
      // For replayable videos (not view-once), don't show tombstone
    };
    v.addEventListener('ended', onEnd);
    return () => v.removeEventListener('ended', onEnd);
  }, []);

  const handlePlay = () => {
    if (isOwnMessage) return;
    if (isViewOnce && hasViewed) return; // view-once already consumed
    const v = videoRef.current;
    if (!v) return;
    v.play()
      .then(() => {
        setIsPlaying(true);
        if (!hasViewed) {
          setHasViewed(true);
          onViewed?.(message.id);
        }
      })
      .catch(() => setLoadError(true));
  };

  const filterStyle = message.filterStyle && message.filterStyle !== 'none'
    ? message.filterStyle
    : undefined;

  const overlays = Array.isArray(message.overlays) ? message.overlays : [];

  // Own-message stub
  if (isOwnMessage) {
    return (
      <div className="flex items-center gap-2 p-3 bg-black/5 dark:bg-white/5 rounded-xl border border-dashed border-black/10 dark:border-white/10 opacity-70 min-w-[140px]">
        <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white/50">
          <Video className="w-5 h-5" />
        </div>
        <div>
          <div className="text-sm font-bold">{t('messageList.videoReplySent')}</div>
          {displayDuration && <div className="text-[10px] opacity-60">{displayDuration}</div>}
        </div>
      </div>
    );
  }

  // View-once tombstone (only when view-once AND already viewed AND not currently playing)
  if (isViewOnce && hasViewed && !isPlaying) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-800 min-w-[140px]">
        <Lock className="w-3 h-3 text-gray-400 shrink-0" />
        <span className="text-xs text-gray-400 italic">{t('messageList.videoReplyViewed')}</span>
      </div>
    );
  }

  // Unsupported MIME type
  if (loadError) {
    return (
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-800 min-w-[140px]">
        <span className="text-xs text-gray-400 italic">{t('messageList.videoReplyUnsupported')}</span>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-xl overflow-hidden cursor-pointer"
      style={{ minWidth: 160, maxWidth: 220 }}
      onClick={handlePlay}
    >
      {/* Inline video (visible while playing) */}
      <div className={`relative ${isPlaying ? 'block' : 'hidden'}`}>
        <video
          ref={videoRef}
          src={src}
          className="w-full rounded-xl"
          playsInline
          style={{ maxHeight: 180, filter: filterStyle }}
          onError={() => setLoadError(true)}
        />
        {/* Overlays on playing video */}
        {overlays.map((o, i) => (
          <div
            key={i}
            className="absolute pointer-events-none select-none text-2xl drop-shadow-lg"
            style={{ left: `${o.xPct * 100}%`, top: `${o.yPct * 100}%`, transform: 'translate(-50%,-50%)' }}
          >
            {o.emoji}
          </div>
        ))}
      </div>

      {/* Thumbnail + play overlay */}
      {!isPlaying && (
        <div className="relative bg-gray-900 rounded-xl overflow-hidden" style={{ minHeight: 110 }}>
          <video
            src={src}
            className="w-full object-cover rounded-xl opacity-60"
            style={{ maxHeight: 160, pointerEvents: 'none', filter: filterStyle }}
            preload="metadata"
            muted
            onLoadedMetadata={e => {
              if (!message.duration && e.target.duration > 0) {
                setDisplayDuration(`${Math.round(e.target.duration)}s`);
              }
            }}
            onError={() => setLoadError(true)}
          />

          {/* Overlays on thumbnail */}
          {overlays.map((o, i) => (
            <div
              key={i}
              className="absolute pointer-events-none select-none text-2xl drop-shadow-lg"
              style={{ left: `${o.xPct * 100}%`, top: `${o.yPct * 100}%`, transform: 'translate(-50%,-50%)' }}
            >
              {o.emoji}
            </div>
          ))}

          {/* Play button */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 bg-black/60 rounded-full flex items-center justify-center backdrop-blur-sm">
              {/* Replay icon for replayable videos already viewed */}
              {!isViewOnce && hasViewed
                ? <RefreshCw className="w-5 h-5 text-white" />
                : <Play className="w-6 h-6 text-white" style={{ marginLeft: 3 }} fill="white" />
              }
            </div>
          </div>

          {/* View-once badge */}
          {isViewOnce && (
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-amber-500/80 rounded-full px-2 py-0.5">
              <Lock className="w-2.5 h-2.5 text-white" />
              <span className="text-white text-[9px] font-bold uppercase tracking-wide">Once</span>
            </div>
          )}

          {/* "Saved" badge for replayable videos */}
          {!isViewOnce && (
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-green-500/80 rounded-full px-2 py-0.5">
              <span className="text-white text-[9px] font-bold uppercase tracking-wide">Saved</span>
            </div>
          )}

          {/* Duration badge */}
          {displayDuration && (
            <div className="absolute bottom-2 right-2 bg-black/60 rounded px-1.5 py-0.5">
              <span className="text-white text-[10px] font-bold">{displayDuration}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
