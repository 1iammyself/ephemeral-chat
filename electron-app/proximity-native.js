/**
 * Electron Native Proximity Bridge
 * 
 * Loads the Rust QUIC native addon (proximity-node) when available,
 * falling back to WebRTC-based proximity when it's not.
 * 
 * The native addon provides:
 * - Direct QUIC connections (no signaling server needed on LAN)
 * - mDNS peer discovery
 * - Multi-peer swarm mesh for 3+ device transfers
 * - Ultra-high throughput via parallel QUIC streams
 */

const path = require('path');
const os = require('os');

let nativeAddon = null;
let nativeAvailable = false;

// Try to load the native Rust addon
try {
  // In production, the native addon is in the resources directory
  const addonPath = process.env.NODE_ENV === 'development'
    ? path.join(__dirname, '..', 'proximity-core', 'bindings', 'node')
    : path.join(process.resourcesPath, 'proximity-node');
  
  nativeAddon = require(addonPath);
  nativeAvailable = true;
  console.log('[ProximityNative] Rust QUIC addon loaded successfully');
} catch (err) {
  console.log('[ProximityNative] Native addon not available, will use WebRTC fallback:', err.message);
}

// Event callbacks registered by the renderer
const eventCallbacks = new Map();
let engineStarted = false;

/**
 * Initialize the native proximity engine
 */
async function initEngine(options = {}) {
  if (!nativeAvailable) {
    return { native: false, reason: 'addon not available' };
  }

  try {
    nativeAddon.initLogging();

    await nativeAddon.createEngine({
      nickname: options.nickname || os.hostname(),
      platform: 'electron',
      deviceType: 'desktop',
      bindPort: options.port || 0,
      downloadDir: options.downloadDir || path.join(os.homedir(), 'Downloads'),
      swarmEnabled: options.swarmEnabled !== false,
    });

    // Register the event callback
    nativeAddon.onEvent((jsonStr) => {
      try {
        const event = JSON.parse(jsonStr);
        // Forward to all registered callbacks
        for (const [, callback] of eventCallbacks) {
          callback(event);
        }
      } catch (e) {
        console.error('[ProximityNative] Failed to parse event:', e);
      }
    });

    return { native: true };
  } catch (err) {
    console.error('[ProximityNative] Failed to init engine:', err);
    return { native: false, reason: err.message };
  }
}

/**
 * Start the engine (bind port, start mDNS, accept connections)
 */
async function startEngine() {
  if (!nativeAvailable) return null;
  try {
    const addr = await nativeAddon.startEngine();
    engineStarted = true;
    console.log('[ProximityNative] Engine started on', addr);
    return addr;
  } catch (err) {
    console.error('[ProximityNative] Failed to start:', err);
    return null;
  }
}

/**
 * Stop the engine
 */
async function stopEngine() {
  if (!nativeAvailable || !engineStarted) return;
  try {
    await nativeAddon.stopEngine();
    engineStarted = false;
  } catch (err) {
    console.error('[ProximityNative] Failed to stop:', err);
  }
}

/**
 * Register an event listener
 */
function onEvent(id, callback) {
  eventCallbacks.set(id, callback);
}

/**
 * Remove an event listener
 */
function offEvent(id) {
  eventCallbacks.delete(id);
}

/**
 * Get discovered peers via mDNS
 */
async function getDiscoveredPeers() {
  if (!nativeAvailable || !engineStarted) return [];
  try {
    return await nativeAddon.getDiscoveredPeers();
  } catch (err) {
    console.error('[ProximityNative] getDiscoveredPeers error:', err);
    return [];
  }
}

/**
 * Connect to a peer by address (ip:port)
 */
async function connectToPeer(address) {
  if (!nativeAvailable || !engineStarted) return null;
  try {
    return await nativeAddon.connectToPeer(address);
  } catch (err) {
    console.error('[ProximityNative] connectToPeer error:', err);
    return null;
  }
}

/**
 * Get pairing code for a connection
 */
async function getPairingCode(peerId) {
  if (!nativeAvailable || !engineStarted) return null;
  try {
    return await nativeAddon.getPairingCode(peerId);
  } catch (err) {
    return null;
  }
}

/**
 * Send a file via QUIC
 */
async function sendFile(peerId, filePath) {
  if (!nativeAvailable || !engineStarted) return null;
  try {
    return await nativeAddon.sendFile(peerId, filePath);
  } catch (err) {
    console.error('[ProximityNative] sendFile error:', err);
    return null;
  }
}

/**
 * Accept an incoming transfer
 */
async function acceptTransfer(transferId) {
  if (!nativeAvailable || !engineStarted) return false;
  try {
    await nativeAddon.acceptTransfer(transferId);
    return true;
  } catch (err) {
    console.error('[ProximityNative] acceptTransfer error:', err);
    return false;
  }
}

/**
 * Reject an incoming transfer
 */
async function rejectTransfer(transferId) {
  if (!nativeAvailable || !engineStarted) return false;
  try {
    await nativeAddon.rejectTransfer(transferId);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Cancel an active transfer
 */
async function cancelTransfer(transferId) {
  if (!nativeAvailable || !engineStarted) return false;
  try {
    await nativeAddon.cancelTransfer(transferId);
    return true;
  } catch (err) {
    return false;
  }
}

// ─── Swarm API ─────────────────────────────────────────────

/**
 * Create a new swarm (this device is the first member)
 */
async function createSwarm() {
  if (!nativeAvailable || !engineStarted) return null;
  try {
    return await nativeAddon.createSwarm();
  } catch (err) {
    console.error('[ProximityNative] createSwarm error:', err);
    return null;
  }
}

/**
 * Join an existing swarm
 */
async function joinSwarm(swarmId, knownPeers) {
  if (!nativeAvailable || !engineStarted) return false;
  try {
    await nativeAddon.joinSwarm(swarmId, knownPeers);
    return true;
  } catch (err) {
    console.error('[ProximityNative] joinSwarm error:', err);
    return false;
  }
}

/**
 * Leave the current swarm
 */
async function leaveSwarm() {
  if (!nativeAvailable || !engineStarted) return false;
  try {
    await nativeAddon.leaveSwarm();
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Get swarm info
 */
async function getSwarmInfo() {
  if (!nativeAvailable || !engineStarted) return null;
  try {
    return await nativeAddon.getSwarmInfo();
  } catch (err) {
    return null;
  }
}

/**
 * Calculate multi-path routes in swarm
 */
async function calculateSwarmRoute(source, dest, parallelPaths = 2) {
  if (!nativeAvailable || !engineStarted) return [];
  try {
    return await nativeAddon.calculateSwarmRoute(source, dest, parallelPaths);
  } catch (err) {
    return [];
  }
}

/**
 * Get the device ID (from native engine or fallback)
 */
function getDeviceId() {
  if (nativeAvailable) {
    try {
      return nativeAddon.getDeviceId();
    } catch (_) {}
  }
  // Fallback: generate from system info
  const crypto = require('crypto');
  const hostname = os.hostname();
  const platform = process.platform;
  const username = os.userInfo().username;
  return crypto.createHash('sha256')
    .update(`${hostname}-${platform}-${username}`)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Check if native engine is available
 */
function isNativeAvailable() {
  return nativeAvailable;
}

/**
 * Check if engine is running
 */
function isEngineRunning() {
  return engineStarted;
}

module.exports = {
  // Core
  initEngine,
  startEngine,
  stopEngine,
  isNativeAvailable,
  isEngineRunning,
  
  // Events
  onEvent,
  offEvent,
  
  // Discovery
  getDiscoveredPeers,
  getDeviceId,
  
  // Connection
  connectToPeer,
  getPairingCode,
  
  // Transfer
  sendFile,
  acceptTransfer,
  rejectTransfer,
  cancelTransfer,
  
  // Swarm
  createSwarm,
  joinSwarm,
  leaveSwarm,
  getSwarmInfo,
  calculateSwarmRoute,
};
