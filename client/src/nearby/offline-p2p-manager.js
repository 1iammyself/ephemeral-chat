/**
 * Offline P2P Manager — True LAN / Bluetooth peer discovery without any server
 *
 * Detects the runtime platform and picks the right discovery channel:
 *
 *  Platform      Discovery                  SDP exchange
 *  ──────────    ────────────────────────   ──────────────────────────────────
 *  Electron      mDNS via mdns-server.js    HTTP POST to peer's local server
 *  Capacitor     NSD (mDNS) + BLE           HTTP POST / BLE GATT write
 *  Web           Web Bluetooth (BLE, Chrome) Falls back to QR code exchange
 *
 * The manager exposes a stable EventEmitter-like interface so callers never
 * need to know which transport is active.
 *
 * Events emitted (via addEventListener / on):
 *   'peer-found'     { deviceId, nickname, ip, port, platform, transport }
 *   'peer-lost'      { deviceId }
 *   'sdp-received'   { fromPeerId, sdp }          — incoming SDP offer or answer
 *   'error'          { message }
 */

import { Capacitor } from '@capacitor/core';

// ─── Platform detection ───────────────────────────────────────────────────────

const isElectron   = typeof window !== 'undefined' && !!window.electronAPI;
const isCapacitorApp = Capacitor.isNativePlatform();
const isWeb        = !isElectron && !isCapacitorApp;

// ─── Electron IPC shim ───────────────────────────────────────────────────────

const ipc = isElectron ? window.electronAPI : null;

async function electronIpc(channel, ...args) {
  if (!ipc) throw new Error('Not running in Electron');
  return ipc.invoke(channel, ...args);
}

// ─── Android native plugin shim ──────────────────────────────────────────────

let _nativeProximity = null;

async function getNative() {
  if (_nativeProximity) return _nativeProximity;
  if (!isCapacitorApp) return null;
  const { registerPlugin } = await import('@capacitor/core');
  _nativeProximity = registerPlugin('Proximity');
  return _nativeProximity;
}

// ─── Main manager ─────────────────────────────────────────────────────────────

class OfflineP2PManager extends EventTarget {
  constructor() {
    super();
    this._running       = false;
    this._peers         = new Map();   // deviceId → peer info
    this._myInfo        = null;
    this._nativeListeners = [];
    this._electronListenersSetup = false;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Start
  // ──────────────────────────────────────────────────────────────────────────

  async start(nickname) {
    if (this._running) return this._myInfo;

    if (isElectron) {
      await this._startElectron(nickname);
    } else if (isCapacitorApp) {
      await this._startCapacitor(nickname);
    } else {
      await this._startWeb(nickname);
    }

    this._running = true;
    return this._myInfo;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Stop
  // ──────────────────────────────────────────────────────────────────────────

  async stop() {
    if (!this._running) return;
    this._running = false;

    if (isElectron) {
      await this._stopElectron();
    } else if (isCapacitorApp) {
      await this._stopCapacitor();
    }

    this._peers.clear();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Send SDP to a specific peer (offer or answer)
  // ──────────────────────────────────────────────────────────────────────────

  async sendSdp(peerId, sdpPayload) {
    const peer = this._peers.get(peerId);
    if (!peer) throw new Error(`Unknown peer: ${peerId}`);

    const sdpStr = typeof sdpPayload === 'string'
      ? sdpPayload : JSON.stringify(sdpPayload);

    if (isElectron) {
      return electronIpc('mdns-send-sdp', peer.ip, peer.port, sdpStr);
    }

    if (isCapacitorApp) {
      const native = await getNative();
      if (peer.transport === 'ble' && peer.address) {
        // BLE GATT write path (offline without WiFi)
        return native.writeBleGatt({ address: peer.address, sdp: sdpStr });
      }
      // NSD path — send via local HTTP
      return native.sendSdpToPeer({
        peerIp: peer.ip,
        peerPort: peer.port,
        sdp: sdpStr,
        myId: this._myInfo?.deviceId,
      });
    }

    throw new Error('sendSdp not supported on this platform');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Getters
  // ──────────────────────────────────────────────────────────────────────────

  getPeers()   { return [...this._peers.values()]; }
  getMyInfo()  { return this._myInfo; }
  isRunning()  { return this._running; }

  // ──────────────────────────────────────────────────────────────────────────
  // Electron implementation
  // ──────────────────────────────────────────────────────────────────────────

  async _startElectron(nickname) {
    this._myInfo = await electronIpc('mdns-start', { nickname });

    if (!this._electronListenersSetup) {
      this._electronListenersSetup = true;
      // The renderer receives mDNS events forwarded from the main process
      window.electronAPI.on('mdns-event', (_e, event) => {
        this._handleEvent(event);
      });
    }
  }

  async _stopElectron() {
    await electronIpc('mdns-stop');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Capacitor / Android implementation
  // ──────────────────────────────────────────────────────────────────────────

  async _startCapacitor(nickname) {
    const native = await getNative();

    // Store nickname so NSD can use it
    await native.setNickname({ nickname }).catch(() => {});

    // 1. Start local SDP HTTP server — get ephemeral port
    const { port } = await native.startSdpServer();
    const { ip }   = await native.getLocalIp();
    const { deviceId } = await native.getDeviceId();
    this._myInfo = { deviceId, nickname, ip, port };

    // 2. Request permissions
    await native.requestLocationPermission().catch(() => {});
    await native.requestNearbyPermission().catch(() => {});
    await native.requestBluetoothPermission().catch(() => {});

    // 3. Start NSD (mDNS) on LAN
    await native.startNsd({ nickname, port }).catch((e) => {
    });

    // 4. Start BLE advertising + scanning (works when offline)
    await native.startBleAdvertising().catch((e) => {
    });
    await native.startBleScanning().catch((e) => {
    });

    // 5. Start GATT server for BLE SDP exchange
    await native.startGattServer().catch((e) => {
    });

    // 6. Start Wi-Fi Direct discovery
    await native.startP2pDiscovery().catch((e) => {
    });

    // 7. Register event listeners
    const addListener = (event, handler) => {
      native.addListener(event, handler);
      this._nativeListeners.push({ event, handler });
    };

    addListener('offlinePeerFound', (peer) => {
      this._peers.set(peer.deviceId, peer);
      this._emit('peer-found', peer);
    });

    addListener('offlinePeerLost', ({ deviceId }) => {
      this._peers.delete(deviceId);
      this._emit('peer-lost', { deviceId });
    });

    addListener('offlineSdpReceived', ({ fromPeerId, sdp, fromAddress }) => {
      this._emit('sdp-received', { fromPeerId: fromPeerId || fromAddress, sdp });
    });

    addListener('wifiDirectPeersChanged', ({ peers }) => {
      // Wi-Fi Direct peers are not yet connected — list them for UI
      if (peers) this._emit('wifidirect-peers', { peers });
    });

    addListener('wifiDirectConnected', ({ groupOwnerIp, isGroupOwner }) => {
      this._emit('wifidirect-connected', { groupOwnerIp, isGroupOwner });
    });
  }

  async _stopCapacitor() {
    const native = await getNative();
    if (!native) return;

    await native.stopNsd().catch(() => {});
    await native.stopBleAdvertising().catch(() => {});
    await native.stopBleScanning().catch(() => {});
    await native.stopGattServer().catch(() => {});
    await native.stopP2pDiscovery().catch(() => {});
    await native.stopSdpServer().catch(() => {});

    // Remove listeners
    for (const { event } of this._nativeListeners) {
      native.removeAllListeners(event).catch(() => {});
    }
    this._nativeListeners = [];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Web Bluetooth fallback (discovery only — no SDP channel without server)
  // ──────────────────────────────────────────────────────────────────────────

  async _startWeb() {
    if (!navigator.bluetooth) {
      this._myInfo = { deviceId: crypto.randomUUID().substring(0, 16), platform: 'web' };
      return;
    }

    // Web Bluetooth is request-only (user must tap a button each time).
    // We expose a scanOnce() method for the UI to call on user gesture.
    this._myInfo = { deviceId: crypto.randomUUID().substring(0, 16), platform: 'web' };
  }

  /**
   * Web only: scan for nearby BLE devices on a user gesture.
   * Returns the first matching device or null.
   */
  async scanOnce() {
    if (!navigator.bluetooth) return null;
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['12345678-1234-1234-1234-123456789abc'] }],
        optionalServices: ['12345678-1234-1234-1234-123456789abd'],
      });
      return { deviceId: device.id, nickname: device.name || device.id, transport: 'ble-web', _device: device };
    } catch (e) {
      if (e.name !== 'NotFoundError') {
        this._emit('error', { message: e.message });
      }
      return null;
    }
  }

  /**
   * Web only: after scanOnce(), connect GATT and exchange SDP via characteristic.
   */
  async sendSdpViaBle(bleDevice, sdpPayload) {
    if (!bleDevice?._device) throw new Error('No BLE device');
    const server = await bleDevice._device.gatt.connect();
    const service = await server.getPrimaryService('12345678-1234-1234-1234-123456789abc');
    const char = await service.getCharacteristic('12345678-1234-1234-1234-123456789abd');
    const enc = new TextEncoder();
    const sdpStr = typeof sdpPayload === 'string' ? sdpPayload : JSON.stringify(sdpPayload);
    await char.writeValueWithResponse(enc.encode(sdpStr));

    // Read the peer's SDP in response
    const val = await char.readValue();
    const dec = new TextDecoder();
    return dec.decode(val);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal event routing
  // ──────────────────────────────────────────────────────────────────────────

  _handleEvent(event) {
    if (!event?.type) return;
    switch (event.type) {
      case 'peer-found':
        this._peers.set(event.deviceId, event);
        this._emit('peer-found', event);
        break;
      case 'peer-lost':
        this._peers.delete(event.deviceId);
        this._emit('peer-lost', event);
        break;
      case 'sdp-received':
        this._emit('sdp-received', event);
        break;
      default:
        this._emit(event.type, event);
    }
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

// ─── Singleton export ────────────────────────────────────────────────────────

const offlineP2P = new OfflineP2PManager();
export default offlineP2P;
export { OfflineP2PManager };
