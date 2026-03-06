import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, SkipForward, Volume2, VolumeX, X, Minimize2, Maximize2,
  Link, ExternalLink, Users, Radio, ChevronDown
} from 'lucide-react';
import socketManager from '../socket';
import {
  encryptMLSMessage, decryptMLSMessage, isMLSReady,
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
const SharedMediaPlayer = ({ roomCode, currentUser, isHost, roomVibe = 'default', onNowPlayingChange, mlsReady = false, initialMedia = null }) => {
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
  const [showControls, setShowControls] = useState(true);   // overlay controls visibility

  const ytPlayerRef = useRef(null);
  const scWidgetRef = useRef(null);
  const playerContainerRef = useRef(null);
  const timeUpdateRef = useRef(null);
  const ignoreNextSyncRef = useRef(0);                      // timestamp of last self-emit (echo rejection)
  const lastSeekRef = useRef(0);
  const controlsHideTimerRef = useRef(null);                // auto-hide controls timer

  const vibeAccent = roomVibe === 'party' ? 'indigo' :
    roomVibe === 'chill' ? 'teal' :
      roomVibe === 'focus' ? 'orange' : 'blue';

  // ─── Socket event handlers ────────────────────────────────────────
  useEffect(() => {
    const handleMediaShare = async (data) => {
      let parsed;
      // ─── v4 AES-GCM: decrypt if encrypted ──────────────────
      if (data.v === 4 && data.ct) {
        try {
          const json = await decryptMLSMessage(data, roomCode);
          parsed = JSON.parse(json);
        } catch (e) {
          console.error('media-share v4 decrypt failed:', e);
          return;
        }
      // ─── MLS v3: decrypt if encrypted ──────────────────
      } else if (data.v === 3 && data.mls) {
        try {
          const json = await decryptMLSMessage(data, roomCode);
          parsed = JSON.parse(json);
        } catch (e) {
          console.error('media-share v3 decrypt failed:', e);
          return;
        }
      } else {
        parsed = data; // Fallback for cleartext / pre-upgrade clients
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
      // Timestamp-based echo rejection: ignore syncs within 1s of our own emit
      if (ignoreNextSyncRef.current && (Date.now() - ignoreNextSyncRef.current) < 1000) {
        return;
      }
      ignoreNextSyncRef.current = 0;

      let parsed;
      // ─── v4 AES-GCM: decrypt if encrypted ──────────────────
      if (data.v === 4 && data.ct) {
        try {
          const json = await decryptMLSMessage(data, roomCode);
          parsed = JSON.parse(json);
        } catch (e) {
          console.error('media-sync v4 decrypt failed:', e);
          return;
        }
      // ─── MLS v3: decrypt if encrypted ──────────────────
      } else if (data.v === 3 && data.mls) {
        try {
          const json = await decryptMLSMessage(data, roomCode);
          parsed = JSON.parse(json);
        } catch (e) {
          console.error('media-sync v3 decrypt failed:', e);
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

    // Handle rejoin sync response from server
    const handleMediaSyncRestore = (data) => {
      if (!data || typeof data.currentTime !== 'number') return;
      // Retry until the player is actually ready (YT player needs time to load after re-init)
      let attempts = 0;
      const trySync = () => {
        attempts++;
        const yt = ytPlayerRef.current;
        const sc = scWidgetRef.current;
        if (yt?.seekTo || sc?.seekTo) {
          seekTo(data.currentTime);
          if (data.isPlaying) playMedia();
        } else if (attempts < 20) {
          // Player not ready yet — retry in 500ms (up to 10s total)
          setTimeout(trySync, 500);
        }
      };
      // First attempt after 1s to give embed time to initialize
      setTimeout(trySync, 1000);
    };

    socketManager.on('media-share', handleMediaShare);
    socketManager.on('media-sync', handleMediaSync);
    socketManager.on('media-sync-count', handleMediaSyncCount);
    socketManager.on('media-close', handleMediaClose);
    socketManager.on('media-sync-restore', handleMediaSyncRestore);

    return () => {
      socketManager.off('media-share', handleMediaShare);
      socketManager.off('media-sync', handleMediaSync);
      socketManager.off('media-sync-count', handleMediaSyncCount);
      socketManager.off('media-close', handleMediaClose);
      socketManager.off('media-sync-restore', handleMediaSyncRestore);
    };
  }, []);

  // ─── Restore persisted media state on reconnect ────────────────────
  useEffect(() => {
    if (!initialMedia) return;

    // If the media blob is encrypted, wait until the AES/MLS key is ready
    const isEncrypted = (initialMedia.v === 4 && initialMedia.ct) || (initialMedia.v === 3 && initialMedia.mls);
    if (isEncrypted && !mlsReady) return; // will re-run when mlsReady flips to true

    const restoreMedia = async () => {
      let parsed;
      // Handle v4 AES-GCM encrypted media state
      if (initialMedia.v === 4 && initialMedia.ct) {
        try {
          const json = await decryptMLSMessage(initialMedia, roomCode);
          parsed = JSON.parse(json);
        } catch (e) {
          console.warn('Could not decrypt v4 persisted media state:', e);
          return;
        }
      // Handle MLS v3 encrypted media state
      } else if (initialMedia.v === 3 && initialMedia.mls) {
        try {
          const json = await decryptMLSMessage(initialMedia, roomCode);
          parsed = JSON.parse(json);
        } catch (e) {
          console.warn('Could not decrypt v3 persisted media state:', e);
          return;
        }
      } else {
        parsed = initialMedia;
      }

      const type = typeof parsed.type === 'string' ? parsed.type : '';
      if (type !== 'youtube' && type !== 'soundcloud') return;
      if (!isSafeMediaUrl(parsed.url, type)) return;
      if (type === 'youtube' && (!parsed.id || !/^[a-zA-Z0-9_-]{11}$/.test(parsed.id))) return;

      // If already showing the same media, check if player is still alive
      let needsReinit = false;
      if (mediaInfo && mediaInfo.type === type && mediaInfo.url === parsed.url) {
        const playerAlive = type === 'youtube'
          ? (ytPlayerRef.current && typeof ytPlayerRef.current.getPlayerState === 'function')
          : (scWidgetRef.current && typeof scWidgetRef.current.play === 'function');

        if (playerAlive) {
          // Player is still functional — just sync playback position
          socketManager.emit('media-request-sync');
          return;
        }
        // Player is dead (e.g. after reconnect) — destroy stale refs and force full re-init
        console.log('[SharedMediaPlayer] Player dead on reconnect, forcing re-init');
        destroyPlayer();
        // Clear mediaInfo so the embed effect re-triggers with a fresh player
        setMediaInfo(null);
        needsReinit = true;
      }

      const applyMedia = () => {
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

        // Request current playback position from server so we sync to where others are
        setTimeout(() => socketManager.emit('media-request-sync'), 500);
      };

      if (needsReinit) {
        // Delay so React flushes the null mediaInfo before we set it again (same URL)
        // This ensures the embed effect deps [mediaInfo?.type, mediaInfo?.id, mediaInfo?.url]
        // transition null → value, causing a re-run and fresh player creation
        setTimeout(applyMedia, 100);
      } else {
        applyMedia();
      }
    };

    restoreMedia();
  }, [initialMedia, mlsReady]);

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
      // Encrypt now-playing data with MLS when session is ready
      if (isMLSReady(roomCode) && nowPlaying) {
        try {
          const payload = encryptMLSMessage(JSON.stringify({ nowPlaying }), roomCode);
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
  }, [isPlaying, mediaInfo?.type, mediaInfo?.id, mediaInfo?.url, roomCode]);

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
    if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
    if (ytPlayerRef.current) { try { ytPlayerRef.current.destroy(); } catch (e) { } ytPlayerRef.current = null; }
    scWidgetRef.current = null;
  }, []);

  // ─── Encrypted media emit helper ──────────────────────────────────
  // Encrypts media control payloads with AES-GCM.
  // Media-sync (play/pause/seek) is time-critical — NO jitter delay.
  // For media-sync, attaches a cleartext _hint so the server can track
  // playback position for rejoin sync (not sensitive — just action + timestamp).
  const emitEncrypted = useCallback(async (event, data) => {
    if (isMLSReady(roomCode)) {
      try {
        const payload = await encryptMLSMessage(JSON.stringify(data), roomCode);
        // Attach cleartext hint for server-side playback tracking
        if (event === 'media-sync') {
          payload._hint = { action: data.action, currentTime: data.currentTime };
        }
        socketManager.emit(event, payload);
        return;
      } catch (e) {
        console.warn(`${event} encrypt failed, falling back to cleartext:`, e.message);
      }
    }
    socketManager.emit(event, data);
  }, [roomCode]);

  // ─── Sync actions (emit to room) ─────────────────────────────────
  const handlePlayPause = () => {
    // Mark that we're about to emit — ignore echoes for 1 second
    ignoreNextSyncRef.current = Date.now();
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

    ignoreNextSyncRef.current = Date.now();
    seekTo(time);
    emitEncrypted('media-sync', { roomCode, action: 'seek', currentTime: time });
  };

  const handleShareUrl = () => {
    const detected = detectMediaUrl(urlInput.trim());
    if (!detected) return;

    // Optimistic local update so sender sees player immediately
    setMediaInfo({
      type: detected.type,
      id: detected.id || null,
      url: detected.url,
      sharedBy: currentUser?.nickname || 'Someone',
    });
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setIsMinimized(false);

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
              data-allow-copy="true"
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

  // ─── Player (always rendered when mediaInfo exists — minimized just hides it via CSS) ──
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="relative">
      {/* Minimized bar — shown when minimized, clicking expands */}
      {isMinimized && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 bg-black/80 backdrop-blur-md rounded-2xl shadow-lg cursor-pointer border border-white/10"
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
      )}

      {/* Full player — kept alive even when minimized (hidden via CSS, not removed from DOM) */}
      <div
        className={`w-80 max-w-[90vw] bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden ${isMinimized ? 'absolute -left-[9999px] w-0 h-0 overflow-hidden pointer-events-none' : ''}`}
        style={isMinimized ? { position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' } : {}}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
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

        {/* Video / Widget embed with overlay controls */}
        <div
          className="relative w-full aspect-video bg-black group"
          ref={playerContainerRef}
          onMouseEnter={() => {
            if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
            setShowControls(true);
          }}
          onMouseLeave={() => {
            controlsHideTimerRef.current = setTimeout(() => setShowControls(false), 2000);
          }}
          onMouseMove={() => {
            setShowControls(true);
            if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
            controlsHideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
          }}
        >
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

          {/* Overlay: transparent click-catcher + big play/pause button center.
              The iframe captures clicks in its own browsing context, so we need
              a div on top of it to intercept taps/clicks and route them through
              our synced handlePlayPause instead of YouTube's local toggle. */}
          <div
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              handlePlayPause();
            }}
          >
            <div className={`w-full h-full flex items-center justify-center transition-opacity duration-300 ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0'}`}>
              <div className={`p-3 rounded-full bg-black/50 backdrop-blur-sm ${isPlaying ? 'opacity-0' : 'opacity-80'} transition-opacity`}>
                {isPlaying ? <Pause className="w-8 h-8 text-white" /> : <Play className="w-8 h-8 text-white ml-1" />}
              </div>
            </div>
          </div>

          {/* Overlay: bottom controls bar — z-20 to sit above click-catcher (z-10) */}
          <div
            className={`absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pt-6 pb-2 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Progress bar */}
            <div
              className="h-1 bg-white/20 rounded-full cursor-pointer group/seek mb-2 hover:h-2 transition-all"
              onClick={handleSeek}
            >
              <div
                className={`h-full bg-${vibeAccent}-500 rounded-full transition-[width] duration-200 relative`}
                style={{ width: `${progress}%` }}
              >
                <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-${vibeAccent}-400 rounded-full opacity-0 group-hover/seek:opacity-100 transition-opacity shadow-lg`} />
              </div>
            </div>

            {/* Time + play/pause + volume */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePlayPause}
                  className="p-1 hover:bg-white/20 rounded-full transition-colors"
                >
                  {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
                </button>
                <span className="text-[10px] text-gray-300 font-mono tabular-nums">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button onClick={() => setIsMuted(!isMuted)} className="p-0.5 hover:bg-white/20 rounded-full transition-colors">
                  {isMuted ? <VolumeX className="w-3.5 h-3.5 text-gray-300" /> : <Volume2 className="w-3.5 h-3.5 text-gray-300" />}
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
          </div>
        </div>

        {/* Shared by — below the video */}
        {mediaInfo.sharedBy && (
          <p className="text-[10px] text-gray-500 text-center py-1">
            Shared by <span className="text-gray-400 font-medium">{mediaInfo.sharedBy}</span>
          </p>
        )}
      </div>
    </div>
  );
};

export default SharedMediaPlayer;
