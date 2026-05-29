import { useState, useEffect } from 'react';

export default function OfflineOverlay() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline  = () => setIsOffline(false);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online',  goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-3 px-4 py-2.5"
      style={{ background: 'rgba(79,70,229,0.97)', backdropFilter: 'blur(8px)' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* Animated WiFi-off icon */}
        <svg className="w-4 h-4 flex-shrink-0 text-indigo-200" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 2 L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M4.5 6.5 Q8 3.5 11.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5"/>
          <path d="M6.5 9 Q8 7.8 9.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5"/>
          <circle cx="8" cy="12" r="1" fill="currentColor"/>
        </svg>
        <span className="text-xs font-semibold text-white truncate">
          No internet — messaging &amp; rooms unavailable
        </span>
        <span className="hidden sm:inline text-xs text-indigo-200 flex-shrink-0">
          · Nearby transfers &amp; local features still work
        </span>
      </div>

      <button
        onClick={() => window.location.reload()}
        className="flex-shrink-0 text-xs font-bold text-white bg-white/15 hover:bg-white/25 active:scale-95 rounded-lg px-3 py-1 transition-all outline-none"
      >
        Retry
      </button>
    </div>
  );
}
