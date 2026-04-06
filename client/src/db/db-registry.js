/**
 * db-registry.js — Central index of all IndexedDB databases used by the
 * ephemeral-chat security layer.
 *
 * Each security module owns exactly one database. This file documents them
 * all in one place for discoverability, version tracking, and to prevent
 * naming conflicts between modules.
 *
 * To add a new database:
 *   1. Pick a unique name under the 'ephchat-' prefix.
 *   2. Increment DB_VERSION when adding or removing object stores.
 *   3. Add an entry to SECURITY_DATABASES below.
 *   4. Handle the onupgradeneeded event in the owning module.
 */

/**
 * Registry of all security-layer IndexedDB databases.
 *
 * Schema summary:
 *
 * ephchat-kt-store (v1)
 *   tofu_pins       — KT server public key TOFU pins { serverHost, pin, publicKey, timestamp, verified }
 *   kt_proofs       — Merkle inclusion proofs        { userId, proof, treeSize, timestamp }
 *   tree_heads      — Signed tree heads              { timestamp, rootHash, signature, treeSize }
 *
 * ephchat-device (v1)
 *   device_info     — Persistent device fingerprint  { id: 'fingerprint', value: hexString, timestamp }
 *
 * ephchat-server-pin (v1)
 *   server_keys     — Ed25519 server signing key pin { id: 'server-ed25519', key: base64DER, pinnedAt }
 */
export const SECURITY_DATABASES = [
  {
    name: 'ephchat-kt-store',
    version: 1,
    module: 'client/src/db/kt-schema.js',
    stores: [
      { name: 'tofu_pins',    keyPath: 'serverHost',         description: 'KT TOFU public key pins' },
      { name: 'kt_proofs',    keyPath: ['userId', 'treeSize'], description: 'Merkle inclusion proofs' },
      { name: 'tree_heads',   keyPath: 'timestamp',           description: 'Signed tree heads' },
    ],
  },
  {
    name: 'ephchat-device',
    version: 1,
    module: 'client/src/crypto/device-fingerprint.js',
    stores: [
      { name: 'device_info', keyPath: 'id', description: 'Persistent device fingerprint' },
    ],
  },
  {
    name: 'ephchat-server-pin',
    version: 1,
    module: 'client/src/crypto/server-signing.js',
    stores: [
      { name: 'server_keys', keyPath: 'id', description: 'Ed25519 server signing key TOFU pin' },
    ],
  },
];

/** Lookup a database entry by name. */
export function getDBEntry(name) {
  return SECURITY_DATABASES.find(db => db.name === name) ?? null;
}
