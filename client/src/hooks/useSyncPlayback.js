import { useState, useEffect, useRef, useCallback } from 'react';
import socketManager from '../socket';

const DEFAULT_STATE = { url: null, title: '', playing: false, startedAt: null, pausePosition: 0 };

/**
 * Synchronized playback hook.
 *
 * Host drives playback locally — all calls to play/pause/seek/stop immediately
 * affect the local <audio> element and also broadcast to the server for other
 * clients.  Non-host clients receive `music-state` from the server and sync
 * their local audio accordingly.
 *
 * Why this design:
 *   Browsers block audio.play() calls that are NOT in a user-gesture context
 *   (autoplay policy).  If the host's play() went through a socket round-trip
 *   the call would land inside a socket event handler — no longer a gesture —
 *   and be silently blocked.  Controlling host audio directly avoids this.
 */
export function useSyncPlayback(isHost) {
  const audioRef    = useRef(null);
  const isHostRef   = useRef(isHost);
  const [serverState, setServerState]       = useState(DEFAULT_STATE);
  const [displayPosition, setDisplayPosition] = useState(0);
  const [duration, setDuration]             = useState(0);
  const rafRef = useRef(null);

  // Keep isHostRef current across renders without re-running the socket effect
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  // RAF loop — updates displayed position while audio is playing
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

  // Server-state listener — syncs non-host clients; host ignores (drives audio directly)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleState = (state) => {
      setServerState(state);

      // Host already controls their audio directly — skip server-driven sync
      if (isHostRef.current) return;

      if (!state.url) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        return;
      }

      const absUrl = new URL(state.url, window.location.origin).href;
      const urlChanged = audio.src !== absUrl;

      if (urlChanged) {
        audio.src = state.url;
        audio.load();
        if (state.playing) {
          const startedAt = state.startedAt;
          audio.addEventListener('canplay', function onCanPlay() {
            audio.removeEventListener('canplay', onCanPlay);
            audio.currentTime = Math.max(0, (Date.now() - startedAt) / 1000);
            audio.play().catch(() => {});
          }, { once: true });
        }
        return;
      }

      // Same URL — sync playback state
      if (state.playing) {
        const offset = Math.max(0, (Date.now() - state.startedAt) / 1000);
        if (Math.abs(audio.currentTime - offset) > 1) audio.currentTime = offset;
        audio.play().catch(() => {});
      } else {
        const target = state.pausePosition || 0;
        if (Math.abs(audio.currentTime - target) > 0.5) audio.currentTime = target;
        audio.pause();
      }
    };

    socketManager.on('music-state', handleState);
    return () => socketManager.off('music-state', handleState);
  }, []);

  // Only accept finite positive durations — Infinity shows as 0:00 in formatTime
  const handleDurationChange = useCallback(() => {
    const d = audioRef.current?.duration;
    if (typeof d === 'number' && isFinite(d) && d > 0) setDuration(d);
  }, []);

  /**
   * play() — host only.
   * Called directly from a click handler so audio.play() is in user-gesture
   * context. Sets src/load if URL changed, plays immediately, then broadcasts.
   */
  const play = useCallback((url, title) => {
    if (!isHost) return;
    const audio = audioRef.current;
    if (!audio || !url) return;

    const resolvedUrl = new URL(url, window.location.origin).href;
    if (audio.src !== resolvedUrl) {
      audio.src = url;
      audio.load();
    }
    // play() is synchronous here — still inside the user-gesture call stack,
    // so the browser grants autoplay permission even for a freshly loaded src.
    audio.play().catch(() => {});

    const position = audio.currentTime || 0;
    socketManager.emit('music-play', { url, title: title || url, position });
  }, [isHost]);

  const pause = useCallback(() => {
    if (!isHost) return;
    const audio = audioRef.current;
    const position = audio?.currentTime || 0;
    audio?.pause(); // Immediate local pause
    socketManager.emit('music-pause', { position });
  }, [isHost]);

  const seek = useCallback((position) => {
    if (!isHost) return;
    if (audioRef.current) audioRef.current.currentTime = position;
    socketManager.emit('music-seek', { position });
  }, [isHost]);

  const stop = useCallback(() => {
    if (!isHost) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    setDuration(0);
    setDisplayPosition(0);
    socketManager.emit('music-stop');
  }, [isHost]);

  /**
   * setTrack() — host only.
   * Loads a new URL into the local audio element (so metadata/duration reads
   * immediately) and broadcasts it to all clients WITHOUT starting playback.
   * The host must then call play() via the play button.
   */
  const setTrack = useCallback((url, title) => {
    if (!isHost) return;
    const audio = audioRef.current;
    if (!audio || !url) return;
    audio.src = url;
    audio.load(); // Loads metadata so duration appears before play is pressed
    socketManager.emit('music-set-track', { url, title: title || url });
  }, [isHost]);

  return { audioRef, serverState, displayPosition, duration, handleDurationChange, play, pause, seek, stop, setTrack };
}
