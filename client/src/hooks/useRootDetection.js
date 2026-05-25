import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { RootDetectionPlugin } from '../capacitor/security-plugins';

/**
 * Runs the native root/tamper check on mount and on every app resume.
 *
 * Android only — no-op on all other platforms.
 *
 * If the device is compromised the native layer calls finishAndRemoveTask()
 * + Process.killProcess() before the promise resolves, so JS never needs to
 * handle a "compromised" result — the app is simply dead.
 */
export function useRootDetection() {
  const isAndroid = Capacitor.getPlatform() === 'android';

  useEffect(() => {
    if (!isAndroid) return;

    RootDetectionPlugin.check().catch(() => {});

    let listenerHandle;
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) RootDetectionPlugin.check().catch(() => {});
    }).then((handle) => {
      listenerHandle = handle;
    });

    return () => {
      listenerHandle?.remove();
    };
  }, [isAndroid]);
}
