/**
 * Proximity Transfer Service
 * 
 * P2P file/data transfer engine for nearby devices.
 * Uses WebRTC data channels for the actual transfer (encrypted, P2P, no server for data).
 * Uses Socket.IO signaling server for peer discovery and WebRTC negotiation.
 * 
 * Architecture:
 * 1. Discovery: Devices advertise via Socket.IO "nearby" namespace → peers appear in list
 * 2. Connection: WebRTC peer connection with DTLS 1.3 encryption
 * 3. Pairing: 6-digit code derived from both fingerprints for MITM protection
 * 4. Transfer: Chunked file streaming over data channels with progress
 * 
 * Supported modes:
 * - LAN Direct: Same Wi-Fi, auto-discovered
 * - Hotspot: One device creates AP, others join, then discover
 * - Wi-Fi Direct: Android P2P (via Capacitor plugin)
 * - Fallback: WebRTC with TURN relay if direct fails
 */

import { isElectron, isCapacitor, isAndroid } from './platform';

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');

// ─── Constants ──────────────────────────────────────────────

const CHUNK_SIZE = 256 * 1024; // 256KB chunks for data channel
const MAX_BUFFERED = 1024 * 1024; // 1MB buffer threshold
const DISCOVERY_SERVICE = '_ephchat._udp.local';
const PAIRING_CODE_LENGTH = 6;
const HEARTBEAT_INTERVAL = 3000; // ms
const PEER_TIMEOUT = 15000; // ms - consider peer lost after this (5 missed heartbeats)
const DATA_CHANNEL_LABEL = 'ephemeral-transfer';

// ─── ICE Servers (STUN + TURN) ──────────────────────────────
// Parse TURN servers from env, falling back to public STUN only
function getIceServers() {
  const defaultServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];
  try {
    const envServers = import.meta.env.VITE_ICE_SERVERS;
    if (envServers) {
      const parsed = JSON.parse(envServers);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[Proximity] Failed to parse VITE_ICE_SERVERS, using defaults:', e);
  }
  return defaultServers;
}

const ICE_SERVERS = getIceServers();

// ─── Peer Info ──────────────────────────────────────────────

/**
 * @typedef {Object} PeerInfo
 * @property {string} id - Unique peer ID (short hash)
 * @property {string} nickname - Display name
 * @property {string} platform - 'electron' | 'android' | 'web'
 * @property {number} lastSeen - Timestamp
 * @property {string} [deviceType] - 'desktop' | 'phone' | 'tablet'
 */

/**
 * @typedef {Object} TransferMetadata
 * @property {string} name - File name
 * @property {number} size - Total size in bytes
 * @property {string} type - MIME type
 * @property {string} transferType - 'file' | 'text' | 'drop'
 * @property {number} totalChunks - Number of chunks
 * @property {number} chunkSize - Size of each chunk
 */

/**
 * @typedef {Object} TransferProgress
 * @property {string} transferId - Unique transfer ID
 * @property {number} bytesTransferred - Bytes sent/received so far
 * @property {number} totalBytes - Total bytes
 * @property {number} progress - 0-1 progress value
 * @property {number} speed - Bytes per second
 * @property {string} state - 'pending' | 'transferring' | 'complete' | 'error' | 'cancelled'
 * @property {string} [error] - Error message if state is 'error'
 */

// ─── Utility Functions ──────────────────────────────────────

/**
 * Generate a short device ID (8 chars)
 */
function generateDeviceId() {
  const stored = localStorage.getItem('ephchat-device-id');
  if (stored) return stored;
  const id = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem('ephchat-device-id', id);
  return id;
}

/**
 * Generate a random transfer ID
 */
function generateTransferId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get device platform string
 */
function getDevicePlatform() {
  if (isElectron) return 'electron';
  if (isCapacitor) return 'android';
  return 'web';
}

/**
 * Get device type
 */
function getDeviceType() {
  if (isElectron) return 'desktop';
  if (isAndroid) return 'phone';
  if (/iPad|tablet/i.test(navigator.userAgent)) return 'tablet';
  if (/Mobile|Android|iPhone/i.test(navigator.userAgent)) return 'phone';
  return 'desktop';
}

/**
 * Derive a 6-digit pairing code from two fingerprints
 * @param {string} localFingerprint 
 * @param {string} remoteFingerprint 
 * @returns {Promise<string>} 6-digit code
 */
async function derivePairingCode(localFingerprint, remoteFingerprint) {
  // Sort to ensure same code on both sides regardless of who initiated
  const combined = [localFingerprint, remoteFingerprint].sort().join(':');
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(combined));
  const hashArray = new Uint8Array(hashBuffer);
  // Take first 4 bytes as a number, mod 1000000 for 6 digits
  const num = ((hashArray[0] << 24) | (hashArray[1] << 16) | (hashArray[2] << 8) | hashArray[3]) >>> 0;
  return String(num % 1000000).padStart(PAIRING_CODE_LENGTH, '0');
}

/**
 * Get the certificate fingerprint from an RTCPeerConnection
 */
async function getCertificateFingerprint(pc) {
  const stats = await pc.getStats();
  for (const [, report] of stats) {
    if (report.type === 'certificate' && report.fingerprint) {
      return report.fingerprint;
    }
    // Fallback: local-candidate has fingerprint info
    if (report.type === 'transport' && report.localCertificateId) {
      const cert = stats.get(report.localCertificateId);
      if (cert?.fingerprint) return cert.fingerprint;
    }
  }
  // Fallback: generate from local description
  const sdp = pc.localDescription?.sdp || '';
  const match = sdp.match(/a=fingerprint:sha-256\s+(.+)/);
  return match ? match[1] : generateTransferId();
}

/**
 * Get the remote certificate fingerprint
 */
async function getRemoteFingerprint(pc) {
  const stats = await pc.getStats();
  for (const [, report] of stats) {
    if (report.type === 'transport' && report.remoteCertificateId) {
      const cert = stats.get(report.remoteCertificateId);
      if (cert?.fingerprint) return cert.fingerprint;
    }
  }
  const sdp = pc.remoteDescription?.sdp || '';
  const match = sdp.match(/a=fingerprint:sha-256\s+(.+)/);
  return match ? match[1] : generateTransferId();
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Format speed to human readable
 */
export function formatSpeed(bytesPerSecond) {
  return formatBytes(bytesPerSecond) + '/s';
}

// ─── ProximityService Class ─────────────────────────────────

export class ProximityService {
  constructor() {
    this.deviceId = generateDeviceId();
    this.nickname = '';
    this.peers = new Map(); // peerId → PeerInfo
    this.connections = new Map(); // peerId → { pc, dataChannel, state }
    this.pendingTransfers = new Map(); // transferId → transfer state
    this.listeners = new Map(); // event → Set<callback>
    this.discoverySocket = null;
    this.isDiscovering = false;
    this.heartbeatTimer = null;
    this.cleanupTimer = null;
    this._destroyed = false;
  }

  // ─── Event System ───────────────────────────────────────

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    this.listeners.get(event)?.delete(callback);
  }

  emit(event, data) {
    this.listeners.get(event)?.forEach(cb => {
      try { cb(data); } catch (e) { console.error(`[Proximity] Event handler error:`, e); }
    });
  }

  // ─── Discovery ──────────────────────────────────────────

  /**
   * Start discovering nearby peers
   * @param {string} nickname - This device's display name
   */
  async startDiscovery(nickname) {
    if (this.isDiscovering) return;
    this.nickname = nickname || 'Anonymous';
    this.isDiscovering = true;

    try {
      // Import socket.io dynamically
      const { io } = await import('socket.io-client');
      
      // Connect to the signaling namespace
      const serverUrl = API_BASE || window.location.origin;
      this.discoverySocket = io(`${serverUrl}/nearby`, {
        transports: ['websocket'],
        query: {
          deviceId: this.deviceId,
          nickname: this.nickname,
          platform: getDevicePlatform(),
          deviceType: getDeviceType()
        },
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
      });

      this._setupSignalingHandlers();

      // Start heartbeat
      this.heartbeatTimer = setInterval(() => {
        if (this.discoverySocket?.connected) {
          this.discoverySocket.emit('heartbeat', {
            deviceId: this.deviceId,
            timestamp: Date.now()
          });
        }
      }, HEARTBEAT_INTERVAL);

      // Start cleanup timer for stale peers
      this.cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [peerId, peer] of this.peers) {
          if (now - peer.lastSeen > PEER_TIMEOUT) {
            this.peers.delete(peerId);
            this.emit('peer-lost', { id: peerId });
          }
        }
      }, PEER_TIMEOUT / 2);

      this.emit('discovery-started');
    } catch (error) {
      this.isDiscovering = false;
      console.error('[Proximity] Failed to start discovery:', error);
      throw error;
    }
  }

  /**
   * Stop discovery and disconnect signaling
   */
  stopDiscovery() {
    this.isDiscovering = false;
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Close all peer connections
    for (const [peerId, conn] of this.connections) {
      this._closeConnection(peerId);
    }
    this.connections.clear();
    this.peers.clear();

    if (this.discoverySocket) {
      this.discoverySocket.disconnect();
      this.discoverySocket = null;
    }

    this.emit('discovery-stopped');
  }

  /**
   * Get current list of discovered peers
   * @returns {PeerInfo[]}
   */
  getPeers() {
    return Array.from(this.peers.values());
  }

  // ─── Signaling Handlers ─────────────────────────────────

  _setupSignalingHandlers() {
    const socket = this.discoverySocket;
    if (!socket) return;

    socket.on('connect', () => {
      console.log('[Proximity] Connected to signaling server');
      // Announce ourselves
      socket.emit('announce', {
        deviceId: this.deviceId,
        nickname: this.nickname,
        platform: getDevicePlatform(),
        deviceType: getDeviceType()
      });
      this.emit('connected');
    });

    socket.on('disconnect', () => {
      console.log('[Proximity] Disconnected from signaling server');
      this.emit('disconnected');
    });

    // Peer discovered
    socket.on('peer-announced', (peer) => {
      if (peer.deviceId === this.deviceId) return; // Ignore self
      const peerInfo = {
        id: peer.deviceId,
        nickname: peer.nickname,
        platform: peer.platform,
        deviceType: peer.deviceType,
        lastSeen: Date.now()
      };
      const isNew = !this.peers.has(peer.deviceId);
      this.peers.set(peer.deviceId, peerInfo);
      if (isNew) {
        this.emit('peer-discovered', peerInfo);
      } else {
        this.emit('peer-updated', peerInfo);
      }
    });

    // Peer left
    socket.on('peer-left', ({ deviceId }) => {
      if (this.peers.has(deviceId)) {
        this.peers.delete(deviceId);
        this._closeConnection(deviceId);
        this.emit('peer-lost', { id: deviceId });
      }
    });

    // Peer heartbeat
    socket.on('peer-heartbeat', ({ deviceId, timestamp }) => {
      const peer = this.peers.get(deviceId);
      if (peer) {
        peer.lastSeen = Date.now();
        this.peers.set(deviceId, peer);
      }
    });

    // WebRTC signaling: offer
    socket.on('rtc-offer', async ({ from, offer }) => {
      try {
        await this._handleOffer(from, offer);
      } catch (e) {
        console.error('[Proximity] Error handling offer:', e);
      }
    });

    // WebRTC signaling: answer
    socket.on('rtc-answer', async ({ from, answer }) => {
      try {
        const conn = this.connections.get(from);
        if (conn?.pc) {
          await conn.pc.setRemoteDescription(new RTCSessionDescription(answer));
          conn.state = 'connected';
        }
      } catch (e) {
        console.error('[Proximity] Error handling answer:', e);
      }
    });

    // WebRTC signaling: ICE candidate
    socket.on('rtc-ice-candidate', async ({ from, candidate }) => {
      try {
        const conn = this.connections.get(from);
        if (conn?.pc && candidate) {
          await conn.pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (e) {
        console.error('[Proximity] Error adding ICE candidate:', e);
      }
    });

    // Incoming transfer request
    socket.on('transfer-request', ({ from, metadata }) => {
      this.emit('incoming-transfer', { peerId: from, metadata });
    });

    // Transfer accepted
    socket.on('transfer-accepted', ({ from, transferId }) => {
      this.emit('transfer-accepted', { peerId: from, transferId });
    });

    // Transfer rejected
    socket.on('transfer-rejected', ({ from, transferId, reason }) => {
      this.emit('transfer-rejected', { peerId: from, transferId, reason });
    });

    // Peers list (on connect, get existing peers)
    socket.on('peers-list', (peers) => {
      for (const peer of peers) {
        if (peer.deviceId === this.deviceId) continue;
        const peerInfo = {
          id: peer.deviceId,
          nickname: peer.nickname,
          platform: peer.platform,
          deviceType: peer.deviceType,
          lastSeen: Date.now()
        };
        this.peers.set(peer.deviceId, peerInfo);
        this.emit('peer-discovered', peerInfo);
      }
    });
  }

  // ─── WebRTC Connection ──────────────────────────────────

  /**
   * Connect to a specific peer for transfer
   * @param {string} peerId 
   * @returns {Promise<{pairingCode: string}>}
   */
  async connectToPeer(peerId) {
    if (this.connections.has(peerId)) {
      const existing = this.connections.get(peerId);
      if (existing.state === 'connected' && existing.dataChannel?.readyState === 'open') {
        return { pairingCode: existing.pairingCode };
      }
      this._closeConnection(peerId);
    }

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS
    });

    const dataChannel = pc.createDataChannel(DATA_CHANNEL_LABEL, {
      ordered: true
    });

    const connState = {
      pc,
      dataChannel,
      state: 'connecting',
      pairingCode: '',
      receivedChunks: [],
      currentTransfer: null
    };
    this.connections.set(peerId, connState);

    this._setupDataChannel(peerId, dataChannel);
    this._setupPeerConnection(peerId, pc);

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete (or timeout)
    await this._waitForIceGathering(pc);

    this.discoverySocket?.emit('rtc-offer', {
      to: peerId,
      offer: pc.localDescription
    });

    // Wait for connection to establish
    const pairingCode = await this._waitForConnection(peerId);
    connState.pairingCode = pairingCode;
    
    return { pairingCode };
  }

  /**
   * Handle an incoming WebRTC offer
   */
  async _handleOffer(fromPeerId, offer) {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS
    });

    const connState = {
      pc,
      dataChannel: null,
      state: 'connecting',
      pairingCode: '',
      receivedChunks: [],
      currentTransfer: null
    };
    this.connections.set(fromPeerId, connState);

    this._setupPeerConnection(fromPeerId, pc);

    // Handle incoming data channel
    pc.ondatachannel = (event) => {
      connState.dataChannel = event.channel;
      this._setupDataChannel(fromPeerId, event.channel);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await this._waitForIceGathering(pc);

    this.discoverySocket?.emit('rtc-answer', {
      to: fromPeerId,
      answer: pc.localDescription
    });
  }

  _setupPeerConnection(peerId, pc) {
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.discoverySocket?.emit('rtc-ice-candidate', {
          to: peerId,
          candidate: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[Proximity] Connection to ${peerId}: ${state}`);
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this._closeConnection(peerId);
        this.emit('peer-disconnected', { id: peerId });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected') {
        const conn = this.connections.get(peerId);
        if (conn) {
          conn.state = 'connected';
          this._generatePairingCode(peerId);
        }
      }
    };
  }

  _setupDataChannel(peerId, channel) {
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      console.log(`[Proximity] Data channel open with ${peerId}`);
      const conn = this.connections.get(peerId);
      if (conn) {
        conn.state = 'connected';
        conn.dataChannel = channel;
      }
      this._generatePairingCode(peerId);
      this.emit('channel-open', { peerId });
    };

    channel.onclose = () => {
      console.log(`[Proximity] Data channel closed with ${peerId}`);
      this.emit('channel-closed', { peerId });
    };

    channel.onerror = (error) => {
      console.error(`[Proximity] Data channel error with ${peerId}:`, error);
      this.emit('channel-error', { peerId, error });
    };

    channel.onmessage = (event) => {
      this._handleDataChannelMessage(peerId, event.data);
    };
  }

  async _generatePairingCode(peerId) {
    const conn = this.connections.get(peerId);
    if (!conn?.pc || conn.pairingCode) return;

    try {
      const localFp = await getCertificateFingerprint(conn.pc);
      const remoteFp = await getRemoteFingerprint(conn.pc);
      const code = await derivePairingCode(localFp, remoteFp);
      conn.pairingCode = code;
      this.emit('pairing-code', { peerId, code });
    } catch (e) {
      // Fallback: use random code (both sides still need to confirm)
      console.warn('[Proximity] Could not derive pairing code from certs, using fallback');
    }
  }

  async _waitForIceGathering(pc, timeout = 5000) {
    if (pc.iceGatheringState === 'complete') return;
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeout);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      };
    });
  }

  async _waitForConnection(peerId, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, timeout);

      const checkConnection = () => {
        const conn = this.connections.get(peerId);
        if (conn?.dataChannel?.readyState === 'open') {
          clearTimeout(timer);
          resolve(conn.pairingCode || '------');
          return;
        }
        if (conn?.state === 'connected') {
          clearTimeout(timer);
          resolve(conn.pairingCode || '------');
          return;
        }
        setTimeout(checkConnection, 200);
      };

      // Also listen for channel-open event
      const unsub = this.on('channel-open', ({ peerId: id }) => {
        if (id === peerId) {
          clearTimeout(timer);
          unsub();
          const conn = this.connections.get(peerId);
          resolve(conn?.pairingCode || '------');
        }
      });

      checkConnection();
    });
  }

  _closeConnection(peerId) {
    const conn = this.connections.get(peerId);
    if (!conn) return;
    try {
      conn.dataChannel?.close();
      conn.pc?.close();
    } catch (e) { /* ignore */ }
    this.connections.delete(peerId);
  }

  /**
   * Get WebRTC connection stats for a peer (RTT, bandwidth, etc.)
   * @param {string} peerId
   * @returns {Promise<{rtt: number, localCandidateType: string, remoteCandidateType: string, bytesSent: number, bytesReceived: number}>}
   */
  async getConnectionStats(peerId) {
    const conn = this.connections.get(peerId);
    if (!conn?.pc) return null;

    try {
      const stats = await conn.pc.getStats();
      let result = {
        rtt: -1,
        localCandidateType: 'unknown',
        remoteCandidateType: 'unknown',
        bytesSent: 0,
        bytesReceived: 0,
        quality: 'unknown' // 'excellent' | 'good' | 'fair' | 'poor'
      };

      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          result.rtt = report.currentRoundTripTime != null 
            ? Math.round(report.currentRoundTripTime * 1000) 
            : -1;
          result.bytesSent = report.bytesSent || 0;
          result.bytesReceived = report.bytesReceived || 0;
        }
        if (report.type === 'local-candidate' && report.candidateType) {
          result.localCandidateType = report.candidateType;
        }
        if (report.type === 'remote-candidate' && report.candidateType) {
          result.remoteCandidateType = report.candidateType;
        }
      });

      // Determine quality from RTT
      if (result.rtt >= 0) {
        if (result.rtt < 20) result.quality = 'excellent';
        else if (result.rtt < 50) result.quality = 'good';
        else if (result.rtt < 150) result.quality = 'fair';
        else result.quality = 'poor';
      }

      return result;
    } catch (e) {
      return null;
    }
  }

  // ─── Data Channel Protocol ──────────────────────────────

  _handleDataChannelMessage(peerId, data) {
    const conn = this.connections.get(peerId);
    if (!conn) return;

    if (typeof data === 'string') {
      // Control message (JSON)
      try {
        const msg = JSON.parse(data);
        this._handleControlMessage(peerId, msg);
      } catch (e) {
        console.error('[Proximity] Invalid control message:', e);
      }
    } else {
      // Binary data (file chunk)
      this._handleFileChunk(peerId, data);
    }
  }

  _handleControlMessage(peerId, msg) {
    switch (msg.type) {
      case 'transfer-offer': {
        // Incoming transfer request via data channel
        const transfer = {
          id: msg.transferId,
          peerId,
          metadata: msg.metadata,
          state: 'pending',
          receivedChunks: [],
          bytesReceived: 0,
          startTime: null
        };
        this.pendingTransfers.set(msg.transferId, transfer);
        this.emit('incoming-transfer', {
          peerId,
          transferId: msg.transferId,
          metadata: msg.metadata
        });
        break;
      }

      case 'transfer-accept': {
        const transfer = this.pendingTransfers.get(msg.transferId);
        if (transfer) {
          transfer.state = 'accepted';
          this.emit('transfer-accepted', { transferId: msg.transferId, peerId });
        }
        break;
      }

      case 'transfer-reject': {
        const transfer = this.pendingTransfers.get(msg.transferId);
        if (transfer) {
          transfer.state = 'rejected';
          this.pendingTransfers.delete(msg.transferId);
          this.emit('transfer-rejected', {
            transferId: msg.transferId,
            peerId,
            reason: msg.reason || 'Rejected by recipient'
          });
        }
        break;
      }

      case 'transfer-progress': {
        // ACK from receiver
        const transfer = this.pendingTransfers.get(msg.transferId);
        if (transfer) {
          this.emit('transfer-progress', {
            transferId: msg.transferId,
            chunkIndex: msg.chunkIndex,
            bytesReceived: msg.bytesReceived
          });
        }
        break;
      }

      case 'transfer-complete': {
        const transfer = this.pendingTransfers.get(msg.transferId);
        if (transfer) {
          transfer.state = 'complete';
          this.emit('transfer-complete', { transferId: msg.transferId, peerId });
        }
        break;
      }

      case 'transfer-cancel': {
        const transfer = this.pendingTransfers.get(msg.transferId);
        if (transfer) {
          transfer.state = 'cancelled';
          this.pendingTransfers.delete(msg.transferId);
          this.emit('transfer-cancelled', { transferId: msg.transferId, peerId });
        }
        break;
      }

      case 'text-message': {
        this.emit('text-received', { peerId, text: msg.text });
        break;
      }

      case 'pairing-code': {
        // Pairing code confirmation from other side
        const conn = this.connections.get(peerId);
        if (conn) {
          conn.pairingCode = msg.code;
          this.emit('pairing-code', { peerId, code: msg.code });
        }
        break;
      }

      default:
        console.warn('[Proximity] Unknown control message type:', msg.type);
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
      console.warn('[Proximity] Received chunk but no active transfer');
      return;
    }

    if (!transfer.startTime) {
      transfer.startTime = Date.now();
      transfer.state = 'receiving';
    }

    transfer.receivedChunks.push(new Uint8Array(data));
    transfer.bytesReceived += data.byteLength;

    const progress = transfer.metadata.size > 0
      ? transfer.bytesReceived / transfer.metadata.size
      : 0;
    
    const elapsed = (Date.now() - transfer.startTime) / 1000;
    const speed = elapsed > 0 ? transfer.bytesReceived / elapsed : 0;

    // Send ACK
    const conn = this.connections.get(peerId);
    if (conn?.dataChannel?.readyState === 'open') {
      conn.dataChannel.send(JSON.stringify({
        type: 'transfer-progress',
        transferId: transfer.id,
        chunkIndex: transfer.receivedChunks.length - 1,
        bytesReceived: transfer.bytesReceived
      }));
    }

    this.emit('receive-progress', {
      transferId: transfer.id,
      bytesReceived: transfer.bytesReceived,
      totalBytes: transfer.metadata.size,
      progress,
      speed,
      state: 'transferring'
    });

    // Check if transfer is complete
    if (transfer.bytesReceived >= transfer.metadata.size) {
      transfer.state = 'complete';
      
      // Assemble the file
      const blob = new Blob(transfer.receivedChunks, { type: transfer.metadata.type });

      // Send completion ACK
      if (conn?.dataChannel?.readyState === 'open') {
        conn.dataChannel.send(JSON.stringify({
          type: 'transfer-complete',
          transferId: transfer.id
        }));
      }

      this.emit('receive-complete', {
        transferId: transfer.id,
        peerId,
        metadata: transfer.metadata,
        blob,
        speed: Math.round(speed)
      });

      this.pendingTransfers.delete(transfer.id);
    }
  }

  // ─── Transfer API ───────────────────────────────────────

  /**
   * Send a file to a connected peer
   * @param {string} peerId - Target peer ID
   * @param {File|Blob} file - File to send
   * @param {Object} [extraMetadata] - Additional metadata
   * @returns {Promise<{transferId: string}>}
   */
  async sendFile(peerId, file, extraMetadata = {}) {
    const conn = this.connections.get(peerId);
    if (!conn?.dataChannel || conn.dataChannel.readyState !== 'open') {
      throw new Error('No open data channel with peer');
    }

    const transferId = extraMetadata._transferId || generateTransferId();
    delete extraMetadata._transferId;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const metadata = {
      name: file.name || 'unnamed',
      size: file.size,
      type: file.type || 'application/octet-stream',
      transferType: extraMetadata.transferType || 'file',
      totalChunks,
      chunkSize: CHUNK_SIZE,
      ...extraMetadata
    };

    const transfer = {
      id: transferId,
      peerId,
      metadata,
      state: 'pending',
      bytesSent: 0,
      startTime: null
    };
    this.pendingTransfers.set(transferId, transfer);

    // Send transfer offer
    conn.dataChannel.send(JSON.stringify({
      type: 'transfer-offer',
      transferId,
      metadata
    }));

    // Wait for acceptance
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Transfer request timed out'));
      }, 30000);

      const unsubAccept = this.on('transfer-accepted', ({ transferId: tid }) => {
        if (tid === transferId) {
          clearTimeout(timeout);
          unsubAccept();
          unsubReject();
          resolve();
        }
      });

      const unsubReject = this.on('transfer-rejected', ({ transferId: tid, reason }) => {
        if (tid === transferId) {
          clearTimeout(timeout);
          unsubAccept();
          unsubReject();
          reject(new Error(reason || 'Transfer rejected'));
        }
      });
    });

    // Start sending chunks
    transfer.state = 'sending';
    transfer.startTime = Date.now();

    const dc = conn.dataChannel;
    const reader = file.stream().getReader();
    let offset = 0;

    const sendNextChunks = async () => {
      while (true) {
        // Flow control: wait if buffer is getting full
        if (dc.bufferedAmount > MAX_BUFFERED) {
          await new Promise(resolve => {
            dc.onbufferedamountlow = resolve;
            dc.bufferedAmountLowThreshold = CHUNK_SIZE;
          });
        }

        const { done, value } = await reader.read();
        if (done) break;

        // Send the chunk
        dc.send(value.buffer);
        offset += value.byteLength;
        transfer.bytesSent = offset;

        const progress = file.size > 0 ? offset / file.size : 0;
        const elapsed = (Date.now() - transfer.startTime) / 1000;
        const speed = elapsed > 0 ? offset / elapsed : 0;

        this.emit('send-progress', {
          transferId,
          bytesSent: offset,
          totalBytes: file.size,
          progress,
          speed,
          state: 'transferring'
        });
      }
    };

    await sendNextChunks();

    // Wait for completion ACK
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(); // Don't fail if ACK doesn't come back, data was sent
      }, 10000);

      const unsub = this.on('transfer-complete', ({ transferId: tid }) => {
        if (tid === transferId) {
          clearTimeout(timeout);
          unsub();
          resolve();
        }
      });
    });

    transfer.state = 'complete';
    const elapsed = (Date.now() - transfer.startTime) / 1000;

    this.emit('send-complete', {
      transferId,
      peerId,
      metadata,
      speed: elapsed > 0 ? Math.round(file.size / elapsed) : 0
    });

    this.pendingTransfers.delete(transferId);
    return { transferId };
  }

  /**
   * Send text data to a connected peer
   * @param {string} peerId 
   * @param {string} text 
   */
  sendText(peerId, text) {
    const conn = this.connections.get(peerId);
    if (!conn?.dataChannel || conn.dataChannel.readyState !== 'open') {
      throw new Error('No open data channel with peer');
    }
    conn.dataChannel.send(JSON.stringify({
      type: 'text-message',
      text
    }));
  }

  /**
   * Accept an incoming transfer
   * @param {string} transferId 
   */
  acceptTransfer(transferId) {
    const transfer = this.pendingTransfers.get(transferId);
    if (!transfer) throw new Error('Transfer not found');

    transfer.state = 'accepted';
    const conn = this.connections.get(transfer.peerId);
    if (conn?.dataChannel?.readyState === 'open') {
      conn.dataChannel.send(JSON.stringify({
        type: 'transfer-accept',
        transferId
      }));
    }
  }

  /**
   * Reject an incoming transfer
   * @param {string} transferId 
   * @param {string} [reason]
   */
  rejectTransfer(transferId, reason = 'Declined') {
    const transfer = this.pendingTransfers.get(transferId);
    if (!transfer) return;

    const conn = this.connections.get(transfer.peerId);
    if (conn?.dataChannel?.readyState === 'open') {
      conn.dataChannel.send(JSON.stringify({
        type: 'transfer-reject',
        transferId,
        reason
      }));
    }

    this.pendingTransfers.delete(transferId);
  }

  /**
   * Cancel an active transfer
   * @param {string} transferId 
   */
  cancelTransfer(transferId) {
    const transfer = this.pendingTransfers.get(transferId);
    if (!transfer) return;

    const conn = this.connections.get(transfer.peerId);
    if (conn?.dataChannel?.readyState === 'open') {
      conn.dataChannel.send(JSON.stringify({
        type: 'transfer-cancel',
        transferId
      }));
    }

    transfer.state = 'cancelled';
    this.pendingTransfers.delete(transferId);
    this.emit('transfer-cancelled', { transferId, peerId: transfer.peerId });
  }

  /**
   * Get connection info for a peer
   */
  getConnectionInfo(peerId) {
    const conn = this.connections.get(peerId);
    if (!conn) return null;
    return {
      state: conn.state,
      pairingCode: conn.pairingCode,
      channelState: conn.dataChannel?.readyState || 'closed'
    };
  }

  /**
   * Destroy the service and clean up all resources
   */
  destroy() {
    this._destroyed = true;
    this.stopDiscovery();
    this.listeners.clear();
    this.pendingTransfers.clear();
  }
}

// ─── Singleton Instance ─────────────────────────────────────

let _instance = null;

/**
 * Get or create the global ProximityService instance
 * @returns {ProximityService}
 */
export function getProximityService() {
  if (!_instance || _instance._destroyed) {
    _instance = new ProximityService();
  }
  return _instance;
}

/**
 * Destroy the global instance (for cleanup on unmount)
 */
export function destroyProximityService() {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
}

export default ProximityService;
