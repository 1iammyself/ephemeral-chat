/**
 * Room AES-256-GCM (bulk / fallback path) — utils/aesEncryption.js.
 *
 * Confirms encrypt/decrypt round-trips, that the room key is derived
 * deterministically from the room code (so any member re-derives it), that the
 * wrong room code or a tampered/invalid payload fails, and that IVs are random.
 *
 * RUN: node --test client/test/aes-room.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  initRoomEncryption,
  encryptMessage,
  decryptMessage,
  destroyRoomEncryption,
} from '../src/utils/aesEncryption.js';

import { tamperBase64 } from './helpers.js';

test('Room AES: encrypt → decrypt round-trips', async () => {
  await initRoomEncryption('ROOM-ALPHA-01');
  const payload = await encryptMessage('hello room', 'ROOM-ALPHA-01');

  assert.equal(payload.v, 4);
  assert.equal(payload.isEncrypted, true);
  assert.ok(payload.ct && payload.iv);
  assert.equal(await decryptMessage(payload, 'ROOM-ALPHA-01'), 'hello room');
});

test('Room AES: key is derived deterministically from the room code', async () => {
  // Encrypt, then drop the cached key to simulate a different client/session.
  const payload = await encryptMessage('cross-client message', 'ROOM-BETA-02');
  destroyRoomEncryption('ROOM-BETA-02');

  // Re-deriving from the same room code must reproduce the same key.
  assert.equal(await decryptMessage(payload, 'ROOM-BETA-02'), 'cross-client message');
});

test('Room AES: the wrong room code cannot decrypt', async () => {
  const payload = await encryptMessage('secret for A', 'ROOM-A');
  await assert.rejects(() => decryptMessage(payload, 'ROOM-B'));
});

test('Room AES: tampered ciphertext is rejected', async () => {
  const payload = await encryptMessage('authentic', 'ROOM-TAMPER');
  payload.ct = tamperBase64(payload.ct);
  await assert.rejects(() => decryptMessage(payload, 'ROOM-TAMPER'));
});

test('Room AES: a malformed payload is rejected with a clear error', async () => {
  await assert.rejects(
    () => decryptMessage({ v: 3, ct: 'x', iv: 'y' }, 'ROOM-A'),
    /Invalid AES-GCM payload/,
  );
});

test('Room AES: identical plaintext yields different ciphertext (random IV)', async () => {
  const a = await encryptMessage('same text', 'ROOM-IV');
  const b = await encryptMessage('same text', 'ROOM-IV');
  assert.notEqual(a.ct, b.ct);
  assert.notEqual(a.iv, b.iv);
});
