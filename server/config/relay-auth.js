/**
 * OHTTP Relay → Gateway mutual authentication.
 *
 * Uses HMAC-SHA256 over a shared secret to authenticate that forwarded
 * OHTTP requests come from the trusted relay, not an arbitrary client.
 *
 * The gateway validates this signature on every forwarded request.
 * Without it, any process that can reach the gateway's internal address
 * could submit arbitrary OHTTP requests, bypassing the relay's IP-stripping.
 *
 * Secret configuration:
 *   OHTTP_RELAY_SECRET — 64-hex-char (32-byte) shared secret
 *   If unset, generates a random per-process secret and logs a warning.
 *   (Per-process secret breaks across restarts/replicas — set the env var in prod.)
 */

const crypto = require('crypto');
const { logger } = require('../utils');

class RelayAuthManager {
  constructor() {
    if (process.env.OHTTP_RELAY_SECRET) {
      if (process.env.OHTTP_RELAY_SECRET.length !== 64) {
        throw new Error('OHTTP_RELAY_SECRET must be exactly 64 hex characters (32 bytes)');
      }
      this._secret = Buffer.from(process.env.OHTTP_RELAY_SECRET, 'hex');
      logger.info('[OHTTP RelayAuth] Using configured OHTTP_RELAY_SECRET');
    } else {
      this._secret = crypto.randomBytes(32);
      logger.warn(
        '[OHTTP RelayAuth] OHTTP_RELAY_SECRET not set — using ephemeral random secret. ' +
        'This breaks across process restarts and replicas. Set OHTTP_RELAY_SECRET in production.'
      );
    }
  }

  /**
   * Sign a request body with HMAC-SHA256 for relay → gateway authentication.
   *
   * @param {Buffer} body - raw request body
   * @param {number} [timestamp] - unix ms (defaults to Date.now())
   * @returns {{ signature: string, timestamp: number }}
   */
  signRequest(body, timestamp = Date.now()) {
    const hmac = crypto.createHmac('sha256', this._secret);
    hmac.update(String(timestamp));
    hmac.update(':');
    hmac.update(body);
    return {
      signature: hmac.digest('hex'),
      timestamp,
    };
  }

  /**
   * Verify a relay → gateway request signature.
   *
   * Rejects signatures older than 30 seconds to prevent replay attacks.
   *
   * @param {Buffer} body - raw request body
   * @param {string} signature - hex HMAC from x-relay-auth header
   * @param {string|number} timestamp - from x-relay-timestamp header
   * @returns {boolean}
   */
  verifyRequest(body, signature, timestamp) {
    // Reject if timestamp is missing or obviously invalid
    const ts = parseInt(timestamp, 10);
    if (!ts || isNaN(ts)) return false;

    // Replay window: 30 seconds
    const age = Math.abs(Date.now() - ts);
    if (age > 30_000) {
      logger.warn(`[OHTTP RelayAuth] Signature timestamp too old/future: age=${age}ms`);
      return false;
    }

    const hmac = crypto.createHmac('sha256', this._secret);
    hmac.update(String(ts));
    hmac.update(':');
    hmac.update(body);
    const expected = hmac.digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch {
      return false;
    }
  }
}

module.exports = new RelayAuthManager();
