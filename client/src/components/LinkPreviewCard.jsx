/**
 * LinkPreviewCard Component
 * Renders rich link previews for URLs detected in chat messages.
 * Supports YouTube (with lazy iframe embed), Spotify (embedded player),
 * TikTok, Twitter/X, and generic OpenGraph sites.
 *
 * Design follows Discord/Slack-style preview cards.
 */

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { ExternalLink, Play, Music, Globe, X as XIcon, Maximize2, Minimize2 } from 'lucide-react';

// Detect Electron environment
const isElectron = !!(window.electronAPI?.isElectron);

// ─── Platform Icons ─────────────────────────────────────────
const PlatformIcon = ({ platform, className = '' }) => {
  switch (platform) {
    case 'youtube':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      );
    case 'spotify':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
        </svg>
      );
    case 'twitter':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
        </svg>
      );
    default:
      return <Globe className={className} />;
  }
};

// ─── Platform accent colors ─────────────────────────────────
const PLATFORM_COLORS = {
  youtube: { border: 'border-red-500/30', bg: 'bg-red-50 dark:bg-red-900/10', text: 'text-red-600 dark:text-red-400', icon: 'text-red-500' },
  spotify: { border: 'border-green-500/30', bg: 'bg-green-50 dark:bg-green-900/10', text: 'text-green-600 dark:text-green-400', icon: 'text-green-500' },
  twitter: { border: 'border-sky-500/30', bg: 'bg-sky-50 dark:bg-sky-900/10', text: 'text-sky-600 dark:text-sky-400', icon: 'text-sky-500' },
  tiktok: { border: 'border-pink-500/30', bg: 'bg-pink-50 dark:bg-pink-900/10', text: 'text-pink-600 dark:text-pink-400', icon: 'text-pink-500' },
  reddit: { border: 'border-orange-500/30', bg: 'bg-orange-50 dark:bg-orange-900/10', text: 'text-orange-600 dark:text-orange-400', icon: 'text-orange-500' },
  github: { border: 'border-gray-500/30', bg: 'bg-gray-50 dark:bg-gray-900/10', text: 'text-gray-600 dark:text-gray-400', icon: 'text-gray-500' },
  generic: { border: 'border-blue-500/30', bg: 'bg-blue-50 dark:bg-blue-900/10', text: 'text-blue-600 dark:text-blue-400', icon: 'text-blue-500' },
};

// ─── YouTube Embed Component ────────────────────────────────
const YouTubeEmbed = memo(({ preview, isExpanded, onToggleExpand }) => {
  const [playing, setPlaying] = useState(false);
  const colors = PLATFORM_COLORS.youtube;
  const videoId = preview.metadata?.videoId;

  if (playing && preview.embedUrl) {
    return (
      <div className="relative">
        <div className={`${isExpanded ? 'w-full' : 'w-full max-w-sm'}`}>
          <div className="relative pb-[56.25%] h-0 overflow-hidden rounded-lg">
            <iframe
              src={`${preview.embedUrl}?autoplay=1&rel=0`}
              className="absolute top-0 left-0 w-full h-full rounded-lg"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title={preview.title || 'YouTube video'}
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
        <button
          onClick={() => setPlaying(false)}
          className="absolute top-2 right-2 p-1 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors z-10"
          title="Close player"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${colors.border} overflow-hidden cursor-pointer group hover:shadow-md transition-shadow max-w-sm`}>
      {/* Thumbnail with play button overlay */}
      {preview.thumbnailUrl && (
        <div className="relative" onClick={() => setPlaying(true)}>
          <img
            src={preview.thumbnailUrl}
            alt={preview.title || ''}
            className="w-full h-auto object-cover aspect-video"
            loading="lazy"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-red-600 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Play className="w-5 h-5 sm:w-6 sm:h-6 text-white ml-0.5" fill="white" />
            </div>
          </div>
        </div>
      )}
      {/* Meta info */}
      <div className={`px-3 py-2 ${colors.bg}`}>
        {preview.title && (
          <p className="text-sm font-bold text-gray-900 dark:text-white line-clamp-2 leading-tight">
            {preview.title}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-1">
          <PlatformIcon platform="youtube" className={`w-3.5 h-3.5 ${colors.icon}`} />
          <span className={`text-[11px] font-medium ${colors.text}`}>
            {preview.author || 'YouTube'}
          </span>
        </div>
      </div>
    </div>
  );
});

// ─── Spotify Embed Component ────────────────────────────────
const SpotifyEmbed = memo(({ preview }) => {
  const [playing, setPlaying] = useState(false);
  const colors = PLATFORM_COLORS.spotify;

  if (playing && preview.embedUrl) {
    return (
      <div className="relative max-w-sm">
        <iframe
          src={`${preview.embedUrl}?theme=0`}
          className="rounded-lg w-full"
          height={preview.metadata?.type === 'track' ? 80 : 352}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          title={preview.title || 'Spotify'}
        />
        <button
          onClick={() => setPlaying(false)}
          className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors z-10"
        >
          <XIcon className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border ${colors.border} overflow-hidden cursor-pointer group hover:shadow-md transition-shadow max-w-sm`}
      onClick={() => setPlaying(true)}
    >
      <div className="flex items-center gap-3 p-3">
        {preview.thumbnailUrl ? (
          <img
            src={preview.thumbnailUrl}
            alt={preview.title || ''}
            className="w-14 h-14 rounded-md object-cover flex-shrink-0"
            loading="lazy"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className={`w-14 h-14 rounded-md ${colors.bg} flex items-center justify-center flex-shrink-0`}>
            <Music className={`w-6 h-6 ${colors.icon}`} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {preview.title && (
            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{preview.title}</p>
          )}
          {preview.author && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{preview.author}</p>
          )}
          <div className="flex items-center gap-1 mt-1">
            <PlatformIcon platform="spotify" className={`w-3 h-3 ${colors.icon}`} />
            <span className={`text-[10px] font-medium ${colors.text}`}>Listen on Spotify</span>
          </div>
        </div>
        <div className={`w-8 h-8 rounded-full ${colors.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
          <Play className={`w-4 h-4 ${colors.icon} ml-0.5`} fill="currentColor" />
        </div>
      </div>
    </div>
  );
});

// ─── Twitter/X Preview Component ────────────────────────────
const TwitterPreview = memo(({ preview }) => {
  const colors = PLATFORM_COLORS.twitter;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-lg border ${colors.border} overflow-hidden hover:shadow-md transition-shadow max-w-sm`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={`p-3 ${colors.bg}`}>
        {preview.description && (
          <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-4 leading-relaxed mb-2">
            {preview.description}
          </p>
        )}
        <div className="flex items-center gap-1.5">
          <PlatformIcon platform="twitter" className={`w-3.5 h-3.5 ${colors.icon}`} />
          <span className={`text-[11px] font-medium ${colors.text}`}>
            {preview.author ? `@${preview.author}` : 'X (Twitter)'}
          </span>
        </div>
      </div>
    </a>
  );
});

// ─── TikTok Preview Component ───────────────────────────────
const TikTokPreview = memo(({ preview }) => {
  const colors = PLATFORM_COLORS.tiktok;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-lg border ${colors.border} overflow-hidden hover:shadow-md transition-shadow max-w-sm`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3">
        {preview.thumbnailUrl && (
          <img
            src={preview.thumbnailUrl}
            alt={preview.title || ''}
            className="w-20 h-20 object-cover flex-shrink-0"
            loading="lazy"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
        <div className={`flex-1 p-3 min-w-0 ${!preview.thumbnailUrl ? colors.bg : ''}`}>
          {preview.title && (
            <p className="text-sm font-bold text-gray-900 dark:text-white line-clamp-2 leading-tight">{preview.title}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            <PlatformIcon platform="tiktok" className={`w-3.5 h-3.5 ${colors.icon}`} />
            <span className={`text-[11px] font-medium ${colors.text}`}>
              {preview.author || 'TikTok'}
            </span>
          </div>
        </div>
      </div>
    </a>
  );
});

// ─── Generic Preview Component ──────────────────────────────
const GenericPreview = memo(({ preview }) => {
  const platform = preview.platform || 'generic';
  const colors = PLATFORM_COLORS[platform] || PLATFORM_COLORS.generic;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-lg border ${colors.border} overflow-hidden hover:shadow-md transition-shadow max-w-sm`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex">
        {preview.thumbnailUrl && (
          <img
            src={preview.thumbnailUrl}
            alt={preview.title || ''}
            className="w-24 h-auto object-cover flex-shrink-0 max-h-24"
            loading="lazy"
            onError={(e) => { e.target.parentElement.removeChild(e.target); }}
          />
        )}
        <div className={`flex-1 p-3 min-w-0 ${colors.bg}`}>
          {preview.title && (
            <p className="text-sm font-bold text-gray-900 dark:text-white line-clamp-2 leading-tight">{preview.title}</p>
          )}
          {preview.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">{preview.description}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5">
            <PlatformIcon platform={platform} className={`w-3 h-3 ${colors.icon}`} />
            <span className={`text-[10px] font-medium ${colors.text} truncate`}>
              {preview.provider || preview.author || (() => {
                try { return new URL(preview.url).hostname; } catch { return 'Link'; }
              })()}
            </span>
          </div>
        </div>
      </div>
    </a>
  );
});

// ─── Main LinkPreviewCard Component ─────────────────────────
const LinkPreviewCard = memo(({ previews, isOwnMessage }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(new Set());
  const containerRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  // Lazy loading with IntersectionObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // Start loading 200px before visible
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleDismiss = useCallback((url) => {
    setDismissed(prev => new Set([...prev, url]));
  }, []);

  if (!previews || previews.length === 0) return null;

  const activePreviews = previews.filter(p => !dismissed.has(p.url));
  if (activePreviews.length === 0) return null;

  return (
    <div ref={containerRef} className="mt-1.5 space-y-1.5">
      {isVisible && activePreviews.map((preview, idx) => (
        <div key={preview.url || idx} className="relative group/preview">
          {/* Dismiss button */}
          <button
            onClick={() => handleDismiss(preview.url)}
            className="absolute -top-1.5 -right-1.5 z-10 p-0.5 bg-gray-200 dark:bg-gray-700 rounded-full opacity-0 group-hover/preview:opacity-100 transition-opacity shadow-sm hover:bg-gray-300 dark:hover:bg-gray-600"
            title="Dismiss preview"
          >
            <XIcon className="w-3 h-3 text-gray-500 dark:text-gray-400" />
          </button>

          {/* Platform-specific rendering */}
          {preview.platform === 'youtube' ? (
            <YouTubeEmbed
              preview={preview}
              isExpanded={isExpanded}
              onToggleExpand={() => setIsExpanded(!isExpanded)}
            />
          ) : preview.platform === 'spotify' ? (
            <SpotifyEmbed preview={preview} />
          ) : preview.platform === 'twitter' ? (
            <TwitterPreview preview={preview} />
          ) : preview.platform === 'tiktok' ? (
            <TikTokPreview preview={preview} />
          ) : (
            <GenericPreview preview={preview} />
          )}
        </div>
      ))}
    </div>
  );
});

LinkPreviewCard.displayName = 'LinkPreviewCard';

export default LinkPreviewCard;
