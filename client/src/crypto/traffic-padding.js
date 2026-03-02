/**
 * Traffic Padding — Anti-Traffic-Analysis Module
 * 
 * Prevents network observers from determining:
 * 1. Whether a message is real or fake (chaff)
 * 2. The type of content (text vs file vs image)
 * 3. The timing pattern of conversations
 * 4. Whether the user is active or idle
 * 
 * Techniques:
 * - Message padding: all messages padded to fixed bucket sizes
 * - Chaff messages: fake encrypted packets sent at random intervals
 * - Timing jitter: random delay before sending real messages
 * - Connection padding: keepalives look like real messages
 * 
 * @module crypto/traffic-padding
 */

// ─── Configuration ─────────────────────────────────────────

/**
 * @typedef {Object} PaddingConfig
 * @property {'low'|'medium'|'high'} privacyLevel - Privacy vs latency tradeoff
 * @property {boolean} chaffEnabled - Whether to send dummy traffic
 * @property {boolean} paddingEnabled - Whether to pad messages
 * @property {boolean} jitterEnabled - Whether to add timing jitter
 */

const PRIVACY_PRESETS = {
  // ── Bucket sizing rationale ──────────────────────────────
  //   ML-KEM-768 public key  = 1184 bytes  →  +5 header = 1189 B
  //   ML-KEM-768 ciphertext  = 1088 bytes  →  +5 header = 1093 B
  //   X25519 ephemeral key   =   32 bytes  →  +5 header =   37 B
  //   PQXDH init bundle      ≈ 1184+32+32  →  +5 header = 1253 B
  //
  //   The 1536-byte bucket guarantees that every PQ key-exchange
  //   message fits in a SINGLE bucket, preventing a fingerprint
  //   where a message is split across multiple smaller buckets
  //   (e.g. 256+1024 = unique ML-KEM traffic shape).
  // ──────────────────────────────────────────────────────────
  low: {
    chaffEnabled: false,
    paddingEnabled: true,
    jitterEnabled: false,
    chaffIntervalMin: 10000, // 10s
    chaffIntervalMax: 30000, // 30s
    jitterMin: 0,
    jitterMax: 50,           // 50ms max jitter
    padBuckets: [256, 1024, 1536, 4096, 16384]
  },
  medium: {
    chaffEnabled: true,
    paddingEnabled: true,
    jitterEnabled: true,
    chaffIntervalMin: 5000,  // 5s
    chaffIntervalMax: 20000, // 20s
    jitterMin: 50,
    jitterMax: 250,          // 250ms max jitter
    padBuckets: [512, 1024, 1536, 4096, 16384, 65536]
  },
  high: {
    chaffEnabled: true,
    paddingEnabled: true,
    jitterEnabled: true,
    chaffIntervalMin: 2000,  // 2s
    chaffIntervalMax: 15000, // 15s
    jitterMin: 100,
    jitterMax: 500,          // 500ms max jitter
    padBuckets: [1024, 1536, 4096, 16384, 65536] // Larger minimum
  }
};

let currentConfig = PRIVACY_PRESETS.medium;
let chaffTimer = null;
let onChaffSend = null; // Callback to actually send a chaff message

// ─── Initialization ────────────────────────────────────────

/**
 * Initialize the traffic padding system
 * 
 * @param {'low'|'medium'|'high'} privacyLevel - Privacy level
 * @param {Function} sendCallback - Function to send a message through the socket
 *   Signature: (paddedMessage: Uint8Array, isChaff: boolean) => void
 */
export function initTrafficPadding(privacyLevel, sendCallback) {
  currentConfig = PRIVACY_PRESETS[privacyLevel] || PRIVACY_PRESETS.medium;
  onChaffSend = sendCallback;
  
  if (currentConfig.chaffEnabled) {
    startChaffGenerator();
  }
  
  console.log(`🫥 Traffic padding initialized (level: ${privacyLevel})`);
  console.log(`   Chaff: ${currentConfig.chaffEnabled ? 'ON' : 'OFF'}`);
  console.log(`   Padding: ${currentConfig.paddingEnabled ? 'ON' : 'OFF'}`);
  console.log(`   Jitter: ${currentConfig.jitterEnabled ? currentConfig.jitterMin + '-' + currentConfig.jitterMax + 'ms' : 'OFF'}`);
}

/**
 * Stop the traffic padding system (call when leaving room)
 */
export function stopTrafficPadding() {
  if (chaffTimer) {
    clearTimeout(chaffTimer);
    chaffTimer = null;
  }
  onChaffSend = null;
}

/**
 * Change the privacy level at runtime
 * @param {'low'|'medium'|'high'} level 
 */
export function setPrivacyLevel(level) {
  const wasChaffEnabled = currentConfig.chaffEnabled;
  currentConfig = PRIVACY_PRESETS[level] || PRIVACY_PRESETS.medium;
  
  // Restart chaff if needed
  if (currentConfig.chaffEnabled && !wasChaffEnabled) {
    startChaffGenerator();
  } else if (!currentConfig.chaffEnabled && wasChaffEnabled) {
    if (chaffTimer) {
      clearTimeout(chaffTimer);
      chaffTimer = null;
    }
  }
}

// ─── Message Padding ───────────────────────────────────────

/**
 * CHAFF_FLAG is a magic byte prepended to indicate message type.
 * The recipient checks this to determine if a message is real or chaff.
 * 
 * 0x00 = real message
 * 0x01 = chaff (discard)
 */
const FLAG_REAL = 0x00;
const FLAG_CHAFF = 0x01;

/**
 * Pad a message to the nearest bucket size.
 * Makes all messages indistinguishable by size.
 * 
 * Format: [flag (1)] [original_length (4, big-endian)] [message] [random_padding]
 * 
 * @param {Uint8Array} message - Original message bytes
 * @returns {Uint8Array} Padded message
 */
export function padMessage(message) {
  if (!currentConfig.paddingEnabled) {
    // Just add the flag and length header
    const result = new Uint8Array(1 + 4 + message.length);
    result[0] = FLAG_REAL;
    // Store original length in big-endian
    const len = message.length;
    result[1] = (len >> 24) & 0xFF;
    result[2] = (len >> 16) & 0xFF;
    result[3] = (len >> 8) & 0xFF;
    result[4] = len & 0xFF;
    result.set(message, 5);
    return result;
  }
  
  // Find the smallest bucket that fits: flag (1) + length (4) + message
  const totalNeeded = 1 + 4 + message.length;
  const buckets = currentConfig.padBuckets;
  let targetSize = buckets[buckets.length - 1]; // Default to largest
  
  for (const bucket of buckets) {
    if (bucket >= totalNeeded) {
      targetSize = bucket;
      break;
    }
  }
  
  // If message is larger than largest bucket, round up to next multiple
  if (totalNeeded > targetSize) {
    const largestBucket = buckets[buckets.length - 1];
    targetSize = Math.ceil(totalNeeded / largestBucket) * largestBucket;
  }
  
  const padded = new Uint8Array(targetSize);
  
  // Fill with random bytes (the padding)
  crypto.getRandomValues(padded);
  
  // Write header
  padded[0] = FLAG_REAL;
  const len = message.length;
  padded[1] = (len >> 24) & 0xFF;
  padded[2] = (len >> 16) & 0xFF;
  padded[3] = (len >> 8) & 0xFF;
  padded[4] = len & 0xFF;
  
  // Write message
  padded.set(message, 5);
  
  return padded;
}

/**
 * Unpad a received message. Returns null if it's chaff.
 * 
 * @param {Uint8Array} padded - Padded message
 * @returns {Uint8Array|null} Original message, or null if chaff
 */
export function unpadMessage(padded) {
  if (padded.length < 5) {
    return null; // Invalid
  }
  
  const flag = padded[0];
  
  if (flag === FLAG_CHAFF) {
    return null; // Chaff — discard
  }
  
  if (flag !== FLAG_REAL) {
    // Unknown flag — might be a v1 message (no padding)
    return padded;
  }
  
  // Read original length
  const len = (padded[1] << 24) | (padded[2] << 16) | (padded[3] << 8) | padded[4];
  
  if (len < 0 || len > padded.length - 5) {
    return null; // Invalid length
  }
  
  return padded.slice(5, 5 + len);
}

// ─── Chaff Generator ───────────────────────────────────────

/**
 * Start sending chaff (dummy) messages at random intervals.
 * These are indistinguishable from real messages to a network observer.
 */
function startChaffGenerator() {
  if (chaffTimer) {
    clearTimeout(chaffTimer);
  }
  
  function scheduleNext() {
    const delay = randomInt(
      currentConfig.chaffIntervalMin,
      currentConfig.chaffIntervalMax
    );
    
    chaffTimer = setTimeout(() => {
      sendChaff();
      scheduleNext();
    }, delay);
  }
  
  scheduleNext();
}

/**
 * Generate and send a chaff message.
 * The chaff looks identical to a real padded message from the outside.
 */
function sendChaff() {
  if (!onChaffSend) return;
  
  // Pick a random bucket size
  const buckets = currentConfig.padBuckets;
  const targetSize = buckets[randomInt(0, buckets.length - 1)];
  
  const chaff = new Uint8Array(targetSize);
  crypto.getRandomValues(chaff);
  
  // Mark as chaff (the recipient will discard it)
  chaff[0] = FLAG_CHAFF;
  
  // Send it through the normal channel
  onChaffSend(chaff, true);
}

// ─── Timing Jitter ─────────────────────────────────────────

/**
 * Add random delay before sending a message.
 * Prevents timing correlation between sender and receiver.
 * 
 * @param {Function} sendFn - The actual send function
 * @returns {Promise<void>} Resolves when the message is sent
 */
export async function withJitter(sendFn) {
  if (!currentConfig.jitterEnabled) {
    return sendFn();
  }
  
  const delay = randomInt(currentConfig.jitterMin, currentConfig.jitterMax);
  
  return new Promise((resolve) => {
    setTimeout(async () => {
      await sendFn();
      resolve();
    }, delay);
  });
}

// ─── Statistics ────────────────────────────────────────────

let stats = {
  realMessagesSent: 0,
  chaffMessagesSent: 0,
  totalBytesPadded: 0,
  totalBytesOriginal: 0
};

/**
 * Record a sent message for statistics
 * @param {number} originalSize - Original message size
 * @param {number} paddedSize - Padded message size
 * @param {boolean} isChaff - Whether this was chaff
 */
export function recordSend(originalSize, paddedSize, isChaff) {
  if (isChaff) {
    stats.chaffMessagesSent++;
  } else {
    stats.realMessagesSent++;
  }
  stats.totalBytesOriginal += originalSize;
  stats.totalBytesPadded += paddedSize;
}

/**
 * Get padding statistics
 * @returns {Object}
 */
export function getPaddingStats() {
  return {
    ...stats,
    overheadRatio: stats.totalBytesOriginal > 0
      ? (stats.totalBytesPadded / stats.totalBytesOriginal).toFixed(2)
      : 0,
    chaffRatio: stats.realMessagesSent + stats.chaffMessagesSent > 0
      ? (stats.chaffMessagesSent / (stats.realMessagesSent + stats.chaffMessagesSent) * 100).toFixed(1) + '%'
      : '0%'
  };
}

/**
 * Reset statistics
 */
export function resetPaddingStats() {
  stats = {
    realMessagesSent: 0,
    chaffMessagesSent: 0,
    totalBytesPadded: 0,
    totalBytesOriginal: 0
  };
}

// ─── Utility ───────────────────────────────────────────────

function randomInt(min, max) {
  const range = max - min + 1;
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return min + (array[0] % range);
}
