/**
 * Megolm-style Sender Keys (group chats) — forward secrecy, epoch barriers.
 *
 * Confirms a distributed sender key decrypts the sender's messages, that the
 * chain only moves forward (no backward secrecy), that skipping ahead works,
 * that epoch rotation + barriers reject stale messages, and that wrong keys /
 * tampered ciphertext are rejected.
 *
 * RUN: node --test client/test/sender-key.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateSenderKey,
  encryptWithSenderKey,
  decryptWithSenderKey,
  serializeSenderKey,
  deserializeSenderKey,
  rotateSenderKey,
  setEpochBarrier,
} from '../src/crypto/sender-key.js';

import { tamperBase64 } from './helpers.js';

/** A receiver is a peer who got the sender key distribution at counter 0. */
const distribute = (sender) => deserializeSenderKey(serializeSenderKey(sender));

test('Sender Key: a receiver decrypts the sender\'s messages in order', async () => {
  const sender = await generateSenderKey();
  const receiver = distribute(sender);

  const p1 = await encryptWithSenderKey(sender, 'group msg one');
  assert.equal(await decryptWithSenderKey(receiver, p1), 'group msg one');

  const p2 = await encryptWithSenderKey(sender, 'group msg two');
  assert.equal(await decryptWithSenderKey(receiver, p2), 'group msg two');
});

test('Sender Key: receiver can skip ahead, but not back (forward secrecy)', async () => {
  const sender = await generateSenderKey();
  const receiver = distribute(sender);

  const c0 = await encryptWithSenderKey(sender, 'zero');
  const c1 = await encryptWithSenderKey(sender, 'one');
  const c2 = await encryptWithSenderKey(sender, 'two');

  // Jump straight to counter 2 (skips 0 and 1).
  assert.equal(await decryptWithSenderKey(receiver, c2), 'two');

  // The chain has advanced past 0 and 1 — they can no longer be decrypted.
  await assert.rejects(() => decryptWithSenderKey(receiver, c0), /backward secrecy|already advanced/i);
  await assert.rejects(() => decryptWithSenderKey(receiver, c1), /backward secrecy|already advanced/i);
});

test('Sender Key: rotation bumps the epoch and resets the counter', async () => {
  const sender = await generateSenderKey();
  const before = sender.epoch;

  await rotateSenderKey(sender);
  assert.equal(sender.epoch, before + 1);
  assert.equal(sender.counter, 0);

  const receiver = distribute(sender); // re-distributed after rotation
  const c = await encryptWithSenderKey(sender, 'post-rotation message');
  assert.equal(c.epoch, before + 1);
  assert.equal(await decryptWithSenderKey(receiver, c), 'post-rotation message');
});

test('Sender Key: messages below the epoch barrier are rejected', async () => {
  const sender = await generateSenderKey(); // epoch 0
  const receiver = distribute(sender);
  setEpochBarrier(receiver, 1); // a member left → require epoch >= 1

  const stale = await encryptWithSenderKey(sender, 'pre-rekey replay'); // epoch 0
  await assert.rejects(() => decryptWithSenderKey(receiver, stale), /epoch|barrier|replay/i);
});

test('Sender Key: a different sender key cannot decrypt', async () => {
  const sender = await generateSenderKey();
  const impostorReceiver = distribute(await generateSenderKey());

  const c = await encryptWithSenderKey(sender, 'only the right key works');
  await assert.rejects(() => decryptWithSenderKey(impostorReceiver, c));
});

test('Sender Key: tampered ciphertext is rejected', async () => {
  const sender = await generateSenderKey();
  const receiver = distribute(sender);

  const c = await encryptWithSenderKey(sender, 'authentic');
  c.ct = tamperBase64(c.ct);
  await assert.rejects(() => decryptWithSenderKey(receiver, c));
});
