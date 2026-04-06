/**
 * response-signing.test.js — Tests for Ed25519 server-response signing
 *
 * Run: node server/middleware/response-signing.test.js
 */

const assert = require('assert');
const nodeCrypto = require('crypto');

// ─── Module under test ──────────────────────────────────────
const {
  initSigningKey,
  signPayload,
  signSocketPayload,
  getPublicKeyBase64,
} = require('./response-signing');

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

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log('  ✅', name);
    passed++;
  } catch (e) {
    console.error('  ❌', name, '—', e.message);
    failed++;
  }
}

console.log('\nResponse Signing Tests\n');

// ─── Test: initSigningKey ───────────────────────────────────

test('initSigningKey generates a key pair', () => {
  initSigningKey(); // should not throw
  const pub = getPublicKeyBase64();
  assert.ok(typeof pub === 'string' && pub.length > 40, 'Public key should be a non-empty base64 string');
});

test('getPublicKeyBase64 returns consistent value on repeated calls', () => {
  const a = getPublicKeyBase64();
  const b = getPublicKeyBase64();
  assert.strictEqual(a, b, 'Should return the same key on repeated calls');
});

// ─── Test: signPayload ──────────────────────────────────────

test('signPayload returns a base64-encoded signature', () => {
  const sig = signPayload('hello world');
  assert.ok(typeof sig === 'string' && sig.length > 20, 'Signature should be a non-empty base64 string');
  // Ed25519 signature is 64 bytes → ~88 base64 chars
  const decoded = Buffer.from(sig, 'base64');
  assert.strictEqual(decoded.length, 64, 'Ed25519 signature should be 64 bytes');
});

test('signPayload produces different signatures for different payloads', () => {
  const sig1 = signPayload('payload-one');
  const sig2 = signPayload('payload-two');
  assert.notStrictEqual(sig1, sig2, 'Different payloads should produce different signatures');
});

// ─── Test: signSocketPayload ────────────────────────────────

test('signSocketPayload adds _sig field to payload', () => {
  const data = { bundles: [], roomCode: 'TEST' };
  const signed = signSocketPayload(data);
  assert.ok(typeof signed._sig === 'string' && signed._sig.length > 20, '_sig should be present');
  assert.deepStrictEqual(signed.bundles, data.bundles, 'Original fields should be preserved');
  assert.strictEqual(signed.roomCode, data.roomCode, 'roomCode should be preserved');
});

test('signSocketPayload signature verifies correctly with Node.js crypto', () => {
  const data = { bundles: [{ socketId: 'abc', bundle: {} }], roomCode: 'ROOM1' };
  const signed = signSocketPayload(data);

  // Reconstruct what the client would do: strip _sig, stringify, verify
  const { _sig, ...unsigned } = signed;
  const canonical = JSON.stringify(unsigned);
  const sigBuf = Buffer.from(_sig, 'base64');

  const publicKeyB64 = getPublicKeyBase64();
  const publicKey = nodeCrypto.createPublicKey({
    key: Buffer.from(publicKeyB64, 'base64'),
    format: 'der',
    type: 'spki',
  });

  const valid = nodeCrypto.verify(null, Buffer.from(canonical, 'utf8'), publicKey, sigBuf);
  assert.ok(valid, 'Signature should verify against the public key');
});

test('signSocketPayload signature does NOT verify if payload is tampered', () => {
  const data = { bundles: [], roomCode: 'ROOM2' };
  const signed = signSocketPayload(data);

  // Tamper with the payload
  const tampered = { ...signed, roomCode: 'EVIL' };
  const { _sig, ...unsigned } = tampered;
  const canonical = JSON.stringify(unsigned);
  const sigBuf = Buffer.from(_sig, 'base64');

  const publicKeyB64 = getPublicKeyBase64();
  const publicKey = nodeCrypto.createPublicKey({
    key: Buffer.from(publicKeyB64, 'base64'),
    format: 'der',
    type: 'spki',
  });

  const valid = nodeCrypto.verify(null, Buffer.from(canonical, 'utf8'), publicKey, sigBuf);
  assert.ok(!valid, 'Tampered payload should NOT verify');
});

// ─── Test: SERVER_SIGNING_KEY env var loading ───────────────

test('initSigningKey can round-trip via PKCS8 DER export/import', () => {
  // Export current private key
  // We re-call initSigningKey with SERVER_SIGNING_KEY set to simulate persistence
  const { generateKeyPairSync, createPrivateKey, createPublicKey } = nodeCrypto;
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privBase64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  const pubBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

  // Simulate SERVER_SIGNING_KEY being set
  process.env.SERVER_SIGNING_KEY = privBase64;
  initSigningKey();

  const loadedPub = getPublicKeyBase64();
  assert.strictEqual(loadedPub, pubBase64, 'Loaded public key should match exported public key');

  delete process.env.SERVER_SIGNING_KEY;
  // Restore ephemeral key
  initSigningKey();
});

// ─── Summary ─────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
