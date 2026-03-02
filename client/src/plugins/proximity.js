/**
 * Capacitor Proximity Plugin Bridge
 * 
 * JavaScript interface for the native Android ProximityPlugin.
 * On non-native platforms, provides graceful fallbacks.
 * 
 * Features:
 * - Wi-Fi network info (SSID, IP)
 * - Hotspot creation (Android only)
 * - Wi-Fi Direct (Android only)
 * - Network Service Discovery (Android NSD)
 * - Permission management
 */

import { registerPlugin } from '@capacitor/core';
import { isCapacitor, isAndroid } from '../utils/platform';

// Register the native plugin (only loads on Android/iOS)
const NativeProximity = isCapacitor ? registerPlugin('Proximity') : null;

/**
 * Proximity Plugin interface
 * Wraps native calls with fallbacks for web
 */
const Proximity = {
  /**
   * Check if proximity features are available on this platform
   */
  isAvailable() {
    return isCapacitor && isAndroid;
  },

  /**
   * Get current Wi-Fi information
   * @returns {Promise<{ssid: string, ip: string, isConnected: boolean}>}
   */
  async getWifiInfo() {
    if (NativeProximity) {
      try {
        return await NativeProximity.getWifiInfo();
      } catch (e) {
        console.warn('[Proximity Plugin] getWifiInfo failed:', e);
      }
    }
    // Web fallback: no Wi-Fi info available
    return { ssid: '', ip: '', isConnected: navigator.onLine };
  },

  /**
   * Create a local-only hotspot (Android API 26+)
   * Uses WifiManager.startLocalOnlyHotspot()
   * @returns {Promise<{ssid: string, password: string, success: boolean}>}
   */
  async createHotspot() {
    if (NativeProximity) {
      try {
        return await NativeProximity.createHotspot();
      } catch (e) {
        console.error('[Proximity Plugin] createHotspot failed:', e);
        return { ssid: '', password: '', success: false, error: e.message };
      }
    }
    return {
      ssid: '',
      password: '',
      success: false,
      error: 'Hotspot creation is only available on Android devices'
    };
  },

  /**
   * Stop the local hotspot
   */
  async stopHotspot() {
    if (NativeProximity) {
      try {
        return await NativeProximity.stopHotspot();
      } catch (e) {
        console.warn('[Proximity Plugin] stopHotspot failed:', e);
      }
    }
    return { success: false };
  },

  /**
   * Start Wi-Fi Direct peer discovery (Android)
   */
  async startWifiDirect() {
    if (NativeProximity) {
      try {
        return await NativeProximity.startWifiDirect();
      } catch (e) {
        console.warn('[Proximity Plugin] startWifiDirect failed:', e);
      }
    }
    return { success: false, error: 'Wi-Fi Direct not available on this platform' };
  },

  /**
   * Stop Wi-Fi Direct discovery
   */
  async stopWifiDirect() {
    if (NativeProximity) {
      try {
        return await NativeProximity.stopWifiDirect();
      } catch (e) {
        console.warn('[Proximity Plugin] stopWifiDirect failed:', e);
      }
    }
    return { success: false };
  },

  /**
   * Connect to a Wi-Fi Direct peer
   * @param {string} deviceAddress - MAC address of the target device
   */
  async connectWifiDirect(deviceAddress) {
    if (NativeProximity) {
      try {
        return await NativeProximity.connectWifiDirect({ deviceAddress });
      } catch (e) {
        console.error('[Proximity Plugin] connectWifiDirect failed:', e);
      }
    }
    return { success: false };
  },

  /**
   * Request location permission (needed for Wi-Fi scanning on Android)
   * @returns {Promise<{granted: boolean}>}
   */
  async requestLocationPermission() {
    if (NativeProximity) {
      try {
        return await NativeProximity.requestLocationPermission();
      } catch (e) {
        console.warn('[Proximity Plugin] requestLocationPermission failed:', e);
      }
    }
    return { granted: true }; // Web doesn't need this
  },

  /**
   * Request nearby Wi-Fi devices permission (Android 13+)
   * @returns {Promise<{granted: boolean}>}
   */
  async requestNearbyPermission() {
    if (NativeProximity) {
      try {
        return await NativeProximity.requestNearbyPermission();
      } catch (e) {
        console.warn('[Proximity Plugin] requestNearbyPermission failed:', e);
      }
    }
    return { granted: true };
  },

  /**
   * Check all required permissions
   * @returns {Promise<{location: boolean, nearby: boolean, wifi: boolean}>}
   */
  async checkPermissions() {
    if (NativeProximity) {
      try {
        return await NativeProximity.checkPermissions();
      } catch (e) {
        console.warn('[Proximity Plugin] checkPermissions failed:', e);
      }
    }
    return { location: true, nearby: true, wifi: true };
  },

  /**
   * Share a file via Android system share sheet (Nearby Share, Bluetooth, etc.)
   * @param {string} uri - Content URI of the file
   * @param {string} mimeType - MIME type
   * @param {string} title - Share dialog title
   */
  async shareFile(uri, mimeType, title) {
    if (NativeProximity) {
      try {
        return await NativeProximity.shareFile({ uri, mimeType, title });
      } catch (e) {
        console.warn('[Proximity Plugin] shareFile failed:', e);
      }
    }
    // Web fallback: use Web Share API
    return { success: false, error: 'Use Web Share API instead' };
  },

  /**
   * Get the device's local IP address
   */
  async getLocalIp() {
    if (NativeProximity) {
      try {
        const result = await NativeProximity.getLocalIp();
        return result.ip;
      } catch (e) {
        console.warn('[Proximity Plugin] getLocalIp failed:', e);
      }
    }
    return '';
  },

  /**
   * Register event listener for Wi-Fi Direct peer changes
   * @param {Function} callback 
   */
  onWifiDirectPeersChanged(callback) {
    if (NativeProximity) {
      NativeProximity.addListener('wifiDirectPeersChanged', callback);
    }
  },

  /**
   * Register event listener for hotspot state changes
   * @param {Function} callback 
   */
  onHotspotStateChanged(callback) {
    if (NativeProximity) {
      NativeProximity.addListener('hotspotStateChanged', callback);
    }
  },

  /**
   * Remove all event listeners
   */
  removeAllListeners() {
    if (NativeProximity) {
      NativeProximity.removeAllListeners();
    }
  }
};

export default Proximity;
