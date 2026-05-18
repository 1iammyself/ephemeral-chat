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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-5"
      style={{ background: 'var(--offline-bg, rgba(3,7,18,0.96))' }}
    >
      {/* Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-36 -right-36 w-[500px] h-[500px] rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle at 40% 40%, rgba(79,70,229,0.35), transparent 70%)',
                   filter: 'blur(70px)', animation: 'offlineBlobA 12s ease-in-out infinite alternate' }} />
        <div className="absolute -bottom-20 -left-20 w-[350px] h-[350px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle at 60% 60%, rgba(139,92,246,0.3), transparent 70%)',
                   filter: 'blur(70px)', animation: 'offlineBlobB 10s ease-in-out infinite alternate-reverse' }} />
      </div>

      <div className="relative z-10 w-full max-w-sm bg-gray-900 border border-white/10 rounded-3xl p-10 text-center shadow-2xl">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <svg className="w-7 h-7 rounded-lg flex-shrink-0" viewBox="0 0 512 512" aria-hidden="true">
            <rect width="512" height="512" rx="100" fill="#4F46E5"/>
            <path d="M128 102 L384 102 C394 102 402 110 402 120 L402 310 C402 320 394 328 384 328 L280 328 L230 400 L200 328 L128 328 C118 328 110 320 110 310 L110 120 C110 110 118 102 128 102 Z" fill="white"/>
          </svg>
          <span className="text-sm font-semibold text-gray-400">Ephemeral Chat</span>
        </div>

        {/* Animated WiFi signal */}
        <div className="relative w-28 h-24 mx-auto mb-7" aria-hidden="true">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 120 96">
            <path className="offline-arc offline-arc-outer" d="M8 52 Q30 10 60 10 Q90 10 112 52"
              fill="none" stroke="#6366f1" strokeWidth="7" strokeLinecap="round" />
            <path className="offline-arc offline-arc-mid"   d="M22 64 Q38 38 60 38 Q82 38 98 64"
              fill="none" stroke="#6366f1" strokeWidth="7" strokeLinecap="round" />
            <path className="offline-arc offline-arc-inner" d="M37 76 Q46 62 60 62 Q74 62 83 76"
              fill="none" stroke="#6366f1" strokeWidth="7" strokeLinecap="round" />
            <circle className="offline-dot" cx="60" cy="88" r="6" fill="#6366f1" />
          </svg>
          {/* Red X badge */}
          <svg className="absolute -top-1.5 -right-1 w-8 h-8 offline-badge-pop"
            viewBox="0 0 32 32" fill="none" aria-label="No signal">
            <circle cx="16" cy="16" r="14" fill="#fef2f2" stroke="#fca5a5" strokeWidth="1.5"/>
            <path d="M11 11 L21 21 M21 11 L11 21" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </div>

        {/* Status pill */}
        <div className="inline-flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-400/25 rounded-full px-3.5 py-1 text-xs font-semibold text-indigo-300 mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 offline-dot-pulse" />
          Looking for connection…
        </div>

        <h1 className="text-2xl font-black tracking-tight text-white mb-2.5">You're Offline</h1>
        <p className="text-sm text-gray-400 leading-relaxed mb-7">
          Ephemeral Chat can't reach the server.<br/>
          Check your connection and try again.
        </p>

        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold text-sm rounded-xl px-6 py-3 transition-all shadow-lg shadow-indigo-500/25 outline-none"
        >
          <svg className="w-4 h-4 offline-spin-hover" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M14 2v4h-4" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 6 C13.2 3.7 11 2 8 2 4.7 2 2 4.7 2 8s2.7 6 6 6c2.6 0 4.9-1.7 5.7-4"
              stroke="white" strokeWidth="1.75" strokeLinecap="round" fill="none"/>
          </svg>
          Try Again
        </button>

        {/* Tips */}
        <div className="mt-6 pt-5 border-t border-white/10 text-left space-y-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-3">While offline</p>
          <TipRow ok>Nearby (LAN) file transfers still work</TipRow>
          <TipRow ok>Desktop app settings are saved locally</TipRow>
          <TipRow>Real-time messaging requires internet</TipRow>
          <TipRow>Creating or joining rooms requires a connection</TipRow>
        </div>
      </div>

      <style>{`
        @keyframes offlineBlobA {
          from { transform: translate(0,0) scale(1); }
          to   { transform: translate(30px,40px) scale(1.15); }
        }
        @keyframes offlineBlobB {
          from { transform: translate(0,0) scale(1); }
          to   { transform: translate(-30px,-40px) scale(1.1); }
        }
        @keyframes offlineArcFade {
          0%,25%  { opacity: 1; }
          60%,85% { opacity: 0.12; }
          100%    { opacity: 1; }
        }
        @keyframes offlineDotPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%     { opacity:0.35; transform:scale(0.65); }
        }
        @keyframes offlineBadgePop {
          from { transform:scale(0) rotate(-30deg); opacity:0; }
          to   { transform:scale(1) rotate(0deg); opacity:1; }
        }
        .offline-arc        { animation: offlineArcFade 2.4s ease-in-out infinite; }
        .offline-arc-outer  { animation-delay: 0s; }
        .offline-arc-mid    { animation-delay: 0.3s; }
        .offline-arc-inner  { animation-delay: 0.6s; }
        .offline-dot        { animation: offlineArcFade 2.4s ease-in-out infinite; animation-delay: 0.9s; }
        .offline-dot-pulse  { animation: offlineDotPulse 1.6s ease-in-out infinite; }
        .offline-badge-pop  { animation: offlineBadgePop 0.45s cubic-bezier(0.34,1.56,0.64,1) both; }
      `}</style>
    </div>
  );
}

function TipRow({ ok, children }) {
  return (
    <div className="flex items-start gap-2.5 text-xs text-gray-400 leading-relaxed">
      <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${ok ? 'text-indigo-400' : 'text-gray-600'}`}
        viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
        {ok
          ? <path d="M5 8.5 L7 10.5 L11 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          : <path d="M8 5V8.5M8 10.5V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        }
      </svg>
      {children}
    </div>
  );
}
