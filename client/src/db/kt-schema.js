/**
 * IndexedDB schema for Key Transparency TOFU pins and proofs.
 *
 * Security: Persists server public key pins across sessions to detect
 * key substitution attacks (TOFU — Trust On First Use).
 */

export const KT_DB_NAME = 'ephchat-kt-store';
export const KT_DB_VERSION = 1;

export const KT_STORES = {
  TOFU_PINS: 'tofu_pins',      // { serverHost, pin, publicKey, timestamp, verified }
  KT_PROOFS: 'kt_proofs',      // { userId, proof, treeSize, timestamp }
  KT_TREE_HEADS: 'tree_heads', // { timestamp, rootHash, signature, treeSize }
};

/**
 * Open/create the KT IndexedDB database.
 */
export function initKTDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KT_DB_NAME, KT_DB_VERSION);

    req.onerror = () => reject(req.error);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(KT_STORES.TOFU_PINS)) {
        const tofuStore = db.createObjectStore(KT_STORES.TOFU_PINS, { keyPath: 'serverHost' });
        tofuStore.createIndex('verified', 'verified');
        tofuStore.createIndex('timestamp', 'timestamp');
      }

      if (!db.objectStoreNames.contains(KT_STORES.KT_PROOFS)) {
        const proofStore = db.createObjectStore(KT_STORES.KT_PROOFS, { keyPath: ['userId', 'treeSize'] });
        proofStore.createIndex('userId', 'userId');
        proofStore.createIndex('timestamp', 'timestamp');
      }

      if (!db.objectStoreNames.contains(KT_STORES.KT_TREE_HEADS)) {
        db.createObjectStore(KT_STORES.KT_TREE_HEADS, { keyPath: 'timestamp' });
      }
    };

    req.onsuccess = () => resolve(req.result);
  });
}

/**
 * Get or initialize the KT database.
 */
export async function getKTDatabase() {
  return await initKTDatabase();
}
