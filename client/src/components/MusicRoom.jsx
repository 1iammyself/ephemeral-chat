import { useState, useRef } from 'react';
import { Music, Play, Pause, Volume2, VolumeX, Wifi, WifiOff, Square } from 'lucide-react';
import { useSyncPlayback } from '../hooks/useSyncPlayback';

function formatTime(secs) {
  if (!isFinite(secs) || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MusicRoom({ isOpen, onClose, isHost, embedded = false }) {
  const { audioRef, serverState, displayPosition, duration, handleDurationChange, play, pause, seek, stop } = useSyncPlayback(isHost);

  const [urlInput,   setUrlInput]   = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [isMuted,    setIsMuted]    = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos,    setDragPos]    = useState(0);
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

  const handleSeekClick = (e) => {
    if (!isHost || !duration) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration);
  };

  const handleSeekStart = (e) => {
    if (!isHost || !duration) return;
    setIsDragging(true);
    const rect = seekBarRef.current.getBoundingClientRect();
    setDragPos(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration);
  };

  const handleSeekMove = (e) => {
    if (!isDragging || !duration) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    setDragPos(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration);
  };

  const handleSeekEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    seek(dragPos);
  };

  const currentPos = isDragging ? dragPos : displayPosition;
  const progress   = duration > 0 ? (currentPos / duration) * 100 : 0;

  const audioElement = (
    <audio
      ref={audioRef}
      muted={isMuted}
      onDurationChange={handleDurationChange}
      onEnded={() => { if (isHost) stop(); }}
      className="hidden"
    />
  );

  if (!isOpen && !embedded) return audioElement;

  return (
    <>
      {audioElement}
      <div
        className={embedded ? "w-full h-full overflow-hidden" : "fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"}
        onClick={embedded ? undefined : e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className={embedded
          ? "w-full h-full flex flex-col"
          : "w-full sm:w-[420px] bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        }>

          {/* ── non-embedded: keep old header chrome ──────────────────── */}
          {!embedded && (
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
            </div>
          )}

          {/* ── embedded: full dark player ────────────────────────────── */}
          {embedded ? (
            <div className="flex flex-col h-full overflow-hidden">

              {/* Art + track info */}
              <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 py-8 min-h-0 overflow-hidden">

                {/* Spinning disc */}
                <div className="relative flex-shrink-0">
                  <div
                    className={`w-36 h-36 rounded-full ${playing ? 'animate-[spin_10s_linear_infinite]' : ''}`}
                    style={{ background: 'conic-gradient(from 0deg, #7c3aed 0%, #4f46e5 25%, #1d4ed8 50%, #7c3aed 75%, #7c3aed 100%)' }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-[rgba(9,9,13,0.9)] flex items-center justify-center">
                      <Music className={`w-8 h-8 transition-colors duration-500 ${playing ? 'text-purple-400' : 'text-gray-600'}`} />
                    </div>
                  </div>
                  {playing && (
                    <div className="absolute inset-0 rounded-full" style={{ boxShadow: '0 0 40px 8px rgba(124,58,237,0.35)' }} />
                  )}
                </div>

                {/* Title + sync badge */}
                <div className="text-center space-y-2 w-full min-w-0">
                  <p className="text-white font-bold text-sm truncate px-2">
                    {title || (url ? url : 'No track loaded')}
                  </p>
                  <div className="flex items-center justify-center gap-1.5 h-4">
                    {playing ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                        <span className="text-[11px] text-emerald-400">Synced for everyone</span>
                      </>
                    ) : (
                      <span className="text-[11px] text-gray-500">
                        {url ? 'Paused' : (isHost ? 'Load a track below' : 'Waiting for host...')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Seek + controls */}
              <div className="px-6 pb-5 space-y-3 flex-shrink-0">

                {/* Seek bar */}
                <div>
                  <div
                    ref={seekBarRef}
                    className={`relative h-1.5 rounded-full bg-white/10 ${isHost && duration ? 'cursor-pointer' : 'cursor-default'}`}
                    onClick={handleSeekClick}
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
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md"
                        style={{ left: `calc(${progress}% - 6px)` }}
                      />
                    )}
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1.5">
                    <span>{formatTime(currentPos)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Controls row */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setIsMuted(m => !m)}
                    className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={togglePlayPause}
                    disabled={!isHost || !url}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                      isHost && url
                        ? 'bg-purple-600 text-white hover:bg-purple-500 shadow-lg shadow-purple-600/40'
                        : 'bg-white/10 text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    {playing
                      ? <Pause className="w-5 h-5" />
                      : <Play className="w-5 h-5 translate-x-0.5" />
                    }
                  </button>

                  {isHost && url ? (
                    <button
                      onClick={stop}
                      className="p-2 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Stop & Clear"
                    >
                      <Square className="w-4 h-4" />
                    </button>
                  ) : (
                    <div className="w-8" />
                  )}
                </div>

                {!isHost && (
                  <p className="text-center text-[10px] text-gray-600">Playback is controlled by the host</p>
                )}
              </div>

              {/* Host: load track */}
              {isHost && (
                <div className="border-t border-white/[0.07] px-5 py-4 space-y-2 flex-shrink-0">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Load Track</p>
                  <input
                    value={titleInput}
                    onChange={e => setTitleInput(e.target.value)}
                    placeholder="Track name (optional)"
                    className="w-full rounded-lg border border-white/10 bg-white/5 text-sm text-gray-200 placeholder-gray-600 px-3 py-2 outline-none focus:ring-1 focus:ring-purple-500/50"
                  />
                  <div className="flex gap-2">
                    <input
                      value={urlInput}
                      onChange={e => setUrlInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleLoad(); }}
                      placeholder="https://example.com/track.mp3"
                      className="flex-1 rounded-lg border border-white/10 bg-white/5 text-sm text-gray-200 placeholder-gray-600 px-3 py-2 outline-none focus:ring-1 focus:ring-purple-500/50"
                    />
                    <button
                      onClick={handleLoad}
                      disabled={!urlInput.trim()}
                      className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-bold disabled:opacity-30 hover:bg-purple-500 transition-colors active:scale-95"
                    >
                      Load
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-600">Direct MP3/OGG/AAC URL · all listeners sync automatically</p>
                </div>
              )}
            </div>

          ) : (
            /* ── non-embedded: keep original light layout ─────────────── */
            <div className="px-5 py-4 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate text-center">
                  {title || (url ? url : 'No track loaded')}
                </p>
                <div
                  ref={seekBarRef}
                  className={`relative h-2 rounded-full bg-gray-200 dark:bg-gray-700 ${isHost && duration ? 'cursor-pointer' : 'cursor-default'}`}
                  onClick={handleSeekClick}
                  onMouseDown={handleSeekStart}
                  onMouseMove={handleSeekMove}
                  onMouseUp={handleSeekEnd}
                  onMouseLeave={handleSeekEnd}
                >
                  <div className="absolute inset-y-0 left-0 rounded-full bg-purple-500 transition-all" style={{ width: `${progress}%` }} />
                  {isHost && duration > 0 && (
                    <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md border-2 border-purple-500" style={{ left: `calc(${progress}% - 7px)` }} />
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                  <span>{formatTime(currentPos)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <div className="flex justify-center">
                  <button
                    onClick={togglePlayPause}
                    disabled={!isHost || !url}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${isHost && url ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-500/30' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}
                  >
                    {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 translate-x-0.5" />}
                  </button>
                </div>
                {!isHost && <p className="text-[10px] text-center text-gray-400">Playback is controlled by the host</p>}
              </div>
              {isHost && (
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Load Audio URL</label>
                  <input value={titleInput} onChange={e => setTitleInput(e.target.value)} placeholder="Track name (optional)" className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 px-3 py-2 outline-none focus:ring-2 focus:ring-purple-400/40" />
                  <div className="flex gap-2">
                    <input value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleLoad(); }} placeholder="https://example.com/track.mp3" className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 px-3 py-2 outline-none focus:ring-2 focus:ring-purple-400/40" />
                    <button onClick={handleLoad} disabled={!urlInput.trim()} className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-40 hover:bg-purple-700 transition-colors active:scale-95">Load</button>
                  </div>
                </div>
              )}
              {isHost && url && (
                <button onClick={stop} className="w-full py-2 rounded-xl border border-red-200 dark:border-red-900/40 text-red-500 text-sm font-bold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Stop & Clear</button>
              )}
            </div>
          )}

          {!embedded && <div className="pb-safe-area-inset-bottom h-4" />}
        </div>
      </div>
    </>
  );
}
