/**
 * mlsEncryption.js — MLS (Messaging Layer Security) E2EE for Ephemeral Chat
 *
 * Uses openmls-wasm (MIT license) — RFC 9420 compliant.
 *
 * Security properties:
 *   - Forward secrecy (TreeKEM ratchet)
 *   - Post-compromise security
 *   - Cryptographic transcript integrity
 *   - Efficient group rekeying O(log n)
 *   - Comparable to Signal Protocol for group messaging
 *
 * Flow:
 *   1. Room creator calls createMLSGroup() → creates group, publishes key package
 *   2. Joiners call createMLSIdentity() → generates key package, sent to creator
 *   3. Creator calls addMemberToGroup(keyPackage) → returns Welcome + Commit
 *   4. Joiner calls joinMLSGroup(welcome, ratchetTree) → joins group
 *   5. All members use encryptMLSMessage() / decryptMLSMessage() for messages
 *   6. On leave, destroyMLSSession() cleans up
 */

import { Provider, Identity, Group } from 'openmls-wasm';

// ═══════════════════════════════════════════════════════════
// MODULE STATE
// ═══════════════════════════════════════════════════════════
let wasmReady = false;
let wasmInitPromise = null;

/** Per-room MLS state */
const mlsSessions = new Map();

// ═══════════════════════════════════════════════════════════
// BASE64 HELPERS
// ═══════════════════════════════════════════════════════════
function uint8ToBase64(arr) {
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

function base64ToUint8(b64) {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

// ═══════════════════════════════════════════════════════════
// WASM INITIALIZATION
// ═══════════════════════════════════════════════════════════

/**
 * Initialize the OpenMLS WASM module. Safe to call multiple times.
 */
export async function initMLS() {
  if (wasmReady) return;
  if (wasmInitPromise) return wasmInitPromise;

  wasmInitPromise = (async () => {
    try {
      // openmls-wasm self-initializes when imported (via __wbindgen_start).
      // The static import above already triggers WASM init with vite-plugin-wasm.
      // We just verify it loaded by testing a constructor.
      new Provider().free();
      wasmReady = true;
      console.log('[MLS] ✅ OpenMLS WASM initialized');
    } catch (e) {
      console.error('[MLS] ❌ Failed to initialize WASM:', e);
      wasmInitPromise = null;
      throw e;
    }
  })();

  return wasmInitPromise;
}

function ensureReady() {
  if (!wasmReady) throw new Error('[MLS] WASM not initialized — call initMLS() first');
}

// ═══════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════

/**
 * Create an MLS identity for a user in a room.
 * Returns the serialized KeyPackage to send to the group creator.
 */
export function createMLSIdentity(roomCode, nickname) {
  ensureReady();
  const provider = new Provider();
  const identity = new Identity(provider, nickname || 'anon-' + Math.random().toString(36).slice(2, 8));
  const keyPackage = identity.key_package(provider);

  // Store the identity and provider for later use
  mlsSessions.set(roomCode, {
    provider,
    identity,
    group: null,
    isCreator: false,
    ready: false
  });

  console.log('[MLS] Identity created for room:', roomCode);
  return { provider, identity, keyPackage };
}

/**
 * Room creator: Create a new MLS group.
 * Returns the ratchet tree (needed for joiners via Welcome).
 */
export function createMLSGroup(roomCode, nickname) {
  ensureReady();
  const { provider, identity } = createMLSIdentity(roomCode, nickname);
  const groupId = 'ephchat-' + roomCode;
  const group = Group.create_new(provider, identity, groupId);

  const session = mlsSessions.get(roomCode);
  session.group = group;
  session.isCreator = true;
  session.ready = true; // Creator is always ready (group of 1)

  console.log('[MLS] ✅ Group created for room:', roomCode);
  return {
    ratchetTree: uint8ToBase64(group.export_ratchet_tree().serialize
      ? group.export_ratchet_tree()
      : serializeRatchetTree(group, provider))
  };
}

/**
 * Serialize a RatchetTree to bytes for transport.
 */
function serializeRatchetTree(group, provider) {
  // openmls-wasm export_ratchet_tree returns a RatchetTree object
  // We need to pass it directly to Group.join later
  return group.export_ratchet_tree();
}

/**
 * Room creator: Add a new member to the group.
 * @param {string} roomCode
 * @param {Uint8Array} keyPackageBytes - The joiner's serialized KeyPackage
 * @returns {{ welcome: string, commit: string, ratchetTree: RatchetTree }}
 */
export function addMemberToGroup(roomCode, keyPackageBytes) {
  ensureReady();
  const session = mlsSessions.get(roomCode);
  if (!session || !session.group) {
    throw new Error('[MLS] No group for room ' + roomCode);
  }

  const addMsgs = session.group.propose_and_commit_add(
    session.provider,
    session.identity,
    keyPackageBytes // KeyPackage object
  );

  // Merge the pending commit on our side
  session.group.merge_pending_commit(session.provider);

  console.log('[MLS] ✅ Member added to group in room:', roomCode);
  return {
    welcome: uint8ToBase64(addMsgs.welcome),
    commit: uint8ToBase64(addMsgs.commit),
    proposal: uint8ToBase64(addMsgs.proposal)
  };
}

/**
 * Joiner: Join an existing MLS group using a Welcome message + RatchetTree.
 */
export function joinMLSGroup(roomCode, welcomeB64, ratchetTree, nickname) {
  ensureReady();

  // Create identity if not already created
  let session = mlsSessions.get(roomCode);
  if (!session) {
    createMLSIdentity(roomCode, nickname);
    session = mlsSessions.get(roomCode);
  }

  const welcomeBytes = base64ToUint8(welcomeB64);
  const group = Group.join(session.provider, welcomeBytes, ratchetTree);

  session.group = group;
  session.ready = true;

  console.log('[MLS] ✅ Joined group for room:', roomCode);
}

/**
 * Check if MLS session is ready for a room.
 */
export function isMLSReady(roomCode) {
  const session = mlsSessions.get(roomCode);
  return !!(session && session.ready && session.group);
}

// ═══════════════════════════════════════════════════════════
// MESSAGE ENCRYPTION / DECRYPTION
// ═══════════════════════════════════════════════════════════

/**
 * Encrypt a message using MLS group encryption.
 * Returns { v: 3, mls: base64EncodedCiphertext }
 */
export function encryptMLSMessage(text, roomCode) {
  ensureReady();
  const session = mlsSessions.get(roomCode);
  if (!session || !session.group || !session.ready) {
    throw new Error('[MLS] Session not ready for room ' + roomCode);
  }

  const plaintext = new TextEncoder().encode(text);
  const ciphertext = session.group.create_message(session.provider, session.identity, plaintext);

  return {
    v: 3,
    mls: uint8ToBase64(ciphertext),
    isEncrypted: true
  };
}

/**
 * Decrypt an MLS-encrypted message.
 * @param {{ v: 3, mls: string }} payload
 * @param {string} roomCode
 * @returns {string} Decrypted plaintext
 */
export function decryptMLSMessage(payload, roomCode) {
  ensureReady();
  const session = mlsSessions.get(roomCode);

  if (!session || !session.group || !session.ready) {
    console.warn('[MLS] Cannot decrypt — session not ready for room:', roomCode);
    return '⚠️ MLS session not ready — cannot decrypt';
  }

  if (!payload || payload.v !== 3 || !payload.mls) {
    return '⚠️ Unknown message format';
  }

  try {
    const ciphertext = base64ToUint8(payload.mls);
    const plaintext = session.group.process_message(session.provider, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch (e) {
    console.error('[MLS] Decrypt error:', e.message);
    return '⚠️ Decryption failed';
  }
}

// ═══════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════

/**
 * Destroy MLS session for a room (on leave / room close).
 */
export function destroyMLSSession(roomCode) {
  const session = mlsSessions.get(roomCode);
  if (session) {
    try { session.group?.free(); } catch (e) { /* ignore */ }
    try { session.identity?.free(); } catch (e) { /* ignore */ }
    try { session.provider?.free(); } catch (e) { /* ignore */ }
    mlsSessions.delete(roomCode);
    console.log('[MLS] Session destroyed for room:', roomCode);
  }
}

/**
 * Get the session's KeyPackage (serialized) for sending to the group creator.
 */
export function getMLSKeyPackage(roomCode) {
  const session = mlsSessions.get(roomCode);
  if (!session || !session.identity) return null;
  return session.identity.key_package(session.provider);
}

/**
 * Get whether this user is the group creator for a room.
 */
export function isMLSCreator(roomCode) {
  const session = mlsSessions.get(roomCode);
  return !!(session && session.isCreator);
}
