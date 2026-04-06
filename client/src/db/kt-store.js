/**
 * TOFU (Trust On First Use) pin store for Key Transparency.
 *
 * Persists server public key pins in IndexedDB so they survive page reloads.
 * On reconnect, verifies the server's current key matches the stored pin.
 * A mismatch indicates a potential key substitution attack.
 */

import { getKTDatabase, KT_STORES } from './kt-schema.js';

export class KTTOFUStore {
  /**
   * Store a new TOFU pin for the given server host.
   * If a pin already exists and differs, throws an error.
   *
   * @param {string} serverHost - e.g., "chat.example.com"
   * @param {string} publicKeyHex - hex-encoded Ed25519 public key (64 chars)
   */
  static async pin(serverHost, publicKeyHex) {
    const db = await getKTDatabase();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(KT_STORES.TOFU_PINS, 'readwrite');
      const store = tx.objectStore(KT_STORES.TOFU_PINS);

      const getReq = store.get(serverHost);

      getReq.onsuccess = () => {
        const existing = getReq.result;

        if (existing) {
          if (existing.publicKey !== publicKeyHex) {
            reject(new Error(
              `TOFU PIN MISMATCH for ${serverHost}: ` +
              `stored=${existing.publicKey.slice(0, 16)}... ` +
              `received=${publicKeyHex.slice(0, 16)}... ` +
              `This may indicate a key substitution attack.`
            ));
            return;
          }
          // Pin matches — update timestamp
          const updated = { ...existing, timestamp: Date.now(), verified: true };
          store.put(updated);
          resolve({ status: 'verified', pin: existing });
          return;
        }

        // First time seeing this server — establish TOFU pin
        const newPin = {
          serverHost,
          publicKey: publicKeyHex,
          timestamp: Date.now(),
          verified: true,
        };
        store.put(newPin);
        resolve({ status: 'pinned', pin: newPin });
      };

      getReq.onerror = () => reject(getReq.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Retrieve the stored TOFU pin for a server host.
   * Returns null if no pin exists.
   */
  static async getPin(serverHost) {
    const db = await getKTDatabase();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(KT_STORES.TOFU_PINS, 'readonly');
      const store = tx.objectStore(KT_STORES.TOFU_PINS);
      const req = store.get(serverHost);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Delete a TOFU pin (e.g., after server key rotation with user confirmation).
   */
  static async clearPin(serverHost) {
    const db = await getKTDatabase();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(KT_STORES.TOFU_PINS, 'readwrite');
      const store = tx.objectStore(KT_STORES.TOFU_PINS);
      const req = store.delete(serverHost);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Store a KT inclusion proof for a user's key.
   */
  static async storeProof(userId, proof, treeSize) {
    const db = await getKTDatabase();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(KT_STORES.KT_PROOFS, 'readwrite');
      const store = tx.objectStore(KT_STORES.KT_PROOFS);

      const record = {
        userId,
        proof,
        treeSize,
        timestamp: Date.now(),
      };

      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Store a signed tree head.
   */
  static async storeTreeHead(treeHead) {
    const db = await getKTDatabase();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(KT_STORES.KT_TREE_HEADS, 'readwrite');
      const store = tx.objectStore(KT_STORES.KT_TREE_HEADS);

      const record = {
        ...treeHead,
        timestamp: treeHead.timestamp || Date.now(),
      };

      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
