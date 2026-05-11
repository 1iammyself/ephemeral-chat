import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Geolocation hook — works on Capacitor (Android/iOS) and Electron/Desktop.
 *
 * On Capacitor the WebView delegates to the OS permission dialog automatically
 * via navigator.geolocation. On desktop it uses the same browser API.
 */
export function useGeofence() {
  const [position, setPosition] = useState(null); // { lat, lng }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getPosition = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not available on this device'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          const messages = {
            1: 'Location permission denied. Enable it in Settings.',
            2: 'Location unavailable. Try again outdoors.',
            3: 'Location request timed out.',
          };
          reject(new Error(messages[err.code] || 'Location error'));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
      );
    });
  }, []);

  const fetchPosition = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pos = await getPosition();
      setPosition(pos);
      return pos;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [getPosition]);

  return { position, loading, error, getPosition, fetchPosition };
}
