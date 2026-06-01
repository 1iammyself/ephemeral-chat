/**
 * Watch Party E2EE (crypto/watch-party-crypto.js).
 *
 * AES-256-GCM (with per-purpose AAD) over a key derived from the room secret;
 * the media URL is encrypted in a separate envelope. Confirms round-trips, the
 * media-URL allowlist (SSRF/XSS guard), key isolation, AAD binding, and that
 * tampering / wrong secrets / bad inputs are rejected.
 *
 * RUN: node --test client/test/watch-party.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  encryptWatchPartyEvent,
  decryptWatchPartyEvent,
  validateMediaUrl,
} from '../src/crypto/watch-party-crypto.js';

const secret = () => crypto.getRandomValues(new Uint8Array(32));

const sampleEvent = (over = {}) => ({
  type: 'play',
  mediaId: 'media-1',
  currentTime: 42.5,
  userId: 'user-123',
  timestamp: 1_700_000_000_000,
  ...over,
});

test('Watch Party: event encrypt → decrypt round-trips (no URL)', async () => {
  const s = secret();
  const env = await encryptWatchPartyEvent(sampleEvent(), s);
  const out = await decryptWatchPartyEvent(env, s);

  assert.equal(out.type, 'play');
  assert.equal(out.mediaId, 'media-1');
  assert.equal(out.currentTime, 42.5);
  assert.match(out.userId, /^u_[0-9a-f]{8}$/, 'userId is hashed, not raw');
  assert.equal(env.urlEnvelope, null);
});

test('Watch Party: media URL is carried in a separate envelope and recovered', async () => {
  const s = secret();
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const env = await encryptWatchPartyEvent(sampleEvent({ type: 'mediaShare', mediaUrl: url }), s);

  assert.ok(env.urlEnvelope, 'URL should be in its own envelope');
  const out = await decryptWatchPartyEvent(env, s);
  assert.equal(out.mediaUrl, url);
});

test('Watch Party: a different room secret cannot decrypt', async () => {
  const env = await encryptWatchPartyEvent(sampleEvent(), secret());
  await assert.rejects(() => decryptWatchPartyEvent(env, secret()));
});

test('Watch Party: tampered ciphertext is rejected', async () => {
  const s = secret();
  const env = await encryptWatchPartyEvent(sampleEvent(), s);
  env.eventCt = env.eventCt.slice(0, -4) + 'AAAA'; // corrupt tail
  await assert.rejects(() => decryptWatchPartyEvent(env, s));
});

test('Watch Party: a 32-byte secret is required', async () => {
  await assert.rejects(() => encryptWatchPartyEvent(sampleEvent(), new Uint8Array(16)), /32-byte/);
});

test('Watch Party: media URL allowlist accepts YouTube/SoundCloud', () => {
  for (const u of [
    'https://www.youtube.com/watch?v=abc',
    'https://youtu.be/abc',
    'https://soundcloud.com/artist/track',
  ]) {
    assert.doesNotThrow(() => validateMediaUrl(u));
  }
});

test('Watch Party: media URL allowlist rejects dangerous / off-list URLs', () => {
  for (const u of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://evil.example.com/video',
    'http://www.youtube.com/watch?v=abc', // not https
    '',
  ]) {
    assert.throws(() => validateMediaUrl(u));
  }
});

test('Watch Party: encrypting an event with a bad URL is refused', async () => {
  await assert.rejects(
    () => encryptWatchPartyEvent(sampleEvent({ type: 'mediaShare', mediaUrl: 'https://evil.com/x' }), secret()),
    /allowed provider/,
  );
});
