import { useState, useRef } from 'react';
import { X, Music, Play, Pause, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { useSyncPlayback } from '../hooks/useSyncPlayback';

function formatTime(secs) {
  if (!isFinite(secs) || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MusicRoom({ isOpen, onClose, isHost }) {
  const { audioRef, serverState, displayPosition, duration, handleDurationChange, play, pause, seek, stop } = useSyncPlayback(isHost);

  const [urlInput, setUrlInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const seekBarRef = useRef(null);

  const { url, playing, title } = serverState;

  const handleLoad = () => {
    const trimmed = urlInput.trim();
    if (!trimmed || !isHost) return;
    play(trimmed, titleInput.trim() || trimmed);
    setUrlInput('');
    setTitleInput('');
  };

  const togglePlayPause = () => {
    if (!isHost) return;
    if (playing) pause();
    else if (url) play(url, title);
  };

  const handleSeekBarClick = (e) => {
    if (!isHost || !duration) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(ratio * duration);
  };

  const handleSeekStart = (e) => {
    if (!isHost || !duration) return;
    setIsDragging(true);
    const rect = seekBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setDragPosition(ratio * duration);
  };

  const handleSeekMove = (e) => {
    if (!isDragging || !duration) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setDragPosition(ratio * duration);
  };

  const handleSeekEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    seek(dragPosition);
  };

  const currentPosition = isDragging ? dragPosition : displayPosition;
  const progress = duration > 0 ? (currentPosition / duration) * 100 : 0;

  // Audio element is always mounted so playback continues when modal is closed.
  // It lives outside the isOpen guard so React never unmounts it.
  const audioElement = (
    <audio
      ref={audioRef}
      muted={isMuted}
      onDurationChange={handleDurationChange}
      onEnded={() => { if (isHost) stop(); }}
      className="hidden"
    />
  );

  if (!isOpen) return audioElement;

  return (
    <>
      {audioElement}
      <div
        className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="w-full sm:w-[420px] bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
            <div className={`p-2 rounded-xl ${playing ? 'bg-purple-100 dark:bg-purple-900/40' : 'bg-gray-100 dark:bg-gray-800'}`}>
              <Music className={`w-4 h-4 ${playing ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500'}`} />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-black text-gray-900 dark:text-white">Music Room</h2>
              <div className="flex items-center gap-1.5">
                {playing
                  ? <><Wifi className="w-3 h-3 text-emerald-500" /><span className="text-[10px] text-emerald-500">Synced</span></>
                  : <><WifiOff className="w-3 h-3 text-gray-400" /><span className="text-[10px] text-gray-400">{url ? 'Paused' : 'No track'}</span></>
                }
              </div>
            </div>
            <button
              onClick={() => setIsMuted(m => !m)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Track info + player */}
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 space-y-3">
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate text-center">
                {title || (url ? url : 'No track loaded')}
              </p>

              {/* Seek bar */}
              <div
                ref={seekBarRef}
                className={`relative h-2 rounded-full bg-gray-200 dark:bg-gray-700 ${isHost && duration ? 'cursor-pointer' : 'cursor-default'}`}
                onClick={handleSeekBarClick}
                onMouseDown={handleSeekStart}
                onMouseMove={handleSeekMove}
                onMouseUp={handleSeekEnd}
                onMouseLeave={handleSeekEnd}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-purple-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
                {isHost && duration > 0 && (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md border-2 border-purple-500"
                    style={{ left: `calc(${progress}% - 7px)` }}
                  />
                )}
              </div>

              <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                <span>{formatTime(currentPosition)}</span>
                <span>{formatTime(duration)}</span>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={togglePlayPause}
                  disabled={!isHost || !url}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${isHost && url ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-500/30' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}
                >
                  {playing
                    ? <Pause className="w-6 h-6" />
                    : <Play className="w-6 h-6 translate-x-0.5" />
                  }
                </button>
              </div>

              {!isHost && (
                <p className="text-[10px] text-center text-gray-400">Playback is controlled by the host</p>
              )}
            </div>

            {/* URL input — host only */}
            {isHost && (
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Load Audio URL</label>
                <input
                  value={titleInput}
                  onChange={e => setTitleInput(e.target.value)}
                  placeholder="Track name (optional)"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 px-3 py-2 outline-none focus:ring-2 focus:ring-purple-400/40"
                />
                <div className="flex gap-2">
                  <input
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleLoad(); }}
                    placeholder="https://example.com/track.mp3"
                    className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 px-3 py-2 outline-none focus:ring-2 focus:ring-purple-400/40"
                  />
                  <button
                    onClick={handleLoad}
                    disabled={!urlInput.trim()}
                    className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-40 hover:bg-purple-700 transition-colors active:scale-95"
                  >
                    Load
                  </button>
                </div>
                <p className="text-[10px] text-gray-400">Direct MP3/OGG/AAC URL. All listeners sync automatically.</p>
              </div>
            )}

            {/* Stop button — host only */}
            {isHost && url && (
              <button
                onClick={stop}
                className="w-full py-2 rounded-xl border border-red-200 dark:border-red-900/40 text-red-500 text-sm font-bold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Stop & Clear
              </button>
            )}
          </div>

          <div className="pb-safe-area-inset-bottom h-4" />
        </div>
      </div>
    </>
  );
}
