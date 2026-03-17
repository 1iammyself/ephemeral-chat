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
const dbg = __DEV__ ? (...a) => console.log(...a) : () => {};

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
  encryptWithSenderKey,
  decryptWithSenderKey,
  serializeSenderKey,
  deserializeSenderKey,
  destroySenderKey,
} from './sender-key.js';
import { storeKeyBundle, getKeyBundle, destroyKeyBundle } from './key-store.js';

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
    const publicBundle = serializeKeyBundle(bundle);

    const cleanups = [];
    eventCleanups.set(roomCode, cleanups);

    // Handler: roster of existing peers' bundles
    const handleRoster = async ({ bundles: roster, roomCode: rc }) => {
      if (rc !== roomCode) return;
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
    const handlePeerBundle = async ({ socketId: peerId, bundle: peerBundleData, roomCode: rc }) => {
      if (rc !== roomCode) return;
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

    socketManager.on('key-bundle-roster', handleRoster);
    socketManager.on('peer-key-bundle', handlePeerBundle);
    socketManager.on('key-bundle-offer', handleOffer);
    socketManager.on('key-bundle-answer', handleAnswer);
    socketManager.on('sender-key-distribution', handleSKDist);

    cleanups.push(
      () => socketManager.off('key-bundle-roster', handleRoster),
      () => socketManager.off('peer-key-bundle', handlePeerBundle),
      () => socketManager.off('key-bundle-offer', handleOffer),
      () => socketManager.off('key-bundle-answer', handleAnswer),
      () => socketManager.off('sender-key-distribution', handleSKDist),
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

  if (sessions.size === 1) {
    // 1:1 room — use Double Ratchet
    const [, drState] = sessions.entries().next().value;
    const { header, ciphertext, iv } = await ratchetEncrypt(drState, plaintext);
    return { v: 5, dr: { header, ciphertext, iv }, from: mySocketId, isEncrypted: true };
  }

  // Group room — use Megolm-style sender key
  let mySenderKey = mySenderKeys.get(roomCode);
  if (!mySenderKey) {
    mySenderKey = await generateSenderKey();
    mySenderKeys.set(roomCode, mySenderKey);
    // Distribute to all peers
    const socketManager = socketManagers.get(roomCode);
    for (const peerId of sessions.keys()) {
      await _distributeSenderKey(roomCode, peerId, socketManager);
    }
  }

  const { ct, iv, counter, skId } = await encryptWithSenderKey(mySenderKey, plaintext);
  return {
    v: 5,
    sk: { ct, iv, counter },
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

  if (payload.dr) {
    const drState = drSessions.get(roomCode)?.get(fromSocketId);
    if (!drState) throw new Error('[E2EE] No DR session for sender ' + fromSocketId);
    const { header, ciphertext, iv } = payload.dr;
    return ratchetDecrypt(drState, header, ciphertext, iv);
  }

  if (payload.sk) {
    const keyId = fromSocketId + ':' + payload.skId;
    const keyData = senderKeys.get(roomCode)?.get(keyId);
    if (!keyData) throw new Error('[E2EE] No sender key for ' + keyId);
    // Pass the mutable state — decryptWithSenderKey advances the chain in-place
    return decryptWithSenderKey(keyData, payload.sk);
  }

  throw new Error('[E2EE] Unknown v5 payload format');
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
