/**
 * PQXDH hybrid key exchange — X25519 + ML-KEM-768.
 *
 * Confirms the initiator and responder derive an identical 32-byte session
 * secret, that the post-quantum leg is actually exercised, and that malformed
 * peer keys are rejected.
 *
 * RUN: node --test client/test/pqxdh.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateKeyBundle,
  serializeKeyBundle,
  deserializeKeyBundle,
  pqxdhInitiator,
  pqxdhResponder,
} from '../src/crypto/pqxdh.js';

import { bytesEqual } from './helpers.js';

/** Round-trip a bundle's public half through serialize → wire → deserialize. */
function publicView(bundle) {
  return deserializeKeyBundle(serializeKeyBundle(bundle));
}

test('PQXDH: initiator and responder derive the same session secret', async () => {
  const aliceBundle = await generateKeyBundle();
  const bobBundle = await generateKeyBundle();

  const alice = await pqxdhInitiator(aliceBundle, publicView(bobBundle));
  const bob = await pqxdhResponder(bobBundle, publicView(aliceBundle), alice.pqCiphertext);

  assert.equal(alice.sharedSecret.length, 32);
  assert.ok(bytesEqual(alice.sharedSecret, bob.sharedSecret), 'both sides must agree');
});

test('PQXDH: the post-quantum (ML-KEM) leg is actually used', async () => {
  const aliceBundle = await generateKeyBundle();
  const bobBundle = await generateKeyBundle();

  assert.equal(aliceBundle.pqAvailable, true, 'ML-KEM should be available in this build');

  const alice = await pqxdhInitiator(aliceBundle, publicView(bobBundle));
  assert.ok(alice.pqCiphertext, 'initiator must emit an ML-KEM ciphertext when PQ is available');
});

test('PQXDH: two independent sessions derive different secrets', async () => {
  const a1 = await generateKeyBundle();
  const b1 = await generateKeyBundle();
  const a2 = await generateKeyBundle();
  const b2 = await generateKeyBundle();

  const s1 = await pqxdhInitiator(a1, publicView(b1));
  const s2 = await pqxdhInitiator(a2, publicView(b2));

  assert.ok(!bytesEqual(s1.sharedSecret, s2.sharedSecret), 'fresh keys → fresh session secret');
});

test('PQXDH: an all-zero peer key is rejected (small-subgroup guard)', async () => {
  const aliceBundle = await generateKeyBundle();
  const peer = publicView(await generateKeyBundle());
  peer.identityKeyRaw = new Uint8Array(32); // all zeros

  await assert.rejects(
    () => pqxdhInitiator(aliceBundle, peer),
    /invalid peer identity key/i,
  );
});
