import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, Volume2, VolumeX, X, Minimize2, Maximize2, Maximize, Shrink,
  ExternalLink, Users, Radio,
} from 'lucide-react';
import socketManager from '../socket';
import { getVibeById } from '../utils/vibes';
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
const FIGMA_REGEX = /figma\.com\/(file|proto|design)\/([a-zA-Z0-9_-]+)/;
const GDRIVE_REGEX = /drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)([^\s]*)/;
const DOCS_REGEX = /docs\.google\.com\/(document|spreadsheets|spreadsheet|presentation|forms)\/d\/([a-zA-Z0-9_-]+)(?:\/(?:edit|view))?([^\s]*)/;

// Security: URL origin whitelist (must match server-side validation)
const SAFE_YT_ORIGIN = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//;
const SAFE_SC_ORIGIN = /^https?:\/\/(www\.)?soundcloud\.com\//;
const SAFE_FIGMA_ORIGIN = /^https?:\/\/(www\.)?figma\.com\//;
const SAFE_GDRIVE_ORIGIN = /^https?:\/\/(www\.|docs\.|drive\.)?google\.com\//;

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
  if (type === 'figma') return SAFE_FIGMA_ORIGIN.test(url);
  if (type === 'gdrive' || type === 'docs') return SAFE_GDRIVE_ORIGIN.test(url);
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

  const figmaMatch = text.match(FIGMA_REGEX);
  if (figmaMatch) {
    const url = text.match(/https?:\/\/[^\s]+/)?.[0] || text;
    if (!isSafeMediaUrl(url, 'figma')) return null;
    return { type: 'figma', url };
  }

  const driveMatch = text.match(GDRIVE_REGEX);
  if (driveMatch) {
    const url = text.match(/https?:\/\/[^\s]+/)?.[0] || text;
    if (!isSafeMediaUrl(url, 'gdrive')) return null;
    return { type: 'gdrive', id: driveMatch[1], query: driveMatch[2] || '', url };
  }

  const docsMatch = text.match(DOCS_REGEX);
  if (docsMatch) {
    const url = text.match(/https?:\/\/[^\s]+/)?.[0] || text;
    if (!isSafeMediaUrl(url, 'docs')) return null;
    let query = docsMatch[3] || '';
    // If query starts with /edit or /view followed by params, strip the path prefix
    if (query.startsWith('/edit')) query = query.substring(5);
    else if (query.startsWith('/view')) query = query.substring(5);
    return { type: 'docs', service: docsMatch[1], id: docsMatch[2], query, url };
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
let scApiCallbacks = [];

function loadSoundCloudApi() {
  return new Promise((resolve) => {
    if (window.SC?.Widget) { scApiLoaded = true; resolve(); return; }
    scApiCallbacks.push(resolve);
    if (document.querySelector('script[src*="w.soundcloud.com/player/api.js"]')) return;

    const tag = document.createElement('script');
    tag.src = 'https://w.soundcloud.com/player/api.js';
    tag.onload = () => {
      scApiLoaded = true;
      const cbs = scApiCallbacks.splice(0);
      cbs.forEach(cb => cb());
    };
    tag.onerror = () => {
      const cbs = scApiCallbacks.splice(0);
      cbs.forEach(cb => cb());
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

// ─── SingleMediaPlayer ────────────────────────────────────────────────
// Renders one watch-party media card. Each card is fully independent:
// its own player refs, playback state, and socket handler scoped by mediaId.
const SingleMediaPlayer = ({
  mediaId,      // unique string ID for this media item
  mediaInfo,    // { type, id, url, sharedBy }
  roomCode,
  isHost,
  roomVibe = 'default',
  onNowPlayingChange,
  mlsReady = false,
  onRemove,     // () => void — called when this card wants to be removed from the list
  syncCount,    // shared watcher count (room-wide — passed down from list manager)
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(70);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  // Free-resize: null means "full natural width", number = explicit px width
  const [cardWidth, setCardWidth] = useState(null);
  const MAX_WIDTH = 512; // matches old max-w-lg (~32rem)
  const MIN_WIDTH = 200;
  const cardRef = useRef(null);
  const dragRef = useRef(null); // { startX, startWidth }

  // ─── Fullscreen logic ───────────────────────────────────────────
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleToggleFullscreen = () => {
    if (!cardRef.current) return;
    if (!document.fullscreenElement) {
      cardRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // ─── Resize drag handlers ────────────────────────────────────────
  const startResize = useCallback((e) => {
    e.preventDefault();
    const currentW = cardRef.current
      ? cardRef.current.getBoundingClientRect().width
      : MAX_WIDTH;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    dragRef.current = { startX: clientX, startWidth: currentW };

    const onMove = (ev) => {
      const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const delta = x - dragRef.current.startX;
      const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startWidth + delta));
      setCardWidth(newW);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      dragRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  }, []);

  const ytPlayerRef = useRef(null);
  const scWidgetRef = useRef(null);
  const playerContainerRef = useRef(null);
  const timeUpdateRef = useRef(null);
  const ignoreNextSyncRef = useRef(0);
  const lastSeekRef = useRef(0);
  const controlsHideTimerRef = useRef(null);
  const mediaInfoRef = useRef(mediaInfo);

  // Unique DOM ID per card — critical so multiple embeds can coexist
  const embedId = `shared-media-embed-${mediaId}`;

  const vibe = getVibeById(roomVibe);
  const vibeAccent = vibe.accent || 'primary';

  // Keep mediaInfoRef in sync
  useEffect(() => { mediaInfoRef.current = mediaInfo; }, [mediaInfo]);

  // ─── Playback controls ──────────────────────────────────────────
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
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.destroy(); } catch (_) { }
      ytPlayerRef.current = null;
    }
    scWidgetRef.current = null;
  }, []);

  // ─── Encrypted emit helper (scoped: includes mediaId) ───────────
  const emitEncrypted = useCallback(async (event, data) => {
    const payload = { ...data, mediaId };
    if (isMLSReady(roomCode)) {
      try {
        const enc = await encryptMLSMessage(JSON.stringify(payload), roomCode);
        if (event === 'media-sync') {
          enc._hint = { action: data.action, currentTime: data.currentTime, mediaId };
        }
        if (event === 'media-share') {
          enc._mediaHint = { type: data.type, id: data.id, url: data.url, sharedBy: data.sharedBy };
          enc._mediaId = mediaId;
        }
        socketManager.emit(event, enc);
        return;
      } catch (e) {
        console.warn(`${event} encrypt failed, sending cleartext:`, e.message);
      }
    }
    socketManager.emit(event, payload);
  }, [roomCode, mediaId]);

  // ─── Socket event handlers (filtered by mediaId) ────────────────
  useEffect(() => {
    const handleMediaSync = async (data) => {
      // Only respond to sync events for THIS media card
      if (data.mediaId && data.mediaId !== mediaId) return;

      if (ignoreNextSyncRef.current && (Date.now() - ignoreNextSyncRef.current) < 1000) return;
      ignoreNextSyncRef.current = 0;

      let parsed;
      if (data.v === 4 && data.ct) {
        try { parsed = JSON.parse(await decryptMLSMessage(data, roomCode)); }
        catch (e) { console.error('media-sync v4 decrypt failed:', e); return; }
      } else if (data.v === 3 && data.mls) {
        try { parsed = JSON.parse(await decryptMLSMessage(data, roomCode)); }
        catch (e) { console.error('media-sync v3 decrypt failed:', e); return; }
      } else {
        parsed = data;
      }

      // Filter again after decryption (encrypted payload may carry mediaId inside)
      if (parsed.mediaId && parsed.mediaId !== mediaId) return;

      const action = typeof parsed.action === 'string' ? parsed.action : '';
      if (action !== 'play' && action !== 'pause' && action !== 'seek') return;
      const time = typeof parsed.currentTime === 'number'
        ? Math.max(0, Math.min(parsed.currentTime, 86400)) : 0;

      if (action === 'play') { seekTo(time); playMedia(); }
      else if (action === 'pause') { pauseMedia(); }
      else if (action === 'seek') { seekTo(time); }
    };

    const handleMediaSyncRestore = (data) => {
      // Only apply restore for this specific media card
      if (data.mediaId && data.mediaId !== mediaId) return;
      if (typeof data.currentTime !== 'number') return;

      let attempts = 0;
      const trySync = () => {
        attempts++;
        const yt = ytPlayerRef.current;
        const sc = scWidgetRef.current;
        if (yt?.seekTo || sc?.seekTo) {
          seekTo(data.currentTime);
          if (data.isPlaying) playMedia();
        } else if (attempts < 20) {
          setTimeout(trySync, 500);
        }
      };
      setTimeout(trySync, 1000);
    };

    const handleMediaRecoverRequest = (data) => {
      // Only respond if this card has the requested mediaId (or if it's an open broadcast)
      if (data.mediaId && data.mediaId !== mediaId) return;
      const info = mediaInfoRef.current;
      if (!info?.url || !info?.type) return;
      socketManager.emit('media-recover-response', {
        requesterId: data?.requesterId,
        type: info.type,
        id: info.id || null,
        url: info.url,
        sharedBy: info.sharedBy || 'Someone',
        mediaId,
      });
    };

    socketManager.on('media-sync', handleMediaSync);
    socketManager.on('media-sync-restore', handleMediaSyncRestore);
    socketManager.on('media-recover-request', handleMediaRecoverRequest);

    return () => {
      socketManager.off('media-sync', handleMediaSync);
      socketManager.off('media-sync-restore', handleMediaSyncRestore);
      socketManager.off('media-recover-request', handleMediaRecoverRequest);
    };
  }, [mediaId, roomCode, seekTo, playMedia, pauseMedia]);

  // ─── Embed player ────────────────────────────────────────────────
  useEffect(() => {
    if (!mediaInfo) return;

    if (mediaInfo.type === 'youtube') {
      loadYouTubeApi().then(() => {
        if (ytPlayerRef.current) {
          try { ytPlayerRef.current.destroy(); } catch (_) { }
          ytPlayerRef.current = null;
        }
        // Guard: the DOM node might not exist yet if React hasn't flushed
        if (!document.getElementById(embedId)) return;

        ytPlayerRef.current = new window.YT.Player(embedId, {
          height: '100%',
          width: '100%',
          videoId: mediaInfo.id,
          playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0, fs: 0, playsinline: 1 },
          events: {
            onReady: (e) => {
              setDuration(e.target.getDuration());
              e.target.setVolume(volume);
              clearInterval(timeUpdateRef.current);
              timeUpdateRef.current = setInterval(() => {
                if (ytPlayerRef.current?.getCurrentTime) {
                  setCurrentTime(ytPlayerRef.current.getCurrentTime());
                }
              }, 500);
            },
            onStateChange: (e) => {
              if (e.data === 1) setIsPlaying(true);
              else if (e.data === 2 || e.data === 0) setIsPlaying(false);
              if (e.data === 0) setCurrentTime(0);
            }
          }
        });
      });
    } else if (mediaInfo.type === 'soundcloud') {
      const embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(mediaInfo.url)}&auto_play=false&visual=true&color=%236366f1`;
      loadSoundCloudApi().then(() => {
        requestAnimationFrame(() => {
          const iframe = document.getElementById(embedId);
          if (!iframe) return;
          if (iframe.src !== embedUrl) iframe.src = embedUrl;

          const tryBind = (retries = 20) => {
            try {
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
            } catch (err) {
              if (retries > 0) {
                setTimeout(() => tryBind(retries - 1), 250);
              }
            }
          };

          tryBind();
        });
      });
    } else if (mediaInfo.type === 'figma') {
      const iframe = document.getElementById(embedId);
      if (iframe) {
        // Add show_ui=1 for better interactivity
        const baseUrl = mediaInfo.url.includes('?') ? `${mediaInfo.url}&show_ui=1` : `${mediaInfo.url}?show_ui=1`;
        iframe.src = `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(baseUrl)}`;
      }
    } else if (mediaInfo.type === 'gdrive' || mediaInfo.type === 'docs') {
      const iframe = document.getElementById(embedId);
      if (iframe) {
        if (mediaInfo.type === 'docs') {
          // Use native Google preview endpoint which is cleaner and more compatible
          const service = mediaInfo.service || 'document';
          const query = mediaInfo.query || '';
          const hasQuery = query.includes('?');
          iframe.src = `https://docs.google.com/${service}/d/${mediaInfo.id}/preview${query}${hasQuery ? '&' : '?'}embedded=true`;
        } else {
          // Use native Drive preview endpoint to avoid "No Preview" errors
          // Pass through query params (like timestamps)
          const query = mediaInfo.query || '';
          const hasQuery = query.includes('?');
          iframe.src = `https://drive.google.com/file/d/${mediaInfo.id}/preview${query}${hasQuery ? '&' : '?'}embedded=true`;
        }
      }
    }

    socketManager.emit('media-join', { roomCode });
    // Request sync for this specific media after player loads
    setTimeout(() => socketManager.emit('media-request-sync', { mediaId }), 1200);

    return () => {
      clearInterval(timeUpdateRef.current);
      destroyPlayer();
      socketManager.emit('media-leave', { roomCode });
    };
  }, [mediaInfo?.type, mediaInfo?.id, mediaInfo?.url, embedId]);

  // ─── Volume ─────────────────────────────────────────────────────
  useEffect(() => {
    const v = isMuted ? 0 : volume;
    if (ytPlayerRef.current?.setVolume) ytPlayerRef.current.setVolume(v);
    if (scWidgetRef.current?.setVolume) scWidgetRef.current.setVolume(v);
  }, [volume, isMuted]);

  // ─── Now Playing ────────────────────────────────────────────────
  useEffect(() => {
    const emitNowPlaying = async (nowPlaying) => {
      if (isMLSReady(roomCode) && nowPlaying) {
        try {
          const enc = encryptMLSMessage(JSON.stringify({ nowPlaying }), roomCode);
          await withJitter(() => socketManager.emit('now-playing-update', enc));
          return;
        } catch (e) {
          console.warn('now-playing encrypt failed, sending cleartext:', e.message);
        }
      }
      socketManager.emit('now-playing-update', { nowPlaying });
    };

    if (mediaInfo && isPlaying) {
      const title = mediaInfo.type === 'youtube' ? 'YouTube video' :
        mediaInfo.type === 'soundcloud' ? 'SoundCloud track' : 'Media content';
      const nowPlaying = {
        title: mediaInfo.sharedBy ? `${title} (via ${mediaInfo.sharedBy})` : title,
        artist: 'Watch Party',
        source: mediaInfo.type,
      };
      emitNowPlaying(nowPlaying);
      onNowPlayingChange?.(nowPlaying);
    } else {
      emitNowPlaying(null);
      onNowPlayingChange?.(null);
    }
  }, [isPlaying, mediaInfo?.type, mediaInfo?.id, mediaInfo?.url, roomCode]);

  // ─── Sync emit helpers ───────────────────────────────────────────
  const handlePlayPause = () => {
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

  const handleClose = () => {
    destroyPlayer();
    // Tell server to close this specific media item
    withJitter(() => socketManager.emit('media-close', { roomCode, mediaId }));
    onRemove?.();
  };

  // ─── Render ─────────────────────────────────────────────────────
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={cardRef}
      className={`relative animate-in fade-in slide-in-from-bottom-2 duration-300 bg-white dark:bg-gray-900 ${isFullscreen ? 'fixed inset-0 m-0 w-screen h-screen z-[10000]' : 'mx-auto my-3'}`}
      style={isFullscreen ? { width: '100vw', height: '100vh', maxWidth: 'none', margin: 0 } : {
        width: cardWidth ? `${cardWidth}px` : '100%',
        maxWidth: `${MAX_WIDTH}px`,
        minWidth: `${MIN_WIDTH}px`,
      }}
    >
      <div className={`bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl ${isFullscreen ? 'h-full rounded-none' : 'rounded-2xl'} shadow-lg border border-gray-200/60 dark:border-gray-700/60 overflow-hidden ${isFullscreen ? '' : isMinimized ? '' : 'ring-1 ring-black/5 dark:ring-white/5'} flex flex-col transition-all duration-300`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-${vibeAccent}-50/80 dark:from-${vibeAccent}-950/40 to-transparent border-b border-gray-200/50 dark:border-gray-700/50`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-xl bg-${vibeAccent}-100 dark:bg-${vibeAccent}-900/40 flex items-center justify-center flex-shrink-0`}>
              <Radio className={`w-4 h-4 text-${vibeAccent}-500`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-900 dark:text-white tracking-tight">Watch Party</span>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isPlaying ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
                {syncCount > 0 && (
                  <span className="text-[10px] text-blue-500 dark:text-blue-400 flex items-center gap-0.5 flex-shrink-0 font-medium">
                    <Users className="w-2.5 h-2.5" />{syncCount}
                  </span>
                )}
              </div>
              {mediaInfo.sharedBy && (
                <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                  Shared by <span className="font-medium">{mediaInfo.sharedBy}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className={`p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors ${isFullscreen ? 'hidden' : ''}`}
              title={isMinimized ? 'Restore' : 'Minimize'}
            >
              {isMinimized
                ? <Maximize2 className="w-3.5 h-3.5 text-gray-500" />
                : <Minimize2 className="w-3.5 h-3.5 text-gray-500" />}
            </button>
            <button
              onClick={handleToggleFullscreen}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen
                ? <Shrink className="w-3.5 h-3.5 text-gray-500" />
                : <Maximize className="w-3.5 h-3.5 text-gray-500" />}
            </button>
            <button
              onClick={() => window.open(mediaInfo.url, '_blank')}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Open in browser"
            >
              <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
            </button>
            <button onClick={handleClose} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
              <X className="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        </div>

        {/* Minimized compact bar */}
        {isMinimized && (
          <div
            className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            onClick={() => setIsMinimized(false)}
          >
            <button
              onClick={(e) => { e.stopPropagation(); handlePlayPause(); }}
              className={`p-2 rounded-full bg-${vibeAccent}-100 dark:bg-${vibeAccent}-900/40 hover:bg-${vibeAccent}-200 dark:hover:bg-${vibeAccent}-800/40 transition-colors`}
            >
              {isPlaying
                ? <Pause className={`w-4 h-4 text-${vibeAccent}-600 dark:text-${vibeAccent}-400`} />
                : <Play className={`w-4 h-4 text-${vibeAccent}-600 dark:text-${vibeAccent}-400 ml-0.5`} />}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">
                {mediaInfo.type === 'youtube' ? '▶ YouTube Video' :
                  mediaInfo.type === 'soundcloud' ? '🎵 SoundCloud Track' :
                    mediaInfo.type === 'figma' ? '🎨 Figma' : '📄 Doc Viewer'}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                  <div className={`h-full bg-${vibeAccent}-500 rounded-full transition-[width] duration-200`} style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[10px] text-gray-500 font-mono tabular-nums flex-shrink-0">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Full / small player (kept in DOM when minimized but pushed off-screen) */}
        <div
          className={isMinimized ? 'sr-only' : isFullscreen ? 'flex-1 flex flex-col h-full' : ''}
          style={isMinimized ? { position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' } : isFullscreen ? { height: '100%' } : {}}
        >
          <div
            className={`relative w-full ${isFullscreen ? 'h-full flex-1' : mediaInfo.type === 'figma' ? 'aspect-square sm:aspect-[4/3]' : 'aspect-video'} bg-black group`}
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
            {/* Unique embed ID per card */}
            {mediaInfo.type === 'youtube' ? (
              <div id={embedId} className="w-full h-full" />
            ) : mediaInfo.type === 'soundcloud' ? (
              <iframe
                id={embedId}
                className="w-full h-full"
                scrolling="no"
                frameBorder="no"
                allow="autoplay; fullscreen; encrypted-media; clipboard-write"
                referrerPolicy="strict-origin-when-cross-origin"
                loading="eager"
              />
            ) : (
              <iframe
                id={embedId}
                className="w-full h-full"
                scrolling={(mediaInfo.type === 'gdrive' || mediaInfo.type === 'docs' || mediaInfo.type === 'figma') ? 'yes' : 'no'}
                frameBorder="no"
                allow="autoplay; fullscreen"
                sandbox={(mediaInfo.type === 'gdrive' || mediaInfo.type === 'docs' || mediaInfo.type === 'figma') ? undefined : "allow-scripts allow-same-origin allow-popups allow-forms"}
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )}

            {/* Click overlay — play/pause on click (ONLY FOR VIDEO TYPES) */}
            {(mediaInfo.type === 'youtube' || mediaInfo.type === 'soundcloud') && (
              <div
                className="absolute inset-0 z-10 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); handlePlayPause(); }}
              >
                <div className={`w-full h-full flex items-center justify-center transition-opacity duration-300 ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0'}`}>
                  <div className={`p-3 rounded-full bg-black/50 backdrop-blur-sm ${isPlaying ? 'opacity-0' : 'opacity-80'} transition-opacity`}>
                    {isPlaying ? <Pause className="w-8 h-8 text-white" /> : <Play className="w-8 h-8 text-white ml-1" />}
                  </div>
                </div>
              </div>
            )}

            {/* Bottom controls bar (ONLY FOR VIDEO TYPES) */}
            {(mediaInfo.type === 'youtube' || mediaInfo.type === 'soundcloud') && (
              <div
                className={`absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pt-6 pb-2 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="h-1 bg-white/20 rounded-full cursor-pointer group/seek mb-2 hover:h-2 transition-all" onClick={handleSeek}>
                  <div
                    className={`h-full bg-${vibeAccent}-500 rounded-full transition-[width] duration-200 relative`}
                    style={{ width: `${progress}%` }}
                  >
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-${vibeAccent}-400 rounded-full opacity-0 group-hover/seek:opacity-100 transition-opacity shadow-lg`} />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={handlePlayPause} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                      {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
                    </button>
                    <span className="text-[10px] text-gray-300 font-mono tabular-nums">
                      {duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : 'Live'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setIsMuted(!isMuted)} className="p-0.5 hover:bg-white/20 rounded-full transition-colors">
                      {isMuted ? <VolumeX className="w-3.5 h-3.5 text-gray-300" /> : <Volume2 className="w-3.5 h-3.5 text-gray-300" />}
                    </button>
                    <input
                      type="range" min={0} max={100}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => { setVolume(Number(e.target.value)); setIsMuted(false); }}
                      className="w-14 h-1 accent-white cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Resize grip — drag right edge to any width ── */}
      {!isMinimized && (
        <div
          onMouseDown={startResize}
          onTouchStart={startResize}
          title="Drag to resize"
          className="absolute bottom-1.5 right-1.5 w-4 h-4 cursor-ew-resize flex items-end justify-end opacity-30 hover:opacity-80 transition-opacity select-none z-30"
          style={{ position: 'absolute', bottom: '6px', right: '6px' }}
        >
          {/* Three diagonal dots — classic resize handle */}
          <svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-500 dark:text-gray-400" fill="currentColor">
            <circle cx="8.5" cy="8.5" r="1" />
            <circle cx="5" cy="8.5" r="1" />
            <circle cx="8.5" cy="5" r="1" />
          </svg>
        </div>
      )}
    </div>
  );
};

// ─── SharedMediaPlayer ────────────────────────────────────────────────
// List manager: receives media-share / media-close events and renders
// a SingleMediaPlayer card for each active media item in the room.
const SharedMediaPlayer = ({
  roomCode,
  currentUser,
  isHost,
  roomVibe = 'default',
  onNowPlayingChange,
  mlsReady = false,
  initialMedia = null,    // array of media objects from server on room-join (or null/[])
}) => {
  // mediaList: [{ mediaId, type, id, url, sharedBy }]
  const [mediaList, setMediaList] = useState([]);
  const [syncCount, setSyncCount] = useState(0);

  // ─── Restore initial media list from server (on join / rejoin) ──
  useEffect(() => {
    if (!initialMedia) return;
    // Server now sends an array; guard against legacy single-object shape
    const items = Array.isArray(initialMedia) ? initialMedia : [initialMedia];
    if (items.length === 0) return;

    const restoreAll = async () => {
      const restored = [];
      for (const item of items) {
        // Skip truly empty entries
        if (!item || (!item.mediaId && !item.type && !item.ct && !item.mls && !item.ciphertext)) continue;

        const isEncrypted = (item.v === 4 && item.ct) || (item.v === 3 && item.mls);
        // Wait for key if encrypted
        if (isEncrypted && !mlsReady) continue;

        let parsed;
        let decryptFailed = false;

        if (item.v === 4 && item.ct) {
          try { parsed = JSON.parse(await decryptMLSMessage(item, roomCode)); }
          catch (e) { console.warn('Could not decrypt v4 media on join:', e); decryptFailed = true; }
        } else if (item.v === 3 && item.mls) {
          try { parsed = JSON.parse(await decryptMLSMessage(item, roomCode)); }
          catch (e) { console.warn('Could not decrypt v3 media on join:', e); decryptFailed = true; }
        } else if (item.isEncrypted) {
          decryptFailed = true;
        } else {
          parsed = item;
        }

        const resolvedMediaId = item.mediaId || parsed?.mediaId;

        if (decryptFailed) {
          // Request peer recovery for this specific media item
          console.log('[SharedMediaPlayer] Requesting peer recovery for', resolvedMediaId);
          socketManager.emit('media-recover-request', { mediaId: resolvedMediaId || null });
          continue;
        }

        const type = typeof parsed.type === 'string' ? parsed.type : '';
        if (['youtube', 'soundcloud', 'figma', 'gdrive', 'docs'].indexOf(type) === -1) continue;
        if (!isSafeMediaUrl(parsed.url, type)) continue;
        if (type === 'youtube' && (!parsed.id || !/^[a-zA-Z0-9_-]{11}$/.test(parsed.id))) continue;

        const mediaId = resolvedMediaId || `restore-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        restored.push({
          mediaId,
          type,
          id: parsed.id || null,
          service: parsed.service || null,
          query: parsed.query || null,
          url: parsed.url,
          sharedBy: typeof parsed.sharedBy === 'string' ? parsed.sharedBy.substring(0, 30) : 'Room',
        });
      }

      if (restored.length > 0) {
        setMediaList((prev) => {
          // Merge without duplicates (by mediaId)
          const existing = new Set(prev.map(m => m.mediaId));
          return [...prev, ...restored.filter(r => !existing.has(r.mediaId))];
        });
      }
    };

    restoreAll();
  }, [initialMedia, mlsReady]);

  // ─── Socket event handlers (list-level) ─────────────────────────
  useEffect(() => {
    const handleMediaShare = async (data) => {
      let parsed;
      if (data.v === 4 && data.ct) {
        try { parsed = JSON.parse(await decryptMLSMessage(data, roomCode)); }
        catch (e) { console.error('media-share v4 decrypt failed:', e); return; }
      } else if (data.v === 3 && data.mls) {
        try { parsed = JSON.parse(await decryptMLSMessage(data, roomCode)); }
        catch (e) { console.error('media-share v3 decrypt failed:', e); return; }
      } else {
        parsed = data;
      }

      const type = typeof parsed.type === 'string' ? parsed.type : '';
      if (['youtube', 'soundcloud', 'figma', 'gdrive', 'docs'].indexOf(type) === -1) return;
      if (!isSafeMediaUrl(parsed.url, type)) return;
      if (type === 'youtube' && (!parsed.id || !/^[a-zA-Z0-9_-]{11}$/.test(parsed.id))) return;

      const mediaId = parsed.mediaId || data.mediaId || `live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      setMediaList((prev) => {
        // Deduplicate by mediaId
        if (prev.some(m => m.mediaId === mediaId)) return prev;
        return [...prev, {
          mediaId,
          type,
          id: parsed.id || null,
          service: parsed.service || null,
          query: parsed.query || null,
          url: parsed.url,
          sharedBy: typeof parsed.sharedBy === 'string' ? parsed.sharedBy.substring(0, 30) : 'Someone',
        }];
      });
    };

    const handleMediaClose = (data) => {
      const mediaId = data?.mediaId;
      if (mediaId) {
        // Close a specific media card
        setMediaList((prev) => prev.filter(m => m.mediaId !== mediaId));
      } else {
        // No mediaId = close all
        setMediaList([]);
      }
    };

    const handleMediaSyncCount = (data) => {
      setSyncCount(data.count || 0);
    };

    socketManager.on('media-share', handleMediaShare);
    socketManager.on('media-close', handleMediaClose);
    socketManager.on('media-sync-count', handleMediaSyncCount);

    return () => {
      socketManager.off('media-share', handleMediaShare);
      socketManager.off('media-close', handleMediaClose);
      socketManager.off('media-sync-count', handleMediaSyncCount);
    };
  }, [roomCode]);

  // Render nothing when no media is active
  if (mediaList.length === 0) return null;

  return (
    <>
      {mediaList.map((media) => (
        <SingleMediaPlayer
          key={media.mediaId}
          mediaId={media.mediaId}
          mediaInfo={media}
          roomCode={roomCode}
          isHost={isHost}
          roomVibe={roomVibe}
          onNowPlayingChange={onNowPlayingChange}
          mlsReady={mlsReady}
          syncCount={syncCount}
          onRemove={() => setMediaList((prev) => prev.filter(m => m.mediaId !== media.mediaId))}
        />
      ))}
    </>
  );
};

export default SharedMediaPlayer;
