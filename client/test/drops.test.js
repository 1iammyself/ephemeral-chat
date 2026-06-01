/**
 * Ephemeral Drops encryption (utils/drops.js).
 *
 * Random AES-256-GCM master key encrypts the content; the master key is wrapped
 * per recipient with a key derived from SHA-256(username + salt). Confirms the
 * full encrypt→wrap→unwrap→decrypt flow, per-recipient access, username
 * normalization, and that wrong recipients / tampered ciphertext are rejected.
 *
 * RUN: node --test client/test/drops.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  sha256,
  hashUsername,
  generateMasterKey,
  deriveWrappingKey,
  encryptContent,
  decryptContent,
  wrapMasterKey,
  unwrapMasterKey,
  encryptDrop,
  decryptDrop,
  decryptHint,
} from '../src/utils/drops.js';

import { tamperBase64 } from './helpers.js';

const decode = (buf) => new TextDecoder().decode(buf);

test('Drops: content encrypt → decrypt round-trips', async () => {
  const key = await generateMasterKey();
  const { ciphertext, iv } = await encryptContent('top secret drop', key);
  assert.equal(decode(await decryptContent(ciphertext, iv, key)), 'top secret drop');
});

test('Drops: master key wrap → unwrap recovers a working key', async () => {
  const master = await generateMasterKey();
  const { ciphertext, iv } = await encryptContent('wrapped-key payload', master);

  const wrappingKey = await deriveWrappingKey('alice', 'salt123');
  const wrapped = await wrapMasterKey(master, wrappingKey);
  const recovered = await unwrapMasterKey(wrapped, wrappingKey);

  assert.equal(decode(await decryptContent(ciphertext, iv, recovered)), 'wrapped-key payload');
});

test('Drops: a multi-recipient drop decrypts for each named recipient', async () => {
  const drop = await encryptDrop('shared content', ['Alice', 'Bob'], 'the hint');

  for (const user of ['Alice', 'Bob']) {
    const hash = await hashUsername(user, drop.salt);
    const wrappedKey = drop.wrappedKeys[hash];
    assert.ok(wrappedKey, `${user} should have a wrapped key`);
    const plain = await decryptDrop(drop.encryptedPayload, drop.iv, drop.salt, wrappedKey, user);
    assert.equal(decode(plain), 'shared content');
  }
});

test('Drops: the encrypted hint decrypts with the unwrapped master key', async () => {
  const drop = await encryptDrop('body', ['Alice'], 'a secret hint');
  const hash = await hashUsername('Alice', drop.salt);
  const wrappingKey = await deriveWrappingKey('Alice', drop.salt);
  const master = await unwrapMasterKey(drop.wrappedKeys[hash], wrappingKey);

  assert.equal(await decryptHint(drop.encryptedHint, master), 'a secret hint');
});

test('Drops: usernames are normalized (case- and whitespace-insensitive)', async () => {
  const drop = await encryptDrop('normalize me', ['Alice'], null);
  const hash = await hashUsername('Alice', drop.salt);

  // Same person, messy input — must still unwrap and decrypt.
  const plain = await decryptDrop(drop.encryptedPayload, drop.iv, drop.salt, drop.wrappedKeys[hash], '  ALICE  ');
  assert.equal(decode(plain), 'normalize me');

  // hashUsername is itself normalized.
  assert.equal(await hashUsername('Alice', drop.salt), await hashUsername(' alice ', drop.salt));
});

test('Drops: a non-recipient cannot decrypt', async () => {
  const drop = await encryptDrop('members only', ['Alice'], null);
  const hash = await hashUsername('Alice', drop.salt);
  // Mallory presents Alice's wrapped key but her own username → wrong wrapping key.
  await assert.rejects(
    () => decryptDrop(drop.encryptedPayload, drop.iv, drop.salt, drop.wrappedKeys[hash], 'Mallory'),
  );
});

test('Drops: tampered ciphertext is rejected', async () => {
  const drop = await encryptDrop('authentic', ['Alice'], null);
  const hash = await hashUsername('Alice', drop.salt);
  const tampered = tamperBase64(drop.encryptedPayload);
  await assert.rejects(
    () => decryptDrop(tampered, drop.iv, drop.salt, drop.wrappedKeys[hash], 'Alice'),
  );
});

test('Drops: sha256 produces a stable 64-char hex digest', async () => {
  const h = await sha256('abc');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'); // NIST SHA-256("abc")
});
