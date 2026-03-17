/**
 * Proximity Plugin — JavaScript interface to the native Android ProximityPlugin
 * and Electron mDNS bridge.
 *
 * Exposes all offline P2P discovery capabilities:
 *   • NSD / mDNS   — LAN peer discovery (same WiFi network)
 *   • BLE           — offline peer discovery (no network needed)
 *   • GATT server   — BLE SDP exchange
 *   • SDP HTTP      — local signaling server for WebRTC without Socket.IO
 *   • Wi-Fi Direct  — ad-hoc P2P network (truly offline)
 *   • Hotspot       — create local-only AP for other devices to join
 */

import { registerPlugin, Capacitor } from '@capacitor/core';
import { isCapacitor, isAndroid } from '../utils/platform';

// ─── Platform detection ───────────────────────────────────────────────────────

const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

// Register the native plugin (only loads inside a Capacitor app)
const NativeProximity = isCapacitor ? registerPlugin('Proximity') : null;

// ─── Electron IPC helper ─────────────────────────────────────────────────────

async function ipc(channel, ...args) {
  if (!window.electronAPI) throw new Error('Not in Electron');
  return window.electronAPI.invoke(channel, ...args);
}

// ─── Proximity plugin interface ───────────────────────────────────────────────

const Proximity = {

  isAvailable() {
    return (isCapacitor && isAndroid) || isElectron;
  },

  // ─── Identity ───────────────────────────────────────────────────────────────

  async getDeviceId() {
    if (NativeProximity) return (await NativeProximity.getDeviceId()).deviceId;
    if (isElectron)      return (await ipc('proximity-get-device-id')).deviceId;
    return crypto.randomUUID().replace(/-/g, '').substring(0, 16);
  },

  async setNickname(nickname) {
    if (NativeProximity) return NativeProximity.setNickname({ nickname });
    return { success: true };
  },

  // ─── SDP local HTTP server ───────────────────────────────────────────────────
  // Each device runs a tiny HTTP server. POST /sdp/{fromId} delivers SDP
  // offers/answers directly peer-to-peer — no Socket.IO needed.

  async startSdpServer() {
    if (NativeProximity) return NativeProximity.startSdpServer();
    // Electron: mDNS server already includes the SDP server
    if (isElectron) {
      const info = await ipc('mdns-get-my-info');
      return { success: true, port: info.port };
    }
    return { success: false, error: 'SDP server not available on this platform' };
  },

  async stopSdpServer() {
    if (NativeProximity) return NativeProximity.stopSdpServer();
    return { success: true };
  },

  async getSdpPort() {
    if (NativeProximity) return NativeProximity.getSdpPort();
    if (isElectron) {
      const info = await ipc('mdns-get-my-info');
      return { port: info.port, running: true };
    }
    return { port: 0, running: false };
  },

  /** Send SDP offer/answer to a peer's local HTTP server */
  async sendSdpToPeer(peerIp, peerPort, sdp, myId) {
    if (NativeProximity) return NativeProximity.sendSdpToPeer({ peerIp, peerPort, sdp, myId });
    if (isElectron)      return ipc('mdns-send-sdp', peerIp, peerPort, sdp);
    return { success: false, error: 'Not supported' };
  },

  // ─── NSD (mDNS) — LAN discovery ─────────────────────────────────────────────

  async startNsd(nickname, port) {
    if (NativeProximity) return NativeProximity.startNsd({ nickname, port });
    // Electron: mDNS is started together with mdns-start IPC call
    if (isElectron) return ipc('mdns-start', { nickname });
    return { success: false, error: 'NSD not available on web' };
  },

  async stopNsd() {
    if (NativeProximity) return NativeProximity.stopNsd();
    if (isElectron)      return ipc('mdns-stop');
    return { success: true };
  },

  async getNsdPeers() {
    if (NativeProximity) return (await NativeProximity.getNsdPeers()).peers || [];
    if (isElectron)      return (await ipc('mdns-get-peers')).peers || [];
    return [];
  },

  // ─── BLE advertising + scanning ─────────────────────────────────────────────

  async startBleAdvertising() {
    if (NativeProximity) return NativeProximity.startBleAdvertising();
    return { success: false, error: 'BLE advertising only available on Android' };
  },

  async stopBleAdvertising() {
    if (NativeProximity) return NativeProximity.stopBleAdvertising();
    return { success: true };
  },

  async startBleScanning() {
    if (NativeProximity) return NativeProximity.startBleScanning();
    return { success: false, error: 'BLE scanning only available on Android' };
  },

  async stopBleScanning() {
    if (NativeProximity) return NativeProximity.stopBleScanning();
    return { success: true };
  },

  async getBlePeers() {
    if (NativeProximity) return (await NativeProximity.getBlePeers()).peers || [];
    return [];
  },

  // ─── GATT server (BLE SDP exchange) ─────────────────────────────────────────

  async startGattServer() {
    if (NativeProximity) return NativeProximity.startGattServer();
    return { success: false, error: 'GATT server only available on Android' };
  },

  async stopGattServer() {
    if (NativeProximity) return NativeProximity.stopGattServer();
    return { success: true };
  },

  // ─── Wi-Fi Direct ────────────────────────────────────────────────────────────

  async startP2pDiscovery() {
    if (NativeProximity) return NativeProximity.startP2pDiscovery();
    return { success: false, error: 'Wi-Fi Direct only available on Android' };
  },

  async stopP2pDiscovery() {
    if (NativeProximity) return NativeProximity.stopP2pDiscovery();
    return { success: true };
  },

  async connectWifiDirect(deviceAddress) {
    if (NativeProximity) return NativeProximity.connectWifiDirect({ deviceAddress });
    return { success: false, error: 'Wi-Fi Direct only available on Android' };
  },

  // ─── Hotspot ─────────────────────────────────────────────────────────────────

  async createHotspot() {
    if (NativeProximity) return NativeProximity.createHotspot();
    return { success: false, error: 'Hotspot only available on Android' };
  },

  async stopHotspot() {
    if (NativeProximity) return NativeProximity.stopHotspot();
    return { success: false };
  },

  // ─── Wi-Fi info ──────────────────────────────────────────────────────────────

  async getWifiInfo() {
    if (NativeProximity) {
      try { return await NativeProximity.getWifiInfo(); } catch (e) {}
    }
    return { ssid: '', ip: '', isConnected: navigator.onLine };
  },

  async getLocalIp() {
    if (NativeProximity) {
      try { return (await NativeProximity.getLocalIp()).ip; } catch (e) {}
    }
    if (isElectron) {
      try { return (await ipc('proximity-get-local-ip')).ip; } catch (e) {}
    }
    return '';
  },

  // ─── Permissions ─────────────────────────────────────────────────────────────

  async requestLocationPermission() {
    if (NativeProximity) return NativeProximity.requestLocationPermission();
    return { granted: true };
  },

  async requestNearbyPermission() {
    if (NativeProximity) return NativeProximity.requestNearbyPermission();
    return { granted: true };
  },

  async requestBluetoothPermission() {
    if (NativeProximity) return NativeProximity.requestBluetoothPermission();
    return { granted: true };
  },

  async checkPermissions() {
    if (NativeProximity) return NativeProximity.checkPermissions();
    return { location: true, nearby: true, wifi: true, bluetooth: false };
  },

  // ─── Share ───────────────────────────────────────────────────────────────────

  async shareFile(uri, mimeType, title) {
    if (NativeProximity) return NativeProximity.shareFile({ uri, mimeType, title });
    return { success: false, error: 'Use Web Share API instead' };
  },

  // ─── Event listeners ─────────────────────────────────────────────────────────

  /**
   * Listen for a native proximity event.
   * Returns a handle with a .remove() method.
   *
   * Events: 'offlinePeerFound', 'offlinePeerLost', 'offlineSdpReceived',
   *         'wifiDirectPeersChanged', 'wifiDirectConnected',
   *         'wifiDirectDisconnected', 'hotspotStateChanged', 'nsdRegistered'
   */
  addListener(event, callback) {
    if (NativeProximity) return NativeProximity.addListener(event, callback);
    // Electron: forward mdns-event from preload
    if (isElectron && window.electronAPI) {
      const handler = (_e, ev) => { if (ev?.type === event || event === 'mdns-event') callback(ev); };
      window.electronAPI.on('mdns-event', handler);
      return { remove: () => window.electronAPI.off?.('mdns-event', handler) };
    }
    return { remove: () => {} };
  },

  removeAllListeners() {
    if (NativeProximity) NativeProximity.removeAllListeners();
  },
};

export default Proximity;
