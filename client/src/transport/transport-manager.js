/**
 * Transport Manager — Orchestrates P2P vs Relay Transfer
 * 
 * Priority-based transport selection:
 *   1. ICE P2P (direct LAN / STUN hole-punch) — no server metadata
 *   2. e2ecp relay — existing server-relayed transfer
 *   3. Socket.IO fallback — last resort for small messages
 * 
 * Automatically falls back through the chain if higher-priority
 * transports are unavailable or fail mid-transfer.
 * 
 * @module transport/transport-manager
 */

import { ICETransport } from './ice-transport.js';
import { secureFetch } from '../utils/secure-fetch.js';

// ─── Transport types ───────────────────────────────────────

export const TRANSPORT = {
  P2P_LAN: 'p2p-lan',
  P2P_STUN: 'p2p-stun',
  P2P_TURN: 'p2p-turn',
  RELAY: 'e2ecp-relay',
  SOCKET: 'socket-io',
  UNKNOWN: 'unknown'
};

// ─── Transport Manager ─────────────────────────────────────

export class TransportManager {
  constructor(options = {}) {
    this.ice = new ICETransport(options.iceConfig);
    this.socketManager = options.socketManager || null;
    this.relayUrl = options.relayUrl || null;
    
    // Connection state per peer
    this.peerTransports = new Map(); // peerId → { type, channel|null }
    
    // Event callbacks
    this.onTransportSelected = null;
    this.onFileReceived = null;
    this.onProgress = null;
    this.onError = null;
    
    this._setupICECallbacks();
  }
  
  _setupICECallbacks() {
    this.ice.onConnectionEstablished = (peerId, type) => {
      const transport = type === 'host' ? TRANSPORT.P2P_LAN :
                        type === 'srflx' ? TRANSPORT.P2P_STUN :
                        type === 'relay' ? TRANSPORT.P2P_TURN :
                        TRANSPORT.UNKNOWN;
      
      this.peerTransports.set(peerId, { type: transport });
      
      if (this.onTransportSelected) {
        this.onTransportSelected(peerId, transport);
      }
    };
    
    this.ice.onConnectionFailed = (peerId, reason) => {
      this.peerTransports.set(peerId, { type: TRANSPORT.RELAY });
      
      if (this.onTransportSelected) {
        this.onTransportSelected(peerId, TRANSPORT.RELAY);
      }
    };
    
    this.ice.onDataReceived = (peerId, data) => {
      this._handleIncomingData(peerId, data);
    };
  }
  
  /**
   * Establish best available transport to a peer
   * @param {string} peerId - Socket ID of the peer
   * @param {string} roomCode - Room code for signaling
   * @returns {Promise<string>} Transport type that was established
   */
  async connect(peerId, roomCode) {
    // Try P2P first
    try {
      await this.ice.connectToPeer(peerId, roomCode);
      // Connection type will be updated via callback
      const info = await this.ice.getConnectionInfo(peerId);
      
      const transport = info?.connectionType === 'host' ? TRANSPORT.P2P_LAN :
                        info?.connectionType === 'srflx' ? TRANSPORT.P2P_STUN :
                        info?.connectionType === 'relay' ? TRANSPORT.P2P_TURN :
                        TRANSPORT.UNKNOWN;
      
      this.peerTransports.set(peerId, { type: transport });
      return transport;
      
    } catch (e) {
      this.peerTransports.set(peerId, { type: TRANSPORT.RELAY });
      return TRANSPORT.RELAY;
    }
  }
  
  /**
   * Send a file to a peer through the best available transport
   * @param {string} peerId 
   * @param {File|Blob} file 
   * @param {Object} encryptionMeta - Pre-encryption metadata
   * @returns {Promise<{success: boolean, transport: string}>}
   */
  async sendFile(peerId, file, encryptionMeta = {}) {
    const transport = this.peerTransports.get(peerId)?.type || TRANSPORT.RELAY;
    
    // Attempt P2P if available
    if (transport !== TRANSPORT.RELAY && transport !== TRANSPORT.SOCKET) {
      try {
        const sent = await this.ice.sendFile(peerId, file, (progress) => {
          if (this.onProgress) this.onProgress(peerId, progress);
        });
        
        if (sent) {
          return { success: true, transport };
        }
      } catch (e) {
      }
    }
    
    // Fallback: e2ecp relay
    if (this.relayUrl) {
      try {
        const success = await this._sendViaRelay(peerId, file, encryptionMeta);
        return { success, transport: TRANSPORT.RELAY };
      } catch (e) {
      }
    }
    
    // Last resort: Socket.IO (only for small data)
    if (this.socketManager && file.size < 256 * 1024) {
      try {
        const buffer = await file.arrayBuffer();
        this.socketManager.emit('file-transfer', {
          to: peerId,
          data: buffer,
          name: file.name,
          type: file.type
        });
        return { success: true, transport: TRANSPORT.SOCKET };
      } catch (e) {
      }
    }
    
    return { success: false, transport: 'none' };
  }
  
  /**
   * Send a chat message to a peer, choosing transport
   * @param {string} peerId 
   * @param {ArrayBuffer} encryptedData - Already-encrypted message
   * @returns {{success: boolean, transport: string}}
   */
  sendMessage(peerId, encryptedData) {
    // For chat messages, prefer P2P if available
    if (this.ice.hasP2PConnection(peerId)) {
      const sent = this.ice.send(peerId, encryptedData);
      if (sent) {
        const transport = this.peerTransports.get(peerId)?.type || TRANSPORT.UNKNOWN;
        return { success: true, transport };
      }
    }
    
    // Fall back to Socket.IO for chat messages (relay is for files)
    return { success: false, transport: TRANSPORT.SOCKET };
  }
  
  /**
   * Send file via e2ecp relay
   * @private
   */
  async _sendViaRelay(peerId, file, meta) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('to', peerId);
    if (meta) {
      formData.append('meta', JSON.stringify(meta));
    }
    
    const response = await secureFetch(`${this.relayUrl}/transfer`, {
      method: 'POST',
      body: formData
    });
    
    return response.ok;
  }
  
  /**
   * Handle incoming P2P data (file chunks or messages)
   * @private
   */
  _handleIncomingData(peerId, data) {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'file-metadata') {
          this._startReceivingFile(peerId, msg);
        } else if (msg.type === 'file-complete') {
          this._completeFileReceive(peerId);
        }
      } catch {
        // Not JSON, treat as text message
        if (this.onFileReceived) {
          this.onFileReceived(peerId, data);
        }
      }
    } else {
      // Binary chunk
      this._receiveChunk(peerId, data);
    }
  }
  
  /**
   * Start receiving a file from a peer
   * @private
   */
  _startReceivingFile(peerId, metadata) {
    this.ice.pendingTransfers.set(peerId, {
      name: metadata.name,
      size: metadata.size,
      mimeType: metadata.mimeType,
      totalChunks: metadata.totalChunks,
      receivedChunks: [],
      receivedSize: 0
    });
  }
  
  /**
   * Handle a binary chunk
   * @private
   */
  _receiveChunk(peerId, data) {
    const transfer = this.ice.pendingTransfers.get(peerId);
    if (!transfer) return;
    
    transfer.receivedChunks.push(data);
    transfer.receivedSize += data.byteLength;
    
    if (this.onProgress) {
      this.onProgress(peerId, transfer.receivedSize / transfer.size);
    }
  }
  
  /**
   * Assemble received chunks into a Blob
   * @private
   */
  _completeFileReceive(peerId) {
    const transfer = this.ice.pendingTransfers.get(peerId);
    if (!transfer) return;
    
    const blob = new Blob(transfer.receivedChunks, { type: transfer.mimeType });
    
    if (this.onFileReceived) {
      this.onFileReceived(peerId, {
        name: transfer.name,
        size: transfer.size,
        mimeType: transfer.mimeType,
        blob,
        transport: this.peerTransports.get(peerId)?.type || TRANSPORT.UNKNOWN
      });
    }
    
    this.ice.pendingTransfers.delete(peerId);
  }
  
  /**
   * Get current transport info for a peer
   * @param {string} peerId 
   * @returns {Promise<Object>}
   */
  async getTransportInfo(peerId) {
    const transport = this.peerTransports.get(peerId);
    if (!transport) {
      return { type: TRANSPORT.UNKNOWN, isP2P: false };
    }
    
    const isP2P = transport.type === TRANSPORT.P2P_LAN || 
                  transport.type === TRANSPORT.P2P_STUN;
    
    let details = null;
    if (isP2P) {
      details = await this.ice.getConnectionInfo(peerId);
    }
    
    return {
      type: transport.type,
      isP2P,
      privacyLevel: isP2P ? 'high' : transport.type === TRANSPORT.P2P_TURN ? 'medium' : 'low',
      details
    };
  }
  
  /**
   * Get all connected peers and their transport types
   * @returns {Array<{peerId: string, transport: string}>}
   */
  getConnectedPeers() {
    const peers = [];
    for (const [peerId, info] of this.peerTransports) {
      peers.push({ peerId, transport: info.type });
    }
    return peers;
  }
  
  /**
   * Disconnect from a peer
   * @param {string} peerId 
   */
  disconnect(peerId) {
    this.ice._cleanup(peerId);
    this.peerTransports.delete(peerId);
  }
  
  /**
   * Destroy all connections
   */
  destroy() {
    this.ice.destroy();
    this.peerTransports.clear();
  }
}

export default TransportManager;
