import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

const AudioPlayer = ({ src, onEnded, isOwnMessage, autoPlay = false }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const audioRef = useRef(null);
  const mimeTypeRef = useRef(null);

  useEffect(() => {
    let objectUrl = null;

    const processAudio = async () => {
      if (!src) return;

      try {
        if (!src.startsWith('http') && !src.startsWith('blob:') && !src.startsWith('data:')) {
          // Handle raw Base64
          const binaryString = window.atob(src);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          // Simplified MIME detection logic...
          let mimeType = 'audio/wav'; 
          if (bytes.length > 12) {
             if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
               mimeType = 'audio/mp3';
             }
          }
          mimeTypeRef.current = mimeType;

          const blob = new Blob([bytes], { type: mimeType });
          objectUrl = URL.createObjectURL(blob);
          setAudioUrl(objectUrl);
        } else {
          setAudioUrl(src);
        }
      } catch (err) {
        console.error("Audio reconstruction failed:", err);
        setAudioUrl(src);
      }
    };

    processAudio();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src]);

  // Handle auto-play logic
  useEffect(() => {
    if (autoPlay && audioRef.current && audioUrl) {
        audioRef.current.load();
        audioRef.current.play()
            .then(() => setIsPlaying(true))
            .catch(e => console.log("Auto-play prevented"));
    }
  }, [autoPlay, audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        setProgress((audio.currentTime / audio.duration) * 100);
      } else {
        // Fallback for streaming or unknown duration (fixes 'split second' UI glitches)
        setProgress(0); 
      }
    };

    const handleLoadedMetadata = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else {
        // If duration is unknown, we don't set it to 0 immediately to avoid stopping playback logic
        // We let the player play.
        console.warn("Audio duration unknown or infinite");
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(100);
      if (onEnded) onEnded();
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [onEnded]);

  const togglePlay = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play().catch(console.error);
    } else {
      audio.pause();
    }
  };

  const formatTime = (time) => {
    if (isNaN(time) || !isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center space-x-3 min-w-[200px] py-1">
      <button
        onClick={togglePlay}
        className={`p-2 rounded-full transition-colors ${isOwnMessage
          ? 'bg-white/20 hover:bg-white/30 text-white'
          : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
          }`}
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <div className="flex-1 flex flex-col justify-center">
        <div className={`h-1 rounded-full overflow-hidden ${isOwnMessage ? 'bg-white/30' : 'bg-gray-200 dark:bg-gray-700'}`}>
          <div
            className={`h-full transition-all duration-100 ${isOwnMessage ? 'bg-white' : 'bg-primary-500 dark:bg-primary-400'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className={`flex justify-between text-[10px] mt-1 ${isOwnMessage ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
          <span>{formatTime(audioRef.current?.currentTime || 0)}</span>
          {/* Only show duration if we actually know it, otherwise show playback time or blank */}
          <span>{duration ? formatTime(duration) : (isPlaying ? '...' : '--:--')}</span>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={audioUrl}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        className="hidden"
        preload="metadata"
      />
    </div>
  );
};

export default AudioPlayer;