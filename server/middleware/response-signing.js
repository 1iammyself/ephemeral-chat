/**
 * response-signing.js — Ed25519 server-response signing
 *
 * Server signs key-bundle socket events so clients can verify they have not
 * been MITM'd by a compromised relay or network adversary.
 *
 * Key lifecycle:
 *   - Load from SERVER_SIGNING_KEY env var (base64-encoded PKCS#8 DER), or
 *   - Generate a fresh ephemeral key pair at startup (logged to stdout so
 *     the operator can persist it in SERVER_SIGNING_KEY).
 *
 * Signed events: key-bundle-roster, peer-key-bundle
 * Signature algorithm: Ed25519 (pure Ed25519 — no prehash)
 * Signature encoding: base64, attached as `_sig` field on the payload
 */

const nodeCrypto = require('crypto');
const { logger } = require('../utils');

/** Ed25519 private key (Node.js KeyObject) */
let signingKey = null;

/** Ed25519 public key (Node.js KeyObject) */
let verifyKey = null;

/** SPKI DER of the public key, base64-encoded — sent to clients */
let publicKeyBase64 = null;

// ─── Init ───────────────────────────────────────────────────

/**
 * Initialise the Ed25519 signing key.
 * Must be called before any signing operations.
 */
function initSigningKey() {
  if (process.env.SERVER_SIGNING_KEY) {
    try {
      const privDer = Buffer.from(process.env.SERVER_SIGNING_KEY, 'base64');
      signingKey = nodeCrypto.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });
      verifyKey = nodeCrypto.createPublicKey(signingKey);
      publicKeyBase64 = verifyKey.export({ type: 'spki', format: 'der' }).toString('base64');
      logger.info('[ResponseSigning] Loaded Ed25519 signing key from SERVER_SIGNING_KEY');
      return;
    } catch (e) {
      logger.warn('[ResponseSigning] Failed to parse SERVER_SIGNING_KEY, generating fresh key:', e.message);
    }
  }

  const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('ed25519');
  signingKey = privateKey;
  verifyKey = publicKey;
  publicKeyBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

  const privBase64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  logger.info(
    '[ResponseSigning] Generated ephemeral Ed25519 signing key. ' +
    'Set SERVER_SIGNING_KEY=' + privBase64 + ' in .env to persist across restarts.'
  );
}

// ─── Signing ────────────────────────────────────────────────

/**
 * Sign a UTF-8 string payload.
 * @param {string} payload
 * @returns {string} base64-encoded Ed25519 signature
 */
function signPayload(payload) {
  if (!signingKey) throw new Error('[ResponseSigning] Signing key not initialized. Call initSigningKey() first.');
  const sig = nodeCrypto.sign(null, Buffer.from(payload, 'utf8'), signingKey);
  return sig.toString('base64');
}

/**
 * Wrap a socket event data object with a server signature.
 * The signature is over the canonical JSON of the original (unsigned) data.
 * Recipients must strip `_sig` before re-serialising for verification.
 *
 * @param {Object} data - Socket event payload (must be JSON-serialisable)
 * @returns {Object} data + { _sig: string }
 */
function signSocketPayload(data) {
  const canonical = JSON.stringify(data);
  const sig = signPayload(canonical);
  return { ...data, _sig: sig };
}

/**
 * Get the server's Ed25519 public key (SPKI DER, base64).
 * Returns null if initSigningKey() has not been called yet.
 * @returns {string|null}
 */
function getPublicKeyBase64() {
  return publicKeyBase64;
}

module.exports = { initSigningKey, signPayload, signSocketPayload, getPublicKeyBase64 };
