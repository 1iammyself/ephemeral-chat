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
    this._myKeyPair         = null;        // X25519 keypair for P2P E2EE
    this._myPublicKeyB64    = null;        // base64 public key injected into SDP payloads
    this._peerAesKeys       = new Map();   // peerId → AES-GCM-256 CryptoKey
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Start
  // ──────────────────────────────────────────────────────────────────────────

  async start(nickname) {
    if (this._running) return this._myInfo;

    await this._initKeyPair();

    if (isElectron) {
      await this._startElectron(nickname);
    } else if (isCapacitorApp) {
      await this._startCapacitor(nickname);
    } else {
      await this._startWeb(nickname);
    }

    this._running = true;
    console.log('[OfflineP2P] Started —', this._myInfo);
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
    console.log('[OfflineP2P] Stopped');
    this._peerAesKeys.clear();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Send SDP to a specific peer (offer or answer)
  // ──────────────────────────────────────────────────────────────────────────

  async sendSdp(peerId, sdpPayload) {
    const peer = this._peers.get(peerId);
    if (!peer) throw new Error(`Unknown peer: ${peerId}`);

    // Inject our X25519 public key so the peer can derive a shared AES-GCM key
    const sdpStr = this._injectMyPubKey(sdpPayload);

    if (isElectron) {
      return electronIpc('mdns-send-sdp', peer.ip, peer.port, sdpStr);
    }

    if (isCapacitorApp) {
      const native = await getNative();
      if (peer.transport === 'ble' && peer.address) {
        return native.writeBleGatt({ address: peer.address, sdp: sdpStr });
      }
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
  // E2EE: encrypt / decrypt messages for a specific peer
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Encrypt arbitrary data for a specific P2P peer using AES-GCM-256.
   * Requires key exchange (sendSdp must have been called first and a
   * 'p2p-key-ready' event received for this peerId).
   *
   * @param {string} peerId
   * @param {string|Uint8Array} data
   * @returns {Promise<{p2pEncrypted: true, ct: string, iv: string}>}
   */
  async encryptForPeer(peerId, data) {
    const aesKey = this._peerAesKeys.get(peerId);
    if (!aesKey) throw new Error(`No P2P key established for peer: ${peerId}`);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext);
    return {
      p2pEncrypted: true,
      ct: btoa(String.fromCharCode(...new Uint8Array(ct))),
      iv: btoa(String.fromCharCode(...iv)),
    };
  }

  /**
   * Decrypt a P2P-encrypted payload from a peer.
   *
   * @param {string} peerId
   * @param {{ ct: string, iv: string }} encryptedData
   * @returns {Promise<string>}
   */
  async decryptFromPeer(peerId, encryptedData) {
    const aesKey = this._peerAesKeys.get(peerId);
    if (!aesKey) throw new Error(`No P2P key established for peer: ${peerId}`);
    const ctBytes  = Uint8Array.from(atob(encryptedData.ct), c => c.charCodeAt(0));
    const ivBytes  = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));
    const plain    = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, aesKey, ctBytes);
    return new TextDecoder().decode(plain);
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
      console.warn('[OfflineP2P] NSD start failed:', e.message);
    });

    // 4. Start BLE advertising + scanning (works when offline)
    await native.startBleAdvertising().catch((e) => {
      console.warn('[OfflineP2P] BLE advertising failed:', e.message);
    });
    await native.startBleScanning().catch((e) => {
      console.warn('[OfflineP2P] BLE scanning failed:', e.message);
    });

    // 5. Start GATT server for BLE SDP exchange
    await native.startGattServer().catch((e) => {
      console.warn('[OfflineP2P] GATT server failed:', e.message);
    });

    // 6. Start Wi-Fi Direct discovery
    await native.startP2pDiscovery().catch((e) => {
      console.warn('[OfflineP2P] Wi-Fi Direct discovery failed:', e.message);
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
      console.warn('[OfflineP2P] Web Bluetooth not available on this browser.');
      this._myInfo = { deviceId: crypto.randomUUID().substring(0, 16), platform: 'web' };
      return;
    }

    // Web Bluetooth is request-only (user must tap a button each time).
    // We expose a scanOnce() method for the UI to call on user gesture.
    this._myInfo = { deviceId: crypto.randomUUID().substring(0, 16), platform: 'web' };
    console.log('[OfflineP2P] Web platform — use scanOnce() for BLE discovery on user gesture.');
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
    const sdpStr = this._injectMyPubKey(sdpPayload);
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
    if (type === 'sdp-received' && detail?.sdp) {
      // Async: extract peer's X25519 key, derive shared AES key, then re-emit clean SDP
      this._handleIncomingSdp(detail).then(cleanDetail => {
        this.dispatchEvent(new CustomEvent('sdp-received', { detail: cleanDetail }));
      }).catch(() => {
        this.dispatchEvent(new CustomEvent('sdp-received', { detail }));
      });
      return;
    }
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // P2P E2EE internals
  // ──────────────────────────────────────────────────────────────────────────

  async _initKeyPair() {
    this._myKeyPair = await crypto.subtle.generateKey(
      { name: 'X25519' },
      true,          // public key must be exportable to send to peer
      ['deriveBits']
    );
    const rawPub = await crypto.subtle.exportKey('raw', this._myKeyPair.publicKey);
    this._myPublicKeyB64 = btoa(String.fromCharCode(...new Uint8Array(rawPub)));
  }

  _injectMyPubKey(sdpPayload) {
    let obj = typeof sdpPayload === 'string' ? (() => { try { return JSON.parse(sdpPayload); } catch { return { raw: sdpPayload }; } })() : sdpPayload;
    if (this._myPublicKeyB64) obj = { ...obj, p2pPubKey: this._myPublicKeyB64 };
    return JSON.stringify(obj);
  }

  async _handleIncomingSdp(detail) {
    const { fromPeerId, sdp, ...rest } = detail;
    let sdpObj;
    try {
      sdpObj = typeof sdp === 'string' ? JSON.parse(sdp) : sdp;
    } catch {
      return detail;
    }

    const { p2pPubKey, ...cleanSdp } = sdpObj;

    if (p2pPubKey && fromPeerId && this._myKeyPair) {
      try {
        await this._derivePeerKey(fromPeerId, p2pPubKey);
        // Notify listeners that a shared key is ready for this peer
        this.dispatchEvent(new CustomEvent('p2p-key-ready', { detail: { peerId: fromPeerId } }));
      } catch (_) {}
    }

    return { fromPeerId, sdp: JSON.stringify(cleanSdp), ...rest };
  }

  async _derivePeerKey(peerId, peerPublicKeyB64) {
    const rawPub = Uint8Array.from(atob(peerPublicKeyB64), c => c.charCodeAt(0));
    const peerPublicKey = await crypto.subtle.importKey(
      'raw', rawPub, { name: 'X25519' }, false, []
    );

    const sharedBits = await crypto.subtle.deriveBits(
      { name: 'X25519', public: peerPublicKey },
      this._myKeyPair.privateKey,
      256
    );

    const hkdfKey = await crypto.subtle.importKey(
      'raw', sharedBits, { name: 'HKDF' }, false, ['deriveKey']
    );

    const aesKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(32),
        info: new TextEncoder().encode('ephchat-p2p-aes'),
      },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    this._peerAesKeys.set(peerId, aesKey);
  }
}

// ─── Singleton export ────────────────────────────────────────────────────────

const offlineP2P = new OfflineP2PManager();
export default offlineP2P;
export { OfflineP2PManager };
