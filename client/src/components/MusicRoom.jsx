import { useState, useRef } from 'react';
import { Music, Play, Pause, Volume2, VolumeX, Wifi, WifiOff, Square, ListMusic, Upload, Loader2 } from 'lucide-react';
import { useSyncPlayback } from '../hooks/useSyncPlayback';
import CollabPlaylist from './CollabPlaylist';
import socketManager from '../socket';

function formatTime(secs) {
  if (!isFinite(secs) || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const MAX_FILE_MB = 8;
const ACCEPT = 'audio/mpeg,audio/ogg,audio/wav,audio/aac,audio/flac,audio/mp4,audio/webm,audio/x-m4a';

export default function MusicRoom({ isOpen, onClose, isHost, embedded = false, roomCode, currentUser }) {
  const { audioRef, serverState, displayPosition, duration, handleDurationChange, play, pause, seek, stop, setTrack } = useSyncPlayback(isHost);

  const [tab,        setTab]        = useState('player');
  const [isMuted,    setIsMuted]    = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos,    setDragPos]    = useState(0);
  const [uploading,  setUploading]  = useState(false);
  const [uploadErr,  setUploadErr]  = useState('');
  const fileInputRef = useRef(null);
  const seekBarRef   = useRef(null);

  const { url, playing, title } = serverState;

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

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadErr('');

    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setUploadErr(`File too large — max ${MAX_FILE_MB} MB`);
      return;
    }
    if (!file.type.startsWith('audio/')) {
      setUploadErr('Only audio files are supported');
      return;
    }

    setUploading(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve(ev.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          socketManager.off('music-upload-done', onDone);
          socketManager.off('music-upload-error', onErr);
          clearTimeout(timer);
        };
        const onDone = ({ audioUrl, title }) => {
          if (settled) return; settled = true;
          cleanup();
          // Load track + broadcast URL without auto-playing.
          // Host must press Play — audio.play() needs a user gesture.
          setTrack(audioUrl, title || file.name);
          resolve();
        };
        const onErr = ({ error }) => {
          if (settled) return; settled = true;
          cleanup();
          reject(new Error(error || 'Upload failed'));
        };
        const timer = setTimeout(() => {
          if (settled) return; settled = true;
          cleanup();
          reject(new Error('Upload timed out — try a smaller file'));
        }, 30000);
        socketManager.on('music-upload-done', onDone);
        socketManager.on('music-upload-error', onErr);
        socketManager.emit('music-upload', { data: base64, filename: file.name });
      });
    } catch (err) {
      setUploadErr(err.message || 'Upload failed — try again');
    } finally {
      setUploading(false);
    }
  };

  const currentPos = isDragging ? dragPos : displayPosition;
  const progress   = duration > 0 ? (currentPos / duration) * 100 : 0;

  const audioElement = (
    <audio
      ref={audioRef}
      preload="metadata"
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

          {/* Non-embedded header */}
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
                    : <><WifiOff className="w-3 h-3 text-gray-400" /><span className="text-[10px] text-gray-400">{url ? 'Paused' : 'No track'}</span></>}
                </div>
              </div>
            </div>
          )}

          {/* Embedded: tab bar + content */}
          {embedded ? (
            <div className="flex flex-col h-full overflow-hidden">

              {/* Tab bar */}
              <div className="flex gap-px bg-white/[0.04] flex-shrink-0">
                {[{ id: 'player', icon: Music, label: 'Player' }, { id: 'queue', icon: ListMusic, label: 'Queue' }].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold tracking-wide transition-colors ${
                      tab === t.id ? 'text-purple-300 border-b-2 border-purple-500' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <t.icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'player' ? (
                /* ── Player tab ─────────────────────────────────────────── */
                <div className="flex flex-col flex-1 overflow-hidden">

                  {/* Art + track info */}
                  <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 py-6 min-h-0 overflow-hidden">
                    <div className="relative flex-shrink-0">
                      <div
                        className={`w-32 h-32 rounded-full ${playing ? 'animate-[spin_10s_linear_infinite]' : ''}`}
                        style={{ background: 'conic-gradient(from 0deg, #7c3aed 0%, #4f46e5 25%, #1d4ed8 50%, #7c3aed 75%, #7c3aed 100%)' }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-18 h-18 rounded-full bg-[rgba(9,9,13,0.9)] flex items-center justify-center" style={{ width: '4.5rem', height: '4.5rem' }}>
                          <Music className={`w-7 h-7 transition-colors duration-500 ${playing ? 'text-purple-400' : 'text-gray-600'}`} />
                        </div>
                      </div>
                      {playing && (
                        <div className="absolute inset-0 rounded-full" style={{ boxShadow: '0 0 40px 8px rgba(124,58,237,0.35)' }} />
                      )}
                    </div>

                    <div className="text-center space-y-1.5 w-full min-w-0">
                      <p className="text-white font-bold text-sm truncate px-2">
                        {title || (url ? url : 'No track loaded')}
                      </p>
                      <div className="flex items-center justify-center gap-1.5 h-4">
                        {playing ? (
                          <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" /><span className="text-[11px] text-emerald-400">Synced for everyone</span></>
                        ) : (
                          <span className="text-[11px] text-gray-500">
                            {url ? 'Paused' : (isHost ? 'Upload a track below' : 'Waiting for host…')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Seek + controls */}
                  <div className="px-6 pb-4 space-y-3 flex-shrink-0">
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
                        <div className="absolute inset-y-0 left-0 rounded-full bg-purple-500 transition-all" style={{ width: `${progress}%` }} />
                        {isHost && duration > 0 && (
                          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md" style={{ left: `calc(${progress}% - 6px)` }} />
                        )}
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1.5">
                        <span>{formatTime(currentPos)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <button onClick={() => setIsMuted(m => !m)} className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={togglePlayPause}
                        disabled={!isHost || !url}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                          isHost && url ? 'bg-purple-600 text-white hover:bg-purple-500 shadow-lg shadow-purple-600/40' : 'bg-white/10 text-gray-600 cursor-not-allowed'
                        }`}
                      >
                        {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 translate-x-0.5" />}
                      </button>
                      {isHost && url ? (
                        <button onClick={stop} className="p-2 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Stop & Clear">
                          <Square className="w-4 h-4" />
                        </button>
                      ) : <div className="w-8" />}
                    </div>

                    {!isHost && <p className="text-center text-[10px] text-gray-600">Playback is controlled by the host</p>}
                  </div>

                  {/* Host: file upload */}
                  {isHost && (
                    <div className="border-t border-white/[0.07] px-5 py-4 flex-shrink-0">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Load Track</p>
                      <input ref={fileInputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFileChange} />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-white/10 text-gray-400 hover:border-purple-500/50 hover:text-purple-300 hover:bg-purple-500/5 transition-all active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {uploading
                          ? <><Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs font-medium">Uploading…</span></>
                          : <><Upload className="w-4 h-4" /><span className="text-xs font-medium">Choose audio file</span></>}
                      </button>
                      {uploadErr && <p className="mt-2 text-[10px] text-red-400 text-center">{uploadErr}</p>}
                      <p className="mt-2 text-[10px] text-gray-600 text-center">MP3 · OGG · WAV · AAC — max {MAX_FILE_MB} MB · streams to all listeners</p>
                    </div>
                  )}
                </div>

              ) : (
                /* ── Queue tab ─────────────────────────────────────────── */
                <div className="flex-1 min-h-0 overflow-hidden">
                  <CollabPlaylist
                    embedded
                    noAudio
                    isOpen={true}
                    onClose={() => {}}
                    isHost={isHost}
                    currentUser={currentUser}
                    roomCode={roomCode}
                  />
                </div>
              )}
            </div>

          ) : (
            /* ── Non-embedded: keep original light layout ─────────────── */
            <div className="px-5 py-4 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate text-center">
                  {title || (url ? url : 'No track loaded')}
                </p>
                <div
                  ref={seekBarRef}
                  className={`relative h-2 rounded-full bg-gray-200 dark:bg-gray-700 ${isHost && duration ? 'cursor-pointer' : 'cursor-default'}`}
                  onClick={handleSeekClick} onMouseDown={handleSeekStart} onMouseMove={handleSeekMove} onMouseUp={handleSeekEnd} onMouseLeave={handleSeekEnd}
                >
                  <div className="absolute inset-y-0 left-0 rounded-full bg-purple-500 transition-all" style={{ width: `${progress}%` }} />
                  {isHost && duration > 0 && (
                    <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md border-2 border-purple-500" style={{ left: `calc(${progress}% - 7px)` }} />
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                  <span>{formatTime(currentPos)}</span><span>{formatTime(duration)}</span>
                </div>
                <div className="flex justify-center">
                  <button onClick={togglePlayPause} disabled={!isHost || !url}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${isHost && url ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-500/30' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}>
                    {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 translate-x-0.5" />}
                  </button>
                </div>
                {!isHost && <p className="text-[10px] text-center text-gray-400">Playback is controlled by the host</p>}
              </div>
              {isHost && (
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Upload Track</label>
                  <input ref={fileInputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFileChange} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-500 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all disabled:opacity-50">
                    {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Uploading…</span></> : <><Upload className="w-4 h-4" /><span className="text-sm">Choose audio file (max {MAX_FILE_MB} MB)</span></>}
                  </button>
                  {uploadErr && <p className="text-xs text-red-500">{uploadErr}</p>}
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
