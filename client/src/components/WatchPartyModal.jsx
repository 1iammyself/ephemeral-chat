import React, { useState, useEffect, useRef } from 'react';
import { X, Link, Radio, Play, Music, Youtube, Figma, FileText } from 'lucide-react';
import { detectMediaUrl } from './SharedMediaPlayer';
import { getVibeById } from '../utils/vibes';

/**
 * WatchPartyModal — Centered popup for pasting a YouTube URL
 * to start a watch party. Shows validation feedback inline.
 */
const WatchPartyModal = ({ isOpen, onClose, onShare, roomVibe = 'default', embedded = false }) => {
  const [urlInput, setUrlInput] = useState('');
  const inputRef = useRef(null);

  const vibe = getVibeById(roomVibe);
  const vibeAccent = vibe.accent || 'primary';
  const vibeColor = vibe.colors?.primary || '#3b82f6';
  const vibeColorHover = vibe.colors?.primary + 'cc';

  const detected = urlInput.trim() ? detectMediaUrl(urlInput.trim()) : null;

  useEffect(() => {
    if (isOpen) {
      setUrlInput('');
      // Focus input after a small delay so the modal is rendered
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleShare = () => {
    if (!detected) return;
    onShare(urlInput.trim());
    setUrlInput('');
    onClose();
  };

  if (!isOpen && !embedded) return null;

  const modalContent = (
    <div className={embedded ? "w-full h-full flex flex-col overflow-hidden" : "relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden animate-in zoom-in-95 duration-200"}>

        {/* Header — hide when inside FloatingPanel */}
        {!embedded && (
          <div className={`flex items-center justify-between px-5 py-4 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-${vibeAccent}-50/50 dark:from-${vibeAccent}-950/30 to-transparent`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-${vibeAccent}-100 dark:bg-${vibeAccent}-900/40 flex items-center justify-center`}>
                <Radio className={`w-5 h-5 text-${vibeAccent}-500`} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">Watch Party</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Share media with everyone in the room</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className={embedded ? "flex-1 overflow-y-auto p-5 space-y-4" : "p-5 space-y-4"}>
          {/* URL Input */}
          <div className={`flex items-center gap-3 bg-gray-50 dark:bg-gray-800/80 border-2 rounded-xl px-4 py-3 transition-colors ${detected ? `border-${vibeAccent}-400 dark:border-${vibeAccent}-500` : 'border-gray-200 dark:border-gray-700 focus-within:border-gray-300 dark:focus-within:border-gray-600'} `}>
            <Link className={`w-5 h-5 flex-shrink-0 ${detected ? `text-${vibeAccent}-500` : 'text-gray-500 dark:text-gray-400'}`} />
            <input
              ref={inputRef}
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleShare()}
              data-allow-copy="true"
              placeholder="Paste YouTube URL..."
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 outline-none min-w-0"
            />
            {urlInput && (
              <button onClick={() => setUrlInput('')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            )}
          </div>

          {/* Detection Feedback */}
          {detected && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg border animate-in slide-in-from-bottom-2 duration-200"
              style={{ backgroundColor: `${vibeColor}18`, borderColor: `${vibeColor}40` }}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${detected.type === 'youtube' ? 'bg-red-500/10' :
                    detected.type === 'figma' ? 'bg-pink-500/10' : 'bg-blue-500/10'
                } `}>
                {detected.type === 'youtube' && <Youtube className="w-4 h-4 text-red-500" />}
                {detected.type === 'figma' && <Figma className="w-4 h-4 text-pink-500" />}
                {(detected.type === 'gdrive' || detected.type === 'docs') && <FileText className="w-4 h-4 text-blue-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-200">
                  {detected.type === 'youtube' ? 'YouTube Video' :
                      detected.type === 'figma' ? 'Figma Project' : 'Document'} detected
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{urlInput.trim()}</p>
              </div>
            </div>
          )}

          {/* Supported platforms hint */}
          {!detected && !urlInput && (
            <div className="grid grid-cols-2 gap-3 py-2 border-t border-gray-200 dark:border-gray-800 pt-4">
              <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors cursor-default">
                <Youtube className="w-4 h-4" />
                <span className="text-[11px] font-medium">YouTube</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 hover:text-pink-500 transition-colors cursor-default">
                <Figma className="w-4 h-4" />
                <span className="text-[11px] font-medium">Figma</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-500 transition-colors cursor-default">
                <FileText className="w-4 h-4" />
                <span className="text-[11px] font-medium">GDrive / Docs</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-5 py-4 flex items-center justify-end gap-3 flex-shrink-0 ${embedded ? 'border-t border-white/[0.07]' : 'border-t border-black/10 dark:border-white/10'}`}>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleShare}
            disabled={!detected}
            style={detected ? { backgroundColor: vibeColor } : undefined}
            onMouseOver={e => { if (detected) e.currentTarget.style.backgroundColor = vibeColorHover; }}
            onMouseOut={e => { if (detected) e.currentTarget.style.backgroundColor = vibeColor; }}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${detected
                ? `text-white active:scale-95 shadow-lg`
                : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              }`}
          >
            Share to Room
          </button>
        </div>
      </div>
  );

  if (embedded) return <div className="w-full h-full">{modalContent}</div>;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      {modalContent}
    </div>
  );
};

export default WatchPartyModal;
