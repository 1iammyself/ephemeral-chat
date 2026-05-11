import { useState, useEffect, useRef, useCallback } from 'react';
import socketManager from '../socket';

const DEFAULT_STATE = { url: null, title: '', playing: false, startedAt: null, pausePosition: 0 };

/**
 * Synchronized playback hook.
 *
 * Host drives playback; all clients receive `music-state` from the server and
 * seek their local <audio> element to match. The server anchors time with
 * `startedAt = Date.now() - position * 1000` so late joiners compute the
 * correct offset without needing a separate ping-pong.
 */
export function useSyncPlayback(isHost) {
  const audioRef = useRef(null);
  const [serverState, setServerState] = useState(DEFAULT_STATE);
  const [displayPosition, setDisplayPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const rafRef = useRef(null);
  const pendingCanPlayRef = useRef(null);

  // Update displayed position every animation frame when playing
  useEffect(() => {
    const tick = () => {
      if (audioRef.current && !audioRef.current.paused) {
        setDisplayPosition(audioRef.current.currentTime);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Sync audio element when server state changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleState = (state) => {
      setServerState(state);
      if (!state.url) {
        // Clear any pending canplay listener when track is stopped
        if (pendingCanPlayRef.current) {
          audio.removeEventListener('canplay', pendingCanPlayRef.current);
          pendingCanPlayRef.current = null;
        }
        return;
      }

      // Cancel stale canplay listener before any URL/state change
      if (pendingCanPlayRef.current) {
        audio.removeEventListener('canplay', pendingCanPlayRef.current);
        pendingCanPlayRef.current = null;
      }

      const absUrl = new URL(state.url, window.location.origin).href;
      const urlChanged = audio.src !== absUrl;

      if (urlChanged) {
        audio.src = state.url;
        audio.load();

        if (state.playing) {
          const startedAt = state.startedAt;
          const onCanPlay = () => {
            pendingCanPlayRef.current = null;
            const offset = Math.max(0, (Date.now() - startedAt) / 1000);
            audio.currentTime = offset;
            audio.play().catch(() => {});
          };
          pendingCanPlayRef.current = onCanPlay;
          audio.addEventListener('canplay', onCanPlay, { once: true });
        }
        return;
      }

      // Same URL — just sync playback state
      if (state.playing) {
        const offset = Math.max(0, (Date.now() - state.startedAt) / 1000);
        if (Math.abs(audio.currentTime - offset) > 1) {
          audio.currentTime = offset;
        }
        audio.play().catch(() => {});
      } else {
        const target = state.pausePosition || 0;
        if (Math.abs(audio.currentTime - target) > 0.5) {
          audio.currentTime = target;
        }
        audio.pause();
      }
    };

    socketManager.on('music-state', handleState);
    return () => {
      socketManager.off('music-state', handleState);
      // Clean up any pending listener on unmount
      if (pendingCanPlayRef.current) {
        audio.removeEventListener('canplay', pendingCanPlayRef.current);
        pendingCanPlayRef.current = null;
      }
    };
  }, []);

  const handleDurationChange = useCallback(() => {
    if (audioRef.current) setDuration(audioRef.current.duration || 0);
  }, []);

  const play = useCallback((url, title) => {
    if (!isHost) return;
    const audio = audioRef.current;
    const position = audio?.currentTime || 0;

    // Call play() synchronously here so the browser grants autoplay permission
    // (this is invoked inside the click handler, i.e. a user-gesture context).
    // If the URL changed we also reload; the browser queues the play until canplay fires.
    if (audio && url) {
      const resolvedUrl = new URL(url, window.location.origin).href;
      if (audio.src !== resolvedUrl) {
        audio.src = url;
        audio.load();
      }
      audio.play().catch(() => {});
    }

    socketManager.emit('music-play', { url, title: title || url, position });
  }, [isHost]);

  const pause = useCallback(() => {
    if (!isHost) return;
    const position = audioRef.current?.currentTime || 0;
    socketManager.emit('music-pause', { position });
  }, [isHost]);

  const seek = useCallback((position) => {
    if (!isHost) return;
    socketManager.emit('music-seek', { position });
  }, [isHost]);

  const stop = useCallback(() => {
    if (!isHost) return;
    socketManager.emit('music-stop');
  }, [isHost]);

  return { audioRef, serverState, displayPosition, duration, handleDurationChange, play, pause, seek, stop };
}
