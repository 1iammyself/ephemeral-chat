import { useEffect, useState } from 'react';
import socketManager from '../socket.js';
import useConnectionStatus from '../hooks/useConnectionStatus.js';

/**
 * Thin connection banner. Driven by the real liveness monitor (not just
 * navigator.onLine), so it reflects whether the *server* is actually reachable.
 *
 * Recovery is automatic — the connection monitor force-reconnects a dead link
 * and the outbox flushes queued messages on its own. The button here just lets
 * an impatient user nudge a reconnect; it never reloads the page (reloading is
 * exactly the disruptive rejoin dance we are removing).
 *
 * When no socket is attached (state 'idle', e.g. on the Home screen) we stay
 * silent unless the device itself reports no network, preserving the original
 * global "No internet" hint without false positives.
 */
export default function OfflineOverlay() {
  const { state, pendingCount } = useConnectionStatus();
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const on = () => setBrowserOnline(true);
    const off = () => setBrowserOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Decide whether to show and what to say.
  const inRoom = state !== 'idle';
  let visible;
  let label;
  if (inRoom) {
    // Healthy / transient states stay silent.
    visible = state === 'offline' || state === 'reconnecting';
    label = state === 'offline' ? 'No internet' : 'Reconnecting…';
  } else {
    // No active socket — only surface a genuine device-level outage.
    visible = !browserOnline;
    label = 'No internet';
  }

  if (!visible) return null;

  const pendingText = pendingCount > 0
    ? ` · ${pendingCount} message${pendingCount === 1 ? '' : 's'} will send when you're back`
    : '';

  const handleReconnect = () => {
    // Nudge an immediate reconnect instead of reloading the whole app.
    if (socketManager.socket) {
      try { socketManager.socket.connect(); } catch { /* ignore */ }
    } else {
      socketManager.connect();
    }
  };

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
          {label}
          <span className="hidden sm:inline font-normal text-indigo-100">{pendingText}</span>
        </span>
      </div>

      <button
        onClick={handleReconnect}
        className="flex-shrink-0 text-xs font-bold text-white bg-white/15 hover:bg-white/25 active:scale-95 rounded-lg px-3 py-1 transition-all outline-none"
      >
        Reconnect now
      </button>
    </div>
  );
}
