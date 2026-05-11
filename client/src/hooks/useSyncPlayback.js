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
      if (!state.url) return;

      const urlChanged = audio.src !== state.url && state.url;
      if (urlChanged) {
        audio.src = state.url;
        audio.load();
      }

      if (state.playing) {
        const offset = (Date.now() - state.startedAt) / 1000;
        const seekTo = Math.max(0, offset);
        // Only hard-seek if more than 1 second out of sync
        if (Math.abs(audio.currentTime - seekTo) > 1 || urlChanged) {
          audio.currentTime = seekTo;
        }
        audio.play().catch(() => {});
      } else {
        if (Math.abs(audio.currentTime - (state.pausePosition || 0)) > 0.5) {
          audio.currentTime = state.pausePosition || 0;
        }
        audio.pause();
      }
    };

    socketManager.on('music-state', handleState);
    return () => socketManager.off('music-state', handleState);
  }, []);

  const handleDurationChange = useCallback(() => {
    if (audioRef.current) setDuration(audioRef.current.duration || 0);
  }, []);

  const play = useCallback((url, title) => {
    if (!isHost) return;
    const position = audioRef.current?.currentTime || 0;
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
