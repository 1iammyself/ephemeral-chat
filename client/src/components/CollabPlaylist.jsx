import { useState, useEffect, useRef, useCallback } from 'react';
import { Music, Plus, X, ChevronRight, Play, ExternalLink } from 'lucide-react';
import socketManager from '../socket';
import { detectMediaUrl } from './SharedMediaPlayer';

function TrackRow({ track, isCurrent, index }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${isCurrent ? 'bg-indigo-50 dark:bg-indigo-900/30 font-bold' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
      {isCurrent
        ? <span className="text-indigo-500 text-xs animate-pulse">▶</span>
        : <span className="text-gray-400 text-xs w-4 text-center">{index + 1}</span>}
      <span className="flex-1 truncate text-gray-800 dark:text-gray-200">{track.title || track.url}</span>
      <span className="text-[10px] text-gray-400 shrink-0">{track.addedBy}</span>
    </div>
  );
}

export default function CollabPlaylist({ isOpen, onClose, isHost, currentUser, roomCode, embedded = false }) {
  // Combined state prevents stale-closure bugs in socket handlers
  const [playlistState, setPlaylistState] = useState({ queue: [], currentIndex: -1 });
  const { queue, currentIndex } = playlistState;

  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState('');
  const audioRef = useRef(null);

  useEffect(() => {
    const handlePlaying = ({ url, startedAt }) => {
      setPlaylistState(prev => {
        const idx = prev.queue.findIndex(t => t.url === url);
        return { ...prev, currentIndex: idx >= 0 ? idx : prev.currentIndex };
      });
      const detected = detectMediaUrl(url);
      // Only play via <audio> for non-YouTube URLs
      if ((!detected || detected.type !== 'youtube') && audioRef.current) {
        audioRef.current.src = url;
        const offset = (Date.now() - startedAt) / 1000;
        audioRef.current.currentTime = Math.max(0, offset);
        audioRef.current.play().catch(() => {});
      }
    };

    const handleAdded = ({ track }) => {
      setPlaylistState(prev => ({ ...prev, queue: [...prev.queue, track] }));
    };

    const handleSync = ({ queue: q, currentIndex: ci }) => {
      setPlaylistState({ queue: q, currentIndex: ci });
    };

    socketManager.on('playlist-playing', handlePlaying);
    socketManager.on('playlist-track-added', handleAdded);
    socketManager.on('playlist-sync', handleSync);
    return () => {
      socketManager.off('playlist-playing', handlePlaying);
      socketManager.off('playlist-track-added', handleAdded);
      socketManager.off('playlist-sync', handleSync);
    };
  }, []); // empty — no stale closures; all state accessed via functional updates

  const addUrl = useCallback(() => {
    const url = urlInput.trim();
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setError('Only HTTP/HTTPS URLs are supported');
        return;
      }
    } catch {
      setError('Please enter a valid URL');
      return;
    }
    const detected = detectMediaUrl(url);
    const title = detected
      ? (detected.type === 'youtube' ? `YouTube: ${detected.id}` : url)
      : url;
    socketManager.emit('playlist-add', { url, title, addedBy: currentUser?.nickname || 'Someone' });
    setUrlInput('');
    setError('');
  }, [urlInput, currentUser]);

  const nextTrack = useCallback(() => {
    socketManager.emit('playlist-next');
  }, []);

  const currentTrack = queue[currentIndex] || null;
  const currentDetected = currentTrack ? detectMediaUrl(currentTrack.url) : null;
  const isYouTube = currentDetected?.type === 'youtube';

  // Audio element always in DOM so playback continues even when drawer is closed
  const audioEl = <audio ref={audioRef} className="hidden" />;

  if (!isOpen && !embedded) return audioEl;

  return (
    <>
      {audioEl}
      <div
        className={embedded ? "w-full h-full overflow-auto" : "fixed inset-x-0 bottom-0 z-[75] sm:inset-0 sm:flex sm:items-center sm:justify-center sm:bg-black/40 sm:backdrop-blur-sm"}
        onClick={embedded ? undefined : (e) => e.target === e.currentTarget && onClose()}
      >
      <div className={embedded ? "w-full h-full bg-white dark:bg-gray-900 overflow-hidden flex flex-col" : "w-full sm:w-80 bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 flex flex-col max-h-[60vh]"}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <Music className="w-4 h-4 text-indigo-500" />
          <span className="font-black text-sm text-gray-900 dark:text-white flex-1">Collab Playlist</span>
          {queue.length > 0 && (
            <span className="text-xs text-gray-400">{Math.max(0, currentIndex + 1)}/{queue.length}</span>
          )}
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Now Playing */}
        {currentTrack && (
          <div className="px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800/30 shrink-0">
            <p className="text-[10px] text-indigo-400 uppercase tracking-widest font-bold mb-0.5">Now Playing</p>
            <p className="text-sm text-indigo-700 dark:text-indigo-300 font-bold truncate">{currentTrack.title || currentTrack.url}</p>
            {isYouTube && (
              <a
                href={currentTrack.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-[10px] text-indigo-500 hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> Open in YouTube
              </a>
            )}
          </div>
        )}

        {/* Queue */}
        <div className="flex-1 overflow-y-auto py-1 px-2">
          {queue.length === 0
            ? <p className="text-center text-xs text-gray-400 py-6">Queue is empty — add a URL below</p>
            : queue.map((t, i) => <TrackRow key={`${t.url}-${i}`} track={t} isCurrent={i === currentIndex} index={i} />)
          }
        </div>

        {/* Controls */}
        <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800 space-y-2 shrink-0">
          {isHost && currentIndex >= 0 && currentIndex < queue.length - 1 && (
            <button
              onClick={nextTrack}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" /> Next Track
            </button>
          )}
          {isHost && currentIndex === -1 && queue.length > 0 && (
            <button
              onClick={nextTrack}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-600 transition-colors active:scale-95"
            >
              <Play className="w-4 h-4" /> Start Playlist
            </button>
          )}
          <div className="flex gap-2">
            <input
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && addUrl()}
              placeholder="Paste audio URL…"
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
            />
            <button
              onClick={addUrl}
              disabled={!urlInput.trim()}
              className="p-2 rounded-lg bg-indigo-500 text-white disabled:opacity-40 hover:bg-indigo-600 transition-colors active:scale-95"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
      </div>
    </>
  );
}
