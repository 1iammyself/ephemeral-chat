/**
 * Proximity Transfer Service — rewritten for reliability
 *
 * P2P file/data transfer using WebRTC data channels.
 * Uses Socket.IO (/nearby namespace) for signaling only.
 *
 * Key improvements over previous version:
 *  - Robust _waitForConnection with proper cleanup
 *  - Data-channel-only transfer accept/reject (no dual event paths)
 *  - ArrayBuffer chunking that works on all browsers (no File.stream())
 *  - Back-pressure via bufferedAmount polling
 *  - Better logging for debugging
 */

import { isElectron, isCapacitor, isAndroid } from './platform';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001' : '');

// ─── Constants ──────────────────────────────────────────────

const CHUNK_SIZE = 256 * 1024;           // 256 KB — dramatically fewer chunks, higher speeds
const MAX_BUFFERED = 4 * 1024 * 1024;    // 4 MB buffer threshold keeps the pipe saturated
const HEARTBEAT_INTERVAL = 3000;
const PEER_TIMEOUT = 15000;
const DATA_CHANNEL_LABEL = 'ephemeral-transfer';
const CONNECT_TIMEOUT = 45000;          // 45s to allow TURN fallback
const TRANSFER_ACCEPT_TIMEOUT = 60000;  // 60s for user to accept

// ─── ICE Servers ────────────────────────────────────────────

function getIceServers() {
  const defaults = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  try {
    const env = import.meta.env.VITE_ICE_SERVERS;
    if (env) {
      const parsed = JSON.parse(env);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch (_e) {
    console.warn('[Proximity] Bad VITE_ICE_SERVERS, using defaults');
  }
  return defaults;
}

const ICE_SERVERS = getIceServers();

// ─── Utility Functions ──────────────────────────────────────

function generateDeviceId() {
  const stored = localStorage.getItem('ephchat-device-id');
  if (stored) return stored;
  const id = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  localStorage.setItem('ephchat-device-id', id);
  return id;
}

function generateTransferId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function getDevicePlatform() {
  if (isElectron) return 'electron';
  if (isCapacitor) return 'android';
  return 'web';
}

function getDeviceType() {
  if (isElectron) return 'desktop';
  if (isAndroid) return 'phone';
  if (/iPad|tablet/i.test(navigator.userAgent)) return 'tablet';
  if (/Mobile|Android|iPhone/i.test(navigator.userAgent)) return 'phone';
  return 'desktop';
}

async function derivePairingCode(fp1, fp2) {
  const combined = [fp1, fp2].sort().join(':');
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(combined)
  );
  const arr = new Uint8Array(buf);
  const num =
    ((arr[0] << 24) | (arr[1] << 16) | (arr[2] << 8) | arr[3]) >>> 0;
  return String(num % 1000000).padStart(6, '0');
}

function fingerprintFromSDP(sdp) {
  const m = sdp?.match(/a=fingerprint:sha-256\s+(.+)/);
  return m ? m[1] : null;
}

async function getCertificateFingerprint(pc) {
  try {
    const stats = await pc.getStats();
    for (const [, r] of stats) {
      if (r.type === 'certificate' && r.fingerprint) return r.fingerprint;
      if (r.type === 'transport' && r.localCertificateId) {
        const cert = stats.get(r.localCertificateId);
        if (cert?.fingerprint) return cert.fingerprint;
      }
    }
  } catch (_e) { /* */ }
  return fingerprintFromSDP(pc.localDescription?.sdp) || generateTransferId();
}

async function getRemoteFingerprint(pc) {
  try {
    const stats = await pc.getStats();
    for (const [, r] of stats) {
      if (r.type === 'transport' && r.remoteCertificateId) {
        const cert = stats.get(r.remoteCertificateId);
        if (cert?.fingerprint) return cert.fingerprint;
      }
    }
  } catch (_e) { /* */ }
  return fingerprintFromSDP(pc.remoteDescription?.sdp) || generateTransferId();
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatSpeed(bps) {
  return formatBytes(bps) + '/s';
}

/**
 * Read a File/Blob chunk as ArrayBuffer
 */
function readChunkAsArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Compress JSON payload to reduce QR code density for fast scanning natively.
 */
export async function compressPayload(obj) {
  const str = JSON.stringify(obj);
  try {
    const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const buffer = await new Response(stream).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return 'C|' + btoa(binary);
  } catch (e) {
    // Graceful fallback if unsupported
    return 'U|' + btoa(str);
  }
}

export async function decompressPayload(payloadStr) {
  if (typeof payloadStr === 'object') return payloadStr; // Legacy fallback

  if (payloadStr.startsWith('C|')) {
    const binary = atob(payloadStr.slice(2));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  } else if (payloadStr.startsWith('U|')) {
    return JSON.parse(atob(payloadStr.slice(2)));
  }
  return JSON.parse(payloadStr); // Unencoded legacy JSON strings
}

// ─── ProximityService ───────────────────────────────────────

export class ProximityService {
  constructor() {
    this.deviceId = generateDeviceId();
    this.nickname = '';
    this.peers = new Map();
    this.connections = new Map();
    this.pendingTransfers = new Map();
    this.listeners = new Map();
    this.discoverySocket = null;
    this.isDiscovering = false;
    this.heartbeatTimer = null;
    this.cleanupTimer = null;
    this._destroyed = false;
  }

  // ─── Events ─────────────────────────────────────────────

  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(cb);
    return () => this.off(event, cb);
  }

  off(event, cb) {
    this.listeners.get(event)?.delete(cb);
  }

  emit(event, data) {
    this.listeners.get(event)?.forEach(cb => {
      try { cb(data); } catch (e) { console.error('[Proximity] event handler error:', e); }
    });
  }

  // ─── Discovery ──────────────────────────────────────────

  async startDiscovery(nickname) {
    if (this.isDiscovering) return;
    this.nickname = nickname || 'Anonymous';
    this.isDiscovering = true;

    try {
      const { io } = await import('socket.io-client');
      const serverUrl = API_BASE || window.location.origin;

      console.log('[Proximity] Connecting to signaling server:', serverUrl);

      this.discoverySocket = io(serverUrl + '/nearby', {
        transports: ['websocket'],
        query: {
          deviceId: this.deviceId,
          nickname: this.nickname,
          platform: getDevicePlatform(),
          deviceType: getDeviceType(),
        },
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });

      this._setupSignalingHandlers();

      this.heartbeatTimer = setInterval(() => {
        if (this.discoverySocket?.connected) {
          this.discoverySocket.emit('heartbeat', {
            deviceId: this.deviceId,
            timestamp: Date.now(),
          });
        }
      }, HEARTBEAT_INTERVAL);

      this.cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [pid, peer] of this.peers) {
          if (now - peer.lastSeen > PEER_TIMEOUT) {
            this.peers.delete(pid);
            this.emit('peer-lost', { id: pid });
          }
        }
      }, PEER_TIMEOUT / 2);

      this.emit('discovery-started');
    } catch (e) {
      this.isDiscovering = false;
      console.error('[Proximity] Discovery failed:', e);
      throw e;
    }
  }

  stopDiscovery() {
    this.isDiscovering = false;
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.cleanupTimer) { clearInterval(this.cleanupTimer); this.cleanupTimer = null; }
    for (const pid of this.connections.keys()) this._closeConnection(pid);
    this.connections.clear();
    this.peers.clear();
    if (this.discoverySocket) { this.discoverySocket.disconnect(); this.discoverySocket = null; }
    this.emit('discovery-stopped');
  }

  getPeers() {
    return Array.from(this.peers.values());
  }

  // ─── Signaling Handlers ─────────────────────────────────

  _setupSignalingHandlers() {
    const s = this.discoverySocket;
    if (!s) return;

    s.on('connect', () => {
      console.log('[Proximity] Signaling connected');
      s.emit('announce', {
        deviceId: this.deviceId,
        nickname: this.nickname,
        platform: getDevicePlatform(),
        deviceType: getDeviceType(),
      });
      this.emit('connected');
    });

    s.on('reconnect', () => {
      console.log('[Proximity] Signaling reconnected — re-announcing');
      s.emit('announce', {
        deviceId: this.deviceId,
        nickname: this.nickname,
        platform: getDevicePlatform(),
        deviceType: getDeviceType(),
      });
    });

    s.on('disconnect', (reason) => {
      console.log('[Proximity] Signaling disconnected:', reason);
      this.emit('disconnected');
    });

    s.on('peer-announced', (p) => {
      if (p.deviceId === this.deviceId) return;
      const info = { id: p.deviceId, nickname: p.nickname, platform: p.platform, deviceType: p.deviceType, lastSeen: Date.now() };
      const isNew = !this.peers.has(p.deviceId);
      this.peers.set(p.deviceId, info);
      this.emit(isNew ? 'peer-discovered' : 'peer-updated', info);
    });

    s.on('peer-left', ({ deviceId }) => {
      if (this.peers.has(deviceId)) {
        this.peers.delete(deviceId);
        this._closeConnection(deviceId);
        this.emit('peer-lost', { id: deviceId });
      }
    });

    s.on('peer-heartbeat', ({ deviceId }) => {
      const p = this.peers.get(deviceId);
      if (p) { p.lastSeen = Date.now(); }
    });

    s.on('peers-list', (list) => {
      for (const p of list) {
        if (p.deviceId === this.deviceId) continue;
        const info = { id: p.deviceId, nickname: p.nickname, platform: p.platform, deviceType: p.deviceType, lastSeen: Date.now() };
        this.peers.set(p.deviceId, info);
        this.emit('peer-discovered', info);
      }
    });

    // ─── WebRTC signaling relay ───────────────────────────

    s.on('rtc-offer', async ({ from, offer }) => {
      try { await this._handleOffer(from, offer); }
      catch (e) { console.error('[Proximity] handleOffer error:', e); }
    });

    s.on('rtc-answer', async ({ from, answer }) => {
      try {
        const conn = this.connections.get(from);
        if (!conn?.pc) return;
        await conn.pc.setRemoteDescription(new RTCSessionDescription(answer));
        this._flushIceCandidates(from);
      } catch (e) { console.error('[Proximity] handleAnswer error:', e); }
    });

    s.on('rtc-ice-candidate', async ({ from, candidate }) => {
      if (!candidate) return;
      const conn = this.connections.get(from);
      if (!conn?.pc) return;
      if (!conn.pc.remoteDescription) {
        if (!conn._pendingCandidates) conn._pendingCandidates = [];
        conn._pendingCandidates.push(candidate);
        return;
      }
      try { await conn.pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (e) { console.warn('[Proximity] addIceCandidate err:', e.message); }
    });

    // Legacy signaling-path transfer events (not used for actual transfer,
    // but we relay them so the UI can show incoming requests even before
    // a data channel exists)
    s.on('transfer-request', ({ from, metadata }) => {
      this.emit('incoming-transfer', { peerId: from, metadata });
    });
    s.on('transfer-accepted', ({ from, transferId }) => {
      this.emit('transfer-accepted', { peerId: from, transferId });
    });
    s.on('transfer-rejected', ({ from, transferId, reason }) => {
      this.emit('transfer-rejected', { peerId: from, transferId, reason });
    });
  }

  // ─── WebRTC Connection ──────────────────────────────────

  async connectToPeer(peerId) {
    // Tear down any stale connection first
    if (this.connections.has(peerId)) {
      const old = this.connections.get(peerId);
      if (old.state === 'connected' && old.dataChannel?.readyState === 'open') {
        return { pairingCode: old.pairingCode || '------' };
      }
      this._closeConnection(peerId);
    }

    console.log('[Proximity] Connecting to', peerId);

    // CRITICAL FIX: Restore STUN servers (but reject ALL TURN servers)
    // Emptying this array completely breaks ICE candidate generation on some Android/Windows networking stacks.
    const strictStunServers = ICE_SERVERS.filter(server => !server.urls.toString().includes('turn:'));
    const pc = new RTCPeerConnection({
      iceServers: strictStunServers,
      iceTransportPolicy: 'all',     // consider all local candidates
      iceCandidatePoolSize: 10       // generate pre-flight local UDP host IPs
    });

    // Create data channel BEFORE creating the offer
    const dc = pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });

    const conn = {
      pc,
      dataChannel: dc,
      state: 'connecting',
      pairingCode: '',
      receivedChunks: [],
      currentTransfer: null,
      _pendingCandidates: [],
    };
    this.connections.set(peerId, conn);

    this._setupPeerConnection(peerId, pc);
    this._setupDataChannel(peerId, dc);

    // Trickle ICE: create offer and send immediately
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.discoverySocket?.emit('rtc-offer', { to: peerId, offer: pc.localDescription });

    // Wait for the data channel to open
    const code = await this._waitForConnection(peerId, CONNECT_TIMEOUT);
    conn.pairingCode = code;
    return { pairingCode: code };
  }

  async _handleOffer(fromPeerId, offer) {
    console.log('[Proximity] Handling offer from', fromPeerId);

    // If we already have a connection to this peer, tear it down
    if (this.connections.has(fromPeerId)) {
      this._closeConnection(fromPeerId);
    }

    // CRITICAL FIX: Restore STUN servers (but reject ALL TURN servers)
    const strictStunServers = ICE_SERVERS.filter(server => !server.urls.toString().includes('turn:'));
    const pc = new RTCPeerConnection({
      iceServers: strictStunServers,
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 10
    });

    const conn = {
      pc,
      dataChannel: null,
      state: 'connecting',
      pairingCode: '',
      receivedChunks: [],
      currentTransfer: null,
      _pendingCandidates: [],
    };
    this.connections.set(fromPeerId, conn);
    this._setupPeerConnection(fromPeerId, pc);

    // The answerer receives the data channel via ondatachannel
    pc.ondatachannel = (event) => {
      console.log('[Proximity] ondatachannel fired for', fromPeerId);
      conn.dataChannel = event.channel;
      this._setupDataChannel(fromPeerId, event.channel);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    this._flushIceCandidates(fromPeerId);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.discoverySocket?.emit('rtc-answer', { to: fromPeerId, answer: pc.localDescription });
  }

  // ─── True Offline Connection (QR Based) ─────────────────

  async createOfflineOffer() {
    console.log('[Proximity] Creating true offline offer...');
    const strictStunServers = ICE_SERVERS.filter(server => !server.urls.toString().includes('turn:'));
    const pc = new RTCPeerConnection({
      iceServers: strictStunServers,
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 10
    });

    const dc = pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
    const peerId = 'offline-' + generateTransferId(); // Unique temp ID

    if (this.connections.has(peerId)) this._closeConnection(peerId);

    const conn = { pc, dataChannel: dc, state: 'connecting', pairingCode: '', receivedChunks: [], _pendingCandidates: [] };
    this.connections.set(peerId, conn);
    this._setupPeerConnection(peerId, pc);
    this._setupDataChannel(peerId, dc);

    const candidates = [];
    pc.onicecandidate = (e) => {
      if (e.candidate) candidates.push(e.candidate.candidate);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete (max 3 seconds)
    await new Promise(resolve => {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      const check = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); resolve(); } };
      pc.addEventListener('icegatheringstatechange', check);
      setTimeout(resolve, 3000);
    });

    const payloadObj = {
      t: 'offer',
      deviceId: this.deviceId,
      nickname: this.nickname,
      o: offer.sdp,
      c: candidates
    };

    // Severely compress payload to drastically improve QR scan-ability
    const payload = await compressPayload(payloadObj);

    return { payload, peerId };
  }

  async acceptOfflineOffer(offerCompressed) {
    const data = await decompressPayload(offerCompressed);
    console.log('[Proximity] Accepting offline offer from', data.deviceId);

    const strictStunServers = ICE_SERVERS.filter(server => !server.urls.toString().includes('turn:'));
    const pc = new RTCPeerConnection({
      iceServers: strictStunServers,
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 10
    });

    const peerId = data.deviceId || 'offline-host';
    if (this.connections.has(peerId)) this._closeConnection(peerId);

    const conn = { pc, dataChannel: null, state: 'connecting', pairingCode: '', receivedChunks: [], _pendingCandidates: [] };
    this.connections.set(peerId, conn);
    this._setupPeerConnection(peerId, pc);

    pc.ondatachannel = (e) => {
      conn.dataChannel = e.channel;
      this._setupDataChannel(peerId, e.channel);
    };

    const candidates = [];
    pc.onicecandidate = (e) => {
      if (e.candidate) candidates.push(e.candidate.candidate);
    };

    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.o }));
    for (const c of data.c) {
      if (c) await pc.addIceCandidate(new RTCIceCandidate({ candidate: c, sdpMid: '0', sdpMLineIndex: 0 })).catch(() => { });
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await new Promise(resolve => {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      const check = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); resolve(); } };
      pc.addEventListener('icegatheringstatechange', check);
      setTimeout(resolve, 3000);
    });

    // Emulate discovering them so UI shows them instantly
    const peerInfo = { id: peerId, nickname: data.nickname || 'Offline Host', platform: 'unknown', deviceType: 'phone', lastSeen: Date.now() };
    this.peers.set(peerId, peerInfo);
    this.emit('peer-discovered', peerInfo);

    // Resolve pairing code dynamically without blocking JSON generation
    this._waitForConnection(peerId, CONNECT_TIMEOUT).then(code => {
      conn.pairingCode = code;
    }).catch(e => console.warn('Offline connection failed:', e));

    const answerObj = {
      t: 'answer',
      nickname: this.nickname,
      a: answer.sdp,
      c: candidates
    };

    return await compressPayload(answerObj);
  }

  async finalizeOfflineConnection(answerCompressed, originalPeerId) {
    const data = await decompressPayload(answerCompressed);
    const conn = this.connections.get(originalPeerId);
    if (!conn) throw new Error('No offline offer was created');

    console.log('[Proximity] Finalizing offline connection for', originalPeerId);

    await conn.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.a }));
    for (const c of data.c) {
      if (c) await conn.pc.addIceCandidate(new RTCIceCandidate({ candidate: c, sdpMid: '0', sdpMLineIndex: 0 })).catch(() => { });
    }

    const code = await this._waitForConnection(originalPeerId, CONNECT_TIMEOUT);
    conn.pairingCode = code;

    const info = { id: originalPeerId, nickname: data.nickname || 'Scanned Peer', platform: 'unknown', deviceType: 'phone', lastSeen: Date.now() };
    this.peers.set(originalPeerId, info);
    this.emit('peer-discovered', info);

    return { peerId: originalPeerId, pairingCode: code };
  }

  _setupPeerConnection(peerId, pc) {
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.discoverySocket?.emit('rtc-ice-candidate', { to: peerId, candidate: e.candidate });
      }
    };

    // Track ICE restart attempts to prevent infinite loops
    const iceRestartState = { attempts: 0, maxAttempts: 3, timer: null };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      console.log('[Proximity] PeerConnection', peerId, '->', s);

      if (s === 'connected') {
        // Reset restart counter on successful connection
        iceRestartState.attempts = 0;
        if (iceRestartState.timer) {
          clearTimeout(iceRestartState.timer);
          iceRestartState.timer = null;
        }
      } else if (s === 'disconnected') {
        // "disconnected" is often temporary (mobile network switch, brief drop)
        // Wait 3 seconds before attempting ICE restart
        if (iceRestartState.timer) clearTimeout(iceRestartState.timer);
        iceRestartState.timer = setTimeout(() => {
          if (pc.connectionState === 'disconnected' && iceRestartState.attempts < iceRestartState.maxAttempts) {
            iceRestartState.attempts++;
            console.log('[Proximity] Attempting ICE restart for', peerId, '(attempt', iceRestartState.attempts + ')');
            this._attemptIceRestart(peerId, pc);
          } else if (pc.connectionState === 'disconnected') {
            console.log('[Proximity] Max ICE restart attempts reached for', peerId);
            this._closeConnection(peerId);
            this.emit('peer-disconnected', { id: peerId, reason: 'max-restarts' });
          }
        }, 3000);
      } else if (s === 'failed') {
        // "failed" is more serious — try one ICE restart, then give up
        if (iceRestartState.attempts < 1) {
          iceRestartState.attempts++;
          console.log('[Proximity] Connection failed, attempting ICE restart for', peerId);
          this._attemptIceRestart(peerId, pc);
        } else {
          this._closeConnection(peerId);
          this.emit('peer-disconnected', { id: peerId, reason: 'failed' });
        }
      } else if (s === 'closed') {
        this._closeConnection(peerId);
        this.emit('peer-disconnected', { id: peerId, reason: 'closed' });
      }
    };

    // Diagnostic Analytics Tracker
    pc.oniceconnectionstatechange = () => {
      console.log('[Proximity] ICE state', peerId, '->', pc.iceConnectionState);

      // If we connect, let's aggressively poll to see *how* we connected
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        pc.getStats().then(stats => {
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              console.log('✓ ACTIVE CONNECTION PAIR:', report);

              // Find the actual candidates to determine if we are indeed using Local IPs
              stats.forEach(r => {
                if (r.id === report.localCandidateId) {
                  console.log('  -> LOCAL ROUTE:', r.candidateType, r.address, r.protocol);
                }
                if (r.id === report.remoteCandidateId) {
                  console.log('  -> REMOTE ROUTE:', r.candidateType, r.address, r.protocol);
                }
              });

              if (report.localCandidateId && report.remoteCandidateId) {
                const isLocal = Array.from(stats.values()).some(r => r.id === report.localCandidateId && r.candidateType === 'host');
                if (isLocal) {
                  console.log('🚀 SUCCESS: True Offline Host Connection Confirmed!');
                } else {
                  console.log('⚠️ WARNING: Transfer is being relayed over NAT/STUN!');
                }
              }
            }
          });
        }).catch(e => console.warn('Stats diag error:', e));
      }
    };
  }

  async _attemptIceRestart(peerId, pc) {
    try {
      const conn = this.connections.get(peerId);
      if (!conn || pc.signalingState === 'closed') return;

      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      this.discoverySocket?.emit('rtc-offer', { to: peerId, offer: pc.localDescription });
      console.log('[Proximity] ICE restart offer sent to', peerId);
    } catch (e) {
      console.warn('[Proximity] ICE restart failed for', peerId, ':', e.message);
    }
  }

  _setupDataChannel(peerId, channel) {
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      console.log('[Proximity] DataChannel OPEN with', peerId);
      const conn = this.connections.get(peerId);
      if (conn) {
        conn.state = 'connected';
        conn.dataChannel = channel; // ensure ref is up to date
      }
      this._generatePairingCode(peerId);
      this.emit('channel-open', { peerId });
    };

    channel.onclose = () => {
      console.log('[Proximity] DataChannel CLOSED with', peerId);
      this.emit('channel-closed', { peerId });
    };

    channel.onerror = (err) => {
      console.error('[Proximity] DataChannel ERROR with', peerId, err);
      this.emit('channel-error', { peerId, error: err });
    };

    channel.onmessage = (event) => {
      this._handleDataChannelMessage(peerId, event.data);
    };
  }

  async _generatePairingCode(peerId) {
    const conn = this.connections.get(peerId);
    if (!conn?.pc || conn.pairingCode) return;
    try {
      const lf = await getCertificateFingerprint(conn.pc);
      const rf = await getRemoteFingerprint(conn.pc);
      const code = await derivePairingCode(lf, rf);
      conn.pairingCode = code;
      this.emit('pairing-code', { peerId, code });
    } catch (_e) {
      console.warn('[Proximity] pairing code derivation failed, using fallback');
    }
  }

  _flushIceCandidates(peerId) {
    const conn = this.connections.get(peerId);
    if (!conn?._pendingCandidates?.length) return;
    console.log('[Proximity] Flushing', conn._pendingCandidates.length, 'ICE candidates for', peerId);
    const candidates = conn._pendingCandidates.splice(0);
    for (const c of candidates) {
      conn.pc.addIceCandidate(new RTCIceCandidate(c)).catch(e =>
        console.warn('[Proximity] flush ICE err:', e.message)
      );
    }
  }

  /**
   * Wait for the data channel to open.
   * Returns the pairing code (or '------' placeholder).
   */
  _waitForConnection(peerId, timeout) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let pollId = null;

      const cleanup = () => {
        settled = true;
        clearTimeout(timerId);
        if (pollId) clearInterval(pollId);
        if (unsubOpen) unsubOpen();
      };

      const timerId = setTimeout(() => {
        if (settled) return;
        cleanup();
        reject(new Error('Connection timeout — could not open data channel'));
      }, timeout);

      // Check immediately (channel may already be open)
      const check = () => {
        if (settled) return false;
        const conn = this.connections.get(peerId);
        if (conn?.dataChannel?.readyState === 'open') {
          cleanup();
          resolve(conn.pairingCode || '------');
          return true;
        }
        return false;
      };

      // Subscribe to channel-open event
      const unsubOpen = this.on('channel-open', ({ peerId: id }) => {
        if (id === peerId && !settled) {
          cleanup();
          const conn = this.connections.get(peerId);
          resolve(conn?.pairingCode || '------');
        }
      });

      // Poll as safety net (every 250ms)
      if (!check()) {
        pollId = setInterval(() => { check(); }, 250);
      }
    });
  }

  _closeConnection(peerId) {
    const conn = this.connections.get(peerId);
    if (!conn) return;
    try { conn.dataChannel?.close(); } catch (_e) { /* */ }
    try { conn.pc?.close(); } catch (_e) { /* */ }
    this.connections.delete(peerId);
  }

  // ─── Connection Stats ───────────────────────────────────

  async getConnectionStats(peerId) {
    const conn = this.connections.get(peerId);
    if (!conn?.pc) return null;
    try {
      const stats = await conn.pc.getStats();
      const result = { rtt: -1, localCandidateType: 'unknown', remoteCandidateType: 'unknown', bytesSent: 0, bytesReceived: 0, quality: 'unknown' };
      stats.forEach(r => {
        if (r.type === 'candidate-pair' && r.state === 'succeeded') {
          result.rtt = r.currentRoundTripTime != null ? Math.round(r.currentRoundTripTime * 1000) : -1;
          result.bytesSent = r.bytesSent || 0;
          result.bytesReceived = r.bytesReceived || 0;
        }
        if (r.type === 'local-candidate') result.localCandidateType = r.candidateType || 'unknown';
        if (r.type === 'remote-candidate') result.remoteCandidateType = r.candidateType || 'unknown';
      });
      if (result.rtt >= 0) {
        if (result.rtt < 20) result.quality = 'excellent';
        else if (result.rtt < 50) result.quality = 'good';
        else if (result.rtt < 150) result.quality = 'fair';
        else result.quality = 'poor';
      }
      return result;
    } catch (_e) { return null; }
  }

  // ─── Data Channel Protocol ──────────────────────────────

  _handleDataChannelMessage(peerId, data) {
    if (typeof data === 'string') {
      try {
        this._handleControlMessage(peerId, JSON.parse(data));
      } catch (e) {
        console.error('[Proximity] bad control msg:', e);
      }
    } else {
      this._handleFileChunk(peerId, data);
    }
  }

  _handleControlMessage(peerId, msg) {
    switch (msg.type) {
      case 'transfer-offer': {
        const t = {
          id: msg.transferId,
          peerId,
          metadata: msg.metadata,
          state: 'pending',
          receivedChunks: [],
          bytesReceived: 0,
          startTime: null,
        };
        this.pendingTransfers.set(msg.transferId, t);
        this.emit('incoming-transfer', { peerId, transferId: msg.transferId, metadata: msg.metadata });
        break;
      }
      case 'transfer-accept': {
        const t = this.pendingTransfers.get(msg.transferId);
        if (t) { t.state = 'accepted'; }
        this.emit('transfer-accepted', { transferId: msg.transferId, peerId });
        break;
      }
      case 'transfer-reject': {
        this.pendingTransfers.delete(msg.transferId);
        this.emit('transfer-rejected', { transferId: msg.transferId, peerId, reason: msg.reason || 'Rejected' });
        break;
      }
      case 'transfer-progress': {
        this.emit('transfer-progress', { transferId: msg.transferId, chunkIndex: msg.chunkIndex, bytesReceived: msg.bytesReceived });
        break;
      }
      case 'transfer-complete': {
        const t = this.pendingTransfers.get(msg.transferId);
        if (t) t.state = 'complete';
        this.emit('transfer-complete', { transferId: msg.transferId, peerId });
        break;
      }
      case 'transfer-cancel': {
        this.pendingTransfers.delete(msg.transferId);
        this.emit('transfer-cancelled', { transferId: msg.transferId, peerId });
        break;
      }
      case 'text-message': {
        this.emit('text-received', { peerId, text: msg.text });
        break;
      }
      default:
        console.warn('[Proximity] Unknown msg type:', msg.type);
    }
  }

  _handleFileChunk(peerId, data) {
    // Find the active receiving transfer for this peer
    let transfer = null;
    for (const [, t] of this.pendingTransfers) {
      if (t.peerId === peerId && (t.state === 'receiving' || t.state === 'accepted')) {
        transfer = t;
        break;
      }
    }
    if (!transfer) {
      console.warn('[Proximity] Received chunk but no active transfer for', peerId);
      return;
    }

    if (!transfer.startTime) {
      transfer.startTime = Date.now();
      transfer.state = 'receiving';
    }

    transfer.receivedChunks.push(new Uint8Array(data));
    transfer.bytesReceived += data.byteLength;

    if (!transfer.lastEmitTime) transfer.lastEmitTime = 0;
    const now = Date.now();
    const progress = transfer.metadata.size > 0 ? transfer.bytesReceived / transfer.metadata.size : 0;
    const elapsed = (now - transfer.startTime) / 1000;
    const speed = elapsed > 0 ? transfer.bytesReceived / elapsed : 0;

    // Send periodic ACK (every 32nd chunk, approx ~2MB, to reduce control overhead)
    if (transfer.receivedChunks.length % 32 === 0) {
      this._sendControl(peerId, {
        type: 'transfer-progress',
        transferId: transfer.id,
        chunkIndex: transfer.receivedChunks.length - 1,
        bytesReceived: transfer.bytesReceived,
      });
    }

    // Throttle UI updates to roughly 100-150ms to prevent React re-render queue from freezing the WebRTC event loop!
    if (now - transfer.lastEmitTime > 150 || transfer.bytesReceived >= transfer.metadata.size) {
      transfer.lastEmitTime = now;
      this.emit('receive-progress', {
        transferId: transfer.id,
        bytesReceived: transfer.bytesReceived,
        totalBytes: transfer.metadata.size,
        progress,
        speed,
        state: 'transferring',
      });
    }

    // Complete?
    if (transfer.bytesReceived >= transfer.metadata.size) {
      transfer.state = 'complete';

      // We combine the Uint8Array chunks into a single Blob.
      // Doing this via Blob rather than a giant array avoids contiguous memory allocation failures.
      const blob = new Blob(transfer.receivedChunks, { type: transfer.metadata.type || 'application/octet-stream' });

      // Critically: Clear the receivedChunks array from memory as soon as the Blob is created!
      transfer.receivedChunks = [];

      this._sendControl(peerId, { type: 'transfer-complete', transferId: transfer.id });

      this.emit('receive-complete', {
        transferId: transfer.id,
        peerId,
        metadata: transfer.metadata,
        blob,
        speed: Math.round(speed),
      });
      this.pendingTransfers.delete(transfer.id);
    }
  }

  /**
   * Helper: send a JSON control message on the data channel
   */
  _sendControl(peerId, obj) {
    const conn = this.connections.get(peerId);
    if (conn?.dataChannel?.readyState === 'open') {
      try { conn.dataChannel.send(JSON.stringify(obj)); }
      catch (e) { console.warn('[Proximity] _sendControl err:', e.message); }
    }
  }

  // ─── Transfer API ───────────────────────────────────────

  /**
   * Send a file to a connected peer.
   * The entire flow happens over the data channel.
   */
  async sendFile(peerId, file, extraMetadata) {
    extraMetadata = extraMetadata || {};

    const conn = this.connections.get(peerId);
    if (!conn) throw new Error('Not connected to peer');

    // Wait briefly if the data channel is not yet open (race between
    // connectToPeer resolving and React re-rendering)
    if (!conn.dataChannel || conn.dataChannel.readyState !== 'open') {
      console.log('[Proximity] sendFile: waiting for data channel to open...');
      await this._waitForDataChannel(peerId, 10000);
    }

    const dc = conn.dataChannel;
    if (!dc || dc.readyState !== 'open') {
      throw new Error('No open data channel with peer — please reconnect');
    }

    const transferId = extraMetadata._transferId || generateTransferId();
    delete extraMetadata._transferId;

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;
    const metadata = {
      name: file.name || 'unnamed',
      size: file.size,
      type: file.type || 'application/octet-stream',
      transferType: extraMetadata.transferType || 'file',
      totalChunks,
      chunkSize: CHUNK_SIZE,
      ...extraMetadata,
    };

    const transfer = { id: transferId, peerId, metadata, state: 'pending', bytesSent: 0, startTime: null };
    this.pendingTransfers.set(transferId, transfer);

    // 1. Send transfer offer
    dc.send(JSON.stringify({ type: 'transfer-offer', transferId, metadata }));

    // 2. Wait for acceptance (via data channel control message)
    await this._waitForTransferAcceptance(transferId, TRANSFER_ACCEPT_TIMEOUT);

    console.log('[Proximity] Starting streaming transfer:', file.name, formatBytes(file.size));

    // 4. Send chunks with back-pressure, streaming directly from the File object
    // DO NOT load the entire file into memory at once!
    transfer.state = 'sending';
    transfer.startTime = Date.now();
    let offset = 0;
    let lastEmitTime = 0;

    // Set the low watermark to notify us proactively (Wait to reach half of max buffer)
    dc.bufferedAmountLowThreshold = 2 * 1024 * 1024;

    while (offset < file.size) {
      // Back-pressure: wait if the buffer is getting full
      // Extremely important: This MUST be a 'while' loop! 
      // An 'if' statement will bypass strict backpressure when the safety timeout triggers, flooding the queue.
      while (dc.bufferedAmount >= MAX_BUFFERED) {
        await new Promise(resolve => {
          let timeoutId;
          const onLow = () => {
            clearTimeout(timeoutId);
            dc.removeEventListener('bufferedamountlow', onLow);
            resolve();
          };
          dc.addEventListener('bufferedamountlow', onLow);
          // Safety fallback timeout in case the event is swallowed or we disconnect
          timeoutId = setTimeout(() => {
            dc.removeEventListener('bufferedamountlow', onLow);
            resolve();
          }, 100);
        });
      }

      const end = Math.min(offset + CHUNK_SIZE, file.size);

      // Read only the specific chunk from the file system / memory map
      const blobChunk = file.slice(offset, end);
      const arrayBufferChunk = await readChunkAsArrayBuffer(blobChunk);

      try {
        dc.send(arrayBufferChunk);
      } catch (err) {
        // Chromium throws OperationError if `send queue is full` natively
        if (err.name === 'OperationError' || err.message.includes('queue is full') || err.message.includes('Queue full')) {
          console.warn('[Proximity] Data channel queue full Native Error. Forcing stall.');
          await new Promise(r => setTimeout(r, 200));
          continue; // Retry this exact same offset
        }
        throw err;
      }

      offset = end;
      transfer.bytesSent = offset;

      const now = Date.now();
      // Throttle rapid UI updates
      if (now - lastEmitTime > 150 || offset === file.size) {
        lastEmitTime = now;
        const progress = file.size > 0 ? offset / file.size : 1;
        const elapsed = (now - transfer.startTime) / 1000;
        const speed = elapsed > 0 ? offset / elapsed : 0;

        this.emit('send-progress', {
          transferId,
          bytesSent: offset,
          totalBytes: file.size,
          progress,
          speed,
          state: 'transferring',
        });
      }
    }

    // 5. Wait for completion ACK (with generous timeout)
    await new Promise((resolve) => {
      const tid = setTimeout(resolve, 15000);
      const unsub = this.on('transfer-complete', ({ transferId: tid2 }) => {
        if (tid2 === transferId) { clearTimeout(tid); unsub(); resolve(); }
      });
    });

    transfer.state = 'complete';
    const elapsed = (Date.now() - transfer.startTime) / 1000;
    this.emit('send-complete', {
      transferId,
      peerId,
      metadata,
      speed: elapsed > 0 ? Math.round(file.size / elapsed) : 0,
    });
    this.pendingTransfers.delete(transferId);
    return { transferId };
  }

  /**
   * Wait for the data channel to be open.
   */
  _waitForDataChannel(peerId, timeout) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('Data channel not ready')); }
      }, timeout);
      const poll = setInterval(() => {
        const conn = this.connections.get(peerId);
        if (conn?.dataChannel?.readyState === 'open') {
          settled = true;
          clearTimeout(timer);
          clearInterval(poll);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Wait for the remote peer to accept a transfer offer.
   */
  _waitForTransferAcceptance(transferId, timeout) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('Transfer request timed out — recipient did not accept')); }
      }, timeout);

      const unsubAccept = this.on('transfer-accepted', ({ transferId: tid }) => {
        if (tid === transferId && !settled) {
          settled = true; clearTimeout(timer); unsubAccept(); unsubReject(); resolve();
        }
      });
      const unsubReject = this.on('transfer-rejected', ({ transferId: tid, reason }) => {
        if (tid === transferId && !settled) {
          settled = true; clearTimeout(timer); unsubAccept(); unsubReject();
          reject(new Error(reason || 'Transfer rejected'));
        }
      });
    });
  }

  sendText(peerId, text) {
    const conn = this.connections.get(peerId);
    if (!conn?.dataChannel || conn.dataChannel.readyState !== 'open') {
      throw new Error('No open data channel with peer');
    }
    conn.dataChannel.send(JSON.stringify({ type: 'text-message', text }));
  }

  acceptTransfer(transferId) {
    const transfer = this.pendingTransfers.get(transferId);
    if (!transfer) throw new Error('Transfer not found');
    transfer.state = 'accepted';
    this._sendControl(transfer.peerId, { type: 'transfer-accept', transferId });
  }

  rejectTransfer(transferId, reason) {
    const transfer = this.pendingTransfers.get(transferId);
    if (!transfer) return;
    this._sendControl(transfer.peerId, { type: 'transfer-reject', transferId, reason: reason || 'Declined' });
    this.pendingTransfers.delete(transferId);
  }

  cancelTransfer(transferId) {
    const transfer = this.pendingTransfers.get(transferId);
    if (!transfer) return;
    this._sendControl(transfer.peerId, { type: 'transfer-cancel', transferId });
    transfer.state = 'cancelled';
    this.pendingTransfers.delete(transferId);
    this.emit('transfer-cancelled', { transferId, peerId: transfer.peerId });
  }

  getConnectionInfo(peerId) {
    const conn = this.connections.get(peerId);
    if (!conn) return null;
    return {
      state: conn.state,
      pairingCode: conn.pairingCode,
      channelState: conn.dataChannel?.readyState || 'closed',
    };
  }

  destroy() {
    this._destroyed = true;
    this.stopDiscovery();
    this.listeners.clear();
    this.pendingTransfers.clear();
  }
}

// ─── Singleton ──────────────────────────────────────────────

let _instance = null;

export function getProximityService() {
  if (!_instance || _instance._destroyed) {
    _instance = new ProximityService();
  }
  return _instance;
}

export function destroyProximityService() {
  if (_instance) { _instance.destroy(); _instance = null; }
}

export default ProximityService;
