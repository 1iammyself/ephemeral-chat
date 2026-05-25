import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import Home from './Home';

/**
 * LandingRedirect
 *
 * Mounted at the root "/" route.
 *
 * Behaviour:
 *  • Capacitor (Android / iOS)      → render <Home /> normally.
 *  • Electron                       → render <Home /> normally.
 *  • Plain web browser (production) → hard-redirect to the landing page
 *    so that chat.kyere.me/ always shows the marketing site instead of
 *    dumping visitors straight into the chat UI.
 *  • Dev mode (import.meta.env.DEV) → render <Home /> so local testing works.
 *
 * The landing URL is read from VITE_LANDING_URL so it can be overridden
 * per-environment without touching source code.
 */
const LANDING_URL = import.meta.env.VITE_LANDING_URL;

function LandingRedirect() {
  const isNative = Capacitor.getPlatform() !== 'web';
  const isElectron =
    typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
  const isTauri =
    typeof window !== 'undefined' && !!window.__TAURI__;
  const isDev = import.meta.env.DEV;

  const shouldRedirect =
    !isNative && !isElectron && !isTauri && !isDev && !!LANDING_URL;

  useEffect(() => {
    if (shouldRedirect) {
      window.location.replace(LANDING_URL);
    }
  }, [shouldRedirect]);

  if (!shouldRedirect) {
    return <Home />;
  }

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
