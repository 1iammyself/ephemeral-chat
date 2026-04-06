/**
 * security-stack.test.js — Integration test for the server security stack
 *
 * Tests the full server security layer working together:
 *   1. Response signing (Ed25519) — key generation, sign, verify
 *   2. OHTTP relay-gateway HMAC auth — sign request, verify, replay protection
 *
 * Run: node server/integration/security-stack.test.js
 */

const assert = require('assert');
const nodeCrypto = require('crypto');

// ─── Module setup ────────────────────────────────────────────

const {
  initSigningKey,
  signSocketPayload,
  getPublicKeyBase64,
} = require('../middleware/response-signing');

const relayAuth = require('../config/relay-auth');
const { signRequest, verifyRequest } = {
  signRequest: relayAuth.signRequest.bind(relayAuth),
  verifyRequest: relayAuth.verifyRequest.bind(relayAuth),
};

// ─── Test Runner ──────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✅', name);
    passed++;
  } catch (e) {
    console.error('  ❌', name, '—', e.message);
    failed++;
  }
}

console.log('\nSecurity Stack Integration Tests\n');

// ─── 1. Response Signing ──────────────────────────────────────

console.log('1. Response Signing');

test('initSigningKey runs without error', () => {
  initSigningKey();
});

test('getPublicKeyBase64 returns a DER-encoded SPKI key (76-88 base64 chars for Ed25519)', () => {
  const pub = getPublicKeyBase64();
  assert.ok(typeof pub === 'string');
  const decoded = Buffer.from(pub, 'base64');
  assert.ok(decoded.length >= 40, `Key should be at least 40 bytes, got ${decoded.length}`);
});

test('signSocketPayload produces a verifiable payload', () => {
  const data = { bundles: [{ socketId: 'abc', bundle: { identityKey: 'xyz' } }], roomCode: 'TEST1' };
  const signed = signSocketPayload(data);
  assert.ok(typeof signed._sig === 'string', '_sig must be present');
  assert.strictEqual(signed.roomCode, 'TEST1', 'Original fields preserved');

  const { _sig, ...unsigned } = signed;
  const sigBuf = Buffer.from(_sig, 'base64');
  const canonical = JSON.stringify(unsigned);
  const pubKeyDer = Buffer.from(getPublicKeyBase64(), 'base64');
  const pubKey = nodeCrypto.createPublicKey({ key: pubKeyDer, format: 'der', type: 'spki' });
  const valid = nodeCrypto.verify(null, Buffer.from(canonical, 'utf8'), pubKey, sigBuf);
  assert.ok(valid, 'Signature should verify');
});

// ─── 2. OHTTP Relay-Gateway HMAC Auth ────────────────────────

console.log('\n2. OHTTP Relay-Gateway HMAC Auth');

test('signRequest returns valid signature + timestamp', () => {
  const { signature, timestamp } = signRequest('{"method":"GET"}');
  assert.ok(typeof signature === 'string' && signature.length > 10, 'signature present');
  assert.ok(typeof timestamp === 'number' && timestamp > 0, 'timestamp present');
});

test('verifyRequest accepts a fresh valid signature', () => {
  const body = '{"method":"POST","path":"/ohttp"}';
  const { signature, timestamp } = signRequest(body);
  const ok = verifyRequest(body, signature, timestamp);
  assert.ok(ok, 'Fresh signature should verify');
});

test('verifyRequest rejects tampered body', () => {
  const body = '{"method":"POST"}';
  const { signature, timestamp } = signRequest(body);
  const ok = verifyRequest('{"method":"DELETE"}', signature, timestamp);
  assert.ok(!ok, 'Tampered body should fail verification');
});

test('verifyRequest rejects expired timestamp (>30s old)', () => {
  const body = '{"method":"GET"}';
  const oldTimestamp = Date.now() - 31000;
  const { signature } = signRequest(body);
  const ok = verifyRequest(body, signature, oldTimestamp);
  assert.ok(!ok, 'Expired timestamp should fail verification');
});

// ─── Summary ─────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
