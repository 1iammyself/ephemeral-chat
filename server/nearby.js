/**
 * Nearby Transfer — Socket.IO Signaling Server
 * 
 * Handles peer discovery and WebRTC signaling for proximity transfers.
 * This namespace (/nearby) operates independently from the main chat namespace.
 * 
 * Responsibilities:
 * 1. Peer announcement and heartbeat
 * 2. Peer list management with automatic cleanup
 * 3. WebRTC offer/answer/ICE candidate relay
 * 4. Transfer request signaling (before data channel is established)
 */

const { logger } = require('./utils');

// Active nearby peers: Map<socketId, PeerInfo>
const nearbyPeers = new Map();

// Device ID → socket ID mapping for targeted messaging
const deviceToSocket = new Map();

// Cleanup interval for stale peers (15 seconds)
const STALE_PEER_TIMEOUT = 15000;
let cleanupInterval = null;

/**
 * Set up the /nearby Socket.IO namespace
 * @param {import('socket.io').Server} io - The Socket.IO server instance
 */
function setupNearbyNamespace(io) {
  const nearbyNs = io.of('/nearby');

  nearbyNs.on('connection', (socket) => {
    const { deviceId, nickname, platform, deviceType } = socket.handshake.query;

    if (!deviceId || !nickname) {
      logger.warn('[Nearby] Connection rejected: missing deviceId or nickname');
      socket.disconnect(true);
      return;
    }

    logger.info(`[Nearby] Peer connected: ${nickname} (${deviceId}) [${platform}/${deviceType}]`);

    // Extract /24 subnet from peer IP for proximity filtering
    const rawIp = socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || socket.handshake.address?.replace('::ffff:', '') || '';
    const subnet = getSubnet24(rawIp);

    // Register this peer
    const peerInfo = {
      socketId: socket.id,
      deviceId,
      nickname: sanitize(nickname),
      platform: platform || 'web',
      deviceType: deviceType || 'unknown',
      ip: rawIp,
      subnet,
      joinedAt: Date.now(),
      lastHeartbeat: Date.now()
    };

    // Remove old socket for this device if it reconnected
    const oldSocketId = deviceToSocket.get(deviceId);
    if (oldSocketId && oldSocketId !== socket.id) {
      nearbyPeers.delete(oldSocketId);
    }

    nearbyPeers.set(socket.id, peerInfo);
    deviceToSocket.set(deviceId, socket.id);

    // Send existing peers list — only peers on the same /24 subnet (proximity)
    const existingPeers = [];
    for (const [, peer] of nearbyPeers) {
      if (peer.deviceId !== deviceId && isSameSubnet(subnet, peer.subnet)) {
        existingPeers.push({
          deviceId: peer.deviceId,
          nickname: peer.nickname,
          platform: peer.platform,
          deviceType: peer.deviceType
        });
      }
    }
    socket.emit('peers-list', existingPeers);

    // ─── Announcement ───────────────────────────────────────

    socket.on('announce', (data) => {
      const peer = nearbyPeers.get(socket.id);
      if (!peer) return;

      // Update peer info
      peer.nickname = sanitize(data.nickname || peer.nickname);
      peer.platform = data.platform || peer.platform;
      peer.deviceType = data.deviceType || peer.deviceType;
      peer.lastHeartbeat = Date.now();

      // Broadcast only to peers on the same /24 subnet
      for (const [sid, otherPeer] of nearbyPeers) {
        if (otherPeer.deviceId !== peer.deviceId && isSameSubnet(peer.subnet, otherPeer.subnet)) {
          nearbyNs.to(sid).emit('peer-announced', {
            deviceId: peer.deviceId,
            nickname: peer.nickname,
            platform: peer.platform,
            deviceType: peer.deviceType
          });
        }
      }
    });

    // ─── Heartbeat ──────────────────────────────────────────

    socket.on('heartbeat', (data) => {
      const peer = nearbyPeers.get(socket.id);
      if (!peer) return;
      peer.lastHeartbeat = Date.now();
      // Only broadcast to same-subnet peers (matches announce handler filtering)
      for (const [sid, otherPeer] of nearbyPeers) {
        if (otherPeer.deviceId !== peer.deviceId && isSameSubnet(peer.subnet, otherPeer.subnet)) {
          nearbyNs.to(sid).emit('peer-heartbeat', {
            deviceId: peer.deviceId,
            timestamp: data.timestamp
          });
        }
      }
    });

    // ─── WebRTC Signaling ───────────────────────────────────

    socket.on('rtc-offer', ({ to, offer }) => {
      const targetSocketId = deviceToSocket.get(to);
      if (targetSocketId) {
        nearbyNs.to(targetSocketId).emit('rtc-offer', {
          from: deviceId,
          offer
        });
      }
    });

    socket.on('rtc-answer', ({ to, answer }) => {
      const targetSocketId = deviceToSocket.get(to);
      if (targetSocketId) {
        nearbyNs.to(targetSocketId).emit('rtc-answer', {
          from: deviceId,
          answer
        });
      }
    });

    socket.on('rtc-ice-candidate', ({ to, candidate }) => {
      const targetSocketId = deviceToSocket.get(to);
      if (targetSocketId) {
        nearbyNs.to(targetSocketId).emit('rtc-ice-candidate', {
          from: deviceId,
          candidate
        });
      }
    });

    // ─── Transfer Signaling (before data channel) ───────────

    socket.on('transfer-request', ({ to, metadata }) => {
      const targetSocketId = deviceToSocket.get(to);
      if (targetSocketId) {
        nearbyNs.to(targetSocketId).emit('transfer-request', {
          from: deviceId,
          metadata
        });
      }
    });

    socket.on('transfer-accepted', ({ to, transferId }) => {
      const targetSocketId = deviceToSocket.get(to);
      if (targetSocketId) {
        nearbyNs.to(targetSocketId).emit('transfer-accepted', {
          from: deviceId,
          transferId
        });
      }
    });

    socket.on('transfer-rejected', ({ to, transferId, reason }) => {
      const targetSocketId = deviceToSocket.get(to);
      if (targetSocketId) {
        nearbyNs.to(targetSocketId).emit('transfer-rejected', {
          from: deviceId,
          transferId,
          reason
        });
      }
    });

    // ─── Disconnect ─────────────────────────────────────────

    socket.on('disconnect', () => {
      const peer = nearbyPeers.get(socket.id);
      if (peer) {
        logger.info(`[Nearby] Peer disconnected: ${peer.nickname} (${peer.deviceId})`);
        nearbyPeers.delete(socket.id);
        deviceToSocket.delete(peer.deviceId);

        // Only notify same-subnet peers (prevents device ID leaking across subnets)
        for (const [sid, otherPeer] of nearbyPeers) {
          if (isSameSubnet(peer.subnet, otherPeer.subnet)) {
            nearbyNs.to(sid).emit('peer-left', { deviceId: peer.deviceId });
          }
        }
      }
    });
  });

  // Start stale peer cleanup
  if (!cleanupInterval) {
    cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [socketId, peer] of nearbyPeers) {
        if (now - peer.lastHeartbeat > STALE_PEER_TIMEOUT) {
          logger.info(`[Nearby] Removing stale peer: ${peer.nickname} (${peer.deviceId})`);
          nearbyPeers.delete(socketId);
          deviceToSocket.delete(peer.deviceId);
          nearbyNs.emit('peer-left', { deviceId: peer.deviceId });
        }
      }
    }, STALE_PEER_TIMEOUT / 2);
  }

  logger.info('[Nearby] 📡 Nearby Transfer signaling namespace ready');
  return nearbyNs;
}

/**
 * Get count of active nearby peers
 */
function getNearbyPeerCount() {
  return nearbyPeers.size;
}

/**
 * Sanitize input string
 */
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>&"'/\\]/g, '').substring(0, 50);
}

/**
 * Extract the /24 subnet prefix from an IPv4 address.
 * Returns empty string for IPv6 or unparseable addresses (no filtering applied).
 * @param {string} ip
 * @returns {string} e.g. "192.168.1" or ""
 */
function getSubnet24(ip) {
  if (!ip) return '';
  const parts = ip.split('.');
  if (parts.length !== 4) return ''; // IPv6 or invalid — skip subnet filter
  return parts.slice(0, 3).join('.');
}

/**
 * Two peers are "nearby" if they share the same /24 subnet.
 * If either subnet is empty (IPv6 or localhost), allow the match so no peers
 * are accidentally excluded in dev/test environments.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function isSameSubnet(a, b) {
  if (!a || !b) return true; // Can't determine → allow
  return a === b;
}

module.exports = { setupNearbyNamespace, getNearbyPeerCount };
