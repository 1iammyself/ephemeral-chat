/**
 * Key Transparency client — verifies inclusion proofs and manages TOFU pins.
 *
 * Security issues addressed:
 * - C1: KT verification missing — this module implements verify_inclusion_proof()
 * - C4: TOFU session-only — pins persisted in IndexedDB via KTTOFUStore
 */

import { KTTOFUStore } from '../db/kt-store.js';

const SERVERS_SEEN = new Map(); // in-memory cache: serverHost → publicKeyHex

export class KeyTransparencyClient {
  /**
   * Verify and pin the server's Ed25519 public key.
   *
   * On first connection: pins the key (TOFU).
   * On subsequent connections: verifies it matches the stored pin.
   * Throws if mismatch detected.
   *
   * @param {string} serverHost
   * @param {string} serverPublicKeyHex - hex Ed25519 public key from server hello
   */
  static async verifyAndPinServerKey(serverHost, serverPublicKeyHex) {
    if (!serverHost || !serverPublicKeyHex) {
      throw new Error('serverHost and serverPublicKeyHex are required');
    }

    if (serverPublicKeyHex.length !== 64) {
      throw new Error(`Invalid public key length: expected 64 hex chars, got ${serverPublicKeyHex.length}`);
    }

    // Check in-memory cache first (avoids IndexedDB round-trip on same session)
    if (SERVERS_SEEN.has(serverHost)) {
      const cached = SERVERS_SEEN.get(serverHost);
      if (cached !== serverPublicKeyHex) {
        throw new Error(
          `TOFU PIN MISMATCH (session cache) for ${serverHost}: ` +
          `This may indicate a key substitution attack.`
        );
      }
      return { status: 'verified_cached' };
    }

    // Persist in IndexedDB
    const result = await KTTOFUStore.pin(serverHost, serverPublicKeyHex);

    // Update in-memory cache
    SERVERS_SEEN.set(serverHost, serverPublicKeyHex);

    return result;
  }

  /**
   * Verify a Merkle inclusion proof for a user's key.
   *
   * Proves that `entry` is in the tree at position `index` with the given root.
   * Uses RFC 6962 hashing (0x00 || leaf for leaves, 0x01 || left || right for nodes).
   *
   * @param {number} index - leaf index
   * @param {Uint8Array} entry - the leaf data (e.g., userId + publicKey)
   * @param {Object} proof - { index, tree_size, siblings: Array<Uint8Array> }
   * @param {Uint8Array} expectedRoot - 32-byte Merkle root
   * @returns {boolean}
   */
  static async verifyInclusionProof(index, entry, proof, expectedRoot) {
    if (!entry || !proof || !expectedRoot) {
      throw new Error('entry, proof, and expectedRoot are required');
    }

    if (proof.index !== index) {
      return false;
    }

    if (proof.index >= proof.tree_size) {
      return false;
    }

    // Compute leaf hash: SHA-256(0x00 || entry)
    let hash = await sha256(concatBytes(new Uint8Array([0x00]), entry));

    let idx = proof.index;
    let levelSize = proof.tree_size;
    let siblingIdx = 0;

    while (levelSize > 1) {
      // RFC 6962 promotion: even-positioned node at end has no sibling
      if (idx % 2 === 0 && idx + 1 >= levelSize) {
        // Promoted node — no sibling consumed from proof
      } else {
        if (siblingIdx >= proof.siblings.length) {
          return false; // Insufficient siblings
        }
        const sibling = proof.siblings[siblingIdx++];

        if (idx % 2 === 0) {
          // Node is left child: hash(node || sibling)
          hash = await sha256(concatBytes(new Uint8Array([0x01]), hash, sibling));
        } else {
          // Node is right child: hash(sibling || node)
          hash = await sha256(concatBytes(new Uint8Array([0x01]), sibling, hash));
        }
      }

      idx = Math.floor(idx / 2);
      levelSize = Math.ceil(levelSize / 2);
    }

    // Compare computed root with expected root
    return bytesEqual(hash, expectedRoot);
  }

  /**
   * Get the stored TOFU pin for a server.
   */
  static async getStoredPin(serverHost) {
    return await KTTOFUStore.getPin(serverHost);
  }

  /**
   * Clear the stored pin (for key rotation flow with user confirmation).
   */
  static async clearPin(serverHost) {
    SERVERS_SEEN.delete(serverHost);
    await KTTOFUStore.clearPin(serverHost);
  }
}

// ─── Crypto helpers ────────────────────────────────────────────────────────

async function sha256(data) {
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuf);
}

function concatBytes(...arrays) {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
