/**
 * Double Ratchet (1:1 sessions) — forward secrecy & out-of-order handling.
 *
 * Confirms a bidirectional conversation decrypts correctly, consecutive and
 * out-of-order messages work (via skipped-key storage), every message uses a
 * fresh key, and tampered ciphertext is rejected by AES-GCM.
 *
 * RUN: node --test client/test/double-ratchet.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  initRatchetInitiator,
  initRatchetResponder,
  ratchetEncrypt,
  ratchetDecrypt,
} from '../src/crypto/double-ratchet.js';
import { generateX25519Keypair } from '../src/crypto/x25519.js';

import { tamperBase64 } from './helpers.js';

/** Build a connected Alice (initiator) / Bob (responder) ratchet pair. */
async function connectedPair() {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const bobPreKey = await generateX25519Keypair();
  const alice = await initRatchetInitiator(new Uint8Array(secret), bobPreKey.publicKeyRaw);
  const bob = await initRatchetResponder(new Uint8Array(secret), bobPreKey);
  return { alice, bob };
}

const send = (state, text) => ratchetEncrypt(state, text);
const recv = (state, m) => ratchetDecrypt(state, m.header, m.ciphertext, m.iv);

test('Double Ratchet: bidirectional conversation decrypts correctly', async () => {
  const { alice, bob } = await connectedPair();

  const m1 = await send(alice, 'hello bob');
  assert.equal(await recv(bob, m1), 'hello bob');

  const m2 = await send(bob, 'hi alice 👋');
  assert.equal(await recv(alice, m2), 'hi alice 👋');

  const m3 = await send(alice, 'how are you?');
  assert.equal(await recv(bob, m3), 'how are you?');

  const m4 = await send(bob, 'great, thanks');
  assert.equal(await recv(alice, m4), 'great, thanks');
});

test('Double Ratchet: consecutive messages in one chain decrypt in order', async () => {
  const { alice, bob } = await connectedPair();

  // Encrypt sequentially — ratchetEncrypt mutates shared state, so it must
  // not be run concurrently for a single sender.
  const msgs = [];
  for (const t of ['one', 'two', 'three']) msgs.push(await send(alice, t));
  assert.equal(await recv(bob, msgs[0]), 'one');
  assert.equal(await recv(bob, msgs[1]), 'two');
  assert.equal(await recv(bob, msgs[2]), 'three');
});

test('Double Ratchet: out-of-order delivery is handled via skipped keys', async () => {
  const { alice, bob } = await connectedPair();

  const first = await send(alice, 'first');
  const second = await send(alice, 'second');

  // Deliver the second message before the first.
  assert.equal(await recv(bob, second), 'second');
  assert.equal(await recv(bob, first), 'first');
});

test('Double Ratchet: each message uses a fresh key and advances the counter', async () => {
  const { alice } = await connectedPair();

  const a = await send(alice, 'same text');
  const b = await send(alice, 'same text');

  assert.notEqual(a.ciphertext, b.ciphertext, 'identical plaintext must not produce identical ciphertext');
  assert.equal(a.header.n, 0);
  assert.equal(b.header.n, 1);
});

test('Double Ratchet: responder survives the caller zeroing the shared secret', async () => {
  // e2ee-manager._respondToPeer zeroes the PQXDH shared secret right after init
  // for secure erasure. The responder must hold a COPY as its root key, or that
  // fill(0) wipes its live root key and all decryption fails. This pins that.
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const bobPreKey = await generateX25519Keypair();

  const alice = await initRatchetInitiator(new Uint8Array(secret), bobPreKey.publicKeyRaw);
  const bobSecret = new Uint8Array(secret);
  const bob = await initRatchetResponder(bobSecret, bobPreKey);
  bobSecret.fill(0); // simulate the caller's secure-erase

  const m = await send(alice, 'message after the secret was zeroed');
  assert.equal(await recv(bob, m), 'message after the secret was zeroed');
});

test('Double Ratchet: tampered ciphertext is rejected', async () => {
  const { alice, bob } = await connectedPair();

  const m = await send(alice, 'authentic message');
  const tampered = { ...m, ciphertext: tamperBase64(m.ciphertext) };

  await assert.rejects(() => recv(bob, tampered), 'GCM auth must reject a tampered payload');
});
