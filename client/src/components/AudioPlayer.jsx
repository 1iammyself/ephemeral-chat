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
        // If it doesn't look like a URL, treat it as our raw clean base64
        if (!src.startsWith('http') && !src.startsWith('blob:') && !src.startsWith('data:')) {
          const binaryString = window.atob(src);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          // Detect MIME type from file signature (Magic Numbers)
          let mimeType = 'audio/webm;codecs=opus'; // Default fallback
          
          if (bytes.length > 12) {
            // Check for WebM/EBML signature: 1A 45 DF A3
            if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
              mimeType = 'audio/webm;codecs=opus';
            }
            // Check for MP4/M4A (iOS recording) - 'ftyp' at offset 4
            else if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
              mimeType = 'audio/mp4';
            }
            // Check for WAV (RIFF....WAVE)
            else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
                     bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
              mimeType = 'audio/wav';
            }
            // Check for MP3 (ID3 or sync header)
            else if ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || // ID3
                     (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0)) { // Frame sync
              mimeType = 'audio/mp3';
            }
            // Check for Ogg (Firefox sometimes) - 'OggS'
            else if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
              mimeType = 'audio/ogg';
            }
          }

          mimeTypeRef.current = mimeType;

          // Create the blob with the detected type
          const blob = new Blob([bytes], { type: mimeType });
          objectUrl = URL.createObjectURL(blob);
          setAudioUrl(objectUrl);
        } else {
          // Fallback for standard URLs or existing data URIs
          setAudioUrl(src);
          mimeTypeRef.current = null;
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
      const timer = setTimeout(() => {
        if (audioRef.current) {
          const playPromise = audioRef.current.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => setIsPlaying(true))
              .catch(e => console.error("Auto-play failed:", e));
          }
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, audioUrl]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const handleLoadedMetadata = () => {
      if (isFinite(audio.duration)) {
        setDuration(audio.duration);
      } else {
        // Fix for WebM duration bugs (only apply for WebM)
        if (mimeTypeRef.current && !mimeTypeRef.current.includes('webm')) return;

        setDuration(0); 
        audio.currentTime = 1e101; // Seek to end to force duration calculation
        audio.ontimeupdate = function() {
          this.ontimeupdate = () => {};
          audio.currentTime = 0;
          setDuration(audio.duration);
        };
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
      audio.play().catch(err => console.error("Play failed:", err));
    } else {
      audio.pause();
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center space-x-3 min-w-[200px] py-1">
      <button
        onClick={togglePlay}
        className={`p-2 rounded-full transition-colors ${
          isOwnMessage 
            ? 'bg-white/20 hover:bg-white/30 text-white' 
            : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
        }`}
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <div className="flex-1 flex flex-col justify-center">
        <div className={`h-1 rounded-full overflow-hidden ${
          isOwnMessage ? 'bg-white/30' : 'bg-gray-200 dark:bg-gray-700'
        }`}>
          <div 
            className={`h-full transition-all duration-100 ${
              isOwnMessage ? 'bg-white' : 'bg-primary-500 dark:bg-primary-400'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className={`flex justify-between text-[10px] mt-1 ${
          isOwnMessage ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'
        }`}>
          <span>{formatTime(audioRef.current?.currentTime || 0)}</span>
          <span>{duration ? formatTime(duration) : '--:--'}</span>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={audioUrl}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        className="hidden"
      />
    </div>
  );
};

export default AudioPlayer;
