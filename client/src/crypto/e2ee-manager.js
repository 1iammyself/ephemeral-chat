/**
 * e2ee-manager.js — Central E2EE orchestrator
 *
 * Wires together PQXDH key exchange + Double Ratchet (1:1 rooms) and
 * Megolm-style sender keys (group rooms) into a unified encrypt/decrypt API.
 *
 * Protocol version: v5
 * Fallback: v4 AES-GCM — transparent to callers via isE2EEReady() check
 *
 * Key exchange ceremony (Alice = new joiner, Bob = existing member):
 *   1. Alice: generateKeyBundle()
 *   2. Alice: emit register-public-key → server broadcasts peer-key-bundle to Bob
 *   3. Alice: emit request-key-bundles → server returns key-bundle-roster
 *   4. Alice (initiator): pqxdhInitiator(bob) → sharedSecret + pqCiphertext
 *   5. Alice: initRatchetInitiator(sharedSecret, bobEphemeralKey)
 *   6. Alice: emit key-bundle-offer to Bob
 *   7. Bob: pqxdhResponder → initRatchetResponder → emit key-bundle-answer
 */

const __DEV__ = import.meta.env?.DEV === true;
// eslint-disable-next-line no-console

import {
  generateKeyBundle,
  serializeKeyBundle,
  deserializeKeyBundle,
  pqxdhInitiator,
  pqxdhResponder,
} from './pqxdh.js';
import {
  initRatchetInitiator,
  initRatchetResponder,
  ratchetEncrypt,
  ratchetDecrypt,
  destroyRatchetState,
} from './double-ratchet.js';
import {
  generateSenderKey,
  rotateSenderKey,
  setEpochBarrier,
  encryptWithSenderKey,
  decryptWithSenderKey,
  serializeSenderKey,
  deserializeSenderKey,
  destroySenderKey,
} from './sender-key.js';
import { storeKeyBundle, getKeyBundle, destroyKeyBundle, decryptForRoom, ensureKeystoreKey } from './key-store.js';
import { verifyServerSignature, isServerSigningReady } from './server-signing.js';

// ─── Session State ──────────────────────────────────────────

/** @type {Map<string, Map<string, Object>>} roomCode → Map<socketId, drState> */
const drSessions = new Map();

/** @type {Map<string, Map<string, Object>>} roomCode → Map<socketId+':'+skId, senderKeyState> */
const senderKeys = new Map();

/** @type {Map<string, Object>} roomCode → our own sender key state */
const mySenderKeys = new Map();

/** @type {Map<string, Object>} roomCode → socketManager */
const socketManagers = new Map();

/** @type {Map<string, boolean>} roomCode → at least one DR session ready */
const handshakeReady = new Map();

/** @type {Map<string, Array<Function>>} roomCode → cleanup callbacks */
const eventCleanups = new Map();

// ─── Key Rotation Schedule ──────────────────────────────────

/** Max messages sent before rotating our sender key */
const SENDER_KEY_MSG_LIMIT = 100_000;

/** Max milliseconds before rotating our sender key (7 days) */
const SENDER_KEY_AGE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;

/** @type {Map<string, { count: number, createdAt: number }>} roomCode → rotation tracking */
const rotationCounters = new Map();

// ─── Public API ─────────────────────────────────────────────

/**
 * Initialize E2EE for a room.
 * @param {string} roomCode
 * @param {Object} socketManager - has .emit(), .on(), .off(), .socket?.id
 * @returns {Promise<void>}
 */
export async function initE2EE(roomCode, socketManager) {
  try {
    // Tear down any previous session for this room
    destroyE2EESession(roomCode);

    socketManagers.set(roomCode, socketManager);
    drSessions.set(roomCode, new Map());
    senderKeys.set(roomCode, new Map());

    // Socket ID captured lazily at encrypt time (socket may not be fully connected yet)

    // Generate our key bundle — private keys stay in memory
    const bundle = await generateKeyBundle();
    storeKeyBundle(roomCode, bundle);

    // Android: provision hardware-backed AES key for this room session
    await ensureKeystoreKey('ks_' + roomCode);
    const publicBundle = serializeKeyBundle(bundle);

    const cleanups = [];
    eventCleanups.set(roomCode, cleanups);

    // Handler: roster of existing peers' bundles
    const handleRoster = async (payload) => {
      if (payload.roomCode !== roomCode) return;
      // Verify server signature if signing is active — warn and skip on failure
      if (isServerSigningReady()) {
        const valid = await verifyServerSignature(payload);
        if (!valid) {
          dbg('[E2EE] ⚠️ key-bundle-roster signature INVALID — dropping');
          return;
        }
      }
      const { bundles: roster } = payload;
      if (!roster || roster.length === 0) return;
      const myBundle = getKeyBundle(roomCode);
      if (!myBundle) return;
      for (const { socketId: peerId, bundle: peerBundleData } of roster) {
        await _initiateWithPeer(roomCode, peerId, peerBundleData, myBundle, publicBundle, socketManager);
      }
    };

    // Handler: new peer joined after us
    // Normal case: they will send us a key-bundle-offer shortly (they got our bundle in the roster).
    // Simultaneous join case: both peers get an empty roster; neither side has a DR session yet.
    // Tie-break: the peer with the lexicographically smaller socket ID acts as initiator.
    const handlePeerBundle = async (payload) => {
      const { socketId: peerId, bundle: peerBundleData, roomCode: rc } = payload;
      if (rc !== roomCode) return;
      // Verify server signature if signing is active
      if (isServerSigningReady()) {
        const valid = await verifyServerSignature(payload);
        if (!valid) {
          dbg('[E2EE] ⚠️ peer-key-bundle signature INVALID — dropping');
          return;
        }
      }
      // If session already exists (normal case), nothing to do.
      if (drSessions.get(roomCode)?.has(peerId)) {
        dbg(`[E2EE] 👤 New peer joined: ${peerId} — session already established`);
        return;
      }
      const mySocketId = socketManager.socket?.id;
      if (mySocketId && peerBundleData && mySocketId < peerId) {
        // We are the tie-break initiator
        dbg(`[E2EE] 👤 Simultaneous join with ${peerId} — we initiate (tie-break)`);
        const myBundle = getKeyBundle(roomCode);
        if (!myBundle) return;
        await _initiateWithPeer(roomCode, peerId, peerBundleData, myBundle, serializeKeyBundle(myBundle), socketManager);
      } else {
        dbg(`[E2EE] 👤 New peer joined: ${peerId} — awaiting their key-bundle-offer`);
      }
    };

    // Handler: key-bundle-offer (we are the responder)
    const handleOffer = async ({ from: peerId, alicePublicBundle, pqCiphertext, roomCode: rc }) => {
      if (rc !== roomCode) return;
      await _respondToPeer(roomCode, peerId, alicePublicBundle, pqCiphertext, socketManager);
    };

    // Handler: key-bundle-answer (initiator confirmed)
    const handleAnswer = ({ from: peerId, roomCode: rc }) => {
      if (rc !== roomCode) return;
      dbg(`[E2EE] ✅ Key exchange complete with ${peerId} (room: ${roomCode})`);
    };

    // Handler: sender-key-distribution (group key from a peer)
    const handleSKDist = async ({ from: peerId, encryptedKeyDist, roomCode: rc }) => {
      if (rc !== roomCode) return;
      await _receiveSenderKeyDistribution(roomCode, peerId, encryptedKeyDist);
    };

    // Handler: peer left the room — rotate our sender key so the departed member
    // cannot decrypt future group messages (post-compromise forward secrecy).
    const handlePeerLeft = async ({ socketId: peerId, roomCode: rc }) => {
      if (rc !== roomCode) return;
      await _rekeyAfterPeerLeave(roomCode, peerId, socketManager);
    };

    socketManager.on('key-bundle-roster', handleRoster);
    socketManager.on('peer-key-bundle', handlePeerBundle);
    socketManager.on('key-bundle-offer', handleOffer);
    socketManager.on('key-bundle-answer', handleAnswer);
    socketManager.on('sender-key-distribution', handleSKDist);
    socketManager.on('peer-left', handlePeerLeft);

    cleanups.push(
      () => socketManager.off('key-bundle-roster', handleRoster),
      () => socketManager.off('peer-key-bundle', handlePeerBundle),
      () => socketManager.off('key-bundle-offer', handleOffer),
      () => socketManager.off('key-bundle-answer', handleAnswer),
      () => socketManager.off('sender-key-distribution', handleSKDist),
      () => socketManager.off('peer-left', handlePeerLeft),
    );

    // Register our public bundle + request existing peers' bundles
    socketManager.emit('register-public-key', { roomCode, bundle: publicBundle });
    socketManager.emit('request-key-bundles', { roomCode });

    dbg('[E2EE] 🔐 Initialization started for room:', roomCode);
  } catch (e) {
    dbg('[E2EE] init failed:', e.message);
    throw e;
  }
}

/**
 * Check if E2EE is ready (at least 1 DR session established).
 * @param {string} roomCode
 * @returns {boolean}
 */
export function isE2EEReady(roomCode) {
  return handshakeReady.get(roomCode) === true && (drSessions.get(roomCode)?.size ?? 0) > 0;
}

/**
 * Encrypt plaintext for a room using v5 (PQXDH + DR / Megolm).
 * @param {string} plaintext
 * @param {string} roomCode
 * @returns {Promise<Object>} v5 payload
 */
export async function encryptE2EE(plaintext, roomCode) {
  const sessions = drSessions.get(roomCode);
  if (!sessions || sessions.size === 0) throw new Error('[E2EE] No sessions available');

  // Lazily capture socket ID — may not have been available at initE2EE time
  const socketManager = socketManagers.get(roomCode);
  const mySocketId = socketManager?.socket?.id;
  if (!mySocketId) throw new Error('[E2EE] Socket not connected yet');

  // The Keystore key is device-local hardware (TEE) and cannot be shared.
  // Wrapping the wire payload here would make messages unreadable on any other
  // device (different Android or web). Keystore is reserved for at-rest key
  // protection only — it must NOT appear on the wire payload.
  const innerPlaintext = plaintext;

  if (sessions.size === 1) {
    // 1:1 room — use Double Ratchet
    const [, drState] = sessions.entries().next().value;
    const { header, ciphertext, iv } = await ratchetEncrypt(drState, innerPlaintext);
    return { v: 5, dr: { header, ciphertext, iv }, from: mySocketId, isEncrypted: true };
  }

  // Group room — use Megolm-style sender key
  let mySenderKey = mySenderKeys.get(roomCode);
  if (!mySenderKey) {
    mySenderKey = await generateSenderKey();
    mySenderKeys.set(roomCode, mySenderKey);
    rotationCounters.set(roomCode, { count: 0, createdAt: Date.now() });
    // Distribute to all peers
    for (const peerId of sessions.keys()) {
      await _distributeSenderKey(roomCode, peerId, socketManager);
    }
  }

  // Check scheduled rotation limits before encrypting
  await _maybeRotateSenderKey(roomCode, sessions, socketManager);

  // Re-fetch in case rotation just replaced the key
  const activeSenderKey = mySenderKeys.get(roomCode);
  const { ct, iv, counter, skId, epoch } = await encryptWithSenderKey(activeSenderKey, innerPlaintext);

  // Track message count for rotation schedule
  const rotCounter = rotationCounters.get(roomCode);
  if (rotCounter) rotCounter.count++;

  return {
    v: 5,
    sk: { ct, iv, counter, epoch },
    skId,
    from: mySocketId,
    isEncrypted: true,
  };
}

/**
 * Decrypt a v5 E2EE payload.
 * @param {Object} payload - { v:5, dr|sk, from, ... }
 * @param {string} roomCode
 * @returns {Promise<string>}
 */
export async function decryptE2EE(payload, roomCode) {
  const { from: fromSocketId } = payload;

  let innerPlaintext;
  if (payload.dr) {
    const drState = drSessions.get(roomCode)?.get(fromSocketId);
    if (!drState) throw new Error('[E2EE] No DR session for sender ' + fromSocketId);
    const { header, ciphertext, iv } = payload.dr;
    innerPlaintext = await ratchetDecrypt(drState, header, ciphertext, iv);
  } else if (payload.sk) {
    const keyId = fromSocketId + ':' + payload.skId;
    const keyData = senderKeys.get(roomCode)?.get(keyId);
    if (!keyData) throw new Error('[E2EE] No sender key for ' + keyId);
    // Pass the mutable state — decryptWithSenderKey advances the chain in-place
    innerPlaintext = await decryptWithSenderKey(keyData, payload.sk);
  } else {
    throw new Error('[E2EE] Unknown v5 payload format');
  }

  // Legacy: ks:true was briefly used to Keystore-wrap the wire payload, but the
  // Keystore key is device-local and cannot be shared — it made messages unreadable
  // on any other device. If a ks:true payload arrives (from an old build), attempt
  // the unwrap on Android only; on all other platforms return the raw innerPlaintext
  // so the message is not silently dropped.
  if (payload.ks) {
    const ksData = JSON.parse(innerPlaintext);
    const plainbytes = await decryptForRoom('ks_' + roomCode, ksData.ct, ksData.iv);
    if (plainbytes) return new TextDecoder().decode(plainbytes);
    // Non-Android receiver or different device — return raw JSON (message is still
    // DR/Megolm authenticated; it just can't be unwrapped without the sender's TEE key)
    return innerPlaintext;
  }

  return innerPlaintext;
}

/**
 * Handle an incoming key bundle (called from ChatRoom's handleMLSKeyPackage).
 * @param {{ socketId?: string, from?: string, bundle?: Object, keyPackage?: Object }} keyBundle
 * @param {string} roomCode
 */
export async function handleIncomingKeyBundle(keyBundle, roomCode) {
  const socketManager = socketManagers.get(roomCode);
  if (!socketManager) return;
  const myBundle = getKeyBundle(roomCode);
  if (!myBundle) return;

  const peerId = keyBundle.socketId || keyBundle.from;
  const peerBundleData = keyBundle.bundle || keyBundle.keyPackage;
  if (!peerId || !peerBundleData) return;

  await _initiateWithPeer(roomCode, peerId, peerBundleData, myBundle, serializeKeyBundle(myBundle), socketManager);
}

/**
 * Destroy all E2EE state for a room — call on room leave.
 * @param {string} roomCode
 */
export function destroyE2EESession(roomCode) {
  // Remove event listeners
  const cleanups = eventCleanups.get(roomCode);
  if (cleanups) {
    for (const fn of cleanups) { try { fn(); } catch (_) { } }
    eventCleanups.delete(roomCode);
  }

  // Destroy DR sessions
  const sessions = drSessions.get(roomCode);
  if (sessions) {
    for (const [, state] of sessions) { try { destroyRatchetState(state); } catch (_) { } }
    sessions.clear();
    drSessions.delete(roomCode);
  }

  // Destroy incoming sender keys
  const roomSenderKeys = senderKeys.get(roomCode);
  if (roomSenderKeys) {
    for (const [, keyData] of roomSenderKeys) { try { destroySenderKey(keyData); } catch (_) { } }
    roomSenderKeys.clear();
    senderKeys.delete(roomCode);
  }

  // Destroy our sender key
  const mySK = mySenderKeys.get(roomCode);
  if (mySK) { try { destroySenderKey(mySK); } catch (_) { } mySenderKeys.delete(roomCode); }

  destroyKeyBundle(roomCode);
  socketManagers.delete(roomCode);
  handshakeReady.delete(roomCode);
  rotationCounters.delete(roomCode);

  dbg('[E2EE] 🗑️ Session destroyed for room:', roomCode);
}

// ─── Internal — Initiator (Alice) ──────────────────────────

async function _initiateWithPeer(roomCode, peerId, peerBundleData, myBundle, myPublicBundle, socketManager) {
  try {
    const peerBundle = deserializeKeyBundle(peerBundleData);

    const { sharedSecret, pqCiphertext, peerEphemeralKey } = await pqxdhInitiator(myBundle, peerBundle);
    const drState = await initRatchetInitiator(sharedSecret, peerEphemeralKey);
    drSessions.get(roomCode).set(peerId, drState);

    socketManager.emit('key-bundle-offer', {
      roomCode,
      to: peerId,
      alicePublicBundle: myPublicBundle,
      pqCiphertext,
    });

    sharedSecret.fill(0);
    handshakeReady.set(roomCode, true);

    dbg(`[E2EE] 🔑 Initiated key exchange with ${peerId} (room: ${roomCode})`);
  } catch (e) {
    dbg('[E2EE] Initiate failed for peer', peerId, ':', e.message);
  }
}

// ─── Internal — Responder (Bob) ────────────────────────────

async function _respondToPeer(roomCode, peerId, alicePublicBundleData, pqCiphertext, socketManager) {
  try {
    // Don't double-process if already have a session
    if (drSessions.get(roomCode)?.has(peerId)) {
      dbg(`[E2EE] Session with ${peerId} already exists, skipping duplicate offer`);
      return;
    }

    const myBundle = getKeyBundle(roomCode);
    if (!myBundle) return;

    const aliceBundle = deserializeKeyBundle(alicePublicBundleData);
    const { sharedSecret } = await pqxdhResponder(myBundle, aliceBundle, pqCiphertext);
    const drState = await initRatchetResponder(sharedSecret, myBundle.ephemeralKey);
    drSessions.get(roomCode).set(peerId, drState);

    sharedSecret.fill(0);
    handshakeReady.set(roomCode, true);

    socketManager.emit('key-bundle-answer', { roomCode, to: peerId });

    dbg(`[E2EE] 🔑 Responded to key exchange from ${peerId} (room: ${roomCode})`);
    // Sender key distribution for group rooms happens lazily in encryptE2EE,
    // once the DR send chain is established (after receiving the first message).
  } catch (e) {
    dbg('[E2EE] Respond failed for peer', peerId, ':', e.message);
  }
}

// ─── Internal — Sender Key Distribution ────────────────────

async function _distributeSenderKey(roomCode, toPeerId, socketManager) {
  try {
    let mySenderKey = mySenderKeys.get(roomCode);
    if (!mySenderKey) {
      mySenderKey = await generateSenderKey();
      mySenderKeys.set(roomCode, mySenderKey);
    }

    const drState = drSessions.get(roomCode)?.get(toPeerId);
    if (!drState?.sendChainKey) return; // DR not ready to send yet

    const serialized = JSON.stringify(serializeSenderKey(mySenderKey));
    const { header, ciphertext, iv } = await ratchetEncrypt(drState, serialized);

    socketManager.emit('sender-key-distribution', {
      roomCode,
      to: toPeerId,
      encryptedKeyDist: { header, ciphertext, iv },
    });
  } catch (e) {
    dbg('[E2EE] Sender key distribution failed:', e.message);
  }
}

async function _receiveSenderKeyDistribution(roomCode, fromPeerId, encryptedKeyDist) {
  try {
    const drState = drSessions.get(roomCode)?.get(fromPeerId);
    if (!drState) return;

    const { header, ciphertext, iv } = encryptedKeyDist;
    const serialized = await ratchetDecrypt(drState, header, ciphertext, iv);
    const keyData = deserializeSenderKey(JSON.parse(serialized));

    senderKeys.get(roomCode)?.set(fromPeerId + ':' + keyData.id, keyData);
    dbg(`[E2EE] 📦 Sender key received from ${fromPeerId}`);
  } catch (e) {
    dbg('[E2EE] Receive sender key failed:', e.message);
  }
}

// ─── Internal — Group Rekey After Peer Leave ───────────────

/**
 * When a peer leaves a group room:
 *   1. Rotate our sender key (fresh random key, bumped epoch) so the
 *      departed member cannot decrypt future messages.
 *   2. Distribute the new key to all remaining peers.
 *   3. Set epoch barriers on all receiver states that belonged to the
 *      departed peer, preventing replay of their pre-leave messages.
 *
 * Only acts on group rooms (sessions.size > 1 after removal).
 */
async function _rekeyAfterPeerLeave(roomCode, departedPeerId, socketManager) {
  try {
    const sessions = drSessions.get(roomCode);
    if (!sessions) return;

    // Remove the departed peer's DR session
    sessions.delete(departedPeerId);

    // Only rotate if we had a sender key (i.e., this was a group room)
    const mySenderKey = mySenderKeys.get(roomCode);
    if (!mySenderKey) return;

    // Step 1: Rotate sender key — breaks backward access for departed peer
    await rotateSenderKey(mySenderKey);
    dbg(`[E2EE] 🔄 Rotated sender key after ${departedPeerId} left (new epoch: ${mySenderKey.epoch})`);

    // Step 2: Distribute the new key to all remaining peers
    for (const remainingPeerId of sessions.keys()) {
      await _distributeSenderKey(roomCode, remainingPeerId, socketManager);
    }

    // Step 3: Set epoch barrier on all receiver states for the departed peer.
    // Their keys are identified by `departedPeerId + ':' + skId`. We set the
    // barrier to 1 above their last known epoch so their old messages cannot
    // be replayed after the rekey.
    const roomSenderKeys = senderKeys.get(roomCode);
    if (roomSenderKeys) {
      for (const [keyId, keyState] of roomSenderKeys) {
        if (keyId.startsWith(departedPeerId + ':')) {
          const departedEpoch = keyState.epoch ?? 0;
          setEpochBarrier(keyState, departedEpoch + 1);
          dbg(`[E2EE] 🚧 Epoch barrier set for ${keyId}: barrier=${keyState.epochBarrier}`);
        }
      }
    }
  } catch (e) {
    dbg('[E2EE] Rekey after peer leave failed:', e.message);
  }
}

// ─── Internal — Scheduled Key Rotation ─────────────────────

/**
 * Check if our sender key for a group room has exceeded the message-count
 * or time-based rotation limit. If so, rotate and redistribute.
 *
 * Thresholds:
 *   - SENDER_KEY_MSG_LIMIT messages sent (default 100,000)
 *   - SENDER_KEY_AGE_LIMIT_MS elapsed since key creation (default 7 days)
 *
 * Silently skips if rotation conditions are not met.
 */
async function _maybeRotateSenderKey(roomCode, sessions, socketManager) {
  const counter = rotationCounters.get(roomCode);
  if (!counter) return;

  const msgLimitReached = counter.count >= SENDER_KEY_MSG_LIMIT;
  const ageMs = Date.now() - counter.createdAt;
  const ageLimitReached = ageMs >= SENDER_KEY_AGE_LIMIT_MS;

  if (!msgLimitReached && !ageLimitReached) return;

  const reason = msgLimitReached ? `${SENDER_KEY_MSG_LIMIT} messages sent` : `${Math.round(ageMs / 86400000)}d age limit`;
  dbg(`[E2EE] 🔄 Scheduled sender key rotation (${reason}) for room: ${roomCode}`);

  const mySenderKey = mySenderKeys.get(roomCode);
  if (!mySenderKey) return;

  // Rotate — generates fresh key, bumps epoch
  await rotateSenderKey(mySenderKey);

  // Reset rotation tracking
  rotationCounters.set(roomCode, { count: 0, createdAt: Date.now() });

  // Distribute the new key to all current peers
  for (const peerId of sessions.keys()) {
    await _distributeSenderKey(roomCode, peerId, socketManager);
  }

  dbg(`[E2EE] ✅ Scheduled rotation complete — new epoch: ${mySenderKey.epoch}`);
}

/**
 * Expose rotation counters for testing.
 * @param {string} roomCode
 * @returns {{ count: number, createdAt: number } | undefined}
 */
export function _getRotationCounter(roomCode) {
  return rotationCounters.get(roomCode);
}
