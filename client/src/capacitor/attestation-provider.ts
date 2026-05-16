/**
 * Capacitor Device Attestation Provider
 *
 * Wraps platform-specific attestation APIs:
 *   - Android: Google Play Integrity API
 *   - iOS: Apple App Attest
 *   - Web/Electron: graceful no-op (attestation not available)
 *
 * Coordinates with `server/device-attestation-verifier.js` which
 * validates the tokens server-side.
 *
 * Usage:
 *   const { token, nonce } = await AttestationProvider.getAttestation();
 *   // Attach to request: headers['x-device-attestation'] = token
 *   //                    headers['x-attestation-nonce'] = nonce
 *
 * Install required Capacitor plugins before activating:
 *   npm install @capacitor/device
 *   npx cap sync
 */

import { IntegrityPlugin } from './security-plugins';

// ─── Types ────────────────────────────────────────────────

interface AttestationResult {
  token: string;
  nonce: string;
  platform: 'android' | 'ios' | 'web';
}

interface DeviceInfo {
  platform: 'android' | 'ios' | 'web' | 'electron';
}

// ─── Platform Detection ───────────────────────────────────

/**
 * Detect the runtime platform.
 * Falls back gracefully if @capacitor/device is not installed.
 */
async function getPlatform(): Promise<DeviceInfo['platform']> {
  try {
    const { Device } = await import('@capacitor/device');
    const info = await Device.getInfo();
    return info.platform as DeviceInfo['platform'];
  } catch {
    // @capacitor/device not installed or not in a Capacitor context
    if (typeof window !== 'undefined' && (window as Window & { electronAPI?: unknown }).electronAPI) {
      return 'electron';
    }
    return 'web';
  }
}

// ─── Nonce Generation ─────────────────────────────────────

/**
 * Generate a cryptographically random 32-byte nonce, hex-encoded.
 * The nonce binds the attestation token to a specific request,
 * preventing replay attacks.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── AttestationProvider ──────────────────────────────────

export class AttestationProvider {
  /**
   * Generate a device attestation token for the current platform.
   *
   * Returns a token + nonce pair to be sent in `x-device-attestation`
   * and `x-attestation-nonce` headers. For web/electron platforms
   * returns empty strings (attestation skipped on server).
   */
  static async getAttestation(): Promise<AttestationResult> {
    const platform = await getPlatform();
    const nonce = generateNonce();

    switch (platform) {
      case 'android':
        return AttestationProvider._getAndroidAttestation(nonce);
      case 'ios':
        return AttestationProvider._getIOSAttestation(nonce);
      default:
        // Web and Electron: no hardware attestation available
        return { token: '', nonce: '', platform: 'web' };
    }
  }

  /**
   * Check whether hardware attestation is available on this device.
   */
  static async isAvailable(): Promise<boolean> {
    const platform = await getPlatform();
    return platform === 'android' || platform === 'ios';
  }

  // ─── Android ─────────────────────────────────────────

  /**
   * Obtain a Google Play Integrity token using the native IntegrityPlugin.
   *
   * Requires: Play Integrity API enabled in Google Play Console.
   * The nonce is embedded in the token to bind it to this connection attempt.
   */
  private static async _getAndroidAttestation(nonce: string): Promise<AttestationResult> {
    try {
      const result = await (IntegrityPlugin as { requestIntegrityToken: (args: { nonce: string }) => Promise<{ token: string }> })
        .requestIntegrityToken({ nonce });
      return { token: result.token, nonce, platform: 'android' };
    } catch (err) {
      console.warn('[Attestation] Android Play Integrity unavailable:', (err as Error).message);
      return { token: '', nonce: '', platform: 'android' };
    }
  }

  // ─── iOS ─────────────────────────────────────────────

  /**
   * Obtain an Apple App Attest assertion.
   *
   * Requires: Apple Developer account with App Attest entitlement.
   * Full integration steps:
   * 1. Enable App Attest capability in Xcode
   * 2. Install: npm install @capacitor-community/apple-sign-in (or custom plugin)
   * 3. Configure APPLE_APP_ID and APPLE_TEAM_ID in server env
   */
  private static async _getIOSAttestation(nonce: string): Promise<AttestationResult> {
    try {
      // App Attest uses DCAppAttestService on iOS 14+
      // A full implementation requires a native Capacitor plugin.
      // Placeholder: request attestation via a server-backed flow
      const response = await fetch('/api/attestation/ios-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nonce }),
      });

      if (!response.ok) throw new Error(`Server challenge failed: ${response.status}`);

      const { token, clientData } = await response.json() as { token: string; clientData: string };
      return {
        token: JSON.stringify({ token, clientData }),
        nonce,
        platform: 'ios',
      };
    } catch (err) {
      console.warn('[Attestation] iOS App Attest unavailable:', (err as Error).message);
      return { token: '', nonce: '', platform: 'ios' };
    }
  }
}
