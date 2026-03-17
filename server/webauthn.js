/**
 * WebAuthn / Passkey Support — FIDO2 (W3C WebAuthn Level 2)
 *
 * Implements minimal server-side WebAuthn verification using Node.js built-in
 * crypto. Supports P-256 (ES256, COSE algorithm -7) credential creation and
 * assertion — the algorithm used by virtually all hardware keys, Face ID,
 * Touch ID, and Windows Hello.
 *
 * No external dependencies — uses Node.js `crypto` only.
 *
 * Flow:
 *   Registration:
 *     POST /auth/webauthn/register/begin    → { challenge, rp, user, ... }
 *     POST /auth/webauthn/register/complete → verify + store credential
 *
 *   Authentication:
 *     POST /auth/webauthn/authenticate/begin    → { challenge, allowCredentials }
 *     POST /auth/webauthn/authenticate/complete → verify assertion → session token
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { logger } = require('./utils');

// ─── JWT session config ─────────────────────────────────────
if (!process.env.WEBAUTHN_JWT_SECRET) {
  throw new Error('[FATAL] WEBAUTHN_JWT_SECRET environment variable is required.');
}
const JWT_SECRET = process.env.WEBAUTHN_JWT_SECRET;
const JWT_EXPIRES_IN = '8h';

// ─── In-Memory Storage (ephemeral; cleared on server restart) ──────────────
// userId → [{ credentialId, publicKeyPem, signCount, createdAt }]
const credentialStore = new Map();

// Pending challenges: challengeId → { challenge, userId, expiresAt }
const pendingChallenges = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Configuration ──────────────────────────────────────────────────────────
// Derive defaults from PUBLIC_URL when deployed (e.g. PUBLIC_URL=https://chat.example.com)
const _publicUrl  = process.env.PUBLIC_URL;
const _publicHost = _publicUrl ? (() => { try { return new URL(_publicUrl).hostname; } catch (_) { return null; } })() : null;

const RP_ID   = process.env.WEBAUTHN_RP_ID   || _publicHost || 'localhost';
const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'Ephemeral Chat';
const ORIGIN  = process.env.WEBAUTHN_ORIGIN  || _publicUrl  || `http://localhost:${process.env.PORT || 3001}`;

if (process.env.NODE_ENV === 'production' && RP_ID === 'localhost') {
  logger.warn('[WebAuthn] RP_ID resolved to "localhost" in production — set PUBLIC_URL or WEBAUTHN_RP_ID');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateChallenge() {
  return crypto.randomBytes(32).toString('base64url');
}

function b64urlDecode(b64url) {
  return Buffer.from(b64url.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

/**
 * Parse an authenticatorData buffer (§6.1 of WebAuthn spec).
 * Returns { rpIdHash, flags, signCount, attestedCredentialData? }
 */
function parseAuthenticatorData(buf) {
  if (buf.length < 37) throw new Error('authenticatorData too short');
  const rpIdHash = buf.slice(0, 32);
  const flags    = buf[32];
  const signCount = buf.readUInt32BE(33);

  const UP = !!(flags & 0x01); // user present
  const UV = !!(flags & 0x04); // user verified
  const AT = !!(flags & 0x40); // attested credential data present

  let attestedCredentialData = null;
  if (AT) {
    // AAGUID (16 bytes) + credentialIdLength (2 bytes) + credentialId + COSE key
    const aaguid = buf.slice(37, 53);
    const credIdLen = buf.readUInt16BE(53);
    const credentialId = buf.slice(55, 55 + credIdLen);
    const coseKey = buf.slice(55 + credIdLen); // remainder is CBOR-encoded COSE key
    attestedCredentialData = { aaguid, credentialId, coseKey };
  }

  return { rpIdHash, flags: { UP, UV, AT }, signCount, attestedCredentialData };
}

/**
 * Minimally parse a CBOR-encoded COSE EC2 P-256 public key (algorithm -7).
 * Returns the raw x and y coordinates as Buffers.
 *
 * COSE key map for P-256 (RFC 8152):
 *   1  → kty:  2 (EC2)
 *   3  → alg: -7 (ES256)
 *  -1  → crv:  1 (P-256)
 *  -2  → x:    32-byte coordinate
 *  -3  → y:    32-byte coordinate
 */
function parseCOSEPublicKey(coseBytes) {
  // Lightweight CBOR decoder — only supports the subset we need
  let pos = 0;

  function readByte() { return coseBytes[pos++]; }
  function readBytes(n) { const b = coseBytes.slice(pos, pos + n); pos += n; return b; }

  function readUint() {
    const b = readByte();
    const info = b & 0x1f;
    if (info < 24) return info;
    if (info === 24) return readByte();
    if (info === 25) { const v = coseBytes.readUInt16BE(pos); pos += 2; return v; }
    throw new Error('CBOR uint too large');
  }

  function readInt() {
    const b = readByte();
    const major = (b >> 5) & 0x07;
    const info  = b & 0x1f;
    let n = info < 24 ? info : info === 24 ? readByte() : (() => { throw new Error('CBOR int too large'); })();
    if (major === 0) return n;        // positive int
    if (major === 1) return -(n + 1); // negative int
    throw new Error(`Unexpected CBOR major type ${major}`);
  }

  function readItem() {
    const peek = coseBytes[pos];
    const major = (peek >> 5) & 0x07;
    if (major === 0 || major === 1) return readInt();
    if (major === 2) { // byte string
      const len = readUint();
      return readBytes(len);
    }
    if (major === 3) { // text string
      pos++; // skip the initial byte we peeked
      const len = ((peek & 0x1f) < 24 ? (peek & 0x1f) : readByte());
      return readBytes(len).toString('utf8');
    }
    throw new Error(`Unsupported CBOR major type ${major}`);
  }

  // Read map
  const mapByte = readByte();
  if ((mapByte >> 5) !== 5) throw new Error('Expected CBOR map');
  const mapLen = mapByte & 0x1f;

  const map = {};
  for (let i = 0; i < mapLen; i++) {
    const key = readItem();
    const val = readItem();
    map[key] = val;
  }

  // Extract x and y for P-256 (crv=1)
  const x = map[-2];
  const y = map[-3];
  if (!x || !y || x.length !== 32 || y.length !== 32) {
    throw new Error('Could not extract P-256 public key coordinates from COSE key');
  }

  return { x, y };
}

/**
 * Convert raw P-256 (x, y) coordinates to a PEM SubjectPublicKeyInfo
 * so that Node.js crypto.verify() can use it.
 */
function coseKeyToPem(x, y) {
  // SubjectPublicKeyInfo DER for P-256 uncompressed point:
  //   30 59 30 13 06 07 2A 86 48 CE 3D 02 01 06 08 2A 86 48 CE 3D 03 01 07 03 42 00 04 [x 32 bytes] [y 32 bytes]
  const prefix = Buffer.from(
    '3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex'
  );
  const point = Buffer.concat([Buffer.from([0x04]), x, y]);
  const der = Buffer.concat([prefix, point]);
  const b64 = der.toString('base64');
  const lines = b64.match(/.{1,64}/g).join('\n');
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

/**
 * Verify a WebAuthn assertion signature (ES256 = SHA-256 + ECDSA P-256).
 * @param {string} publicKeyPem - stored credential public key
 * @param {Buffer} authenticatorData
 * @param {Buffer} clientDataHash - SHA-256 of clientDataJSON
 * @param {Buffer} signature - DER-encoded ECDSA signature
 */
function verifyAssertion(publicKeyPem, authenticatorData, clientDataHash, signature) {
  const signedData = Buffer.concat([authenticatorData, clientDataHash]);
  return crypto.verify('SHA256', signedData, publicKeyPem, signature);
}

// ─── Cleanup ────────────────────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [id, c] of pendingChallenges) {
    if (now > c.expiresAt) pendingChallenges.delete(id);
  }
}, 60_000);

// ─── Route Handler ──────────────────────────────────────────────────────────

/**
 * Attach WebAuthn routes to an Express app.
 * @param {import('express').Application} app
 */
function attachWebAuthnRoutes(app) {
  const express = require('express');
  const router  = express.Router();
  router.use(express.json({ limit: '128kb' }));

  // ── Registration Begin ────────────────────────────────────
  router.post('/register/begin', (req, res) => {
    const { userId, username } = req.body || {};
    if (!userId || !username) {
      return res.status(400).json({ error: 'userId and username are required' });
    }
    if (typeof userId !== 'string' || userId.length > 64) {
      return res.status(400).json({ error: 'userId must be a string ≤ 64 characters' });
    }
    if (typeof username !== 'string' || username.length > 128) {
      return res.status(400).json({ error: 'username must be a string ≤ 128 characters' });
    }

    const challenge = generateChallenge();
    const challengeId = crypto.randomBytes(16).toString('hex');

    pendingChallenges.set(challengeId, {
      challenge,
      userId: String(userId),
      type: 'registration',
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });

    const existingCreds = credentialStore.get(String(userId)) || [];

    res.json({
      challengeId,
      challenge,
      rp: { id: RP_ID, name: RP_NAME },
      user: {
        id: b64urlEncode(Buffer.from(String(userId))),
        name: username,
        displayName: username,
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256
      timeout: 60_000,
      excludeCredentials: existingCreds.map(c => ({
        type: 'public-key',
        id: c.credentialId,
      })),
      authenticatorSelection: {
        userVerification: 'required',
        residentKey: 'preferred',
      },
      attestation: 'none',
    });
  });

  // ── Registration Complete ─────────────────────────────────
  router.post('/register/complete', (req, res) => {
    const { challengeId, id, rawId, response, type } = req.body || {};

    const pending = pendingChallenges.get(challengeId);
    if (!pending || pending.type !== 'registration' || Date.now() > pending.expiresAt) {
      return res.status(400).json({ error: 'Invalid or expired challenge' });
    }
    pendingChallenges.delete(challengeId);

    try {
      const clientDataJSON   = b64urlDecode(response.clientDataJSON);
      const attestationObject = b64urlDecode(response.attestationObject);

      // Verify clientDataJSON
      const clientData = JSON.parse(clientDataJSON.toString('utf8'));
      if (clientData.type !== 'webauthn.create') {
        return res.status(400).json({ error: 'Wrong clientData type' });
      }
      if (clientData.challenge !== pending.challenge) {
        return res.status(400).json({ error: 'Challenge mismatch' });
      }
      if (clientData.origin !== ORIGIN) {
        logger.warn(`[WebAuthn] Origin mismatch: got ${clientData.origin}, expected ${ORIGIN}`);
        return res.status(400).json({ error: 'Origin mismatch' });
      }

      // Minimal CBOR decode of attestationObject to get authData
      // attestationObject = { fmt, attStmt, authData } — we only need authData
      // For fmt="none", attStmt is empty map. We find authData by scanning for key "authData".
      const authDataBuf = extractAuthDataFromCBOR(attestationObject);

      const authData = parseAuthenticatorData(authDataBuf);
      if (!authData.flags.UP) {
        return res.status(400).json({ error: 'User presence flag not set' });
      }
      if (!authData.flags.UV) {
        return res.status(400).json({ error: 'User verification required' });
      }

      // Verify RP ID hash matches expected RP_ID (WebAuthn spec 7.1 step 13)
      const expectedRpIdHash = crypto.createHash('sha256').update(RP_ID).digest();
      if (!authData.rpIdHash.equals(expectedRpIdHash)) {
        return res.status(400).json({ error: 'RP ID mismatch during registration' });
      }

      if (!authData.attestedCredentialData) {
        return res.status(400).json({ error: 'No attested credential data' });
      }

      const { credentialId, coseKey } = authData.attestedCredentialData;
      const { x, y } = parseCOSEPublicKey(coseKey);
      const publicKeyPem = coseKeyToPem(x, y);

      // Store credential
      const creds = credentialStore.get(pending.userId) || [];
      creds.push({
        credentialId: b64urlEncode(credentialId),
        publicKeyPem,
        signCount: authData.signCount,
        createdAt: Date.now(),
      });
      credentialStore.set(pending.userId, creds);

      logger.info(`[WebAuthn] Registered passkey for user ${pending.userId}`);
      res.json({ success: true, credentialId: b64urlEncode(credentialId) });

    } catch (e) {
      logger.error('[WebAuthn] Registration error:', e.message);
      res.status(400).json({ error: 'Registration failed. Please try again.' });
    }
  });

  // ── Authentication Begin ──────────────────────────────────
  router.post('/authenticate/begin', (req, res) => {
    const { userId } = req.body || {};

    const challenge = generateChallenge();
    const challengeId = crypto.randomBytes(16).toString('hex');

    pendingChallenges.set(challengeId, {
      challenge,
      userId: userId ? String(userId) : null,
      type: 'authentication',
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });

    const allowCredentials = userId
      ? (credentialStore.get(String(userId)) || []).map(c => ({
          type: 'public-key',
          id: c.credentialId,
        }))
      : [];

    res.json({
      challengeId,
      challenge,
      timeout: 60_000,
      rpId: RP_ID,
      allowCredentials,
      userVerification: 'required',
    });
  });

  // ── Authentication Complete ────────────────────────────────
  router.post('/authenticate/complete', (req, res) => {
    const { challengeId, id, rawId, response, type } = req.body || {};

    const pending = pendingChallenges.get(challengeId);
    if (!pending || pending.type !== 'authentication' || Date.now() > pending.expiresAt) {
      return res.status(400).json({ error: 'Invalid or expired challenge' });
    }
    pendingChallenges.delete(challengeId);

    try {
      const clientDataJSON    = b64urlDecode(response.clientDataJSON);
      const authenticatorData = b64urlDecode(response.authenticatorData);
      const signature         = b64urlDecode(response.signature);

      // Verify clientDataJSON
      const clientData = JSON.parse(clientDataJSON.toString('utf8'));
      if (clientData.type !== 'webauthn.get') {
        return res.status(400).json({ error: 'Wrong clientData type' });
      }
      if (clientData.challenge !== pending.challenge) {
        return res.status(400).json({ error: 'Challenge mismatch' });
      }
      if (clientData.origin !== ORIGIN) {
        logger.warn(`[WebAuthn] Origin mismatch: got ${clientData.origin}, expected ${ORIGIN}`);
        return res.status(400).json({ error: 'Origin mismatch' });
      }

      // Find the credential
      const credId = id || rawId; // base64url
      let matchedCred = null;
      let matchedUserId = pending.userId;

      if (pending.userId) {
        const creds = credentialStore.get(pending.userId) || [];
        matchedCred = creds.find(c => c.credentialId === credId);
      } else {
        // Resident key / usernameless — search all users
        for (const [uid, creds] of credentialStore) {
          const found = creds.find(c => c.credentialId === credId);
          if (found) { matchedCred = found; matchedUserId = uid; break; }
        }
      }

      if (!matchedCred) {
        return res.status(400).json({ error: 'Credential not found' });
      }

      // Verify rpIdHash
      const authData = parseAuthenticatorData(authenticatorData);
      const expectedRpIdHash = crypto.createHash('sha256').update(RP_ID).digest();
      if (!authData.rpIdHash.equals(expectedRpIdHash)) {
        return res.status(400).json({ error: 'RP ID mismatch' });
      }
      if (!authData.flags.UP) {
        return res.status(400).json({ error: 'User presence flag not set' });
      }
      if (!authData.flags.UV) {
        return res.status(400).json({ error: 'User verification flag not set — PIN or biometric required' });
      }

      // Verify signature
      const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();
      const valid = verifyAssertion(
        matchedCred.publicKeyPem,
        authenticatorData,
        clientDataHash,
        signature,
      );

      if (!valid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Sign count check (replay protection)
      if (authData.signCount > 0 && authData.signCount <= matchedCred.signCount) {
        logger.warn(`[WebAuthn] Sign count rollback for credential ${credId} — possible cloned authenticator`);
        return res.status(401).json({ error: 'Sign count rollback detected' });
      }
      matchedCred.signCount = authData.signCount;

      // Issue a signed session token — binds authenticated identity to subsequent requests
      const sessionToken = jwt.sign(
        { sub: matchedUserId, credentialId: credId },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' },
      );

      logger.info(`[WebAuthn] Authentication successful for user ${matchedUserId}`);
      res.json({ success: true, userId: matchedUserId, sessionToken });

    } catch (e) {
      logger.error('[WebAuthn] Authentication error:', e.message);
      res.status(400).json({ error: 'Authentication failed. Please try again.' });
    }
  });

  app.use('/auth/webauthn', router);
  logger.info('🔑 WebAuthn passkey endpoints registered at /auth/webauthn');
}

// ─── CBOR authData extractor ─────────────────────────────────────────────────
/**
 * Extract the authData bytes from an attestationObject CBOR buffer.
 *
 * Uses a proper CBOR decoder that handles all standard encodings:
 * definite-length maps, strings of any length encoding (tiny/1-byte/2-byte),
 * and any key ordering. This replaces the previous byte-scan approach that
 * could fail on authenticators with non-standard byte layout.
 */
function extractAuthDataFromCBOR(buf) {
  // Decode the top-level CBOR map and extract the "authData" value
  const result = decodeCBORMap(buf, 0);
  if (!result || !result.map || !result.map.authData) {
    throw new Error('Could not find authData in attestationObject');
  }
  return result.map.authData;
}

/**
 * Minimal CBOR decoder sufficient for WebAuthn attestationObject.
 * Supports: unsigned ints, byte strings, text strings, maps (definite length).
 * Returns { value, offset } for the next CBOR item at position `pos`.
 */
function decodeCBORItem(buf, pos) {
  if (pos >= buf.length) throw new Error('CBOR: unexpected end of input');
  const initial = buf[pos];
  const majorType = initial >> 5;
  const additionalInfo = initial & 0x1f;
  pos += 1;

  // Decode argument (length or value)
  let argument;
  if (additionalInfo < 24) {
    argument = additionalInfo;
  } else if (additionalInfo === 24) {
    argument = buf[pos]; pos += 1;
  } else if (additionalInfo === 25) {
    argument = buf.readUInt16BE(pos); pos += 2;
  } else if (additionalInfo === 26) {
    argument = buf.readUInt32BE(pos); pos += 4;
  } else if (additionalInfo === 27) {
    // 8-byte int — use Number (safe for lengths < 2^53)
    const hi = buf.readUInt32BE(pos);
    const lo = buf.readUInt32BE(pos + 4);
    argument = hi * 0x100000000 + lo;
    pos += 8;
  } else {
    throw new Error(`CBOR: unsupported additional info ${additionalInfo}`);
  }

  switch (majorType) {
    case 0: // unsigned integer
      return { value: argument, offset: pos };
    case 1: // negative integer
      return { value: -1 - argument, offset: pos };
    case 2: // byte string
      return { value: buf.slice(pos, pos + argument), offset: pos + argument };
    case 3: // text string
      return { value: buf.slice(pos, pos + argument).toString('utf8'), offset: pos + argument };
    case 4: { // array
      const arr = [];
      let cursor = pos;
      for (let i = 0; i < argument; i++) {
        const item = decodeCBORItem(buf, cursor);
        arr.push(item.value);
        cursor = item.offset;
      }
      return { value: arr, offset: cursor };
    }
    case 5: { // map
      const map = {};
      let cursor = pos;
      for (let i = 0; i < argument; i++) {
        const keyItem = decodeCBORItem(buf, cursor);
        cursor = keyItem.offset;
        const valItem = decodeCBORItem(buf, cursor);
        cursor = valItem.offset;
        map[keyItem.value] = valItem.value;
      }
      return { value: map, offset: cursor };
    }
    default:
      throw new Error(`CBOR: unsupported major type ${majorType}`);
  }
}

function decodeCBORMap(buf, pos) {
  const result = decodeCBORItem(buf, pos);
  return { map: result.value, offset: result.offset };
}

module.exports = { attachWebAuthnRoutes };
