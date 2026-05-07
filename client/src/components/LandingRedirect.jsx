import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import Home from './Home';

/**
 * LandingRedirect
 *
 * Mounted at the root "/" route.
 *
 * Behaviour:
 *  • Capacitor (Android) or Electron  → render <Home /> normally.
 *  • Plain web browser                → hard-redirect to the landing page
 *    so that chat.kyere.me/ always shows the marketing site instead of
 *    dumping visitors straight into the chat UI.
 *
 * The landing URL is read from VITE_LANDING_URL so it can be overridden
 * per-environment without touching source code.
 */
const LANDING_URL =
  import.meta.env.VITE_LANDING_URL || 'https://ephchat.kyere.me';

function LandingRedirect() {
  const isNative = Capacitor.getPlatform() !== 'web';
  const isElectron =
    typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
  const shouldRedirect = !isNative && !isElectron;

  useEffect(() => {
    if (shouldRedirect) {
      window.location.replace(LANDING_URL);
    }
  }, [shouldRedirect]);

  // Native / Electron: show the home screen as usual.
  if (!shouldRedirect) {
    return <Home />;
  }

  // Web browser: blank holding screen while the redirect fires.
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#030712',
        color: '#64748b',
        fontSize: '0.95rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        gap: '0.6rem',
      }}
    >
      {/* Tiny spinner */}
      <span
        style={{
          width: 16,
          height: 16,
          border: '2px solid #1e293b',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          display: 'inline-block',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      Redirecting…
    </div>
  );
}

export default LandingRedirect;
