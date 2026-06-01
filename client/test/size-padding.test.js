/**
 * Flagged size-bucket padding (utils/aesEncryption.js).
 *
 * Padding hides message size by bucketing the ciphertext. Rollout is staged:
 *   - Receivers ALWAYS unpad a payload marked { p: 1 } (forward-compatible).
 *   - Senders only pad when setSizePadding(true) (default off).
 *
 * Confirms: default-off behavior, padded round-trips, size-indistinguishability,
 * forward-compat (decrypt a padded message even with the local toggle off), and
 * backward-compat (unpadded messages still decrypt). v5 padding is covered in
 * e2ee-manager.test.js where a real session exists.
 *
 * RUN: node --test client/test/size-padding.test.js
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  initRoomEncryption,
  encryptMLSMessage,
  decryptMLSMessage,
  setSizePadding,
  isSizePaddingEnabled,
} from '../src/utils/aesEncryption.js';

afterEach(() => setSizePadding(false)); // never leak the toggle between tests

const ROOM = 'size-padding-room';

test('default: padding is off and adds no marker, round-trips', async () => {
  await initRoomEncryption(ROOM);
  assert.equal(isSizePaddingEnabled(), false);

  const payload = await encryptMLSMessage('no padding here', ROOM);
  assert.equal(payload.v, 4);
  assert.equal(payload.p, undefined, 'no padding marker when disabled');
  assert.equal(await decryptMLSMessage(payload, ROOM), 'no padding here');
});

test('enabled: ciphertext is bucketed, marked { p: 1 }, and round-trips', async () => {
  await initRoomEncryption(ROOM);
  setSizePadding(true);

  const payload = await encryptMLSMessage('secret', ROOM);
  assert.equal(payload.p, 1, 'padded payload is marked');
  assert.equal(await decryptMLSMessage(payload, ROOM), 'secret');
});

test('enabled: different-length messages pad to the same ciphertext size', async () => {
  await initRoomEncryption(ROOM);
  setSizePadding(true);

  const a = await encryptMLSMessage('x', ROOM);
  const b = await encryptMLSMessage('a considerably longer message body', ROOM);
  assert.equal(a.ct.length, b.ct.length, 'small messages must be size-indistinguishable');
});

test('forward-compat: a padded message decrypts even if the local toggle is off', async () => {
  await initRoomEncryption(ROOM);

  setSizePadding(true);
  const padded = await encryptMLSMessage('from a padding-enabled peer', ROOM);
  assert.equal(padded.p, 1);

  setSizePadding(false); // this receiver does not send padded, but must still read it
  assert.equal(await decryptMLSMessage(padded, ROOM), 'from a padding-enabled peer');
});

test('backward-compat: an unpadded (legacy) payload still decrypts', async () => {
  await initRoomEncryption(ROOM);
  setSizePadding(false);

  const legacy = await encryptMLSMessage('legacy unpadded', ROOM);
  assert.equal(legacy.p, undefined);
  assert.equal(await decryptMLSMessage(legacy, ROOM), 'legacy unpadded');
});
