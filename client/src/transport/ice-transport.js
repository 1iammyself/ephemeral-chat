/**
 * ICE Transport — P2P Hole Punching for Direct File Transfers
 * 
 * Uses WebRTC's ICE framework (STUN/TURN) to establish direct
 * peer-to-peer data channels, bypassing the e2ecp relay server.
 * 
 * Priority order:
 *   1. Direct LAN (host candidates) — fastest, most private
 *   2. STUN hole-punched (srflx candidates) — fast, server sees nothing
 *   3. TURN relay (relay candidates) — encrypted, server sees metadata
 *   4. e2ecp relay (fallback) — existing relay system
 * 
 * @module transport/ice-transport
 */

import socketManager from '../socket.js';

// ─── Configuration ─────────────────────────────────────────

const DEFAULT_ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' }
  ],
  // TURN servers (add credentials via environment)
  // { urls: 'turn:turn.example.com:3478', username: '', credential: '' }
};

// Maximum time to wait for ICE connectivity (10 seconds)
const ICE_TIMEOUT_MS = 10000;

// ─── ICE Transport ─────────────────────────────────────────

export class ICETransport {
  constructor(options = {}) {
    this.config = { ...DEFAULT_ICE_CONFIG, ...options };
    this.peerConnections = new Map(); // peerId → RTCPeerConnection
    this.dataChannels = new Map();    // peerId → RTCDataChannel
    this.pendingTransfers = new Map(); // transferId → transfer state
    
    this.onDataReceived = null;      // Callback for received data
    this.onConnectionEstablished = null;
    this.onConnectionFailed = null;
    this.onProgress = null;
    
    this._setupSignaling();
  }
  
  /**
   * Set up Socket.IO signaling for ICE candidate exchange
   */
  _setupSignaling() {
    // Listen for ICE events through the socket manager
    socketManager.on('ice-offer', async (data) => {
      await this._handleOffer(data);
    });
    
    socketManager.on('ice-answer', async (data) => {
      await this._handleAnswer(data);
    });
    
    socketManager.on('ice-candidate', async (data) => {
      await this._handleCandidate(data);
    });
  }
  
  /**
   * Attempt to establish a P2P data channel with a peer.
   * Returns a promise that resolves with the data channel,
   * or rejects if P2P is not possible (triggering relay fallback).
   * 
   * @param {string} peerId - Socket ID of the peer
   * @param {string} roomCode - Room code for signaling
   * @returns {Promise<RTCDataChannel>} Data channel for direct transfer
   */
  async connectToPeer(peerId, roomCode) {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        this._cleanup(peerId);
        reject(new Error('ICE connection timeout'));
      }, ICE_TIMEOUT_MS);
      
      try {
        const pc = new RTCPeerConnection(this.config);
        this.peerConnections.set(peerId, pc);
        
        // Create data channel for file transfer
        const dc = pc.createDataChannel('file-transfer', {
          ordered: true,
          maxRetransmits: 5
        });
        
        dc.binaryType = 'arraybuffer';
        
        dc.onopen = () => {
          clearTimeout(timeout);
          this.dataChannels.set(peerId, dc);
          if (this.onConnectionEstablished) {
            this.onConnectionEstablished(peerId, this._getConnectionType(pc));
          }
          resolve(dc);
        };
        
        dc.onerror = (e) => {
        };
        
        dc.onclose = () => {
          this.dataChannels.delete(peerId);
        };
        
        // ICE candidate handling
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socketManager.emit('ice-candidate', {
              roomCode,
              to: peerId,
              candidate: event.candidate
            });
          }
        };
        
        pc.oniceconnectionstatechange = () => {
          const state = pc.iceConnectionState;
          
          if (state === 'failed') {
            clearTimeout(timeout);
            this._cleanup(peerId);
            if (this.onConnectionFailed) {
              this.onConnectionFailed(peerId, 'ICE negotiation failed');
            }
            reject(new Error('ICE connection failed'));
          }
        };
        
        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        socketManager.emit('ice-offer', {
          roomCode,
          to: peerId,
          offer: pc.localDescription
        });
        
      } catch (e) {
        clearTimeout(timeout);
        this._cleanup(peerId);
        reject(e);
      }
    });
  }
  
  /**
   * Handle incoming ICE offer (we're the responder)
   */
  async _handleOffer(data) {
    const { from: peerId, offer, roomCode } = data;
    
    try {
      const pc = new RTCPeerConnection(this.config);
      this.peerConnections.set(peerId, pc);
      
      // Handle incoming data channel
      pc.ondatachannel = (event) => {
        const dc = event.channel;
        dc.binaryType = 'arraybuffer';
        
        dc.onopen = () => {
          this.dataChannels.set(peerId, dc);
          if (this.onConnectionEstablished) {
            this.onConnectionEstablished(peerId, this._getConnectionType(pc));
          }
        };
        
        dc.onmessage = (event) => {
          if (this.onDataReceived) {
            this.onDataReceived(peerId, event.data);
          }
        };
        
        dc.onclose = () => {
          this.dataChannels.delete(peerId);
        };
      };
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketManager.emit('ice-candidate', {
            roomCode,
            to: peerId,
            candidate: event.candidate
          });
        }
      };
      
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socketManager.emit('ice-answer', {
        roomCode,
        to: peerId,
        answer: pc.localDescription
      });
      
    } catch (e) {
    }
  }
  
  /**
   * Handle ICE answer
   */
  async _handleAnswer(data) {
    const { from: peerId, answer } = data;
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      await pc.setRemoteDescription(answer);
    }
  }
  
  /**
   * Handle ICE candidate
   */
  async _handleCandidate(data) {
    const { from: peerId, candidate } = data;
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      await pc.addIceCandidate(candidate);
    }
  }
  
  /**
   * Send data through the P2P data channel
   * @param {string} peerId 
   * @param {ArrayBuffer|Uint8Array} data 
   * @returns {boolean} true if sent via P2P, false if no channel available
   */
  send(peerId, data) {
    const dc = this.dataChannels.get(peerId);
    if (!dc || dc.readyState !== 'open') {
      return false;
    }
    
    dc.send(data);
    return true;
  }
  
  /**
   * Send a file through the P2P channel with chunking and progress
   * @param {string} peerId 
   * @param {File|Blob} file 
   * @param {Function} onProgress - Progress callback (0-1)
   * @returns {Promise<boolean>} true if sent via P2P
   */
  async sendFile(peerId, file, onProgress) {
    const dc = this.dataChannels.get(peerId);
    if (!dc || dc.readyState !== 'open') {
      return false;
    }
    
    const CHUNK_SIZE = 64 * 1024; // 64KB chunks (WebRTC-friendly)
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    // Send metadata first
    const metadata = JSON.stringify({
      type: 'file-metadata',
      name: file.name,
      size: file.size,
      mimeType: file.type,
      totalChunks
    });
    dc.send(metadata);
    
    // Send chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = await file.slice(start, end).arrayBuffer();
      
      // Wait for buffer to drain if needed
      while (dc.bufferedAmount > 1024 * 1024) {
        await new Promise(r => setTimeout(r, 50));
      }
      
      dc.send(chunk);
      
      if (onProgress) {
        onProgress((i + 1) / totalChunks);
      }
    }
    
    // Send completion signal
    dc.send(JSON.stringify({ type: 'file-complete' }));
    
    return true;
  }
  
  /**
   * Determine the connection type from ICE stats
   * @param {RTCPeerConnection} pc 
   * @returns {string} 'host'|'srflx'|'relay'|'unknown'
   */
  _getConnectionType(pc) {
    try {
      const stats = pc.getStats();
      // This is async but we return what we can synchronously
      // In practice, check after connection is established
      return 'unknown'; // Will be updated by stats check
    } catch {
      return 'unknown';
    }
  }
  
  /**
   * Get detailed connection info for a peer (async, uses RTCStats)
   * @param {string} peerId 
   * @returns {Promise<Object>} Connection details
   */
  async getConnectionInfo(peerId) {
    const pc = this.peerConnections.get(peerId);
    if (!pc) return null;
    
    const stats = await pc.getStats();
    let candidateType = 'unknown';
    let protocol = 'unknown';
    let localAddress = '';
    let remoteAddress = '';
    
    stats.forEach((report) => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        // Find the local candidate
        stats.forEach((candidate) => {
          if (candidate.id === report.localCandidateId) {
            candidateType = candidate.candidateType; // 'host', 'srflx', 'relay'
            protocol = candidate.protocol;
            localAddress = candidate.address;
          }
          if (candidate.id === report.remoteCandidateId) {
            remoteAddress = candidate.address;
          }
        });
      }
    });
    
    return {
      peerId,
      connectionType: candidateType,
      protocol,
      localAddress,
      remoteAddress,
      isP2P: candidateType === 'host' || candidateType === 'srflx',
      isRelay: candidateType === 'relay',
      privacyLevel: candidateType === 'host' ? 'LAN (most private)' :
                    candidateType === 'srflx' ? 'P2P (private, STUN-assisted)' :
                    candidateType === 'relay' ? 'TURN relay (metadata visible)' :
                    'Unknown'
    };
  }
  
  /**
   * Close a connection to a peer
   * @param {string} peerId 
   */
  _cleanup(peerId) {
    const dc = this.dataChannels.get(peerId);
    if (dc) {
      dc.close();
      this.dataChannels.delete(peerId);
    }
    
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }
  }
  
  /**
   * Close all connections
   */
  destroy() {
    for (const peerId of this.peerConnections.keys()) {
      this._cleanup(peerId);
    }
  }
  
  /**
   * Check if we have a P2P connection to a peer
   * @param {string} peerId 
   * @returns {boolean}
   */
  hasP2PConnection(peerId) {
    const dc = this.dataChannels.get(peerId);
    return dc && dc.readyState === 'open';
  }
}

export default ICETransport;
