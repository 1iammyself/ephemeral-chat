/**
 * Server-signing contract — Ed25519 (server signs ↔ client verifies).
 *
 * The server (server/middleware/response-signing.js) signs JSON.stringify(data)
 * and attaches `_sig`; the client (crypto/server-signing.js verifyServerSignature)
 * strips `_sig`, re-serialises, and verifies. If those canonicalizations ever
 * drift, EVERY signed event (key-bundle-roster, peer-key-bundle, …) is silently
 * dropped by the client. This pins the contract end-to-end.
 *
 * The client's verifyServerSignature needs a pinned key from initServerSigning()
 * (IndexedDB + fetch, browser-only), so we exercise the REAL server signer and
 * replicate the client's exact verify steps (import 'spki' Ed25519, strip _sig,
 * JSON.stringify, subtle.verify) — kept byte-identical to the source.
 *
 * RUN: node --test client/test/server-signing-contract.test.js
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const signing = require('../../server/middleware/response-signing.js');

// ── Mirror of crypto/server-signing.js (_importPublicKey + verifyServerSignature) ──
async function clientImportKey(base64SpkiDer) {
  const der = Uint8Array.from(atob(base64SpkiDer), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('spki', der, { name: 'Ed25519' }, false, ['verify']);
}

async function clientVerify(pubKey, data) {
  const { _sig, ...unsigned } = data;
  if (!_sig) return false;
  try {
    const sigBytes = Uint8Array.from(atob(_sig), (c) => c.charCodeAt(0));
    const msgBytes = new TextEncoder().encode(JSON.stringify(unsigned));
    return await crypto.subtle.verify('Ed25519', pubKey, sigBytes, msgBytes);
  } catch {
    return false;
  }
}

let pubKey;
before(async () => {
  signing.initSigningKey();
  pubKey = await clientImportKey(signing.getPublicKeyBase64());
});

test('a server-signed socket payload verifies with the client algorithm', async () => {
  const signed = signing.signSocketPayload({
    roomCode: 'ROOM',
    bundles: [{ socketId: 'peer-1', bundle: { ik: 'aa', ek: 'bb' } }],
    ts: 1700000000000,
  });
  assert.ok(signed._sig, 'server attaches _sig');
  assert.equal(await clientVerify(pubKey, signed), true);
});

test('tampering with any field invalidates the signature', async () => {
  const signed = signing.signSocketPayload({ roomCode: 'ROOM', isHost: false, ts: 123 });
  signed.isHost = true; // privilege-escalation attempt after signing
  assert.equal(await clientVerify(pubKey, signed), false);
});

test('a missing signature fails closed', async () => {
  const signed = signing.signSocketPayload({ a: 1, b: 2 });
  delete signed._sig;
  assert.equal(await clientVerify(pubKey, signed), false);
});

test('a signature from a different key does not verify', async () => {
  const signed = signing.signSocketPayload({ roomCode: 'ROOM' });
  // Import an unrelated Ed25519 public key.
  const otherDer = require('crypto').generateKeyPairSync('ed25519').publicKey
    .export({ type: 'spki', format: 'der' }).toString('base64');
  const otherKey = await clientImportKey(otherDer);
  assert.equal(await clientVerify(otherKey, signed), false);
});
