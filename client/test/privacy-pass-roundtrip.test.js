/**
 * Privacy Pass VOPRF round-trip — client ↔ server compatibility guard.
 *
 * WHY THIS TEST EXISTS
 *   The client (`client/src/crypto/privacy-pass.js`) and the server
 *   (`server/privacy-pass-issuer.js`) implement two halves of the same
 *   Ristretto255 VOPRF and MUST agree on the wire format, byte-for-byte:
 *     - hash-to-group  (RistrettoPoint.hashToCurve)
 *     - point ser/de   (toRawBytes / fromHex)
 *     - scalar mult    (point.multiply)
 *     - DLEQ proof     (Fiat–Shamir over SHA-512)
 *   These all flow through `@noble/curves`. Several of the methods in use
 *   (`hashToCurve`, `toRawBytes`) are *deprecated* in current 1.x and will be
 *   removed in `@noble/curves` 2.x. This test is the guardrail: when you bump
 *   the dependency, run it. If the encoding changed, the round trip fails here
 *   instead of silently breaking token issuance in production.
 *
 *   It also pins the issuer URL contract — the client must request the exact
 *   routes the server's Express app exposes (`/privacy-pass/config`,
 *   `/privacy-pass/issue`).
 *
 * HOW IT WORKS
 *   No network and no Express server. We mock `globalThis.fetch` and back it
 *   with the REAL server issuer functions (`getIssuerConfig`, `issueTokens`),
 *   then drive the REAL client (`initPrivacyPass`, `getAuthToken`). The token
 *   the client produces is handed to the REAL server `verifyToken`. If either
 *   side fell back to its non-blind stand-in, or the encodings diverged, the
 *   final verification would fail.
 *
 * RUN
 *   node --test client/test/privacy-pass-roundtrip.test.js
 *   (or: npm run test:privacy-pass  from the repo root)
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// The server module is CommonJS; load it from this ESM test via createRequire.
// NOTE: we deliberately do NOT set NODE_ENV=development. The server throws at
// import time if `@noble/curves` is missing rather than using its unsafe
// fallback — so a green run also proves the production crypto path is wired.
const require = createRequire(import.meta.url);
const ppIssuer = require('../../server/privacy-pass-issuer.js');

import {
  initPrivacyPass,
  getAuthToken,
  getTokenCount,
  isPrivacyPassReady,
} from '../src/crypto/privacy-pass.js';

// issuer "base" URL — already includes /privacy-pass, mirroring what the server
// advertises as `privacyPassIssuerUrl` and what ChatRoom falls back to.
const ISSUER_BASE = 'http://issuer.test/privacy-pass';

/** Every URL the client requested, so we can assert the route contract. */
const requestedUrls = [];

let originalFetch;

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

/**
 * fetch mock backed by the real server issuer. Mirrors exactly what
 * `attachPrivacyPassRoutes` does for the two endpoints the client hits.
 */
function mockFetch(url, options = {}) {
  requestedUrls.push(url);

  if (url.endsWith('/privacy-pass/config')) {
    return Promise.resolve(jsonResponse(ppIssuer.getIssuerConfig()));
  }

  if (url.endsWith('/privacy-pass/issue')) {
    const body = JSON.parse(options.body);
    const elements = body.blindedElements || body.blindedTokens;
    const { signedTokens, proofs } = ppIssuer.issueTokens(elements, '127.0.0.1');
    // Match the route's response shape (both field names for client compat).
    return Promise.resolve(jsonResponse({
      signedTokens,
      signedElements: signedTokens,
      proofs,
    }));
  }

  return Promise.resolve(jsonResponse({ error: 'not found' }, { ok: false, status: 404 }));
}

/** Parse the server's `Authorization: PrivacyPass token="..", authenticator=".."`. */
function parsePrivacyPassHeader(header) {
  const token = header.match(/token="([^"]+)"/)?.[1];
  const authenticator = header.match(/authenticator="([^"]+)"/)?.[1];
  return { token, authenticator };
}

/** Flip one byte of a base64 payload so it decodes to different bytes. */
function tamperBase64(b64) {
  const buf = Buffer.from(b64, 'base64');
  buf[0] ^= 0xff;
  return buf.toString('base64');
}

before(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  ppIssuer.initIssuer();
});

after(() => {
  globalThis.fetch = originalFetch;
  if (typeof ppIssuer.stopCleanup === 'function') ppIssuer.stopCleanup();
});

test('client initializes against the correct issuer routes and gets tokens', async () => {
  await initPrivacyPass(ISSUER_BASE);

  assert.ok(isPrivacyPassReady(), 'Privacy Pass should be ready after init');
  assert.ok(getTokenCount() > 0, 'token store should be populated after prefetch');

  // Route contract: these must equal the server's Express routes. The previous
  // doubled-path bug (`/privacy-pass/privacy-pass/config`) would fail here.
  assert.ok(
    requestedUrls.includes(`${ISSUER_BASE}/config`),
    `expected GET ${ISSUER_BASE}/config — got: ${requestedUrls.join(', ')}`,
  );
  assert.ok(
    requestedUrls.includes(`${ISSUER_BASE}/issue`),
    `expected POST ${ISSUER_BASE}/issue — got: ${requestedUrls.join(', ')}`,
  );
});

test('a client-issued token verifies on the server (blind → sign → unblind → verify)', () => {
  const header = getAuthToken();
  assert.ok(header?.Authorization, 'getAuthToken should return an Authorization header');

  const { token, authenticator } = parsePrivacyPassHeader(header.Authorization);
  assert.ok(token && authenticator, 'header should contain token and authenticator');

  const result = ppIssuer.verifyToken(token, authenticator);
  assert.equal(result.valid, true, `token should verify; reason: ${result.reason}`);
});

test('a tampered authenticator is rejected', () => {
  const header = getAuthToken();
  const { token, authenticator } = parsePrivacyPassHeader(header.Authorization);

  const result = ppIssuer.verifyToken(token, tamperBase64(authenticator));
  assert.equal(result.valid, false, 'a tampered authenticator must not verify');
});

test('replaying the same token is rejected (double-spend protection)', () => {
  const header = getAuthToken();
  const { token, authenticator } = parsePrivacyPassHeader(header.Authorization);

  const first = ppIssuer.verifyToken(token, authenticator);
  assert.equal(first.valid, true, `first redemption should succeed; reason: ${first.reason}`);

  const second = ppIssuer.verifyToken(token, authenticator);
  assert.equal(second.valid, false, 'second redemption must be rejected');
  assert.match(second.reason || '', /spent/i, 'rejection reason should mention double-spend');
});
