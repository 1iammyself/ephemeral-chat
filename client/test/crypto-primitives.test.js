/**
 * Crypto primitives — X25519, ML-KEM-768, and HKDF-SHA-256.
 *
 * Confirms the building blocks the rest of the E2EE stack relies on:
 *   - X25519 DH agreement is symmetric and round-trips through base64
 *   - ML-KEM-768 encaps/decaps recover the same shared secret (FIPS 203)
 *   - HKDF matches the RFC 5869 published test vector (not just round-trips)
 *
 * RUN: node --test client/test/crypto-primitives.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateX25519Keypair,
  x25519DH,
  publicKeyToBase64,
  base64ToPublicKey,
} from '../src/crypto/x25519.js';

import {
  initMLKEM,
  mlkemKeyGen,
  mlkemEncaps,
  mlkemDecaps,
  mlkemPublicKeyToBase64,
  base64ToMLKEMPublicKey,
  mlkemCiphertextToBase64,
  base64ToMLKEMCiphertext,
} from '../src/crypto/ml-kem.js';

import {
  hkdf,
  hkdfExtract,
  deriveChainKeys,
  deriveRootKeys,
  constantTimeEqual,
} from '../src/crypto/hkdf.js';

import { toHex, fromHex, bytesEqual } from './helpers.js';

// ─── X25519 ────────────────────────────────────────────────

test('X25519: two parties derive the same shared secret', async () => {
  const alice = await generateX25519Keypair();
  const bob = await generateX25519Keypair();

  const aliceShared = await x25519DH(alice.privateKey, bob.publicKeyRaw, alice._native);
  const bobShared = await x25519DH(bob.privateKey, alice.publicKeyRaw, bob._native);

  assert.equal(aliceShared.length, 32, 'shared secret should be 32 bytes');
  assert.ok(bytesEqual(aliceShared, bobShared), 'both sides must agree on the secret');
});

test('X25519: distinct keypairs produce distinct secrets', async () => {
  const a = await generateX25519Keypair();
  const b = await generateX25519Keypair();
  const c = await generateX25519Keypair();

  const ab = await x25519DH(a.privateKey, b.publicKeyRaw, a._native);
  const ac = await x25519DH(a.privateKey, c.publicKeyRaw, a._native);
  assert.ok(!bytesEqual(ab, ac), 'different peers must yield different secrets');
});

test('X25519: public key survives base64url round-trip', async () => {
  const { publicKeyRaw } = await generateX25519Keypair();
  const restored = base64ToPublicKey(publicKeyToBase64(publicKeyRaw));
  assert.ok(bytesEqual(publicKeyRaw, restored));
});

// ─── ML-KEM-768 ────────────────────────────────────────────

test('ML-KEM-768: encaps/decaps recover the same shared secret', async () => {
  assert.equal(await initMLKEM(), true, 'ML-KEM must be available');

  const { publicKey, secretKey } = await mlkemKeyGen();
  const { ciphertext, sharedSecret } = await mlkemEncaps(publicKey);
  const recovered = await mlkemDecaps(ciphertext, secretKey);

  assert.equal(sharedSecret.length, 32, 'ML-KEM shared secret should be 32 bytes');
  assert.ok(bytesEqual(sharedSecret, recovered), 'decaps must recover the encaps secret');
});

test('ML-KEM-768: decapsulating with the wrong key yields a different secret', async () => {
  await initMLKEM();
  const a = await mlkemKeyGen();
  const b = await mlkemKeyGen();

  const { ciphertext, sharedSecret } = await mlkemEncaps(a.publicKey);
  // FIPS 203 implicit rejection: wrong key returns a (valid-length) different secret.
  const wrong = await mlkemDecaps(ciphertext, b.secretKey);
  assert.ok(!bytesEqual(sharedSecret, wrong), 'wrong secret key must not recover the secret');
});

test('ML-KEM-768: public key and ciphertext survive base64 round-trips', async () => {
  await initMLKEM();
  const { publicKey } = await mlkemKeyGen();
  const { ciphertext } = await mlkemEncaps(publicKey);

  assert.ok(bytesEqual(publicKey, base64ToMLKEMPublicKey(mlkemPublicKeyToBase64(publicKey))));
  assert.ok(bytesEqual(ciphertext, base64ToMLKEMCiphertext(mlkemCiphertextToBase64(ciphertext))));
});

// ─── HKDF-SHA-256 (RFC 5869 Test Case 1) ───────────────────

test('HKDF: matches RFC 5869 §A.1 test vector', async () => {
  const ikm = fromHex('0b'.repeat(22));
  const salt = fromHex('000102030405060708090a0b0c');
  const info = fromHex('f0f1f2f3f4f5f6f7f8f9');
  const expectedPrk = '077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5';
  const expectedOkm =
    '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865';

  const prk = await hkdfExtract(salt, ikm);
  assert.equal(toHex(prk), expectedPrk, 'HKDF-Extract PRK must match the RFC vector');

  const okm = await hkdf(ikm, salt, info, 42);
  assert.equal(toHex(okm), expectedOkm, 'HKDF output must match the RFC vector');
});

test('HKDF: deriveChainKeys is deterministic and separates the two outputs', async () => {
  const chainKey = fromHex('aa'.repeat(32));

  const first = await deriveChainKeys(chainKey);
  const second = await deriveChainKeys(chainKey);

  assert.equal(first.chainKey.length, 32);
  assert.equal(first.messageKey.length, 32);
  assert.ok(bytesEqual(first.chainKey, second.chainKey), 'must be deterministic');
  assert.ok(bytesEqual(first.messageKey, second.messageKey), 'must be deterministic');
  assert.ok(!bytesEqual(first.chainKey, first.messageKey), 'chain key != message key');
  assert.ok(!bytesEqual(first.chainKey, chainKey), 'chain key must advance');
});

test('HKDF: deriveRootKeys returns two 32-byte keys, deterministically', async () => {
  const rootKey = fromHex('11'.repeat(32));
  const dhOutput = fromHex('22'.repeat(32));

  const a = await deriveRootKeys(rootKey, dhOutput);
  const b = await deriveRootKeys(rootKey, dhOutput);

  assert.equal(a.rootKey.length, 32);
  assert.equal(a.chainKey.length, 32);
  assert.ok(bytesEqual(a.rootKey, b.rootKey));
  assert.ok(bytesEqual(a.chainKey, b.chainKey));
  assert.ok(!bytesEqual(a.rootKey, a.chainKey));
});

test('HKDF: constantTimeEqual behaves like equality', () => {
  assert.equal(constantTimeEqual(fromHex('010203'), fromHex('010203')), true);
  assert.equal(constantTimeEqual(fromHex('010203'), fromHex('010204')), false);
  assert.equal(constantTimeEqual(fromHex('0102'), fromHex('010203')), false);
});
