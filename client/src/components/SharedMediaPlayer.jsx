import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, SkipForward, Volume2, VolumeX, X, Minimize2, Maximize2,
  Link, ExternalLink, Users, Radio, ChevronDown
} from 'lucide-react';
import socketManager from '../socket';
import {
  encryptMessageSecure, decryptMessageSecure,
} from '../utils/security';
import { withJitter } from '../crypto/traffic-padding';

/**
 * SharedMediaPlayer — Synced YouTube / SoundCloud watch-party component.
 * 
 * Embeds YouTube IFrame API or SoundCloud Widget API and synchronises
 * play / pause / seek across every participant in the room via Socket.IO.
 * 
 * Usage: <SharedMediaPlayer roomCode={roomCode} currentUser={currentUser} isHost={isHost} roomVibe={roomVibe} />
 */

// ─── URL Detection Helpers ────────────────────────────────────────────
const YT_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const SC_REGEX = /soundcloud\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+/;

// Security: URL origin whitelist (must match server-side validation)
const SAFE_YT_ORIGIN = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//;
const SAFE_SC_ORIGIN = /^https?:\/\/(www\.)?soundcloud\.com\//;

/**
 * Validate that a URL is a safe, whitelisted media URL.
 * Prevents javascript:, data:, or arbitrary URL injection.
 */
function isSafeMediaUrl(url, type) {
  if (typeof url !== 'string' || url.length > 2048) return false;
  // Block dangerous schemes
  const lower = url.toLowerCase().trim();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) return false;
  if (type === 'youtube') return SAFE_YT_ORIGIN.test(url);
  if (type === 'soundcloud') return SAFE_SC_ORIGIN.test(url);
  return false;
}

export function detectMediaUrl(text) {
  const ytMatch = text.match(YT_REGEX);
  if (ytMatch) {
    const url = text.match(/https?:\/\/[^\s]+/)?.[0] || text;
    if (!isSafeMediaUrl(url, 'youtube')) return null;
    return { type: 'youtube', id: ytMatch[1], url };
  }

  const scMatch = text.match(SC_REGEX);
  if (scMatch) {
    const url = `https://${scMatch[0]}`;
    if (!isSafeMediaUrl(url, 'soundcloud')) return null;
    return { type: 'soundcloud', url };
  }

  return null;
}

// ─── YouTube IFrame API loader ─────────────────────────────────────────
let ytApiLoaded = false;
let ytApiCallbacks = [];

function loadYouTubeApi() {
  return new Promise((resolve) => {
    if (ytApiLoaded && window.YT?.Player) { resolve(); return; }
    ytApiCallbacks.push(resolve);
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return;

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      ytApiLoaded = true;
      ytApiCallbacks.forEach(cb => cb());
      ytApiCallbacks = [];
    };
  });
}

// ─── SoundCloud Widget API loader ──────────────────────────────────────
let scApiLoaded = false;

function loadSoundCloudApi() {
  return new Promise((resolve) => {
    if (scApiLoaded && window.SC?.Widget) { resolve(); return; }
    if (document.querySelector('script[src*="api.js"]')) {
      const check = setInterval(() => {
        if (window.SC?.Widget) { scApiLoaded = true; clearInterval(check); resolve(); }
      }, 100);
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://w.soundcloud.com/player/api.js';
    tag.onload = () => {
      scApiLoaded = true;
      resolve();
    };
    document.head.appendChild(tag);
  });
}

// ─── Formatters ────────────────────────────────────────────────────────
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Component ─────────────────────────────────────────────────────────
const SharedMediaPlayer = ({ roomCode, currentUser, isHost, roomVibe = 'default', onNowPlayingChange, secureSessionReady = false, initialMedia = null }) => {
  const [mediaInfo, setMediaInfo] = useState(null);       // { type, id, url, sharedBy }
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(70);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [syncCount, setSyncCount] = useState(0);           // listeners watching
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  const ytPlayerRef = useRef(null);
  const scWidgetRef = useRef(null);
  const playerContainerRef = useRef(null);
  const timeUpdateRef = useRef(null);
  const ignoreNextSyncRef = useRef(false);                  // prevent echo
  const lastSeekRef = useRef(0);

  const vibeAccent = roomVibe === 'party' ? 'indigo' :
    roomVibe === 'chill' ? 'teal' :
      roomVibe === 'focus' ? 'orange' : 'blue';

  // ─── Socket event handlers ────────────────────────────────────────
  useEffect(() => {
    const handleMediaShare = async (data) => {
      let parsed;
      // ─── v2 Double Ratchet: decrypt if encrypted ──────────────────
      if (data.v === 2 && data.ratchet && data.ciphertext) {
        try {
          const json = await decryptMessageSecure(data, roomCode);
          parsed = JSON.parse(json);
        } catch (e) {
          console.error('media-share decrypt failed:', e);
          return;
        }
      } else {
        parsed = data; // Fallback for pre-upgrade clients
      }

      // Defense-in-depth: validate incoming media before rendering
      const type = typeof parsed.type === 'string' ? parsed.type : '';
      if (type !== 'youtube' && type !== 'soundcloud') return;
      if (!isSafeMediaUrl(parsed.url, type)) return;
      if (type === 'youtube' && (!parsed.id || !/^[a-zA-Z0-9_-]{11}$/.test(parsed.id))) return;

      setMediaInfo({
        type,
        id: parsed.id || null,
        url: parsed.url,
        sharedBy: typeof parsed.sharedBy === 'string' ? parsed.sharedBy.substring(0, 30) : 'Someone'
      });
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setIsMinimized(false);
    };

    const handleMediaSync = async (data) => {
      if (ignoreNextSyncRef.current) {
        ignoreNextSyncRef.current = false;
        return;
      }

      let parsed;
      // ─── v2 Double Ratchet: decrypt if encrypted ──────────────────
      if (data.v === 2 && data.ratchet && data.ciphertext) {
        try {
          const json = await decryptMessageSecure(data, roomCode);
          parsed = JSON.parse(json);
        } catch (e) {
          console.error('media-sync decrypt failed:', e);
          return;
        }
      } else {
        parsed = data;
      }

      // Validate sync action (whitelist)
      const action = typeof parsed.action === 'string' ? parsed.action : '';
      if (action !== 'play' && action !== 'pause' && action !== 'seek') return;
      const time = typeof parsed.currentTime === 'number'
        ? Math.max(0, Math.min(parsed.currentTime, 86400))
        : 0;

      if (action === 'play') {
        seekTo(time);
        playMedia();
      } else if (action === 'pause') {
        pauseMedia();
      } else if (action === 'seek') {
        seekTo(time);
      }
    };

    const handleMediaSyncCount = (data) => {
      setSyncCount(data.count || 0);
    };

    const handleMediaClose = () => {
      destroyPlayer();
      setMediaInfo(null);
      setIsPlaying(false);
      setCurrentTime(0);
    };

    socketManager.on('media-share', handleMediaShare);
    socketManager.on('media-sync', handleMediaSync);
    socketManager.on('media-sync-count', handleMediaSyncCount);
    socketManager.on('media-close', handleMediaClose);

    return () => {
      socketManager.off('media-share', handleMediaShare);
      socketManager.off('media-sync', handleMediaSync);
      socketManager.off('media-sync-count', handleMediaSyncCount);
      socketManager.off('media-close', handleMediaClose);
    };
  }, []);

  // ─── Restore persisted media state on reconnect ────────────────────
  useEffect(() => {
    if (!initialMedia || mediaInfo) return; // Only apply if no media is already loaded

    const restoreMedia = async () => {
      let parsed;
      // Handle v2 encrypted media state
      if (initialMedia.v === 2 && initialMedia.ratchet && initialMedia.ciphertext) {
        try {
          const json = await decryptMessageSecure(initialMedia, roomCode);
          parsed = JSON.parse(json);
        } catch (e) {
          console.warn('Could not decrypt persisted media state:', e);
          return;
        }
      } else {
        parsed = initialMedia;
      }

      const type = typeof parsed.type === 'string' ? parsed.type : '';
      if (type !== 'youtube' && type !== 'soundcloud') return;
      if (!isSafeMediaUrl(parsed.url, type)) return;
      if (type === 'youtube' && (!parsed.id || !/^[a-zA-Z0-9_-]{11}$/.test(parsed.id))) return;

      setMediaInfo({
        type,
        id: parsed.id || null,
        url: parsed.url,
        sharedBy: typeof parsed.sharedBy === 'string' ? parsed.sharedBy.substring(0, 30) : 'Room'
      });
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setIsMinimized(false);
    };

    restoreMedia();
  }, [initialMedia]);

  // ─── Embed player when media changes ──────────────────────────────
  useEffect(() => {
    if (!mediaInfo) return;

    if (mediaInfo.type === 'youtube') {
      loadYouTubeApi().then(() => {
        if (ytPlayerRef.current) {
          ytPlayerRef.current.destroy();
          ytPlayerRef.current = null;
        }

        ytPlayerRef.current = new window.YT.Player('shared-media-embed', {
          height: '100%',
          width: '100%',
          videoId: mediaInfo.id,
          playerVars: {
            autoplay: 0,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            fs: 0,
            playsinline: 1,
          },
          events: {
            onReady: (e) => {
              setDuration(e.target.getDuration());
              e.target.setVolume(volume);
              // Start time update polling
              clearInterval(timeUpdateRef.current);
              timeUpdateRef.current = setInterval(() => {
                if (ytPlayerRef.current?.getCurrentTime) {
                  setCurrentTime(ytPlayerRef.current.getCurrentTime());
                }
              }, 500);
            },
            onStateChange: (e) => {
              // YT.PlayerState: PLAYING=1, PAUSED=2, ENDED=0
              if (e.data === 1) setIsPlaying(true);
              else if (e.data === 2 || e.data === 0) setIsPlaying(false);
              if (e.data === 0) setCurrentTime(0); // ended
            }
          }
        });
      });
    } else if (mediaInfo.type === 'soundcloud') {
      loadSoundCloudApi().then(() => {
        const iframe = document.getElementById('shared-media-embed');
        if (!iframe) return;
        iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(mediaInfo.url)}&auto_play=false&show_artwork=true&visual=true&color=%236366f1`;

        // Wait for iframe to load, then bind SC widget
        iframe.onload = () => {
          const widget = window.SC.Widget(iframe);
          scWidgetRef.current = widget;

          widget.bind(window.SC.Widget.Events.READY, () => {
            widget.getDuration((d) => setDuration(d / 1000));
          });

          widget.bind(window.SC.Widget.Events.PLAY, () => setIsPlaying(true));
          widget.bind(window.SC.Widget.Events.PAUSE, () => setIsPlaying(false));
          widget.bind(window.SC.Widget.Events.PLAY_PROGRESS, (e) => {
            setCurrentTime(e.currentPosition / 1000);
          });
          widget.bind(window.SC.Widget.Events.FINISH, () => {
            setIsPlaying(false);
            setCurrentTime(0);
          });
        };
      });
    }

    // Tell server we're watching
    socketManager.emit('media-join', { roomCode });

    return () => {
      clearInterval(timeUpdateRef.current);
      socketManager.emit('media-leave', { roomCode });
    };
  }, [mediaInfo?.type, mediaInfo?.id, mediaInfo?.url]);

  // ─── Volume ───────────────────────────────────────────────────────
  useEffect(() => {
    const effectiveVol = isMuted ? 0 : volume;
    if (ytPlayerRef.current?.setVolume) ytPlayerRef.current.setVolume(effectiveVol);
    if (scWidgetRef.current?.setVolume) scWidgetRef.current.setVolume(effectiveVol);
  }, [volume, isMuted]);

  // ─── Broadcast "Now Playing" to room (all platforms) ──────────────
  // This makes every web/PWA/mobile user show up with a 🎵 badge in
  // the UserList — not just Electron users with system media detection.
  useEffect(() => {
    const emitNowPlaying = async (nowPlaying) => {
      // Encrypt now-playing data with Double Ratchet when session is ready
      if (secureSessionReady && nowPlaying) {
        try {
          const payload = await encryptMessageSecure(JSON.stringify({ nowPlaying }), roomCode);
          await withJitter(() => socketManager.emit('now-playing-update', payload));
          return;
        } catch (e) {
          console.warn('now-playing encrypt failed, sending cleartext:', e.message);
        }
      }
      // Fallback (session not ready or null nowPlaying to clear status)
      socketManager.emit('now-playing-update', { nowPlaying });
    };

    if (mediaInfo && isPlaying) {
      const title = mediaInfo.type === 'youtube'
        ? `YouTube video`
        : `SoundCloud track`;
      const nowPlaying = {
        title: mediaInfo.sharedBy ? `${title} (via ${mediaInfo.sharedBy})` : title,
        artist: 'Watch Party',
        source: mediaInfo.type,
      };
      emitNowPlaying(nowPlaying);
      onNowPlayingChange?.(nowPlaying);
    } else {
      // Paused or closed — clear now-playing
      emitNowPlaying(null);
      onNowPlayingChange?.(null);
    }
  }, [isPlaying, mediaInfo?.type, mediaInfo?.id, mediaInfo?.url, secureSessionReady]);

  // ─── Playback controls ───────────────────────────────────────────
  const playMedia = useCallback(() => {
    if (ytPlayerRef.current?.playVideo) ytPlayerRef.current.playVideo();
    if (scWidgetRef.current?.play) scWidgetRef.current.play();
    setIsPlaying(true);
  }, []);

  const pauseMedia = useCallback(() => {
    if (ytPlayerRef.current?.pauseVideo) ytPlayerRef.current.pauseVideo();
    if (scWidgetRef.current?.pause) scWidgetRef.current.pause();
    setIsPlaying(false);
  }, []);

  const seekTo = useCallback((time) => {
    if (ytPlayerRef.current?.seekTo) ytPlayerRef.current.seekTo(time, true);
    if (scWidgetRef.current?.seekTo) scWidgetRef.current.seekTo(time * 1000);
    setCurrentTime(time);
  }, []);

  const destroyPlayer = useCallback(() => {
    clearInterval(timeUpdateRef.current);
    if (ytPlayerRef.current) { try { ytPlayerRef.current.destroy(); } catch (e) { } ytPlayerRef.current = null; }
    scWidgetRef.current = null;
  }, []);

  // ─── Encrypted media emit helper ──────────────────────────────────
  // Encrypts media control payloads with Double Ratchet + timing jitter.
  // Falls back to cleartext if ratchet not ready (shouldn't happen in v2).
  const emitEncrypted = useCallback(async (event, data) => {
    if (secureSessionReady) {
      try {
        const payload = await encryptMessageSecure(JSON.stringify(data), roomCode);
        await withJitter(() => socketManager.emit(event, payload));
        return;
      } catch (e) {
        console.warn(`${event} encrypt failed, falling back to cleartext:`, e.message);
      }
    }
    // Fallback: still wrap with jitter for timing analysis protection
    await withJitter(() => socketManager.emit(event, data));
  }, [secureSessionReady, roomCode]);

  // ─── Sync actions (emit to room) ─────────────────────────────────
  const handlePlayPause = () => {
    ignoreNextSyncRef.current = true;
    if (isPlaying) {
      pauseMedia();
      emitEncrypted('media-sync', { roomCode, action: 'pause', currentTime });
    } else {
      playMedia();
      emitEncrypted('media-sync', { roomCode, action: 'play', currentTime });
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * duration;

    if (Math.abs(time - lastSeekRef.current) < 0.5) return;
    lastSeekRef.current = time;

    ignoreNextSyncRef.current = true;
    seekTo(time);
    emitEncrypted('media-sync', { roomCode, action: 'seek', currentTime: time });
  };

  const handleShareUrl = () => {
    const detected = detectMediaUrl(urlInput.trim());
    if (!detected) return;

    emitEncrypted('media-share', {
      roomCode,
      type: detected.type,
      id: detected.id || null,
      url: detected.url,
      sharedBy: currentUser?.nickname || 'Someone',
    });
    setUrlInput('');
    setShowUrlInput(false);
  };

  const handleClose = () => {
    destroyPlayer();
    setMediaInfo(null);
    // Server enforces role check — only host/elevated can close for everyone.
    // For regular users, this emit is silently ignored server-side,
    // but local player still closes for this user.
    // media-close has no sensitive payload, but still jitter for timing protection.
    withJitter(() => socketManager.emit('media-close', { roomCode }));
  };

  // ─── No media yet → show share button ────────────────────────────
  if (!mediaInfo) {
    return (
      <div className="relative">
        {showUrlInput ? (
          <div className={`flex items-center gap-2 bg-${vibeAccent}-50/80 dark:bg-${vibeAccent}-950/40 backdrop-blur-md border border-${vibeAccent}-200/30 dark:border-${vibeAccent}-700/30 rounded-2xl px-3 py-2 shadow-lg`}>
            <Link className={`w-4 h-4 text-${vibeAccent}-500 flex-shrink-0`} />
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleShareUrl()}
              placeholder="Paste YouTube or SoundCloud URL..."
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none min-w-0"
              autoFocus
            />
            <button
              onClick={handleShareUrl}
              disabled={!detectMediaUrl(urlInput.trim())}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${detectMediaUrl(urlInput.trim())
                ? `bg-${vibeAccent}-500 text-white hover:bg-${vibeAccent}-600 active:scale-95`
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
            >
              Share
            </button>
            <button onClick={() => setShowUrlInput(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full">
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowUrlInput(true)}
            className={`flex items-center gap-2 px-3 py-2 bg-white/60 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/40 dark:border-gray-700/40 rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-[0.98] group`}
          >
            <Radio className={`w-4 h-4 text-${vibeAccent}-500 group-hover:animate-pulse`} />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300 tracking-tight">Watch Party</span>
          </button>
        )}
      </div>
    );
  }

  // ─── Minimized state ─────────────────────────────────────────────
  if (isMinimized) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 bg-black/80 backdrop-blur-md rounded-2xl shadow-lg cursor-pointer border border-white/10`}
        onClick={() => setIsMinimized(false)}
      >
        <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
        <span className="text-xs font-bold text-white truncate max-w-[120px]">
          {mediaInfo.type === 'youtube' ? '▶ YouTube' : '🎵 SoundCloud'}
        </span>
        <span className="text-[10px] text-gray-400">{formatTime(currentTime)}</span>
        {syncCount > 0 && (
          <span className="text-[10px] text-blue-400 flex items-center gap-0.5">
            <Users className="w-2.5 h-2.5" />{syncCount}
          </span>
        )}
        <Maximize2 className="w-3 h-3 text-gray-400" />
      </div>
    );
  }

  // ─── Full player ─────────────────────────────────────────────────
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`w-80 max-w-[90vw] bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isPlaying ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
          <span className="text-xs font-bold text-white truncate">
            {mediaInfo.type === 'youtube' ? '▶ YouTube' : '🎵 SoundCloud'}
          </span>
          {syncCount > 0 && (
            <span className="text-[10px] text-blue-400 flex items-center gap-0.5 flex-shrink-0">
              <Users className="w-2.5 h-2.5" />{syncCount} watching
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setIsMinimized(true)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
            <Minimize2 className="w-3.5 h-3.5 text-gray-400" />
          </button>
          <button
            onClick={() => window.open(mediaInfo.url, '_blank')}
            className="p-1 hover:bg-white/10 rounded-full transition-colors"
            title="Open in browser"
          >
            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
          </button>
          <button onClick={handleClose} className="p-1 hover:bg-red-500/20 rounded-full transition-colors">
            <X className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      </div>

      {/* Video / Widget embed */}
      <div className="relative w-full aspect-video bg-black" ref={playerContainerRef}>
        {mediaInfo.type === 'youtube' ? (
          <div id="shared-media-embed" className="w-full h-full" />
        ) : (
          <iframe
            id="shared-media-embed"
            className="w-full h-full"
            scrolling="no"
            frameBorder="no"
            allow="autoplay"
            sandbox="allow-scripts allow-same-origin allow-popups"
            referrerPolicy="no-referrer"
          />
        )}
      </div>

      {/* Controls */}
      <div className="px-3 py-2 space-y-1.5">
        {/* Progress bar */}
        <div
          className="h-1.5 bg-white/10 rounded-full cursor-pointer group relative"
          onClick={handleSeek}
        >
          <div
            className={`h-full bg-${vibeAccent}-500 rounded-full transition-[width] duration-200 relative`}
            style={{ width: `${progress}%` }}
          >
            <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-${vibeAccent}-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg`} />
          </div>
        </div>

        {/* Time + buttons */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400 font-mono tabular-nums min-w-[70px]">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePlayPause}
              className={`p-1.5 rounded-full bg-${vibeAccent}-500 hover:bg-${vibeAccent}-600 text-white transition-all active:scale-90 shadow-lg`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
            </button>
          </div>

          <div className="flex items-center gap-1.5 min-w-[70px] justify-end">
            <button onClick={() => setIsMuted(!isMuted)} className="p-0.5 hover:bg-white/10 rounded-full transition-colors">
              {isMuted ? <VolumeX className="w-3 h-3 text-gray-400" /> : <Volume2 className="w-3 h-3 text-gray-400" />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={isMuted ? 0 : volume}
              onChange={(e) => { setVolume(Number(e.target.value)); setIsMuted(false); }}
              className="w-14 h-1 accent-white cursor-pointer"
            />
          </div>
        </div>

        {/* Shared by */}
        {mediaInfo.sharedBy && (
          <p className="text-[10px] text-gray-500 text-center">
            Shared by <span className="text-gray-400 font-medium">{mediaInfo.sharedBy}</span>
          </p>
        )}
      </div>
    </div>
  );
};

export default SharedMediaPlayer;
