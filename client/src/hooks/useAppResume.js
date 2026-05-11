import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

const STALE_MS = 30 * 60 * 1000; // reload after 30 min in background

/**
 * Reloads the app when it returns from a long background session.
 * Keeps the Socket.IO connection and ephemeral state fresh.
 *
 * Works across Capacitor (Android/iOS), Electron, and desktop browser
 * via the Page Visibility API — no PWA service worker needed.
 */
export function useAppResume() {
  useEffect(() => {
    // Capacitor handles foreground resume via CapApp.addListener in App.jsx.
    // This hook covers Electron + desktop browser via visibilitychange.
    if (Capacitor.isNativePlatform()) return;

    let hiddenAt = 0;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (document.visibilityState === 'visible' && hiddenAt > 0) {
        if (Date.now() - hiddenAt > STALE_MS) {
          window.location.reload();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);
}
