/**
 * key-registry.js — Public key bundle store for PQXDH key exchange
 *
 * Stores only PUBLIC key bundles (identity + ephemeral + PQ keys).
 * Private keys never leave the client.
 * TTL is scoped to room lifetime — bundles are evicted on disconnect/leave.
 */

const crypto = require('crypto');

/** @type {Map<string, Object>} socketId → bundle + meta */
const bundles = new Map();

/** @type {Map<string, Set<string>>} roomCode → Set<socketId> */
const roomMembers = new Map();

// ─── RFC 6962 Merkle Tree ─────────────────────────────────────────────────────
/** @type {Array<{socketId: string, leafData: Buffer}>} */
const registryLeaves = [];

function _leafHash(data) {
  return crypto.createHash('sha256').update(Buffer.concat([Buffer.from([0x00]), data])).digest();
}
function _nodeHash(l, r) {
  return crypto.createHash('sha256').update(Buffer.concat([Buffer.from([0x01]), l, r])).digest();
}

/**
 * Compute RFC 6962 inclusion proof for a socketId's leaf.
 * @param {string} socketId
 * @returns {{ index, tree_size, root, siblings, leafData } | null}
 */
function getInclusionProof(socketId) {
  const idx = registryLeaves.findIndex(e => e.socketId === socketId);
  if (idx === -1) return null;

  const size = registryLeaves.length;
  let level = registryLeaves.map(e => _leafHash(e.leafData));
  let nodeIdx = idx;
  let levelSize = size;
  const siblings = [];

  while (levelSize > 1) {
    if (nodeIdx % 2 === 0 && nodeIdx + 1 < levelSize) {
      siblings.push(level[nodeIdx + 1].toString('base64'));
    } else if (nodeIdx % 2 !== 0) {
      siblings.push(level[nodeIdx - 1].toString('base64'));
    }
    // promoted node (even, last) contributes no sibling

    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? _nodeHash(level[i], level[i + 1]) : level[i]);
    }
    level = next;
    nodeIdx = Math.floor(nodeIdx / 2);
    levelSize = Math.ceil(levelSize / 2);
  }

  return {
    index: idx,
    tree_size: size,
    root: (level[0] || Buffer.alloc(32)).toString('base64'),
    siblings,
    leafData: registryLeaves[idx].leafData.toString('base64'),
  };
}

/**
 * Validate a serialized public key bundle before storage.
 * Checks that required fields are present and are base64-encoded strings of
 * plausible length (32–4096 bytes decoded). Prevents junk from reaching peers.
 * @param {Object} bundle
 * @returns {boolean}
 */
function isValidBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') return false;
  const requiredFields = ['ik', 'ek'];
  for (const field of requiredFields) {
    const v = bundle[field];
    if (typeof v !== 'string') return false;
    // Validate it looks like base64/base64url and decodes to 32–512 bytes
    const raw = Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (raw.length < 32 || raw.length > 512) return false;
  }
  if (bundle.pq) {
    const pqRaw = Buffer.from(bundle.pq, 'base64');
    if (pqRaw.length !== 1184) return false; // ML-KEM-768 public key must be 1184 bytes
  }
  return true;
}

/**
 * Register a public key bundle for a socket.
 * @param {string} socketId
 * @param {Object} bundle - Serialized public bundle from pqxdh.serializeKeyBundle
 * @param {string} roomCode
 * @returns {boolean} false if bundle failed validation
 */
function registerKeyBundle(socketId, bundle, roomCode) {
  if (!isValidBundle(bundle)) return false;
  bundles.set(socketId, { ...bundle, timestamp: Date.now(), roomCode });
  if (roomCode) {
    if (!roomMembers.has(roomCode)) roomMembers.set(roomCode, new Set());
    roomMembers.get(roomCode).add(socketId);
  }

  // Maintain Merkle leaf registry — update existing entry or append new
  const leafData = Buffer.from(socketId + ':' + bundle.ik, 'utf8');
  const existingIdx = registryLeaves.findIndex(e => e.socketId === socketId);
  if (existingIdx >= 0) {
    registryLeaves[existingIdx] = { socketId, leafData };
  } else {
    registryLeaves.push({ socketId, leafData });
  }

  return true;
}

/**
 * Get a public key bundle for a socket.
 * @param {string} socketId
 * @returns {Object|null}
 */
function getKeyBundle(socketId) {
  return bundles.get(socketId) || null;
}

/**
 * Remove a socket's key bundle.
 * @param {string} socketId
 */
function removeKeyBundle(socketId) {
  const bundle = bundles.get(socketId);
  if (bundle?.roomCode) {
    const members = roomMembers.get(bundle.roomCode);
    if (members) {
      members.delete(socketId);
      if (members.size === 0) roomMembers.delete(bundle.roomCode);
    }
  }
  bundles.delete(socketId);

  const leafIdx = registryLeaves.findIndex(e => e.socketId === socketId);
  if (leafIdx >= 0) registryLeaves.splice(leafIdx, 1);
}

/**
 * Get public key bundles for all sockets in a room except the requester.
 * @param {string} roomCode
 * @param {string} excludeSocketId
 * @returns {Array<{socketId: string, bundle: Object}>}
 */
function getBundlesForRoom(roomCode, excludeSocketId) {
  const members = roomMembers.get(roomCode);
  if (!members) return [];
  const result = [];
  for (const socketId of members) {
    if (socketId === excludeSocketId) continue;
    const bundle = bundles.get(socketId);
    if (bundle) result.push({ socketId, bundle, merkleProof: getInclusionProof(socketId) });
  }
  return result;
}

module.exports = { registerKeyBundle, getKeyBundle, removeKeyBundle, getBundlesForRoom, getInclusionProof };
